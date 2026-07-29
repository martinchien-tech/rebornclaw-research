# 微软 Agent Governance Toolkit 深度竞品分析

**作者：** Martin Chien · RebornClaw Technology Co., Ltd. CEO
**数据分析：** 冉特助

> **免责声明：** 本文基于公开资料整理分析，仅供技术交流参考。


> 分析日期：2026-07-29
> 分析对象：microsoft/agent-governance-toolkit (Public Preview, v4.1.0)
> 对比对象：RebornClaw CS Swarm Server + 归因链审计 Agent

---

## 一、AGT 全景架构

```
Agent ──► Policy Engine ──► Identity ──► Audit Log
 (YAML/OPA/Cedar) (SPIFFE/DID/mTLS) (Tamper-evident)
 │                 │
 ├── Allowed ──► Tool executes
 └── Denied ──► GovernanceDenied
 │
 ▼
Decision Record
```

**5 大核心模块：**

| 模块 | 功能 | 我们有没有 |
|------|------|-----------|
| Agent OS | 策略引擎 + Agent 生命周期 | 部分（群聊安全规则） |
| Agent Mesh | 发现、路由、信任网格 | 部分（CS Swarm 注册/心跳） |
| Agent Runtime | 4 层特权环沙箱 | 无 |
| Agent SRE | 熔断开关、SLO 监控、混沌测试 | 无 |
| Agent Compliance | OWASP 验证、策略 lint | 无 |

**6 项跨模块能力：**
- MCP Security Gateway — 工具投毒检测、typosquatting、隐藏指令扫描
- Shadow AI Discovery — 发现未注册的 Agent
- Governance Dashboard — 实时舰队状态
- PromptDefense Evaluator — 12 向量 prompt injection 检测
- Contributor Reputation — PR/Issue 作者筛查
- Agent Hypervisor — 执行审计、delta 引擎、命令黑名单

**支持语言：** Python / TypeScript / .NET / Rust / Go / Copilot CLI / Claude Code / OpenCode

---

## 二、核心设计哲学对比

### 2.1 策略执行层

**AGT：** 代码层硬拦截，YAML 策略文件，`govern()` 装饰器

```python
safe_tool = govern(my_tool, policy="policy.yaml")
safe_tool(action="drop", table="users")  # → GovernanceDenied
```

**我们：** Prompt 层软约束 + 群聊安全规则

```python
# app.py — 群聊后端
if msg["from"] != "老板":
    if msg["is_action"] == "create_group":
        return {"error": "只有老板能拉群"}
```

**差距：** AGT 是**结构化策略引擎**，我们是**硬编码 if-else 规则**。但我们的场景更窄（群聊安全），if-else 够用。如果扩展到工具调用治理，需要 AGT 的 YAML 策略模式。

### 2.2 身份层

**AGT：** SPIFFE / DID / mTLS，每个 Agent 有独立身份

**我们：** 9 个 Agent 有独立 identity（IDENTITY.md），但 API Key 是共享的（通过 agent 目录 `.env` 隔离）

**差距：** 我们有身份概念，但身份与 API Key 的绑定是文件级的，不是协议级的。AGT 的 SPIFFE 信任网格是生产级方案。

### 2.3 审计层

**AGT：** 防篡改决策记录，每个允许/拒绝都记录

**我们：** 归因链审计 Agent（`audit.js`），HMAC 签名 + 6 种异常检测

**优势：** 我们的归因链审计在**决策溯源**上比 AGT 更细——我们追踪了 `input_trace`（来源、权重、决策路径），AGT 只记录最终决策结果。我们的 `detectAnomalies` 能检测循环依赖、缺失依赖、权重异常，AGT 没有。

### 2.4 沙箱层

**AGT：** 4 层特权环（Ring 0-3），类似操作系统

**我们：** 无沙箱层。Agent 运行在 Gateway 进程内，没有隔离。

**差距：** 这是最大的安全缺口。如果某个 Agent 被越狱，理论上可以访问所有文件。

---

## 三、OWASP Agentic Top 10 覆盖对比

| OWASP 风险 | AGT 覆盖 | 我们覆盖 | 差距 |
|-----------|----------|---------|------|
| LLM01 Prompt Injection | ✅ PromptDefense Evaluator | ❌ 无 | 大 |
| LLM02 Insecure Output Handling | ✅ 策略引擎 | ❌ 无 | 大 |
| LLM03 Training Data Poisoning | ❌ | ❌ | 一致 |
| LLM04 Model Denial of Service | ✅ Agent SRE | ❌ | 大 |
| LLM05 Supply Chain Vulnerabilities | ✅ MCP Security Gateway | ❌ | 大 |
| LLM06 Sensitive Information Disclosure | ✅ 策略引擎 | ❌ | 大 |
| LLM07 Insecure Plugin Design | ✅ Agent Marketplace | ❌ | 大 |
| LLM08 Excessive Agency | ✅ 策略引擎 | ✅ 群聊安全规则 | 小 |
| LLM09 Overreliance | ✅ Agent SRE | ❌ | 大 |
| LLM10 Model Theft | ❌ | ❌ | 一致 |

**AGT 号称覆盖 10/10，实际覆盖 8/10。** 我们覆盖 1/10。

---

## 四、可以直接借鉴的点

### 1. YAML 策略文件（适合我们的群聊场景）

```yaml
# chat-policy.yaml
apiVersion: governance.toolkit/v1
name: chat-policy
default_action: deny  # 默认拒绝，白名单放行
rules:
  - name: boss-can-create-group
    condition: "user.role == 'boss' && action.type == 'create_group'"
    action: allow
  - name: no-direct-file-transfer
    condition: "action.type == 'file_transfer' && action.sender != 'boss'"
    action: deny
    description: "文件必须经过老板转交"
  - name: auto-dissolve-if-boss-leaves
    condition: "action.type == 'check_group' && 'boss' not in group.members"
    action: auto_dissolve
```

**价值：** 把硬编码的 if-else 规则变成可配置的策略文件，CTO/COO 可以直接改 YAML，不需要改代码。

### 2. MCP Security Gateway 的 tool poisoning 检测

**场景：** 我们的 Agent 调用工具时，如果工具返回恶意数据（比如被篡改的数据库查询结果），Agent 可能按照恶意数据执行下一步操作。

**借鉴：** 在 CS Swarm 的 `model-router.js` 里加一个工具调用审查层，检查工具输出的数据格式是否异常。

### 3. Agent SRE 的熔断机制

**场景：** 某个 Agent 进入死循环（比如群聊中 @A → A 回复 → B 引用 A 回复 → A 再回复 B → ...）

**借鉴：** 我们已经有 `30 秒去重 + 每分钟最多 5 次` 的防死循环机制，但不够系统化。AGT 的 Kill Switch + SLO 监控是生产级方案。

### 4. Shadow AI Discovery

**场景：** 有人偷偷在服务器上起了一个未注册的 Agent 进程

**借鉴：** CS Swarm 已经有 Agent 注册/心跳机制，可以反向检测——如果某个进程在调用 Gateway 但不在注册表中，告警。

---

## 五、我们的优势（AGT 没有的）

### 1. 归因链信任体系（我们的核心壁垒）

AGT 的审计是扁平的（允许/拒绝 + 记录）。我们的 `audit.js` 有：

- **决策溯源**：每个 Agent 决策的输入来源链（`input_trace`）
- **影响权重**：每个输入对决策的影响程度
- **签名验证**：HMAC 验证决策链完整性
- **6 种异常检测**：依赖缺失、权重异常、规则未触发、循环依赖、非法 source_type、非法 decision_path
- **Pattern 分析**：跨 session 的归因模式分析，自动给出改进建议

**AGT 的审计是"发生了什么"，我们的审计是"为什么发生"。** 这是本质差异。

### 2. 群聊安全规则（场景化落地）

AGT 是通用框架，没有处理群聊场景的专用规则。我们在群聊安全上有：

- 只有老板能拉群/踢人
- 智能体之间不能私聊/私下拉群
- 老板不在的群自动解散
- 文件必须经过老板转交
- 敏感文件类型（`.env` `.key` 等）在群里不可读

这些是**产品级需求**，不是框架级需求。AGT 的 YAML 策略虽然灵活，但需要自己写规则，我们的规则是内置的、开箱即用的。

### 3. ADHD Focus Mode

AGT 不处理 LLM 输出质量。我们的 `adhd-filter.js` 拦截废话、清理开场白，这是**用户体验层**的治理，AGT 不管。

---

## 六、差异化视觉

```
                    AGT（微软）                     RebornClaw（我们）
                    ──────────                    ──────────────────
   策略引擎          YAML/OPA/Cedar                硬编码规则（if-else）
   身份              SPIFFE/DID/mTLS               9 个 Agent identity
   审计              防篡改决策记录                 归因链 + 6 种异常检测 ★
   沙箱              4 层特权环                    无
   SRE               Kill Switch / SLO             ADHD 防死循环
   工具安全           MCP Security Gateway          无
   未注册检测         Shadow AI Discovery            注册/心跳反向检测
   语言覆盖           Python/TS/.NET/Rust/Go        仅 Python/Node.js
   场景化             通用框架                      群聊安全规则 ★
   输出质量治理       无                            ADHD Focus Mode ★
   多 Agent 编排      无                            群聊路由 + @ 定向回复 ★
```

---

## 七、结论与建议

### 控制面（必须做）

1. **YAML 策略文件** — 把群聊安全规则从 if-else 改写成策略文件，**优先级中等**
   - 收益：CTO/COO 可以直接改策略，不需要改代码
   - 成本：重写规则引擎，约 2 天

2. **Agent 沙箱** — 至少做进程级隔离，**优先级高**
   - 收益：某个 Agent 被越狱不会影响其他 Agent
   - 成本：Docker 容器化，约 3 天

### 审计面（我们已经领先）

3. **归因链审计** — 保持当前方向，**优先级高**
   - 建议：加一个 `trace` 可视化界面，让老板能直观看到"谁根据什么做了这个决定"
   - 参考：`GET /api/audit/traces?agentId=xxx` 已有，但缺前端

4. **Pattern 分析** — 完善跨 session 分析，**优先级低**
   - 当前已跑通 `analyzePatterns`，但依赖 PostgreSQL 的 `audit_log` 表

### 增长面（差异化方向）

5. **ADHD Focus Mode** — 这是我们的产品差异化，**优先级高**
   - AGT 完全不管这个，但我们有 `adhd-filter.js`

6. **群聊安全规则** — 场景化落地是我们的护城河，**优先级高**
   - AGT 的通用框架做不到"智能体之间不能私聊"这种产品级约束

### 短期执行（今明两天）

1. 验证 `adhd-filter.js` 在 cs-swarm-server 的真实场景中跑通
2. 把群聊安全规则 v3.0 文档化，作为 RebornClaw 的**产品特性**（不是技术实现）
3. 整理归因链审计的 API 文档，方便前端对接

---

*分析人：冉特助*
*母本：D:\rebornclaw\cs-swarm-server\utils\adhd-filter.js* (母本未修改)
*源码：https://github.com/microsoft/agent-governance-toolkit*

# microsoft/agent-governance-toolkit 深度竞品分析

**作者：** Martin Chien · RebornClaw Technology Co., Ltd. CEO

> **免责声明：** 本文基于公开资料整理分析，仅供技术交流参考。

---

## 核心发现

> **Prompt-level safety is not a control surface. It is a polite request to a stochastic system.**

AGT 不在提示词层面做安全控制，而是在确定性代码层拦截每次工具调用、消息发送和委托，在模型意图到达网络之前做策略裁决。

---

## 对比：AGT vs RebornClaw

| 维度 | AGT | RebornClaw 现状 | 差距 |
|------|-----|----------------|------|
| 策略引擎 | YAML 策略 + OPA/Cedar | 无策略引擎 | 🔴 需要补充 |
| 身份验证 | DID/SPIFFE 跨进程验证 | WS session 验证 | 🟡 可选升级 |
| 审计日志 | SHA-256 哈希链 | JSON 签名审计 | 🟢 思路一致 |
| 执行沙箱 | 四层权限环 | 无沙箱 | 🔴 需要补充 |
| 熔断器 | 连续失败 N 次后断路 | 无 | 🔴 需要补充 |
| 行为监控 | 每 Agent 指标+隔离 | 审计 Agent 可检测异常 | 🟡 思路一致 |
| OWASP 合规 | 7/10 Full | 未评估 | 🔴 需要补课 |

## 值得借鉴的

**优先级 1（本周落地）：**
1. **熔断器** — 几行代码，安全基本面
2. **Tool Wrapper** — 每个工具调用做策略检查
3. **策略引擎** — 参考 YAML 设计，不用重写

**差异化机会：**
- AGT 的 ASI06（记忆投毒）承认是 Partial
- 我们的 MemChain 三层架构正是解决这个问题的方案
- 这是我们的机会

## 行动建议

1. 短平快（本周）：熔断器 + Tool Wrapper
2. 中期（2-4 周）：YAML 策略引擎
3. 差异化：MemChain 记忆层卡位 AGT 缺口
4. 不做的：多语言 SDK、RL 治理、物理 AI 安全

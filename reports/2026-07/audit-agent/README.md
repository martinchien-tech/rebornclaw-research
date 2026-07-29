# 审计 Agent 原型

**发布日期：** 2026-07-28  
**研究方向：** Multi-Agent 信任

## 核心发现

归因链信任体系的工程原型实现。基于 CS Swarm Server 的审计模块，实现了 6 种异常检测（依赖缺失、权重异常、规则未触发、循环依赖、非法 source_type、非法 decision_path），全部测试通过。已注册到 CS Swarm Server 的 API 路由中，可作为审计 Agent 直接调用。

## 关键数据

- 6 种异常检测全部通过
- 基于 CS Swarm Server 审计模块
- 决策溯源 JSON 签名验证

## 阅读完整报告

→ [完整代码（JS）](./full-report.js)
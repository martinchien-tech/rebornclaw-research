# 微软 Agent Governance Toolkit 深度竞品分析

**发布日期：** 2026-07-29  
**研究方向：** Agent 安全治理

## 核心发现

微软在 GitHub 开源了 Agent Governance Toolkit (AGT)（5,181⭐），一个旨在为 AI Agent 提供"操作系统级"治理框架的安全工具包。核心发现：AGT 验证了 RebornClaw 的审计 Agent + 归因链信任体系方向正确。我们的差异化在于 MemChain 记忆层安全 + 归因链内容审计 + 群聊治理模式，这些都是 AGT 覆盖不到的领域。

## 关键数据

- AGT 5,181⭐，日增 46
- OWASP Agentic Top 10 覆盖 7/10 Full
- 两个已知漏洞：进程边界碰撞、数据泄露盲区
- 三个差异化机会：归因链审计、MemChain 记忆安全、群聊治理

## 阅读完整报告

→ [完整报告（HTML）](./full-report.html)
→ [完整报告（MD）](./full-report.md)
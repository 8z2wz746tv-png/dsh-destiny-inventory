# 文档索引

**根目录只留必读的**：`AGENTS.md`（规矩与守门）、`README.md`（怎么装）、
`UPSTREAM.md` + `LICENSE-DIM.md`（借用来源与许可）。
其余全都在这。**一份文档只讲一件事**——新写的先在这里登记，避免两份讲同一件事然后互相漂。

## 从这里开始

| 文档 | 讲什么 | 什么时候看 |
|---|---|---|
| [`HANDOFF.md`](HANDOFF.md) | **换会话先读这份**：现状、这轮的决定、真机坑、待办 | 接手时 |
| [`CODING-STANDARDS.md`](CODING-STANDARDS.md) | 跨项目可移植的编码规范骨架 | 写代码前 |
| `AGENTS.md`（根目录） | 本项目的落点规矩，**与上面那份冲突时以它为准** | 动手前 |

## 计划（`plans/`）

要做什么、为什么这么定。做完的移进 `../archive/docs/` 并在这里改状态。

| 文档 | 讲什么 | 状态 |
|---|---|---|
| [`plans/PLAN-SELF-HOSTED-DIM.md`](plans/PLAN-SELF-HOSTED-DIM.md) | 架构契约：自建数据/写入面，MCP 只做随航 agent | 生效中，§1 的边界不许越 |
| [`plans/PLAN-AGENT-CONTEXT.md`](plans/PLAN-AGENT-CONTEXT.md) | P3：界面操作怎么进 agent 上下文 | 已实现（v0.44） |
| [`plans/PLAN-WRITE-QUEUE.md`](plans/PLAN-WRITE-QUEUE.md) | 写队列：两层串行、`from` 必填、真机验证记录 | 已实现（v0.48.0） |
| [`plans/PLAN-SEARCH.md`](plans/PLAN-SEARCH.md) | 搜索怎么做：中文名 + perk 名，不引 DIM 语法 | 未实现 |
| [`plans/GROUPING_PLAN.md`](plans/GROUPING_PLAN.md) | DIM 的仓库分组结构与我们的落点 | 已实现（v0.42.9），留作依据 |

## 调研与提案（`research/`）

看了什么、差在哪、向别人要什么。**不描述我们打算怎么做**。

| 文档 | 讲什么 |
|---|---|
| [`research/DIM-GAP-ANALYSIS.md`](research/DIM-GAP-ANALYSIS.md) | DIM 有什么我们没有（2026-11-06 普查） |
| [`research/CONTEXT-PLAN-DIFF.md`](research/CONTEXT-PLAN-DIFF.md) | 上下文面：原计划 vs 实际取舍的对账 |
| [`research/RESEARCH-session-presentation-layers.md`](research/RESEARCH-session-presentation-layers.md) | DSH 的呈现层能做到什么 |
| [`research/FR-SESSION-ACTIVATION.md`](research/FR-SESSION-ACTIVATION.md) · [中文](research/FR-SESSION-ACTIVATION.zh.md) | 向 DSH 提的需求：会话怎么被激活 |

这几份讲的是**向 DSH 要 API**，不是本插件自己的事；留着是因为可能还要提。

## 归档（`../archive/`）

已完成、已过时、或已被取代的。**不要再改它们的内容**。

| 文档 | 状态 |
|---|---|
| `archive/docs/STATUS.md` | 已被 `HANDOFF.md` 取代——两份都在讲"到哪了"，必然互相漂 |
| `archive/docs/IMPL-P0-DATA-MODEL.md` | 已完成——里面的"待做"全部落地 |
| `archive/docs/DIAG-EQUIP-VS-INVENTORY.md` | 已修复——装备区/携带区已分开 |
| `archive/docs/PLAN-OPERATION-CONTEXT-v2.md` | 已过时——讨论的是"上下文"层，实际走了自建数据面 |
| `archive/docs/PLAN-P2-P3.md` | 已过时——内容被 `plans/PLAN-SELF-HOSTED-DIM.md` 推翻并取代 |
| `archive/scaffold/README-{es,hi,pt,zh}.md` | 脚手架遗留的多语言 README，与本项目无关 |

## 约定

- 新的计划写 `docs/plans/PLAN-<主题>.md`，做完移进 `archive/docs/` 并在这里改状态
- **不写"设计论证"重复的文档**：一个决定只在一处解释，其他处引用
- 本索引里的路径都以 `docs/` 为基准。其余文档：Markdown 链接用**从引用文件出发的相对路径**（否则点不开）；
  纯文本提及（代码注释、yaml、json）用**仓库根相对路径** `docs/plans/<文件>.md`
- 打包产物不进根目录：`npm pack` 之后 `mv *.tgz archive/packages/`（该目录已 gitignore）

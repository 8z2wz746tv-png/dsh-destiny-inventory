# 文档索引

根目录只留三份必读：`AGENTS.md`（规矩）、`PLAN-SELF-HOSTED-DIM.md`（架构边界）、`README.md`（怎么装）。
其余都在这。**一份文档只讲一件事**——新写的先在这里登记，避免重复。

## 现在有效的

| 文档 | 讲什么 | 什么时候看 |
|---|---|---|
| [`CODING-STANDARDS.md`](CODING-STANDARDS.md) | 跨项目可移植的编码规范骨架 | 写代码前 |
| [`PLAN-SEARCH.md`](PLAN-SEARCH.md) | 搜索怎么做：中文名 + perk 名，不引语法 | 要动搜索时 |
| [`DIM-GAP-ANALYSIS.md`](DIM-GAP-ANALYSIS.md) | DIM 有什么我们没有（2026-11-06 普查） | 决定做什么之前 |
| [`GROUPING_PLAN.md`](GROUPING_PLAN.md) | DIM 的仓库分组结构与我们的落点 | 要动分组时 |

`GROUPING_PLAN.md` 里的方案**已经实现**（v0.42.9），留作"为什么这么分组"的依据。

## 归档的

在 [`../archive/docs/`](../archive/docs/)，都是**已完成或已过时**的：

| 文档 | 状态 |
|---|---|
| `IMPL-P0-DATA-MODEL.md` | 已完成——里面的"待做"全部落地 |
| `DIAG-EQUIP-VS-INVENTORY.md` | 已修复——装备区/携带区已分开 |
| `PLAN-OPERATION-CONTEXT-v2.md` | 已过时——讨论的是"上下文"层，实际走了自建数据面 |
| `PLAN-P2-P3.md` | 已过时——P2/P3 的内容被后续实际需求取代 |

## 会话激活相关的两份

`FR-SESSION-ACTIVATION.md` / `RESEARCH-session-presentation-layers.md` 讲的是**向 DSH 要 API**，不是本插件自己的事。留着是因为可能还要提。

## 约定

- 新的计划写 `docs/PLAN-<主题>.md`，做完移进 `archive/docs/` 并在这里改状态
- 不写"设计论证"重复的文档：一个决定只在一处解释，其他处引用
- 打包产物不进根目录：`npm pack` 之后 `mv *.tgz archive/packages/`（该目录已 gitignore）

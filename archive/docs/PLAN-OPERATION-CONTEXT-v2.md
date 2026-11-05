# PLAN · Operation Context v2（冻结版）

> 状态：**架构冻结，按 P0 → P5 开工**。上一版 `PLAN-SELF-HOSTED-DIM.md` 负责"数据面/写入面怎么分家"，本文件负责"操作怎么变成 Agent 的感知"。两份一起看，冲突处以本文件为准。
> 唯一主仓库：`/Users/husky/项目/dsh-destiny-inventory`。

---

## 0. 第一原则（比技术选型更重要）

> **Destiny Workspace 不以 Agent 的聊天记录作为操作记忆。**
> 所有用户行为和系统执行结果都必须先形成结构化事件；Agent 只能读取事实层与**明确标注为派生**的信息，不能反向修改事实历史。

推论：

- 聊天历史可以被压缩、截断、重述，**不能**当作"用户做过什么"的依据；
- Journal 是唯一事实源；Agent Memory / Operation Chain 是可丢弃、可重算的派生层；
- 事实层只追加，不修改。状态修正通过**新事件**表达（如 `operation.reconciled`），不覆写旧事件。

---

## 1. 仓库边界（写死，防止再混进来）

| 仓库 | 定位 | 处理方式 |
|---|---|---|
| `~/项目/dsh-destiny-inventory` | **当前主项目**（自研前端 + host 半） | 唯一主开发仓库 |
| `~/项目/dsh-destiny-workspace` | 已封存的 iframe 探针（0.2.x，主区 iframe + 8765 桥） | 只查历史实验，不再开发 |
| `~/项目/destiny2-mcp` | 数据 / 查询 / 求解 / 执行 | 保留现有架构，按需扩展 |
| `~/项目/DestinyItemManager/DIM` | 规则参考源（v8.143.0，无 git 历史） | 只读，抄规则不抄代码 |

**不做清单**（任何一版模型都不许自行恢复）：

- 不复活 iframe 方案，不重新嵌入 DIM；
- 不把 `dsh-destiny-workspace` 当第三个前端；
- 不整体迁移旧 WebUI 的文件（`src/client/legacy/**` 已 4148 行，属待删遗留，不作基线）；
- 不启动第二个 MCP 实例；
- 不让浏览器半持有 OAuth token；
- 不让 Agent 用聊天记录推断"用户做过什么"。

---

## 2. 五层架构

```
① Workspace UI（React，--dsw-alias-* 设计令牌）
      │  视图变化（同步）
      ├──────────────────────────► ④ Context Projection
      │  账户操作（命令）
      ▼
② Operation Layer（Host Operation Coordinator）
      │  validate → 排队 → backend → verify
      ▼
③ Operation Journal（SQLite 唯一事实源 + JSONL 镜像）
      │
      ▼
④ Context Projection（从 Journal 派生当前工作区状态）
      │
      ▼
⑤ Agent Context Builder（每轮 Snapshot + Delta；按需 Query）
      │
      ▼
DSH Native Agent ──► destiny2-mcp（分析 / 配装 / 求解 / 执行）
```

职责一句话：

| 层 | 只做 | 绝不做 |
|---|---|---|
| ① UI | 渲染、产生意图 | 直接调 Bungie / MCP |
| ② Operation Layer | 统一入口、校验、排队、执行、核验 | 渲染、推断用户意图 |
| ③ Journal | 追加事实、分配 seq | 存推断、存聊天 |
| ④ Projection | 从事实派生"现在是什么状态" | 成为第二事实源 |
| ⑤ Builder | 每轮注入 Snapshot + Delta、按需查历史 | 让模型自己"记得" |

---

## 3. 两类输入：Account Operation 与 View Event

### 3.1 Account Operation（会失败，必须走 Coordinator）

转移、装备、锁定/解锁、从邮政官取回、装模组。

```ts
interface OperationCommand<T = unknown> {
  commandId: string
  commandType: 'item.transfer' | 'item.equip' | 'item.lock' | 'item.pull' | 'item.mod'
  source: 'user' | 'agent' | 'system'
  createdAt: number
  payload: T
  /** 仅用于回执展示，不参与事实判定 */
  uiHint?: { instanceId?: string; itemHash?: number }
}
```

### 3.2 View Event（不会失败，同步 dispatch，**不进 Coordinator**）

选中、切角色、筛选、排序、展开/关闭详情、切换面板。

```ts
interface ViewEvent {
  type: 'view.event'
  action: 'item.select' | 'item.deselect' | 'character.switch'
        | 'inventory.filter' | 'item.inspect' | 'item.close' | 'page.switch'
  payload: Record<string, unknown>
  at: number
}
```

两条都写进 Journal、都占一个 `journalSeq`（见 §5 单一时间轴），但只有 Account Operation 有 `submitted / succeeded / failed / unknown / verified` 状态机。

**为什么分开**：Coordinator 引入异步与失败语义。视图操作走它只会让拖拽路径多一层 await，而它永远不会失败。

---

## 4. 双写入协调：Host Operation Coordinator

### 4.1 问题

前端直写 Bungie，Agent 经 MCP 写 Bungie。两条路各自为政时，插件里的队列只能保证**本地**串行，跨源并发会产生幽灵状态。

### 4.2 P0 已验证的结论（源码级，2026-11-03）

DSH 工具层提供三个可注册的 waterfall，**足以在不改 MCP 的前提下**观察与串行化 Agent 的写入：

| waterfall | 位置 | 能力 |
|---|---|---|
| `tools/pre-execute` | `@deepseek-ai/dsh-tools/lib/index.js:3321` | 拿到 `exec`（工具名/参数/agent），返回 `{kind:'allow'}` 或拒绝；**是 async**，可以 `await` 写队列空位 |
| `tools/execute` | 同文件 `:3427` | 包住真正执行 |
| `tools/post-execute` | 同文件 `:3600` | 拿到最终 `result`，可据此记 journal |

所以：**跨源严格串行是可以做到的**，路径是"闸门 + 记账"，不是"让 MCP 提供钩子"：

```
前端拖拽 → Coordinator（持锁）→ Bungie 适配器 → verify → journal
Agent 写   → tools/pre-execute 里识别 mcp__destiny__inventory_assistant 的写 intent
           → await Coordinator 的空位（同一把锁）→ 放行
           → tools/post-execute 读结果 → journal(source:'agent')
```

前提（P0 待验两点，验收时必须跑）：

1. `pre-execute` 的 `exec` 里能读到工具名与 arguments（写 intent 判定靠它）；
2. 在 `pre-execute` 里 `await` 一个外部 Promise 不会触发超时/死锁（要跑一次真机）。

**若这两点任一不成立**：降级为乐观并发控制——本地互斥 + 写前回读 + 写后核验 + 冲突检测，并在文档与 UI 上明确"不承诺跨源严格串行"。**不把降级方案说成全局写锁。**

### 4.3 锁必须是租约，不能依赖 post-execute 释放

`post-execute` **不保证一定执行**：工具抛异常、被取消、`signal` 中止、进程退出，都可能跳过它。只靠 pre/post 配对必然出现锁泄漏，后续所有写被永久阻塞。所以：

```ts
interface WriteLease {
  leaseId: string          // 随机
  owner: string            // 'agent:<callId>' | 'user:<commandId>'
  acquiredAt: number
  expiresAt: number        // acquiredAt + ttl
  releasedBy?: 'post-execute' | 'finally' | 'ttl' | 'shutdown'
}
```

规则：

1. `acquire(owner, ttlMs)` 返回 lease；队头不是自己就 `await`；**前端写的等待上限 2 秒**，超时按乐观并发提交（见 §4.5），不无限等。
2. `release(leaseId)` 必须校验 leaseId 匹配——别人的 `post-execute` 不能释放我的锁。
3. **兜底回收**：每 1 秒扫一次过期 lease，强制释放并写一条 `lock.expired` 事件进 Journal（这是事实，Agent 下一轮能看到"上次锁超时"）。
4. TTL 不能小于一次工具调用的最长耗时（profile 里 `toolCallTimeoutMs: 300000`，即 5 分钟）。所以：**TTL 用 300 秒，但前端写不等它**——两件事分开设，别让一次 Agent 卡死堵住 UI。
5. 锁的持有者与获取时间要在回执上是可见的（"Agent 正在写入"），不允许静默排队。

### 4.4 一个 MCP 工具 = 多次上游写（已核实）

以 `inventory_assistant` 为例（`destiny_mcp/tools/assistants.py` 与 `_equip_branches.py`）：

| intent | 实际上游动作 |
|---|---|
| `move` | `search + transfer (+ 可选 equip)` |
| `equip` | `plan_equip_item`（读）→ `execute_equip_plan`（**先顶下、再装目标**，至少两次写） |
| `equip_many` | `equip_items`（批量，多次） |
| `lock` / `pull_postmaster` | 单次 |

所以锁的粒度是**整个工具调用**，不是其中某一步；Journal 里一条 `operationId` 对应一个工具调用，`state.delta` 可以有多条（每个受影响实体一条）。

### 4.5 关联标识：工具调用 ↔ Journal ↔ 核验

`tools/pre-execute` 拿到的 `exec` 已含 `{ token, callId, rootCallId, name, arguments, signal, agent }`（`dsh-tools/lib/index.js` 的 `createExecution`）。据此建链：

```
exec.callId ──► operationId ──► state.delta[] ──► verified
exec.rootCallId ──► 同一轮 Agent 任务的根
agent.session.id ──► 水位与归属会话
```

- 前端写的 `operationId` 由 Coordinator 生成；Agent 写的 `operationId` 由 `exec.callId` 派生（`op:agent:<callId>`），保证幂等重放时不会重复记账。
- **上游请求级关联目前做不到**：MCP 不把内部每次 Bungie 调用暴露出来。`equip` 的响应里有 `steps[]` 可以对应，其它 intent 没有。要做请求级追账，得在 MCP 的 action 响应里加 `steps[]` 或 trace id——这是对 MCP 的小改动，列为 P2 的可选项，不阻塞。

### 4.6 post-execute 不产生 state.delta

`post-execute` 只能证明"MCP 执行完了"，不能证明"Bungie 已经同步"。已有的真机事实是写入同步窗口 3–10 秒。职责切分：

| 阶段 | 允许写的事实 |
|---|---|
| `pre-execute` | 操作意图、取锁、`operationId` |
| `post-execute` | `operation.result`（`succeeded` / `failed` / `unknown`），**不写 delta** |
| readback / reconciliation | 回读确认后才写 `state.delta` + `operation.reconciled(to=verified)` |

MCP 返回成功但回读未确认时，状态停在 `succeeded`，UI 显示"已提交"；回读一致后才变"已确认"。

---

## 5. Journal：唯一时间轴

- **SQLite 是唯一事实源**（宿主 Node 24.22.1 的 `node:sqlite` / `DatabaseSync` 已实测可用，**不引入原生编译依赖**）。
- **JSONL 是排障镜像**，异步追加或定期导出；镜像写失败**不能**让已提交的账户操作变成失败；重启后可从 SQLite 重建。
- `journalSeq` **只由 SQLite 事务分配**，单调递增，不回收。
- 表：`operation_events(seq, eventId, operationId, type, payload, createdAt)`、`journal_meta(key, value)`。
- `DatabaseSync` 是同步 API：**事务必须短**——不在事务里发网络请求、不写文件、不等待。

事件三类（不合并）：

```ts
type JournalEvent =
  | { kind: 'user.action';       seq: number; action: string; target?: { instanceId?: string; itemHash?: number }; parameters?: Record<string, unknown>; at: number }
  | { kind: 'operation.result';  seq: number; operationId: string; status: 'submitted' | 'succeeded' | 'failed' | 'unknown' | 'verified'; backend: 'bungie' | 'mcp' | 'local'; source: 'user' | 'agent' | 'system'; errorCode?: string; at: number }
  | { kind: 'state.delta';       seq: number; operationId: string; entity: { instanceId: string; itemHash: number }; changes: { field: string; before: unknown; after: unknown }[]; at: number }
  | { kind: 'operation.reconciled'; seq: number; operationId: string; from: 'unknown'; to: 'verified' | 'failed'; at: number }
```

硬规则：

- **失败不许伪造 `state.delta`**（有 action、有 failed，没有 delta）；
- `unknown` 是一等公民（超时既不算成功也不算失败），必须能被后续回读收敛为 `verified` 或 `failed`（reconciliation 任务）；
- `state.delta` 的 `before/after` 必须是**程序确认过的结构化值**，不是模型推断；
- 同一 `eventId` 重复提交必须幂等。

---

## 6. 单一水位：删掉 contextRevision

- 只有一把尺子：`journalSeq`。视图变化也占 seq。
- Projection 只记 `derivedFromSeq`，不独立计时。
- Agent Session 水位按 **`agent.session.id`** 保存（源码证据：`@deepseek-ai/dsh-agent/lib/index.js:514` 使用 `agent.session.id`；provider 收到的参数是 `{ agent, scope: agent }`，见 `assembleContextFor` 于 `:291`）。

```ts
interface AgentSessionCursor {
  sessionId: string       // agent.session.id
  lastSeenJournalSeq: number
  updatedAt: number
}
```

**P0 待验**：同一 Session 多轮拿到的是同一 `agent` 实例；Session resume 后能重建 Snapshot + Delta（不是从 0 重放全部历史，而是 snapshot + 新水位）。

---

## 7. Agent 每轮看到什么（Snapshot + Delta + Query）

- **Snapshot**（每轮）：当前角色、当前页、选中物品（instanceId + hash）、`journalSeq`、当前筛选。
- **Delta**（每轮）：`lastSeenJournalSeq + 1 … 最新 seq` 的压缩行，一条一行；无新增时不注入。
- **Query**（按需）：`journal.search` / `journal.get_operation` / `journal.recent`。

注入实现：`ctx.systemPrompt` 的动态 context provider（**per-agent 作用域**，只在 destiny preset 的 agent ctx 注册，不污染其它会话）。provider 每轮被调用，**只读内存尾部 + 缓存**，不做重 IO。

裁剪：单轮 Delta 上限 20 行；超出只注入"最近 20 条 + 其余 N 条可用 query 取"。

---

## 8. 污染面（进 Builder 才处理信任）

- 内部领域模型保持普通强类型，不包 `{value, source, trust}` 三层。
- 只在 Context Builder 出口打标签：

```ts
interface ExternalText { value: string; source: 'bungie' | 'community' | 'user_metadata'; trust: 'untrusted' }
```

- 注入只信我们自己的事实：`instanceId`、`itemHash`、动作、时间、结果、位置。
- **物品名/玩家名/公会名/用户输入的筛选串**一律当外部文本，只出现在"物品引用"字段里，不进入句子成分。
- Journal 里**不记录** OAuth token、Authorization header、完整认证信息；敏感字段走 allowlist 输出。

---

## 9. Operation Chain（P5，纯派生）

- 目标只做推断，**不写事实层**；
- 先规则系统（时间窗 + 同类型计数），不用 LLM 聚类；
- `inferredGoal` **绝不进 system prompt**，只作为 query 结果返回，并带 `sourceEventIds` 以便追溯；
- 事实示例："连续查看 5 把手炮"；推断示例："可能在比较手炮"——两者在输出里必须分开标注。

---

## 10. 状态机与 reconciliation

```
submitted ──► succeeded ──► verified
     │            │
     │            └──► unknown（超时/无法回读）
     └──► failed
unknown ──(reconciliation 回读)──► verified | failed
```

- 写入同步窗口 3–10 秒：`succeeded` 之后不立刻判 `verified`，回读 8×1.5s；
- UI 回执两态：**已提交** / **已确认**；
- 每条 `unknown` 都要进 reconciliation 队列，重启后继续收敛（不允许永久悬空）。

---

## 11. 阶段与验收

| 阶段 | 内容 | 验收 |
|---|---|---|
| **P0-a** | Provider Session 验证 | 拿到稳定 `agent.session.id`；两 Session 水位独立；resume 后可从 snapshot 重建 |
| **P0-b** | 双写闸门验证 | `tools/pre-execute` 能读到写 intent 并 await 队列；不行则书面降级为乐观并发 |
| **P0-c** | Host 数据面 | 独立 OAuth + GetProfile + Manifest；前端不依赖 MCP sidecar 也能出角色/仓库/Perk |
| **P0-d** | 切主线 | 注册从 `LegacyInventoryPanel` 切到 `InventoryPanel`；`legacy/**` 停用待删 |
| **P1** | 写队列 + 四个动作 | 拖一件到仓库→装备成功；失败回滚；回执两态 |
| **P2** | Command + Journal | 每次账户操作三段事件；`unknown` 可被回读收敛为 `verified` |
| **P3** | Projection + Provider | 下一轮 Agent 能准确说出"你刚把玉兔拖去仓库了" |
| **P4** | preset + query 工具 | 问"刚刚整理了什么"能汇总，不是只读最后选中 |
| **P5** | Operation Chain | 能推断"你在整理手炮"，且标注为推断 |

### MVP 验收测试

1. **操作感知**：拖玉兔到仓库 → 下轮 Agent 说得出对象/来源/目标/结果/核验状态。
2. **连续操作**：连续整理五件后问"刚刚整理了什么" → 汇总，不是只读最后选中。
3. **失败操作**：Bungie 报错 → Agent 知道"尝试过但不能说已转移"。
4. **任务隔离**：正在分析 A，用户选中 B → A 的任务仍绑 A。
5. **注入隔离**：物品名含伪装指令 → 只当外部文本。
6. **多会话**：两会话挂同一 preset，水位互不干扰，但都能看到对方触发的写（Journal 是 host 单例）。
7. **跨源串行**：前端写与 Agent 写同时发起 → 同一把锁排队（或明确按降级语义处理）。

---

## 12. 配置与依赖纪律

- 不引入 Redis / Kafka / 独立事件服务：本地单用户，SQLite + 事件订阅足够。
- 不新增原生编译依赖（`node:sqlite` 已够；上次装包被 `ssh2` 原生编译拖了两分钟的教训）。
- 前端 React + TS，样式只用 `--dsw-alias-*`；语义色（稀有度/元素/职业）写死一处。
- 配置走 Schemastery；端口、redirect、preset id 一律可配，不写死。

---

## 13. Agent Insight 层（产品决策，2026-11-03 定稿）

前端不消费 MCP 的原始工具返回值。数据与执行归 MCP，判断归 Agent，呈现归前端。

```ts
interface AgentInsight {
  id: string
  target: { instanceId: string; itemHash: number }
  type: 'weapon_analysis' | 'build_advice' | 'comparison' | 'recommendation'
  summary: string
  details?: string[]
  sourceEventSeq?: number      // 这条判断依据的 journal 水位
  generatedAt: number
  status: 'valid' | 'stale'    // target 变了必须立刻置 stale
}
```

硬规则：

- **`target` 必须精确到 instanceId**：用户切到另一件物品，旧 Insight 立刻 `stale`，绝不允许显示在 B 物品下面；
- Insight **写进独立的 UI 槽**（第一版固定在物品详情卡底部），不进 Journal 事实层；
- Insight 是**派生物**：可被重新生成、可被丢弃，不能反过来修改操作历史；
- 第一版能力面：perk 组合分析 / 与当前职业与配装的适配 / 与仓库同类武器的横向建议 / 留还是拆还是转。后续按 MCP 能力面扩。
- 不做插件式卡片系统，先做**固定槽位**。

## 14. 拖拽落点语义（必须经 Coordinator 解析，不直连 API）

| 拖拽目标 | 语义 | 执行 |
|---|---|---|
| 仓库 | 转移到仓库 | `TransferItem(transferToVault)` |
| 当前角色的角色栏 | 转移到该角色；满足条件则装备 | transfer → 必要时 equip（可能先顶下已有装备） |
| 当前角色的装备槽 | 装备到对应槽位 | `EquipItem` / `EquipItems` |
| 其他角色栏 | 转移到该角色，**不默认装备** | `TransferItem` |

- 落点 → Bungie 请求之间必须经过 Coordinator 的语义解析与前置检查（`canMove` / 槽位合法 / 职业兼容）；
- 一个拖拽可能对应**多次上游写**（见 §4.4），Journal 里仍是一个 `operationId`，`state.delta` 可以多条；
- 多选、框选、Shift 点选**全部后置**；先把单件的成功、失败、回滚、核验做可靠。

## 15. 功能优先级与 Manifest 分层

| 功能 | 优先级 |
|---|---|
| Perk 过滤 | P1 后半 / P2 |
| 标签 / 备注 / 收藏 | P2（**Host 本地持久化**，不伪装成 Bungie 账户数据） |
| 愿望单 | P3 |
| 两把枪对比 | P3（与 Agent 分析重叠） |
| 多选批量整理 | P4 |

Manifest 数据结构**现在就要为 perk 索引留位**（不要求 P0 实现索引）：

- **Manifest**：静态定义（物品 / perk / 武器 / 插槽类别）；
- **Inventory**：玩家实例及其当前 perk；
- **Search Index**：把两者关联起来，支撑快速过滤。

## 16. 主动性分级

- **拉式（P0–P4 基础）**：打开详情 / 切角色 / 提问时，Agent 已经知道当前上下文，不需要用户复述。
- **停留触发（后续探索）**：在详情页停留后给出非侵入式提示。必须有触发条件、去重、冷却、关闭入口；**不允许"停留十秒就默认需要一条 AI 建议"**。
- **自主发起对话（UNKNOWN）**：目前没有 DSH 侧证据，不做承诺。

## 17. MVP 验收画面（产品的"做成了"）

```
玉兔 · 异域侦察步枪 / 猎人 · 当前物品详情
用户操作   把玉兔从仓库拖到猎人角色栏
系统回执   已提交 → Bungie 回读确认 → 已确认
Agent Insight  识别到刚刚转移；当前配装另有一把侦察步枪；建议比较两者 perk 与属性
用户追问   "那我应该用哪一把？"
Agent 回答  基于两把枪的实际 perk、当前配装与使用场景给出选择与理由
```

闭环是：**操作 → 记录 → 感知 → 分析 → 追问 → 决策**。

验收边界（两条必须分开考）：

1. **感知**：下一轮 Agent 能基于真实操作记录回答追问（不要求操作后自动触发分析）；
2. **质量**：分析结论是否正确、是否有依据——单独评测，不能把"能感知"和"能给出正确建议"混成一个指标。

## 18. 产品定位（不可动摇）

- **即使完全不使用 Agent，前端也必须是一款能独立使用的装备管理工具**；Agent 是增强层，不是唯一入口。
- 不为了 Agent 牺牲仓库工具的效率（拖拽、筛选、键盘操作的速度优先）。
- 不是"DIM 的国产替代"，也不是"能操作命运 2 的聊天机器人"，而是"理解玩家正在做的准备工作，并能基于真实状态与操作历史提供帮助"的协作环境。
- **已删除的备选**：iframe / Browser Tab / 独立窗口三选一不再存在——前端运行在 DSH 面板槽内，这条路线整段废弃。

---

## 19. 已装备 ≠ 携带：武器/护甲区必须分格（2026-11-04 补充）

DIM 的 `StoreBucket` 就是这样：**一个 bucket 内，已装备的物品单独占一格**，其余是"身上带着但没装备"的。这不是视觉洁癖，是语义：

- 已装备：正在生效，换下来才失效；
- 携带：只是在这个角色身上，不生效。

### 19.1 渲染（P1 就要做）

- 武器区分 **三个 bucket 行**：动能 / 能量 / 威能；
- 每行最左一格 = 该 bucket 的 **已装备**物品（空则显示空槽）；
- 其余格 = 携带中的物品；
- 判据只认组件 300：`itemComponents.instances.data[instanceId].isEquipped`，且必须先用 bucket 过滤——它对所有物品都为真，不筛会全绿；
- 护甲同理（头盔/手套/胸甲/腿甲/职业物品各一行 + 已装备单格）。

### 19.2 落点语义（由 19.1 派生）

| 落点 | 语义 | 上游动作 |
|---|---|---|
| 本角色「已装备」格 | 装备到该 bucket | 若物品在仓库/别的角色：先 `TransferItem` 再 `EquipItem`（两步写） |
| 本角色携带网格 | 只转移到该角色，不装备 | `TransferItem` |
| 仓库 | 转移到仓库 | `TransferItem(transferToVault)` |
| 其他角色栏 | 转移到该角色，不装备 | `TransferItem` |

所以「拖到已装备格」天然可能触发**先转移再装备**——又一个 §4.4 里"一次操作 = 多次上游写"的例子，Journal 里仍是一个 `operationId`。

### 19.3 与 §14 的关系

§14 的四个落点是**账户级语义**；本节补的是**渲染与 bucket 级语义**。两者叠加使用：先按 bucket 行定位，再按格判断是"装备"还是"携带"。

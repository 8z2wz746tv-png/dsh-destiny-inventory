# 操作事件模型（P1.2–P1.5）

2026-11-07。P1.1（假事件）已交付，这是后面四项的地基。

## 一、现在的问题

`JournalEntry` 一条 = 一次写的**结果**，事后才知道。由此三件事做不到：

1. **请求发出到返回之间没有记录**。超时、进程崩溃、宿主被杀 —— 零痕迹，事后只能猜。
2. **结果覆盖了过程**。`result: ok` 混着"Bungie 说成功"和"东西真的到了"；`resolution` 只在失败路径补，成功路径从来没有核验。
3. **表达不了"不知道"**。一条记录不是 ok 就是 failed；"提交了但没等到答案"没地方放。

## 二、目标形状：事件流

一次操作产生 **1..N 条事件**，共享一个 `eventId`：

```ts
export interface JournalEvent {
  /** 一次操作的标识；它的 submitted / succeeded / verified 共用这个值。 */
  eventId: string
  /** 这次事件在说什么。 */
  kind: 'submitted' | 'succeeded' | 'failed' | 'verified'
  /** 事件发生时刻（毫秒）。P1.3 会补上持久化分配的 sequence。 */
  at: number
  action: 'move' | 'equip' | 'lock' | 'pull_postmaster' | 'observed'
  item: { instanceId: string; itemHash: number; name: string }
  /** 位置键，不是角色 id。 */
  from: string | null
  to: string | null
  source: 'ui' | 'external'
  /** 上游原文，或核验的结论。 */
  detail: string
  /** 只对 `verified` 有意义：物品是否真的到了 `to`。 */
  landed?: boolean
}
```

一次成功且核验过的转移：

```
submitted  → succeeded → verified(landed: true)
```

一次上游拒绝、回读确认没落地的：

```
submitted  → failed → verified(landed: false)
```

一次超时或进程被杀：

```
submitted            ← 只有这一条。折叠出来是 unknown。
```

**`succeeded` 与 `verified` 不合并**：前者是"接口回了 ok"，后者是"回读确认到位"。P0 那一轮已经证明这两个可以分离 —— 接口回 ok、回读说还在仓库，而 Bungie 那边几分钟后才变。

## 三、agent 看到的是折叠结果，不是事件流水

事件流进磁盘和内存，`destiny_workspace_journal` 返回**一次操作一条**：

```json
{
  "eventId": "…",
  "action": "move",
  "item": { "instanceId": "…", "itemHash": 1532276803, "name": "同源需求" },
  "from": "vault",
  "to": "warlock",
  "status": "verified",
  "submittedAt": 1793943969669,
  "settledAt": 1793943971340,
  "detail": "",
  "history": ["submitted", "succeeded", "verified"]
}
```

`status` 由折叠算出，取值：

| status | 含义 |
|---|---|
| `unknown` | 只有 submitted。提交过，没有结论 |
| `succeeded` | 接口回了 ok，但还没核验 |
| `failed` | 接口拒绝了 |
| `verified` | 回读确认到位（`landed: true`） |
| `rejected` | 回读确认没到位（`landed: false`），这条比 `failed` 更硬 |

折叠是**派生**：删掉内存、只留磁盘，重新读一遍能得出同样的结论。这正是"Journal 是唯一事实源"的意思。

## 四、存储与恢复

- **磁盘**：`journal.jsonl` 每行一个事件，append-only。顺序就是事件顺序。
- **内存**：最近 600 条事件（约 200 次操作），按 `eventId` 折叠后供工具读取。
- **恢复**：`restore()` 逐行读，按行序回填；同一 `eventId` 的多条事件自然按时间排好。
- **`sequence`（P1.3）**：jsonl 是单进程 append，行序即持久化顺序；P1.3 把它显式化成字段，
  并在加锁的前提下分配。P1.2 先把 `eventId` 做出来，`sequence` 留位置。

## 五、迁移旧数据

磁盘上现存 37 条旧 `JournalEntry`。一次性脚本 `scripts/migrate-journal.mjs`：

- `result: ok|failed` → 一条 `succeeded` / `failed` 事件，`eventId` 由 `at` 派生；
- 带 `resolution` 的 → 追加一条 `verified(landed, location)`；
- 旧记录的 `hash: 0` 原样保留（当时就没传，不编造）。

跑一次，之后代码只认新形状。**不做运行时兼容**：`restore()` 遇到旧形状直接报错，而不是悄悄转换。

## 六、实施顺序

| 步 | 内容 | 验收 |
|---|---|---|
| **P1.2** | `submitted` 前置 + 事件形状 + 折叠 | 写一个会超时的请求，journal 里留下 `unknown` |
| P1.3 | `eventId` 稳定 + `sequence` 持久化分配 | 重启后序号连续、不重号 |
| P1.4 | `itemHash` / `characterId` 进事件 | 事件能唯一定位物品与角色 |
| P1.5 | `succeeded` / `verified` / `unknown` 收敛 | 成功路径也走核验，不再只靠失败回读 |

P1.2 一次把形状定完（含 `kind`、`eventId`、`landed`），后面三步只是往里填东西，不再改形状。

## 七、待拍板

1. **agent 看折叠还是看流水** —— 建议折叠（一次操作一条，带 `history`）。流水会让 agent 读到
   三倍的条目，还要自己归并。
2. **旧 37 条** —— 建议迁移（里面有真实操作），不赞成清空。
3. **内存上限 600 事件（≈200 次操作）** —— 现在是 200 条记录。600 事件能装下同样多的操作历史。

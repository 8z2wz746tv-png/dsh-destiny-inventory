# 库存状态一致性层（P1）

2026-11-07。**设计稿，未实施。** 起因：一次真机实测证明 `TransferItem` 返回 ok 之后，
profile 有 56–64 秒仍报旧位置。于是同一个「位置」在四个地方各说各话。

## 一、四套状态，不许互相冒充

| 状态 | 是什么 | 谁拥有 | 能不能当事实 |
|---|---|---|---|
| **Bungie Observed** | 上游某一次读返回的位置 | `BungieService`（30s 缓存 + 强制读） | ❌ 是一次观测，不是结论 |
| **Pending Operation** | 本地已提交、尚未核验的操作及其目标位置 | 浏览器半（本方案新增） | ❌ 是意图，不是状态 |
| **Verified** | 回读确认过的位置 | 由核验流程产出，写进 journal | ✅ |
| **Journal** | 发生过的操作与状态转换 | `ContextStore`（host） | ✅ 事实源，但是**历史的**，不描述"现在" |

现在的问题不是其中哪一个错了，是**它们互相冒充**：UI 把 Pending 当 Verified（乐观移动后不设防），
刷新把 Observed 当事实（整体替换 UI），journal 把 `ok` 当落地。

## 二、Pending Operation Overlay

不是 `instanceId → destination` 的 Map，是一个带序号和生命周期的状态层。

```ts
export type OperationState =
  | 'submitted'    // 已提交，等桥接回答
  | 'succeeded'    // 桥接明确接受，位置尚未确认
  | 'verifying'    // 等观测确认（明确成功后、或结果不明时进入）
  | 'failed'       // 明确拒绝，确定没执行
  | 'unknown'      // 结果不明或超期未确认
  | 'verified'     // 确认到位
  | 'superseded'   // 已被更新的可信观测取代，不再控制渲染

export interface PendingOperation {
  eventId: string
  /** 同一 instanceId 上的单调序号，晚的覆盖早的。 */
  seq: number
  instanceId: string
  action: 'move' | 'equip' | 'lock'
  target: string
  from: string | null
  state: OperationState
  submittedAt: number
  checkedAt: number
  /** 超过这个时刻仍未一致 → unknown。 */
  expiresAt: number
  /** 连续多少次观测与 target 不一致，用来识别 superseded。 */
  mismatches: number
}
```

### 状态机

```
submitted ─┬─ 桥接明确接受 ──→ succeeded ──受观测驱动──→ verifying
           ├─ 桥接明确拒绝 ──→ failed      （移除 overlay，确定没落地）
           └─ 超时/断连 ────→ verifying   （不知道落没落，只能等观测）

verifying ─┬─ 观测与 target 一致 ──→ verified   （移除）
           ├─ 超期仍不一致 ────────→ unknown    （保留，带标记）
           └─ unknown 后又稳定地不一致 → superseded（不再控制渲染）
```

**`failed` 和 `unknown` 不是一回事。** 前者是「Bungie 说没做成，且这个拒绝能确定它没执行」，
后者是「根本不知道」。把它们并成一个状态，等于把一次超时当成一次失败——这正是 P0 那轮
「失败但实际落地」的另一面。

`failed` 之后仍然**可以**被回读翻案（记 `verified`），但那一刻 overlay 已经不在渲染里，
翻案只进 journal。这条是为了保留「上游说没成、实际成了」这种情况的痕迹。

### 判「明确拒绝」还是「结果不明」

看桥接回来的 `error.code`，不看 HTTP 状态码本身：

| code | 判定 | 依据 |
|---|---|---|
| `BadRequest` / `NotFound` / `AUTH_UNAVAILABLE` | 明确拒绝 | 请求根本没送到 Bungie 的业务逻辑 |
| `Destiny*`（上游 `errorStatus`） | 明确拒绝 | Bungie 说不行，例如 `DestinyNoRoomInDestination` |
| 网络中断、`AbortError`、未知 code、`UPSTREAM` | **结果不明** | 请求可能已经到了 Bungie 并执行 |

### 两条硬约束

**约束一：早的操作不能覆盖晚的。**

```
A: 仓库 → 术士   (seq 1)
B: 术士 → 猎人   (seq 2)
```

A 的回读如果最后才返回、说「它在术士」，**不能**把 UI 从猎人画回术士。实现：
核验回调先比对 `overlay.get(instanceId)?.eventId === 本次 eventId`，不等就只更新 journal，
不碰渲染。快速连拖同一件时，这是唯一的正确解。

**约束二：`unknown` 不无限期冒充成功，也不能永久压制真实变化。**

超过核验期限（5 分钟）仍未一致 → `unknown`，保留 overlay，画未确认环。

但如果**之后**又连续观察到稳定的、不同于 target 的位置（说明用户已经在游戏里把它挪走了），
旧 overlay 转 `superseded`：**不再控制渲染**，但记录留在 journal 里。

`superseded` 不是承认那次操作失败，是承认它的显示意图已经不配继续管这块界面。
没有这个状态，一条 `unknown` 会让某件物品永远显示在你以为它该在的地方。

**约束三：一次回读只能证明它自己那次操作，而且必须晚于那次操作发起。**

A 的回读可能看到 B 的最终态：

```
t0  A: 仓库 → 术士，发出
t1  A 发起回读
t2  B: 术士 → 猎人，发出并成功
t3  A 的回读返回：猎人        ← 这是 B 的结果，不是 A 的
```

所以回读结果要带三个时间戳（发起读的时刻、结果到达的时刻）和目标操作的 `submittedAt`，
只有 `读发起时刻 >= 目标操作的 submittedAt` 才能用来核验那次操作。否则整条读完的结果丢弃。

## 三、刷新合并：新快照不许直接替换

现在 `load()` 拿到新快照就 `setState({ snapshot })` 整体替换。改成：

拆成三层，**合并本身是纯的**：

```ts
const observations = compareSnapshot(snapshot, overlay)   // 纯：快照 vs target
const { overlay: next, transitions } = reconcileOverlay(  // 纯：推导状态转换
  overlay, observations, now,
)
const rendered = applyOverlay(snapshot.items, next)       // 纯：只产出要画的行
// transitions 交给 hook 层去写 journal —— 渲染路径上没有副作用
```

职责：

| 模块 | 只做 |
|---|---|
| `compareSnapshot` | 把快照与 target 的差异变成 `Observation[]`（带读的发起时刻） |
| `reconcileOverlay` | 由观测推出状态转换，返回新 overlay + `Transition[]` |
| `applyOverlay` | 给定 rows 与 overlay，返回要渲染的 rows |
| hook 层 | 把 `Transition[]` 落成 `/journal/resolve` |

这样刷新时反复调用不会重复写 journal，也不会在渲染函数里藏异步。

对 overlay 里的每个实例：

| 快照说 | target | 动作 |
|---|---|---|
| 等于 target | — | **落地了**：记 `verified`，移除 overlay |
| 不等于 target | 已 `unknown` | 保留 overlay，画 target + 未确认环 |
| 不等于 target | 其余状态 | **保留 overlay**，画 target，继续核验（不回滚） |

**不回滚**是这条规则的全部意义。旧位置不是"真相"，只是"还没追上的观测"。

刷新按钮照旧可用、照旧真的去问 Bungie —— 只是问回来的答案要经过 overlay 过滤再上屏。
不靠把 TTL 调到 90 秒来回避冲突。

## 四、核验：成功和失败走同一套

现在只有失败才回读，且只读一次。改成**同一条有界核验**：

1. 操作落定（无论 ok 还是 failed）→ `state = 'verifying'`
2. **立即读一次** `/item-state`（1.5 秒，快路径）。一致 → `verified`。
3. 不一致 → 不立刻下结论。等**下一次 `/inventory` 观测**（免费，用户刷新/切角色/面板重读时自然发生）
   再比对一次。
4. 期间每次比对都更新 `checkedAt`。
5. 超过期限仍不一致 → `unknown`。

不做轮询：一次主动读 + 观测驱动，避免每笔写都额外烧 1.5 秒 × N 次。

失败路径的"回读一次就定论"同时废掉——它和成功路径用同一套，因为
「失败但实际落地」和「成功但实际没落地」是同一种不确定。

## 五、与 journal 的关系

- 面板侧 overlay 是**渲染态**，页面刷新（F5）即丢失 —— 那时是"重新观测"，可接受。
- 每次状态转换照旧 `POST /journal/resolve` 落一条，host 侧 `journal` 仍是唯一事实源。
- **不把 overlay 交给 host 保管**：那会让"现在该显示什么"变成服务端状态，
  而它本质上是客户端的渲染意图。

## 六、实施步骤（小步，每步一个提交，不重构）

| 步 | 内容 | 验收 |
|---|---|---|
| **P1.1** | `pending-ops.ts` 纯逻辑：状态机、每实例序号、reconcile、applyOverlay、失败分类 | 单测覆盖多操作、旧回读、超期、superseded |
| P1.2 | `use-item-actions.ts` 接入：写前登记，三种落定各归其位 | 明确拒绝不留 overlay；超时进 verifying |
| P1.3 | `InventoryPanel.load()` 接 `applyOverlay` | 刷新不覆盖未核验的目标 |
| P1.4 | 核验统一：一次主动读 + 观测驱动，成功与不明共用 | 成功路径也有 verified |
| P1.5 | `Transition[]` 落 journal；F5 后从 journal 恢复本次会话未完成的意图 | 状态转换可追溯，不重复写 |
| P1.6 | DSH 页面 E2E（E1–E7） | 七个场景全过 |

**不改**：TTL、journal 的形状（P1.5 只复用现有 `/journal/resolve`）、`detect-external`、
写入队列。**同一物品的写必须串行**——现有的 `write-queue` 已经做到了（按 instanceId 排队），
本层不再加锁，但要在测试里钉住这条前提。

## 七、测试

### 单测（覆盖规则，不覆盖体验）

- 快照与 target 一致 → overlay 移除
- 快照是旧位置 → overlay 保留，行仍画 target
- A 的回读晚于 B → 只更新 journal，不覆盖 B 的渲染
- 超期 → `unknown`，overlay 仍在，行带未确认标记

### 端到端（覆盖体验，**这项不能再推迟**）

七个场景，必须在**真实 DSH 页面**里跑，不是对 React 函数做单测：

| # | 场景 | 必须观察到 |
|---|---|---|
| E1 | 正常拖拽 | 物品立即移动，出现回执 |
| E2 | 拖完立即点刷新 | **物品不跳回** |
| E3 | 连续拖两件 | 顺序正确，互不覆盖 |
| E4 | 请求失败 | 显示未确认，触发回读 |
| E5 | 回读仍是旧位置 | 不错误回滚 |
| E6 | 回读最终一致 | 清除 pending 状态 |
| E7 | 刷新后切角色 | 位置保持正确 |

**两条路，建议都做、先后不同：**

- **先手拖（今天就能验）**：你在面板上拖一次，拖完立刻点刷新，然后问我「刚才那件在哪」。
  我查 journal 与 overlay 的结果。五分钟，能证伪这个方案。
- **再上 Playwright（持续守门）**：`tests/e2e/` 拿 `playwright test` 连 `http://127.0.0.1:<port>`，
  用 `dragTo` 派发真实拖拽事件。要处理 DSH 首屏弹窗与面板挂载，估计半天；装一次之后
  七个场景就是回归套件。

在 Playwright 落地之前，**E1–E7 都算未验收**。

## 八、这轮明确不做的

| 不做 | 为什么 |
|---|---|
| 把 TTL 改成 90 秒 | 只是把冲突推后 60 秒，刷新按钮会变成"按了也没用" |
| Journal 加 `eventId`/`sequence` | 那是 P1.2/1.3，与本层解耦；先让它有 `eventId` 字段就够（本层自己生成） |
| `detect-external` 的候选持久化 | 重启会丢未确认候选，可能延迟/漏识别真实外部变更 —— 记进待办，不在本轮 |
| Agent/MCP 双入口统一 | P2。`explainedByOurOwnWrite` 只认 `ui` 是已知缺口，本轮不变 |
| 异步落盘改同步提交 | 用户明确要求提到 P1 优先级；但它属于 journal 完整性，与本层分开做 |

## 九、已知限制（写下来，不假装没有）

1. **overlay 在页面刷新后丢失**。P1.5 会从 journal 里恢复"最近 5 分钟内、目标与快照不符"
   的 ui 操作意图，缓解这一条；在 P1.5 之前，F5 之后仍在同步窗口内就会看到旧位置。
2. **`unknown` 会一直挂着**，直到用户下一次对同一件物品动手或重新打开面板。
3. **观测驱动的核验依赖"有人读"**。长时间不刷新就停在 `verifying`，最后转 `unknown`。
4. **本层不解决双入口**。agent 通过 MCP 改的东西，仍然只能等 `detect-external` 事后确认。

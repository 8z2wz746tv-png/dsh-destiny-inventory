# 写队列（PLAN-WRITE-QUEUE）

写于 2026-11-06，针对 v0.47.1。HANDOFF §九 第 2 条。

## 一、读完代码后的现状

`busy` 是 `InventoryPanel` 里的 `useState<boolean>`，只做两件事：给 toolbar 显示忙、
给按钮降透明度。**它不拦任何请求**：

```
连点两次 → 两个 postAction 并发 → host 两个 /action 并发 → Bungie 两个写
```

`/action` 路由（`src/index.ts:70`）与 `BungieService.write()` 都没有串行化。

## 二、三个真实缺陷

### D1 同一物品两次写入竞速，第二笔的解析基于过期输入

`runItemWrite` 的 mover 解析分两路（`src/host/item-write.ts:62`）：

| 方向 | mover 从哪来 | 会不会过期 |
|---|---|---|
| 存进仓库 | `item.characterId`（快照里那件所属的角色） | **会** —— 前一笔已经把物品转走了 |
| 取出到角色 | `idOf(destination)`，只用 `itemHash` | 不会（`itemHash` 不变） |

所以"仓库 → 猎人 → 再拖回仓库"这种来回，第二笔的 `characterId` 可能还是旧值，
Bungie 回一句看不懂的话。快照被 `invalidate()` 清掉后会重拉，但 **Bungie 写后同步窗口
3–10 秒**，重拉到的仍可能是写之前的样子。

### D2 队列会把 D1 放大

排队之后两笔紧邻执行（毫秒间隔），中间不再有用户拖动的那几秒。
不修 D1，队列反而更容易撞上过期快照。

### D3 失败回读会踩掉后面的乐观移动

`settleByReadBack` 拿到的是"此刻 Bungie 说的位置"，它不认识队列。
如果后面已经有一笔针对同一件物品的移动在排队，回读结果会把乐观位置写回去。

## 三、方案

### 1. 抽出动作编排：`src/client/use-item-actions.ts`（新文件）

把 `runAction` / `move` / `onEquip` / `confirmEquip` / `onToggleLock` 和 `busy` 整块搬出
`InventoryPanel.tsx`。理由不是"想抽"，是 **538 行贴着 540 上限**，且队列逻辑本来就属于
动作编排而不是渲染。

`InventoryPanel.tsx` 只留渲染与状态装配，预计降到 ~450 行，上限 **540 不动**。

### 2. 客户端队列：`src/client/write-queue.ts`（新文件）

```
FIFO，单 worker 串行；入队立刻返回 handle
```

- **同一实例的未启动 `move` 被新任务替换**：用户拖 A 到仓库又改拖到猎人，意图是最终位置，
  发两个请求是浪费且危险。已在途的不打断（HTTP 发出去就收不回）。
- `cancel()`：排队阶段从队列移除；在途阶段 abort 现有 `AbortController`。
- **`busy` = 队列非空**（在途或排队），不再是单请求标志。
- 回执：排队时 detail 写「排队中（前面 N 项）」，启动时换成「正在处理…」。
- 失败不阻塞后续任务。

### 3. 把已知位置显式传下去（修 D1）

`ActionRequest` 的 `move` 增加 **必填** `from: string`（客户端手里的当前 `locationKey`）。

`runItemWrite` 存仓分支不再从快照猜：

```
mover = idOf(write.from)        // 缺 from 直接报错，不静默退回快照
```

快照只用来取 `itemHash`（它不随位置变）。

**这是破坏性线格式变更**，提交标题要点名。理由：`from` 本来就是客户端确定的事实，
现在由 host 从可能过期的缓存里重新猜一遍 —— 正是 AGENTS.md §0.5「不许替调用方下结论」。

`lock` / `pull_postmaster` 的 `activeCharacter()` 回退**保留**：那两件确实可能不带角色，
DIM 也是取当前角色，不是猜。

### 4. host 串行：`src/host/serialize-writes.ts`（新文件，~30 行）

`/action` 用一个 promise 链把 `service.write` 包起来，保证一次只跑一个。

目的不是兜客户端队列的底，是**数据面的契约**：多标签页、以后同一条路上的调用方，
都不会让两次写交错；journal 的顺序等于真实发生顺序。

### 5. 测试（每条都要注入违规确认变红）

| 文件 | 断言 |
|---|---|
| `tests/write-queue.test.ts` | 串行不交错；同实例未启动 move 被替换；`cancel` 移出队列；前一项失败后续照跑 |
| `tests/serialize-writes.test.ts` | 并发 3 次调用，`client.post` 的进入顺序不交错 |
| `tests/item-write.test.ts`（增补） | `from` 决定 banking 的 mover；缺 `from` 报明确错误 |
| `tests/architecture.test.ts` | 两个新文件注册 ceiling；`InventoryPanel` ceiling 不动 |

## 四、不动的东西

- 不加 `pending: 'queued'` —— `applying` 已经表示"在流程里"，省一次线格式变更
- 不做重试、不做批量选择（那是待办 4）、不做跨会话持久队列
- 不抬任何行数上限

## 五、验收（可判定）

1. `pnpm test` 全绿，`pnpm typecheck` 干净
2. 注入违规（去掉串行 / 改回快照猜 owner）能让对应测试变红
3. 真机：连拖同一件「仓库 → 猎人 → 仓库」，journal 两条顺序正确、最终位置与游戏里一致
4. 真机：连续拖 5 件不同物品进仓库，回执逐条出现、无并发报错
5. 眼睛：排队中的回执文案与 `applying` 环看起来不冲突

## 六、真机验证（2026-11-06 01:47–01:53）

直接对 `/action` 发真实写请求（面板做的是同一件事），不经过界面。

| 验的 | 结果 |
|---|---|
| 同一物品来回（仓库 → 泰坦 → 仓库），两笔紧邻 | 两笔都成功；第二笔存仓时用 `from=titan` 解析出去向角色，快照此时说的还是旧位置 |
| 5 个并发请求 | 严格串行：journal 记的 `at` 间隔 600–700ms，顺序 = 真实顺序 |
| journal 的 `from` | 从角色 id（`2305843009679355779`）变成位置键（`hunter` / `vault` / `titan`） |
| 失败各自返回 | 仓库满的 3 件各自拿到 `DestinyNoRoomInDestination`，没有串话 |

### 撞出来的两件事（都已改）

1. **`/item-state` 一直是坏的**。`Destiny2/.../Item/{id}/` 实测只回 `instance`
   （组件数据），**从不回 `characterId`**，所以每次回读都判定"物品不在了"，面板就一直
   信自己的乐观位置。改成从**强制刷新的 profile** 里读，`readItemState` 整个删掉。
2. **串行把每笔写推慢了**。原来每笔写完 `invalidate()` 清缓存，下一笔为了拿 `itemHash`
   又得重拉 1.5 秒的 profile。而写只需要两样东西：物品 hash 和角色表，**两者都不随移动变**。
   抽了 `SnapshotCache` 三态（fresh / stale / 写时直读陈旧），写路径不再付这笔钱。

对应地补了四条守门：`item-state` 的位置翻译、`BridgeFault` → 400/404/401 的状态码、
快照三态、以及原来的三条串行注入。

# 本地缓存（P2）：让面板打开就有内容

2026-11-07。**设计稿，未实施。** 起因：「DIM 刷新之后立刻能看到，我们做不到；刷新按钮点了没反应」。

## 一、先摆数字

同一个账号，同一天实测：

| 什么 | 耗时 |
|---|---|
| Bungie 自己的 `GetProfile`（连打三次） | 7.3s · 3.7s · **14.7s** |
| 我们的 `/inventory?refresh=1`（连打五次） | 2.6s · 0.63s · 0.80s · 0.79s · 0.76s |
| 我们的 `/inventory`（走 30 秒缓存） | **0.04s** |
| `/inventory` 响应体 | 1.3 MB / 1924 件 |

两件事必须说清楚：

1. **慢的是上游，不是我们的代码。** `refresh=1` 确实穿透到了 `reload()`，每一层都对。
   Bungie 在 0.6 秒到 15 秒之间随机，我们每次刷新都在赌。
2. **刷新这件事本身不会变快。** 想看新数据就得问 Bungie，问就要等。这一层没有优化空间，
   任何声称"让刷新变快"的方案都是在骗人。

那 DIM 为什么"立刻"？因为它**不等**。

## 二、DIM 做对了什么

它不是网络比我们快——它也要等那一次 `GetProfile`。它做的是：

- 浏览器 IndexedDB 里存着上一次的完整清单；
- 打开页面先把缓存画出来（0 等待），Bungie 的回应到了再悄悄换掉；
- 写入时乐观更新（这一条我们已经有了）。

我们缺的只有前两条。

## 三、现在这条链路

```
浏览器 ──→ host 内存缓存（30 秒） ──→ Bungie（0.6–15 秒）
```

- 缓存命中：0.04 秒，快到看不出来
- 点刷新（`force`）：绕过缓存，直接等上游
- 宿主刚启动：缓存是空的，**第一次打开面板就是 7.8 秒**，而且是白屏等

## 四、方案：只加一层浏览器缓存

```
浏览器 ──→ IndexedDB（0 ms，上次的完整清单）      ← 新增
       ──→ host 内存缓存（30 秒）
       ──→ Bungie（0.6–15 秒）
```

**为什么只加一层**：IndexedDB 在浏览器里，宿主重启它还在。所以"冷启动 7.8 秒白屏"和
"换页面等一次"这两个问题它是同时解决的，不需要再往 host 磁盘写一份快照。

### P2.1 · `src/client/snapshot-db.ts`

**缓存键必须带账号。** 一个固定 key（`inventory-snapshot`）会让切换账号后短暂看到别人的库存——这是不能接受的，所以键是 `membershipType:membershipId`：

```ts
export interface AccountKey { membershipType: number; membershipId: string }
export function cacheKey(account: AccountKey): string
export function readSnapshot(account: AccountKey): Promise<InventorySnapshot | null>
export function writeSnapshot(account: AccountKey, snapshot: InventorySnapshot): void
```

记录本身：

```ts
interface Cached { schema: number; account: AccountKey; snapshot: InventorySnapshot }
```

六条规矩：

1. **读失败一律当没有。** 形状变了、库被清了、浏览器不给权限——都退回现在的行为，不抛错。
2. **写失败静默，但不许产生未处理的 rejection。** 整个 `writeSnapshot` 包在 try 与 `.catch()` 里。
3. **带 schema 号。** `ItemRow` 形状变更时旧缓存直接作废，不做迁移（本仓一贯做法：不留兼容层）。
4. **读出来的东西要过完整性检查**：`fetchedAt` 是有限数、`items` 是数组、`total` 是数字、`account` 与请求的键一致。任何一条不满足就当没有。
5. **只写成功的结果。** 失败的请求不许覆盖上一份好的缓存。
6. **`fetchedAt` 原样保存，不许在读取或展示时重新生成。** 它表示数据是什么时候从 Bungie 读到的，一旦被"刷新成现在"，缓存就再也说不清自己有多旧。

### P2.2 · `load()` 改成两段

**先问账号，再画缓存。** 不能"先画一份不认识的缓存、回来再校验"——那一秒里显示的就是别人的库存。

冷启动的路径（数字是实测）：

```
GET /account（只读 membership，0.66–1.01 秒，host 有内存缓存时 0）
      ↓ 拿到 membershipType + membershipId
读 IndexedDB 对应账号那一条（~10 ms）
      ↓ 有就画，没有就空着等
GET /inventory（0.6–15 秒）
      ↓ 到了覆盖，并写回缓存
```

`/account` 是新增的只读路由：**只调 `currentMembership()`，绝不读 profile**。`/characters` 不能用——
它内部走 `currentSnapshot()`，冷启动一样要等 7 秒。

#### 缓存只能展示，不能核验

这是 P2 与 P1 的接缝，也是这份设计最容易被写错的地方：

| 数据 | 能显示 | 能确认 Pending |
|---|---|---|
| IndexedDB 里的快照 | ✅ | ❌ |
| 本次 `/inventory` 的响应 | ✅ | ✅（受 `startedAt` 约束） |

一份缓存可能是十分钟前的。如果把它交给 `compareSnapshot → reconcile`，它会被当成一次**新观测**，
去确认或否掉用户刚做的操作——这正是 P1 里 `startedAt` 要防的东西，只是换了个来源。

所以两段路径**只有第二段调用 `reconcile`**：

```
缓存  → applyOverlay（叠上未核验的意图）→ 上屏
      ✗ 不调 reconcile  ✗ 不产生 transition  ✗ 不改 Pending 状态

网络  → compareSnapshot → reconcile → applyOverlay → 上屏 → 写缓存
```

#### 请求代次

多次刷新会并发，而且**慢的那次可能最后回来**：

```
Load A 发起（10 秒）→ Load B 发起（2 秒）→ B 完成并上屏 → A 完成，把界面退回旧数据
```

所以每次 load 拿一个递增的 `loadId`，只有自己仍是最新那次才允许写 UI 和写缓存。

### P2.2 附 · 账号身份端点

`GET <routePath>/account` → `{ membershipType, membershipId, displayName }`。
只读 `currentMembership()`（走它自己的 TTL 缓存），不读 profile。这是 P2.2 唯一需要的 host 改动。

### P2.3 · 时间戳改用数据自己的 `fetchedAt`

响应里本来就有 `fetchedAt`（host 读 profile 的时刻）。现在工具栏显示的是**点击时刻**，
那说明不了数据有多旧——一份 20 秒前的缓存也会显示"刚刚更新"。

改成 `fetchedAt`，并且**用文字说清，不只靠颜色**：

| 数据年龄 | 工具栏显示 |
|---|---|
| < 60 秒 | `刚刚更新` |
| 1–5 分钟 | `2 分钟前更新` |
| > 5 分钟 | `15 分钟前更新 · 较旧` |
| 正在显示缓存、网络未回 | `本地缓存 · 15 分钟前` |

## 五、P2.4 · 上游超时与等待提示

`src/bungie/client.ts` 目前**没有任何超时**。Bungie 如果真的挂住（14.7 秒已经出现过），
请求就一直挂着，前端也就一直转圈。

- **读**请求加 20 秒上限：超时是一条明确的失败，不是无限等待。**20 秒是工程初值，不是性能指标**——
  目前只有几个样本，算不出 P95/P99，等有真实分布再调。
- 前端等待 5 秒后把文案换成「Bungie 响应较慢，仍在等待…」。**不写"通常 3–15 秒"**：那几个数不是 SLA，
  而且用户已经等了 5 秒，再告诉他"通常要 3–15 秒"只会更困惑。
- 超过 20 秒：「获取库存超时，当前保留上次的数据。」

**超时只作用于读。** 写请求超时意味着 Bungie 可能已经执行、只是响应没回来，必须继续走
`unclear → verifying`（见 `PLAN-CONSISTENCY-LAYER.md` 的失败分类）。给客户端加超时时不能顺手把它
变成"写失败"，那会把一次可能的成功判成失败。

## 六、这轮不做的

| 不做 | 为什么 |
|---|---|
| 让刷新本身变快 | 上游就那样，做不到。能做的是让等待可解释 |
| host 侧磁盘快照 | IndexedDB 已经覆盖冷启动，两份缓存只会多一个会漂的副本 |
| 增量 diff 更新 UI | React 整体重渲染 1924 格的成本还没量过；先确认它是瓶颈再说 |
| 后台自动轮询刷新 | 会持续吃限流配额，且和 overlay 的核验窗口打架（见 PLAN-CONSISTENCY-LAYER） |
| 「哪几件变了」的差量提示 | 有 journal 能做，但用户没提，先不做 |

## 六点五、实施顺序

| 阶段 | 内容 | 独立可回滚 |
|---|---|---|
| P2.1 | `snapshot-db.ts`：账号键、schema、完整性校验、失败降级 | 纯新增文件，没人调用 |
| P2.2 | `/account` 路由 + 两段加载 + 缓存不核验 + loadId | 接上才有效果 |
| P2.3 | `fetchedAt` 上屏、数据年龄文案 | 纯展示 |
| P2.4 | 读超时 + 等待文案 | 独立 |

## 七、验收

| 场景 | 期望 |
|---|---|
| 宿主重启后第一次打开面板 | 先看到上次的列表（≤0.2 秒），再在后台更新 |
| 数据是旧的 | 时间戳显示真实抓取时刻，超过 60 秒有"较旧"提示 |
| 点刷新，上游很快（<2 秒） | 「刷新中…」→ 新数据 + 新时间戳 |
| 点刷新，上游很慢（>5 秒） | 文案变成「Bungie 响应较慢」，不假装已完成 |
| 上游挂死 | 20 秒后明确失败，界面保留旧数据 |
| 缓存形状过期 | 当作没有缓存，正常加载，不报错 |
| **切换 Bungie 账号** | 绝不显示另一个账号的缓存（键不同，读不到） |
| **缓存里有未确认操作的旧位置** | Overlay 仍然优先：缓存只负责画，不确认也不否决 Pending |
| **两次刷新乱序完成** | 旧的那次不许覆盖新的（`loadId` 已过期就丢弃） |
| **IndexedDB 写入失败** | 本次展示不受影响，也不覆盖之前那份好缓存 |

## 八、风险

1. **陈旧数据上屏。** 打开面板的一瞬间可能显示几分钟前的位置。靠 `fetchedAt` 和"较旧"标记
   如实告知，不用它冒充最新。
2. **IndexedDB 在 DSH 的页面里可能被清。** 清了就退回今天的行为，不会更差。
3. **与 overlay 的关系要说清**：缓存画出来之后，`applyOverlay` 仍然叠在上面——
   未核验的操作仍然优先于缓存里的旧位置。

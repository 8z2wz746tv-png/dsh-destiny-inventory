# Agent View 的数据契约

2026-11-10 起草。**设计稿，未实施。** 基线 `8fc57a0`。

上一轮审查的结论是：系统已经能区分部分状态来源，但还不能把这些来源完整地传给消费者。
Agent 现在拿到的是 `effective`——一个渲染结果，被当成事实。

这份文档只回答三个问题，答完再谈接口怎么改。

## 零、一个先决事实（查出来的）

`InventoryPanel` 里 `state.snapshot.items` **是叠过 overlay 的行**：`load-inventory` 写进 state 之前
就调了 `applyOverlay`，而 `patchRows`（`confirmMove`/`applyMove`）又直接改这个数组。

**客户端没有保留未叠 overlay 的原始观测。**

所以"让 Agent 读 observed"这句话，今天做不到——不是接口没改，是那份数据已经被就地覆盖了。
任何契约的第一步都得是**把两个投影分开存放**，否则后面全是在渲染结果上做推断。

## 一、Agent View 从哪个可信数据源构建

不是从 `ItemRow`。也不是从 `snapshot.items`（理由见上）。

三个来源各归各家：

| 字段 | 唯一来源 | 现在在哪 |
|---|---|---|
| `observed` | Bungie 快照，**未经 overlay** | 需要在客户端留存一份原始行 |
| `observedAt` | `snapshot.fetchedAt` | 已有 |
| `pending` | `PendingOps`（只在浏览器内存里） | 已有 |
| `rollback` | 行的 `pending === 'unconfirmed'` **且** `PendingOps` 里没有该物品的操作 | 可判定，见下 |

**`rollback` 怎么被认出来**（这是现有数据能做到的，不需要新字段）：

```
有 op          → 那格的不确定来自 pending
无 op 但行带 unconfirmed → 那格的不确定来自一次失败的回滚
```

`applyOverlay` 只对有 op 的物品写标记，`confirmMove(..., 'rollback')` 只对没 op 的物品写标记。
两者不会同时成立，所以这个判据是**互斥且完备**的。

> 这条要落成测试：**构造"有 op 且行带 unconfirmed"的状态，断言它被判成 pending 而不是 rollback。**
> 现在造不出来（`applyOverlay` 会覆盖），但契约一旦写下来，将来就有人能造出来。

## 二、observed / pending / rollback 如何分别传输

**分开传，不在 Host 端重新拼。**

```
客户端                           Host                    Agent
──────────────────────────────────────────────────────────────
原始行（未叠 overlay）  ─┐
PendingOps             ─┼→  ItemStateView  ────→  ctx.tools 的读数
rollback 推导          ─┘      （三者各一栏）
```

```ts
interface ItemStateView {
  instanceId: string
  /** Bungie 单次观测。不是"当前位置"，是"某次读到了这里"。 */
  observed: string
  observedAt: number
  /** 用户要求它去哪、什么时候要求的、核验到哪一步了。没有就是没有。 */
  pending?: { target: string; submittedAt: number; status: PendingStatus }
  /** 一次失败的回滚留下的显示位置。**没有可用的 journal 关联标识，不许编。** */
  rollback?: { location: string }
}
```

**`effective` 不在这份结构里。**

不是因为它没用，是因为它**能被算出来**：`pending > rollback > observed` 是纯函数。
需要渲染位置的消费者（格子）在客户端自己算；需要事实的消费者（Agent）拿到的是三个来源，
它想算也能算，但它更应该说清楚自己看到的是哪一栏。

**这一条是关键**：一旦 `effective` 出现在契约里，就一定会有人把它当答案。
上一轮的 bug 不是有人算错了 `effective`，是**它被放进了本该只装事实的位置**。

## 三、Agent 如何区分事实、意图和历史

三类信息，三种说法：

| 类别 | 说什么 | 不说什么 |
|---|---|---|
| **事实** | 「Bungie 最近一次观测到它在 X」（+ 什么时候） | 不说"它在 X"——省掉"最近一次观测"就把一次读数变成了结论 |
| **意图** | 「有一项目标为 Y 的移动，尚未核验」 | 不说"正在移到 Y"——那是断言它会发生 |
| **回滚** | 「界面上一次移动失败后停在了 Z，未确认」 | 不说"它在 Z"，也**不说是哪次失败**（没有关联标识） |
| **历史** | 通过 journal 工具查，带时间和结果 | 不主动塞进位置回答里 |

**回答顺序，按用户问什么**：

| 问 | 答 |
|---|---|
| 「我的枪在哪」 | observed（带时间）+ 当前 pending（如果有） |
| 同一件还有 rollback | 上面那句之外补一句「界面还停在一个未确认的位置 Z，来自一次失败的回滚」 |
| 「刚才发生了什么」 | 查 journal，讲操作与结果，**位置仍回到 observed** |
| 没有可靠关联的 rollback | 明说「无法确定它对应哪一次失败」 |

### 那个三者并存的例子

```
observed = vault（5 分钟前）
rollback = hunter（一次失败留下的）
pending  = warlock（10 秒前提交，未核验）
```

Agent 该说：

> Bungie 最近一次观测（5 分钟前）显示它在仓库。之后有一项目标为术士的移动还没核验。
> 界面上另外停着一个未确认的位置（猎人），来自一次失败的回滚。

**不是**「它在术士」，**也不是**「它在仓库，但界面显示术士，还有过一次失败的猎人」——
后者把三件事揉成一句，听的人分不清哪句是事实。

## 四、这不要求改 ItemRow

两个投影，两个用途：

```
                Canonical State（客户端内存里的三份来源）
                    │                      │
        Rendering Projection       Agent Projection
                    │                      │
              ItemRow（格子）      ItemStateView（ctx.tools）
```

`ItemRow` 保持不变，继续只管"这一格画在哪儿、要不要戴环"。
`ItemStateView` 是**新的一份**，从同一批来源组装，不经过 `ItemRow`。

这也意味着**`view-reporter` 要改**：它现在报 `picked.locationKey`，
改之后报 `ItemStateView`——而 `picked` 本身还得留着（agent 需要知道用户点了哪一件）。

## 五、接口要动什么（实施时）

| 位置 | 改动 | 破坏性 |
|---|---|---|
| `load-inventory` | 不把 `applyOverlay` 的结果写进 state | 是 |
| `InventoryPanel` | 渲染时算 `applyOverlay`，state 留原始行 | 是 |
| `view-reporter` | `selected.location` → `ItemStateView` | 是（`ReportedView`） |
| `context-store` | 存 `ItemStateView`，不存位置字符串 | 是 |
| `agent-tools` | 描述里写清三栏各是什么 | 否（只是提示词） |

**不动**：`ItemRow`、`PendingOps`、`applyOverlay` 的规则、任何写路径。

## 六、这轮不做

- 不加 Agent 工具。位置信息已经在 view 里，先把 view 报对。
- 不给 `rollback` 编 journal 关联。没有标识就是没有，猜出来的因果比没有更坏。
- 不做 Context Builder 的单独改造。它读 view，view 对了它就对了。

## 七、验收（实施后）

| 场景 | 期望 |
|---|---|
| 拖一件未核验，问 agent 在哪 | 答 observed + pending，不答 effective |
| 写入被拒后问 agent | 答 observed，并说明有个未确认的回滚位置 |
| 同一件同时有 pending 和 rollback | 两件事分开说，不合并成一句 |
| 追问刚才的操作 | journal 答，位置仍回到 observed |
| 行带 `unconfirmed` 且有 op | 判成 pending，不是 rollback |

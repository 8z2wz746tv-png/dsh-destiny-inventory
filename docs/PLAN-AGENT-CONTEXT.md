# P3：让界面上的操作进 agent 上下文

写于 2026-11-06。目标：这个面板不是"另一个 DIM"，是**给 agent 供料的手**。

## 一句话

用户在界面上做的每一件事（筛选、选中、拖拽、装备、锁定），都变成 agent 下一轮能直接读到的**事实**，而不是要靠他去问"你刚才干了什么"。

## DSH 提供的两条路（已确认可用）

`dsh-base` 里带了 `@deepseek-ai/dsh-system-prompt`（`cordis.patch.yml:503`），它有两种贡献：

| 机制 | 形态 | 适合 |
|---|---|---|
| `ctx.systemPrompt.section()` | **静态**文本，进系统提示词 | 工具用法说明、"这个插件是什么" |
| `ctx.systemPrompt.context()` | **动态**快照，进模型历史的 **user 角色消息** | 用户当前状态、最近操作 |

文档原话：*"上下文在循环下成为模型历史中带来源的 user 角色快照"*。

**我们要的是第二种**。上下文 provider 每次组装时被重新读取，所以状态变了就自动反映，不用手动推消息。

## 上下文存什么

宿主半维护一份 `ContextStore`：

```ts
interface SessionContext {
  /** 当前筛选：搜索词、分类、锁定、排序、分组。 */
  filters: { search: string; category: string; lock: string; sort: string }
  /** 选中的物品，最多一件——选中是"我在看这个"的信号。 */
  selected: { id: string; name: string; type: string; rarity: string; power: number | null } | null
  /** 最近 8 条写入，新的在前。 */
  actions: ActionRecord[]
  /** 快照时间与件数，让 agent 知道数据新不新。 */
  snapshot: { at: number; items: number }
}

interface ActionRecord {
  at: number
  /** 谁发起的：界面拖拽，还是回读时发现是别人做的。 */
  source: 'ui' | 'agent-detected'
  kind: 'move' | 'equip' | 'lock' | 'pull_postmaster'
  item: { id: string; name: string }
  /** 一句话结果，例如「已存入仓库」或「Bungie 拒绝了：…」。 */
  outcome: string
  ok: boolean
}
```

**不存**：完整物品列表（那是工具的事）、perk 细节、悬停过的每一件（只有"选中"有意义）。

## 两条通道

### 1. 自动（`ctx.systemPrompt.context`）

每次模型调用前组装，只有当**内容变了**才更新。渲染成一段紧凑文本：

```
[命运仓库 · 界面状态]
筛选：武器 / 未锁定 / 按光等 / 按类型分组 · 搜索「快速」
选中：快速拔枪（手炮·传说·550）
最近操作：
  1 分钟前 移到仓库「英勇利刃」→ 已存入仓库
  3 分钟前 装备「星火协议」→ 已装备
快照：1924 件，2 分钟前读取
```

约 120 字。**不渲染就不推**——用户不动，上下文不变，历史里不会堆重复。

### 2. 按需（两个工具）

```ts
ctx.tools.register(defineTool({
  name: 'destiny_context',
  description: '这个仓库面板现在的状态：筛选、选中、最近的写入。用户说「我刚拖的那件」时先用它。',
  parameters: {},
  output: { schema: { type: 'json' }, render: (_, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
  execute: () => store.read(),
}))

ctx.tools.register(defineTool({
  name: 'destiny_actions',
  description: '最近的写入流水，含失败原因。查「刚才那次为什么失败」用它。',
  parameters: { limit: { type: 'number', description: '条数，默认 10，最多 50' } },
  output: { schema: { type: 'json' }, render: ... },
  execute: ({ limit }) => store.recent(Math.min(limit ?? 10, 50)),
}))
```

**只读**。写操作仍然只有界面能做——这条边界不破。

## 浏览器怎么把状态送上来

宿主已有 `/action` 的 POST 通道，加一个 `/context`：

```
POST /context  { filters, selected }
```

规则：
- **节流 200 ms**（打字时不要每次按键都发）
- **只在变化时发**（前端比对上一次的快照）
- **载荷 < 2 KB**（只发上面那几个字段，不发物品列表）

写入流水**不需要前端推**——`/action` 成功/失败时宿主自己记。

## `agent-detected` 从哪来

计划 §3.3 要的另一种来源：agent 通过 MCP 改了东西，前端不知情。

实现：`/inventory` 返回时，把新快照与本地记录比对——
- 某件物品的 `locationKey` 变了，但最近 30 秒内没有对应的 `ui` 记录
- → 记一条 `source: 'agent-detected'`，不弹回执（不是用户干的，不该打扰他）

这让 agent 问"我刚改了 3 件，界面看到了吗"时有据可查。

## 不做的

- **不做**"把每件悬停过的物品都记下来"。悬停是浏览噪声，选中才是意图。
- **不做**双向：agent 不能通过这个通道反过来控制界面。**看，不动。**
- **不做**独立数据库。内存即可，进程退出就没了——这些是会话状态，不是用户资产。

## 验收

1. 拖一件武器到仓库 → 下一轮问 agent「我刚做了什么」，他不查工具也能答对（自动上下文里有）
2. 问「我刚才那次为什么失败」→ agent 调 `destiny_actions`，能念出上游原因
3. 什么都不做，连续发三条消息 → 系统提示词里那段**不重复出现**（内容没变）
4. 打字搜索时，`/context` 请求数 ≤ 每秒 5 次（节流生效）
5. agent 通过 MCP 移动一件 → 界面回读后出现 `source: 'agent-detected'` 的记录

## 与 STATUS.md 的关系

这是 `PLAN-SELF-HOSTED-DIM.md` 的 P3。做完它，这个项目才从"DIM 替代品"变成"给 agent 供料的界面"。

顺序：**先做本方案的自动上下文 + 两个工具**（这是核心），`agent-detected` 检测可以后补。

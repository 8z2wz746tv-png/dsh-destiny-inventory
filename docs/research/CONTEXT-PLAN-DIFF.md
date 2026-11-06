# 新方案 vs 最初计划：逐条对账

对比对象：
- **原**：`docs/plans/PLAN-SELF-HOSTED-DIM.md` §4（上下文面），2026-11-04 冻结
- **新**：`docs/plans/PLAN-AGENT-CONTEXT.md`，2026-11-06 写

结论先说：**新方案偏离了原计划三处、漏了两处、新增一处**。下面逐条列，能对回去的改回去。

## 一、对不上的（该改回原计划）

### 1. 工具名

| 原 | 新 | 处理 |
|---|---|---|
| `destiny_workspace_view()` | `destiny_context()` | **改回原名** |
| `destiny_workspace_journal({limit})` | `destiny_actions({limit})` | **改回原名** |

原计划的名字带 `workspace`，能立刻看出"这是那个面板的状态"；我起的名字太泛，DSH 里还有别的 `context`/`actions` 概念。

### 2. journal 的容量与落盘

**原计划**：

> `Journal`：环形 **200 条** —— 时间、动作、物品（id/hash/名）、from→to、结果（ok/failed/**rolledback**）、source。
> 落盘：`~/.dsh/destiny-workspace/journal.jsonl`（追加写，保留最近 200 条），便于排查；**内存里是唯一真源**。

**新方案**：内存 8 条，上下文渲染 8 条，工具上限 50，**不落盘**。

**三处退步**：

- 容量 200 → 8。我把"渲染进上下文的条数"和"journal 保留的条数"混成了一件事。**应该分开**：journal 存 200，上下文只渲染最近 3 条。
- **落盘没了**。原计划写得很明确"便于排查"。Bungie 有 3–10 秒的写后同步窗口，真出问题时"到底发没发出去"只能靠这份流水回看。**该恢复**。
- `from → to` 丢了。原计划要求记录"从哪到哪"，我只存了一句 `outcome` 文本。**这是信息损失**——agent 问"他刚把它拖到哪了"，文本里可能没有。

### 3. persona 里那句话

**原计划**：

> preset 的 persona 写一句："用户说'这件/刚才那件/我刚拖的'时，先调 `destiny_workspace_view` / `destiny_workspace_journal`，不要反问。"

**新方案**：没写。

**这条是关键**：工具注册了不等于 agent 会用。没有这句，用户说"我刚拖的那件呢"，agent 还是会问"你拖的是哪件？"。**必须补**。

## 二、漏掉的（原计划有，新方案没提）

### 4. 专用预设（原 §4.3 整节）

**原计划**：

> `~/.dsh/.agent-presets/destiny/`：`preset.yml`（name: 命运随航）、`agent.cordis.yml` —— 只挂 `dsh-persona`、`dsh-skill-filesystem` + `dsh-tool-skill`（技能 `destiny2-mcp`、`destiny2-render`）、计划/压缩分组；**不挂** `tool-bash`、`tool-pwsh`、`tool-fs-search`。

**新方案**：完全没提。

**这是"专门模式"的实现**——随航 agent 不需要 bash，不该让它能开终端。**该补**。

### 5. ViewContext 的两个字段

| 原 | 新 | 差别 |
|---|---|---|
| 当前**角色** | 没有 | 用户切到术士看装备，agent 该知道 |
| **最近一次拖拽的落点** | 没有（只有 journal） | 拖拽中途（还没落定）时，这是唯一线索 |

另：原计划把"排序"和"筛选"并列为字段，我把它们塞进了 `filters` 里——这个不算偏离，只是组织方式不同。

## 三、新增的（原计划没有，我认为该加）

### 6. 自动上下文（`ctx.systemPrompt.context`）

**原计划**：只有两个工具，靠 agent **主动调**。

**新方案**：加一条自动注入的动态上下文，渲染成模型历史里的 user 消息。

**为什么加**：我查了 DSH 的 `dsh-system-prompt`（`dsh-base` 自带），它的 `context()` 贡献会变成"带来源的 user 角色快照"，每次组装重新读取。这意味着**用户一拖完，下一条消息里 agent 就已经知道**，不用等它想起来调工具。

**这是原计划写的时候不知道的机制**——原计划只有"工具"这一条路。我判断这个新增是对的，但它**改变了上下文面的性质**：从"agent 主动查"变成"一半自动、一半主动"。所以要在这份对账里显式记一笔。

**风险**：注入太多会污染上下文。我的约束是"内容不变就不推"，但这需要实测。

## 四、还有一处更早的矛盾（`archive/docs/STATUS.md` 里记过，这里重申）

原计划 §3.2 要的是"**先本地乐观改，失败按快照回滚**"，还写了"与 DIM 的刻意差异（必须做）"。

实际实现是 DIM 的做法：**等成功再改**。所以：

- journal 里永远不会有 `rolledback` 状态（原计划的三种结果之一）
- 用户拖完到界面变化之间有一个 RTT 的空档

**要么改代码补乐观+回滚，要么改计划承认这个差异。** 现在两份文档各说各的。

## 五、改完之后的清单

| # | 项 | 动作 |
|---|---|---|
| 1 | 工具名 | 改回 `destiny_workspace_view` / `destiny_workspace_journal` |
| 2 | journal 容量 | 200 条（分开：上下文渲染 3 条，工具可查 200） |
| 3 | journal 落盘 | `~/.dsh/destiny-workspace/journal.jsonl` |
| 4 | journal 字段 | 补 `from → to`、`rolledback`（等乐观更新做了才有） |
| 5 | persona | 补那句话 |
| 6 | 专用预设 | 按 §4.3 建 |
| 7 | ViewContext | 补「当前角色」「最近拖拽落点」 |
| 8 | 自动上下文 | **保留**，标注为计划外新增 |
| 9 | 乐观/回滚 | 二选一：改代码，或改计划 |

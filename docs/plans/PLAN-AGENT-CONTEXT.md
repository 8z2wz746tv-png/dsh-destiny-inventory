# P3：让界面上的操作进 agent 上下文（按原计划规格重写）

2026-11-06 第二版。第一版偏离了 `docs/plans/PLAN-SELF-HOSTED-DIM.md` §4，`docs/research/CONTEXT-PLAN-DIFF.md` 里已对账。
这一版把偏离的地方改回去了，唯一保留的新增是"自动上下文"。

## 一句话

界面上的每一件事（筛选、选中、拖拽、装备、锁定）都变成 agent 下一轮能直接读到的事实。

## 沿用原计划的部分（不改名、不缩水）

### ViewContext —— 原样

```ts
interface ViewContext {
  /** 当前角色（hunter/warlock/titan），用户切了就该反映。 */
  character: string
  filters: { search: string; category: string; lock: string; sort: string }
  selected: { instanceId: string; hash: number; name: string; location: string } | null
  /** 最近一次拖拽的落点，拖拽中途也有值。 */
  lastDropTarget: string | null
}
```

### Journal —— 原样

环形 **200 条**，字段照原计划：

```ts
interface JournalEntry {
  at: number
  action: 'move' | 'equip' | 'lock' | 'pull_postmaster'
  item: { instanceId: string; hash: number; name: string }
  /** 结构化，不是一句话。 */
  from: string | null
  to: string | null
  result: 'ok' | 'failed' | 'unconfirmed'
  source: 'ui' | 'agent-detected'
  /** 失败原因原文，成功时为空。 */
  detail: string
}
```

**落盘**：`~/.dsh/destiny-workspace/journal.jsonl`，追加写，保留最近 200 条。内存仍是唯一真源，落盘只为排查。

`result` 只有 `ok | failed`。原计划的第三个是 `rolledback`，不做回滚之后换成了 `unconfirmed`，
但**那个值从来没被写过**：写入失败时前端会单件回读，拿到答案后它会 `POST /journal/resolve`，
宿主把那一条补上 `resolution: { at, landed, location }`。这比 `unconfirmed` 诚实——它说的是
"上游拒绝了，但东西真的到那儿了"，而不是"不知道"。2026-11-06 补上，`unconfirmed` 已删。

### 两个工具 —— 原名

```ts
destiny_workspace_view()            // 当前视图快照
destiny_workspace_journal({limit})  // 最近操作流水，默认 20，最多 200
```

### 专用预设 —— 原样（§4.3）

`~/.dsh/.agent-presets/destiny/`：

- `preset.yml`：`name: 命运随航`
- `agent.cordis.yml`：只挂 `dsh-persona`、`dsh-skill-filesystem` + `dsh-tool-skill`（技能 `destiny2-mcp`、`destiny2-render`）、计划/压缩分组；**不挂** `tool-bash`、`tool-pwsh`、`tool-fs-search`

### persona 那句话 —— 原样

> 用户说"这件/刚才那件/我刚拖的"时，先调 `destiny_workspace_view` / `destiny_workspace_journal`，不要反问。

## 唯一的新增：自动上下文

原计划只有"agent 主动调工具"。加一条自动注入：

`ctx.systemPrompt.context()` 的贡献会变成**模型历史里带来源的 user 角色快照**，每次组装重新读取。所以用户一拖完，**下一条消息里 agent 就已经知道**，不用等它想起来调工具。

渲染格式（约 120 字，**内容没变就不重新推送**）：

```
[命运仓库] 猎人 · 武器/未锁定/按光等 · 搜索「快速」
选中：快速拔枪（手炮·传说·550）
最近：1 分钟前 英勇利刃 → 仓库 · 成功
     3 分钟前 星火协议 → 装备 · 成功
快照 1924 件，2 分钟前
```

**为什么敢加**：查过 `dsh-base` 自带 `@deepseek-ai/dsh-system-prompt`（`cordis.patch.yml:503`），机制可用。**为什么只给 3 条**：上下文里放 200 条会淹没对话；200 条留给工具查。

## 数据流

```
浏览器 ──POST /context（节流 200ms，仅变化时）──→ 宿主 ViewContext
界面写入 ──/action───────────→ 宿主 Journal（自动记，不用前端推）
                                    ↓
              ctx.systemPrompt.context 每次组装读取
                                    ↓
                        模型历史里的 user 快照（仅变化时）
```

`agent-detected`：`/inventory` 返回时比对——某件物品位置变了但最近 30 秒没有 `ui` 记录 → 记一条 `agent-detected`，**不弹回执**。

## 实现顺序

1. `src/host/context-store.ts` —— ViewContext + Journal + jsonl 追加写
2. `/context` POST 端点（节流由前端做）
3. `/action` 成功后记 journal（含 `from`/`to`）
4. `src/host/agent-tools.ts` —— 两个 `ctx.tools.register`
5. `src/host/prompt-context.ts` —— `ctx.systemPrompt.context` 贡献
6. 预设目录（`~/.dsh/.agent-presets/destiny/`）
7. `agent-detected` 检测（最后做）

## 验收

1. 拖一件 → 下一轮问「我刚做了什么」，agent **不调工具**就能答（自动上下文里有）
2. 问「刚才那次为什么失败」→ 调 `destiny_workspace_journal`，念出 `detail` 原文
3. 什么都不做连发三条 → 那段**不重复出现**
4. 打字时 `/context` ≤ 每秒 5 次
5. `~/.dsh/destiny-workspace/journal.jsonl` 里有记录，重启后还在
6. agent 通过 MCP 改东西 → 出现 `source: 'agent-detected'` 的记录

## 边界

- agent **只能看，不能驱动界面**。写操作只有界面能做。
- 悬停不记（浏览噪声），只记选中。
- journal 不进数据库，就是追加写的 jsonl。

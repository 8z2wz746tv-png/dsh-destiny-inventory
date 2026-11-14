# 随航 Agent 的现状与未决问题

写于 2026-11-14，基线 `feat/consistency-p1` @ `1e05280`。

**这份文档答一个问题**：随航浮窗现在能用什么、哪些是假的、卡在哪。
`docs/HANDOFF.md` 停在 v0.48.0，不含 A2–A8 的任何内容；两者冲突时以本文为准。

---

## 一、它现在是什么

一个挂在 `shell.overlay` 上的浮窗（`DockWindow` + `DockChat`），和面板并列，
不属于任何 Slot 面板，因此**切面板不会卸载它**（实测）。

四层边界，依赖只能向下：

```
DockWindow / DockChat        UI：拖动、两态、气泡、工具行、输入框
        ↓
use-conversation             React 接线：账号门控、attach、喂事件
        ↓
SessionAdapter  +  Conversation     Session 生命周期 / 事件状态机
        ↓
DSH ctx.sessions             create / retain / ready / eventSource / prompt / release
```

关键文件都在 `src/client/agent/`，逐个职责见 `AGENTS.md` §9。

---

## 二、真的能用的（真机验过）

| 能力 | 证据 |
|---|---|
| 浮窗挂载、拖动、位置持久化 | CDP 真拖 `(897,318)→(536,181)`，刷新后位置保持 |
| 迷你态收起/展开，`references` 0↔1 | 收起后 `references: 0`、`sessionId` 不变、气泡仍在 |
| 发消息、收回复 | 多轮真机 |
| 工具调用 + `callId` 配对 | 真调 `mcp__destiny__weapon_assistant`，结果落在自己的气泡里 |
| 注入上下文不混进对话 | 按 `user/message` 的 `source.kind === 'user'` 筛，真机只剩两条 |
| 上下文注入 | 选中「命运终结者（失时）」→ 模型答出这个名字并调对工具 |
| 快捷任务跟随选中 | 未选中给「本周有什么」，选中给「分析这件」 |
| 自动滚到底 | 新消息不再出现在视野外 |
| 会话按账号分区 | `${membershipType}:${membershipId}`，与 `snapshot-db.ts` 同口径 |
| 失效会话一次性重建 | 人为写入不存在的 id → 刷新 → 清理 + 新建一次，用户无感 |
| 账号三态门控 | 账号查不到时不 attach、不建会话、显示可重试的提示 |

---

## 三、卡住的地方（按严重度）

### P1 · `retain` 早于会话列表就绪，导致误判 `unknown session`

**这是当前最大的问题。** 每次刷新页面都可能把用户的对话换掉。

运行时证据（2026-11-14，临时日志，已清理）：

```
[OBS-RESOLVE] throw  {"sessions":0, "summaries":0}          ← retain 抛错时两个集合都是空
[OBS-CLIENT]  updated {"n":461}                             ← 154 毫秒后列表才有 461 条
```

**机制**：

```
页面加载
  ├─ fetchAccount ─→ attach ─→ ensure ─→ retain      ← 先到（summaries 还是 0）
  └─ remote.session.list() ──────────────→ summaries = 461   ← 晚 154ms
```

`resolveTarget` 的判据是三个条件同时不成立才抛：

```js
!this.sessions.has(id) && !this.summaries.some(s => s.sessionId === id) && address === void 0
```

刷新初期两个集合都是空的，**任何 id 都会被判死**——包括刚刚还在用的那个。
于是 `1e05280` 的一次性重建逻辑忠实地清理并新建，**用户丢一次对话**。

**已排除的解释**（都查过，不是它们）：

| 候选 | 结论 |
|---|---|
| 会话没落盘 | 否。四个目标会话都在磁盘上（152K / 344K / 280K / 4K） |
| `header.cwd` 缺失被静默跳过 | 否。`cwd` 都有值，都进了列表 |
| workspaceId 过滤 | 否。`session.list()` 无 workspace 参数，`create` 的 `cwd` 有 `defaultCwd` 兜底 |
| 列表分页/数量上限 | 否。`_request` 是空的 |
| 权限过滤 | 否。`remoteAccess.allows` 全为真 |

**试过、不成立的修复方向**：`create({ sessionId })`。

`claim()` 确实不经过 `resolveTarget`（直接 `observeSession(id)` 读盘），但它有一道闸：

```js
reusable = request.reusable(sessionId)
        && !observed.events.some((event) => event.type === 'turn/start')
if (!reusable) return this.createMinted(cwd, composition)   // ← 全新随机 UUID
```

**发过消息的会话不可复用**，`create({ sessionId })` 会**静默返回一个新 id**，原历史留在原 id 下。
只有从未开始过任何 turn 的空白会话才能被复用它恢复。

所以恢复通道仍然只有 `retain`，也就仍然要面对上面那个竞态。

**为什么不是「加延迟」能解决的**：DSH 没有暴露「列表已就绪」这个可观察状态。
加固定延迟是在赌 154ms 这个数——它只测到一次，没有分布。

### P2 · 历史恢复后 assistant 气泡是空的

重连后重新拉历史，`assistant/message` 的 `content` 里 `text` 块取不到正文，
界面上是一串 `A:` 空气泡。`textOf` 只认 `type === 'text'`，说明那些块**不是** `text` 类型。

**没有取真实恢复后的 entry 结构**，所以还没定因。

### P2 · `bubbles` 单调递增

收起/展开几次，气泡数从 9 → 10 → 14 → 17 → 19，**每次重连都在累加**。
`replace` 事件理论上应该全量替换。可能是 `replace` 的 entries 本身在变多（历史确实更长），
也可能是 UI 计数口径包含了 `transient`。**没有分别记录 DSH 原始 entries / Controller state / UI bubbles，所以未定因。**

### P3 · 流式只流思考，不流正文

`transient:assistant/live-chunk` **确实到达了 Controller**（一轮 62 次 accept，53 次含 chunk），
`absorbTransients` 早期读错层级（`entry.data` vs `entry.event.data`）已修。

修完之后仍然看不到逐字增长，因为**这个模型的 chunk 类型只有 `block-start` 和 `reasoning-delta`**，
没有 `text-delta`。`chunkText` 有意拒收 `reasoning-delta`（那是思考不是正文），所以正文气泡一直是空的。

**这只对当前模型成立**，换模型可能不同。**不要为了让它「看起来在流」而把 reasoning 当正文显示。**

### P3 · 其他

- 浮窗尺寸固定 360×460，不可调；工具结果区 `max-height: 90px`
- 迷你态只是个圆点，没有状态指示
- 取消没有 UI 入口（`Conversation.stop()` 存在但未接线）
- `z-index: 40` 是随手写的，有源码证据 `order: 1100` 按 `a.order - b.order` 升序排，但没有共存环境实测

---

## 四、DSH 侧的关键事实（都是查源码 + 运行确认的）

| 事实 | 位置 |
|---|---|
| `sessions.create()` 的参数是 `{ workspaceId?, cwd?, sessionId?, agentPreset? }` | `dsh-api-session-controller/lib/client.js` |
| `retain` 的 `unknown session` 是**裸 `Error`**，无 `code`、无自定义类、无 `cause` | `lib/client.js:3010` 附近 |
| 判定依赖 `sessions` / `summaries` / subagent address 三者 | 同上 `resolveTarget` |
| `session.list()` 无分页、无 workspace 过滤；冷会话需 `header.cwd !== undefined` 才进列表 | `lib/index.js:3061`、`ApiSessionList.list` |
| `create({ sessionId })` 走 `claim()`，只复用「无 `turn/start`」的会话 | `lib/index.js` `claim` |
| `createMinted` = `session-` + 随机 UUID | 同上 |
| `stream: true` 在 DeepSeek provider 里是写死的 | `dsh-llm-deepseek` |
| `agentPreset` 不传时用 registry 的 `default`（实测值 `standard`） | `dsh-web-app/cordis.patch.yml:590` |
| preset 的注册格式：`insert` → `dsh-agent-preset` → `config.id` + `config.plugins` | `dsh-web-app/presets/standard.patch.yml` |

**因为 `unknown session` 没有错误码**，`session-error.ts` 只能按 message 前缀判：

```ts
message.startsWith('sessions.retain: unknown session ')
```

用 `startsWith` 不用 `includes`——`sessionId` 会出现在别的消息里，**多清一个仍有效的会话比该清的没清更贵**。

---

## 五、明确冻结、不要再碰的

- **State Authority v1**：`observed` / `pending` / `rollback` 三栏隔离、`context-store`、`journal`。这一轮一行没动，也不该动。
- **Agent Preset**：技术上路径清楚（往 `cordis.patch.yml` 加一条 + 重启），但**改的是用户全局 profile**，插件组合漏项不会报错只会静默少工具。没批准前不动。
- **Context Snapshot**：设计过，但不是当前阻塞项。`view` 用 `useRef` 同步读是方向，但 `ageMs` 只是「前端这份 view 多旧」，**不代表游戏状态的真实延迟**，不能当写操作的授权依据。

---

## 六、如果要接着做

**唯一该先做的**：让 `retain` 不在列表就绪前跑。

这不是加延迟——是**找到 DSH 是否暴露了「列表已就绪」的可观察状态**（比如 `session.list` 的 promise、某个 projection 的 ready 标记、或者 `summaries` 的订阅）。有就用它等；没有，就如实接受这个窗口存在，并考虑**在误判后不要立刻重建**（把「unknown session」当成可疑而不是确定，交给用户决定）。

**在那之前不要修空气泡和 bubbles 累加**——它们依赖「会话身份可靠」这个前提，
身份还在被换的时候修展示，只是让错误看起来正常。

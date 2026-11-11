# Agent Shell：A1 调查结论与实施计划

2026-11-11。**调查完成，未写代码。** 基线 `acdf4ec`（P0 功能收口）。

## 零、一句话结论

**能接。** 悬浮层、会话创建、引用持有、事件流、发消息——四样都有真实 API，
但**会话引用要声明一个 `source`，而它只接受两个值，都不是给第三方插件准备的**。
这一条决定了 A2 之前必须先有个决定。

## 一、四个边界，各自对应真实 API

要求里说得对：悬浮窗口是 UI，DSH Session 是会话，Agent Runtime 是推理环境，
Context Bridge 是上下文提供者。查下来它们确实是四个东西：

| 边界 | 真实落点 | 证据 |
|---|---|---|
| **悬浮窗口** | `shell.overlay`（root 级 list slot） | `"Frame-wide floating layer, above every column and outside their scroll containers."` |
| **会话** | `ctx.sessions`（`ISessions`） | `create` / `retain` / `retainInfo` / `binding` |
| **推理执行** | Host 侧，Client 只拿到事件 | `SessionEventWindow.entries` 里有 `assistant/live-chunk` |
| **上下文** | 已有的 `POST /context` + `view-reporter` | 本项目自己的桥，不动 |

**没有 "Session Presenter" 这个组件。** 呈现是从 `shell.overlay` 和
`conversation.*` 系列的 slot 拼出来的。所以原设计里的 `AgentSidebar` 不能照搬——
它假设了一个不存在的挂载点。

## 二、会话 API 的确切形状

```ts
// 创建（不是 uiWorkspace.startSession——那是 UI 导航，会切走当前面板）
ctx.sessions.create(opts?: {
  workspaceId?: WorkspaceId
  cwd?: string
  sessionId?: SessionId
  agentPreset?: string        // ← Destiny 专属 preset 从这里绑
}): Promise<SessionId>

// 持有
ctx.sessions.retain(target: SessionId | SubagentAddress, {
  source: SessionReferenceSource     // ← 见 §三
  signal?: AbortSignal
}): SessionReference

interface SessionReference extends Disposable {
  sessionId: SessionId
  binding: SessionBinding          // { sessionId, session, eventSource, ctx }
  ready: Promise<SessionBinding>   // 初次历史打开
  release(): void
}

interface SessionBinding {
  session: SessionFace      // prompt / cancel / rename / loadOlder …
  eventSource: ObservableSnapshot<SessionEventWindow>   // ← 流式来源
  ctx: AgentContext
}

// 观测引用数（不持有、不建 scope）
ctx.sessions.retainInfo(id): ObservableSnapshot<SessionRetainInfo>
// { referenceCount, retainedBy: { controllerOperation?, gateway? } }
```

## 三、A1 的两处判断错了

调查结束、补查上游讨论、读参考插件之后，先记两条我写错的地方——不然后面会照着错的结论走。

**一、`source` 不是硬阻塞。**

我只看类型声明就下了结论：

```ts
type SessionReferenceSource = Extract<keyof SessionReferenceSourceMap, string>
interface SessionReferenceSourceMap { controllerOperation: unknown; gateway: unknown }
```

但运行时**没有校验**——在 `dsh-cordis-client-runner` 里搜 `unknown source` / `invalid source` /
`source is not`，一个都没有；`retainedBy` 的类型是 `Partial<Record<…, number>>`，`Partial` 本身就说明
运行时可以缺席或出现。第三方插件 `dsh-plugin-session-panes` 传的是自由字符串
`'sessionChatPanes'`，跑得通——它是纯 JS，所以没撞上类型闸门。

**真实约束是编译期**：我们是 TS，写非枚举值 `tsc` 会报错。

**处理**：用 `'gateway' as SessionReferenceSource`，**强转只能出现在 Session Adapter 一个文件里**，
业务代码永远不碰这个断言。同时在该文件注释里写明：这是临时兼容，**不代表 DSH 承诺 `gateway`
可供插件使用**，将来有了 `plugin` source 要换。

**二、`SessionProvider` 不是通用会话渲染入口。**

四个可能有它的包里 `exports.SessionProvider` 全是 0。它是一个 **slot 注入的 prop**
（`slotInject: "SidebarRightTabInjected"`），只在 `sidebar.right.pane.tab` 注册的组件里拿得到。
官方自己的 `SidebarChatTab` 就是这么用的，参考插件抄了它。

而这个槽：

```
declaredBy: "an entry in 'rightbar.session' … so it exists while that entry is mounted"
```

**只在右栏会话视图挂载时存在。** 所以它不能凭空造一个浮窗——这正是甲方案要绕开的东西。

参考插件自己都写了守卫 `typeof SessionProvider !== 'function'`，说明它也不确定每个版本都有。

由此确定：**不走右栏，自绘会话。**

## 三点五、三个层，边界写死

```
Floating UI          窗口 / 拖动 / 收起 / 输入框 / 消息气泡
      ↕ 只认 Controller 暴露的状态与动作
Conversation Controller   消息状态、事件流转换、发送、取消、错误
      ↕ 只认 Adapter 暴露的方法
DSH Session Adapter   create / retain / release / eventSource / prompt
```

三条不许破：

- **Adapter 不知道 UI 长什么样**。它不认识 React，不认识消息气泡，只吐状态与动作。
- **UI 不碰 `SessionReference`**。窗口组件里不许出现 `.release()`、`.binding`、`retain`。
- **强转只在 Adapter 里**。§三 说的 `as SessionReferenceSource` 就一行，别的地方没有。

这三条能做成守门测试：`src/client/agent/**` 里 grep `SessionReference`，命中数必须落在一个文件里。

## 四、其余几处已确认

**悬浮层怎么挂**：`ctx.slots.register('shell.overlay', { id, order }, component)`。
它是 `list` kind，多个插件可以共存，不影响布局（"outside their scroll containers"）。

**流式怎么来**：`binding.eventSource.subscribe(...)`，读
`SessionEventWindow.entries`，其中 `type: 'transient'` 的条目就是
`assistant/live-chunk`（`data.chunk: StreamChunk`）。**这是唯一的流式来源**，
不要去轮询 `session.getSnapshot()`。

**发消息怎么发**：`binding.session.prompt(content: PromptContentPart[], mode: 'queue' | 'steer')`。
`PromptContentPart` 支持 `text` / `image` / `file`。

**窗口卸载会不会销毁会话**：不会——`retain` 返回的是**引用计数**，`release()` 减一。
但**如果卸载时不 `release()`，引用会泄漏**，`retainInfo.referenceCount` 会一直涨。
这是我们自己要负责的那一半。

**重复订阅**：`eventSource` 是 `ObservableSnapshot`，`subscribe` 返回退订函数。
必须在 effect cleanup 里调，否则切换装备会叠出多份监听——**和本项目
`use-search-index` 那次 `AbortController` 是同一类问题**。

## 五、实施计划

把原 A4 拆成 Controller 与 UI 两个阶段——否则很容易出现"界面能显示消息，但底层事件状态没处理完"。

| 阶段 | 内容 | 退出条件 |
|---|---|---|
| **A2** | `shell.overlay` 悬浮窗口 | 库存布局不变；能拖动；刷新后位置还在；迷你/完整两态可切 |
| **A3** | Session Adapter | `create` / `retain` / `release` / `eventSource` / `prompt` 可用；preset 真绑上；**关窗后引用计数回到开窗前** |
| **A4** | Conversation Controller | 历史初始化、流式增量、流式结束、工具调用与结果、错误与取消、窗口更新与分页——**六件事各有状态** |
| **A5** | 消息 UI | 气泡、输入框、工具调用状态；只读 Controller |
| **A6** | Context Bridge | 当前装备三栏注入到 prompt |
| **A7** | 快捷任务 | 武器分析 / 平替 / 套装检查 |

**顺序不能颠倒**：A4 在 A5 之前。先让事件流的状态正确，再画它。

### A2：窗口本身

- `ctx.slots.register('shell.overlay', { id, order }, ...)` —— `order` 要避开参考插件的 `1000`
- 两种模式：**迷你**（一个图标 + 状态点，不遮库存）、**完整**（消息 + 输入）
- 位置与模式存 `localStorage`，和账号无关（纯 UI 偏好）
- **这一阶段不碰会话**，所以它失败不影响任何已有功能

### A3：Adapter 要回答的问题

```ts
interface SessionAdapter {
  ensure(): Promise<SessionHandle>     // 已有就复用，没有就 create
  handle(): SessionHandle | null       // 同步读，给 UI 判"有没有"
  dispose(): void                      // release，但保留 sessionId
  sessionId(): string | null           // 关窗后仍可读，下次 ensure 用它恢复
}

interface SessionHandle {
  id: string
  subscribe(listener: (window: SessionEventWindow) => void): () => void
  prompt(text: string): void
  cancel(): void
}
```

**`dispose()` 只 release，不清 `sessionId`** —— 这是"关窗不等于销毁会话"的落点。

### A4：事件流要处理的六件事

不能只处理 `assistant/live-chunk`。至少要分清楚：

| 事件 | 状态 |
|---|---|
| 历史初始化（`ready` 之后的第一批 `entries`） | 全量替换，不是追加 |
| `assistant/live-chunk` | 追加到"正在生成的那条"，**不能新建** |
| 流式结束 | 那条从 transient 转成正式消息，**不能重复** |
| 工具调用 / 工具结果 | 独立条目，不是消息的一部分 |
| 错误 / 取消 | 终止当前生成，保留已有内容 |
| `hasMore` / `loadingOlder` | 分页，向上翻不重置 |

**测试重点**：同一条消息在"流式中"和"流式后"各出现一次，而不是两次。

## 六、验收标准

| 项 | 必须达到 |
|---|---|
| Session | 能创建、能恢复；`agentPreset` 真的绑上（问一句能看出人设） |
| **引用** | 关窗后 `R_after = R_before`——**不是要求归零**，只要求我们自己不漏 |
| 事件 | 切换装备三次，一条消息只渲染一次；流式结束后不重复 |
| UI | 浮窗开着时库存面板宽度不变；迷你态不遮任何格子 |
| 上下文 | 换选装备后，下一句话里是新装备 |
| 工具 | 真能调 Destiny MCP（不是"看起来在调"） |
| 安全 | 写操作仍走 MCP 的确认流程；浮窗不能直接执行变更 |

引用那条的写法值得强调：全局引用数可能本来就不为 0（别的地方也在用这个会话），
所以断言的是**我们自己这一开一关不留下差额**。

## 六点五、这轮不做

- 多窗口、多会话切换（先让一个 Destiny Agent Session 稳定工作）
- 复用 `sidebar.right.pane.tab`（§三 已说明它依赖右栏挂载）
- 自建 prompt 存储（会话历史在 DSH 侧）
- Client 侧拿 token 或直连 Bungie

## 七、那三条原始设计的组件

- `AgentSidebar` —— 挂载点不存在（§二）
- `ContextualCard` —— 由 A6 的 Context Bridge 承担，不需要独立组件
- `TaskWorkspace` —— 不在这一版

## 八、已定：甲

`shell.overlay` 自绘，不依赖 `SessionProvider`，不等 #12060。

A2 可以立刻开始——它不碰会话，失败也不影响任何已有功能。

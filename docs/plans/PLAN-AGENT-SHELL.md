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

## 三、唯一的硬约束：`source` 只有两个值

```ts
type SessionReferenceSource = Extract<keyof SessionReferenceSourceMap, string>
interface SessionReferenceSourceMap {
  controllerOperation: unknown
  gateway: unknown
}
```

**没有第三个值，也不能自造。** 一个世界级插件（本插件）要持有会话，只能在二者中选。

这不是"能不能调"的问题，是**语义归属**的问题：这两个 key 是 DSH 自己消费方的名字，
借用它们意味着插件的生命周期被记在别人的账上，`retainInfo` 里也会显示成
`controllerOperation`——排查时会误导。

**三个可选的处理，需要拍板**：

| 方案 | 做法 | 代价 |
|---|---|---|
| **甲** | 用 `gateway` | 语义上最接近"另一个入口"；但仍是在借别人的名字 |
| **乙** | 不常驻持有，每次操作 `using()` 包一段 | 最简单，但事件流拿不到——`using` 的回调结束就释放 |
| **丙** | 向 DSH 提一个 `plugin` source | 正解，但要等上游；在此之前功能做不了 |

**我倾向甲 + 在文档里写明这是借用**，同时把"要一个 `plugin` source"作为上游诉求记下来。
乙做不到流式，丙会阻塞整条线。

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

**A2 · 悬浮窗壳子**（先做，不含会话）

- `shell.overlay` 注册一个窗口：拖动、收起、展开
- 位置用 `localStorage` 记（和 `snapshot-db` 一样按账号无关，纯 UI 偏好）
- **此时还没有会话**，只验证"浮层能挂上去、不挤压库存布局"

退出条件：库存面板在浮窗开着时布局不变；刷新后位置还在。

**A3 · 会话生命周期**

- `sessions.create({ cwd: workspace, agentPreset })` 或复用已有
- `retain` → 拿 `binding` → 卸载时 `release`
- `retainInfo` 做一次断言：打开/关闭窗口三次后 `referenceCount` 回到 0

**这是 A3 的核心验收**：引用计数不泄漏。它比"能聊天"重要。

**A4 · 消息流**

- 订阅 `eventSource`，把 `entries` 渲染成消息
- `transient` 条目走"正在输入"，`event` 条目走气泡
- 发送用 `session.prompt`

**A5 · 上下文注入**

- 复用已有 `view-reporter` → `/context` 通路
- 在 prompt 前把当前选中物品的三栏（`ItemStateView`）拼进 `PromptContentPart.text`
- **不新开一条上下文通道**

**A6 · 快捷任务**

- 按当前选中物品生成按钮（分析武器 / 找平替 / 检查套装）
- 每个按钮等价于预填一段 prompt

## 六、验收标准

沿用你列的那张表，加两条我这边必须自己守的：

| 项 | 必须达到 |
|---|---|
| Session | 能创建、能恢复，`agentPreset` 真的绑上（在会话里问一句能看出人设） |
| 引用 | 开关窗口三次，`retainInfo.referenceCount` 回到 0 |
| 事件 | 同一会话不出现重复订阅（切换三次装备后，一条消息只渲染一次） |
| UI | 浮窗开着时库存面板宽度不变 |
| 上下文 | 切换选中装备后，下一句话里的上下文是新装备 |
| 工具 | 真能调 Destiny MCP（不是"看起来在调"） |
| 安全 | **写操作仍走 MCP 的确认流程**；浮窗里不能直接执行变更 |

## 七、这轮不做

- 不改 `AgentSidebar` 那套原始组件设计（挂载点不存在）
- 不做 TaskWorkspace
- 不给浮窗加自己的 prompt 存储（会话历史在 DSH 侧）
- 不在 Client 侧拿 token 或直连 Bungie

## 八、开工前要定的那一件事

**§三 的甲/乙/丙**。选甲就按"借用 `gateway`"写，选丙就先把这个诉求提出去、A2 单独做。

其余部分不受它影响，可以先动 A2。

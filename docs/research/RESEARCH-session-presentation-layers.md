# 研究：Session 呈现能力分成三层，我们只缺一层

> 目的：确认宿主内部是否存在独立于 `sidebarRight.mounted` 的 Session 呈现机制（而不是绕过它）。
> 结论：**存在。三层能力里两层已经对插件开放，只缺"容器"那一层。**
> 观察版本：DSH `0.2.1-rc.5`（应用内嵌）。

## 三层

| 层 | 能力 | 依赖 `mounted`？ | 证据 |
|---|---|---|---|
| 数据 | 持有任意 Session 的引用 | ❌ | `ctx.sessions.retain(sessionId, { source, signal })`（`dsh-api-session-controller`） |
| 视图 | 渲染任意 Session 的对话 | ❌ | `conversation.session` 槽由宿主 `dsh-client-ui-conversation` 的 `ConversationSessionView` 渲染；外层用 `SessionProvider session={reference}` 包裹 |
| 容器 | 在右栏给这个视图一个 pane | ✅ | `ctx.sidebarRight.openResource(address, …)` 只作用于 `mounted`；`mounted` 在 `main` 有 `activePanelId` 时为 `undefined` |

## 关键代码

`sidebar-right` 同步在屏会话：

```js
show(layout.panelInfo.getSnapshot().activePanelId === null ? selected?.sessionId : void 0)
```

`ui-workspace` 的 openSession 替换主栏：

```js
openSession(target) { this.replaceMain(target, this.lifetime.signal, "reveal") }
```

`session-panes` 插件（第三方，0.1.5-rc.1 验证）证明数据层与视图层可组合：

```js
const reference = ctx.sessions.retain(parsed.sessionId, { source, signal })
h(SessionProvider, { session: reference }, renderSlot(CONVERSATION_SLOT, {}))
```

它把任意 Session 的对话挂进右栏的一个 tab 里——**内容与 `mounted` 无关**；唯一受限的是 pane 开在哪个 Session 的右栏。

## 所以需求可以缩小

原来的说法（"暴露 Session 激活"）太大。真正需要的只是：

> 当 `main` 显示插件面板（没有 mounted Session）时，允许插件在右栏开一个 pane。

可能形状（任一）：

- `ctx.sidebarRight.openResourceInNeutralPane(address)` —— 与 Session 无关的右栏 pane；
- 或让右栏的可见性不再由 `mounted` 决定，而由"有没有已 adopt 的 store"决定。

这比"开放 Session 控制器"或"开放整个右栏"都小得多。

## 为什么不自己去拼

数据层和视图层虽然可用，但容器层是 `sidebarRight` 的私有语义（`onScreen` store + `rightbarTrack`）。自己去拼就等于重写右栏布局与生命周期——正是 `#12060` 里那个"不要绕过私有实现"的边界。

## 与已提需求的关系

`#12060` 描述的是缺口本身（插件面板在 main 时无法呈现 Session 到右栏）。本文的结论是**同一缺口的更小切口**，等维护者回应后再决定是否补充。

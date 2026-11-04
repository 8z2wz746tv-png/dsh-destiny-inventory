# 内部设计依据：向 DSH 提「Session 激活」API 需求

> 对外提交件是 [FR-SESSION-ACTIVATION.md](FR-SESSION-ACTIVATION.md)（英文）。本文是内部版本，写清楚为什么提、我们放弃了哪几条路。

## 我们要的能力

库存面板（`main` 里的 keyed 面板）保持不动，右栏出现**指定的那个** Agent Session。

```
main:     命运仓库（库存）      ← 不能被切换走
rightbar: Agent Session S      ← 我们要指定的是这个
```

## 现状（rc.5 实测）

| 能力 | 有 | 作用对象 |
|---|---|---|
| `ctx.sidebarRight.openResource/openTab` | ✅ | **当前在屏的 Session** |
| `tabsIn(sessionId)` / `mounted` / `openTabs` | ✅ | 只读 |
| `openResourceIn/openTabIn/closeIn` | 运行时存在 | 注释写明 **"Not part of ISidebarRight"** |
| `show(sessionId)` | 工厂内部 | 未 `provide` |
| `ctx.uiSession.adapter.current` | 只读 store | 无 setter |

结论：**能往右栏放内容，但只能放进"当前在屏的 Session"；把某个 sessionId 变成在屏 Session，没有公开入口。**

## 放弃了哪三条路

1. **往 `rightbar` 槽再注册一个面板** —— rc.5 里该槽被内置 Session 视图以单座占用，第二个 occupant 可能冲突或把它挤掉。这是对当前实现的观察，不是对槽机制的断言。
2. **直接调 `ctx.layout.openRightbar`** —— 它只"报告呈现"，不挂内容，结果是空轨道。
3. **硬用 `openTabIn`** —— 依赖非公开路径，一次重构就断，且违反"不用私有实现"的约定。

## 提的两个方案

- **A（首选）** `await ctx.uiSession.activate(sessionId)` —— 激活已有 Session，右栏跟随；**不改变插件主面板**。
- **B** `await ctx.sidebarRight.openSession(sessionId)` —— 直接要求右栏显示，主面板天然不受影响。

两者都必须满足：不创建 Session、不改持久化身份、不重置历史与运行状态、幂等、未知/无权时返回 typed error。

## 关键约束（最容易在实现时被忽略）

**激活 Session 不能把主区从插件面板切走。** 我们的库存页不是 conversation 面板，一切就走等于打断工作流——那正是这个需求要避免的。英文文档里单列了 §5.1 写死这一条。

## 架构立场

Agent 是宿主提供的会话能力，命运仓库只是**调用它的业务插件**。所以我们不改宿主代码、不自绘聊天界面、不碰控制器内部 store；只要求一个受权限管理的激活入口。

## 提交前的两件事

1. 对照 `deepseek-ai/deepseek-harness` master 的 `ui-sidebar-right` 源码：公开仓库文档里出现过 `focus` / `toggleExpanded`，我在 rc.5 的 controller 类体里只确认了 `openResource` / `openTab`，`toggleExpanded` 仅见于 store actions。如果 master 已经补了 `focus`，需求的边界要重新表述。
2. 用你自己的 GitHub 身份提交；我不代提交。

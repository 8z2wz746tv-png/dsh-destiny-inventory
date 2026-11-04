# Feature Request: activate or reveal an existing Session in the UI

**Component:** `@deepseek-ai/dsh-client-ui-sidebar-right` / `@deepseek-ai/dsh-client-ui-session`
**Author context:** third-party plugin developer, `dsh-destiny-inventory`

**Observed versions**

- installed: DSH `0.2.1-rc.5` (app bundle), sidebar packages `0.2.1-rc.5`
- `master`: `packages/client/ui-sidebar-right/src/client/service.ts`

On `master` the controller's method list is:

```
openResource(address, options)      openResourceIn(sessionId, address, options)
close(tabId) / hide(tabId)          closeIn(sessionId, tabId)
active() / isExpanded()             toggleExpanded()
focus(tabId)                        split(paneId?) / float(tabId, rect?) / dock(paneId)
registerCloseHandler(kind, handler) menuTabs(sessionId, paneId, tabId) / tabsIn(sessionId)
flashOf(sessionId)
```

There is **no** `activate`, `openSession`, or `revealSession` on either version.

Two things that look related but are not:

- `focus(tabId)` focuses a *tab* inside the mounted Session; it does not choose which Session is mounted.
- `adopt(sessionId, store)` exists on the factory result (not published via `ctx.reflect.provide`); it attaches a Session's store when that Session is rendered.

---

## 1. Summary

A plugin can open content in the right sidebar **of the Session that is currently on screen**, but it has no public way to make a *given* `sessionId` the one on screen.

For plugins that own a business surface (an inventory page, a build editor, a map) and want to show an Agent conversation beside it, that is the one missing primitive.

## 2. What the public face provides today

`ctx.sidebarRight` is a `SidebarRightController` instance — the source comments call it "Cross-plugin right-Sidebar face (`ctx.sidebarRight`)".

Public, per the class body:

| Member | Kind | Acts on |
|---|---|---|
| `openResource(address, options)` | method | **the on-screen Session** |
| `openTab(kind, options)` | method | **the on-screen Session** |
| `tabsIn(sessionId)` | method | any Session (read) |
| `mounted` | snapshot store | the on-screen Session (read-only) |
| `openTabs` | snapshot store | tab metadata (read-only) |
| `adopted`, `rooms` | stores | internal bookkeeping |
| `registerCloseHandler` | method | cleanup registration |

The class doc states the rule explicitly:

> *"Every command on the public face acts on that Session through its adopted store; a command with no Session on screen … does nothing."*

Three related entry points are **deliberately not** part of the public face:

- `openResourceIn(sessionId, address, options)`
- `openTabIn(sessionId, kind, options)`
- `closeIn(sessionId, tabId)`

each carrying the comment **"Not part of `ISidebarRight`: the Tab domain's path."**

`show(sessionId)` exists, but it lives on the object returned by `createSidebarRightController(...)`, not on the controller that `ctx.reflect.provide("sidebarRight", controller)` publishes.

`ctx.uiSession.adapter.current` is a `createBindingSource(...)` snapshot — subscribe/read only, no setter.

## 3. The gap

```
plugin wants:  "show Session S in the right column"
available:     "show something in the right column, but only if S is already on screen"
```

For a plugin whose main surface is a keyed `main` panel (not a conversation), "the on-screen Session" is whatever the shell considers active — the plugin cannot influence it. So it cannot bring *its* Agent session next to *its* inventory page.

`ctx.sidebarRightTabs.register(kind, definition)` lets a plugin contribute a tab type, and the registered tab receives `tabActions` (`openResource` / `openTab` / `close`) bound to **the Session the tab is in**. That is the correct design for tab-owned navigation, but it does not help a plugin that has no tab anywhere yet.

## 4. Minimal reproduction

0. The plugin has **already created the Session and holds its `sessionId`** — the scenario is not about creating Sessions or about missing permissions; the Session exists, is registered, and is visible to the plugin.
1. The plugin registers a keyed panel on `main` (`ctx.slots.register({ name: 'main', key: 'my-panel', … })`) and that panel is the active one.
2. The plugin tries to reveal `sessionId`:
   - `ctx.sidebarRight.openTab(kind, {})` → acts on the on-screen Session, which is not `sessionId`;
   - `ctx.sidebarRight.openTabIn(sessionId, kind, {})` → exists at runtime but is documented as not part of the public face;
   - `ctx.uiSession.adapter.current` → read-only;
   - `ctx.layout.openRightbar(track, fullscreen)` → creates a track with no content.

Result: no supported call makes `sessionId` the mounted Session.

## 5. Proposed API

Two shapes; either is sufficient. Option A is preferred, because activation is a Session-level concept and should not be tied to a layout region.

### Option A — activation on the UI session registry

```ts
await ctx.uiSession.activate(sessionId)   // Promise<void>; rejects with a typed error
```

Contract:

- activates an **existing** Session; never creates one;
- does not change the Session's persisted identity;
- does not reset message history or run state;
- **idempotent** when the requested Session is already active (no remount, no flicker);
- rejects with a typed error when the id is unknown or not visible to the caller;
- **does not change the plugin's mounted `main` panel** — see §5.1.

A typed rejection is enough; there is no need to widen the return type into a result union.

### 5.1 Hard requirement — the main panel must survive

Confirming or clarifying the wording of Option A: **activating a Session for the right sidebar must not replace or navigate away from the plugin's currently mounted main panel.**

Concretely, if `my-panel` is the active `main` key:

```
before: main = my-panel (inventory)      rightbar = (collapsed)
after activate(S): main = my-panel (inventory)      rightbar = Session S
```

The host should preserve the existing main-panel view while presenting the requested Session in the right sidebar. A variant that makes `S` the global current Session *and* swaps the main column to the conversation panel is the exact behaviour this request is trying to avoid: the plugin's business surface is not a conversation, so switching it away interrupts the workflow the Agent is supposed to assist.

If the maintainers prefer the strict "current Session changes everywhere" semantic, then Option B (below) is the safer shape — but the request stands either way: one of the two must exist.

### Option B — reveal in the right column

```ts
await ctx.sidebarRight.openSession(sessionId)   // Promise<void>
```

Same contract as A, scoped to the right column, with the main panel explicitly untouched by construction.

## 6. Compatibility and safety considerations

- **Visibility/authorization** stay in the host. A plugin may only activate a Session it is allowed to see; otherwise return a typed error.
- **No new state ownership**: the call must reuse the existing adopted store and `SessionProvider`. Session history and run status are already preserved when the column collapses today, so this does not change lifecycle semantics.
- **Idempotent** by default (see §5).
- **Layout stays the host's business**: the plugin passes no width, track or fullscreen; the host derives them (it already does, via `syncPresentation`).

## 7. Alternatives considered

- **Register a custom panel into the `rightbar` slot.** In the observed rc.5 implementation, the built-in Session view occupies `rightbar` as a single-seat occupant (`ctx.slots.register({ name: 'rightbar', children: { 'rightbar.session': … } })`), and the column's width is derived from that occupant's track. Registering another occupant in rc.5 may conflict with or replace the built-in view. This is an observation about the current implementation, not a claim about how the slot mechanism must behave in future versions.
- **Drive the layout directly** (`ctx.layout.openRightbar`). It reports presentation; it does not attach content — the column would be empty.
- **Reuse `openTabIn` despite the comment.** That would mean a plugin depending on an explicitly non-public path; it would break on any refactor without notice.

## 8. Non-goals

This request does not ask for:

- plugin ownership of the right column;
- custom chat rendering by the plugin;
- changes to how Sessions are created or persisted;
- any change to the current `openResource` / `openTab` semantics;
- access to the controller's internal stores (`adopted`, `rooms`).

## 9. Why it generalises

Any plugin that owns a business surface and offers an Agent entry point needs the same primitive: *"the user clicked analyze-this inside my page; put the conversation that answers it next to my page."* Without it, every such plugin either re-implements a chat surface or interrupts the user's workflow by switching panels.

The architectural principle behind the request: **the Agent is a host-provided session capability; a business plugin only asks the host to show it.**

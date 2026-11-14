# 武器分析 → 卡片 → 定位（第一版产品闭环）

2026-11-14，基线 `9d794f4`。**已实施；真机验收与限制见 §9。**

## 0. 一句话

选中一把武器，Agent 用 `weapon_assistant(analyze)` 取回定义与**我持有的副本**
（超大结果被宿主截断时改用紧凑的 `filter_rolls` 副本，见 §9），
浮窗把结果渲染成结构化卡片；点击其中一件副本，库存面板清掉会遮住它的筛选、
滚到那一格并高亮。

**不写账号、不引第二套上下文通道、不做平替/配装。** 先把「选中 → 分析 → 定位」
这条链跑通，再谈扩展。

## 1. 范围

**做：**

- 选中武器的上下文（复用现有 `/context`）。
- Agent 调用一次 `weapon_assistant(intent="analyze", include_inventory=true)`。
- 浮窗里的武器卡：身份、基础属性、当前 perk、**我持有的副本**、愿单/刷取参考（带来源）、警告。
- 点击副本 → 库存面板定位（清筛选、切宽布局、滚动、2.5 秒高亮）。
- 失败提示：面板没开、副本不在当前快照。

**不做：**

- 平替/同类替代（`catalog`/`compare` 的「留哪把」建议）。
- 配装执行、`equip_build`、任何账号写入。
- 新的 Context Bridge、新的 Session/状态治理、State Authority v1 扩展。
- 自动切换主面板；第一版只定位已经打开的「命运仓库」面板。
- 渲染完整 perk 池（定义级池子可以几十项；卡片只给**推荐项**与当前装备项）。
- 宿主（Bungie/MCP）侧改动。

## 2. 现有入口（全部复用，不重造）

| 环节 | 现在在哪 | 结论 |
|---|---|---|
| 选中 | `ItemTile` 点击 → `use-hover-card` 的 target；`InventoryPanel` 组装 `selection` | 复用 |
| 上报视图 | `viewOf` → `useViewReport` → `POST /context`；`ContextStore` 保存 `ViewContext` | 复用 |
| 浮窗读上下文 | `useConversation.loadContext()` → `GET /context`；`withContext()` 把它拼在用户消息前 | 复用 |
| 工具结果 | `tool-pairs.ts` 从 `tool/result` 的 `content[].text` 取正文；`message-view.ts` 合成 `Bubble.tool` | 复用；结果已是完整 JSON 文本 |
| 卡片落点 | `DockChat.tsx` 的 `ToolBubble` | 扩展：识别武器工具，替换原始 `<pre>` |

**唯一的上下文增量**：`ViewContext.selected` 已有 `instanceId/hash/name/observed/...`，
本轮只加一个**可选**字段：

- `kind: 'weapon' | 'armor' | 'other'`；
- 来源：`ItemRow.kind`，在 `viewOf` 里带上；
- 用途：快捷按钮只在选中武器时给「分析武器」，避免拿武器工具去分析护甲。

**只加 `kind`，不引第二套 `type` 表达。** 旧客户端/旧上下文没有它也照常工作；
这不是新的通道，只给现有 `/context` 加一个字段。

## 3. 闭环

```
面板选中武器
  │  ItemTile click（现有）
  ▼
ViewContext（selected.instanceId / name / kind / type）
  │  POST /context（现有）
  ▼
浮窗「分析武器」快捷按钮
  │  loadContext + withContext（现有）
  ▼
Agent 调用 weapon_assistant(intent="analyze", weapon_name, include_inventory=true)
  │  MCP（仅 Agent 使用，浏览器不直连）
  ▼
tool/result.content[].text（完整 JSON）
  │  tool-pairs（现有）
  ▼
WeaponCard（新）
  │  点击副本 → locateItem(instanceId)
  ▼
InventoryPanel：清筛选、切宽布局、scrollIntoView、2.5s 高亮
```

## 4. `weapon_assistant` 的实际契约

**调用方是 Agent，不是浏览器。** 前端只解析 `tool/result` 的正文，符合
`PLAN-SELF-HOSTED-DIM.md` §1 的边界。

- 工具名：以 `weapon_assistant` 结尾（DSH 里实际是 `mcp__destiny__weapon_assistant`；
  按后缀匹配，不写死前缀）。
- 参数：`{ intent: "analyze", weapon_name: "<选中武器名>", include_inventory: true }`。
- 2026-11-14 实测（「命运终结者」）顶层形状：

```text
ok, summary, data, candidates, next_actions, warnings
data.weapon           身份块 + farming/popularity/community/sources + name_variants_note
data.stats[]          {stat_hash,name,value,display,is_primary,display_as_numeric}
data.sockets[]        定义级插槽：kind/slot/option_count/options[].name/can_roll/recommended
data.inventory.weapon.owned   {count,status}
data.inventory.instances[]   副本：weapon.instance.{instance_id,location,power,is_equipped,locked,god_roll_score,gear_tier,item_level}
                              sockets[].equipped.{plug_hash,name}（当前装着的）
                              stats[]
data.inventory_status "complete" / 其他
data.god_roll         {kind,source,note}（愿单；kind=none 只说明没收录）
```

- **不用顶层 `candidates`**：实测为空；且它未来可能装的是平替/候选武器，超出本版范围。
- `data.inventory.instances` 是**本版“候选装备”的唯一来源**：同一把武器、我持有的副本。
- 结果文本很大（实测 60KB 级）。卡片只取上表子集；完整 JSON 仍留在 tool bubble 的数据里，
  原始 `<pre>` 在解析失败时作为兜底。

## 5. 结构化卡片

### 5.1 数据模型（纯函数，独立可测）

`src/client/agent/weapon-card-model.ts`：

```ts
export interface WeaponCardModel {
  name: string
  nameEn: string
  weaponType: string
  frame: string
  rarity: string
  damageType: string
  ammoType: string
  rpm: number | null
  iconUrl: string
  description: string
  stats: { name: string; display: string; value: number }[]
  /** 定义级推荐 perk（不铺完整池子）：栏名 + 推荐/当前选中项。 */
  perkHints: { slot: string; current: string | null; recommended: string[]; optionCount: number }[]
  /** 我持有的副本；本版的“候选”。 */
  owned: {
    instanceId: string
    location: string
    power: number | null
    equipped: boolean
    locked: boolean
    gearTier: number | null | undefined   // undefined = 没给，不等于“无分级”
    godRollScore: string
    perks: { slot: string; name: string }[]
  }[]
  /** 愿单/刷取/选取率参考，带来源；没有就留空。 */
  references: { label: string; text: string; source: string }[]
  warnings: string[]
  inventoryStatus: string
  /** 账号没读到：不把 0 件说成“你没有”。 */
  inventoryChecked: boolean
}

export function parseWeaponCard(result: string | null): WeaponCardModel | null
```

- 解析失败或 `ok=false` → `null`，浮窗保留原始结果文本（不假装有卡）。
- `data.weapon` 缺失 → `null`（没有名字就不出卡）。
- `data.inventory` 缺失或 `owned.status !== 'checked'` → `inventoryChecked=false`，卡上写
  「账号未读取」，**不画空候选列表**。
- `data.sockets[].options_available === false` → 不把「本次未展开」画成空池子。
- 推荐项只取 `options[].recommended` 非空的最多 3 个/栏；完整池子留给后续。
- `name_variants_note` 非空时放进 `warnings`（同名多版本会影响“能滚什么”的判断）。

### 5.2 渲染

`src/client/agent/WeaponCard.tsx`（新）：

- 位置：`DockChat` 的工具气泡里。`ToolBubble` 识别 `tool.name.endsWith('weapon_assistant')`
  且 `tool.status === 'done'`、`parseWeaponCard(tool.result) !== null` 时画卡；
  否则保持现有 `<pre>`。
- 布局（360×460 浮窗内的紧凑卡）：
  1. 身份：68px 图标 + 名字/英文名 + 稀有度·类型·伤害/弹药；
  2. 属性：最多 6 个关键属性（`display` 优先）；
  3. 当前 perk：**选中副本**（`view.selected.instanceId` 匹配）的
     `sockets[].equipped.name`；没有匹配就显示第一件副本；
  4. 我的副本：每行一件，位置/光等/T 级/当前特性，右侧「定位」；
  5. 参考：愿单/刷取/社区，逐条带来源；没有就不显示；
  6. 注意：`warnings` + `name_variants_note` 原样列出。
- 三层数据分开标注：定义（“可能滚出”）、我的副本（“你的”）、社区（“参考·来源”）。
  不把愿单说成官方，不把 `god_roll.kind=none` 说成“不值得留”。
- 不引入 HTML 字符串/`<style>`；用 React 元素 + `styles-dock.ts` 的样式。宿主是 React，
  不是 `destiny2-render` 的 HTML 聊天壳；只复用它的**字段表与降级规则**，不搬 HTML 骨架。

**施工约束（2026-11-14 批准）**：

- 只解析**这一条气泡自己的**工具结果；JSON 失败/字段缺失/结构异常返回 `null`，
  保留原始结果文本，不凭空生成装备信息，不用宽松字段猜测把坏数据画成正常卡。
- 工具调用与结果按 `callId` 配对；多次调用各自成卡，不共享“最近一条 weapon_assistant 结果”。
- 卡片放在工具气泡里，与对应 `tool/result` 绑定。

## 6. 候选定位（本版唯一的“命令”）

### 6.1 定义

候选 = `data.inventory.instances[]`，即**同一把武器的持有副本**。点击一行 →
`locateItem(instanceId)`。这不是 Bungie/DIM 的外部命令，是本插件前端内部的 UI 命令。

### 6.2 命令总线

`src/client/locate-bus.ts`（新，纯逻辑）：

```ts
export type LocateResult =
  | { ok: true }
  | { ok: false; reason: 'not-mounted' | 'not-in-snapshot' }

export function registerLocateHandler(handler: ((id: string) => LocateResult) | null): () => void
export function locateItem(instanceId: string): LocateResult
```

- 面板挂载时注册，卸载时注销；浮窗只调 `locateItem`。
- 不落盘、不进 host、不进 State Authority。

### 6.3 面板处理

`InventoryPanel` 注册一个 handler：

1. `items.find(i => i.instanceId === id)`；找不到 → `not-in-snapshot`。
2. `setLayout('wide')`；`patch({ search: '', type: '', category: 'all', lock: 'all' })`
   —— 清掉所有会隐藏它的筛选；排序不动。
3. 设置 `locate = { instanceId, nonce }`；下一帧用
   `document.querySelector('[data-instance-id="<id>"]')` 找到 tile，`scrollIntoView`。
4. 给该 tile 加 `is-located` 类，2.5 秒后清除。
5. 返回 `{ok:true}`；滚动失败不影响返回（tile 已渲染）。
6. 面板被路由切走但组件还挂着时，根节点没有可见 rect：按 `not-mounted` 返回，不能假装“已定位”。

`ItemTile` 增加 `data-instance-id` 与 `located` prop；样式加 `.is-located`（轮廓/闪光）。
**第一版不自动打开详情卡**，只高亮；用户需要时再点。

**施工约束（2026-11-14 批准）**：

- `locateItem(instanceId)` 只按 **instanceId** 在当前快照里精确查找；同 hash 的其它副本不是目标，
  找不到就返回 `not-in-snapshot`。
- 只清会遮住目标的筛选（搜索/类型/分类/锁定）并切宽布局；**不动**焦点职业、排序、
  其它状态，不碰 Journal / State Authority。

### 6.4 失败

| 情况 | 卡片提示 |
|---|---|
| 面板没打开（无 handler） | 「先在左侧打开「命运仓库」面板，再点定位。」 |
| 副本不在当前快照 | 「这件不在当前库存快照里，先刷新库存再试。」 |
| 卡片对应的结果解析失败 | 不画卡，保留原始工具结果 |

## 7. 文件落点

| 文件 | 改动 |
|---|---|
| `src/client/agent/weapon-card-model.ts` | 新：解析 + 归一化（纯函数） |
| `src/client/agent/WeaponCard.tsx` | 新：紧凑武器卡 + 副本定位按钮 |
| `src/client/agent/DockChat.tsx` | `ToolBubble` 识别武器结果并画卡 |
| `src/client/agent/quick-actions.ts` | 选中武器时给「分析武器」；本版移除「找平替」「适合什么配装」按钮 |
| `src/client/agent/context-prompt.ts` | `ViewContextLike` 增可选 `instanceId/kind`；不引 `type` |
| `src/host/context-store.ts` | `SelectedItemState` 增可选 `kind` |
| `src/client/view-reporter.ts` | `viewOf` 带上 `kind` |
| `src/client/locate-bus.ts` | 新：定位命令总线 |
| `src/client/InventoryPanel.tsx` | 注册 handler、清筛选、切宽、滚动、高亮 |
| `src/client/ItemTile.tsx` | `data-instance-id` + `located` |
| `src/client/styles.ts` | `.is-located` 高亮 |
| `src/client/styles-dock.ts` | 卡片样式 |
| `AGENTS.md` | §9 代码地图（新文件）、§10 文档地图（本文件） |

**不碰**：`src/bungie/`、Host 路由、State Authority v1、journal、写队列、MCP 服务器。

## 8. 测试与验收

### 自动化

- `tests/weapon-card-model.test.ts`
  - 用**真实** `weapon_assistant(analyze)` 响应做 fixture（2026-11-14「命运终结者」，
    保留实际字段路径；不为测试手编形状）。
  - 覆盖：正常解析；`data.weapon` 缺失 → `null`；账号未读取 → `inventoryChecked=false`；
    `options_available=false` → 不画空池；`warnings`/`name_variants_note` 原样保留；
    `god_roll.kind=none` → 不判“不值得留”。
- `tests/locate-bus.test.ts`
  - 注册/注销；无 handler → `not-mounted`；找不到 → `not-in-snapshot`；找到 → `ok`。
- `tests/quick-actions.test.ts`
  - 选中武器 → 第一个按钮是「分析武器」，prompt 点名 `weapon_assistant` 与 `include_inventory`；
  - 选中护甲 → 不出现武器分析按钮；
  - 未选中 → 不出现「分析」。
- `tests/context-prompt.test.ts`（若加 kind/type）
  - 只报实际字段；没给就不加。
- `tests/docs.test.ts`：本文件与 `AGENTS.md` §10 双向核对。

### 真机

1. 面板选中「命运终结者」→ 点「分析武器」→ Agent 调 `weapon_assistant(analyze)`；
2. 工具气泡出现卡片：身份/属性/当前 perk/副本/参考/警告；
3. 点一个副本 → 面板切宽、清筛选、滚到该格、2.5 秒高亮；
4. 关掉面板再点 → 卡片提示“先打开面板”；
5. 把条目刷成过期快照（或在别的页面点）→ 提示“不在当前快照”；
6. 选中护甲 → 不出现武器分析按钮。

### 完成标准

- 一条命令能演示完整闭环：选中武器 → 分析 → 卡片 → 点击副本 → 面板定位。
- 不产生任何账号写入。
- 卡片上的每个字段都能指回 `weapon_assistant` 响应里的真实路径；没有的字段不画。
- `tsc` 干净、全量测试绿、真机六步通过。

## 9. 实施记录与已知限制（2026-11-14）

真机第一次点「分析武器」时发现：DSH 会把过大的工具结果截成“头 + 尾 + Omitted … bytes”，
真实武器的 `analyze` 响应约 96–122KB，浏览器拿到的 JSON 不完整，解析必然失败。
这不是字段协议错，是宿主的展示上限；Agent 能读 spill 文件，浏览器不能。

**已落地的回退**：

- `parseWeaponCard` 同时支持两种真实的 `weapon_assistant` 结果：
  1. `analyze`（`data.weapon` + `data.inventory.instances`）；
  2. `filter_rolls`（`data.scope="owned_inventory"` + `data.matched[]`）——紧凑、真实、未截断。
- 快捷 prompt 先要求 `analyze`；如果结果出现 `Omitted … bytes`，再调用
  `filter_rolls` 取当前副本。卡片绑定 `filter_rolls` 那条 `tool/result` 的 `callId`，
  不共享最近一条结果；`analyze` 仍真实发生。
- 紧凑卡保证：身份 + 我的副本 + 当前插槽 + 副本定位。`stats`/定义池/愿单参考在
  超大 `analyze` 被截断时缺席；**没有的字段不画**，不用猜测补。
- `filter_rolls` 不给 `gear_tier` → 模型记 `undefined`，卡片不写“无分级”；
  只有 `analyze` 明确给 `null` 时才写“无分级”。
- 没有读 spill 文件、没有加 host 路由、没有改 MCP 执行逻辑/Journal/State Authority/Session 恢复；
  host 只给 `SelectedItemState` 加了一个可选类型字段（无运行时行为）。

**仍然未满足的**：如果以后要求“超大 analyze 也显示完整 stats/定义池”，需要
MCP 提供精简响应，或允许 host 读 spill；两者都超出本轮范围。

## 10. 已拍板（2026-11-14）

1. **“候选装备”= 同一把武器的持有副本**（推荐；`data.inventory.instances`），
   不是顶层 `candidates`、不是平替。
2. **给 `/context` 只加可选的 `kind`**（已定；不引 `type`，旧上下文兼容）。
3. **卡片放在工具气泡里**（推荐；与调用一一对应，不额外造一条消息）。
4. **本版隐藏「找平替」「适合什么配装」两个快捷按钮**（推荐；避免把范围外的 agent 行为带进来）。
5. **定位只清筛选+滚动+高亮，不自动开详情卡**（推荐；少一层交互）。

五点已批准并落地；实现顺序：解析器/模型 → 卡片 → 快捷按钮 → 定位总线/面板 → 测试。

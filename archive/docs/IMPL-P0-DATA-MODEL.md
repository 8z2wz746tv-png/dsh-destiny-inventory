# IMPL · P0 数据模型修复（唯一待做清单）

> 只写真实待做的工作、数据契约与验收条件。不重复设计论证，不列已完成的项。
> 前置：`DIAG-EQUIP-VS-INVENTORY.md`（问题证据）、`PLAN-OPERATION-CONTEXT-v2.md`（上下文架构）。

## 1. 已完成（不要重做）

Bungie 数据面（`src/bungie/`）、Host 数据层（`src/host/`）、`/characters` `/inventory` 走宿主、`/item` `/action` 走 MCP、InventoryPanel 替代 Legacy、三档响应式、拖拽、详情卡、筛选排序、0.8.5 已打包并真机装过一次。

## 2. 数据契约（先定，再改代码）

### 2.1 两个正交维度

- **分类**：这件东西是什么？（Manifest 定义）
- **位置**：它此刻在哪？（profile 组件）

现在的实现把两者混成了一个 `bucket` 字符串，所以装备混排、Vault 全成"一般"。

### 2.2 字段与权威来源

```ts
interface ItemPlacement {
  /** 它此刻在哪。由"出现在哪个组件"决定，不由任何 hash 推断。 */
  kind: 'equipped' | 'inventory' | 'vault' | 'postmaster'
  /** 角色 id（vault 为 null）。保留 Bungie 原始 id，不用职业名代替。 */
  characterId: string | null
  /** 只有 kind==='equipped' 时存在：205 条目的 bucketHash。 */
  slotHash: number | null
}

interface ItemRow {
  // …现有字段
  /** 分类桶：Manifest inventory.bucketTypeHash。分组、搜索、拖拽目标都用它。 */
  inventoryBucketHash: number | null
  /** 位置语义。 */
  placement: ItemPlacement
  /** 是否出现在 characterEquipment。null = 该组件没加载，不是"没装备"。 */
  equipped: boolean | null
  /** 300 的 isEquipped，仅作诊断展示，不参与任何判定。 */
  upstreamEquipped: boolean
}
```

| 字段 | 唯一来源 | 不能用的东西 |
|---|---|---|
| `inventoryBucketHash` | Manifest `DestinyInventoryItemDefinition.inventory.bucketTypeHash` | profile 组件的 `bucketHash`（vault 物品恒为 General） |
| `placement.slotHash` | `characterEquipment[charId].items[i].bucketHash`（205） | 300 的 `isEquipped`（对所有装备为真，且不含槽位） |
| `placement.kind` | 物品来自哪个组件（102/201/205/邮政官） | 任何 hash 推断 |
| `characterId` | 组件键（`characterEquipment` / `characterInventories` 的 map key） | 职业名、classType |
| `equipped` | 是否出现在 205 | `isEquipped`、类型推断 |

### 2.3 缺失语义

- 205 组件**没请求或没返回** → 所有 `equipped = null`，UI 显示"装备状态未知"，**不得**显示成"全部未装备"；
- Manifest 不可用 → `inventoryBucketHash = null`，分组退回 `type`，并在 `/status` 报 `manifest.available=false`；
- 这两条各有测试（见 §4）。

## 3. 待做（文件级）

1. `src/bungie/profile.ts`
   - 解析 205 时同时记录 `slotHash`（条目自身的 `bucketHash`）；
   - 区分"组件缺失"与"组件为空"：缺失 → `equipmentState: 'unavailable'`，空数组 → `'loaded'`（0 件）。
2. `src/bungie/manifest.ts`
   - 无需改动（`item().bucketTypeHash` 已有），确认 `bucketTypeHash` 在 `ItemDefinition` 里被暴露（当前**没有**，需要加）。
3. `src/host/dto.ts`
   - 用 `manifest.item(hash).bucketTypeHash` 填 `inventoryBucketHash`；
   - 产出 `placement`，不再用 `location` 字符串；
   - `equipped` 三态。
4. `src/mcp/types.ts`
   - `ItemRow` 增加上述字段（保留旧字段一个版本会违反"禁兜底"，所以**直接替换** `location`/`bucket`，前端同步改）。
5. `src/client/filter.ts`
   - `sectionOf` 与 `buildSections` 改用 `inventoryBucketHash` 分组；
   - 装备不再单独成行，而是行内状态（见 §5 的显示规则）。
6. `src/client/InventoryPanel.tsx` / `ItemDetail.tsx`
   - 已装备标识从 8px 圆点升级为明显边框 + tooltip 显示槽名；
   - 三态展示（已装备 / 未装备 / 状态未知）。

## 4. 验收

### 4.1 数据层（自动化）

- 每个角色 `equipped` 数量 = 17（3 武器 + 5 护甲 + 9 其他），且 `slotHash` 互不重复；
- 任意 `equipped=true` 的物品，其 `placement.kind === 'equipped'` 且 `characterId` 与该角色一致；
- `instanceId` 全局唯一，不存在一条同时是 equipped 与 inventory；
- vault 物品的 `inventoryBucketHash` 分布中出现武器桶（1498876634 / 2465295065 / 953998645）与护甲桶，**不再有 1295 件落在 138197802**；
- 205 缺失时 `equipped === null`（可用裁剪组件的 fixture 测）。

### 4.2 真机

- 三个角色各自的三个武器槽与五个护甲槽都能一眼看出是哪件；
- 同一行里装备与携带可区分（不是靠一个小点）；
- 仓库区能按武器/护甲/消耗品真正分开；
- 切换角色后装备区随之变化。

### 4.3 实测结果（2026-11-04，真实账号，已通过）

| 指标 | 修复前 | 修复后 |
|---|---|---|
| 总数 | 1924 | 1924 |
| Vault 分类 | `{一般: 1295, 改装模组: 50, 消耗品: 46}` | `{能量武器 417, 动能武器 322, 威能武器 205, 腿部护甲 104, 臂铠 76, 职业护甲 68, 胸部护甲 55, 改装模组 50, 头盔 48, 消耗品 46}` |
| Vault 武器 / 护甲 | 分不出 | **944 / 351** |
| 装备状态分布 | boolean（无 unknown） | `equipped 51 / not_equipped 1873 / unknown 0` |
| 每角色装备 | 17 件，无槽位信息 | 17 件，**17 个唯一 slotHash**，其中武器 3、护甲 5 |
| 装备/携带矛盾 | 未检查 | **0** |

## 5. 显示规则（P0 只做到"可辨识"，不做分区大改）

- **装备仍留在原分类行里**（用户已否决"三个纵向大面板"）；
- 已装备：该物品卡加明显边框 + 右上角槽位标识，行内排在最前；
- 未装备：常规显示；
- 状态未知：整片区域提示"装备状态未加载"，不是把物品画成未装备。

## 6. DSH 右栏调查结论（P2 的输入，不含实现）

已确认（读 `@deepseek-ai/dsh-client-ui-layout` 与 `dsh-client-ui-sidebar-right` 源码）：

| 事实 | 证据 |
|---|---|
| 右栏是会话视图容器，不是通用面板槽 | `sidebar-right` 注册 `{ name:"rightbar", children:{ "rightbar.session": { kind:"single", scope:"session" } } }`，内部 `<SessionProvider session={view.reference}>` |
| 有 `ctx.sidebarRight` 服务 | `ctx.reflect.provide("sidebarRight", controller)`，来自 `createSidebarRightController`，返回 `{ controller, adopt, forget, show, measure }` |
| 有 `show(sessionId)` | 内部用它把选中的会话放到右栏：`show(activePanelId === null ? selected?.sessionId : undefined)` |
| 右栏开关在 layout actions | `openRightbar` / `closeRightbar`，置 `rightbarShown` / `rightbarTrack` / `rightbarFullscreen` / `rightbar` |
| 右栏宽度公式 | `computeColumns(viewport, sidebar, layoutInfo.rightbarTrack ? rightbarPreference : 0, …)` → 没 track 就是 0 宽 |
| 无 `toggleRightbar` | 只有 open/close 一对 |

**待验（P2 开始前必须做，不能猜）**：

1. `ctx.sidebarRight.show(sessionId)` 的完整前置条件（是否必须先 `adopt` / `pin`，插件侧 `inject` 能否直接拿到该服务）；
2. `ctx.layout.actions.openRightbar` 的签名与权限（插件调用是否被允许，还是仅宿主内部）；
3. 关闭右栏后 Session 是否保活（`retainMainPanels` 的语义在这里是否同样适用）。

## 7. 明确不做

- 不重做 Workspace Shell / 左导航 / 右栏布局（宿主已有）；
- 不在 P0 做 View Event、Journal、Insight（P3/P4）；
- 不引入虚拟列表；
- 不为 P0 新建 `app/` `navigation/` `workspace/` 目录。

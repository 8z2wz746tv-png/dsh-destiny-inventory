# DIM vs 我们：仓库功能差距（2026-11-06）

来源：`~/项目/DestinyItemManager/DIM/src/app/`（1103 个 ts/tsx，23.5 万行）
我们：`src/client` + `src/host`（约 5000 行）

## 一、搜索：152 个关键词 vs 1 个名字框

DIM `src/app/search/items/search-filters/` 有 17 个文件，关键词 152 个：

```
is:dupe is:godroll is:junk is:locked is:equipped is:crafted is:masterwork
is:armor3.0 is:weapon is:armor is:engram is:shader is:mod
stat:range:>=50 stat:reload:max basestat:total:>=60
perk:"快速拔枪" perkname:  -perk:
season:>=15 source:raid source:nightfall
light:>=550 power:>=1800
ammo:primary ammo:special element:solar breaker:overload
class:hunter class:warlock
notes:  description:  name: exactname:
count:>=3 dupelower: dupeperks: extraperk: curated: wishlist:
```

**我们**：`filters.search` 只做 `name.toLowerCase().includes(...)`。

差距：搜索是这个工具的**主要入口**，DIM 用户多数操作靠打字完成（`is:dupe is:junk`），点选是少数。这是最大的一块。

## 二、标记体系：5 种 vs 0 种

DIM `dim-item-info.ts` 的 `tagConfig`：

| tag | 含义 | 快捷键 |
|---|---|---|
| favorite | 青睐 | shift+1 |
| keep | 保留 | shift+2 |
| junk | 垃圾 | shift+3 |
| infuse | 灌注 | shift+4 |
| archive | 归档 | shift+5 |

存在 **IndexedDB**（本地），不写 Bungie。可以批量打、可以按标签筛选、可以按标签排序。

**我们**：只有 Bungie 原生的 `locked`（布尔）。没有自己的标记层。

## 三、排序：17 维 vs 3 维

DIM：typeName / rarity / primStat / amount / rating / classType / ammoType / name / tag / season / acquisitionRecency / elementWeapon / breakerType / masterworked / crafted / deepsight / featured / tier / armorArchetype / weaponFrame

**而且**：`sortOrder` 是**数组**（多级排序，`['primStat', 'name']`），每一项可升降序。

**我们**：`power-desc` / `name-asc` / `type-asc` 三个写死的。

## 四、批量操作：没有

DIM `bulk-actions.tsx`：`bulkTagItems`（批量打标签）、`bulkLockItems`（批量锁定/解锁）。
入口是**框选**（拖一个矩形选中多件）+ 全选。

**我们**：只能一件一件拖或点。

## 五、对比视图：没有

DIM `src/app/compare/`（12 个文件）：选 2-3 件同类武器，并排比较**每一栏的 perk 与数值**，推荐"哪件更好"。

**我们**：详情卡一次只看一件。

## 六、整理器（表格视图）：没有

DIM `src/app/organizer/`（9 个文件）：把物品摊成**表格**，82 处列定义——可以按任意列排序、筛选、批量操作。适合"一次比较 20 把同款手炮"。

**我们**：只有网格。

## 七、物品弹窗：112 文件 vs 我们的 1 张卡

DIM 的 `item-popup/` 里有而我们**没有**的：

| 组件 | 作用 |
|---|---|
| `EnergyMeter.tsx` | 护甲能量条 + 升级消耗 |
| `SetBonus.tsx` | 套装 2/4 件效果 |
| `WeaponCatalystInfo.tsx` | 异域催化进度 |
| `WeaponCraftedInfo.tsx` | 锻造等级/进度 |
| `WeaponDeepsightInfo.tsx` | 深视共振进度 |
| `NotesArea.tsx` | 给这件物品写备注 |
| `ItemTagSelector.tsx` | 打标记 |
| `ItemMoveAmount.tsx` | 堆叠物品选数量再移动 |
| `ItemExpiration.tsx` | 限时物品倒计时 |
| `SocketDetails.tsx` | 点开插槽看**全部可选项**并**安装** |
| `ApplyPerkSelection.tsx` | 一键切换到某套 perk |
| `ItemTalentGrid.tsx` | D1 天赋网格 |
| `EmblemPreview.tsx` | 徽章大图 |
| `MetricCategories.tsx` | 成就/记录 |
| `ItemSocketsWeapons.tsx` / `ItemSocketsGeneral.tsx` | 武器/通用两套插槽渲染 |

我们有的：属性条、perk 列（只读）、击杀数、固有效果、装备/锁定。

**关键差别**：DIM 的插槽是**可点的**——点开能换 perk、装模组（走 `advanced-write-actions`）。我们的只能看。

## 八、其他没做的

- `locate-item.ts`：从别处跳过来定位并高亮某件物品
- `manual-moves.ts`：手动移动过的东西不被自动整理覆盖
- `cross-tab.ts`：多标签页同步（一个标签里移动，另一个标签也更新）
- `SyncTagLock.tsx`：标记与锁定状态互相同步
- `item-feed/`：物品流水（最近获得）
- `wishlists/`（10 文件）：愿望单（标记"我想要这件"，并自动判断某件是否命中）
- `item-triage/`：把一件物品归类——保留/拆解/灌注/上架，比五档标记更细
- `farming/`：刷取模式，盯着某个活动掉落，满了自动腾格子
- `loadout-builder/`：配装求解器（这个我们有 MCP 侧）
- `store-stats/`（21 文件）：仓库统计（按类型/赛季/稀有度分布）
- `infuse/`：灌注推荐（哪件喂给哪件）
- `farming/`：刷取模式（"我在刷这把枪，帮我盯着"）
- `hotkeys/`：全局快捷键
- `settings/`：设置页（我们一个都没有）
- 多语言：DIM 有 10 种语言，我们只有中文硬编码

## 按投入产出排的优先级

**该做的（影响日常使用）**：
1. **搜索语法**（`is:locked`、`perk:`、`stat:` 这批）——最高频
2. **标记体系**（favorite/keep/junk/infuse/archive，本地存）——中等工作量，改变整理方式
3. **插槽可点选**（在卡片里换 perk/模组）——需要写接口，但 DIM 的核心交互
4. **批量选择**（框选 + 批量锁定/标记）

**可以后放**：
5. 多级排序（数组 + 升降序）
6. 对比视图
7. 表格视图
8. 护甲能量条、套装加成

**没必要**：
- D1 相关（天赋网格、D1 商店）
- 多语言（你不是多语言用户）
- 设置页（用代码里的默认值就行）
- cross-tab（DSH 面板不是多标签场景）

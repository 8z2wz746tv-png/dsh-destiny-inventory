# P0 数据审查（搜索 / 护甲）

2026-11-10。**只做审查，没写功能代码。** 基线 `1912344`。

按计划的要求：动 UI 之前先确认数据在不在。两条线的结论都是「不在，但原因不一样」。

## 一、搜索：数据在，被一道门挡住了

计划要求搜索覆盖「当前 Perk + 可切换 Perk + Perk 描述」。查下来：

### `/item` 实际返回什么

拿「弑后者」（线性融合步枪）实测，8 个插槽列，**每一列的 `options` 只有 1 个**，
而且 `optionsAvailable` 全是 `false`：

```
固有特性   options=1  available=False
scopes     options=1  available=False
电池       options=1  available=False
框架       options=1  available=False
stocks     options=1  available=False
```

### 为什么

`src/host/item-detail.ts` 第 101 行：

```ts
const perkSocket = isPerkCategory(definition.plugCategoryIdentifier)
const hashes = perkSocket
  ? [socket.plugHash, ...socket.options.filter((h) => h !== socket.plugHash)]
  : [socket.plugHash]     // ← 不是"perk 类"就只给当前那个
```

而白名单只有：

```ts
new Set(['barrels', 'magazines', 'frames', 'origins', 'intrinsics', 'barrel', 'magazine', 'frame'])
```

`scopes` / `batteries` / `stocks` / 各种 `v400_*` **都不在里面**。所以这些槽位的
`socket.options`（310 组件的可选池）**已经读进来了，但没往外展开**。

### 结论

- **310 组件在请求里**（`ITEM_DETAIL_COMPONENTS` 含 `itemReusablePlugs`），也**解析了**
  （`readSockets` 读 `reusable.plugs[index]`），数据没丢。
- 丢的是**出口**：`item-detail` 只对白名单里的类别展开选项。
- 所以搜索要拿到「可切换 Perk」，**要么放宽这个白名单，要么在搜索索引里直接用 `socket.options`**。
  这是数据层的决定，不是前端的事。

**Perk 描述**：8 个选项全带 `description`，这一项没问题。

## 二、护甲：三个字段一个都没有

拿「圣贤保护者臂环」实测，`ItemDetailView` 的全部键：

```
ammoType columns crafted damageIcon damageType description enhanced equipped frame
gearTier hash icon id instanceId intrinsic itemLevel killCount kind location
locked masterwork name power quantity rarity rollSummary stats weaponType
```

**没有能量值、没有能量上限、没有元素属性、没有套装。** 六维 stats 有，但那是属性不是能量。

`columns` 有 7 列（模组插槽），每列 1 个选项——同搜索那个问题，模组池也没展开。

### 能量条需要什么

| 要展示 | 数据在哪 | 现状 |
|---|---|---|
| 当前能量 | 必须来自 Bungie（实例级） | **DTO 里没有** |
| 能量上限 | 同上 | **没有** |
| 元素属性 | 护甲定义的 `energyType` 或插槽 plug | **没有** |
| 已装模组与消耗 | 305 的 plug + 定义里的能量消耗 | 部分有（插槽在，消耗没解析） |

**结论**：能量条不是"画一个条"的事，是先把四个字段从 Bungie 读进来。
按计划的约束「不允许前端猜测」，这一条没有捷径。

## 三、套装：数据源比预想的更空

这是计划里点名的高风险项，查下来**确实是**。

在 zh manifest（2025-09-13，38894 条定义）里按字段名逐个查：

| 字段 | 命中 |
|---|---|
| `setItems` | **0** |
| `equipableItemSet` | **0** |
| `equipableItemSetHash` | 840 条命中，但**抽样 400 条全是 null 或 0** |
| `setBonus` / `setPerks` / `armorSet` | **0** |

也就是说：**这套 manifest 里没有任何一条护甲带着可用的套装标识。**

### 这意味着什么

1. **不能靠名称相似判断**——计划里已经写了不行，现在更没得商量。
2. **不能靠这个 manifest 做套装识别**。要么 manifest 版本不含这批数据（Destiny 的
   套装加成是较新机制），要么字段在别的地方（`DestinyEquipableItemSetDefinition` 这类）。
3. **在确认之前，护甲详情的「套装」区域不能做。** 按计划的原话：先确认数据源，
   不能先画 UI 再找数据。

### 建议的下一步（二选一，需要拍板）

- **甲**：先花半天查 `DestinyEquipableItemSetDefinition` 是否存在、是否含成员与效果描述。
  有的话，套装区域可以按数据做。
- **乙**：这一版不做套装，护甲详情只做能量条 + 模组。
  **明确标成"暂不支持"，而不是让模型推断数值。**

## 四、对计划的影响

| 计划项 | 状态 |
|---|---|
| 搜索：名称 / 类型 / Perk 描述 | 数据齐，可直接做 |
| 搜索：当前 Perk | 数据齐 |
| 搜索：可切换 Perk | **要先把 `isPerkCategory` 的门放宽，或索引直接用 `socket.options`** |
| 护甲：能量条 | **要先扩 DTO 四个字段** |
| 护甲：模组信息 | 部分齐（插槽在，能量消耗没解析） |
| 护甲：套装 | **数据源未确认，阻塞** |

**两条线都不是"前端展示"工作量，都要先动数据层。** 这和计划里"优先复用现有 /details，
不新增不必要的后端接口"的前提冲突——现状不是接口多余，是字段缺失。

## 五、这轮没做的

没改任何代码。没碰 `item-detail.ts` 的白名单（那是搜索线的第一个决定，应该先有结论）。
没装新依赖。没查 Bungie 的 live 响应（token 过期，且字段问题在 manifest 侧就已经确定了）。

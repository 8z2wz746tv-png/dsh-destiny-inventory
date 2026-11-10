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

## 三、套装：数据齐全，我上一版查错了表

**修正**：上一版这里写着「manifest 里没有套装标识」，那是错的。我只查了
`DestinyInventoryItemDefinition`，而套装在一个**独立表**里。

### 真正的数据源

这份 sqlite 有 **83 张表**，其中包括 `DestinyEquipableItemSetDefinition`：

- **56 个套装**
- 每个带 `displayProperties.name`（中文名）、`setItems`（成员）、`setPerks`（分档效果）
- `setPerks` 每档是 `{ requiredSetCount, sandboxPerkHash }`
- `sandboxPerkHash` 指向 `DestinySandboxPerkDefinition`（也在库里，有名字与描述）

实测「兴旺幸存者」：

```
成员 15 件（护臂 / 胸甲 / 腿铠 / 风帽 …）
2 件 → 开场表演：使用手雷造成最后一击会为热量武器提供稳定性和排气速度加成…
4 件 → 房间清空：使用热量武器或主弹药武器造成多次最后一击…
```

### 两件必须知道的事

1. **关系是反的**。`DestinyInventoryItemDefinition` 里的 `equipableItemSetHash` 全是 null，
   所以**不能从物品查套装**——要从套装表的 `setItems` **反向建索引**。
   840 条 (套装, 成员) 关系，正好覆盖 56 个套装。
2. **`setItems` 存的是无符号 hash**，表里的 `id` 是有符号的。反查必须先转换：

   ```
   signed = h - 2**32 if h >= 2**31 else h
   ```

   `2419726011` → `-1875241285` → 兴旺幸存者护臂。不做这个转换，反查会全部落空。

### 所以套装能不能做

**能。** 不再是阻塞项。剩下的只是实现：建反向索引、读 `setPerks`、取
`sandboxPerkDefinition` 的描述。

「圣贤保护者臂环」不在任何套装里——那是普通掉落护甲，正常，不是数据缺失。

## 四、对计划的影响

| 计划项 | 状态 |
|---|---|
| 搜索：名称 / 类型 / Perk 描述 | 数据齐，可直接做 |
| 搜索：当前 Perk | 数据齐 |
| 搜索：可切换 Perk | **要先把 `isPerkCategory` 的门放宽，或索引直接用 `socket.options`** |
| 护甲：能量条 | **要先扩 DTO 四个字段** |
| 护甲：模组信息 | 部分齐（插槽在，能量消耗没解析） |
| 护甲：套装 | **数据齐全**（`DestinyEquipableItemSetDefinition`），要反向索引 |

**两条线都要先动数据层，但性质和程度不同**：

- 搜索：数据已经在内存里（`socket.options`），只是没往外给——改的是**出口**。
- 护甲能量：Bungie 侧字段要新读，**真缺**。
- 套装：数据齐全，只是没人读这张表——改的是**读取**，不是数据本身。

所以计划里"优先复用现有 /details"这个前提，对套装成立，对能量条不成立。

## 五、这轮没做的

没改任何代码。没碰 `item-detail.ts` 的白名单（那是搜索线的第一个决定，应该先有结论）。
没装新依赖。没查 Bungie 的 live 响应（token 过期，且字段问题在 manifest 侧就已经确定了）。

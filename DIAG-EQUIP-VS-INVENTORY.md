# 诊断：装备区与携带区没有分开（2026-11-04，只读，未改代码）

实测数据来自真实账号（1924 件），脚本为一次性诊断，已删除。

## 一、现象（用户看到的两处）

### 1. 武器：装备的那把被混进"手炮/狙击/火箭"行

猎人当前装备的三把武器：

| 槽位 | 物品 |
|---|---|
| 动能武器 | 命运终结者（失时） |
| 能量武器 | 隐秘追猎 |
| 威能武器 | 光芒复仇 |

但界面按 `type` 分行，它们分别落进「手炮」「狙击步枪」「火箭发射器」三行，和该角色背包里同类型的枪混排。

### 2. 护甲：五个槽位全部与携带物混排

| 角色 | 装备护甲 | 该角色护甲总数 |
|---|---|---|
| 猎人 | 5 件（头盔/臂铠/胸甲/腿甲/披风） | 46 |
| 术士 | 5 件 | 50 |
| 泰坦 | 5 件 | 49 |

每个槽位行里是「1 件装备 + 6~10 件携带」，装备只靠物品卡右上角一个 8px 圆点区分。

## 二、混排的规模（实测）

同一 `(角色, 物品类型)` 单元里同时存在装备与携带的，共 **42 个**：

```
hunter 手炮     eq=1 carried=2
hunter 狙击步枪  eq=1 carried=2
hunter 火箭发射器 eq=1 carried=2
hunter 头盔     eq=1 carried=8
hunter 臂铠     eq=1 carried=8
hunter 胸部护甲  eq=1 carried=10
hunter 腿部护甲  eq=1 carried=6
hunter 猎人披风  eq=1 carried=9
hunter 机灵外壳  eq=1 carried=9
hunter 载具     eq=1 carried=10
hunter 飞船     eq=1 carried=9
hunter 猎人分支职业 eq=1 carried=5
…（术士、泰坦同形，共 42 个）
```

## 三、根因（代码位置）

1. **分组键里没有"是否装备"**。`src/client/filter.ts` 的 `buildSections`：
   - 行键 = `item.type`（手炮、头盔……）
   - 列键 = `item.location`（hunter / warlock / titan / vault）
   - `item.equipped` 只用于物品卡的小圆点，**不参与分组**

2. **DTO 的 `location` 只有"在谁身上"**。`src/host/dto.ts`：
   ```ts
   location: source.location === 'vault' ? 'vault' : className
   ```
   它把角色 id 换成了职业名，且没有"装备在哪一格"的信息。`equipped: boolean` 是唯一区分，属于位置语义被压成了布尔。

3. **没有槽位概念**。装备的真实槽位是 bucket（动能/能量/威能、头盔/臂铠/胸甲/腿甲/职业物品），而分组用的是 `type`（手炮/头盔），两者不是一回事：动能与能量都可能是手炮。

## 四、另一个数据层问题：仓库物品的 bucket 全成"一般"

实测：

```
VAULT BUCKETS: {"一般":1295, "改装模组":50, "消耗品":46, "":13}
```

1404 件仓库物品里 **1295 件的桶名是「一般」**。

原因：`toItemRow` 用的是 profile 组件里返回的 `item.bucketHash`。Bungie 对仓库物品返回的 `bucketHash` 是 General（138197802），**真实归属要看 Manifest 定义的 `inventory.bucketTypeHash`**。

影响：

- 仓库区无法按桶分类（武器与护甲分不开），只能靠 `type` 兜底；
- 将来拖拽落点、Agent 上下文里的"这件东西该放哪"都会读错；
- 护甲区的问题在仓库侧同样存在，只是被"一般"这个桶名盖住了。

## 五、建议的改造顺序（未执行）

按"先修数据模型，再修 UI"：

1. **DTO 的位置语义**（`src/bungie/profile.ts` → `src/host/dto.ts`）：
   ```ts
   type ItemPlacement =
     | { kind: 'equipped'; characterId: string; slotHash: number }
     | { kind: 'inventory'; characterId: string; bucketHash: number }
     | { kind: 'vault'; bucketHash: number }
   ```
   `characterId` 保留原始 id（不再用职业名代替），职业名只作展示。
2. **bucket 来源换成 Manifest 定义**：`manifest.item(hash).bucketTypeHash`，profile 的 `bucketHash` 不再作为归属依据。
3. **分组改造**（`filter.ts`）：
   - 装备区：每角色固定槽位（武器 3 + 护甲 5 + 其他装备槽），一格一件；
   - 携带区：按 bucket 分类，不再与装备混行；
   - 仓库：独立，按 bucket 分类。
4. **UI**：装备区在上、携带区在下；`equipped` 从"小圆点"升级为"独立区域"。
5. 保持现有 API 契约、卡片组件、筛选与操作机制不变。

## 六、明确不做

- 不在这一轮重做整个背包；
- 不改 `/characters` `/inventory` 的响应字段（只改字段语义与取值来源）；
- 不引入 Smart Moves、Agent Insight。

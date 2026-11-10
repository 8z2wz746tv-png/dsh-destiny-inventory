# 护甲能量字段审查

2026-11-10。**只查不动代码。** 基线 `d93a5ef`。

## 结论先说

**能量数据已经在我们的请求里了，只是没解析。**

`INVENTORY_COMPONENTS` 已经请求组件 300（`itemInstances`），而能量就挂在那个组件上。
我们的 `RawInstance` 类型只声明了四个字段（`gearTier` / `itemLevel` / `isEquipped` /
`primaryStat`），解析时把别的一律丢掉——`energy` 就在被丢掉的那部分里。

供给侧的现成参考：同一个作者写的 destiny2-mcp 已经把这件事做完了，实测输出见下。

## 五问五答

### 1. 权威来源：哪张表、哪个字段

| 字段 | 来源 | 说明 |
|---|---|---|
| 当前能量 / 上限 / 剩余 | **组件 300**（`DestinyItemInstanceComponent.energy`） | 实例级，三个数一起给 |
| 能量元素类型 | 组件 300 的 `energyTypeHash` → **`DestinyEnergyTypeDefinition`** | 本地 sqlite 有 7 条：虚空 / 烈日 / 电弧 / 任何 / 机灵 / 分支职业 |
| 每个模组的消耗 | 模组定义（`DestinyInventoryItemDefinition` 的插槽能耗） | 与插槽一起渲染 |

**`DestinyInventoryItemDefinition` 里没有能量字段**——实测 38894 条定义里，带
`"energy":` 的护甲是 **0 条**。这一点必须先说清楚，否则会去查错表（我第一版就是这么错的）。

### 2. 实例数据 vs 定义数据

**能量是实例的，不是定义的。** 同一件护甲，升级前上限 8、升满后上限 11——
所以它只能来自 300，不可能来自 Manifest。

「能量上限」和「当前能量」是三个独立数字，组件直接给全：

```
energy: { capacity: 11, used: 10, unused: 1, type_hash: 4069572561 }
```

`used` 是已装模组消耗之和，`unused` 是剩余。**不要去算，去读**——
自己把 `energy_cost` 加起来，一旦漏了某个不耗能的槽（着色器、皮肤）就会对不上。

### 3. API 获取路径

| 环节 | 现状 |
|---|---|
| `components.ts` 的 `INVENTORY_COMPONENTS` | **已含 300** ✓ |
| `profile.ts` 的 `RawInstance` | 只声明了 4 个字段，**energy 被丢弃** ✗ |
| `profile-item.ts` 组装 `ProfileItem` | 没有 energy ✗ |
| `ItemRow` / `ItemDetailView` | 没有 energy ✗ |
| 前端详情卡 | 没有 ✗ |

**缺口在第二行**，后面全是它的下游。

### 4. 在哪一层接入

`RawInstance` → `ProfileItem` 是**唯一**该动的地方（`profile-item.ts` 第 42 行附近，
`gearTier` / `itemLevel` 那两个字段就是从同一处读的）。

再往上分两路：

- **格子不显示能量**——`ItemRow` 不加字段。
- **详情卡显示**——`ItemDetailView` 加，`item-detail.ts` 从 `ProfileItem` 带过去。

这样 `ItemRow` 保持"渲染只需位置与角标"的边界，不会被护甲专用字段撑大。

### 5. 异常情况

| 情况 | 怎么办 |
|---|---|
| 非护甲（武器） | 300 的 `energy` 不存在 → 字段缺席，**不是 0** |
| 旧护甲 / 未升级 | `capacity` 可能低于 11，正常 |
| 实例数据缺失 | 整个 `energy` 缺席 → 详情卡不画能量条，**不补 0** |
| 职业护甲（臂环/披风/印记） | 同样有 energy，实测示例就是臂环（capacity 11） |
| 元素类型未知的 hash | 查 `DestinyEnergyTypeDefinition` 落空 → 只显示数字，不猜颜色 |

## 实测样本（destiny2-mcp 的输出，同一账号）

「圣贤保护者臂环」：

```
energy: { capacity: 11, used: 10, unused: 1, type_hash: 4069572561 }
set:    圣贤保护者（4222859846）
        2 件 → 战斗冥想
        4 件 → 利刃专注
sockets: 近战模组 3 / 时间膨胀 3 / 时间膨胀 3 / 投弹手 1
         （3+3+3+1 = 10 = used ✓）
```

**四个模组加起来正好等于 `used`**，说明 `used` 是可信的、不用自己算。

## 套装：我上一版又错了一处

上一版写「圣贤保护者臂环不在任何套装里」。**错了**，它在「圣贤保护者」里。

原因：我用 `LIKE '%圣贤保护者臂环%'` 去查 item 定义，命中的是同名的
**「同调圣贤保护者臂环」**（id `-1851987670`），不是本体（id `1887527934`）。
拿错 hash 去反查套装，当然落空。

**这条要记下来**：`LIKE` 模糊匹配在中文名上会撞到同系列物品。查 hash 必须用
**精确的 `id` 等值**，不能用名字模糊找。

## 字段审查表（最终）

| 字段 | Bungie 来源 | 当前是否获取 | 后续处理 |
|---|---|---|---|
| 当前能量 `used` | 组件 300 `energy.energyUsed` | **响应里有，解析时丢弃** | `RawInstance` 加字段，`ProfileItem` 透传 |
| 能量上限 `capacity` | 组件 300 `energy.energyCapacity` | 同上 | 同上 |
| 剩余 `unused` | 组件 300 `energy.energyUnused` | 同上 | 同上（可选，`capacity - used` 等价但要读原值） |
| 元素类型 | 组件 300 `energy.energyTypeHash` → `DestinyEnergyTypeDefinition` | hash 有，名称没查 | `lookup` 加一个 `energyType()` |
| 已装模组 | 组件 305（已有）+ 定义 | ✓ 已有 | 详情卡已有插槽列，补 `energy_cost` |
| 模组能量消耗 | 模组定义 | 部分（305 有 plug hash，没读消耗） | 从 plug 定义取 |

## 工作量估计（相对）

- `RawInstance` 加 `energy` + `ProfileItem` 透传：**几行**，风险在"别的地方会不会被这个字段影响"——不会，是新增可选字段。
- `ItemDetailView` 加三栏：**DTO 变更**，破例但可控（详情卡是单点消费）。
- 详情卡画能量条：**纯 UI**，数据齐了之后是简单活。
- 元素名查表：**一个新方法**，照 `damageType()` 的写法。

**没有一项需要新的 Bungie 请求。** 组件 300 已经在每次 `/inventory` 里。

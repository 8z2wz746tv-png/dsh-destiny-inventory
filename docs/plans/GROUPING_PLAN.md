# 分组：DIM 的真实结构与我们的落点

写这份是因为我连着改坏四轮，全是在猜。下面每条都带 DIM 源码位置。

## DIM 到底怎么排的

`src/app/inventory-page/StoreBucket.tsx` 里，一个 `StoreBucket` 是**「某个 store 在某个桶里」的一格**：

```tsx
<StoreBucket>
  {equippedItem && <div className="equipped-item">…</div>}   // worn 格
  <StoreBucketDropTarget grouped={isVault && vaultWeaponGroupingEnabled}>
    {unequippedItems.map(item =>
      'id' in item
        ? <StoreInventoryItem/>                    // 没分组：直接一个物品
        : <div className={styles.vaultGroup}>      // 分组：一个块
            <WeaponGroupingIcon icon={item.icon}/> // 块首图标
            {item.items.map(i => <StoreInventoryItem/>)}
          </div>
    )}
  </StoreBucketDropTarget>
</StoreBucket>
```

三条关键事实：

1. **行 = 桶**（动能武器 / 能量武器 / 威能武器 / 头盔 / 胸甲 …），不是武器类型。
2. **分组发生在 vault 那一格的内部**：`grouped={isVault && enabled}`，角色格永远是 `grouped={false}`。
3. **图标是块首，在格子内部**，不是行首。

`groupWeapons` 只包了 vault 的武器：

```tsx
const unequippedItems =
  isVault && bucket.inWeapons
    ? groupWeapons(sortItems(items))     // ← 只有 vault 且是武器桶
    : sortItems(isVault ? items : items.filter((i) => !i.equipped));
```

护甲在 vault 里按职业分，是另一个组件（同文件下方注释：「For armor in the vault, we separate items by which class they belong to」）。

## 我错在哪

| 我以为 | 实际 |
|---|---|
| 一行 = 一种武器类型 | 一行 = 一个桶；类型是 vault 格内的块 |
| 分组要作用于整行（四列一起） | 只作用于 vault 那一格，角色格不分组 |
| 图标在行首 | 图标在**格内块首** |

第二轮我甚至用"行跨四列所以必须全局"说服自己——那是**在我的实现里**成立，在 DIM 的模型里根本不存在这个约束。

## 落点

改**一个函数**，不碰行结构、不碰 CSS 布局：

```ts
// filter.ts —— cell 多一段
interface StoreCell {
  …
  /** vault 格内按分组切出来的块；其他 store 恒为空。 */
  segments: { label: string; icon: string | null; items: ItemRow[] }[]
}
```

`makeCell` 对 `flex`（vault）的格子调 `segmentOf(items, kind)`，其余格子 `segments: []`。

`renderCell` 在 vault 格里，`segments` 非空就逐块渲染（块首图标 + 该块物品），否则走现在的平铺。

## 三种分组

| 段 | 依据 | 图标来源 |
|---|---|---|
| 武器（vault） | `item.type`（`itemTypeDisplayName`） | `destiny-icons/weapons/*.svg`，按 category hash |
| 护甲（vault） | `classType`（0 泰坦 / 1 猎人 / 2 术士 / 3 通用） | `destiny-icons/general/class_*.svg` |
| 其他 | 不分段 | — |

## 不做的

- **不加设置项**：DIM 那个「保险库武器分组方式」下拉有六种模式，我们先只做它默认的行为（按类型/按职业）。要别的模式再说。
- **不动 `emptyShelfSections`**：邮政官和记忆水晶是货架，不分组。

## 验证方式

改完必须做三件事，缺一不算完：

1. `tsc --noEmit` + `pnpm test` 绿
2. 真机跑一次 `buildSections`，断言 vault 块的标签（手炮/弓/…、泰坦/猎人/术士）
3. **截图确认**：角色列的 worn + 3×3 还在，vault 格内出现块首图标

第 3 条是我前几轮唯一没做的，也是坏掉的原因。

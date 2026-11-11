/**
 * 玩家拥有某个套装的几件。
 *
 * **按部位去重**：同部位的重复掉落只算一件——套装效果认的是"身上有几个不同部位"，
 * 两件同款胸甲不会让 2 件档生效。仓库里囤十件同样的腿甲也还是 1。
 *
 * 算的是**拥有**（仓库 + 背包 + 身上），不是**装备中**：详情卡回答的是
 * 「我还差几件」这种仓库整理问题，而不是"此刻身上几条"。两者会不同，
 * 想知道当下生效状态要看角色身上穿的那几件——那是配装页面的事。
 */
import type { ProfileItem } from '../bungie/profile'
import type { ArmorSet } from '../bungie/item-sets'

/**
 * @param items - 全量物品行。
 * @param armorSet - 由物品 hash 查它所属的套装，没有就返回 `null`。
 * @returns 套装 hash → 拥有的不同部位件数。
 */
export function countSets(
  items: ProfileItem[],
  armorSet: (itemHash: number) => ArmorSet | null,
): Map<number, number> {
  const bySlot = new Set<string>()
  const counts = new Map<number, number>()
  for (const item of items) {
    const set = armorSet(item.itemHash)
    if (set === null) continue
    // 同一个套装 + 同一个部位 = 一件，不论掉了几份。
    const slot = `${set.hash}:${item.bucketHash}`
    if (bySlot.has(slot)) continue
    bySlot.add(slot)
    counts.set(set.hash, (counts.get(set.hash) ?? 0) + 1)
  }
  return counts
}

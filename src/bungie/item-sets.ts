/**
 * 护甲套装：成员关系与分档效果。
 *
 * 关系是**反的**——`DestinyInventoryItemDefinition` 里的 `equipableItemSetHash` 全是 null，
 * 所以不能从物品查套装。要读 `DestinyEquipableItemSetDefinition` 的 `setItems` 反建成
 * `itemHash → 套装`。
 *
 * `setItems` 存的是**无符号** hash，sqlite 的 `id` 是**有符号**的，查之前必须过
 * `toSignedHash`（`2419726011` → `-1875241285`），否则每条反查都落空而数据就在那儿。
 *
 * **一对一不是假设，是实测**：56 个套装、840 条关系、840 个唯一 itemHash、
 * 0 个物品挂多个套装、0 个套装内部重复。`conflictCount` 把这件事暴露出来——
 * 数据一变成一对多，`tests/item-sets.test.ts` 会红，而不是让"取第一个"悄悄吞掉。
 */
import type { DatabaseSync } from 'node:sqlite'
import { toSignedHash } from './manifest'

/** 一档套装效果。 */
export interface ArmorSetTier {
  /** 需要几件才生效。 */
  count: number
  name: string
  description: string
}

/** 一个套装的完整信息。 */
export interface ArmorSet {
  hash: number
  name: string
  /** 按 `requiredSetCount` 升序，通常是 2 件与 4 件。 */
  tiers: ArmorSetTier[]
}

/** 反向索引 + 它的健康度。 */
export interface ItemSetIndex {
  byItem: Map<number, ArmorSet[]>
  /** 挂了多个套装的物品数。当前数据应为 0；不为 0 说明假设被打破。 */
  conflictCount: number
}

/**
 * 从两张定义表建立反向索引。
 * @param rows - `DestinyEquipableItemSetDefinition` 的 json 列。
 * @param perkRows - `DestinySandboxPerkDefinition` 的 json 列，用来取效果描述。
 * @returns 按物品 hash 索引的套装，以及冲突计数。
 */
export function parseItemSets(
  rows: { json: string }[],
  perkRows: { json: string }[],
): ItemSetIndex {
  const perkText = new Map<number, { name: string; description: string }>()
  for (const row of perkRows) {
    try {
      const perk = JSON.parse(row.json) as {
        hash?: number
        displayProperties?: { name?: string; description?: string }
      }
      if (typeof perk.hash !== 'number') continue
      perkText.set(toSignedHash(perk.hash), {
        name: perk.displayProperties?.name ?? '',
        description: perk.displayProperties?.description ?? '',
      })
    } catch {
      // 一条坏的描述不该让整张套装表失效；那一档会显示空描述。
    }
  }

  const byItem = new Map<number, ArmorSet[]>()
  for (const row of rows) {
    let parsed: {
      hash?: number
      displayProperties?: { name?: string }
      setItems?: number[]
      setPerks?: { requiredSetCount?: number; sandboxPerkHash?: number }[]
    }
    try {
      parsed = JSON.parse(row.json)
    } catch {
      continue
    }
    if (typeof parsed.hash !== 'number') continue
    const hash = toSignedHash(parsed.hash)
    const tiers: ArmorSetTier[] = (parsed.setPerks ?? [])
      .flatMap((perk) => {
        if (typeof perk.requiredSetCount !== 'number') return []
        const text = perkText.get(toSignedHash(perk.sandboxPerkHash ?? 0))
        return [
          {
            count: perk.requiredSetCount,
            name: text?.name ?? '',
            description: text?.description ?? '',
          },
        ]
      })
      .sort((a, b) => a.count - b.count)
    const set: ArmorSet = { hash, name: parsed.displayProperties?.name ?? '', tiers }

    for (const item of parsed.setItems ?? []) {
      const key = toSignedHash(item)
      const list = byItem.get(key)
      if (list === undefined) byItem.set(key, [set])
      else if (!list.some((existing) => existing.hash === hash)) list.push(set)
    }
  }
  let conflictCount = 0
  for (const list of byItem.values()) if (list.length > 1) conflictCount += 1
  return { byItem, conflictCount }
}

/** 懒加载的套装索引。 */
export class ItemSets {
  private index: ItemSetIndex | null = null

  constructor(private readonly db: DatabaseSync | null) {}

  /**
   * @param itemHash - 物品的**有符号** hash。
   * @returns 该物品所属的套装；不属任何套装返回 `null`。
   */
  of(itemHash: number): ArmorSet | null {
    return this.load().byItem.get(itemHash)?.[0] ?? null
  }

  /** 挂了多个套装的物品数。当前数据应为 0。 */
  get conflictCount(): number {
    return this.load().conflictCount
  }

  private load(): ItemSetIndex {
    if (this.index !== null) return this.index
    if (this.db === null) {
      this.index = { byItem: new Map(), conflictCount: 0 }
      return this.index
    }
    try {
      const rows = this.db
        .prepare('select json from DestinyEquipableItemSetDefinition')
        .all() as { json: string }[]
      const perkRows = this.db.prepare('select json from DestinySandboxPerkDefinition').all() as {
        json: string
      }[]
      this.index = parseItemSets(rows, perkRows)
    } catch {
      // 表缺失就当作"没有任何套装"：详情卡不画套装区，而不是画错。
      this.index = { byItem: new Map(), conflictCount: 0 }
    }
    return this.index
  }
}

/** 套装 + 拥有件数；没有套装返回 `null`。 */
export function withOwned(
  set: ArmorSet | null,
  counts: Map<number, number>,
): (ArmorSet & { owned: number }) | null {
  return set === null ? null : { ...set, owned: counts.get(set.hash) ?? 0 }
}

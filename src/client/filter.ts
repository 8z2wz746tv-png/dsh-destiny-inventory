import { buildCells, makeCell } from './cells'
import type { CellSegment } from './segments'
import { matchesQuery } from './search-text'
import type { ItemRow } from '../host/types'
import { ALWAYS_SHOWN, BUCKET_SECTIONS, bucketRank, sectionOfBucket } from './buckets'

/**
 * Pure view logic for the inventory grid.
 *
 * The page shape is DIM's, verified in the local 8.143.0 checkout:
 * - `src/app/destiny2/d2-bucket-categories.ts` fixes the section order and
 *   membership: Postmaster, Weapons, Armor, General, Inventory.
 * - `src/app/inventory-page/DesktopStores.tsx` walks those categories, then the
 *   buckets inside each.
 * - `src/app/inventory-page/Stores.scss` makes every bucket one grid row:
 *   `repeat(numCharacters, charColumn) 1fr` — characters on the left, vault on
 *   the right, one row per bucket.
 *
 * One deliberate difference: DIM's weapon rows are Kinetic/Energy/Power buckets.
 * Our tool reports `bucket_type: "Vault (General)"` for every vault item, so the
 * ammo bucket is not recoverable; weapon type is used as the row instead.
 */

/** How items are ordered inside one cell. */
export type SortKey = 'power-desc' | 'name-asc' | 'type-asc'

/** Lock-state filter. */
export type LockFilter = 'all' | 'locked' | 'unlocked'

/** Broad item class. */
export type CategoryFilter = 'all' | 'weapon' | 'armor' | 'other'

/** Everything the toolbar can narrow by. */
export interface InventoryFilters {
  /** Free text matched against the localized name, case-insensitively. */
  search: string
  /** Localized item type; `` means every type. */
  type: string
  lock: LockFilter
  category: CategoryFilter
  sort: SortKey
}

/** Default view: everything, ordered by power. */
export const DEFAULT_FILTERS: InventoryFilters = {
  search: '',
  type: '',
  lock: 'all',
  category: 'all',
  sort: 'power-desc',
}

/** The stores that get their own column, in DIM's row order. */
export const STORE_COLUMNS = [
  { location: 'hunter', label: '猎人' },
  { location: 'warlock', label: '术士' },
  { location: 'titan', label: '泰坦' },
  { location: 'vault', label: '仓库' },
] as const

/** How wide the panel currently is; decides how many store columns fit. */
export type LayoutMode = 'wide' | 'medium' | 'narrow'

/** Options that change the shape (not the contents) of the page. */
export interface SectionOptions {
  /** wide = every character + vault; medium = active character + vault; narrow = one column. */
  layout?: LayoutMode
  /** Character shown in medium mode. */
  activeCharacter?: string
  /** 搜索索引提供的可搜文本；缺省时只按名称匹配。 */
  haystack?: (id: string) => string
}

/** One store's slice of a row. */
export interface StoreCell {
  location: string
  label: string
  /** True for the flexible vault column. */
  flex: boolean
  /**
   * The item this store is wearing in this bucket, if any.
   *
   * DIM renders it in its own slot at the head of the cell; keeping it separate
   * from `items` is what lets the view show "worn" as a slot rather than as a
   * badge on whichever tile happened to sort first.
   */
  equipped: ItemRow | null
  /** Everything else in this bucket. */
  items: ItemRow[]
  /**
   * Blocks inside this cell, for the vault column: DIM groups that column alone,
   * so a character's grid is never split.
   */
  segments: CellSegment[]
}

/** One row: a single bucket (or item type) across every store. */
export interface TypeRow {
  label: string
  cells: StoreCell[]
  itemCount: number
}

/** One DIM category section. */
export interface CategorySection {
  id: string
  label: string
  itemCount: number
  rows: TypeRow[]
}

/**
 * Section order and membership, from DIM's `D2Categories`.
 *
 * `postmaster`, `general` and `inventory` render full width: those buckets are
 * account-wide or belong to no single store, so splitting them into character
 * columns would invent a location the data does not have.
 */
/**
 * Category order and labels, derived from the bucket table.
 *
 * There is deliberately no second copy here: buckets.ts owns which bucket lands
 * in which category, this file only walks that order. Every category splits by
 * store (DIM's DesktopStores), so a full-width category does not exist.
 */
const SECTIONS: { id: string; label: string }[] = BUCKET_SECTIONS.map(({ id, label }) => ({ id, label }))

/**
 * The shelves that exist even when empty, as sections with no items.
 *
 * Deliberately outside `buildSections`: filtering answers "what matches", while
 * the game always shows a mailbox and an engram shelf regardless. The view
 * prepends these.
 * @returns one section per always-shown bucket.
 */
export function emptyShelfSections(): CategorySection[] {
  return SECTIONS.flatMap((meta) => {
    const entries = ALWAYS_SHOWN[meta.id]
    if (entries === undefined) return []
    return [
      {
        id: meta.id,
        label: meta.label,
        itemCount: 0,
        rows: entries.map((entry) => ({
          label: entry.label,
          itemCount: 0,
          cells: STORE_COLUMNS.map((column) =>
            makeCell(column.location, column.label, column.location === 'vault', []),
          ),
        })),
      },
    ]
  })
}

/**
 * Which DIM section an item belongs to.
 *
 * Decided by the Manifest bucket (DIM's `D2Categories`), not by item type: three
 * weapon archetypes share the kinetic bucket, and a type-based row split them
 * across rows that do not exist in either game or DIM.
 * @param item - one inventory row.
 */
export function sectionOf(item: ItemRow): string {
  if (item.placement.kind === 'postmaster') return 'postmaster'
  return sectionOfBucket(item.inventoryBucketHash, item.kind)
}

/**
 * Row label for one item's bucket.
 * @param item - one inventory row.
 * @returns the Manifest bucket name, or a hash marker when it is missing.
 */
export function rowLabelOf(item: ItemRow): string {
  if (item.bucket !== null && item.bucket !== '') return item.bucket
  if (item.inventoryBucketHash !== null) return `桶 #${item.inventoryBucketHash}`
  return '未分类'
}

/**
 * Whether one item passes the current filters.
 * @param item - the item row.
 * @param filters - current toolbar state.
 */
export function matchesFilters(
  item: ItemRow,
  filters: InventoryFilters,
  /** 索引提供的可搜文本；缺省时只按名称匹配。 */
  haystack?: (id: string) => string,
): boolean {
  if (filters.type !== '' && item.type !== filters.type) return false
  if (filters.category !== 'all' && item.kind !== filters.category) return false
  if (filters.lock === 'locked' && !item.locked) return false
  if (filters.lock === 'unlocked' && item.locked) return false
  const query = filters.search.trim()
  if (query !== '') {
    const text = haystack?.(item.id) ?? ''
    // 索引里有就搜整段（名称 + 类型 + perk 名 + 描述），没有就退回只搜名称。
    const target = text === '' ? item.name.toLowerCase() : text
    if (!matchesQuery(target, query)) return false
  }
  return true
}

/** Comparator for one sort key; unknown power sorts last. */
export function compareItems(a: ItemRow, b: ItemRow, sort: SortKey): number {
  // DIM keeps the worn item at the head of its bucket cell: it is the one the
  // player is actually using, the rest are candidates.
  const worn = (item: ItemRow): number => (item.equipped === 'equipped' ? 0 : 1)
  const byEquipped = worn(a) - worn(b)
  if (byEquipped !== 0) return byEquipped
  if (sort === 'name-asc') return a.name.localeCompare(b.name, 'zh-Hans-CN')
  if (sort === 'type-asc') {
    const byType = a.type.localeCompare(b.type, 'zh-Hans-CN')
    return byType !== 0 ? byType : a.name.localeCompare(b.name, 'zh-Hans-CN')
  }
  const left = a.power ?? -1
  const right = b.power ?? -1
  return right - left
}

/**
 * Build the page: DIM's category sections, each holding one row per bucket.
 * @param items - the full snapshot rows.
 * @param filters - current toolbar state.
 */
export function buildSections(
  items: ItemRow[],
  filters: InventoryFilters,
  options: SectionOptions = {},
): CategorySection[] {
  const layout = options.layout ?? 'wide'
  const activeCharacter = options.activeCharacter ?? 'hunter'
  const visible = items.filter((item) => matchesFilters(item, filters, options.haystack))
  const bySection = new Map<string, Map<number | null, { label: string; items: ItemRow[] }>>()
  for (const item of visible) {
    const section = sectionOf(item)
    let byRow = bySection.get(section)
    if (byRow === undefined) {
      byRow = new Map()
      bySection.set(section, byRow)
    }
    const key = item.inventoryBucketHash
    const row = byRow.get(key)
    if (row === undefined) byRow.set(key, { label: rowLabelOf(item), items: [item] })
    else row.items.push(item)
  }

  const sections: CategorySection[] = []
  for (const meta of SECTIONS) {
    const byRow = bySection.get(meta.id)
    if (byRow === undefined) continue

    if (meta.id === 'postmaster') {
      // The mailbox is one 21-slot shelf: mail is not grouped by item type the
      // way weapons and armor are.
      const mail = [...byRow.values()]
        .flatMap((entry) => entry.items)
        .sort((a, b) => compareItems(a, b, filters.sort))
      sections.push({
        id: meta.id,
        label: meta.label,
        itemCount: mail.length,
        rows: [
          {
            label: '邮政官',
            itemCount: mail.length,
            cells: buildCells(mail, layout, activeCharacter),
          },
        ],
      })
      continue
    }

    const rows: TypeRow[] = [...byRow.entries()]
      .sort(
        ([leftHash], [rightHash]) =>
          bucketRank(leftHash) - bucketRank(rightHash) || (leftHash ?? 0) - (rightHash ?? 0),
      )
      .map(([, { label, items: rowItems }]) => {
        const sorted = [...rowItems].sort((a, b) => compareItems(a, b, filters.sort))
        return {
          label,
          itemCount: sorted.length,
          cells: buildCells(sorted, layout, activeCharacter, meta.id),
        }
      })
    sections.push({
      id: meta.id,
      label: meta.label,
      itemCount: rows.reduce((sum, row) => sum + row.itemCount, 0),
      rows,
    })
  }
  return sections
}

/**
 * Split one row into store cells according to the panel's current width.
 *
 * Narrow mode collapses every location into one column: in a side panel there is
 * not enough width to compare three characters, and a single column reads better
 * than three cramped ones. Medium keeps the active character next to the vault —
 * the two things a drag actually moves between.
 * @param sorted - the row's items, already ordered.
 * @param layout - current width class.
 * @param activeCharacter - which character column medium mode shows.
 */


/**
 * Distinct item types present in the snapshot, for the type picker.
 * @param items - the full snapshot rows.
 */
export function availableTypes(items: ItemRow[]): string[] {
  const types = new Set<string>()
  for (const item of items) if (item.type !== '') types.add(item.type)
  return [...types].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
}

/** Item counts per location, for the store header strip. */
export function locationCounts(items: ItemRow[]): { value: string; label: string; count: number }[] {
  const grouped: { value: string; label: string; rank: number }[] = [
    { value: 'hunter', label: '猎人', rank: 1 },
    { value: 'warlock', label: '术士', rank: 2 },
    { value: 'titan', label: '泰坦', rank: 3 },
    { value: 'vault', label: '仓库', rank: 4 },
    { value: 'profile', label: '账号', rank: 5 },
    { value: 'postmaster', label: '邮政官', rank: 6 },
  ]
  const counts = new Map<string, number>()
  for (const item of items) counts.set(item.locationKey, (counts.get(item.locationKey) ?? 0) + 1)
  return grouped
    .map((entry) => ({ value: entry.value, label: entry.label, count: counts.get(entry.value) ?? 0 }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => {
      const leftRank = grouped.find((entry) => entry.value === left.value)?.rank ?? 99
      const rightRank = grouped.find((entry) => entry.value === right.value)?.rank ?? 99
      return leftRank - rightRank
    })
}

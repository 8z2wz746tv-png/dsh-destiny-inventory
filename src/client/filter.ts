import type { ItemRow } from '../mcp/types'

/**
 * Pure view logic for the inventory grid: grouping, filtering and sorting.
 *
 * Kept out of the component so every rule is unit-testable without a DOM, and
 * so a wrong filter never hides behind React state.
 */

/** How items are ordered inside one bucket. */
export type SortKey = 'power-desc' | 'name-asc' | 'type-asc'

/** Lock-state filter. */
export type LockFilter = 'all' | 'locked' | 'unlocked'

/** Everything the toolbar can narrow by. */
export interface InventoryFilters {
  /** Free text matched against the localized name, case-insensitively. */
  search: string
  /** Localized item type; `` means every type. */
  type: string
  lock: LockFilter
  /** Item location; `` means every location. */
  location: string
  sort: SortKey
}

/** Default view: everything, ordered by power. */
export const DEFAULT_FILTERS: InventoryFilters = {
  search: '',
  type: '',
  lock: 'all',
  location: '',
  sort: 'power-desc',
}

/** One bucket section inside a location. */
export interface BucketSection {
  bucket: string
  items: ItemRow[]
}

/** One location section, with its buckets ordered the way the game lists them. */
export interface LocationSection {
  location: string
  label: string
  itemCount: number
  buckets: BucketSection[]
}

/** Display order and labels for locations; unknown locations sort last. */
const LOCATION_ORDER: Record<string, { label: string; rank: number }> = {
  hunter: { label: '猎人', rank: 1 },
  warlock: { label: '术士', rank: 2 },
  titan: { label: '泰坦', rank: 3 },
  vault: { label: '仓库', rank: 4 },
  profile: { label: '账号', rank: 5 },
  postmaster: { label: '邮政官', rank: 6 },
}

/** Bucket order inside a location, mirroring the in-game character screen. */
const BUCKET_ORDER = [
  'Kinetic Weapons',
  'Energy Weapons',
  'Power Weapons',
  'Helmet',
  'Gauntlets',
  'Chest Armor',
  'Leg Armor',
  'Class Armor',
  'Ghost',
  'Vehicle',
  'Ships',
  'Subclass',
  'Clan Banners',
  'Emblems',
  'Emotes',
  'Finishers',
  'Modifications',
  'Consumables',
  'Quests',
]

/** Rank of one bucket, unknown buckets last. */
function bucketRank(bucket: string): number {
  const index = BUCKET_ORDER.indexOf(bucket)
  return index === -1 ? BUCKET_ORDER.length : index
}

/**
 * Whether one item passes the current filters.
 * @param item - the item row.
 * @param filters - current toolbar state.
 */
export function matchesFilters(item: ItemRow, filters: InventoryFilters): boolean {
  if (filters.type !== '' && item.type !== filters.type) return false
  if (filters.location !== '' && item.location !== filters.location) return false
  if (filters.lock === 'locked' && !item.locked) return false
  if (filters.lock === 'unlocked' && item.locked) return false
  const needle = filters.search.trim().toLowerCase()
  if (needle !== '' && !item.name.toLowerCase().includes(needle)) return false
  return true
}

/** Comparator for one sort key; unknown power sorts last. */
export function compareItems(a: ItemRow, b: ItemRow, sort: SortKey): number {
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
 * Apply filters and sort, then group into location → bucket sections.
 * @param items - the full snapshot rows.
 * @param filters - current toolbar state.
 */
export function buildSections(items: ItemRow[], filters: InventoryFilters): LocationSection[] {
  const visible = items.filter((item) => matchesFilters(item, filters))
  const byLocation = new Map<string, ItemRow[]>()
  for (const item of visible) {
    const bucket = byLocation.get(item.location)
    if (bucket === undefined) byLocation.set(item.location, [item])
    else bucket.push(item)
  }
  const sections: LocationSection[] = []
  for (const [location, rows] of byLocation) {
    const byBucket = new Map<string, ItemRow[]>()
    for (const row of rows) {
      const bucket = byBucket.get(row.bucket)
      if (bucket === undefined) byBucket.set(row.bucket, [row])
      else bucket.push(row)
    }
    const buckets = [...byBucket.entries()]
      .sort(([left], [right]) => bucketRank(left) - bucketRank(right) || left.localeCompare(right))
      .map(([bucket, bucketRows]) => ({
        bucket,
        items: [...bucketRows].sort((a, b) => compareItems(a, b, filters.sort)),
      }))
    const meta = LOCATION_ORDER[location]
    sections.push({
      location,
      label: meta?.label ?? location,
      itemCount: rows.length,
      buckets,
    })
  }
  return sections.sort((left, right) => {
    const leftRank = LOCATION_ORDER[left.location]?.rank ?? 99
    const rightRank = LOCATION_ORDER[right.location]?.rank ?? 99
    return leftRank - rightRank || left.location.localeCompare(right.location)
  })
}

/**
 * Distinct item types present in the snapshot, for the type picker.
 * @param items - the full snapshot rows.
 */
export function availableTypes(items: ItemRow[]): string[] {
  const types = new Set<string>()
  for (const item of items) if (item.type !== '') types.add(item.type)
  return [...types].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
}

/**
 * Distinct locations present in the snapshot, in display order.
 * @param items - the full snapshot rows.
 */
export function availableLocations(items: ItemRow[]): { value: string; label: string }[] {
  const seen = new Set<string>()
  for (const item of items) seen.add(item.location)
  return [...seen]
    .map((location) => ({ value: location, label: LOCATION_ORDER[location]?.label ?? location }))
    .sort(
      (left, right) =>
        (LOCATION_ORDER[left.value]?.rank ?? 99) - (LOCATION_ORDER[right.value]?.rank ?? 99),
    )
}

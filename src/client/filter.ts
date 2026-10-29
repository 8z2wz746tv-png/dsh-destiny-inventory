import type { ItemRow } from '../mcp/types'

/**
 * Pure view logic for the inventory grid.
 *
 * The shape follows Destiny Item Manager's desktop layout rather than a
 * location switcher: `DesktopStores.tsx` walks categories, then buckets, and
 * `StoreBuckets.tsx` renders each bucket as ONE ROW with a cell per store —
 * characters at a fixed width, the vault taking the rest. That is why two copies
 * of the same gun can be compared left to right without changing pages.
 */

/** How items are ordered inside one cell. */
export type SortKey = 'power-desc' | 'name-asc' | 'type-asc'

/** Lock-state filter. */
export type LockFilter = 'all' | 'locked' | 'unlocked'

/** Broad item class, the way the game splits a vault. */
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

/** The stores that get their own column, in the order the row lays them out. */
export const STORE_COLUMNS = [
  { location: 'hunter', label: '猎人' },
  { location: 'warlock', label: '术士' },
  { location: 'titan', label: '泰坦' },
  { location: 'vault', label: '仓库' },
] as const

/** One store's slice of a row; `items` is empty when that store has none. */
export interface StoreCell {
  location: string
  label: string
  /** True for the flexible vault column. */
  flex: boolean
  items: ItemRow[]
}

/** One row: a single item type across every store. */
export interface TypeRow {
  label: string
  cells: StoreCell[]
  itemCount: number
}

/** One category section: 武器 / 防具 / 杂项 / 账号 / 邮政官. */
export interface CategorySection {
  id: string
  label: string
  itemCount: number
  rows: TypeRow[]
  /**
   * Account-wide and postmaster items belong to no single store, so their rows
   * carry one full-width cell instead of the four-column store layout.
   */
  fullWidth: boolean
}

/** Display order and labels for the sections. */
const SECTIONS: { id: string; label: string; rank: number }[] = [
  { id: 'weapon', label: '武器', rank: 1 },
  { id: 'armor', label: '防具', rank: 2 },
  { id: 'other', label: '杂项', rank: 3 },
  { id: 'profile', label: '账号', rank: 4 },
  { id: 'postmaster', label: '邮政官', rank: 5 },
]

/** Type order inside a section, mirroring how the game lists a vault. */
const TYPE_ORDER = [
  '手炮', '自动步枪', '脉冲步枪', '斥候步枪', '手枪', '微型冲锋枪',
  '霰弹枪', '融合步枪', '线性融合步枪', '狙击步枪', '榴弹发射器',
  '火箭发射器', '机枪', '刀剑', '偃月', '战斗弓箭', '追踪步枪',
  '头盔', '臂铠', '胸部护甲', '腿部护甲', '猎人披风', '泰坦印记', '术士臂环',
  '机灵外壳', '载具', '飞船', '徽标', '终结技', '动作收藏', '表情',
  '神器', '消耗品', '材料', '货币', '模组', '任务步骤', '可兑换', '记忆水晶',
]

/** Rank of one item type, unknown types last. */
function typeRank(label: string): number {
  const index = TYPE_ORDER.indexOf(label)
  return index === -1 ? TYPE_ORDER.length : index
}

/** Which section an item belongs to. */
function sectionOf(item: ItemRow): string {
  if (item.location === 'profile') return 'profile'
  if (item.location === 'postmaster') return 'postmaster'
  return item.kind === 'weapon' ? 'weapon' : item.kind === 'armor' ? 'armor' : 'other'
}

/**
 * Whether one item passes the current filters.
 * @param item - the item row.
 * @param filters - current toolbar state.
 */
export function matchesFilters(item: ItemRow, filters: InventoryFilters): boolean {
  if (filters.type !== '' && item.type !== filters.type) return false
  if (filters.category !== 'all' && item.kind !== filters.category) return false
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
 * Build the DIM-shaped page: section → type row → one cell per store.
 * @param items - the full snapshot rows.
 * @param filters - current toolbar state.
 */
export function buildSections(items: ItemRow[], filters: InventoryFilters): CategorySection[] {
  const visible = items.filter((item) => matchesFilters(item, filters))
  const bySection = new Map<string, Map<string, ItemRow[]>>()
  for (const item of visible) {
    const section = sectionOf(item)
    let byType = bySection.get(section)
    if (byType === undefined) {
      byType = new Map<string, ItemRow[]>()
      bySection.set(section, byType)
    }
    const label = item.type === '' ? '未分类' : item.type
    const bucket = byType.get(label)
    if (bucket === undefined) byType.set(label, [item])
    else bucket.push(item)
  }

  const sections: CategorySection[] = []
  for (const meta of SECTIONS) {
    const byType = bySection.get(meta.id)
    if (byType === undefined) continue
    const fullWidth = meta.id === 'profile' || meta.id === 'postmaster'
    const rows: TypeRow[] = [...byType.entries()]
      .sort(
        ([left], [right]) =>
          typeRank(left) - typeRank(right) || left.localeCompare(right, 'zh-Hans-CN'),
      )
      .map(([label, rows]) => {
        const sorted = [...rows].sort((a, b) => compareItems(a, b, filters.sort))
        if (fullWidth) {
          const items = sorted
          return {
            label,
            itemCount: items.length,
            cells: [{ location: meta.id, label: meta.label, flex: true, items }],
          }
        }
        const cells: StoreCell[] = STORE_COLUMNS.map((column) => ({
          location: column.location,
          label: column.label,
          flex: column.location === 'vault',
          items: sorted.filter((item) => item.location === column.location),
        }))
        // A type that only one store holds still lays out all four columns, so
        // the columns stay aligned down the whole page.
        return { label, itemCount: sorted.length, cells }
      })
    sections.push({
      id: meta.id,
      label: meta.label,
      itemCount: rows.reduce((sum, row) => sum + row.itemCount, 0),
      rows,
      fullWidth,
    })
  }
  return sections
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
  for (const item of items) counts.set(item.location, (counts.get(item.location) ?? 0) + 1)
  return grouped
    .map((entry) => ({ value: entry.value, label: entry.label, count: counts.get(entry.value) ?? 0 }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => {
      const leftRank = grouped.find((entry) => entry.value === left.value)?.rank ?? 99
      const rightRank = grouped.find((entry) => entry.value === right.value)?.rank ?? 99
      return leftRank - rightRank
    })
}

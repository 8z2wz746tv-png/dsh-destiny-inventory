import type { ItemRow } from '../mcp/types'

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

/** One store's slice of a row. */
export interface StoreCell {
  location: string
  label: string
  /** True for the flexible vault column. */
  flex: boolean
  items: ItemRow[]
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
  /** True when the section renders as single full-width rows. */
  fullWidth: boolean
}

/**
 * Section order and membership, from DIM's `D2Categories`.
 *
 * `postmaster`, `general` and `inventory` render full width: those buckets are
 * account-wide or belong to no single store, so splitting them into character
 * columns would invent a location the data does not have.
 */
const SECTIONS: { id: string; label: string; fullWidth: boolean }[] = [
  { id: 'postmaster', label: '邮政官', fullWidth: true },
  { id: 'weapons', label: '武器', fullWidth: false },
  { id: 'armor', label: '护甲', fullWidth: false },
  { id: 'general', label: '通用', fullWidth: true },
  { id: 'inventory', label: '物品', fullWidth: true },
]

/** Types DIM keeps in General: subclass, artifact, ghost, emblems, ships, vehicle, emotes, finishers. */
const GENERAL_TYPES = new Set([
  '神器', '机灵外壳', '机灵投影', '徽标', '飞船', '载具', '表情',
  '终结技', '终结技收藏', '动作收藏', '公会战旗', '武器皮肤', '护甲皮肤',
])

/** Types that belong to General by family rather than by exact name. */
function isGeneralFamily(type: string): boolean {
  return type.includes('分支职业') || type.includes('通用皮肤')
}

/** Row order inside 武器, DIM's weapon buckets read top to bottom. */
const WEAPON_ORDER = [
  '手炮', '自动步枪', '脉冲步枪', '斥候步枪', '手枪', '微型冲锋枪',
  '霰弹枪', '融合步枪', '线性融合步枪', '狙击步枪', '榴弹发射器',
  '火箭发射器', '机枪', '刀剑', '偃月', '战斗弓箭', '追踪步枪',
]

/** Row order inside 护甲: helmet, gauntlets, chest, legs, class item. */
const ARMOR_ORDER = ['头盔', '臂铠', '胸部护甲', '腿部护甲', '猎人披风', '泰坦印记', '术士臂环']

/** Row order inside 通用 / 物品. */
const OTHER_ORDER = [
  '术士分支职业', '猎人分支职业', '泰坦分支职业', '神器',
  '机灵外壳', '机灵投影', '徽标', '飞船', '载具', '表情', '终结技', '终结技收藏',
  '动作收藏', '公会战旗', '武器皮肤', '护甲皮肤',
  '消耗品', '材料', '货币', '模组', '目的地模组', '配件',
  '任务步骤', '可兑换', '记忆水晶', '光明记忆水晶', '枪匠命令', '高塔命令',
]

/** Rank of one row label inside its section, unknown labels last. */
function rowRank(section: string, label: string): number {
  const order = section === 'weapons' ? WEAPON_ORDER : section === 'armor' ? ARMOR_ORDER : OTHER_ORDER
  const index = order.indexOf(label)
  return index === -1 ? order.length : index
}

/** Which DIM section an item belongs to. */
export function sectionOf(item: ItemRow): string {
  if (item.location === 'postmaster') return 'postmaster'
  if (item.kind === 'weapon') return 'weapons'
  if (item.kind === 'armor') return 'armor'
  if (GENERAL_TYPES.has(item.type) || isGeneralFamily(item.type)) return 'general'
  return 'inventory'
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
 * Build the page: DIM's category sections, each holding one row per bucket.
 * @param items - the full snapshot rows.
 * @param filters - current toolbar state.
 */
export function buildSections(items: ItemRow[], filters: InventoryFilters): CategorySection[] {
  const visible = items.filter((item) => matchesFilters(item, filters))
  const bySection = new Map<string, Map<string, ItemRow[]>>()
  for (const item of visible) {
    const section = sectionOf(item)
    let byRow = bySection.get(section)
    if (byRow === undefined) {
      byRow = new Map<string, ItemRow[]>()
      bySection.set(section, byRow)
    }
    const label = item.type === '' ? '未分类' : item.type
    const bucket = byRow.get(label)
    if (bucket === undefined) byRow.set(label, [item])
    else bucket.push(item)
  }

  const sections: CategorySection[] = []
  for (const meta of SECTIONS) {
    const byRow = bySection.get(meta.id)
    if (byRow === undefined) continue
    const rows: TypeRow[] = [...byRow.entries()]
      .sort(
        ([left], [right]) =>
          rowRank(meta.id, left) - rowRank(meta.id, right) ||
          left.localeCompare(right, 'zh-Hans-CN'),
      )
      .map(([label, rowItems]) => {
        const sorted = [...rowItems].sort((a, b) => compareItems(a, b, filters.sort))
        if (meta.fullWidth) {
          return {
            label,
            itemCount: sorted.length,
            cells: [{ location: meta.id, label: meta.label, flex: true, items: sorted }],
          }
        }
        const cells: StoreCell[] = STORE_COLUMNS.map((column) => ({
          location: column.location,
          label: column.label,
          flex: column.location === 'vault',
          items: sorted.filter((item) => item.location === column.location),
        }))
        return { label, itemCount: sorted.length, cells }
      })
    sections.push({
      id: meta.id,
      label: meta.label,
      itemCount: rows.reduce((sum, row) => sum + row.itemCount, 0),
      rows,
      fullWidth: meta.fullWidth,
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

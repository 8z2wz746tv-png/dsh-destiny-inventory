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

/** Broad item class, the way the game splits a vault. */
export type CategoryFilter = 'all' | 'weapon' | 'armor' | 'other'

/** Everything the toolbar can narrow by. */
export interface InventoryFilters {
  /** Free text matched against the localized name, case-insensitively. */
  search: string
  /** Localized item type; `` means every type. */
  type: string
  lock: LockFilter
  /** Item location; `` means every location. */
  location: string
  category: CategoryFilter
  sort: SortKey
}

/**
 * Default view: the vault, ordered by power.
 *
 * The vault is 1295 of 1922 items, so it is both the thing worth opening first
 * and the reason a single stacked list of every location does not work.
 */
export const DEFAULT_FILTERS: InventoryFilters = {
  search: '',
  type: '',
  lock: 'all',
  location: 'vault',
  category: 'all',
  sort: 'power-desc',
}

/** One item-type group, e.g. 手炮 or 腿部护甲. */
export interface TypeGroup {
  label: string
  items: ItemRow[]
}

/**
 * One kind section: 武器 / 防具 / 杂项.
 *
 * Grouping by the tool's `bucket_type` is useless inside the vault — all 1295
 * vault items report `Vault (General)` — so the split is by item type, which is
 * also how DIM lays a vault out.
 */
export interface KindSection {
  kind: 'weapon' | 'armor' | 'other'
  label: string
  itemCount: number
  groups: TypeGroup[]
}

/** Section order and labels, matching the game's own tabs. */
const KIND_ORDER: { kind: KindSection['kind']; label: string; rank: number }[] = [
  { kind: 'weapon', label: '武器', rank: 1 },
  { kind: 'armor', label: '防具', rank: 2 },
  { kind: 'other', label: '杂项', rank: 3 },
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

/** Display order and labels for locations; unknown locations sort last. */
const LOCATION_ORDER: Record<string, { label: string; rank: number }> = {
  hunter: { label: '猎人', rank: 1 },
  warlock: { label: '术士', rank: 2 },
  titan: { label: '泰坦', rank: 3 },
  vault: { label: '仓库', rank: 4 },
  profile: { label: '账号', rank: 5 },
  postmaster: { label: '邮政官', rank: 6 },
}

/**
 * Whether one item passes the current filters.
 * @param item - the item row.
 * @param filters - current toolbar state.
 */
export function matchesFilters(item: ItemRow, filters: InventoryFilters): boolean {
  if (filters.type !== '' && item.type !== filters.type) return false
  if (filters.location !== '' && item.location !== filters.location) return false
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
 * Apply filters and sort, then group into location → bucket sections.
 * @param items - the full snapshot rows.
 * @param filters - current toolbar state.
 */
export function buildSections(items: ItemRow[], filters: InventoryFilters): KindSection[] {
  const visible = items.filter((item) => matchesFilters(item, filters))
  const byKind = new Map<KindSection['kind'], ItemRow[]>()
  for (const item of visible) {
    const bucket = byKind.get(item.kind)
    if (bucket === undefined) byKind.set(item.kind, [item])
    else bucket.push(item)
  }
  const sections: KindSection[] = []
  for (const entry of KIND_ORDER) {
    const rows = byKind.get(entry.kind)
    if (rows === undefined || rows.length === 0) continue
    const byType = new Map<string, ItemRow[]>()
    for (const row of rows) {
      const label = row.type === '' ? '未分类' : row.type
      const group = byType.get(label)
      if (group === undefined) byType.set(label, [row])
      else group.push(row)
    }
    const groups = [...byType.entries()]
      .sort(
        ([left], [right]) =>
          typeRank(left) - typeRank(right) || left.localeCompare(right, 'zh-Hans-CN'),
      )
      .map(([label, groupRows]) => ({
        label,
        items: [...groupRows].sort((a, b) => compareItems(a, b, filters.sort)),
      }))
    sections.push({ kind: entry.kind, label: entry.label, itemCount: rows.length, groups })
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

/**
 * Item counts per location, in display order — the numbers on the location tabs.
 * @param items - the full snapshot rows.
 */
export function locationCounts(items: ItemRow[]): { value: string; label: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const item of items) counts.set(item.location, (counts.get(item.location) ?? 0) + 1)
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: LOCATION_ORDER[value]?.label ?? value, count }))
    .sort(
      (left, right) =>
        (LOCATION_ORDER[left.value]?.rank ?? 99) - (LOCATION_ORDER[right.value]?.rank ?? 99) ||
        left.value.localeCompare(right.value),
    )
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

/**
 * The filter bar: search, category segment, type/lock/sort selects, refresh.
 *
 * Split out of InventoryPanel so the panel keeps to layout and data flow; the
 * bar owns nothing but its own markup and hands changes back through `onPatch`.
 */
import type { ReactElement } from 'react'
import type { CategoryFilter, InventoryFilters, SortKey } from './filter'

export const SORTS: { value: SortKey; label: string }[] = [
  { value: 'power-desc', label: '光等' },
  { value: 'name-asc', label: '名称' },
  { value: 'type-asc', label: '类型' },
]

export const CATEGORIES: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'weapon', label: '武器' },
  { value: 'armor', label: '护甲' },
  { value: 'other', label: '杂项' },
]

/** Props for {@link InventoryToolbar}. */
export interface InventoryToolbarProps {
  filters: InventoryFilters
  /** Item types present in the current snapshot, for the type select. */
  types: string[]
  /** Character count shown at the right, empty while loading. */
  countLabel: string
  busy: boolean
  onPatch: (next: Partial<InventoryFilters>) => void
  onRefresh: () => void
}

/** Filter bar: one control per filter dimension. */
export function InventoryToolbar({
  filters,
  types,
  countLabel,
  busy,
  onPatch,
  onRefresh,
}: InventoryToolbarProps): ReactElement {
  return (
    <div className="dsh-destiny-toolbar">
      <input
        className="dsh-destiny-toolbar__search"
        type="search"
        placeholder="搜索名称"
        value={filters.search}
        onChange={(event) => onPatch({ search: event.target.value })}
      />
      <div className="dsh-destiny-segmented">
        {CATEGORIES.map((category) => (
          <button
            key={category.value}
            type="button"
            className={'dsh-destiny-segmented__item' + (filters.category === category.value ? ' is-active' : '')}
            onClick={() => onPatch({ category: category.value })}
          >
            {category.label}
          </button>
        ))}
      </div>
      <select
        className="dsh-destiny-toolbar__select"
        value={filters.type}
        onChange={(event) => onPatch({ type: event.target.value })}
      >
        <option value="">全部类型</option>
        {types.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
      <select
        className="dsh-destiny-toolbar__select"
        value={filters.lock}
        onChange={(event) => onPatch({ lock: event.target.value as InventoryFilters['lock'] })}
      >
        <option value="all">锁定状态</option>
        <option value="locked">已锁定</option>
        <option value="unlocked">未锁定</option>
      </select>
      <select
        className="dsh-destiny-toolbar__select"
        value={filters.sort}
        onChange={(event) => onPatch({ sort: event.target.value as SortKey })}
        title="排序"
      >
        {SORTS.map((sort) => (
          <option key={sort.value} value={sort.value}>
            排序：{sort.label}
          </option>
        ))}
      </select>
      <button type="button" className="dsh-destiny-toolbar__refresh" disabled={busy} onClick={onRefresh}>
        刷新
      </button>
      <span className="dsh-destiny-toolbar__count">{countLabel}</span>
      <span className="dsh-destiny-build" title="当前加载的插件版本">
        v0.47.1
      </span>
    </div>
  )
}

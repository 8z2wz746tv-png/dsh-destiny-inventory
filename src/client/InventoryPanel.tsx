import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import type { InventorySnapshot, ItemRow, PlayerProfileView } from '../mcp/types'
import { fetchCharacters, fetchInventory } from './api'
import {
  DEFAULT_FILTERS,
  availableLocations,
  availableTypes,
  buildSections,
} from './filter'
import type { InventoryFilters, SortKey } from './filter'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; snapshot: InventorySnapshot; profile: PlayerProfileView }
  | { kind: 'error'; message: string }

/** Sort choices, in toolbar order. */
const SORTS: { value: SortKey; label: string }[] = [
  { value: 'power-desc', label: '光等' },
  { value: 'name-asc', label: '名称' },
  { value: 'type-asc', label: '类型' },
]

/**
 * One inventory tile: icon, name, power. No hover detail yet — that read costs
 * a separate per-item call and lands with the perk grid.
 * @param props - the item row.
 */
function ItemTile({ item }: { item: ItemRow }): ReactElement {
  const modifier = item.exotic ? ' is-exotic' : ''
  return (
    <div
      className={`dsh-destiny-tile${modifier}`}
      title={`${item.name}${item.type === '' ? '' : ' · ' + item.type}`}
      data-locked={item.locked ? '1' : '0'}
      data-equipped={item.equipped ? '1' : '0'}
    >
      {item.icon === '' ? (
        <div className="dsh-destiny-tile__icon" />
      ) : (
        <img className="dsh-destiny-tile__icon" src={item.icon} alt="" loading="lazy" decoding="async" />
      )}
      <span className="dsh-destiny-tile__power">{item.power ?? '—'}</span>
      {item.locked && <span className="dsh-destiny-tile__lock" aria-hidden="true">🔒</span>}
    </div>
  )
}

/**
 * The inventory page mounted in the layout's keyed `main` slot.
 *
 * The layout mounts it only while this panel is the selected one, so the read
 * runs on mount and its result is dropped on unmount.
 * @param props - the framework main-slot share plus this entry's injected face.
 */
export function InventoryPanel({ routePath }: { routePath: string }): ReactElement {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [filters, setFilters] = useState<InventoryFilters>(DEFAULT_FILTERS)

  const load = useCallback((signal: AbortSignal, refresh: boolean): void => {
    Promise.all([
      fetchInventory(routePath, signal, refresh),
      fetchCharacters(routePath, signal),
    ]).then(
      ([snapshot, profile]) => {
        if (!signal.aborted) setState({ kind: 'ready', snapshot, profile })
      },
      (error: unknown) => {
        if (signal.aborted) return
        const message = error instanceof Error ? error.message : String(error)
        setState({ kind: 'error', message })
      },
    )
  }, [routePath])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal, false)
    return () => controller.abort()
  }, [load])

  const items = state.kind === 'ready' ? state.snapshot.items : []
  const sections = useMemo(() => buildSections(items, filters), [items, filters])
  const types = useMemo(() => availableTypes(items), [items])
  const locations = useMemo(() => availableLocations(items), [items])
  const visibleCount = sections.reduce((sum, section) => sum + section.itemCount, 0)

  const patch = (next: Partial<InventoryFilters>): void =>
    setFilters((current) => ({ ...current, ...next }))

  return (
    <div className="dsh-destiny-panel" data-dsh-destiny-view="">
      {state.kind === 'ready' && (
        <header className="dsh-destiny-panel__header">
          <span className="dsh-destiny-panel__name">{state.profile.displayName}</span>
          {state.profile.triumphScore !== null && (
            <span className="dsh-destiny-panel__meta">凯旋分 {state.profile.triumphScore}</span>
          )}
        </header>
      )}
      <div className="dsh-destiny-toolbar">
        <input
          className="dsh-destiny-toolbar__search"
          type="search"
          placeholder="搜索名称"
          value={filters.search}
          onChange={(event) => patch({ search: event.target.value })}
        />
        <select
          className="dsh-destiny-toolbar__select"
          value={filters.location}
          onChange={(event) => patch({ location: event.target.value })}
        >
          <option value="">全部位置</option>
          {locations.map((location) => (
            <option key={location.value} value={location.value}>
              {location.label}
            </option>
          ))}
        </select>
        <select
          className="dsh-destiny-toolbar__select"
          value={filters.type}
          onChange={(event) => patch({ type: event.target.value })}
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
          onChange={(event) => patch({ lock: event.target.value as InventoryFilters['lock'] })}
        >
          <option value="all">锁定状态</option>
          <option value="locked">已锁定</option>
          <option value="unlocked">未锁定</option>
        </select>
        <div className="dsh-destiny-toolbar__sort">
          {SORTS.map((sort) => (
            <button
              key={sort.value}
              type="button"
              className={`dsh-destiny-toolbar__sortButton${filters.sort === sort.value ? ' is-active' : ''}`}
              onClick={() => patch({ sort: sort.value })}
            >
              {sort.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="dsh-destiny-toolbar__refresh"
          onClick={() => {
            setState({ kind: 'loading' })
            const controller = new AbortController()
            load(controller.signal, true)
          }}
        >
          刷新
        </button>
        <span className="dsh-destiny-toolbar__count">
          {state.kind === 'ready' ? `${visibleCount} / ${state.snapshot.total}` : ''}
        </span>
      </div>

      {state.kind === 'loading' && <p className="dsh-destiny-panel__state">正在读取仓库…</p>}
      {state.kind === 'error' && (
        <p className="dsh-destiny-panel__state dsh-destiny-panel__state--error">{state.message}</p>
      )}
      {state.kind === 'ready' && state.snapshot.truncated && (
        <p className="dsh-destiny-panel__state dsh-destiny-panel__state--error">
          这次读取没拿全（{state.snapshot.items.length} / {state.snapshot.total}），别把它当成空仓库。
        </p>
      )}
      {state.kind === 'ready' && visibleCount === 0 && (
        <p className="dsh-destiny-panel__state">没有符合当前筛选的物品。</p>
      )}

      <div className="dsh-destiny-sections">
        {sections.map((section) => (
          <section key={section.location} className="dsh-destiny-section">
            <h3 className="dsh-destiny-section__title">
              {section.label}
              <span className="dsh-destiny-section__count">{section.itemCount}</span>
            </h3>
            {section.buckets.map((bucket) => (
              <div key={bucket.bucket} className="dsh-destiny-bucket">
                <p className="dsh-destiny-bucket__title">
                  {bucket.bucket}
                  <span className="dsh-destiny-bucket__count">{bucket.items.length}</span>
                </p>
                <div className="dsh-destiny-grid">
                  {bucket.items.map((item) => (
                    <ItemTile key={item.id} item={item} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}

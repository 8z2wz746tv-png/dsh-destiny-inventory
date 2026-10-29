import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DragEvent, ReactElement } from 'react'
import type { ActionReceipt, ActionRequest, InventorySnapshot, ItemDetailView, ItemRow, PlayerProfileView } from '../mcp/types'
import { fetchCharacters, fetchInventory, postAction } from './api'
import { ItemDetailCard } from './ItemDetail'
import { DEFAULT_FILTERS, availableLocations, availableTypes, buildSections } from './filter'
import type { InventoryFilters, SortKey } from './filter'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; snapshot: InventorySnapshot; profile: PlayerProfileView }
  | { kind: 'error'; message: string }

/** One finished (or failed) write, shown in the corner receipt list. */
interface ReceiptLine {
  id: number
  ok: boolean
  text: string
  detail: string
}

/** Sort choices, in toolbar order. */
const SORTS: { value: SortKey; label: string }[] = [
  { value: 'power-desc', label: '光等' },
  { value: 'name-asc', label: '名称' },
  { value: 'type-asc', label: '类型' },
]

/** Locations a drop can target: the vault and the three characters. */
const DROP_TARGETS = new Set(['vault', 'hunter', 'warlock', 'titan'])

/** True when a location is a character the account can equip on. */
function isCharacter(location: string): boolean {
  return location === 'hunter' || location === 'warlock' || location === 'titan'
}

/**
 * One inventory tile: icon, power, state marks. Draggable onto a location header.
 * @param props - the row and the click handler.
 */
function ItemTile({ item, onOpen }: { item: ItemRow; onOpen: (item: ItemRow) => void }): ReactElement {
  const onDragStart = (event: DragEvent<HTMLDivElement>): void => {
    event.dataTransfer.setData('text/plain', item.id)
    event.dataTransfer.effectAllowed = 'move'
  }
  return (
    <div
      className={`dsh-destiny-tile${item.exotic ? ' is-exotic' : ''}`}
      title={`${item.name}${item.type === '' ? '' : ' · ' + item.type}`}
      data-locked={item.locked ? '1' : '0'}
      data-equipped={item.equipped ? '1' : '0'}
      draggable
      onDragStart={onDragStart}
      onClick={() => onOpen(item)}
    >
      {item.icon === '' ? (
        <div className="dsh-destiny-tile__icon" />
      ) : (
        <img className="dsh-destiny-tile__icon" src={item.icon} alt="" loading="lazy" decoding="async" />
      )}
      <span className="dsh-destiny-tile__power">{item.power ?? '—'}</span>
      {item.locked && (
        <span className="dsh-destiny-tile__lock" aria-hidden="true">
          🔒
        </span>
      )}
    </div>
  )
}

/**
 * The inventory page mounted in the layout's keyed `main` slot.
 * @param props - the framework main-slot share plus this entry's injected face.
 */
export function InventoryPanel({ routePath }: { routePath: string }): ReactElement {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [filters, setFilters] = useState<InventoryFilters>(DEFAULT_FILTERS)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [receipts, setReceipts] = useState<ReceiptLine[]>([])
  const [pendingEquip, setPendingEquip] = useState<{ detail: ItemDetailView; summary: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const load = useCallback((signal: AbortSignal, refresh: boolean): void => {
    Promise.all([fetchInventory(routePath, signal, refresh), fetchCharacters(routePath, signal)]).then(
      ([snapshot, profile]) => {
        if (!signal.aborted) setState({ kind: 'ready', snapshot, profile })
      },
      (error: unknown) => {
        if (signal.aborted) return
        setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
      },
    )
  }, [routePath])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal, false)
    return () => controller.abort()
  }, [load])

  const pushReceipt = useCallback((ok: boolean, text: string, detail: string): void => {
    setReceipts((current) => [{ id: Date.now() + Math.random(), ok, text, detail }, ...current].slice(0, 6))
  }, [])

  const runAction = useCallback(
    async (request: ActionRequest, itemName: string, summary: string): Promise<ActionReceipt | null> => {
      setBusy(true)
      try {
        const receipt = await postAction(routePath, request, itemName, new AbortController().signal)
        if (!receipt.applied) {
          pushReceipt(true, summary, receipt.message)
          return receipt
        }
        pushReceipt(true, receipt.summary || summary, receipt.message)
        const controller = new AbortController()
        load(controller.signal, true)
        return receipt
      } catch (error) {
        pushReceipt(false, summary, error instanceof Error ? error.message : String(error))
        return null
      } finally {
        setBusy(false)
      }
    },
    [routePath, load, pushReceipt],
  )

  const items = state.kind === 'ready' ? state.snapshot.items : []
  const sections = useMemo(() => buildSections(items, filters), [items, filters])
  const types = useMemo(() => availableTypes(items), [items])
  const locations = useMemo(() => availableLocations(items), [items])
  const visibleCount = sections.reduce((sum, section) => sum + section.itemCount, 0)
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

  const patch = (next: Partial<InventoryFilters>): void => setFilters((current) => ({ ...current, ...next }))

  const onDrop = (event: DragEvent<HTMLElement>, location: string): void => {
    event.preventDefault()
    setDropTarget(null)
    if (!DROP_TARGETS.has(location)) return
    const id = event.dataTransfer.getData('text/plain')
    const item = itemById.get(id)
    if (item === undefined) return
    if (item.location === location) return
    void runAction(
      { kind: 'move', instanceId: item.instanceId, destination: location },
      item.name,
      `把「${item.name}」移到 ${location}`,
    )
  }

  const onEquip = async (detail: ItemDetailView): Promise<void> => {
    if (!isCharacter(detail.location)) {
      pushReceipt(false, `装备「${detail.name}」`, '这件不在角色身上：先拖到角色背包，再装备。')
      return
    }
    setBusy(true)
    try {
      const receipt = await postAction(
        routePath,
        { kind: 'equip', instanceId: detail.instanceId, character: detail.location },
        detail.name,
        new AbortController().signal,
      )
      if (receipt.needsConfirm === true) setPendingEquip({ detail, summary: receipt.summary })
    } catch (error) {
      pushReceipt(false, `装备「${detail.name}」`, error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const confirmEquip = async (): Promise<void> => {
    if (pendingEquip === null) return
    const { detail } = pendingEquip
    setPendingEquip(null)
    await runAction(
      { kind: 'equip', instanceId: detail.instanceId, character: detail.location, confirmed: true },
      detail.name,
      `装备「${detail.name}」`,
    )
  }

  const onToggleLock = async (detail: ItemDetailView): Promise<void> => {
    await runAction(
      { kind: 'lock', instanceId: detail.instanceId, locked: !detail.locked },
      detail.name,
      `${detail.locked ? '解锁' : '锁定'}「${detail.name}」`,
    )
    if (detail.id === detailId) setDetailId(null)
  }

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
          disabled={busy}
          onClick={() => {
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
            <h3
              className={`dsh-destiny-section__title${dropTarget === section.location ? ' is-dropTarget' : ''}`}
              onDragOver={(event) => {
                if (!DROP_TARGETS.has(section.location)) return
                event.preventDefault()
                setDropTarget(section.location)
              }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(event) => onDrop(event, section.location)}
            >
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
                    <ItemTile key={item.id} item={item} onOpen={(row) => setDetailId(row.id)} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>

      {receipts.length > 0 && (
        <div className="dsh-destiny-receipts">
          {receipts.map((line) => (
            <div
              key={line.id}
              className={`dsh-destiny-receipt${line.ok ? '' : ' is-error'}`}
              title={line.detail}
            >
              <span className="dsh-destiny-receipt__text">{line.text}</span>
              <span className="dsh-destiny-receipt__detail">{line.detail}</span>
            </div>
          ))}
        </div>
      )}

      {detailId !== null && (
        <ItemDetailCard
          routePath={routePath}
          itemId={detailId}
          onClose={() => setDetailId(null)}
          onEquip={(detail) => void onEquip(detail)}
          onToggleLock={(detail) => void onToggleLock(detail)}
        />
      )}

      {pendingEquip !== null && (
        <div className="dsh-destiny-detail__scrim" onClick={() => setPendingEquip(null)} role="presentation">
          <section className="dsh-destiny-confirm" onClick={(event) => event.stopPropagation()}>
            <p className="dsh-destiny-confirm__title">确认装备</p>
            <p className="dsh-destiny-confirm__body">{pendingEquip.summary}</p>
            <p className="dsh-destiny-confirm__note">
              装备会顶掉当前槽位上的那一件，这是一次真实的账号写入。
            </p>
            <div className="dsh-destiny-confirm__actions">
              <button type="button" onClick={() => setPendingEquip(null)}>
                取消
              </button>
              <button type="button" className="is-primary" onClick={() => void confirmEquip()}>
                装备
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

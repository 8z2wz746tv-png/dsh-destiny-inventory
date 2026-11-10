import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useHoverCard } from './use-hover-card'
import type { DragEvent, ReactElement } from 'react'
import type {
  CharacterRow,
  InventorySnapshot,
  ItemRow,
  PlayerProfileView,
} from '../host/types'
import { warmDetails } from './api'
import { ItemDetailCard } from './ItemDetail'
import { DEFAULT_FILTERS, availableTypes, buildSections, emptyShelfSections } from './filter'
import { InventoryToolbar } from './InventoryToolbar'
import { useItemActions } from './use-item-actions'
import { PendingOps } from './pending-ops'
import { loadInventory } from './load-inventory'
import { Receipts } from './Receipts'
import { useViewReport } from './use-view-report'
import { viewOf } from './view-reporter'
import { useReceipts } from './use-receipts'
import { CellSegments } from './CellSegments'
import { ENGRAM_CELL_STYLE, ENGRAM_SHELF_STYLE } from './segments'
import { ItemTile } from './ItemTile'
import type { InventoryFilters, LayoutMode, StoreCell } from './filter'

type LoadState =
  | { kind: 'loading' }
  /* `observed` 是未叠 overlay 的原始行；`patchRows` 不碰它 */
  | { kind: 'ready'; snapshot: InventorySnapshot; observed: ItemRow[]; profile: PlayerProfileView }




const CLASS_LOCATION: Record<number, string> = { 0: 'titan', 1: 'hunter', 2: 'warlock' }
const BUNGIE_ORIGIN = 'https://www.bungie.net'

/** Join class names, dropping the falsy ones. */
function cls(...parts: (string | false | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/**
 * The inventory page mounted in the layout's keyed main slot.
 *
 * Layout follows DIM's desktop page: category sections, one row per item type,
 * and inside each row one cell per store (characters fixed, vault flexible), so
 * the same gun can be compared across stores without changing pages.
 */
function StoreCard({
  label,
  count,
  character,
  active,
  onPick,
}: {
  label: string
  count: number
  character?: CharacterRow
  active?: boolean
  onPick?: () => void
}): ReactElement {
  // The wide name-card banner is the backdrop; the emblem itself is a small
  // square icon and belongs in a corner, not stretched across the card.
  const banner =
    character?.emblemBackground != null && character.emblemBackground !== ''
      ? BUNGIE_ORIGIN + character.emblemBackground
      : undefined
  return (
    <button
      type="button"
      className={cls('dsh-destiny-store', active && 'is-active')}
      onClick={onPick}
      disabled={onPick === undefined}
    >
      {banner !== undefined && <img className="dsh-destiny-store__banner" src={banner} alt="" />}
      {banner !== undefined && <span className="dsh-destiny-store__wash" aria-hidden="true" />}
      <span className="dsh-destiny-store__body">
        <span className="dsh-destiny-store__label">{label}</span>
        {character !== undefined && character.title !== '' ? (
          <span className="dsh-destiny-store__title">{character.title}</span>
        ) : (
          <span className="dsh-destiny-store__stats">
            {character !== undefined ? '' : count + ' 件'}
          </span>
        )}
      </span>
      {character !== undefined && (
        <>
          <span className="dsh-destiny-store__light">
            <i aria-hidden="true" />
            {character.light}
          </span>
        </>
      )}
    </button>
  )
}

export function InventoryPanel({ routePath }: { routePath: string }): ReactElement {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  /** Last request failure: kept apart so a failed refresh cannot delete the painted grid. */
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<InventoryFilters>(DEFAULT_FILTERS)
  const hoverCard = useHoverCard()
  const overlays = state.kind === 'ready' ? state.snapshot.overlays : undefined
  const receipts = useReceipts()
  // Asked for, not yet confirmed: the action hook registers into it, `load` draws.
  const pending = useMemo(() => new PendingOps(), [])
  const [dragging, setDragging] = useState<ItemRow | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  /** Width class of the panel: a side panel is not a full-screen DIM. */
  const [layout, setLayout] = useState<LayoutMode>('wide')
  /** Which character column medium mode shows; also the single-character mode. */
  const [activeCharacter, setActiveCharacter] = useState('hunter')
  const panelRef = useRef<HTMLDivElement | null>(null)

  /**
   * Warm every detail after the grid is on screen.
   *
   * DIM never makes the pointer wait because it builds every item up front; we
   * keep the per-item read but pull them in during idle time so a hover almost
   * always lands on a warm entry. Failures are ignored, the card refetches.
   */
  useEffect(() => {
    if (state.kind !== 'ready') return
    const controller = new AbortController()
    warmDetails(routePath, controller.signal)
    return () => controller.abort()
  }, [routePath, state])

  const load = useCallback(
    (signal: AbortSignal, refresh: boolean): Promise<void> =>
      loadInventory(
        {
          routePath,
          pending,
          onSnapshot: (snapshot, observed, profile) => { setState({ kind: 'ready', snapshot, observed, profile }); setError(null) },
          onError: setError,
        },
        signal,
        refresh,
      ),
    [pending, routePath],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal, false)
    return () => controller.abort()
  }, [load])

  // Measure the panel itself, not the viewport: the sidebar owns the difference
  // and the same window can host a wide page or a narrow one.
  useEffect(() => {
    const node = panelRef.current
    if (node === null) return
    const apply = (width: number): void => {
      setLayout(width < 640 ? 'narrow' : width < 1024 ? 'medium' : 'wide')
    }
    apply(node.getBoundingClientRect().width)
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) apply(entry.contentRect.width)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  /** 只改渲染行；`observed` 不经过这里。 */
  const patchRows = useCallback((change: (rows: ItemRow[]) => ItemRow[]) => {
    setState((current) =>
      current.kind === 'ready'
        ? { ...current, snapshot: { ...current.snapshot, items: change(current.snapshot.items) } }
        : current,
    )
  }, [])

  // Every account write goes through one queue; the panel only paints what it
  // reports back.
  const actions = useItemActions({
    routePath,
    receipts,
    patchRows,
    pending,
    closeCard: hoverCard.close,
  })

  const items = state.kind === 'ready' ? state.snapshot.items : []
  const profile = state.kind === 'ready' ? state.profile : undefined
  const sections = useMemo(
    () => buildSections(items, filters, { layout, activeCharacter }),
    [items, filters, layout, activeCharacter],
  )
  /**
   * 页面顺序 + 常驻货架：邮局与水晶空着也占位，其余有货才出现。
   */
  const displaySections = useMemo(() => {
    const shelves = new Map(emptyShelfSections().map((section) => [section.id, section]))
    const byId = new Map(sections.map((section) => [section.id, section]))
    const order = ['postmaster', 'engrams', 'weapons', 'armor', 'general', 'inventory']
    return order
      .map((id) => byId.get(id) ?? shelves.get(id))
      .filter((section): section is (typeof sections)[number] => section !== undefined)
  }, [sections])

  const types = useMemo(() => availableTypes(items), [items])
  const visibleCount = sections.reduce((sum, section) => sum + section.itemCount, 0)
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

  // 「这件」从这里答，但给的是三个来源，不是一个位置。
  const picked = hoverCard.target === null ? undefined : itemById.get(hoverCard.target.id)
  const observedRow = state.kind === 'ready' && picked ? state.observed.find((i) => i.instanceId === picked.instanceId) : undefined
  const selection = picked && {
    picked, observed: observedRow, operation: pending.get(picked.instanceId),
    observedAt: state.kind === 'ready' ? state.snapshot.fetchedAt : 0,
  }
  useViewReport(routePath, viewOf(layout === 'wide' ? 'all' : activeCharacter, filters, selection, dropTarget))
  const characterByLocation = useMemo(() => {
    const map = new Map<string, CharacterRow>()
    for (const character of profile?.characters ?? []) {
      const location = CLASS_LOCATION[character.classType]
      if (location !== undefined) map.set(location, character)
    }
    return map
  }, [profile])

  const storeCards = useMemo(() => {
    const order = ['hunter', 'warlock', 'titan', 'vault', 'profile', 'postmaster']
    const labels: Record<string, string> = {
      hunter: '猎人',
      warlock: '术士',
      titan: '泰坦',
      vault: '仓库',
      profile: '账号',
      postmaster: '邮政官',
    }
    const counts = new Map<string, number>()
    for (const item of items) counts.set(item.locationKey, (counts.get(item.locationKey) ?? 0) + 1)
    return order
      .filter((location) => (counts.get(location) ?? 0) > 0)
      .map((location) => ({
        location,
        label: labels[location] ?? location,
        count: counts.get(location) ?? 0,
        character: characterByLocation.get(location),
      }))
  }, [items, characterByLocation])

  const patch = (next: Partial<InventoryFilters>): void => setFilters((current) => ({ ...current, ...next }))

  const onCellDrop = (event: DragEvent<HTMLDivElement>, cell: StoreCell): void => {
    event.preventDefault()
    setDropTarget(null)
    const id = event.dataTransfer.getData('text/plain')
    const item = itemById.get(id) ?? dragging
    setDragging(null)
    if (item === null || item === undefined) return
    actions.move(item, cell.location)
  }

  /** One tile; shared by the flat list and the segmented vault. */
  const renderTile = (item: ItemRow): ReactElement => (
    <ItemTile
      key={item.id}
      item={item}
      compact={item.inventoryBucketHash === 375726501}
      overlays={overlays}
      onOpen={hoverCard.show}
      onDragStart={setDragging}
      onDragEnd={() => setDragging(null)}
    />
  )

  /** One store cell: the worn slot, then the carried tiles. */
  const renderCell = (cell: StoreCell, shelf?: { id: string; capacity: number }): ReactElement => (
    <div
      key={cell.location}
      className={cls('dsh-destiny-cell', cell.flex && 'is-flex', dropTarget === cell.location && 'is-over')}
      style={shelf?.id === 'engrams' ? ENGRAM_CELL_STYLE : undefined}
      data-shelf={shelf?.id}
      onDragOver={(event) => {
        // Unconditional: dragover only fires during a drag, and gating this on
        // React state (one render behind) silently rejected the first events —
        // which is why only some cells looked droppable.
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        setDropTarget(cell.location)
      }}
      onDragLeave={(event) => {
        // Fires for every child too; only clear when the pointer really left.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        setDropTarget((current) => (current === cell.location ? null : current))
      }}
      onDrop={(event) => onCellDrop(event, cell)}
    >
      {cell.equipped !== null && (
        <div className="dsh-destiny-cell__worn">
          <ItemTile
            item={cell.equipped}
            compact={shelf?.id === 'engrams'}
            overlays={overlays}
            onOpen={hoverCard.show}
            onDragStart={setDragging}
            onDragEnd={() => {
              setDragging(null)
              setDropTarget(null)
            }}
          />
        </div>
      )}
      <div className="dsh-destiny-cell__rest" style={shelf?.id === 'engrams' ? ENGRAM_SHELF_STYLE : undefined}>
        {cell.segments.length > 0 && (
          <CellSegments segments={cell.segments} renderTile={renderTile} />
        )}
        {cell.segments.length === 0 && cell.items.map((item) => renderTile(item))}
        {shelf !== undefined &&
          cell.location !== 'vault' &&
          Array.from(
            { length: Math.max(0, shelf.capacity - cell.items.length - (cell.equipped === null ? 0 : 1)) },
            (_, index) => (
              <span
                key={'empty-' + index}
                className={cls('dsh-destiny-engram-empty', shelf.id === 'postmaster' && 'is-tile')}
                aria-hidden="true"
              />
            ),
          )}
      </div>
    </div>
  )

  return (
    <div className="dsh-destiny-panel" data-dsh-destiny-view="" ref={panelRef}>
      <div className="dsh-destiny-stores">
        {storeCards.map((card) => (
          <StoreCard
            key={card.location}
            label={card.label}
            count={card.count}
            character={card.character}
            active={layout !== 'wide' && card.location === activeCharacter}
            onPick={
              layout === 'wide' || card.location === 'vault'
                ? undefined
                : () => setActiveCharacter(card.location)
            }
          />
        ))}
      </div>

      <InventoryToolbar
        filters={filters}
        types={types}
        countLabel={state.kind === 'ready' ? visibleCount + ' / ' + state.snapshot.total : ''}
        busy={actions.busy} fetchedAt={state.kind === 'ready' ? state.snapshot.fetchedAt : null}
        onPatch={patch}
        onRefresh={() => load(new AbortController().signal, true)}
      />

      {state.kind === 'loading' && error === null && (
        <div className="dsh-destiny-skeleton" aria-hidden="true">
          {Array.from({ length: 4 }, (_, rowIndex) => (
            <div key={rowIndex} className="dsh-destiny-skeleton__row">
              {Array.from({ length: 12 }, (_, tileIndex) => (
                <div key={tileIndex} className="dsh-destiny-skeleton__tile" />
              ))}
            </div>
          ))}
          <p className="dsh-destiny-panel__state">正在读取仓库…</p>
        </div>
      )}
      {error !== null && (
        <p className="dsh-destiny-panel__state dsh-destiny-panel__state--error">
          {(state.kind === 'ready' ? '刷新失败，下面是上一次的数据：' : '') + error}
        </p>
      )}
      {state.kind === 'ready' && state.snapshot.truncated && (
        <p className="dsh-destiny-panel__state dsh-destiny-panel__state--error">
          这次读取没拿全（{state.snapshot.items.length} / {state.snapshot.total}），别把它当成空仓库。
        </p>
      )}
      {state.kind === 'ready' && visibleCount === 0 && (
        <p className="dsh-destiny-panel__state">没有符合当前筛选的物品。</p>
      )}

      <div className="dsh-destiny-body">
        {displaySections.map((section) => (
          <section key={section.id} className="dsh-destiny-section">
            <h3 className="dsh-destiny-section__title">
              {section.label}
              <span className="dsh-destiny-section__count">{section.itemCount}</span>
            </h3>
            {section.rows.map((row) => (
              <div
                key={row.label}
                className="dsh-destiny-row"
                title={row.label}
              >
                {row.cells.map((cell) =>
                  renderCell(
                    cell,
                    section.id === 'engrams'
                      ? { id: 'engrams', capacity: 10 }
                      : section.id === 'postmaster'
                        ? { id: 'postmaster', capacity: 21 }
                        : undefined,
                  ),
                )}
              </div>
            ))}
          </section>
        ))}
      </div>

      <Receipts lines={receipts.lines} onDismiss={receipts.dismiss} />

      {hoverCard.target !== null && (
        <ItemDetailCard
          routePath={routePath}
          itemId={hoverCard.target.id}
          anchor={hoverCard.target.anchor}
          anchorSummary={hoverCard.target.summary}
          onClose={hoverCard.close}
          onEquip={(detail) => void actions.equip(detail)}
          onToggleLock={(detail) => void actions.toggleLock(detail)}
        />
      )}

      {actions.pendingEquip !== null && (
        <div className="dsh-destiny-detail__scrim" onClick={actions.cancelEquip} role="presentation">
          <section className="dsh-destiny-confirm" onClick={(event) => event.stopPropagation()}>
            <p className="dsh-destiny-confirm__title">确认装备</p>
            <p className="dsh-destiny-confirm__body">{actions.pendingEquip.summary}</p>
            <p className="dsh-destiny-confirm__note">
              装备会顶掉当前槽位上的那一件，这是一次真实的账号写入。
            </p>
            <div className="dsh-destiny-confirm__actions">
              <button type="button" onClick={actions.cancelEquip}>
                取消
              </button>
              <button type="button" className="is-primary" onClick={() => void actions.confirmEquip()}>
                装备
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

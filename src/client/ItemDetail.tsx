/**
 * The hover card — the webui's floating item preview, ported to our data.
 *
 * Deliberately not a panel or a modal: pointing at a tile is the interaction the
 * original had, and the card follows the pointer so the grid stays visible.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactElement } from 'react'
import type { ItemDetailView } from '../host/types'
import { AMMO_CODE, AMMO_ICON } from './ammo-icons'
import { IntrinsicBlock } from './IntrinsicBlock'
import { ArmorEnergy, ArmorSetPanel } from './ArmorBlocks'
import { PerkColumns } from './PerkColumns'
import type { HoverSummary } from './use-hover-card'
import { RecoilGauge } from './RecoilGauge'
import { peekItemDetail, readItemDetailCached } from './api'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; detail: ItemDetailView }
  | { kind: 'error'; message: string }

/**
 * Rarity key → the class the ported stylesheet selects.
 *
 * The key is the same `exotic`/`legendary`/`rare`/`unknown` vocabulary the grid
 * uses; the label is translated only for display.
 */
function tierClass(rarity: string): string {
  return rarity === 'unknown' ? '' : `tier-${rarity}`
}


/** Localized rarity label. */
function tierLabel(rarity: string): string {
  return { exotic: '异域', legendary: '传说', rare: '稀有', common: '普通', unknown: '未知' }[rarity] ?? ''
}

/** Damage class for the power badge tint. */
function damageClass(damage: string): string {
  if (damage.includes('烈日')) return 'damage-solar'
  if (damage.includes('电弧')) return 'damage-arc'
  if (damage.includes('虚空')) return 'damage-void'
  if (damage.includes('冰影')) return 'damage-stasis'
  if (damage.includes('缚丝')) return 'damage-strand'
  return 'damage-kinetic'
}

/**
 * Place the card next to its anchor, flipping when there is no room.
 * @param anchor - the tile's viewport rectangle.
 * @returns fixed-position coordinates.
 */
function place(anchor: DOMRect, height: number): { left: number; top: number } {
  const width = 386
  const margin = 12
  const gap = 10
  const left = anchor.right + gap + width > window.innerWidth - margin
    ? Math.max(margin, anchor.left - width - gap)
    : anchor.right + gap
  // Clamp against the card's real height: a hardcoded guess left a tall card
  // hanging past the bottom edge whenever the tile sat low in the viewport.
  const room = Math.max(margin, window.innerHeight - height - margin)
  return { left, top: Math.max(margin, Math.min(anchor.top, room)) }
}

/**
 * The floating card.
 * @param props - bridge route, item id, the tile it hangs off, close handler.
 */
export function ItemDetailCard({
  routePath,
  itemId,
  anchor,
  anchorSummary,
  onClose,
  onEquip,
  onToggleLock,
  highlight = '',
}: {
  routePath: string
  itemId: string
  /** 当前搜索词；命中它的 perk 在卡里会被标出来。 */
  highlight?: string
  anchor: DOMRect
  /** The row the tile already knows: name, icon, type, rarity, power. */
  anchorSummary?: HoverSummary
  onClose: () => void
  /** Equip this item; the panel owns the confirmation flow. */
  onEquip: (detail: ItemDetailView) => void
  /** Toggle the item's lock. */
  onToggleLock: (detail: ItemDetailView) => void
}): ReactElement {
  // Start from the cache when it has this item: a hit must paint content on the
  // very first frame, not flash "reading…" while a promise resolves.
  /** Head fields from the grid row, so the card never opens blank. */
  const [summary] = useState(anchorSummary)

  const [state, setState] = useState<LoadState>(() => {
    const ready = peekItemDetail(routePath, itemId)
    return ready === null ? { kind: 'loading' } : { kind: 'ready', detail: ready }
  })

  useEffect(() => {
    const ready = peekItemDetail(routePath, itemId)
    if (ready !== null) {
      setState({ kind: 'ready', detail: ready })
      return
    }
    const controller = new AbortController()
    setState({ kind: 'loading' })
    readItemDetailCached(routePath, itemId, controller.signal).then(
      (detail) => {
        if (!controller.signal.aborted) setState({ kind: 'ready', detail })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
      },
    )
    return () => controller.abort()
  }, [routePath, itemId])

  // A click anywhere outside the card dismisses it; Escape still works.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    const onDown = (event: PointerEvent): void => {
      const node = cardRef.current
      if (node !== null && !node.contains(event.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [onClose])

  // Measure per render: the perk list changes the height, and placement needs it.
  const cardRef = useRef<HTMLElement>(null)
  const [cardHeight, setCardHeight] = useState(0)
  useLayoutEffect(() => {
    const measured = cardRef.current?.offsetHeight ?? 0
    if (measured > 0 && measured !== cardHeight) setCardHeight(measured)
  })
  const position = place(anchor, cardHeight)
  const ammoCode = state.kind === 'ready' ? (AMMO_CODE[state.detail.ammoType] ?? 0) : 0

  const card = (
    <aside
      ref={cardRef}
      className={`inventory-hover-card ${tierClass(state.kind === 'ready' ? state.detail.rarity : '')}`}
      style={{ left: position.left, top: position.top }}
      aria-label="物品详情"
    >
      {state.kind !== 'ready' && summary !== undefined && (
        <header className="inventory-hover-header">
          <span>{tierLabel(summary.rarity)}</span>
          <h2>{summary.name}</h2>
          <div>
            <strong>{summary.type}</strong>
            {summary.power !== null && <b>{summary.power}</b>}
          </div>
        </header>
      )}
      {state.kind === 'loading' && <p className="inventory-hover-empty">正在读取特性…</p>}
      {state.kind === 'error' && <p className="inventory-hover-empty">{state.message}</p>}
      {state.kind === 'ready' && (
        <>
          <header className="inventory-hover-header">
            <span>
              {tierLabel(state.detail.rarity)}
              {state.detail.equipped === 'equipped' ? ' · 已装备' : ''}
              {state.detail.equipped === 'unknown' ? ' · 装备状态未知' : ''}
            </span>
            <h2>{state.detail.name}</h2>
            <div>
              <strong>
                {[state.detail.weaponType, state.detail.ammoType].filter((part) => part !== '').join(' · ')}
              </strong>
              {state.detail.power !== null && (
                <b className={damageClass(state.detail.damageType)}>{state.detail.power}</b>
              )}
            </div>
          </header>

          <div className="inventory-hover-body">
            <div className="inventory-hover-meta">
              {state.detail.damageIcon !== '' && (
                <img
                  className="inventory-hover-glyph"
                  src={state.detail.damageIcon}
                  alt=""
                  title={state.detail.damageType}
                />
              )}
              {AMMO_ICON[ammoCode] !== undefined && (
                <img
                  className="inventory-hover-glyph"
                  src={AMMO_ICON[ammoCode]}
                  alt=""
                  title={state.detail.ammoType}
                />
              )}
              {state.detail.gearTier !== null && state.detail.gearTier > 0 && (
                <span title="装备阶级">T{state.detail.gearTier}</span>
              )}
              {state.detail.crafted && <span title="已锻造">已锻造</span>}
              {state.detail.enhanced && <span title="已强化">已强化</span>}
              {state.detail.itemLevel !== null && <span title="武器等级">等级 {state.detail.itemLevel}</span>}
              {state.detail.damageType !== '' && <span>{state.detail.damageType}</span>}
              {state.detail.locked && <span>已锁定</span>}
              {state.detail.equipped === 'equipped' && <span>当前装备</span>}
            </div>

            <div className="inventory-hover-actions">
              <button type="button" onClick={() => onEquip(state.detail)}>
                装备
              </button>
              <button type="button" onClick={() => onToggleLock(state.detail)}>
                {state.detail.locked ? '解锁' : '锁定'}
              </button>
            </div>

            {state.detail.killCount !== null && (
              <p className="inventory-hover-killtracker">
                <span>已击败敌人</span>
                <strong>{state.detail.killCount.toLocaleString()}</strong>
              </p>
            )}

            {state.detail.description !== '' && (
              <p className="inventory-hover-description">{state.detail.description}</p>
            )}

              <IntrinsicBlock intrinsic={state.detail.intrinsic} />
              <ArmorEnergy energy={state.detail.energy} />
              <ArmorSetPanel set={state.detail.set} />

            {state.detail.stats.length > 0 && (
              <section
                className="inventory-hover-stats"
                aria-label={state.detail.kind === 'armor' ? '护甲属性' : '武器属性'}
              >
                <h3>{state.detail.kind === 'armor' ? '护甲属性' : '武器属性'}</h3>
                {state.detail.stats.map((stat) => (
                  <div key={stat.hash}>
                    <span>{stat.name}</span>
                    <strong>{stat.value}</strong>
                    {stat.display === 'bar' ? (
                      <i>
                        <b style={{ width: `${Math.min(stat.value, 100)}%` }} />
                      </i>
                    ) : stat.display === 'recoil' ? (
                      <i className="is-gauge">
                        <RecoilGauge value={stat.value} />
                      </i>
                    ) : (
                      <i className="is-number" />
                    )}
                  </div>
                ))}
              </section>
            )}

            {state.detail.columns.length > 0 && (
              <section className="inventory-hover-sockets">
                <h3>{state.detail.kind === 'armor' ? '护甲模组' : '武器特性'}</h3>
                <PerkColumns columns={state.detail.columns} highlight={highlight} />
              </section>
            )}

            {state.detail.columns.length === 0 && (
              <p className="inventory-hover-empty">这件物品没有可切换的特性。</p>
            )}
          </div>
        </>
      )}
    </aside>
  )

  // Portal to the body, as the webui this was ported from does: inside the panel
  // a transformed ancestor would make `position: fixed` relative to it.
  if (typeof document === 'undefined') return card
  return createPortal(card, document.body)
}

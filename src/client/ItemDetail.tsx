/**
 * The hover card — the webui's floating item preview, ported to our data.
 *
 * Deliberately not a panel or a modal: pointing at a tile is the interaction the
 * original had, and the card follows the pointer so the grid stays visible.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactElement } from 'react'
import type { ItemDetailView } from '../mcp/types'
import { readItemDetailCached } from './api'

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

/**
 * Recoil direction as a gauge, ported from DIM's `RecoilStat`.
 *
 * Positive value leans right, negative left, zero straight up; a value of 95+
 * draws a straight line instead of a fan because the spread is already tiny.
 * @param props - the stat value (0..100).
 */
function RecoilGauge({ value }: { value: number }): ReactElement {
  const direction = (Math.sin(((value + 5) * Math.PI) / 10) * (100 - value) * 0.8 * Math.PI) / 180
  const x = Math.sin(direction)
  const y = Math.cos(direction)
  const spread = ((100 - value) / 100) * 90 * (Math.PI / 180) * Math.sign(direction)
  const xMore = Math.sin(direction + spread)
  const yMore = Math.cos(direction + spread)
  const xLess = Math.sin(direction - spread)
  const yLess = Math.cos(direction - spread)
  return (
    <svg className="dsh-destiny-recoil" viewBox="0 0 2 1" aria-label={`后坐方向 ${value}`}>
      <circle r={1} cx={1} cy={1} fill="#333" />
      {value >= 95 ? (
        <line x1={1 - x} y1={1 + y} x2={1 + x} y2={1 - y} stroke="white" strokeWidth="0.1" />
      ) : (
        <path
          d={`M1,1 L${1 + xMore},${1 - yMore} A1,1 0 0,${direction < 0 ? '1' : '0'} ${1 + xLess},${1 - yLess} Z`}
          fill="#fff"
        />
      )}
    </svg>
  )
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
function place(anchor: DOMRect): { left: number; top: number } {
  const width = 386
  const margin = 12
  const gap = 10
  const left = anchor.right + gap + width > window.innerWidth - margin
    ? Math.max(margin, anchor.left - width - gap)
    : anchor.right + gap
  const top = Math.max(margin, Math.min(anchor.top, window.innerHeight - 360))
  return { left, top }
}

/**
 * The floating card.
 * @param props - bridge route, item id, the tile it hangs off, close handler.
 */
export function ItemDetailCard({
  routePath,
  itemId,
  anchor,
  onEnter,
  onLeave,
  onClose,
}: {
  routePath: string
  itemId: string
  anchor: DOMRect
  /** Pointer entered the card: cancel any pending close. */
  onEnter: () => void
  /** Pointer left the card: let the panel decide whether to close. */
  onLeave: () => void
  onClose: () => void
}): ReactElement {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
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

  const position = place(anchor)

  const card = (
    <aside
      className={`inventory-hover-card ${tierClass(state.kind === 'ready' ? state.detail.rarity : '')}`}
      style={{ left: position.left, top: position.top }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      aria-label="物品详情"
    >
      {state.kind === 'loading' && <p className="inventory-hover-empty">正在读取物品…</p>}
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

            {state.detail.killCount !== null && (
              <p className="inventory-hover-killtracker">
                <span>已击败敌人</span>
                <strong>{state.detail.killCount.toLocaleString()}</strong>
              </p>
            )}

            {state.detail.description !== '' && (
              <p className="inventory-hover-description">{state.detail.description}</p>
            )}

            {state.detail.stats.length > 0 && (
              <section className="inventory-hover-stats" aria-label="武器属性">
                <h3>武器属性</h3>
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
                <h3>武器特性</h3>
                {/*
                  One column per socket, its whole pool stacked inside: the
                  installed plug is bright, the alternatives dim. This is the
                  shape the webui renders and the reason a single flat grid read
                  as "missing perks".
                */}
                <div className="inventory-hover-socket-columns">
                  {state.detail.columns.map((column) => (
                    <div className="inventory-hover-socket-column" key={column.socketIndex}>
                      <p className="inventory-hover-socket-column__label">{column.slot}</p>
                      {column.options.map((option) => (
                        <div
                          className={`inventory-hover-perk${option.selected ? ' is-selected' : ''}`}
                          key={`${column.socketIndex}:${option.hash}`}
                          title={option.description === '' ? option.name : `${option.name}\n${option.description}`}
                        >
                          <div className="inventory-hover-perk-icon">
                            {option.icon !== '' && <img src={option.icon} alt="" loading="lazy" />}
                          </div>
                          <strong>{option.name}</strong>
                          {option.enhancedHash === option.hash && option.hash !== 0 && (
                            <span className="inventory-hover-perk__enhanced" title="强化特性" aria-label="强化特性">
                              ▲
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
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

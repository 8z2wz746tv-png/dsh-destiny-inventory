import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { ItemDetailView, PerkColumnView, PerkOptionView } from '../mcp/types'
import { fetchItemDetail } from './api'

/**
 * The item detail card.
 *
 * Weapons get DIM's layout: one column per socket, every option the socket can
 * hold stacked in that column with the socketed one marked. Non-weapons have no
 * published option list, so each socket shows only what is currently in it.
 */

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; detail: ItemDetailView }
  | { kind: 'error'; message: string }

/** Facts worth showing above the sockets, skipping the ones the tool omitted. */
function factLine(detail: ItemDetailView): string {
  return [detail.rarity, detail.weaponType, detail.frame, detail.damageType, detail.ammoType]
    .filter((part): part is string => typeof part === 'string' && part !== '')
    .join(' · ')
}

/**
 * One perk.
 * @param props - the option and whether it is the socketed one.
 */
function PerkCell({ option }: { option: PerkOptionView }): ReactElement {
  const className = `dsh-destiny-perk${option.selected ? ' is-selected' : ''}`
  const tooltip = option.description === '' ? option.name : `${option.name}\n\n${option.description}`
  return (
    <div className={className} title={tooltip}>
      {option.icon === '' ? (
        <span className="dsh-destiny-perk__blank" />
      ) : (
        <img className="dsh-destiny-perk__icon" src={option.icon} alt="" loading="lazy" decoding="async" />
      )}
      <span className="dsh-destiny-perk__name">{option.name}</span>
      {option.statEffects.length > 0 && (
        <span className="dsh-destiny-perk__stats">
          {option.statEffects
            .map((effect) => `${effect.stat} ${effect.value > 0 ? '+' : ''}${effect.value}`)
            .join('  ')}
        </span>
      )}
    </div>
  )
}

/**
 * One socket column.
 * @param props - the column.
 */
function PerkColumn({ column }: { column: PerkColumnView }): ReactElement {
  const essential = column.kind === 'intrinsic' || column.slot === '框架'
  return (
    <div className={`dsh-destiny-column${essential ? ' is-essential' : ''}`}>
      <p className="dsh-destiny-column__label">{column.slot || column.kind}</p>
      <div className="dsh-destiny-column__cells">
        {column.options.map((option) => (
          <PerkCell key={`${column.socketIndex}:${option.hash}`} option={option} />
        ))}
      </div>
    </div>
  )
}

/**
 * The overlay card.
 * @param props - bridge route, the item id, close handler, and the action callbacks.
 */
export function ItemDetailCard({
  routePath,
  itemId,
  onClose,
  onEquip,
  onToggleLock,
}: {
  routePath: string
  itemId: string
  onClose: () => void
  onEquip: (detail: ItemDetailView) => void
  onToggleLock: (detail: ItemDetailView) => void
}): ReactElement {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    setState({ kind: 'loading' })
    fetchItemDetail(routePath, itemId, controller.signal).then(
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="dsh-destiny-detail__scrim" onClick={onClose} role="presentation">
      <section
        className="dsh-destiny-detail"
        onClick={(event) => event.stopPropagation()}
        aria-label="物品详情"
      >
        {state.kind === 'loading' && <p className="dsh-destiny-panel__state">正在读取物品…</p>}
        {state.kind === 'error' && (
          <p className="dsh-destiny-panel__state dsh-destiny-panel__state--error">{state.message}</p>
        )}
        {state.kind === 'ready' && (
          <>
            <header className="dsh-destiny-detail__head">
              {state.detail.icon !== '' && (
                <img className="dsh-destiny-detail__icon" src={state.detail.icon} alt="" />
              )}
              <div className="dsh-destiny-detail__titles">
                <h2 className="dsh-destiny-detail__name">{state.detail.name}</h2>
                <p className="dsh-destiny-detail__facts">{factLine(state.detail)}</p>
                <p className="dsh-destiny-detail__power">
                  光等 {state.detail.power ?? '—'}
                  {state.detail.equipped ? ' · 已装备' : ''}
                  {state.detail.locked ? ' · 已锁定' : ''}
                </p>
              </div>
              <button type="button" className="dsh-destiny-detail__close" onClick={onClose}>
                ✕
              </button>
            </header>

            {state.detail.rollSummary !== '' && (
              <p className="dsh-destiny-detail__roll">{state.detail.rollSummary}</p>
            )}

            <div className="dsh-destiny-detail__body">
              {state.detail.columns.map((column) => (
                <PerkColumn key={column.socketIndex} column={column} />
              ))}
            </div>

            <footer className="dsh-destiny-detail__actions">
              <button type="button" onClick={() => onEquip(state.detail)}>
                装备
              </button>
              <button type="button" onClick={() => onToggleLock(state.detail)}>
                {state.detail.locked ? '解锁' : '锁定'}
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  )
}

/**
 * One item tile in the grid.
 *
 * Split out of `InventoryPanel` to keep that file under its size ceiling, and
 * because the tile carries every icon badge (tier pips, crafted chip, champion
 * counter, season watermark) — a surface of its own.
 */
import type { ReactElement } from 'react'
import type { DragEvent } from 'react'
import type { ItemRow } from '../mcp/types'

/** Join class names, dropping falsy entries. */
function cls(...names: (string | false | null | undefined)[]): string {
  return names.filter((name): name is string => typeof name === 'string' && name !== '').join(' ')
}

/** Champion a weapon counters, by `breakerType`. */
export const BREAKER_LABEL: Record<number, string> = { 1: '反制屏障', 2: '反制过载', 3: '反制不可阻挡' }

export function ItemTile({
  item,
  compact = false,
  overlays,
  onHover,
  onPin,
  onLeave,
  onDragStart,
  onDragEnd,
}: {
  /** Engram shelves draw small round icons, one row per bucket. */
  compact?: boolean;
  item: ItemRow
  /** The game's badge artwork, handed down with the snapshot. */
  overlays?: { crafted: string; craftedBackground: string; tiers: string[] }
  onHover: (target: { id: string; anchor: DOMRect }) => void
  /** Click pins the card open. */
  onPin: (target: { id: string; anchor: DOMRect }) => void
  /** Pointer left the tile: the panel decides whether to close. */
  onLeave: () => void
  onDragStart: (item: ItemRow) => void
  onDragEnd: () => void
}): ReactElement {
  const handleDragStart = (event: DragEvent<HTMLDivElement>): void => {
    event.dataTransfer.setData('text/plain', item.id)
    event.dataTransfer.effectAllowed = 'move'
    onDragStart(item)
  }
  const worn = item.equipped === 'equipped'
  const unknown = item.equipped === 'unknown'
  const facts = [item.name, item.type === '' ? null : item.type]
  if (worn) facts.push('已装备' + (item.bucket === null ? '' : ' · ' + item.bucket))
  if (unknown) facts.push('装备状态未知')
  const tooltip = facts.filter((fact): fact is string => fact !== null).join(' · ')
  return (
    <div
      className={cls('dsh-destiny-tile', 'r-' + item.rarity, compact && 'is-compact')}
      title={tooltip}
      data-locked={item.locked ? '1' : '0'}
      data-equipped={item.equipped}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onMouseEnter={(event) =>
        onHover({ id: item.id, anchor: event.currentTarget.getBoundingClientRect() })
      }
      onClick={(event) => onPin({ id: item.id, anchor: event.currentTarget.getBoundingClientRect() })}
      onMouseLeave={() => onLeave()}
    >
      {item.icon === '' ? (
        <div className="dsh-destiny-tile__icon" />
      ) : (
        <img className="dsh-destiny-tile__icon" src={item.icon} alt="" loading="lazy" decoding="async" />
      )}
      {!compact && <span className="dsh-destiny-tile__power">{item.power ?? '—'}</span>}
      {item.watermark !== '' && (
        <img className="dsh-destiny-tile__watermark" src={item.watermark} alt="" aria-hidden="true" />
      )}
      {item.gearTier > 0 && item.gearTier <= 5 && overlays?.tiers[item.gearTier - 1] !== undefined && (
        <img
          className="dsh-destiny-tile__tier"
          src={overlays.tiers[item.gearTier - 1]}
          alt={`T${item.gearTier}`}
          title={`T${item.gearTier}`}
        />
      )}
      {item.crafted && overlays?.crafted !== undefined && overlays.crafted !== '' && (
        <img
          className="dsh-destiny-tile__crafted"
          src={overlays.crafted}
          alt="已锻造"
          title="已锻造"
        />
      )}
      {item.breakerType > 0 && (
        <span
          className={`dsh-destiny-tile__breaker is-${item.breakerType}`}
          title={BREAKER_LABEL[item.breakerType] ?? '反制勇士'}
          aria-label={BREAKER_LABEL[item.breakerType] ?? '反制勇士'}
        />
      )}
      {item.locked && (
        <span className="dsh-destiny-tile__lock" aria-hidden="true">
          🔒
        </span>
      )}
      {worn && <span className="dsh-destiny-tile__worn" aria-hidden="true" />}
      {unknown && <span className="dsh-destiny-tile__unknown" aria-hidden="true">?</span>}
    </div>
  )
}



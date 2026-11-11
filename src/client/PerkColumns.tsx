import type { ReactElement } from 'react'
import { matchesQuery } from './search-text'
import type { PerkColumnView } from '../host/types'

/**
 * The perk grid: one column per socket, its whole pool stacked inside.
 *
 * The installed plug is bright and the alternatives dim, which is the shape the
 * webui renders — a single flat row of perks read as "missing options".
 * @param props - the columns to draw.
 */
export function PerkColumns({
  columns,
  highlight = '',
}: {
  columns: PerkColumnView[]
  /** 当前搜索词；命中的 perk 会被标出来，让"为什么这 25 件"有答案。 */
  highlight?: string
}): ReactElement {
  return (
    <div className="inventory-hover-socket-columns">
      {columns.map((column) => (
        <div className="inventory-hover-socket-column" key={column.socketIndex}>
          <p className="inventory-hover-socket-column__label">{column.slot}</p>
          {column.options.map((option) => (
            <div
              className={`inventory-hover-perk${option.selected ? ' is-selected' : ''}${
                matchesQuery(option.name, highlight) && highlight.trim() !== '' ? ' is-match' : ''
              }`}
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
  )
}

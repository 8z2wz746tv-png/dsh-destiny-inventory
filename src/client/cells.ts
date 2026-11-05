/**
 * The cell builders: one store's slice of a bucket row.
 *
 * Split from `filter.ts` so that file stays inside its ceiling; the grouping that
 * only the vault column gets is decided here.
 */
import type { ItemRow } from '../host/types'
import { segmentsOf } from './segments'
import { STORE_COLUMNS } from './filter'
import type { LayoutMode, StoreCell } from './filter'

export function makeCell(
  location: string,
  label: string,
  flex: boolean,
  items: ItemRow[],
  kind = '',
): StoreCell {
  const equipped = items.find((item) => item.equipped === 'equipped') ?? null
  const rest = equipped === null ? items : items.filter((item) => item !== equipped)
  return {
    location,
    label,
    flex,
    equipped,
    items: rest,
    // Only the vault is grouped; a character's own grid stays flat.
    segments: flex ? segmentsOf(rest, kind) : [],
  }
}

export function buildCells(sorted: ItemRow[], layout: LayoutMode, activeCharacter: string, kind = ''): StoreCell[] {
  if (layout === 'narrow') {
    return [makeCell('all', '全部', true, sorted, kind)]
  }
  if (layout === 'medium') {
    const active = STORE_COLUMNS.find((column) => column.location === activeCharacter) ?? STORE_COLUMNS[0]
    return [
      makeCell(active.location, active.label, false, sorted.filter((item) => item.locationKey === active.location)),
      makeCell('vault', '仓库', true, sorted.filter((item) => item.locationKey === 'vault'), kind),
    ]
  }
  return STORE_COLUMNS.map((column) =>
    makeCell(column.location, column.label, column.location === 'vault', sorted.filter((item) => item.locationKey === column.location), kind),
  )
}

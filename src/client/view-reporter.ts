/**
 * The single place that decides what the panel reports to the host.
 *
 * Split out of the panel because both halves — picking the selected item and
 * shaping the filters — are mapping, and the panel is at its size ceiling.
 */
import type { InventoryFilters } from './filter'
import type { ItemRow } from '../host/types'
import type { ReportedView } from './use-view-report'

/**
 * Build the view the agent reads.
 * @param character - the active character key.
 * @param filters - the panel's current filters.
 * @param picked - the clicked row, when there is one.
 * @param dropTarget - where the last drag was aimed.
 * @returns the reportable view.
 */
export function viewOf(
  character: string,
  filters: InventoryFilters,
  picked: ItemRow | undefined,
  dropTarget: string | null,
): ReportedView {
  return {
    character,
    filters: {
      search: filters.search,
      category: filters.category,
      lock: filters.lock,
      sort: filters.sort,
    },
    selected:
      picked === undefined
        ? null
        : {
            instanceId: picked.instanceId,
            hash: picked.hash,
            name: picked.name,
            location: picked.locationKey,
          },
    lastDropTarget: dropTarget,
  }
}

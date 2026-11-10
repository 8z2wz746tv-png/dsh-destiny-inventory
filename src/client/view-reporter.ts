/**
 * The single place that decides what the panel reports to the host.
 *
 * The selected item is reported as **three columns by source**, not as one position.
 * `effective` is deliberately absent: it is computable from the three, and anything
 * that appears in a contract eventually gets read as an answer.
 */
import type { InventoryFilters } from './filter'
import { itemStateView } from './item-state-view'
import type { ItemRow } from '../host/types'
import type { PendingOperation } from './pending-ops'
import type { ReportedView } from './use-view-report'

/**
 * Build the view the agent reads.
 * @param character - the class key in focus, or `all` when every store is on screen.
 * @param filters - the panel's current filters.
 * @param selection - the clicked item, as its three sources. `picked` is the **rendered**
 *   row and is only used for the rollback mark; `observed` is what Bungie said.
 * @param dropTarget - where the last drag was aimed.
 * @returns the reportable view.
 */
export function viewOf(
  character: string,
  filters: InventoryFilters,
  selection:
    | {
        picked: ItemRow
        observed: ItemRow | undefined
        observedAt: number
        operation: PendingOperation | undefined
      }
    | undefined,
  dropTarget: string | null,
): ReportedView {
  const state =
    selection === undefined
      ? null
      : itemStateView(selection.observed, selection.observedAt, selection.operation, selection.picked)
  return {
    character,
    filters: {
      search: filters.search,
      category: filters.category,
      lock: filters.lock,
      sort: filters.sort,
    },
    selected: state === null ? null : { ...state, hash: selection?.picked.hash ?? 0 },
    lastDropTarget: dropTarget,
  }
}

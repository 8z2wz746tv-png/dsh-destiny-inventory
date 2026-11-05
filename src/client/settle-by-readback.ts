/**
 * Resolve a write whose outcome we cannot trust.
 *
 * A failed response is not a failed write — Bungie syncs seconds behind, and the
 * reverse holds too, so rolling back to a snapshot can show an item in the old
 * place and then jump it forward on the next refresh. Instead: mark the item
 * unknown, ask about that one item, and take the answer.
 */
import { readBridge } from './api'
import { confirmMove, settleMove } from './apply-move'
import type { ItemRow } from '../host/types'

/**
 * Ask Bungie where one item ended up.
 * @param routePath - bridge base pathname.
 * @param instanceId - the item instance.
 * @param patch - apply a change to the rows.
 */
export async function settleByReadBack(
  routePath: string,
  instanceId: string,
  patch: (change: (rows: ItemRow[]) => ItemRow[]) => void,
): Promise<void> {
  patch((rows) => settleMove(rows, instanceId, 'unconfirmed'))
  try {
    const state = await readBridge<{ location: string; equipped: boolean } | null>(
      `${routePath}/item-state?id=${encodeURIComponent(instanceId)}`,
      new AbortController().signal,
    )
    if (state === null) {
      patch((rows) => settleMove(rows, instanceId, undefined))
      return
    }
    patch((rows) => confirmMove(rows, instanceId, state.location, state.equipped))
  } catch {
    // Still unknown: leave the unconfirmed ring up rather than claim either way.
  }
}

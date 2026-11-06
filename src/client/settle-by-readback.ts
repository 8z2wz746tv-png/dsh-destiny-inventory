/**
 * Resolve a write whose outcome we cannot trust.
 *
 * A failed response is not a failed write — Bungie syncs seconds behind, and the
 * reverse holds too, so rolling back to a snapshot can show an item in the old
 * place and then jump it forward on the next refresh. Instead: mark the item
 * unknown, ask about that one item, and take the answer.
 *
 * The answer also goes back to the host. The journal recorded `failed` from the
 * response; if the item is in fact where the drag aimed, the agent must be able to
 * say so instead of repeating an upstream complaint about a write that landed.
 */
import { readBridge } from './api'
import { confirmMove, settleMove } from './apply-move'
import type { ItemRow } from '../host/types'

/**
 * Tell the host what the read-back decided.
 *
 * Fire and forget: a lost correction costs the agent one stale sentence, while
 * failing the move over it would cost the user the move.
 * @param routePath - bridge base pathname.
 * @param instanceId - the item the read-back was about.
 * @param landed - whether it really ended up at the destination.
 * @param location - where Bungie says it is; null when gone.
 */
function reportResolution(
  routePath: string,
  instanceId: string,
  landed: boolean,
  location: string | null,
): void {
  void fetch(`${routePath}/journal/resolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ instanceId, landed, location }),
  }).catch(() => {})
}

/**
 * Ask Bungie where one item ended up.
 * @param routePath - bridge base pathname.
 * @param instanceId - the item instance.
 * @param destination - where the write aimed.
 * @param patch - apply a change to the rows.
 */
export async function settleByReadBack(
  routePath: string,
  instanceId: string,
  destination: string,
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
      reportResolution(routePath, instanceId, false, null)
      return
    }
    patch((rows) => confirmMove(rows, instanceId, state.location, state.equipped))
    reportResolution(routePath, instanceId, state.location === destination, state.location)
  } catch {
    // Still unknown: leave the unconfirmed ring up rather than claim either way,
    // and leave the journal's `failed` alone — the host would be guessing too.
  }
}

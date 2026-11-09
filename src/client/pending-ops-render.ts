/**
 * Draw the rows through the pending overlay.
 *
 * The one rule here: a row whose operation has not been confirmed keeps showing the
 * destination the user chose, even when the snapshot still says otherwise. Rolling
 * back to an observation that is merely late is what made a finished drag look
 * undone — and it is the reason this layer exists.
 */
import type { Observation, PendingOperation } from './pending-ops'
import type { ItemRow } from '../host/types'

/**
 * Turn one read into observations. `issuedAt` is when the request went out, not
 * when it came back: a read that started before an operation proves nothing about it.
 */
export function compareSnapshot(
  rows: ItemRow[],
  ops: ReadonlyMap<string, PendingOperation>,
  issuedAt: number,
): Observation[] {
  const byId = new Map(rows.map((row) => [row.instanceId, row.locationKey]))
  // 快照里没有这件物品时不产生观测：看不到不等于"它在别处"。
  return [...ops.values()].flatMap((operation) => {
    const location = byId.get(operation.instanceId)
    return location === undefined ? [] : [{ instanceId: operation.instanceId, location, startedAt: issuedAt }]
  })
}

/**
 * Rewrite rows that have an unsettled operation.
 * @param rows - the snapshot's rows.
 * @param ops - operations still governing the grid.
 * @returns the rows to render.
 */
export function applyOverlay(
  rows: ItemRow[],
  ops: ReadonlyMap<string, PendingOperation>,
): ItemRow[] {
  if (ops.size === 0) return rows
  return rows.map((row) => {
    const operation = ops.get(row.instanceId)
    if (operation === undefined) return row
    // Already where it should be: nothing to override, and no ring to draw.
    if (row.locationKey === operation.target) return row
    const toVault = operation.target === 'vault'
    return {
      ...row,
      locationKey: operation.target,
      placement: toVault
        ? { kind: 'vault' }
        : { kind: 'inventory', characterId: operation.target },
      characterId: toVault ? null : operation.target,
      equipped: 'not_equipped',
      // `unknown` is the honest mark: we do not know whether it arrived.
      pending: operation.state === 'unknown' ? 'unconfirmed' : 'applying',
    }
  })
}

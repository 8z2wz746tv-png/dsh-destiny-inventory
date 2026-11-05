/**
 * Apply a completed move to the rows already on screen.
 *
 * DIM dispatches `itemMoved` and edits the store in place; it does not refetch.
 * Refetching here took seconds and left the item visibly in its old place, which
 * reads as "the drag did nothing". The next `/inventory` call reconciles anything
 * this cannot know (a full bucket, a stack split).
 */
import type { ItemRow } from '../host/types'

/**
 * Rewrite one row's location.
 * @param rows - the current snapshot rows.
 * @param instanceId - which item moved.
 * @param destination - `vault` or a character location key.
 * @returns the rows with that item relocated.
 */
export function applyMove(rows: ItemRow[], instanceId: string, destination: string): ItemRow[] {
  return rows.map((row) => {
    if (row.instanceId !== instanceId) return row
    const toVault = destination === 'vault'
    return {
      ...row,
      locationKey: destination,
      location: destination,
      placement: toVault ? { kind: 'vault' } : { kind: 'inventory', characterId: destination },
      characterId: toVault ? null : destination,
      // Moving never leaves an item equipped on the character it left.
      equipped: 'not_equipped',
    }
  })
}

/**
 * Rewrite one row's lock state.
 * @param rows - the current snapshot rows.
 * @param instanceId - which item changed.
 * @param locked - the new state.
 * @returns the rows with that flag applied.
 */
export function applyLock(rows: ItemRow[], instanceId: string, locked: boolean): ItemRow[] {
  return rows.map((row) => (row.instanceId === instanceId ? { ...row, locked } : row))
}

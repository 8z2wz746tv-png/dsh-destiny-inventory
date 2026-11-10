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
      pending: 'applying',
    }
  })
}

/**
 * Clear a write's pending hint.
 *
 * Called on success (the optimistic position was right) and after a read-back
 * (the position is whatever Bungie reported).
 * @param rows - the current rows.
 * @param instanceId - which item settled.
 * @param state - `'applying'` to mark in-flight, `undefined` to settle.
 * @returns the rows with the hint applied.
 */
export function settleMove(
  rows: ItemRow[],
  instanceId: string,
  state: 'applying' | 'unconfirmed' | undefined,
): ItemRow[] {
  return rows.map((row) => (row.instanceId === instanceId ? { ...row, pending: state } : row))
}

/**
 * Write back the location Bungie reported after a failed move.
 *
 * A failed response does not mean the write did not land, so the panel asks about
 * that one item and takes the answer — no guessing, no rolling back to a snapshot
 * that may already be stale.
 * @param rows - the current rows.
 * @param instanceId - which item.
 * @param destination - `vault` or a character location key.
 * @param equipped - whether Bungie says it is worn.
 * @param source - 这个位置是什么：`observed`（Bungie 说的）/ `rollback`（失败操作推出来的）。
 *   **两者都会改行的位置，但只有前者能让那格不戴未确认标记。**
 * @returns the rows with the confirmed position.
 */
export function confirmMove(
  rows: ItemRow[],
  instanceId: string,
  destination: string,
  equipped: boolean,
  source: 'observed' | 'rollback' = 'observed',
): ItemRow[] {
  return rows.map((row) => {
    if (row.instanceId !== instanceId) return row
    const toVault = destination === 'vault'
    return {
      ...row,
      locationKey: destination,
      location: destination,
      placement: toVault
        ? { kind: 'vault' }
        : equipped
          ? { kind: 'equipped', characterId: destination, slotHash: row.placement.kind === 'equipped' ? row.placement.slotHash : 0 }
          : { kind: 'inventory', characterId: destination },
      characterId: toVault ? null : destination,
      equipped: equipped ? 'equipped' : 'not_equipped',
      // 回滚位置不是观测：它必须带着"未确认"，否则格子说一个地方、详情卡（读快照）说另一个，
      // 两边都不提这位置是失败留下的。
      pending: source === 'rollback' ? 'unconfirmed' : undefined,
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

/**
 * Rewrite rows in place, leaving the rest of the snapshot alone.
 * @param rows - the current rows.
 * @param change - how to change them.
 * @returns the changed rows.
 */
export function patchRows(rows: ItemRow[], change: (rows: ItemRow[]) => ItemRow[]): ItemRow[] {
  return change(rows)
}

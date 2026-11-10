/**
 * One account write, from "we asked" to "we know something".
 *
 * Split out of `use-item-actions.ts` when the pending-operation overlay was added:
 * that file was already at its ceiling, and the settle rules are the part worth
 * reading on their own.
 *
 * The rule this enforces: **a refusal and a lost connection are different answers.**
 * `DestinyNoRoomInDestination` means Bungie did not do it, so the grid goes back to
 * where the item still is. A dropped request means nothing is known, so the item
 * stays where the user put it and a read-back decides later.
 */
import { BridgeError, postAction } from './api'
import { applyLock, confirmMove, settleMove } from './apply-move'
import { settleByReadBack } from './settle-by-readback'
import { classifyFailure } from './pending-ops'
import type { PendingOps } from './pending-ops'
import type { ActionReceipt, ActionRequest, ItemRow } from '../host/types'
import type { ReceiptHandle } from './use-receipts'

/** What one send needs from the panel. */
export interface SendDeps {
  routePath: string
  /** Records what was asked for; P1.3 starts drawing from it. */
  pending: PendingOps
  patchRows: (change: (rows: ItemRow[]) => ItemRow[]) => void
}

/**
 * Send one request and settle it against the pending overlay.
 * @param deps - bridge path, overlay, row patcher.
 * @param request - what to do.
 * @param itemName - display name for the receipt.
 * @param eventId - the operation this send belongs to.
 * @param line - the receipt line to report on.
 * @param signal - caller-owned cancellation.
 * @param summary - headline to fall back to when the host says nothing.
 * @returns the receipt, or `null` when the write failed.
 */
export async function sendAction(
  deps: SendDeps,
  request: ActionRequest,
  itemName: string,
  eventId: string,
  line: ReceiptHandle,
  signal: AbortSignal,
  summary: string,
): Promise<ActionReceipt | null> {
  const { routePath, pending, patchRows } = deps
  line.progress('正在处理…')
  try {
    const receipt = await postAction(routePath, request, itemName, signal)
    if (request.kind === 'move') pending.settle(eventId, 'accepted')
    // The grid already moved on drop; clearing the hint here keeps the old
    // behaviour until P1.3 starts drawing from the overlay instead.
    if (receipt.applied && request.kind === 'move') {
      patchRows((rows) => settleMove(rows, request.instanceId, undefined))
    }
    if (receipt.applied && request.kind === 'lock') {
      patchRows((rows) => applyLock(rows, request.instanceId, request.locked === true))
    }
    line.rename(receipt.summary !== '' ? receipt.summary : summary)
    line.settle(true, receipt.message)
    return receipt
  } catch (error) {
    const outcome = classifyFailure(error instanceof BridgeError ? error.code : '')
    // Only the operation that still owns the item may repaint it. If a later drag
    // took over while this one was failing, `settle` claims nothing and the row
    // stays where that newer operation put it.
    const settled = pending.settle(eventId, outcome)
    line.settle(false, error instanceof Error ? error.message : String(error))
    if (request.kind !== 'move') return null
    if (outcome === 'rejected') {
      // Bungie definitely did not move it: put the row back where the item still
      // is, rather than leaving the grid showing a destination that was refused.
      if (settled?.kind === 'failed') {
        patchRows((rows) => confirmMove(rows, request.instanceId, request.from, false, 'rollback'))
      }
      return null
    }
    // Unknown: ask. A failed response is not a failed write.
    await settleByReadBack(routePath, request.instanceId, request.destination, patchRows)
    return null
  }
}

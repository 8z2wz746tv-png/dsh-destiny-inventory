/**
 * Everything the panel does to the account, behind one queue.
 *
 * Split out of `InventoryPanel` for a concrete reason: that file sat at 538 lines
 * against a 540 ceiling, and the queue needs a place to live that is not a render
 * function. Nothing here paints — it takes the row patcher and the receipt stack,
 * and reports `busy` plus the pending equip preview back.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ActionReceipt, ActionRequest, ItemDetailView, ItemRow } from '../host/types'
import { postAction } from './api'
import { applyLock, applyMove, settleMove } from './apply-move'
import { settleByReadBack } from './settle-by-readback'
import { WriteQueue } from './write-queue'
import type { ReceiptController, ReceiptHandle } from './use-receipts'

/** Where a move is going, in the words the receipt should use. */
const DESTINATION_LABEL: Record<string, string> = {
  vault: '仓库',
  hunter: '猎人',
  warlock: '术士',
  titan: '泰坦',
}

/** A location key that names a character rather than the vault. */
function isCharacter(location: string): boolean {
  return location === 'hunter' || location === 'warlock' || location === 'titan'
}

/** What a queued write's line says while it waits. */
function queueHint(ahead: number): string {
  return ahead === 0 ? '正在处理…' : `排队中（前面 ${ahead} 项）`
}

export interface ItemActions {
  /** True while anything is in flight or waiting: the toolbar reads this. */
  busy: boolean
  /** An equip the host answered with a preview; the panel draws the confirmation. */
  pendingEquip: { detail: ItemDetailView; summary: string } | null
  cancelEquip: () => void
  confirmEquip: () => Promise<void>
  move: (item: ItemRow, destination: string) => void
  equip: (detail: ItemDetailView) => Promise<void>
  toggleLock: (detail: ItemDetailView) => Promise<void>
}

/** What the queue needs from the panel. */
export interface ItemActionOptions {
  routePath: string
  receipts: ReceiptController
  patchRows: (change: (rows: ItemRow[]) => ItemRow[]) => void
  /** The detail card is a single-shot surface: a lock closes it. */
  closeCard: () => void
}

/**
 * Wire the write queue into a panel.
 * @param options - bridge path, receipts, row patcher, card closer.
 */
export function useItemActions(options: ItemActionOptions): ItemActions {
  const { routePath, receipts, patchRows, closeCard } = options
  // One queue for the life of the panel: it is the thing that makes two drags
  // take turns instead of racing.
  const queue = useMemo(() => new WriteQueue(), [])
  const [busy, setBusy] = useState(false)
  const [pendingEquip, setPendingEquip] = useState<ItemActions['pendingEquip']>(null)

  useEffect(() => {
    // `busy` now means "the queue has work", not "one request is out": a queued
    // write is still pending from the user's point of view.
    return queue.watch((depth) => setBusy(depth > 0))
  }, [queue])

  /** Send one request and report it on its own receipt line. */
  const send = useCallback(
    async (
      request: ActionRequest,
      itemName: string,
      line: ReceiptHandle,
      signal: AbortSignal,
      summary: string,
    ): Promise<ActionReceipt | null> => {
      line.progress('正在处理…')
      try {
        const receipt = await postAction(routePath, request, itemName, signal)
        // The grid already moved on drop, so there is nothing to apply for a move;
        // only now is the optimistic position confirmed, so only now does the ring go.
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
        line.settle(false, error instanceof Error ? error.message : String(error))
        // A failed response does not mean the write did not land. Mark the item
        // unknown and ask Bungie, rather than rolling back to a stale snapshot.
        if (request.kind === 'move') await settleByReadBack(routePath, request.instanceId, patchRows)
        return null
      }
    },
    [patchRows, routePath],
  )

  /**
   * Queue one action, or report that a later drag replaced it.
   *
   * The line appears before the write does: the round trip takes seconds and a
   * silent wait reads as a dropped drag — that goes double once it has to wait for
   * whatever is ahead of it in the queue.
   */
  const enqueueAction = useCallback(
    (
      request: ActionRequest,
      itemName: string,
      summary: string,
      itemIcon?: string,
    ): Promise<ActionReceipt | null> => {
      const key = request.instanceId
      const ahead = queue.depth()
      const controller = new AbortController()
      let line: ReceiptHandle | undefined
      line = receipts.begin(summary, itemIcon, () => {
        // Waiting: drop it, and say so — it never cost a round trip. In flight:
        // the only honest move is to abort the request.
        if (queue.cancel(key)) line?.settle(false, '已取消，没有发出去')
        else controller.abort()
      })
      line.progress(queueHint(ahead))
      return queue
        .enqueue(key, request.kind === 'move', () =>
          send(request, itemName, line as ReceiptHandle, controller.signal, summary),
        )
        .then((outcome) => (outcome.kind === 'ran' ? outcome.value : null))
        .catch(() => null)
    },
    [queue, receipts, send],
  )

  const move = useCallback(
    (item: ItemRow, destination: string): void => {
      if (item.locationKey === destination) return
      const label = DESTINATION_LABEL[destination] ?? destination
      // Optimistic: the grid moves on drop, then the request goes out. Waiting for
      // the round trip left the item visibly where it started for hundreds of ms.
      patchRows((rows) => applyMove(rows, item.instanceId, destination))
      void enqueueAction(
        // `from` is the position this panel is showing: the host must not re-derive
        // it from a snapshot that may predate the write ahead of this one.
        { kind: 'move', instanceId: item.instanceId, destination, from: item.locationKey },
        item.name,
        '把「' + item.name + '」移到' + label,
        item.icon,
      )
    },
    [enqueueAction, patchRows],
  )

  const equip = useCallback(
    async (detail: ItemDetailView): Promise<void> => {
      if (!isCharacter(detail.location)) {
        receipts
          .begin('装备「' + detail.name + '」')
          .settle(false, '这件不在角色身上：先拖到角色背包，再装备。')
        return
      }
      const receipt = await enqueueAction(
        { kind: 'equip', instanceId: detail.instanceId, character: detail.location },
        detail.name,
        '装备「' + detail.name + '」',
      )
      if (receipt?.needsConfirm === true) setPendingEquip({ detail, summary: receipt.summary })
    },
    [enqueueAction, receipts],
  )

  const cancelEquip = useCallback((): void => setPendingEquip(null), [])

  const confirmEquip = useCallback(async (): Promise<void> => {
    if (pendingEquip === null) return
    const { detail } = pendingEquip
    setPendingEquip(null)
    await enqueueAction(
      { kind: 'equip', instanceId: detail.instanceId, character: detail.location, confirmed: true },
      detail.name,
      '装备「' + detail.name + '」',
    )
  }, [enqueueAction, pendingEquip])

  const toggleLock = useCallback(
    async (detail: ItemDetailView): Promise<void> => {
      await enqueueAction(
        { kind: 'lock', instanceId: detail.instanceId, locked: !detail.locked },
        detail.name,
        (detail.locked ? '解锁' : '锁定') + '「' + detail.name + '」',
      )
      closeCard()
    },
    [closeCard, enqueueAction],
  )

  return useMemo(
    () => ({ busy, pendingEquip, cancelEquip, confirmEquip, move, equip, toggleLock }),
    [busy, cancelEquip, confirmEquip, equip, move, pendingEquip, toggleLock],
  )
}

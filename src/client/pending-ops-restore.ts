/**
 * 把一条 journal 意图装回 PendingOps。
 *
 * 单独一个文件，因为这件事和"用户刚提交了一次拖拽"不是同一件事：
 * 那条操作**已经提交过**、有一次成功回执、只是还没有结论。所以时间取 journal 的原始
 * `at`（刷新不续命），初始状态是 `verifying` 而不是 `submitted`，且不产生任何写入。
 *
 * 三种情况必须什么都不做，`PendingOps` 才守得住：
 * - 这条事件已经有结论（`settled`）；
 * - 这条事件已经挂在场上（同 `eventId`，重复 load 会走到）；
 * - 这件物品已经有更新的操作（用户刷新后又拖了一次，新的说了算）。
 *
 * 前两条是**事件幂等**，第三条是**物品所有权**——两个独立的不变量，不能用一个判断代替。
 */
import type { PendingOperation } from './pending-ops'
import type { RestorableOperation } from './operation-chain'
import type { SettledIds } from './settled-ids'

/**
 * 尝试恢复一条意图。
 * @param ops - 当前在场的操作，按物品索引。
 * @param seqs - 每件物品发出过的最大序号。
 * @param settled - 已有结论的事件。
 * @param input - 来自 `operation-chain.ts` 的一条有效意图。
 * @returns 是否真的创建了一条。
 */
export function restoreInto(
  ops: Map<string, PendingOperation>,
  seqs: Map<string, number>,
  settled: SettledIds,
  input: RestorableOperation,
): boolean {
  if (settled.has(input.entryId)) return false
  if (ops.has(input.instanceId)) return false
  const seq = (seqs.get(input.instanceId) ?? 0) + 1
  seqs.set(input.instanceId, seq)
  ops.set(input.instanceId, {
    eventId: input.entryId,
    seq,
    instanceId: input.instanceId,
    action: 'move',
    target: input.target,
    from: input.from,
    state: 'verifying',
    submittedAt: input.submittedAt,
    checkedAt: input.submittedAt,
    expiresAt: input.expiresAt,
    mismatches: 0,
  })
  return true
}

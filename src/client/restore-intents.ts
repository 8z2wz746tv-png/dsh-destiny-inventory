/**
 * 把 journal 里还没结论的意图装回内存。
 *
 * 只做三件事：读、挑、装。**不判断"到没到"**——那是 `reconcile` 的事，用的是新鲜
 * 网络快照，而不是刚刚上屏的那份缓存。
 *
 * 静默失败：journal 读不到，就当作没有可恢复的意图，不能连累缓存和网络的正常加载。
 */
import { fetchJournal } from './api'
import { reduceJournal } from './journal-reduce'
import { pickRestorable } from './operation-chain'
import { VERIFY_TTL_MS } from './pending-ops'
import type { PendingOps } from './pending-ops'

/**
 * @param routePath - 桥接路径。
 * @param pending - 目标 overlay。
 * @param signal - 调用方的取消信号。
 * @returns 真的装回去了几条，用于决定要不要重画。
 */
export async function restoreIntents(
  routePath: string,
  pending: PendingOps,
  signal: AbortSignal,
): Promise<number> {
  let lines
  try {
    lines = await fetchJournal(routePath, signal)
  } catch {
    return 0
  }
  if (signal.aborted) return 0
  let restored = 0
  for (const intent of pickRestorable(reduceJournal(lines), Date.now(), VERIFY_TTL_MS)) {
    if (pending.restore(intent)) restored += 1
  }
  return restored
}

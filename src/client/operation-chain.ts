/**
 * 一条链决定一个恢复答案。
 *
 * 一件物品的多次拖拽是**一条链**，不是一堆互相独立的候选。用"过滤掉 failed 之后取最新"
 * 这种写法，会让失败的 B 顺手把 A 顶上有效意图的位置——结果可能对，理由是错的，
 * 而且没人知道那是回滚规则还是算法的副作用。
 *
 * 所以答案由链的**末尾**决定，七种形状逐条写在 `docs/plans/PLAN-P15-RECOVERY.md`。
 *
 * 这一层只回答问题"该恢复哪一条"，不构造 Pending、不读快照、不判断到没到。
 */
import type { JournalLine } from './journal-reduce'

/** 一条值得恢复的操作意图。 */
export interface RestorableOperation {
  /** 稳定身份：同一条 journal 记录永远是同一个值。 */
  entryId: string
  instanceId: string
  target: string
  from: string
  /** 原始提交时刻，**不重置**——刷新不给旧操作续命。 */
  submittedAt: number
  expiresAt: number
}

/** 只有用户自己发起的 move 有"目标位置"这种意图可恢复。 */
function isCandidate(line: JournalLine): boolean {
  return line.action === 'move' && line.source === 'ui' && line.to !== undefined
}

/**
 * 从折叠后的 journal 里挑出每件物品的有效意图。
 * @param lines - 已折叠，一条操作一行。
 * @param now - 当前时刻，用于期限判断。
 * @param ttlMs - 总操作期限，从原始 `at` 起算。
 * @returns 每件物品最多一条。
 */
export function pickRestorable(
  lines: JournalLine[],
  now: number,
  ttlMs: number,
): RestorableOperation[] {
  const chains = new Map<string, JournalLine[]>()
  for (const line of lines) {
    if (!isCandidate(line)) continue
    const chain = chains.get(line.item.instanceId)
    if (chain === undefined) chains.set(line.item.instanceId, [line])
    else chain.push(line)
  }

  const picked: RestorableOperation[] = []
  for (const [instanceId, chain] of chains) {
    chain.sort((a, b) => a.at - b.at)

    // 从末尾往前找最近一次成功：失败的 B 不取消 A 的意图，它只是排在 A 后面。
    let effective: JournalLine | undefined
    for (let index = chain.length - 1; index >= 0; index -= 1) {
      if (chain[index]?.result === 'ok') {
        effective = chain[index]
        break
      }
    }
    if (effective === undefined) continue
    // 已经有结论的不再恢复——`resolution` 就是结论，不论 landed 是什么。
    if (effective.resolution !== undefined) continue
    // 总期限，刷新不续命。
    if (now >= effective.at + ttlMs) continue

    picked.push({
      entryId: `restore:${effective.at}:${instanceId}`,
      instanceId,
      target: effective.to as string,
      from: effective.from ?? '',
      submittedAt: effective.at,
      expiresAt: effective.at + ttlMs,
    })
  }
  return picked
}

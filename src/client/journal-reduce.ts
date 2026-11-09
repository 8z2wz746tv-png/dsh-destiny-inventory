/**
 * 把 journal 里同一操作的多行折叠成一条。
 *
 * 这是**折叠，不是去重**。`ContextStore` 往 jsonl 里写的是 append-only 的两行：
 * `record()` 时序列化一次（此时没有 `resolution`），`resolve()` 时把改过的同一个对象
 * 再序列化一次（此时有）。所以同一个 `(at, instanceId)` 会出现两行，各丢一半信息：
 *
 * - 留第一行：丢掉回读修正；
 * - 留第二行：如果它被后续覆盖过，可能不是最新；
 * - 简单去重：分不清"两行属于同一操作"和"两个操作撞在同一毫秒"。
 *
 * 折叠规则：按 `(at, instanceId)` 分组，**取带 `resolution` 的那行**——因为 `resolve()`
 * 序列化的是完整的最终态；一组里没有带修正的，取组内最后一行。
 *
 * 唯一性前提（2026-11-07 实测，54 条 move 记录支撑）：只对 `source === 'ui'` 的 move 生效，
 * 写入是串行的，两次不同操作之间隔着一次网络往返，不会落在同一毫秒。
 * **写队列改成并行之后，这个前提要重新论证。**
 */

/** jsonl 里一行 journal 的形状（与 `host/context-store.ts` 的 `JournalEntry` 对齐）。 */
export interface JournalLine {
  at: number
  action: string
  item: { instanceId: string; name?: string }
  from?: string
  to?: string
  result: 'ok' | 'failed'
  source: 'ui' | 'external'
  /** 只在不一致回读之后出现，是这条操作的最终结论。 */
  resolution?: { at: number; landed: boolean; location?: string }
}

/** 同一次操作的稳定身份。 */
export function journalKey(line: Pick<JournalLine, 'at'> & { item: { instanceId: string } }): string {
  return `${line.at}:${line.item.instanceId}`
}

/**
 * 折叠同一操作的原始行与修正行。
 * @param lines - jsonl 里的原始行，顺序不限。
 * @returns 每条操作一行，`resolution` 若存在则保留。
 */
export function reduceJournal(lines: JournalLine[]): JournalLine[] {
  const byKey = new Map<string, JournalLine>()
  for (const line of lines) {
    const key = journalKey(line)
    const kept = byKey.get(key)
    if (kept === undefined) {
      byKey.set(key, line)
      continue
    }
    // 带 resolution 的那行是最终态；两行都有则取修正时间更晚的。
    const keptAt = kept.resolution?.at ?? -1
    const candidateAt = line.resolution?.at ?? -1
    if (candidateAt > keptAt) byKey.set(key, line)
  }
  return [...byKey.values()]
}

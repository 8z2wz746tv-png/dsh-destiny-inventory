/**
 * 两个已知边界：Journal 截断、重启后的终态。
 *
 * 这不是为了证明它们不存在——它们存在。是为了**写清楚它们现在会产生什么行为**，
 * 让下一次改动能看出自己有没有把它变坏。
 */
import { describe, expect, it } from 'vitest'
import { pickRestorable } from '../src/client/operation-chain'
import { reduceJournal } from '../src/client/journal-reduce'
import { PendingOps, VERIFY_TTL_MS } from '../src/client/pending-ops'
import type { JournalLine } from '../src/client/journal-reduce'

const TTL = VERIFY_TTL_MS
const NOW = 10_000_000

const op = (
  at: number,
  result: 'ok' | 'failed',
  to: string,
  item = 'i1',
  over: Partial<JournalLine> = {},
): JournalLine => ({
  at, action: 'move', item: { instanceId: item },
  from: 'vault', to, result, source: 'ui', ...over,
})

/** 一次"重新打开页面"：折叠 → 挑拣。 */
const reopen = (lines: JournalLine[], now = NOW) => pickRestorable(reduceJournal(lines), now, TTL)

describe('边界一：/journal 只返回最近 200 条', () => {
  it('a chain whose older half fell out of the window restores nothing, not something wrong', () => {
    // 250 件无关操作把窗口撑满，A 落在窗口之外，只剩 B。
    const noise = Array.from({ length: 250 }, (_, index) =>
      op(NOW - 250_000 + index * 100, 'ok', 'vault', `noise${index}`),
    )
    const a = op(NOW - 300_000, 'ok', 'hunter', 'target')
    const b = op(NOW - 1_000, 'failed', 'warlock', 'target')
    const everything = [a, ...noise, b]
    const window = everything.slice(-200)

    // A 确实被挤出去了。
    expect(window).not.toContain(a)
    // 后果是"不恢复"，而不是"恢复一个错的"——链里已经没有 ok 了。
    expect(reopen(window).find((entry) => entry.instanceId === 'target')).toBeUndefined()
  })

  it('truncation does not disturb a chain that is wholly inside the window', () => {
    const noise = Array.from({ length: 250 }, (_, index) =>
      op(NOW - 250_000 + index * 100, 'ok', 'vault', `noise${index}`),
    )
    const a1 = op(NOW - 3_000, 'ok', 'hunter', 'target')
    const b1 = op(NOW - 2_000, 'failed', 'warlock', 'target')
    const window = [...noise, a1, b1].slice(-200)
    const picked = reopen(window).find((entry) => entry.instanceId === 'target')
    expect(picked?.target).toBe('hunter')
  })

  it('a correction line costs a slot, so 200 lines buy fewer than 200 operations', () => {
    // 每一对是"原始 + 修正"，占两行但只是一条操作。
    const pairs = Array.from({ length: 100 }, (_, index) => [
      op(NOW - 10_000 + index, 'failed', 'hunter', `x${index}`),
      op(NOW - 10_000 + index, 'failed', 'hunter', `x${index}`, {
        resolution: { at: NOW - 5_000, landed: false },
      }),
    ]).flat()
    expect(pairs).toHaveLength(200)
    expect(reduceJournal(pairs)).toHaveLength(100)
  })
})

describe('边界二：settled 只活在内存里', () => {
  const chain = () => [op(NOW - 5_000, 'ok', 'hunter'), op(NOW - 4_000, 'ok', 'warlock')]

  it('the same journal gives the same answer before and after a restart', () => {
    const before = new PendingOps()
    for (const intent of reopen(chain())) before.restore(intent)
    // 重启 = 新的 PendingOps，`settled` 清空，只剩 journal 可依。
    const after = new PendingOps()
    for (const intent of reopen(chain())) after.restore(intent)
    expect(before.get('i1')?.target).toBe('warlock')
    expect(after.get('i1')?.target).toBe('warlock')
  })

  it('the chain tail protects the answer, not the settled set', () => {
    // 链归并能得出 warlock，是因为 B 自己也在 journal 里。
    // 这一条问的是：即使 settled 丢了，答案由什么保证？
    expect(reopen(chain())[0]?.target).toBe('warlock')
  })

  it('but a rolled-back chain does come back with a ring after a restart', () => {
    // A(ok) → B(failed)：B 提交时 A 进 settled，B 失败后 pending 为空。
    // 重启把 settled 清掉，于是链末尾又变回 A —— 环回来了。
    const lines = [op(NOW - 5_000, 'ok', 'hunter'), op(NOW - 4_000, 'failed', 'warlock')]
    const before = new PendingOps()
    before.restore(reopen(lines)[0] as never)
    before.submit({ eventId: 'e-b', instanceId: 'i1', action: 'move', target: 'warlock', from: 'hunter', now: NOW })
    before.settle('e-b', 'rejected')
    expect(before.size).toBe(0)

    const after = new PendingOps()
    for (const intent of reopen(lines)) after.restore(intent)
    // 这不是"错的"，因为 A 确实成功过、物品确实在 hunter。但它确实与重启前不同：
    // 重启前那格没有环，重启后有了。**这个差异必须写在文档里，不能当它不存在。**
    expect(after.get('i1')?.target).toBe('hunter')
    expect(after.get('i1')?.state).toBe('verifying')
  })

  it('a settled event is not resurrected within one session', () => {
    const lines = [op(NOW - 5_000, 'ok', 'hunter')]
    const pending = new PendingOps()
    pending.restore(reopen(lines)[0] as never)
    pending.reconcile([{ instanceId: 'i1', location: 'hunter', startedAt: NOW - 1_000 }], NOW)
    expect(pending.size).toBe(0)
    // 同一会话里再重新打开一次：settled 记得它，不复活。
    for (const intent of reopen(lines)) expect(pending.restore(intent)).toBe(false)
  })
})

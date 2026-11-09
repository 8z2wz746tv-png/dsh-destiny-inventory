/**
 * 七种链形状，一条不落。
 *
 * 最要紧的是第 2 行：`A(ok) → B(failed)` 必须恢复 A，而且**理由必须是链末尾**，
 * 不是"B 被过滤后 A 上位"。后者在结果上相同，在语义上是两个东西——
 * 注入测试要能区分它们。
 */
import { describe, expect, it } from 'vitest'
import { pickRestorable } from '../src/client/operation-chain'
import type { JournalLine } from '../src/client/journal-reduce'

const TTL = 5 * 60_000
const NOW = 10_000_000

const op = (
  at: number,
  result: 'ok' | 'failed',
  to: string,
  over: Partial<JournalLine> = {},
): JournalLine => ({
  at,
  action: 'move',
  item: { instanceId: 'i1', name: '超星系团' },
  from: 'vault',
  to,
  result,
  source: 'ui',
  ...over,
})

const pick = (lines: JournalLine[], now = NOW) => pickRestorable(lines, now, TTL)

describe('the seven chain shapes', () => {
  it('#1 single ok, no resolution, in window', () => {
    const [one] = pick([op(NOW - 1_000, 'ok', 'hunter')])
    expect(one?.target).toBe('hunter')
    expect(one?.entryId).toBe(`restore:${NOW - 1_000}:i1`)
  })

  it('#2 ok then failed: the ok is still the effective intent', () => {
    const lines = [op(NOW - 2_000, 'ok', 'hunter'), op(NOW - 1_000, 'failed', 'warlock')]
    const [one] = pick(lines)
    expect(one?.target).toBe('hunter')
    expect(one?.submittedAt).toBe(NOW - 2_000)
  })

  it('does not fall back past an intent that already has a verdict', () => {
    // This is the case that separates the two implementations. "Chain tail" stops at
    // the newest ok and accepts that it has a resolution, so nothing is restored.
    // A candidate filter that *skips* verdicts and keeps looking would walk back to A
    // and resurrect an intent that B already superseded.
    const lines = [
      op(NOW - 2_000, 'ok', 'hunter'),
      op(NOW - 1_000, 'ok', 'warlock', { resolution: { at: NOW - 500, landed: true, location: 'warlock' } }),
    ]
    expect(pick(lines)).toEqual([])
  })

  it('#3 ok then ok: only the newest is restored', () => {
    const lines = [op(NOW - 2_000, 'ok', 'hunter'), op(NOW - 1_000, 'ok', 'warlock')]
    const picked = pick(lines)
    expect(picked).toHaveLength(1)
    expect(picked[0]?.target).toBe('warlock')
  })

  it('#4 only a failure: nothing to restore', () => {
    expect(pick([op(NOW - 1_000, 'failed', 'hunter')])).toEqual([])
  })

  it('#5 the ok already has a resolution: nothing to restore', () => {
    const lines = [op(NOW - 1_000, 'ok', 'hunter', { resolution: { at: NOW - 500, landed: true } })]
    expect(pick(lines)).toEqual([])
  })

  it('#6 the ok is past its deadline: nothing to restore', () => {
    expect(pick([op(NOW - TTL - 1, 'ok', 'hunter')])).toEqual([])
  })

  it('#7 external changes are never restored', () => {
    expect(pick([op(NOW - 1_000, 'ok', 'hunter', { source: 'external' })])).toEqual([])
  })
})

describe('chain edges', () => {
  it('one item gets at most one answer, even with many rows', () => {
    const lines = [
      op(NOW - 4_000, 'ok', 'hunter'),
      op(NOW - 3_000, 'failed', 'warlock'),
      op(NOW - 2_000, 'failed', 'titan'),
      op(NOW - 1_000, 'ok', 'vault'),
    ]
    const picked = pick(lines)
    expect(picked).toHaveLength(1)
    expect(picked[0]?.target).toBe('vault')
  })

  it('answers per item, not per journal', () => {
    const lines = [
      op(NOW - 1_000, 'ok', 'hunter'),
      op(NOW - 1_000, 'ok', 'warlock', { item: { instanceId: 'i2' } }),
    ]
    expect(pick(lines)).toHaveLength(2)
  })

  it('a failure before any success leaves nothing to restore', () => {
    const lines = [op(NOW - 2_000, 'failed', 'hunter'), op(NOW - 1_000, 'failed', 'warlock')]
    expect(pick(lines)).toEqual([])
  })

  it('uses the original submission time, never the current clock', () => {
    const at = NOW - 4 * 60_000
    const [one] = pick([op(at, 'ok', 'hunter')])
    // Injectable violation: stamp `submittedAt` with `now` and a 4m50s-old operation
    // silently gets a fresh five minutes.
    expect(one?.submittedAt).toBe(at)
    expect(one?.expiresAt).toBe(at + TTL)
  })

  it('ignores lock and equip rows: they have no destination to restore', () => {
    const lines = [op(NOW - 1_000, 'ok', 'hunter', { action: 'equip' })]
    expect(pick(lines)).toEqual([])
  })
})

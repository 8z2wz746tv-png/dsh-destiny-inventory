/**
 * 折叠，不是去重。
 *
 * jsonl 里同一次操作会写两行：`record()` 时的原始态、`resolve()` 时带修正的最终态。
 * 留哪一行都丢东西——留第一行丢 `resolution`，按"最后一行赢"则依赖行序而不是语义。
 */
import { describe, expect, it } from 'vitest'
import { journalKey, reduceJournal } from '../src/client/journal-reduce'
import type { JournalLine } from '../src/client/journal-reduce'

const move = (over: Partial<JournalLine> = {}): JournalLine => ({
  at: 1_000,
  action: 'move',
  item: { instanceId: 'i1', name: '超星系团' },
  from: 'vault',
  to: 'hunter',
  result: 'ok',
  source: 'ui',
  ...over,
})

describe('journalKey', () => {
  it('is the pair the two lines share', () => {
    expect(journalKey(move())).toBe('1000:i1')
  })
})

describe('reduceJournal', () => {
  it('folds an original line and its correction into one', () => {
    const original = move()
    const corrected = move({ result: 'failed', resolution: { at: 2_000, landed: true, location: 'hunter' } })
    const [one] = reduceJournal([original, corrected])
    // Injectable violation: keep the first line and the correction is lost; the
    // operation would look like a failure forever.
    expect(one?.resolution?.landed).toBe(true)
    expect(one?.to).toBe('hunter')
  })

  it('keeps the correction when it arrives first in the file', () => {
    const corrected = move({ resolution: { at: 2_000, landed: true } })
    const [one] = reduceJournal([corrected, move()])
    expect(one?.resolution).toBeDefined()
  })

  it('does not merge two different operations on the same item', () => {
    const a = move({ at: 1_000 })
    const b = move({ at: 5_000, from: 'hunter', to: 'warlock' })
    expect(reduceJournal([a, b])).toHaveLength(2)
  })

  it('does not merge two operations that share a millisecond', () => {
    // Same `at`, different items — the key is the pair, not the timestamp alone.
    const a = move({ at: 1_000, item: { instanceId: 'i1' } })
    const b = move({ at: 1_000, item: { instanceId: 'i2' } })
    expect(reduceJournal([a, b])).toHaveLength(2)
  })

  it('keeps the later correction when both lines carry one', () => {
    const earlier = move({ resolution: { at: 2_000, landed: false } })
    const later = move({ resolution: { at: 3_000, landed: true } })
    const [one] = reduceJournal([earlier, later])
    expect(one?.resolution?.at).toBe(3_000)
    expect(one?.resolution?.landed).toBe(true)
  })

  it('passes an unpaired line through untouched', () => {
    const only = move()
    expect(reduceJournal([only])).toEqual([only])
  })

  it('handles an empty journal', () => {
    expect(reduceJournal([])).toEqual([])
  })
})

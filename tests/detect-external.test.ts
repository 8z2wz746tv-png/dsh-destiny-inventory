/**
 * A position difference is not an operation.
 *
 * Bungie's profile is a projection that settles 3–10 s behind a write. Comparing a
 * read across that window turned the panel's own transfer into "something moved it
 * back" — a permanent, false journal entry read out to the user later. These pin
 * the separation: observations are cheap, candidates are unconfirmed, and only a
 * difference that outlives the sync window becomes an event.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ContextStore } from '../src/host/context-store'
import { ExternalDetector, SETTLE_MS } from '../src/host/detect-external'
import type { JournalEntry } from '../src/host/context-store'
import type { ItemRow } from '../src/host/types'

const row = (over: Partial<ItemRow>): ItemRow =>
  ({ instanceId: 'i1', hash: 42, name: '英勇利刃', locationKey: 'hunter', ...over }) as ItemRow

/** A fresh path each time: the store reads its trail back on construction. */
const store = () =>
  new ContextStore(join(mkdtempSync(join(tmpdir(), 'journal-')), 'journal.jsonl'))

/** The write the panel itself would have journalled. */
const ownWrite = (
  store: ContextStore,
  from: string,
  to: string,
  at: number,
): void => {
  const entry: JournalEntry = {
    at,
    action: 'move',
    item: { instanceId: 'i1', hash: 42, name: '英勇利刃' },
    from,
    to,
    result: 'ok',
    source: 'ui',
    detail: '',
  }
  store.record(entry)
}

const external = (store: ContextStore): JournalEntry[] =>
  store.all().filter((entry) => entry.source === 'external')

describe('external change detection', () => {
  it('says nothing on the first read: everything would look like it moved', () => {
    const s = store()
    new ExternalDetector().observe(s, [row({})], 0)
    expect(s.recent()).toHaveLength(0)
  })

  it('does not decide on one read', () => {
    const s = store()
    const detector = new ExternalDetector()
    detector.observe(s, [row({})], 0)
    detector.observe(s, [row({ locationKey: 'vault' })], 1_000)
    // Injectable violation: record on first difference and this is 1.
    expect(external(s)).toHaveLength(0)
  })

  it('confirms a change that stays put past the sync window', () => {
    const s = store()
    const detector = new ExternalDetector()
    detector.observe(s, [row({})], 0)
    detector.observe(s, [row({ locationKey: 'vault' })], 1_000)
    detector.observe(s, [row({ locationKey: 'vault' })], 1_000 + SETTLE_MS * 1.2)
    const [entry] = external(s)
    expect(entry?.from).toBe('hunter')
    expect(entry?.to).toBe('vault')
    expect(entry?.detail).toContain('连续 2 次')
  })

  it('does not confirm until the sync window has actually passed', () => {
    const s = store()
    const detector = new ExternalDetector()
    detector.observe(s, [row({})], 0)
    detector.observe(s, [row({ locationKey: 'vault' })], 1_000) // candidate starts
    detector.observe(s, [row({ locationKey: 'vault' })], 1_000 + SETTLE_MS * 0.4) // still inside the window
    // Injectable violation: drop the settle check and this becomes one entry.
    expect(external(s)).toHaveLength(0)
    detector.observe(s, [row({ locationKey: 'vault' })], 1_000 + SETTLE_MS * 1.2) // past the window
    expect(external(s)).toHaveLength(1)
  })

  it('never says who made the change', () => {
    const s = store()
    const detector = new ExternalDetector()
    detector.observe(s, [row({})], 0)
    detector.observe(s, [row({ locationKey: 'vault' })], 1_000)
    detector.observe(s, [row({ locationKey: 'vault' })], 1_000 + SETTLE_MS * 1.2)
    // Injectable violation: attribute it to an agent and the journal states a
    // cause the panel cannot know.
    expect(external(s)[0]?.source).toBe('external')
  })

  it('drops a difference that goes back where it was', () => {
    const s = store()
    const detector = new ExternalDetector()
    detector.observe(s, [row({ locationKey: 'warlock' })], 0)
    detector.observe(s, [row({ locationKey: 'vault' })], 1_000) // mid-sync read
    detector.observe(s, [row({ locationKey: 'warlock' })], 2_000) // settled
    detector.observe(s, [row({ locationKey: 'warlock' })], 20_000)
    expect(external(s)).toHaveLength(0)
  })

  it('starts over when the item keeps jumping around', () => {
    const s = store()
    const detector = new ExternalDetector()
    detector.observe(s, [row({ locationKey: 'vault' })], 0)
    detector.observe(s, [row({ locationKey: 'warlock' })], 1_000)
    detector.observe(s, [row({ locationKey: 'vault' })], 5_000) // back again
    detector.observe(s, [row({ locationKey: 'warlock' })], 12_000) // new candidate
    // Only two observations, and the second one restarted the clock.
    expect(external(s)).toHaveLength(0)
    detector.observe(s, [row({ locationKey: 'warlock' })], 1_000 + SETTLE_MS * 3)
    expect(external(s)).toHaveLength(1)
  })

  it('does not mistake its own write landing for someone else acting', () => {
    const s = store()
    const detector = new ExternalDetector()
    detector.observe(s, [row({ locationKey: 'vault' })], 0)
    ownWrite(s, 'vault', 'warlock', 1_000)
    detector.observe(s, [row({ locationKey: 'warlock' })], 2_000)
    detector.observe(s, [row({ locationKey: 'warlock' })], 2_000 + SETTLE_MS * 1.2)
    // Injectable violation: match on "recent ui write" alone and the reverse (the
    // mid-sync read below) also gets swallowed — but matching on destination is
    // what makes this one right.
    expect(external(s)).toHaveLength(0)
  })

  it('still reports a change that our write does not explain', () => {
    const s = store()
    const detector = new ExternalDetector()
    detector.observe(s, [row({ locationKey: 'vault' })], 0)
    ownWrite(s, 'vault', 'warlock', 1_000)
    // Our write aimed at warlock; the item turns up on the hunter instead.
    detector.observe(s, [row({ locationKey: 'hunter' })], 2_000)
    detector.observe(s, [row({ locationKey: 'hunter' })], 2_000 + SETTLE_MS * 1.2)
    expect(external(s)).toHaveLength(1)
  })
})

describe('the sync mid-state sequence from the P0 run', () => {
  it('leaves exactly one entry: the original transfer', () => {
    const s = store()
    const detector = new ExternalDetector()

    // T0: settled read, item in the vault.
    detector.observe(s, [row({ locationKey: 'vault' })], 0)
    // T1: the panel transfers it to the warlock and journals that.
    ownWrite(s, 'vault', 'warlock', 1_000)
    // T2: the next read still says vault — projection catching up.
    detector.observe(s, [row({ locationKey: 'vault' })], 2_000)
    // T4/T5: sync completes, the read finally agrees with the write.
    detector.observe(s, [row({ locationKey: 'warlock' })], 20_000)
    detector.observe(s, [row({ locationKey: 'warlock' })], 20_000 + SETTLE_MS * 1.2)

    expect(s.all()).toHaveLength(1)
    expect(s.all()[0]?.source).toBe('ui')
    expect(s.all()[0]?.to).toBe('warlock')
  })
})

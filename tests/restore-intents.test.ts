/**
 * P1.5.4 的一半：恢复这一步本身。
 *
 * 这里只验证"读 journal、挑意图、装回去"三件事——**不**验证加载顺序（那是
 * `load-inventory` 的事），也不验证核验（那是 `reconcile` 的事）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/client/api', () => ({ fetchJournal: vi.fn() }))

const api = (await import('../src/client/api')) as unknown as { fetchJournal: ReturnType<typeof vi.fn> }
const { restoreIntents } = await import('../src/client/restore-intents')
const { PendingOps, VERIFY_TTL_MS } = await import('../src/client/pending-ops')

import type { JournalLine } from '../src/client/journal-reduce'

const NOW = Date.now()
const move = (over: Partial<JournalLine> = {}): JournalLine => ({
  at: NOW - 1_000,
  action: 'move',
  item: { instanceId: 'i1', name: '超星系团' },
  from: 'vault',
  to: 'hunter',
  result: 'ok',
  source: 'ui',
  ...over,
})

const signal = () => new AbortController().signal

beforeEach(() => {
  api.fetchJournal.mockReset()
})

describe('restoreIntents', () => {
  it('attaches an unverified intent from the journal', async () => {
    const pending = new PendingOps()
    api.fetchJournal.mockResolvedValue([move()])
    expect(await restoreIntents('/b', pending, signal())).toBe(1)
    expect(pending.get('i1')?.target).toBe('hunter')
    expect(pending.get('i1')?.state).toBe('verifying')
  })

  it('does not judge whether it already landed — that is reconcile\'s job', async () => {
    const pending = new PendingOps()
    api.fetchJournal.mockResolvedValue([move()])
    await restoreIntents('/b', pending, signal())
    // Injectable violation: look at the snapshot here and confirm it, and a stale
    // cache would get to declare an operation finished.
    expect(pending.get('i1')?.state).toBe('verifying')
  })

  it('counts nothing when the journal is empty', async () => {
    const pending = new PendingOps()
    api.fetchJournal.mockResolvedValue([])
    expect(await restoreIntents('/b', pending, signal())).toBe(0)
    expect(pending.size).toBe(0)
  })

  it('fails silently when the journal cannot be read', async () => {
    const pending = new PendingOps()
    api.fetchJournal.mockRejectedValue(new Error('502 Bad Gateway'))
    // Injectable violation: let this throw and a broken journal takes the whole
    // inventory load down with it.
    await expect(restoreIntents('/b', pending, signal())).resolves.toBe(0)
    expect(pending.size).toBe(0)
  })

  it('ignores an intent older than the verification window', async () => {
    const pending = new PendingOps()
    api.fetchJournal.mockResolvedValue([move({ at: NOW - VERIFY_TTL_MS - 1 })])
    expect(await restoreIntents('/b', pending, signal())).toBe(0)
  })

  it('restores several items independently', async () => {
    const pending = new PendingOps()
    api.fetchJournal.mockResolvedValue([
      move(),
      move({ item: { instanceId: 'i2' }, to: 'titan' }),
    ])
    expect(await restoreIntents('/b', pending, signal())).toBe(2)
  })

  it('does nothing after the caller aborted', async () => {
    const pending = new PendingOps()
    const controller = new AbortController()
    controller.abort()
    api.fetchJournal.mockResolvedValue([move()])
    expect(await restoreIntents('/b', pending, controller.signal)).toBe(0)
  })
})

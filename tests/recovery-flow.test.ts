/**
 * P1.5.6 —— 整条链：journal → 折叠 → 挑意图 → 恢复 → 再操作 → 核验。
 *
 * 前面的测试各自守一段；这里只问一个问题：把它们接起来，会不会互相**抵消**。
 * 最容易抵消的一对是"恢复"和"再拖一次"——A 挂回来、用户拖 B、B 失败，
 * 这时屏幕上该是哪里？答案不是"Bungie 说的位置"，因为 Bungie 可能还没同步完 A。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/client/api', () => ({
  fetchJournal: vi.fn(),
  postAction: vi.fn(),
  BridgeError: class BridgeError extends Error {
    readonly code: string
    constructor(code: string, message: string) {
      super(message)
      this.code = code
    }
  },
}))
vi.mock('../src/client/settle-by-readback', () => ({ settleByReadBack: vi.fn() }))

const api = (await import('../src/client/api')) as unknown as Record<string, ReturnType<typeof vi.fn>>
const { restoreIntents } = await import('../src/client/restore-intents')
const { PendingOps, VERIFY_TTL_MS } = (await import('../src/client/pending-ops')) as unknown as {
  PendingOps: typeof import('../src/client/pending-ops').PendingOps
  VERIFY_TTL_MS: number
}
const { sendAction } = await import('../src/client/send-action')
const { applyOverlay } = await import('../src/client/pending-ops-render')

import type { JournalLine } from '../src/client/journal-reduce'
import type { ItemRow } from '../src/host/types'
import type { ReceiptHandle } from '../src/client/use-receipts'

const NOW = Date.now()
const TTL = VERIFY_TTL_MS
const signal = () => new AbortController().signal

const row = (locationKey: string): ItemRow =>
  ({ instanceId: 'i1', locationKey, characterId: null, placement: { kind: 'vault' }, equipped: 'not_equipped' }) as never

const line = (at: number, result: 'ok' | 'failed', to: string, over: Partial<JournalLine> = {}): JournalLine => ({
  at, action: 'move', item: { instanceId: 'i1', name: '超星系团' },
  from: 'vault', to, result, source: 'ui', ...over,
})

const receipt = () => ({ rename: vi.fn(), progress: vi.fn(), settle: vi.fn() }) as unknown as ReceiptHandle

/** 一次完整的"页面重开"：读 journal、挑意图、挂回去。 */
async function reopen(lines: JournalLine[], pending: InstanceType<typeof PendingOps>): Promise<number> {
  api.fetchJournal.mockResolvedValue(lines)
  return restoreIntents('/b', pending, signal())
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('A. 链末端决定恢复什么（经过折叠与挑拣）', () => {
  it('6.1/6.2 ok then failed still restores the ok', async () => {
    const pending = new PendingOps()
    const restored = await reopen([line(NOW - 2_000, 'ok', 'hunter'), line(NOW - 1_000, 'failed', 'warlock')], pending)
    expect(restored).toBe(1)
    expect(pending.get('i1')?.target).toBe('hunter')
  })

  it('6.3 ok then ok restores only the newer', async () => {
    const pending = new PendingOps()
    await reopen([line(NOW - 2_000, 'ok', 'hunter'), line(NOW - 1_000, 'ok', 'warlock')], pending)
    expect(pending.get('i1')?.target).toBe('warlock')
    expect(pending.size).toBe(1)
  })

  it('6.5 failed in the middle does not stop a later success', async () => {
    const pending = new PendingOps()
    await reopen([
      line(NOW - 3_000, 'ok', 'hunter'),
      line(NOW - 2_000, 'failed', 'warlock'),
      line(NOW - 1_000, 'ok', 'titan'),
    ], pending)
    expect(pending.get('i1')?.target).toBe('titan')
  })

  it('6.6 an intent with a verdict blocks the fallback behind it', async () => {
    const pending = new PendingOps()
    await reopen([
      line(NOW - 2_000, 'ok', 'hunter'),
      line(NOW - 1_000, 'ok', 'warlock', { resolution: { at: NOW - 500, landed: true } }),
    ], pending)
    expect(pending.size).toBe(0)
  })
})

describe('B. 恢复之后再操作', () => {
  it('6.8/6.9 a failed second drag falls back to the previous intent, not to Bungie', async () => {
    const pending = new PendingOps()
    await reopen([line(NOW - 5_000, 'ok', 'hunter')], pending)
    let rows = applyOverlay([row('vault')], pending.all())
    expect(rows[0]?.locationKey).toBe('hunter')

    // The user drags B from hunter to warlock.
    rows = [{ ...(rows[0] as ItemRow), locationKey: 'warlock' }]
    pending.submit({ eventId: 'e-b', instanceId: 'i1', action: 'move', target: 'warlock', from: 'hunter', now: NOW })
    // 必须是桥接的 BridgeError 实例：普通 Error 会被归成"结果不明"，走回读而不是拒绝。
    const Bridge = api.BridgeError as unknown as new (code: string, message: string) => Error
    api.postAction.mockRejectedValue(new Bridge('DestinyNoRoomInDestination', 'no'))
    await sendAction(
      { routePath: '/b', pending, patchRows: (change) => { rows = change(rows) } },
      { kind: 'move', instanceId: 'i1', destination: 'warlock', from: 'hunter' },
      '超星系团', 'e-b', receipt(), signal(), '移到术士',
    )
    // Injectable violation: roll back to the snapshot (`vault`) and the item jumps
    // two steps back, losing the move that did succeed.
    expect(rows[0]?.locationKey).toBe('hunter')
    expect(pending.size).toBe(0)
  })

  it('6.11 a late observation from A cannot end B', async () => {
    const pending = new PendingOps()
    await reopen([line(NOW - 5_000, 'ok', 'hunter')], pending)
    pending.submit({ eventId: 'e-b', instanceId: 'i1', action: 'move', target: 'warlock', from: 'hunter', now: NOW })
    // A's read was issued before B existed.
    pending.reconcile([{ instanceId: 'i1', location: 'hunter', startedAt: NOW - 1_000 }], NOW + 10)
    expect(pending.get('i1')?.eventId).toBe('e-b')
  })

  it('6.12 B verifies once Bungie says warlock', async () => {
    const pending = new PendingOps()
    await reopen([line(NOW - 5_000, 'ok', 'hunter')], pending)
    pending.submit({ eventId: 'e-b', instanceId: 'i1', action: 'move', target: 'warlock', from: 'hunter', now: NOW })
    const transitions = pending.reconcile([{ instanceId: 'i1', location: 'warlock', startedAt: NOW + 500 }], NOW + 600)
    expect(transitions[0]?.kind).toBe('verified')
  })
})

describe('C. 反复刷新', () => {
  it('6.14/6.15 three refreshes restore once, not three times', async () => {
    const pending = new PendingOps()
    const lines = [line(NOW - 1_000, 'ok', 'hunter')]
    expect(await reopen(lines, pending)).toBe(1)
    expect(await reopen(lines, pending)).toBe(0)
    expect(await reopen(lines, pending)).toBe(0)
    expect(pending.size).toBe(1)
  })

  it('6.16 the deadline does not move across refreshes', async () => {
    const pending = new PendingOps()
    const lines = [line(NOW - 1_000, 'ok', 'hunter')]
    await reopen(lines, pending)
    const first = pending.get('i1')?.expiresAt
    await reopen(lines, pending)
    expect(pending.get('i1')?.expiresAt).toBe(first)
    expect(first).toBe(NOW - 1_000 + TTL)
  })

  it('6.20 an intent past the window is not restored at all', async () => {
    const pending = new PendingOps()
    const restored = await reopen([line(NOW - TTL - 1, 'ok', 'hunter')], pending)
    expect(restored).toBe(0)
  })
})

describe('D. 失败不冒充核验', () => {
  it('6.13 a removed pending does not mean Bungie confirmed anything', async () => {
    const pending = new PendingOps()
    await reopen([line(NOW - 5_000, 'ok', 'hunter')], pending)
    pending.submit({ eventId: 'e-b', instanceId: 'i1', action: 'move', target: 'warlock', from: 'hunter', now: NOW })
    const transition = pending.settle('e-b', 'rejected')
    // Injectable violation: turn a definite refusal into a `verified` transition and
    // the journal records a confirmation no read ever gave.
    expect(transition?.kind).toBe('failed')
    expect(pending.size).toBe(0)
  })
})

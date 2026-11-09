/**
 * P1.5.5 —— 过期不等于失败，且核验必须先于过期。
 *
 * 两件事在这里被钉住：
 * - 一条刚好过期的操作，如果这次读**正好**确认了它，它就是 `verified`，不是 `unknown`；
 * - 同一份快照被处理两遍不能凑出"两次稳定观测"。
 */
import { describe, expect, it } from 'vitest'
import { PendingOps, VERIFY_TTL_MS } from '../src/client/pending-ops'
import { compareSnapshot } from '../src/client/pending-ops-render'
import type { ItemRow } from '../src/host/types'

const TTL = VERIFY_TTL_MS

const row = (locationKey: string): ItemRow =>
  ({ instanceId: 'i1', locationKey, placement: { kind: 'vault' }, characterId: null, equipped: 'not_equipped' }) as never

function seeded(now: number): PendingOps {
  const ops = new PendingOps()
  ops.restore({
    entryId: 'restore:1:i1',
    instanceId: 'i1',
    target: 'hunter',
    from: 'vault',
    submittedAt: now - TTL - 1,
    expiresAt: now - 1,
  })
  return ops
}

describe('verification before expiry', () => {
  it('a snapshot that confirms an already-expired operation verifies it', () => {
    const now = 1_000_000
    const ops = seeded(now)
    // Injectable violation: expire first and this operation becomes `unknown` even
    // though the very read that arrived says it landed.
    const transitions = ops.reconcile([{ instanceId: 'i1', location: 'hunter', startedAt: now - TTL }], now)
    expect(transitions[0]?.kind).toBe('verified')
    expect(ops.size).toBe(0)
  })

  it('expires only when no observation arrived at all', () => {
    const now = 1_000_000
    const ops = seeded(now)
    expect(ops.reconcile([], now)[0]?.kind).toBe('unknown')
    expect(ops.get('i1')?.state).toBe('unknown')
  })

  it('an unknown operation can still be verified by a later agreeing read', () => {
    const now = 1_000_000
    const ops = seeded(now)
    ops.reconcile([], now)
    const transitions = ops.reconcile([{ instanceId: 'i1', location: 'hunter', startedAt: now + 500 }], now + 600)
    expect(transitions[0]?.kind).toBe('verified')
  })
})

describe('observation validity', () => {
  it('the same snapshot twice does not count as two observations', () => {
    const now = 1_000_000
    const ops = new PendingOps()
    ops.restore({
      entryId: 'r', instanceId: 'i1', target: 'hunter', from: 'vault',
      submittedAt: now - 10_000, expiresAt: now + TTL,
    })
    const same = [{ instanceId: 'i1', location: 'vault', startedAt: now - 5_000 }]
    ops.reconcile(same, now - 4_000)
    expect(ops.get('i1')?.mismatches).toBe(1)
    ops.reconcile(same, now - 3_000)
    // Injectable violation: count it again and one request, replayed, is enough to
    // satisfy "two stable observations" and supersede a live intent.
    expect(ops.get('i1')?.mismatches).toBe(1)
  })

  it('two genuinely newer reads do count', () => {
    const now = 1_000_000
    const ops = seeded(now)
    ops.reconcile([], now)
    ops.reconcile([{ instanceId: 'i1', location: 'vault', startedAt: now + 100 }], now + 200)
    ops.reconcile([{ instanceId: 'i1', location: 'vault', startedAt: now + 300 }], now + 400)
    expect(ops.size).toBe(0)
  })

  it('a read issued before the operation does not count', () => {
    const now = 1_000_000
    const ops = new PendingOps()
    ops.restore({
      entryId: 'r', instanceId: 'i1', target: 'hunter', from: 'vault',
      submittedAt: now, expiresAt: now + TTL,
    })
    ops.reconcile([{ instanceId: 'i1', location: 'vault', startedAt: now - 1 }], now + 10)
    expect(ops.get('i1')?.mismatches).toBe(0)
  })

  it('an item missing from the read produces no observation', () => {
    const pending = new PendingOps()
    pending.restore({
      entryId: 'r', instanceId: 'i1', target: 'hunter', from: 'vault',
      submittedAt: 1, expiresAt: 2,
    })
    // 看不到不等于"它在别处"：这里返回空数组，而不是一条空位置的观测。
    expect(compareSnapshot([], pending.all(), 100)).toEqual([])
    expect(compareSnapshot([row('hunter')], pending.all(), 100)).toHaveLength(1)
  })
})

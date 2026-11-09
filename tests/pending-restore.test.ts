/**
 * P1.5.3 —— 恢复是一个状态转换入口，不是一次提交。
 *
 * 五组：基础恢复、事件幂等、物品所有权、期限、副作用。
 * 最要紧的是"幂等"和"所有权"是**两个独立不变量**：只查 eventId 挡不住 A 覆盖更新的 B。
 */
import { describe, expect, it } from 'vitest'
import { PendingOps, VERIFY_TTL_MS } from '../src/client/pending-ops'
import type { RestorableOperation } from '../src/client/operation-chain'

const intent = (over: Partial<RestorableOperation> = {}): RestorableOperation => ({
  entryId: 'restore:1000:i1',
  instanceId: 'i1',
  target: 'hunter',
  from: 'vault',
  submittedAt: 1_000,
  expiresAt: 1_000 + VERIFY_TTL_MS,
  ...over,
})

describe('A. 基础恢复', () => {
  it('3.1 creates a pending operation from an effective intent', () => {
    const ops = new PendingOps()
    expect(ops.restore(intent())).toBe(true)
    expect(ops.size).toBe(1)
  })

  it('3.2 keeps the journal identity as the event id', () => {
    const ops = new PendingOps()
    ops.restore(intent())
    expect(ops.get('i1')?.eventId).toBe('restore:1000:i1')
  })

  it('3.3 uses the original submission time, never the clock', () => {
    const ops = new PendingOps()
    ops.restore(intent())
    // Injectable violation: stamp `submittedAt` with Date.now() and a four-minute-old
    // operation silently gets a fresh five minutes.
    expect(ops.get('i1')?.submittedAt).toBe(1_000)
    expect(ops.get('i1')?.expiresAt).toBe(1_000 + VERIFY_TTL_MS)
  })

  it('3.4/3.5 carry the target and the origin', () => {
    const ops = new PendingOps()
    ops.restore(intent())
    expect(ops.get('i1')?.target).toBe('hunter')
    expect(ops.get('i1')?.from).toBe('vault')
  })

  it('3.6 starts as verifying, not submitted', () => {
    const ops = new PendingOps()
    ops.restore(intent())
    // Injectable violation: start at `submitted` and the operation looks like it was
    // never answered, so the "accepted" step is lost.
    expect(ops.get('i1')?.state).toBe('verifying')
  })

  it('3.7 gets a seq of its own', () => {
    const ops = new PendingOps()
    ops.restore(intent())
    expect(ops.get('i1')?.seq).toBe(1)
  })
})

describe('B. 事件幂等', () => {
  it('3.8/3.9 a second restore of the same event changes nothing', () => {
    const ops = new PendingOps()
    ops.restore(intent())
    const before = ops.get('i1')
    expect(ops.restore(intent())).toBe(false)
    expect(ops.size).toBe(1)
    expect(ops.get('i1')).toEqual(before)
  })

  it('3.10 an unknown operation stays unknown, not re-armed as verifying', () => {
    const ops = new PendingOps()
    ops.restore(intent())
    ops.reconcile([], 1_000 + VERIFY_TTL_MS + 1)
    expect(ops.get('i1')?.state).toBe('unknown')
    const before = ops.get('i1')
    ops.restore(intent())
    // Injectable violation: return a fresh `verifying` and an expired operation is
    // resurrected to full health on every refresh.
    expect(ops.get('i1')?.state).toBe('unknown')
    expect(ops.get('i1')).toEqual(before)
  })

  it('3.11 a verified operation is not recreated', () => {
    const ops = new PendingOps()
    ops.restore(intent())
    ops.reconcile([{ instanceId: 'i1', location: 'hunter', startedAt: 2_000 }], 2_100)
    expect(ops.size).toBe(0)
    expect(ops.restore(intent())).toBe(false)
    expect(ops.size).toBe(0)
  })

  it('3.12 a superseded operation is not recreated', () => {
    const ops = new PendingOps()
    ops.restore(intent())
    ops.reconcile([], 1_000 + VERIFY_TTL_MS + 1)
    ops.reconcile([{ instanceId: 'i1', location: 'vault', startedAt: 400_000 }], 400_100)
    ops.reconcile([{ instanceId: 'i1', location: 'vault', startedAt: 402_000 }], 402_100)
    expect(ops.size).toBe(0)
    expect(ops.restore(intent())).toBe(false)
  })

  it('3.13/3.14/3.15 repeated restores do not touch time or seq', () => {
    const ops = new PendingOps()
    ops.restore(intent())
    const before = ops.get('i1')
    ops.restore(intent())
    ops.restore(intent())
    expect(ops.get('i1')).toEqual(before)
  })
})

describe('C. 物品所有权', () => {
  it('3.16 a new drag takes over from a restored intent', () => {
    const ops = new PendingOps()
    ops.restore(intent())
    ops.submit({ eventId: 'e-new', instanceId: 'i1', action: 'move', target: 'warlock', from: 'hunter', now: 2_000 })
    expect(ops.get('i1')?.eventId).toBe('e-new')
    expect(ops.get('i1')?.seq).toBe(2)
  })

  it('3.17 a later restore must not overwrite the newer operation', () => {
    const ops = new PendingOps()
    ops.restore(intent())
    ops.submit({ eventId: 'e-new', instanceId: 'i1', action: 'move', target: 'warlock', from: 'hunter', now: 2_000 })
    // Injectable violation: check only the event id, and the old intent lands on top of
    // the drag the user just made.
    expect(ops.restore(intent({ entryId: 'restore:1000:i1' }))).toBe(false)
    expect(ops.get('i1')?.eventId).toBe('e-new')
    expect(ops.get('i1')?.target).toBe('warlock')
  })

  it('3.18 an intent restored after its successor verified does not come back', () => {
    const ops = new PendingOps()
    ops.restore(intent())
    ops.submit({ eventId: 'e-new', instanceId: 'i1', action: 'move', target: 'warlock', from: 'hunter', now: 2_000 })
    ops.reconcile([{ instanceId: 'i1', location: 'warlock', startedAt: 3_000 }], 3_100)
    expect(ops.size).toBe(0)
    expect(ops.restore(intent())).toBe(false)
  })

  it('3.21 one item does not disturb another', () => {
    const ops = new PendingOps()
    ops.restore(intent())
    ops.restore(intent({ entryId: 'restore:1500:i2', instanceId: 'i2', target: 'titan' }))
    expect(ops.size).toBe(2)
    expect(ops.get('i1')?.target).toBe('hunter')
    expect(ops.get('i2')?.target).toBe('titan')
  })
})

describe('D. 期限与边界', () => {
  it('3.23 restores what the caller already decided is in range, without extending it', () => {
    const ops = new PendingOps()
    const at = 1_000
    ops.restore(intent({ submittedAt: at, expiresAt: at + 10 }))
    expect(ops.get('i1')?.expiresAt).toBe(at + 10)
  })

  it('3.24 an operation restored past its deadline expires on the first reconcile', () => {
    const ops = new PendingOps()
    ops.restore(intent({ submittedAt: 1_000, expiresAt: 1_100 }))
    const transitions = ops.reconcile([], 2_000)
    expect(transitions[0]?.kind).toBe('unknown')
  })
})

describe('E. 副作用', () => {
  it('never emits a transition: restoring is not verifying', () => {
    const ops = new PendingOps()
    ops.restore(intent())
    // Injectable violation: return a `verified` transition here and the panel records
    // a confirmation that no read ever gave.
    expect(ops.restore(intent())).toBe(false)
  })

  it('does not mark anything as settled until something actually settles', () => {
    const ops = new PendingOps()
    ops.restore(intent())
    expect(ops.reconcile([], 1_500)).toEqual([])
  })
})

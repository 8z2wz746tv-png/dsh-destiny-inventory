/**
 * The rules that keep a stale observation from erasing what the user just did.
 *
 * Each test here corresponds to a way the old design would have lied: calling a
 * timeout a failure, letting an old read-back repaint a newer operation, letting
 * `unknown` own an item forever, or rolling back on the first disagreeing read.
 */
import { describe, expect, it } from 'vitest'
import { PendingOps, VERIFY_TTL_MS, classifyFailure } from '../src/client/pending-ops'
import { applyOverlay } from '../src/client/pending-ops-render'
import type { ItemRow } from '../src/host/types'

const op = (over: Partial<Parameters<PendingOps['submit']>[0]> = {}) => ({
  eventId: 'e1',
  instanceId: 'i1',
  action: 'move' as const,
  target: 'warlock',
  from: 'vault',
  now: 1_000,
  ...over,
})

const row = (over: Partial<ItemRow> = {}): ItemRow =>
  ({
    id: 'i1',
    instanceId: 'i1',
    name: '英勇利刃',
    locationKey: 'vault',
    characterId: null,
    placement: { kind: 'vault' },
    equipped: 'not_equipped',
    ...over,
  }) as ItemRow

describe('classifyFailure', () => {
  it('treats a refusal by name as a definite rejection', () => {
    expect(classifyFailure('DestinyNoRoomInDestination')).toBe('rejected')
    expect(classifyFailure('BadRequest')).toBe('rejected')
    expect(classifyFailure('AUTH_UNAVAILABLE')).toBe('rejected')
  })

  it('treats a dropped connection as unknown, not as a refusal', () => {
    // Injectable violation: classify everything as rejected and an unexecuted
    // write is denied the chance to be verified later.
    expect(classifyFailure('AbortError')).toBe('unclear')
    expect(classifyFailure('UPSTREAM')).toBe('unclear')
    expect(classifyFailure('BridgeError')).toBe('unclear')
  })
})

describe('pending operations', () => {
  it('numbers operations per item, not globally', () => {
    const ops = new PendingOps()
    expect(ops.submit(op()).seq).toBe(1)
    expect(ops.submit(op({ eventId: 'e2', target: 'hunter', now: 2_000 })).seq).toBe(2)
    expect(ops.submit(op({ eventId: 'e3', instanceId: 'i2' })).seq).toBe(1)
  })

  it('drops the overlay when the bridge definitely refused', () => {
    const ops = new PendingOps()
    ops.submit(op())
    const transition = ops.settle('e1', 'rejected')
    expect(transition?.kind).toBe('failed')
    expect(ops.size).toBe(0)
  })

  it('keeps verifying when the bridge accepted but has not proven anything', () => {
    const ops = new PendingOps()
    ops.submit(op())
    expect(ops.settle('e1', 'accepted')).toBeNull()
    expect(ops.get('i1')?.state).toBe('succeeded')
  })

  it('keeps verifying when the outcome is unknown', () => {
    const ops = new PendingOps()
    ops.submit(op())
    expect(ops.settle('e1', 'unclear')).toBeNull()
    expect(ops.get('i1')?.state).toBe('verifying')
  })

  it('clears the overlay once a read agrees with the target', () => {
    const ops = new PendingOps()
    ops.submit(op())
    ops.settle('e1', 'accepted')
    const transitions = ops.reconcile([{ instanceId: 'i1', location: 'warlock', startedAt: 2_000 }], 2_100)
    expect(transitions).toEqual([{ eventId: 'e1', instanceId: 'i1', kind: 'verified', location: 'warlock' }])
    expect(ops.size).toBe(0)
  })

  it('does not roll back on the first disagreeing read', () => {
    const ops = new PendingOps()
    ops.submit(op())
    ops.settle('e1', 'accepted')
    ops.reconcile([{ instanceId: 'i1', location: 'vault', startedAt: 2_000 }], 2_100)
    // Injectable violation: treat the first mismatch as final and the item snaps
    // back within one refresh.
    expect(ops.get('i1')?.state).toBe('succeeded')
    expect(ops.get('i1')?.mismatches).toBe(1)
  })

  it('ignores a read issued before the operation started', () => {
    const ops = new PendingOps()
    ops.submit(op({ now: 5_000 }))
    // This read was issued at 4 s: it can only be describing the world before.
    const transitions = ops.reconcile([{ instanceId: 'i1', location: 'warlock', startedAt: 4_000 }], 6_000)
    expect(transitions).toEqual([])
    expect(ops.get('i1')?.mismatches).toBe(0)
  })

  it('refuses a read issued in the same millisecond as the drag', () => {
    const ops = new PendingOps()
    ops.submit(op({ now: 5_000 }))
    ops.settle('e1', 'accepted')
    // Injectable violation: use `<` and this read — which may have been issued
    // microseconds before the drag — is allowed to confirm it.
    const transitions = ops.reconcile([{ instanceId: 'i1', location: 'warlock', startedAt: 5_000 }], 6_000)
    expect(transitions).toEqual([])
    expect(ops.get('i1')?.mismatches).toBe(0)
  })

  it('lets an old read-back describe a newer operation without repainting it', () => {
    const ops = new PendingOps()
    ops.submit(op({ eventId: 'a', target: 'warlock', now: 1_000 })) // A: vault → warlock
    ops.settle('a', 'accepted')
    ops.submit(op({ eventId: 'b', target: 'hunter', now: 3_000 })) // B: → hunter, supersedes A
    ops.settle('b', 'accepted')
    // A's read-back lands late, sees B's result. It belongs to A.
    const transitions = ops.reconcile([{ instanceId: 'i1', location: 'hunter', startedAt: 2_000 }], 4_000)
    // Nothing is confirmed: the read was issued before B existed.
    expect(transitions).toEqual([])
    expect(ops.get('i1')?.eventId).toBe('b')
  })

  it('goes unknown after the verification window with no agreement', () => {
    const ops = new PendingOps()
    ops.submit(op({ now: 1_000 }))
    ops.settle('e1', 'accepted')
    const transitions = ops.reconcile([], 1_000 + VERIFY_TTL_MS + 1)
    expect(transitions[0]?.kind).toBe('unknown')
    // Unknown stays: deleting it would claim success.
    expect(ops.get('i1')?.state).toBe('unknown')
  })

  it('stops controlling the grid once something else settles there twice', () => {
    const ops = new PendingOps()
    ops.submit(op({ now: 1_000 }))
    ops.settle('e1', 'unclear')
    ops.reconcile([], 1_000 + VERIFY_TTL_MS + 1) // → unknown
    ops.reconcile([{ instanceId: 'i1', location: 'vault', startedAt: 400_000 }], 400_100)
    const transitions = ops.reconcile([{ instanceId: 'i1', location: 'vault', startedAt: 402_000 }], 402_100)
    // Injectable violation: without supersede, one stuck operation owns the item
    // forever and the user's in-game move never shows up.
    expect(transitions[0]?.kind).toBe('superseded')
    expect(ops.size).toBe(0)
  })
})

describe('rendering through the overlay', () => {
  it('keeps the destination on screen while the snapshot disagrees', () => {
    const ops = new PendingOps()
    ops.submit(op())
    const [rendered] = applyOverlay([row()], ops.all())
    expect(rendered?.locationKey).toBe('warlock')
    expect(rendered?.pending).toBe('applying')
  })

  it('marks an unknown operation rather than claiming success', () => {
    const ops = new PendingOps()
    ops.submit(op({ now: 1_000 }))
    ops.reconcile([], 1_000 + VERIFY_TTL_MS + 1)
    const [rendered] = applyOverlay([row()], ops.all())
    expect(rendered?.locationKey).toBe('warlock')
    expect(rendered?.pending).toBe('unconfirmed')
  })

  it('leaves a row alone once the snapshot already agrees', () => {
    const ops = new PendingOps()
    ops.submit(op())
    const original = row({ locationKey: 'warlock' })
    expect(applyOverlay([original], ops.all())[0]).toBe(original)
  })

  it('does nothing when there is no overlay', () => {
    const rows = [row()]
    expect(applyOverlay(rows, new Map())).toBe(rows)
  })
})

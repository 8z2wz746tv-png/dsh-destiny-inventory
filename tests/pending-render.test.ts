/**
 * The refresh path: a snapshot arrives, the overlay decides what the user sees.
 *
 * These are the five checks from the P1.3 review. The one that matters most is the
 * third: **a snapshot that disagrees with the target is not a failure** — Bungie's
 * read lags by about a minute, and treating that lag as a contradiction is the
 * whole bug this layer exists to fix.
 */
import { describe, expect, it } from 'vitest'
import { PendingOps } from '../src/client/pending-ops'
import { applyOverlay, compareSnapshot } from '../src/client/pending-ops-render'
import type { ItemRow } from '../src/host/types'

const row = (locationKey: string): ItemRow =>
  ({
    id: 'a',
    instanceId: 'a',
    name: '英勇利刃',
    locationKey,
    characterId: null,
    placement: locationKey === 'vault' ? { kind: 'vault' } : { kind: 'inventory', characterId: locationKey },
    equipped: 'not_equipped',
  }) as ItemRow

/** One load: compare, reconcile, render — the same order `InventoryPanel.load` uses. */
function load(pending: PendingOps, snapshot: ItemRow[], issuedAt: number, now = issuedAt + 5) {
  const transitions = pending.reconcile(compareSnapshot(snapshot, pending.all(), issuedAt), now)
  return { transitions, rows: applyOverlay(snapshot, pending.all()) }
}

const move = (pending: PendingOps, target = 'warlock', now = 1_000) =>
  pending.submit({ eventId: 'e1', instanceId: 'a', action: 'move', target, from: 'vault', now })

describe('compareSnapshot', () => {
  it('carries the moment the read was issued, not the moment it returned', () => {
    const pending = new PendingOps()
    move(pending)
    const [observation] = compareSnapshot([row('vault')], pending.all(), 42)
    expect(observation).toEqual({ instanceId: 'a', location: 'vault', startedAt: 42 })
  })

  it('produces no observation for an item missing from the read', () => {
    const pending = new PendingOps()
    move(pending)
    // 看不到不等于"它在别处"：产生一条空位置的观测，会把它算成一次不一致。
    expect(compareSnapshot([], pending.all(), 1)).toEqual([])
  })
})

describe('a snapshot arriving mid-sync', () => {
  it('keeps the item where the user put it, and keeps verifying', () => {
    const pending = new PendingOps()
    move(pending, 'warlock')
    pending.settle('e1', 'accepted')
    const { rows } = load(pending, [row('vault')], 2_000)
    // Injectable violation: trust the snapshot and the item jumps back on refresh.
    expect(rows[0]?.locationKey).toBe('warlock')
    expect(pending.get('a')?.state).toBe('succeeded')
  })

  it('confirms and stops governing once the snapshot agrees', () => {
    const pending = new PendingOps()
    move(pending, 'warlock')
    pending.settle('e1', 'accepted')
    const { transitions, rows } = load(pending, [row('warlock')], 2_000)
    expect(transitions).toEqual([{ eventId: 'e1', instanceId: 'a', kind: 'verified', location: 'warlock' }])
    expect(pending.size).toBe(0)
    expect(rows[0]?.locationKey).toBe('warlock')
  })

  it('does not treat a third location as a verdict on the first read', () => {
    const pending = new PendingOps()
    move(pending, 'warlock')
    pending.settle('e1', 'accepted')
    const { transitions, rows } = load(pending, [row('hunter')], 2_000)
    expect(transitions).toEqual([])
    expect(pending.get('a')?.state).toBe('succeeded')
    expect(rows[0]?.locationKey).toBe('warlock')
  })

  it('ignores a read issued before the drag', () => {
    const pending = new PendingOps()
    move(pending, 'warlock', 5_000) // drag happened at t=5000
    const { transitions } = load(pending, [row('warlock')], 4_000) // read started at t=4000
    // Injectable violation: accept it and an in-flight read confirms a drag it
    // could not possibly have seen.
    expect(transitions).toEqual([])
    expect(pending.size).toBe(1)
  })
})

describe('two drags on one item', () => {
  it('does not let the older one confirm the newer one', () => {
    const pending = new PendingOps()
    move(pending, 'warlock')
    pending.settle('e1', 'accepted')
    pending.submit({ eventId: 'e2', instanceId: 'a', action: 'move', target: 'hunter', from: 'warlock', now: 3_000 })
    pending.settle('e2', 'accepted')
    // A read issued while the second drag was the current intent.
    const { transitions, rows } = load(pending, [row('hunter')], 4_000)
    expect(transitions).toEqual([{ eventId: 'e2', instanceId: 'a', kind: 'verified', location: 'hunter' }])
    expect(rows[0]?.locationKey).toBe('hunter')
  })
})

describe('repeated loads', () => {
  it('does not emit the same transition twice', () => {
    const pending = new PendingOps()
    move(pending, 'warlock')
    pending.settle('e1', 'accepted')
    const first = load(pending, [row('warlock')], 2_000)
    const second = load(pending, [row('warlock')], 3_000)
    // Injectable violation: journal the same "verified" on every refresh and the
    // operation history fills with duplicates.
    expect(first.transitions).toHaveLength(1)
    expect(second.transitions).toEqual([])
  })

  it('renders the same rows every time nothing changed', () => {
    const pending = new PendingOps()
    move(pending, 'warlock')
    pending.settle('e1', 'accepted')
    const snapshot = [row('vault')]
    expect(load(pending, snapshot, 2_000).rows[0]?.locationKey).toBe('warlock')
    expect(load(pending, snapshot, 9_000).rows[0]?.locationKey).toBe('warlock')
  })
})

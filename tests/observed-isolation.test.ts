/**
 * P0 —— 原始观测必须独立于渲染投影。
 *
 * 「分别起个变量名」是不够的：只要两次投影共享可变对象，任何一次就地修改都会把
 * 观测值污染掉，而下游再也分不清那是 Bungie 说的还是算出来的。
 *
 * 这一组测试的价值不只在通过——`scripts/mutate.sh` 会把 `confirmMove` 改成就地修改，
 * 那时这里必须变红。
 */
import { describe, expect, it } from 'vitest'
import { applyOverlay } from '../src/client/pending-ops-render'
import { applyLock, applyMove, confirmMove } from '../src/client/apply-move'
import { PendingOps } from '../src/client/pending-ops'
import type { ItemRow } from '../src/host/types'

const observed = (): ItemRow[] => [
  {
    instanceId: 'i1',
    locationKey: 'vault',
    location: 'vault',
    characterId: null,
    placement: { kind: 'vault' },
    equipped: 'not_equipped',
    locked: false,
  } as ItemRow,
]

const where = (rows: ItemRow[]) => rows[0]?.locationKey

describe('P0 · 渲染投影不污染原始观测', () => {
  it('applyOverlay leaves the observation where Bungie put it', () => {
    const raw = observed()
    const pending = new PendingOps()
    pending.submit({ eventId: 'e1', instanceId: 'i1', action: 'move', target: 'hunter', from: 'vault', now: 1 })
    const rendered = applyOverlay(raw, pending.all())
    expect(where(rendered)).toBe('hunter')
    expect(where(raw)).toBe('vault')
  })

  it('a rollback confirm does not move the observation', () => {
    const raw = observed()
    const rendered = confirmMove(raw, 'i1', 'hunter', false, 'rollback')
    // Injectable violation: make `confirmMove` assign `row.locationKey` in place and
    // the observation silently becomes the rollback position.
    expect(where(rendered)).toBe('hunter')
    expect(where(raw)).toBe('vault')
  })

  it('an optimistic move does not move the observation', () => {
    const raw = observed()
    expect(where(applyMove(raw, 'i1', 'warlock', false))).toBe('warlock')
    expect(where(raw)).toBe('vault')
  })

  it('a lock does not move the observation', () => {
    const raw = observed()
    expect(applyLock(raw, 'i1', true)[0]?.locked).toBe(true)
    expect(raw[0]?.locked).toBe(false)
  })

  it('the rendered row and the observed row are different objects', () => {
    const raw = observed()
    const rendered = applyOverlay(raw, new PendingOps().all())
    // 没有 pending 时 applyOverlay 原样返回同一个数组——那是优化，不是共享。
    // 关键在于：**一旦要改，改的必须是新对象**。
    const moved = confirmMove(rendered, 'i1', 'hunter', false)
    expect(moved[0]).not.toBe(raw[0])
    expect(raw[0]?.locationKey).toBe('vault')
  })
})

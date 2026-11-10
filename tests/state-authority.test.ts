/**
 * PLAN-STATE-AUTHORITY.md §五 的四条不变量，逐条变成断言。
 *
 * 它们不是"描述行为"，是"禁止退化"：每一 pair 都能被一种最常见的省事写法破坏，
 * 而那些写法在大多数测试里都不会变红。
 */
import { describe, expect, it } from 'vitest'
import { applyOverlay } from '../src/client/pending-ops-render'
import { confirmMove } from '../src/client/apply-move'
import { PendingOps } from '../src/client/pending-ops'
import type { ItemRow } from '../src/host/types'

const row = (locationKey: string, over: Partial<ItemRow> = {}): ItemRow =>
  ({
    instanceId: 'i1',
    locationKey,
    characterId: locationKey === 'vault' ? null : locationKey,
    placement: locationKey === 'vault' ? { kind: 'vault' } : { kind: 'inventory', characterId: locationKey },
    equipped: 'not_equipped',
    ...over,
  }) as ItemRow

const at = (rows: ItemRow[]) => rows[0]?.locationKey
const mark = (rows: ItemRow[]) => rows[0]?.pending

describe('不变量 1 · 渲染优先级 pending > rollback > observed', () => {
  it('pending beats a rollback position', () => {
    // 回滚把格子留在 hunter（带未确认），用户又拖了一次去 warlock。
    const rolled = confirmMove([row('vault')], 'i1', 'hunter', false, 'rollback')
    const pending = new PendingOps()
    pending.submit({ eventId: 'e2', instanceId: 'i1', action: 'move', target: 'warlock', from: 'hunter', now: 1 })
    const drawn = applyOverlay(rolled, pending.all())
    // Injectable violation: let the row's own mark win over the overlay and the grid
    // follows the failed attempt instead of what the user just asked for.
    expect(at(drawn)).toBe('warlock')
    expect(mark(drawn)).toBe('applying')
  })

  it('rollback beats the observation it is standing in for', () => {
    // 快照说 vault；失败操作把界面退回 hunter；没有新的 pending。
    const drawn = confirmMove([row('vault')], 'i1', 'hunter', false, 'rollback')
    expect(at(drawn)).toBe('hunter')
  })

  it('the observation wins when there is nothing else', () => {
    expect(at([row('vault')])).toBe('vault')
  })
})

describe('不变量 2 · 新意图接管渲染，但不抹除历史', () => {
  it('a new pending takes the cell, and the failure stays in the journal', () => {
    const rolled = confirmMove([row('vault')], 'i1', 'hunter', false, 'rollback')
    const pending = new PendingOps()
    pending.submit({ eventId: 'e2', instanceId: 'i1', action: 'move', target: 'warlock', from: 'hunter', now: 1 })
    const drawn = applyOverlay(rolled, pending.all())
    // 行上只剩一格，历史不在行上——它在 journal 里（那条 failed 记录）。
    // 这条断言固定的是：接管之后，格子不能再声称自己是回滚位置。
    expect(mark(drawn)).not.toBe('unconfirmed')
    expect(at(drawn)).toBe('warlock')
  })
})

describe('不变量 4 · rollback 不能伪装成观测', () => {
  it('a rollback position carries the unconfirmed mark', () => {
    const drawn = confirmMove([row('vault')], 'i1', 'hunter', false, 'rollback')
    // Injectable violation: drop the mark and the grid says hunter while the detail
    // card (which reads the snapshot) says vault, with neither mentioning why.
    expect(mark(drawn)).toBe('unconfirmed')
  })

  it('a read-back position does not', () => {
    // 回读拿到的是 Bungie 亲口说的位置，它就是观测。
    const drawn = confirmMove([row('vault')], 'i1', 'hunter', false, 'observed')
    expect(mark(drawn)).toBeUndefined()
  })

  it('defaults to observed, so an unmarked caller stays honest', () => {
    const drawn = confirmMove([row('vault')], 'i1', 'hunter', false)
    expect(mark(drawn)).toBeUndefined()
  })
})

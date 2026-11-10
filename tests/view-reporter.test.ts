/**
 * What the agent is told the user is looking at.
 *
 * The panel has three widths. In the narrow and medium ones a class key is the
 * honest answer; in the wide one every store is on screen at once, so naming one
 * character would be a lie the agent then repeats back to the user.
 */
import { describe, expect, it } from 'vitest'
import { viewOf } from '../src/client/view-reporter'
import { DEFAULT_FILTERS } from '../src/client/filter'
import { PendingOps } from '../src/client/pending-ops'
import type { ItemRow } from '../src/host/types'

const row = { instanceId: 'i1', hash: 42, name: '英勇利刃', locationKey: 'hunter' } as unknown as ItemRow
const AT = 1_700_000_000_000
/** 三个来源各就各位：观测、意图、回滚可以同时存在。 */
const selection = (picked = row, observed = row, operation = undefined) => ({
  picked,
  observed,
  observedAt: AT,
  operation: operation as never,
})

describe('viewOf', () => {
  it('reports the class key in focus when one store is on screen', () => {
    expect(viewOf('warlock', DEFAULT_FILTERS, undefined, null).character).toBe('warlock')
  })

  it('reports `all` when every store is on screen', () => {
    // Injectable violation: pass the class key through unconditionally and the
    // agent answers "you are looking at the hunter" over a four-column layout.
    expect(viewOf('all', DEFAULT_FILTERS, selection(), null).character).toBe('all')
  })

  it('reports the clicked item as three columns, not as one position', () => {
    expect(viewOf('all', DEFAULT_FILTERS, selection(), 'vault').selected).toEqual({
      instanceId: 'i1',
      hash: 42,
      name: '英勇利刃',
      observed: 'hunter',
      observedAt: AT,
    })
  })
})

describe('P3 · 三种语义同时存在时，Agent 拿到的是三栏', () => {
  it('does not collapse observed, pending and rollback into the rendered position', () => {
    const observedRow = { ...row, locationKey: 'vault' } as ItemRow
    const rolled = { ...row, locationKey: 'hunter', pending: 'unconfirmed' } as ItemRow
    const pending = new PendingOps()
    pending.submit({ eventId: 'e1', instanceId: 'i1', action: 'move', target: 'warlock', from: 'vault', now: AT - 1_000 })
    // 关键构造：渲染行停在 hunter（一次回滚的位置），而意图指向 warlock，观测是 vault。
    const view = viewOf('all', DEFAULT_FILTERS, {
      picked: rolled, observed: observedRow, observedAt: AT, operation: pending.get('i1'),
    }, null)
    // Injectable violation: report `picked.locationKey` and the agent says "hunter",
    // losing both the fact (vault) and the intent (warlock).
    expect(view.selected).toMatchObject({
      observed: 'vault',
      pending: { target: 'warlock' },
    })
    // 有 operation 在场时，那个标记属于 pending，不该同时报成 rollback。
    expect(view.selected?.rollback).toBeUndefined()
  })

  it('reports a rollback when no intention remains', () => {
    const observedRow = { ...row, locationKey: 'vault' } as ItemRow
    const rolled = { ...row, locationKey: 'hunter', pending: 'unconfirmed' } as ItemRow
    const view = viewOf('all', DEFAULT_FILTERS, {
      picked: rolled, observed: observedRow, observedAt: AT, operation: undefined,
    }, null)
    expect(view.selected).toMatchObject({ observed: 'vault', rollback: { location: 'hunter' } })
    expect(view.selected?.pending).toBeUndefined()
  })
})

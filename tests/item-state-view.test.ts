/**
 * P2 —— 三栏 DTO 的来源与互斥。
 *
 * 两个容易被"静态组合"骗过去的地方：
 * - rollback 的判据依赖两条实现约定，**时序一变就可能失效**（操作被清理之后才会出现回滚）；
 * - DTO 必须从观测行组装，不能把渲染行的位置抄进来。
 */
import { describe, expect, it } from 'vitest'
import { itemStateView, rollbackOf } from '../src/client/item-state-view'
import { PendingOps } from '../src/client/pending-ops'
import { confirmMove } from '../src/client/apply-move'
import { applyOverlay } from '../src/client/pending-ops-render'
import type { ItemRow } from '../src/host/types'

const row = (locationKey: string): ItemRow =>
  ({
    instanceId: 'i1',
    name: '超星系团',
    locationKey,
    location: locationKey,
    characterId: locationKey === 'vault' ? null : locationKey,
    placement: { kind: 'vault' },
    equipped: 'not_equipped',
    locked: false,
  }) as unknown as ItemRow

const AT = 1_700_000_000_000

describe('三栏各来自各的地方', () => {
  it('nothing pending, nothing rolled back: only the observation', () => {
    const view = itemStateView(row('vault'), AT, undefined, row('vault'))
    expect(view).toEqual({ instanceId: 'i1', name: '超星系团', observed: 'vault', observedAt: AT })
  })

  it('an intention appears as pending, not as a position', () => {
    const pending = new PendingOps()
    pending.submit({ eventId: 'e1', instanceId: 'i1', action: 'move', target: 'hunter', from: 'vault', now: AT })
    const op = pending.get('i1')
    const view = itemStateView(row('vault'), AT, op, applyOverlay([row('vault')], pending.all())[0])
    expect(view?.observed).toBe('vault')
    expect(view?.pending).toEqual({ target: 'hunter', submittedAt: AT, status: 'submitted' })
    expect(view?.rollback).toBeUndefined()
  })

  it('a rollback is reported as a rollback, never as observed', () => {
    const rendered = confirmMove([row('vault')], 'i1', 'hunter', false, 'rollback')[0]
    const view = itemStateView(row('vault'), AT, undefined, rendered)
    // Injectable violation: read `rendered.locationKey` into `observed` and the agent
    // starts reporting a derivation as Bungie's answer.
    expect(view?.observed).toBe('vault')
    expect(view?.rollback).toEqual({ location: 'hunter' })
    expect(view?.pending).toBeUndefined()
  })

  it('no observation means no view, even if a rendered row exists', () => {
    expect(itemStateView(undefined, AT, undefined, row('hunter'))).toBeNull()
  })
})

describe('互斥：pending 与 rollback 不会同时出现', () => {
  it('an operation present wins: the mark is read as pending, not as a rollback', () => {
    const pending = new PendingOps()
    pending.submit({ eventId: 'e1', instanceId: 'i1', action: 'move', target: 'hunter', from: 'vault', now: AT })
    // 故意造一个"有 op 又带标记"的行——现实里 applyOverlay 会盖掉它，
    // 但只要这条判据被写反，这个组合就会给出两栏。
    const suspicious = { ...row('hunter'), pending: 'unconfirmed' as const }
    const view = itemStateView(row('vault'), AT, pending.get('i1'), suspicious)
    expect(view?.pending).toBeDefined()
    expect(view?.rollback).toBeUndefined()
  })

  it('the operation goes away first, then the rollback shows up', () => {
    const pending = new PendingOps()
    pending.submit({ eventId: 'e1', instanceId: 'i1', action: 'move', target: 'hunter', from: 'vault', now: AT })
    // 有操作时：即使行上已经有标记，也不算回滚。
    expect(rollbackOf({ ...row('hunter'), pending: 'unconfirmed' }, pending.get('i1'))).toBeNull()
    // 操作被拒、清理掉：这时标记才指向回滚。
    pending.settle('e1', 'rejected')
    expect(pending.get('i1')).toBeUndefined()
    expect(rollbackOf({ ...row('hunter'), pending: 'unconfirmed' }, undefined)).toBe('hunter')
  })

  it('a row with no mark never becomes a rollback, whatever else changed', () => {
    // 位置变了但没有标记：那是一次普通的观测更新，不是回滚。
    expect(rollbackOf(row('hunter'), undefined)).toBeNull()
  })
})

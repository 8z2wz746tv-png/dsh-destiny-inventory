/**
 * `send-action.ts` itself, not a paraphrase of it.
 *
 * The first version of this file drove a local harness that re-implemented the
 * hook's ordering, and an injection into `send-action.ts` changed nothing — the
 * tests were passing on a copy. Everything below calls the real module with the
 * bridge mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/client/api', () => {
  class BridgeError extends Error {
    readonly code: string
    constructor(code: string, message: string) {
      super(message)
      this.name = 'BridgeError'
      this.code = code
    }
  }
  return { postAction: vi.fn(), BridgeError }
})

vi.mock('../src/client/settle-by-readback', () => ({ settleByReadBack: vi.fn() }))

const { postAction, BridgeError } = (await import('../src/client/api')) as unknown as {
  postAction: ReturnType<typeof vi.fn>
  BridgeError: new (code: string, message: string) => Error
}
const { settleByReadBack } = (await import('../src/client/settle-by-readback')) as unknown as {
  settleByReadBack: ReturnType<typeof vi.fn>
}
const { sendAction } = await import('../src/client/send-action')
const { PendingOps } = await import('../src/client/pending-ops')

import type { ActionRequest, ItemRow } from '../src/host/types'
import type { ReceiptHandle } from '../src/client/use-receipts'

const row = (id: string, locationKey: string): ItemRow =>
  ({
    id,
    instanceId: id,
    name: id,
    locationKey,
    characterId: null,
    placement: locationKey === 'vault' ? { kind: 'vault' } : { kind: 'inventory', characterId: locationKey },
    equipped: 'not_equipped',
  }) as ItemRow

const line = () => ({ rename: vi.fn(), progress: vi.fn(), settle: vi.fn() }) as unknown as ReceiptHandle

const move = (instanceId: string, to: string, from: string): ActionRequest => ({
  kind: 'move',
  instanceId,
  destination: to,
  from,
})

const receipt = { kind: 'move', applied: true, message: '已移动', summary: '已移到角色背包' }

function setup(rows: ItemRow[]) {
  let current = rows
  const pending = new PendingOps()
  return {
    pending,
    rows: () => current,
    at: (id: string) => current.find((entry) => entry.instanceId === id)?.locationKey,
    deps: {
      routePath: '/b',
      pending,
      patchRows: (change: (rows: ItemRow[]) => ItemRow[]) => {
        current = change(current)
      },
    },
  }
}

beforeEach(() => {
  postAction.mockReset()
  settleByReadBack.mockReset()
})

describe('sendAction against the real module', () => {
  it('accepts: the overlay stays, now as succeeded', async () => {
    const h = setup([row('a', 'warlock')])
    const op = h.pending.submit({
      eventId: 'e1', instanceId: 'a', action: 'move', target: 'warlock', from: 'vault', now: 1,
    })
    postAction.mockResolvedValue(receipt)
    await sendAction(h.deps, move('a', 'warlock', 'vault'), 'a', 'e1', line(), new AbortController().signal, 's')
    expect(h.pending.get('a')?.state).toBe('succeeded')
    expect(op.seq).toBe(1)
  })

  it('refuses by name: the row goes back to where the item still is', async () => {
    const h = setup([row('a', 'hunter')])
    h.pending.submit({ eventId: 'e1', instanceId: 'a', action: 'move', target: 'hunter', from: 'vault', now: 1 })
    postAction.mockRejectedValue(new BridgeError('DestinyNoRoomInDestination', 'no slots'))
    await sendAction(h.deps, move('a', 'hunter', 'vault'), 'a', 'e1', line(), new AbortController().signal, 's')
    expect(h.at('a')).toBe('vault')
    expect(h.pending.size).toBe(0)
    // A definite refusal needs no read-back: nothing happened.
    expect(settleByReadBack).not.toHaveBeenCalled()
  })

  it('does not repaint an item that a newer operation now owns', async () => {
    const h = setup([row('a', 'hunter')])
    h.pending.submit({ eventId: 'old', instanceId: 'a', action: 'move', target: 'warlock', from: 'vault', now: 1 })
    // A second drag took over before the first answered.
    h.pending.submit({ eventId: 'new', instanceId: 'a', action: 'move', target: 'hunter', from: 'warlock', now: 2 })
    postAction.mockRejectedValue(new BridgeError('DestinyNoRoomInDestination', 'no slots'))
    await sendAction(h.deps, move('a', 'warlock', 'vault'), 'a', 'old', line(), new AbortController().signal, 's')
    // Injectable violation: restore without checking ownership and the row snaps
    // back to the vault while the newer operation is still in flight.
    expect(h.at('a')).toBe('hunter')
    expect(h.pending.get('a')?.eventId).toBe('new')
  })

  it('cannot tell: keeps the item where the user put it and asks', async () => {
    const h = setup([row('a', 'hunter')])
    h.pending.submit({ eventId: 'e1', instanceId: 'a', action: 'move', target: 'hunter', from: 'vault', now: 1 })
    postAction.mockRejectedValue(new TypeError('Failed to fetch'))
    await sendAction(h.deps, move('a', 'hunter', 'vault'), 'a', 'e1', line(), new AbortController().signal, 's')
    expect(h.at('a')).toBe('hunter')
    expect(h.pending.get('a')?.state).toBe('verifying')
    expect(settleByReadBack).toHaveBeenCalledOnce()
  })

  it('leaves a lock alone: it does not move anything', async () => {
    const h = setup([row('a', 'hunter')])
    postAction.mockResolvedValue({ kind: 'lock', applied: true, message: '已锁定', summary: '' })
    await sendAction(
      h.deps,
      { kind: 'lock', instanceId: 'a', locked: true },
      'a',
      'e1',
      line(),
      new AbortController().signal,
      's',
    )
    expect(h.pending.size).toBe(0)
    expect(h.at('a')).toBe('hunter')
  })
})

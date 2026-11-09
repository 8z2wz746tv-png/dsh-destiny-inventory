/**
 * 三段加载的四条边界。
 *
 * 这些不是性能测试，是"界面会不会说谎"的测试：缓存替不替用户确认操作、旧的请求能不能
 * 覆盖新的、别人的账号能不能上屏。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/client/api', () => ({
  fetchAccount: vi.fn(),
  fetchCharacters: vi.fn(),
  fetchInventory: vi.fn(),
}))
vi.mock('../src/client/snapshot-db', () => ({
  readSnapshot: vi.fn(),
  writeSnapshot: vi.fn(),
}))
vi.mock('../src/client/restore-intents', () => ({ restoreIntents: vi.fn(async () => 0) }))

const api = (await import('../src/client/api')) as unknown as Record<string, ReturnType<typeof vi.fn>>
const db = (await import('../src/client/snapshot-db')) as unknown as Record<string, ReturnType<typeof vi.fn>>
const restoreMod = (await import('../src/client/restore-intents')) as unknown as {
  restoreIntents: ReturnType<typeof vi.fn>
}
const { loadInventory } = await import('../src/client/load-inventory')
const { PendingOps } = await import('../src/client/pending-ops')

import type { AccountIdentity, InventorySnapshot, PlayerProfileView } from '../src/host/types'

const steam: AccountIdentity = { membershipType: 3, membershipId: '4611686018492803873' }
const psn: AccountIdentity = { membershipType: 2, membershipId: '4611686018492803873' }

const snapshot = (account: AccountIdentity, over: Partial<InventorySnapshot> = {}): InventorySnapshot =>
  ({
    account,
    fetchedAt: 1_700_000_000_000,
    total: 1,
    items: [
      {
        instanceId: 'i1',
        locationKey: 'vault',
        characterId: null,
        placement: { kind: 'vault' },
        equipped: 'not_equipped',
      } as never,
    ],
    truncated: false,
    overlays: {} as never,
    ...over,
  })

const profile: PlayerProfileView = {
  displayName: '魅痕克星',
  membershipId: steam.membershipId,
  triumphScore: 12345,
  characters: [],
}

function harness() {
  const pending = new PendingOps()
  const painted: { items: InventorySnapshot['items']; characters: unknown[] }[] = []
  const errors: string[] = []
  return {
    pending,
    painted,
    errors,
    deps: {
      routePath: '/b',
      pending,
      onSnapshot: (snap: InventorySnapshot, p: PlayerProfileView) => {
        painted.push({ items: snap.items, characters: p.characters })
      },
      onError: (message: string) => {
        errors.push(message)
      },
    },
  }
}

const signal = () => new AbortController().signal

beforeEach(() => {
  vi.clearAllMocks()
  restoreMod.restoreIntents.mockResolvedValue(0)
  api.fetchAccount.mockResolvedValue(steam)
  api.fetchCharacters.mockResolvedValue(profile)
  api.fetchInventory.mockResolvedValue(snapshot(steam))
  db.readSnapshot.mockResolvedValue(null)
})

describe('cached paint', () => {
  it('is painted without confirming anything', async () => {
    const h = harness()
    // A drag is pending; the cache still shows the vault.
    h.pending.submit({
      // Clearly earlier than the load, so a cached read *could* have been seen as
      // evidence — which is exactly what must not happen.
      eventId: 'e1', instanceId: 'i1', action: 'move', target: 'warlock', from: 'vault', now: Date.now() - 1_000,
    })
    db.readSnapshot.mockResolvedValue(snapshot(steam))
    api.fetchInventory.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(snapshot(steam)), 40)),
    )

    const loading = loadInventory(h.deps, signal(), false)
    // The cached paint has landed, the network has not.
    await new Promise((resolve) => setTimeout(resolve, 20))

    // Injectable violation: reconcile the cached read and its "still in the vault"
    // becomes an observation that contradicts the drag — before Bungie ever asked.
    expect(h.pending.get('i1')?.state).toBe('submitted')
    expect(h.pending.get('i1')?.mismatches).toBe(0)
    // But the overlay still wins on screen.
    expect((h.painted[0]?.items[0] as { locationKey: string }).locationKey).toBe('warlock')
    await loading
  })

  it('is skipped when the user asked for a refresh', async () => {
    const h = harness()
    await loadInventory(h.deps, signal(), true)
    expect(db.readSnapshot).not.toHaveBeenCalled()
  })
})

describe('the network answer', () => {
  it('is the only one allowed to confirm a pending operation', async () => {
    const h = harness()
    h.pending.submit({
      // A second before the load: a read issued in the same millisecond cannot
      // verify an operation (see pending-ops), so the clock must be clearly later.
      eventId: 'e1', instanceId: 'i1', action: 'move', target: 'warlock', from: 'vault', now: Date.now() - 1_000,
    })
    api.fetchInventory.mockResolvedValue(
      snapshot(steam, {
        items: [
          {
            instanceId: 'i1',
            locationKey: 'warlock',
            characterId: 'warlock',
            placement: { kind: 'inventory', characterId: 'warlock' },
            equipped: 'not_equipped',
          } as never,
        ],
      }),
    )
    await loadInventory(h.deps, signal(), false)
    expect(h.pending.size).toBe(0)
  })

  it('is written to the cache under the account it belongs to', async () => {
    const h = harness()
    await loadInventory(h.deps, signal(), false)
    expect(db.writeSnapshot).toHaveBeenCalledWith(steam, expect.objectContaining({ account: steam }))
  })
})

describe('account and load identity', () => {
  it('refuses rows from a different account than the one it asked about', async () => {
    const h = harness()
    api.fetchInventory.mockResolvedValue(snapshot(psn))
    await loadInventory(h.deps, signal(), false)
    // Injectable violation: paint anyway and one account's vault lands in another's
    // screen, and its cache.
    expect(h.painted).toHaveLength(0)
    expect(h.errors[0]).toContain('切换')
    expect(db.writeSnapshot).not.toHaveBeenCalled()
  })

  it('lets a later load win when an earlier one finishes last', async () => {
    const h = harness()
    let releaseSlow: (value: InventorySnapshot) => void = () => {}
    api.fetchAccount
      .mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve(steam), 20)))
      .mockResolvedValue(steam)
    api.fetchInventory
      .mockImplementationOnce(() => new Promise((resolve) => { releaseSlow = resolve }))
      .mockResolvedValue(snapshot(steam, { total: 99 }))

    const slow = loadInventory(h.deps, signal(), false)
    await new Promise((resolve) => setTimeout(resolve, 30))
    const fast = loadInventory(h.deps, signal(), false)
    await fast
    const afterFast = h.painted.length

    releaseSlow(snapshot(steam, { total: 1 }))
    await slow
    // Injectable violation: drop the loadId check and the slow load repaints the
    // screen with older data right after a successful refresh.
    expect(h.painted.length).toBe(afterFast)
  })

  it('retries once before reporting a failure', async () => {
    const h = harness()
    // The host may still be starting when a page opens; that is not an error yet.
    api.fetchAccount.mockRejectedValueOnce(new Error('fetch failed')).mockResolvedValue(steam)
    await loadInventory(h.deps, signal(), false)
    expect(h.errors).toHaveLength(0)
    expect(h.painted.length).toBeGreaterThan(0)
  })

  it('reports an identity failure instead of painting a default account', async () => {
    const h = harness()
    api.fetchAccount.mockRejectedValue(new Error('token expired'))
    await loadInventory(h.deps, signal(), false)
    expect(h.painted).toHaveLength(0)
    // Injectable violation: drop the second attempt and a page opened during host
    // startup shows an error the user must clear by hand.
    expect(api.fetchAccount).toHaveBeenCalledTimes(2)
    expect(h.errors[0]).toContain('token expired')
    expect(db.readSnapshot).not.toHaveBeenCalled()
  })

  it('still paints the rows when only the character list fails', async () => {
    const h = harness()
    // Seen live: the host was still starting, `/characters` answered 502, and the
    // whole load failed even though the items themselves were fine.
    api.fetchCharacters.mockRejectedValue(new Error('502 Bad Gateway'))
    await loadInventory(h.deps, signal(), false)
    expect(h.errors).toHaveLength(0)
    expect(h.painted).toHaveLength(1)
    expect(h.painted[0]?.characters).toEqual([])
    expect(db.writeSnapshot).toHaveBeenCalled()
  })

  it('still fails when the items themselves fail', async () => {
    const h = harness()
    api.fetchInventory.mockRejectedValue(new Error('502 Bad Gateway'))
    await loadInventory(h.deps, signal(), false)
    // Injectable violation: swallow this too and the panel shows rows that were
    // never refreshed, with no indication anything went wrong.
    expect(h.painted).toHaveLength(0)
    expect(h.errors).toHaveLength(1)
  })
})

describe('the restore step inside the load', () => {
  it('repaints from the same cached rows once an intent comes back', async () => {
    const h = harness()
    db.readSnapshot.mockResolvedValue(snapshot(steam))
    restoreMod.restoreIntents.mockImplementation(async (_path, pending) => {
      pending.restore({
        entryId: 'restore:1:i1',
        instanceId: 'i1',
        target: 'warlock',
        from: 'vault',
        submittedAt: Date.now() - 1_000,
        expiresAt: Date.now() + 60_000,
      })
      return 1
    })
    api.fetchInventory.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(snapshot(steam)), 30)),
    )

    const loading = loadInventory(h.deps, signal(), false)
    await new Promise((resolve) => setTimeout(resolve, 15))
    // Cached paint first, then the restored one — both before the network answers.
    expect(h.painted).toHaveLength(2)
    expect((h.painted[0]?.items[0] as { locationKey: string }).locationKey).toBe('vault')
    expect((h.painted[1]?.items[0] as { locationKey: string }).locationKey).toBe('warlock')
    await loading
  })

  it('does not repaint when nothing came back', async () => {
    const h = harness()
    db.readSnapshot.mockResolvedValue(snapshot(steam))
    api.fetchInventory.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(snapshot(steam)), 20)),
    )
    const loading = loadInventory(h.deps, signal(), false)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(h.painted).toHaveLength(1)
    await loading
  })

  it('never restores on a forced refresh', async () => {
    const h = harness()
    await loadInventory(h.deps, signal(), true)
    expect(restoreMod.restoreIntents).not.toHaveBeenCalled()
  })
})

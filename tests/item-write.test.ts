import { describe, expect, it, vi } from 'vitest'
import { runItemWrite } from '../src/host/item-write'
import { BridgeFault } from '../src/host/http'
import { BungieApiError } from '../src/bungie/client'
import { toItemWrite } from '../src/bungie/write'
import type { ProfileSnapshot } from '../src/bungie/profile'

/**
 * Writes now run in our own plane, so this covers the translation from the
 * bridge's request shape and the snapshot lookups each action needs.
 */
const snapshot = (items: { instanceId: string; itemHash: number; characterId: string | null }[]) =>
  ({
    items,
    characters: [
      { characterId: 'char-hunter', classType: 1, lastPlayed: '2026-11-01T00:00:00Z' },
      { characterId: 'char-warlock', classType: 2, lastPlayed: '2026-10-01T00:00:00Z' },
    ],
  }) as unknown as ProfileSnapshot

/** Capacity 10 / occupancy whatever the test passes, so the room check is inert unless tested. */
const lookup = (itemCount = 99) => () => ({
  bucket: () => ({ hash: 1, name: '威能武器', category: null, location: 0, itemCount, hasTransferDestination: false }),
  item: (hash: number) => ({ name: `物品${hash}`, tierType: 5 }),
}) as never

function deps(
  stub: ReturnType<typeof vi.fn>,
  items: Array<Record<string, unknown>> = [{ instanceId: 'i1', itemHash: 555, characterId: 'hunter' }],
  itemCount = 99,
) {
  return {
    client: { post: stub } as never,
    target: { membershipType: 3, membershipId: '42' },
    snapshot: async () => snapshot(items as never),
    definitions: lookup(itemCount),
    invalidate: vi.fn(),
  }
}

describe('toItemWrite', () => {
  it('banks a move whose destination is the vault', () => {
    expect(toItemWrite({ kind: 'move', instanceId: 'i1', destination: 'vault' })).toEqual({
      kind: 'move',
      instanceId: 'i1',
      characterId: undefined,
    })
  })

  it('keeps the destination character for a move onto a character', () => {
    expect(toItemWrite({ kind: 'move', instanceId: 'i1', destination: 'warlock' })).toEqual({
      kind: 'move',
      instanceId: 'i1',
      characterId: 'warlock',
    })
  })

  it('carries the requested lock state', () => {
    expect(toItemWrite({ kind: 'lock', instanceId: 'i1', locked: true })).toEqual({
      kind: 'lock',
      instanceId: 'i1',
      locked: true,
    })
  })
})

describe('runItemWrite', () => {
  it('equips through the platform without touching the MCP', async () => {
    const post = vi.fn(async () => ({}))
    const d = deps(post)
    const summary = await runItemWrite(d, { kind: 'equip', instanceId: 'i1', characterId: 'hunter' })
    expect(summary).toBe('已装备')
    expect(post).toHaveBeenCalledOnce()
    expect(d.invalidate).toHaveBeenCalledOnce()
  })

  it('resolves the owner when a lock names no character', async () => {
    const post = vi.fn(async () => ({}))
    const d = deps(post)
    await runItemWrite(d, { kind: 'lock', instanceId: 'i1', locked: false })
    const body = (post.mock.calls[0] as unknown as [string, { characterId: string }])[1]
    expect(body.characterId).toBe('hunter')
  })

  it('resolves a location key to the character id Bungie wants', async () => {
    const post = vi.fn(async () => ({}))
    const d = deps(post)
    await runItemWrite(d, { kind: 'move', instanceId: 'i1', characterId: 'hunter', from: 'vault' })
    const body = (post.mock.calls[0] as unknown as [string, { characterId: string }])[1]
    // `hunter` is not an id; sending it comes back as "unexpected problem decoding"
    expect(body.characterId).toBe('char-hunter')
  })

  it('fails on an instance the snapshot does not know, instead of guessing', async () => {
    const post = vi.fn(async () => ({}))
    await expect(
      runItemWrite(deps(post), { kind: 'move', instanceId: 'missing' }),
    ).rejects.toThrow('这件物品不在当前快照里')
    expect(post).not.toHaveBeenCalled()
  })

  it('banks against the position the panel reported, not the snapshot', async () => {
    const post = vi.fn(async () => ({}))
    // The snapshot still says the hunter: it was read before the write this one
    // queued behind, and Bungie syncs that write seconds later.
    const d = deps(post, [{ instanceId: 'i1', itemHash: 555, characterId: 'char-hunter' }])
    await runItemWrite(d, { kind: 'move', instanceId: 'i1', from: 'warlock' })
    const body = (post.mock.calls[0] as unknown as [string, { characterId: string; transferToVault: boolean }])[1]
    expect(body.transferToVault).toBe(true)
    expect(body.characterId).toBe('char-warlock')
  })

  it('refuses to bank without knowing where the item is', async () => {
    const post = vi.fn(async () => ({}))
    // No `from` means the caller left the answer to a snapshot that may be stale.
    // Guessing is worse than failing: say what is missing.
    await expect(runItemWrite(deps(post), { kind: 'move', instanceId: 'i1' })).rejects.toThrow('from')
    expect(post).not.toHaveBeenCalled()
  })

  it('routes a character-to-character move through the vault', async () => {
    const post = vi.fn(async () => ({}))
    const d = deps(post, [{ instanceId: 'i1', itemHash: 555, characterId: 'char-hunter' }])
    const summary = await runItemWrite(d, {
      kind: 'move',
      instanceId: 'i1',
      characterId: 'warlock',
      from: 'hunter',
    })
    // Injectable violation: send one transfer and Bungie answers 1623
    // `DestinyItemNotFound`, which reads like missing data and is not.
    expect(post).toHaveBeenCalledTimes(2)
    const calls = post.mock.calls as unknown as [string, { transferToVault: boolean; characterId: string }][]
    expect(calls[0]?.[1].transferToVault).toBe(true)
    expect(calls[0]?.[1].characterId).toBe('char-hunter')
    expect(calls[1]?.[1].transferToVault).toBe(false)
    expect(calls[1]?.[1].characterId).toBe('char-warlock')
    expect(summary).toContain('经仓库中转')
  })

  it('takes out of the vault in a single hop', async () => {
    const post = vi.fn(async () => ({}))
    await runItemWrite(deps(post), { kind: 'move', instanceId: 'i1', characterId: 'hunter', from: 'vault' })
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('names the store that is full instead of relaying the English', async () => {
    const post = vi.fn(async () => {
      throw new BungieApiError(400, 1642, 'DestinyNoRoomInDestination', 'There are no item slots available')
    })
    const d = deps(post, [{ instanceId: 'i1', itemHash: 555, characterId: 'char-hunter' }])
    // Straight out of the vault: one hop, so the warlock really is the destination
    // that ran out of room.
    const failure = await runItemWrite(d, {
      kind: 'move',
      instanceId: 'i1',
      characterId: 'warlock',
      from: 'vault',
    }).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(BridgeFault)
    const fault = failure as BridgeFault
    // Injectable violation: pass the upstream sentence through and the player is
    // told nothing about which store is full or what to do.
    expect(fault.message).toContain('术士')
    expect(fault.message).toContain('腾出一个位置')
    // The stable code survives, so `classifyFailure` still reads a definite refusal.
    expect(fault.code).toBe('DestinyNoRoomInDestination')
  })

  it('blames the vault only as a waypoint when a transfer is character to character', async () => {
    const post = vi.fn(async () => {
      throw new BungieApiError(400, 1642, 'DestinyNoRoomInDestination', 'There are no item slots available')
    })
    const d = deps(post, [{ instanceId: 'i1', itemHash: 555, characterId: 'char-hunter' }])
    const failure = await runItemWrite(d, {
      kind: 'move',
      instanceId: 'i1',
      characterId: 'warlock',
      from: 'hunter',
    }).catch((error: unknown) => error)
    const message = (failure as BridgeFault).message
    // Injectable violation: say "术士 is full" here and the player is sent to empty
    // a character that is fine, when the blocker is the vault waypoint.
    expect(message).toContain('仓库')
    expect(message).toContain('中转')
  })

  it('says the vault is full when that is the destination', async () => {
    const post = vi.fn(async () => {
      throw new BungieApiError(400, 1642, 'DestinyNoRoomInDestination', 'There are no item slots available')
    })
    const d = deps(post, [{ instanceId: 'i1', itemHash: 555, characterId: 'char-hunter' }])
    const failure = await runItemWrite(d, { kind: 'move', instanceId: 'i1', from: 'hunter' }).catch(
      (error: unknown) => error,
    )
    expect((failure as BridgeFault).message).toContain('仓库')
  })

  it('names the item it moved aside on a character-to-character hop', async () => {
    const post = vi.fn(async () => ({}))
    const d = deps(post, [
      { instanceId: 'i1', itemHash: 555, characterId: 'char-hunter' },
      // A full warlock slot: one of these has to leave before i1 can arrive, so it
      // must look like a real movable row (source, transfer flag, not equipped).
      { instanceId: 'w1', itemHash: 555, characterId: 'char-warlock', source: 'character-inventory', transferStatus: 0, equipped: false, locked: false },
      { instanceId: 'w2', itemHash: 555, characterId: 'char-warlock', source: 'character-inventory', transferStatus: 0, equipped: false, locked: false },
    ], 2)
    const summary = await runItemWrite(d, {
      kind: 'move', instanceId: 'i1', characterId: 'warlock', from: 'hunter',
    })
    // Injectable violation: return the plain two-hop sentence and the player never
    // learns which of their items left the character to make room.
    expect(summary).toContain('经仓库中转')
    expect(summary).toContain('先腾出')
  })
})

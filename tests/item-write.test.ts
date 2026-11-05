import { describe, expect, it, vi } from 'vitest'
import { runItemWrite } from '../src/host/item-write'
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

function deps(stub: ReturnType<typeof vi.fn>, items = [{ instanceId: 'i1', itemHash: 555, characterId: 'hunter' }]) {
  return {
    client: { post: stub } as never,
    target: { membershipType: 3, membershipId: '42' },
    snapshot: async () => snapshot(items),
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
    await runItemWrite(d, { kind: 'move', instanceId: 'i1', characterId: 'hunter' })
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
})

/**
 * The read-back that decides whether a failed write actually landed.
 *
 * It reads the profile now, because `Destiny2/.../Item/{id}/` never returned a
 * characterId at all — every read-back said "gone", and the panel fell back to
 * trusting its own optimistic guess. These pin the translation from a snapshot row
 * to the class key the panel speaks.
 */
import { describe, expect, it } from 'vitest'
import { resolveItemState } from '../src/host/item-state-route'
import type { ProfileSnapshot } from '../src/bungie/profile'

/** A snapshot with one item and the three characters, in Bungie's class order. */
function snapshot(
  item: { instanceId: string; location: string; equipped: boolean } | null,
): ProfileSnapshot {
  return {
    items: item === null ? [] : [{ ...item, itemHash: 1, bucketHash: 1, key: item.instanceId }],
    characters: [
      { characterId: 'char-titan', classType: 0 },
      { characterId: 'char-hunter', classType: 1 },
      { characterId: 'char-warlock', classType: 2 },
    ],
  } as unknown as ProfileSnapshot
}

describe('resolveItemState', () => {
  it('reports the vault for an account-level row', () => {
    expect(resolveItemState(snapshot({ instanceId: 'i1', location: 'vault', equipped: false }), 'i1')).toEqual({
      location: 'vault',
      equipped: false,
    })
  })

  it('reports the postmaster as the postmaster, not as the vault', () => {
    expect(
      resolveItemState(snapshot({ instanceId: 'i1', location: 'postmaster', equipped: false }), 'i1'),
    ).toEqual({ location: 'postmaster', equipped: false })
  })

  it('translates a character id into the class key the panel uses', () => {
    // The snapshot stores the character id for anything a character holds; the
    // wire speaks `hunter` / `warlock` / `titan`.
    expect(
      resolveItemState(snapshot({ instanceId: 'i1', location: 'char-warlock', equipped: false }), 'i1'),
    ).toEqual({ location: 'warlock', equipped: false })
  })

  it('keeps the equipped flag for a worn item', () => {
    expect(
      resolveItemState(snapshot({ instanceId: 'i1', location: 'char-hunter', equipped: true }), 'i1'),
    ).toEqual({ location: 'hunter', equipped: true })
  })

  it('returns null only when the item really is not in the profile', () => {
    expect(resolveItemState(snapshot(null), 'i1')).toBeNull()
  })
})

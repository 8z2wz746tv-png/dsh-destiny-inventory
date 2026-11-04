import { describe, expect, it } from 'vitest'
import { itemKey, parseProfile } from '../src/bungie/profile'
import type { RawProfileResponse } from '../src/bungie/profile'

/** One account: two characters, a vault, one worn weapon, one misleading subclass. */
function fixture(): RawProfileResponse {
  return {
    profile: {
      data: {
        userInfo: { displayName: 'OneTop丶Husky#6641', membershipId: '4611686018492803873' },
        inventory: { items: [] },
      },
    },
    profileInventory: {
      data: {
        items: [
          { itemHash: 1216319404, itemInstanceId: '6917529431004309171', bucketHash: 1498876634, quantity: 1 },
          { itemHash: 0, itemInstanceId: '0', bucketHash: 138197802, quantity: 999 },
          { itemHash: 777, itemInstanceId: 'pm-1', bucketHash: 215593132, quantity: 1, characterId: 'c1' },
          { itemHash: 778, itemInstanceId: 'engram-1', bucketHash: 375726501, quantity: 1 },
        ],
      },
    },
    characters: {
      data: {
        c1: { characterId: 'c1', classType: 1, light: 545, emblemPath: '/img/h.jpg', dateLastPlayed: '2026-10-31T14:03:12Z' },
        c2: { characterId: 'c2', classType: 2, light: 547, emblemPath: '/img/w.jpg', dateLastPlayed: '2026-10-31T10:37:13Z' },
      },
    },
    characterInventories: {
      data: {
        c1: {
          items: [
            // A subclass sits in the inventory yet reports isEquipped upstream.
            { itemHash: 3402763579, itemInstanceId: 'subclass-1', bucketHash: 3284755031, quantity: 1 },
          ],
        },
      },
    },
    characterEquipment: {
      data: {
        c1: {
          items: [{ itemHash: 2905188646, itemInstanceId: '6917530019662353850', bucketHash: 2465295065, quantity: 1 }],
        },
      },
    },
    itemComponents: {
      instances: {
        data: {
          '6917530019662353850': { isEquipped: true, primaryStat: { value: 550 } },
          'subclass-1': { isEquipped: true },
          '6917529431004309171': { isEquipped: false, primaryStat: { value: 550 } },
        },
      },
    },
  }
}

describe('parseProfile', () => {
  it('reads characters in class order', () => {
    const snapshot = parseProfile(fixture())
    expect(snapshot.characters.map((c) => c.characterId)).toEqual(['c1', 'c2'])
    expect(snapshot.characters[0]).toMatchObject({ classType: 1, light: 545 })
    expect(snapshot.displayName).toBe('OneTop丶Husky#6641')
  })

  it('marks only equipment-component items as equipped', () => {
    const snapshot = parseProfile(fixture())
    const worn = snapshot.items.find((item) => item.instanceId === '6917530019662353850')
    const subclass = snapshot.items.find((item) => item.instanceId === 'subclass-1')
    expect(worn?.equipped).toBe(true)
    // `isEquipped` is true upstream, but it is not in component 205: not worn.
    expect(subclass?.upstreamEquipped).toBe(true)
    expect(subclass?.equipped).toBe(false)
  })

  it('indexes the equipped item per character and bucket', () => {
    const snapshot = parseProfile(fixture())
    expect(snapshot.equippedByBucket.get('c1:2465295065')).toBe('6917530019662353850')
    expect(snapshot.equippedByBucket.has('c2:2465295065')).toBe(false)
  })

  it('places account-wide items in the vault and character items on their character', () => {
    const snapshot = parseProfile(fixture())
    const vaultItem = snapshot.items.find((item) => item.instanceId === '6917529431004309171')
    expect(vaultItem).toMatchObject({ location: 'vault', characterId: null, power: 550 })
    const carried = snapshot.items.find((item) => item.instanceId === 'subclass-1')
    expect(carried).toMatchObject({ location: 'c1', characterId: 'c1' })
  })

  it('keys stackables by hash and bucket because their instance id is "0"', () => {
    const snapshot = parseProfile(fixture())
    const stackable = snapshot.items.find((item) => item.instanceId === '0')
    expect(stackable?.key).toBe('0:138197802')
    expect(stackable?.quantity).toBe(999)
  })

  it('falls back to the account inventory when component 102 is absent', () => {
    const response = fixture()
    delete response.profileInventory
    response.profile!.data!.inventory = {
      items: [{ itemHash: 42, itemInstanceId: 'vault-1', bucketHash: 1, quantity: 1 }],
    }
    const snapshot = parseProfile(response)
    expect(snapshot.items.find((item) => item.instanceId === 'vault-1')?.location).toBe('vault')
  })

  it('takes postmaster rows out of the vault and keeps their owner', () => {
    const snapshot = parseProfile(fixture())
    const lost = snapshot.items.find((item) => item.instanceId === 'pm-1')
    expect(lost?.source).toBe('postmaster')
    expect(lost?.location).toBe('postmaster')
    expect(lost?.characterId).toBe('c1')
  })

  it('leaves engrams in the vault: they address no character', () => {
    const snapshot = parseProfile(fixture())
    const engram = snapshot.items.find((item) => item.instanceId === 'engram-1')
    expect(engram?.source).toBe('profile')
    expect(engram?.location).toBe('vault')
    expect(engram?.characterId).toBeNull()
  })

  it('records which characters actually returned equipment', () => {
    const snapshot = parseProfile(fixture())
    expect(snapshot.equipmentState).toBe('loaded')
    // Only c1 has a 205 entry: c2's items must not be judged as "carried".
    expect([...snapshot.equippedCharacters]).toEqual(['c1'])
  })

  it('counts a character with an empty equipment list as loaded', () => {
    // The set is built from the component's keys, not from the rows: a character
    // that answered with zero items has answered, and its carried items are
    // simply not equipped.
    const response = fixture()
    response.characterEquipment = { data: { c1: { items: [] }, c2: { items: [] } } }
    const snapshot = parseProfile(response)
    expect(snapshot.equipmentState).toBe('loaded')
    expect([...snapshot.equippedCharacters].sort()).toEqual(['c1', 'c2'])
    expect(snapshot.equippedByBucket.size).toBe(0)
  })

  it('omits a character whose key is absent from 205', () => {
    const response = fixture()
    response.characterEquipment = { data: { c1: { items: [] } } }
    expect([...parseProfile(response).equippedCharacters]).toEqual(['c1'])
  })

  it('reports equipment as unavailable when component 205 is absent', () => {
    const response = fixture()
    delete response.characterEquipment
    const snapshot = parseProfile(response)
    expect(snapshot.equipmentState).toBe('unavailable')
    expect(snapshot.equippedCharacters.size).toBe(0)
  })

  it('survives an empty profile without inventing rows', () => {
    const snapshot = parseProfile({})
    expect(snapshot.items).toEqual([])
    expect(snapshot.characters).toEqual([])
    expect(snapshot.equippedByBucket.size).toBe(0)
  })
})

describe('itemKey', () => {
  it('uses the instance id when there is one', () => {
    expect(itemKey({ itemInstanceId: '123', itemHash: 9, bucketHash: 1 })).toBe('123')
  })

  it('falls back to hash and bucket for stackables', () => {
    expect(itemKey({ itemInstanceId: '0', itemHash: 9, bucketHash: 1 })).toBe('9:1')
    expect(itemKey({ itemHash: 9, bucketHash: 1 })).toBe('9:1')
  })
})

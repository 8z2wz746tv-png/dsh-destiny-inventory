/**
 * Read one item's current location, straight from Bungie.
 *
 * Used after a failed write: a failed response does not mean the write did not
 * happen (Bungie syncs 3-10 s behind), so the only trustworthy answer comes from
 * asking about that one item. Deliberately not a full profile read — the panel
 * holds ~1900 items and this runs on an error path.
 */
import type { BungieClient } from './client'

/** Where Bungie says an item is right now. */
export interface ItemState {
  /** The character holding it, or `null` when it is in the vault. */
  characterId: string | null
  /** True when it sits in a character's equipment slot. */
  equipped: boolean
  /** Player lock flag. */
  locked: boolean
}

/**
 * Ask Bungie where one instance is.
 * @param client - platform client.
 * @param membershipType - platform (3 = Steam).
 * @param membershipId - Destiny membership id.
 * @param instanceId - the item instance.
 * @returns its state, or `null` when Bungie no longer has it.
 * @throws BungieApiError on an upstream failure.
 */
export async function readItemState(
  client: BungieClient,
  membershipType: number,
  membershipId: string,
  instanceId: string,
): Promise<ItemState | null> {
  const response = await client.get<{
    item?: { data?: { itemHash?: number; state?: number; bucketHash?: number } }
    characterId?: string
    itemComponents?: { instances?: { data?: Record<string, { isEquipped?: boolean }> } }
  }>(
    // `components=300` carries `isEquipped`; 104 is the item itself.
    `/Destiny2/${membershipType}/Profile/${membershipId}/Item/${instanceId}/`,
    { components: '104,300' },
  )
  const item = response.item?.data
  if (item === undefined) return null
  return {
    characterId:
      response.characterId === undefined || response.characterId === '0' ? null : response.characterId,
    equipped: response.itemComponents?.instances?.data?.[instanceId]?.isEquipped === true,
    // Bit 1 of `state` is Locked.
    locked: ((item.state ?? 0) & 1) === 1,
  }
}

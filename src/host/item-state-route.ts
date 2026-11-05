/**
 * Resolve one item's live location for the panel.
 *
 * Lives outside `bungie-service.ts` so that file stays inside its ceiling; the
 * service still owns the client and the membership lookup.
 */
import { readItemState } from '../bungie/item-state'
import type { BungieClient } from '../bungie/client'
import type { DestinyMembership } from '../bungie/memberships'
import type { ProfileSnapshot } from '../bungie/profile'
import { CLASS_LOCATION } from './dto'

/**
 * Ask Bungie where one item is right now.
 *
 * The error path after a failed write: a failed response does not mean the write
 * did not land, so the panel takes Bungie's answer instead of rolling back.
 * @param client - platform client.
 * @param membership - account identity.
 * @param snapshot - current profile, for the class lookup.
 * @param instanceId - the item instance.
 * @returns its location key and equipped flag, or `null` when it is gone.
 */
export async function resolveItemState(
  client: BungieClient,
  membership: DestinyMembership,
  snapshot: ProfileSnapshot,
  instanceId: string,
): Promise<{ location: string; equipped: boolean } | null> {
  const state = await readItemState(client, membership.membershipType, membership.membershipId, instanceId)
  if (state === null) return null
  if (state.characterId === null) return { location: 'vault', equipped: false }
  const character = snapshot.characters.find((entry) => entry.characterId === state.characterId)
  return { location: CLASS_LOCATION[character?.classType ?? 0] ?? 'vault', equipped: state.equipped }
}

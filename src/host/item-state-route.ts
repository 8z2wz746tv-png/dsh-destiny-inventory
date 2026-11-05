/**
 * Resolve one item's live location for the panel.
 *
 * The error path after a failed write: a failed response does not mean the write
 * did not land, so the panel takes Bungie's answer instead of rolling back.
 *
 * It used to ask `Destiny2/.../Item/{id}/`, which looked like the cheap answer and
 * was not an answer at all: that endpoint returns component data for the instance
 * and **never a characterId**, so every call came back "item is gone". The single
 * reliable source for "where is it" is the profile, which is why the caller forces
 * a fresh read rather than reusing the cached snapshot.
 */
import type { ProfileSnapshot } from '../bungie/profile'
import { CLASS_LOCATION } from './dto'

/**
 * Read one item's position out of a profile snapshot.
 * @param snapshot - a snapshot read *after* the write in question.
 * @param instanceId - the item instance.
 * @returns its location key and equipped flag, or `null` when it is gone.
 */
export function resolveItemState(
  snapshot: ProfileSnapshot,
  instanceId: string,
): { location: string; equipped: boolean } | null {
  const item = snapshot.items.find((entry) => entry.instanceId === instanceId)
  if (item === undefined) return null
  // In the snapshot `location` is `vault` / `postmaster`, or the **character id**
  // for anything a character holds. The panel speaks class keys.
  if (item.location === 'vault' || item.location === 'postmaster') {
    return { location: item.location, equipped: false }
  }
  const character = snapshot.characters.find((entry) => entry.characterId === item.location)
  if (character === undefined) return { location: item.location, equipped: item.equipped }
  return { location: CLASS_LOCATION[character.classType] ?? item.location, equipped: item.equipped }
}

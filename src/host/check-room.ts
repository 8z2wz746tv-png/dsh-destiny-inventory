/**
 * Does the destination have a slot for this item?
 *
 * Bungie's answer when it does not is `There are no item slots available to
 * transfer this item` — accurate and useless: it names neither the bucket nor how
 * full it is. The capacity is in the Manifest (`DestinyInventoryBucketDefinition`
 * `itemCount`) and the occupancy is in the snapshot we already hold, so the answer
 * can be given before spending a round trip.
 *
 * The count includes equipped items: the capacity covers the whole bucket, not just
 * the nine carried slots. A warlock showing 9 heavy weapons and carrying a 10th in
 * the power slot is full at 10/10, which is exactly the case that prompted this.
 */
import type { DefinitionLookup } from '../bungie/lookup'
import type { ProfileSnapshot } from '../bungie/profile'

/**
 * Throw when the destination bucket cannot take one more item.
 * @param definitions - Manifest lookups, for capacity and the bucket's name.
 * @param snapshot - current profile, for occupancy.
 * @param characterId - the character the item is going to.
 * @param bucketHash - the item's classification bucket.
 * @param storeLabel - how the player names that character, for the message.
 */
export async function hasRoom(
  definitions: () => DefinitionLookup,
  snapshot: () => Promise<ProfileSnapshot>,
  characterId: string,
  bucketHash: number,
): Promise<boolean | null> {
  const bucket = definitions().bucket(bucketHash)
  const capacity = bucket?.itemCount ?? null
  // No capacity published: say nothing rather than guess a number.
  if (capacity === null || capacity <= 0) return null
  const current = await snapshot()
  const occupied = current.items.filter(
    (item) => item.characterId === characterId && item.bucketHash === bucketHash,
  ).length
  return occupied < capacity
}

/** The bucket's localized name, for a receipt. */
export function bucketName(definitions: () => DefinitionLookup, bucketHash: number): string {
  return definitions().bucket(bucketHash)?.name ?? '这个'
}

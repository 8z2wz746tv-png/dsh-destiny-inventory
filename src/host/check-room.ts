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
import { BridgeFault } from './http'

/**
 * Throw when the destination bucket cannot take one more item.
 * @param definitions - Manifest lookups, for capacity and the bucket's name.
 * @param snapshot - current profile, for occupancy.
 * @param characterId - the character the item is going to.
 * @param bucketHash - the item's classification bucket.
 * @param storeLabel - how the player names that character, for the message.
 */
export async function ensureRoom(
  definitions: () => DefinitionLookup,
  snapshot: () => Promise<ProfileSnapshot>,
  characterId: string,
  bucketHash: number,
  storeLabel: string,
): Promise<void> {
  const bucket = definitions().bucket(bucketHash)
  const capacity = bucket?.itemCount ?? null
  // No capacity published: say nothing rather than guess a number.
  if (capacity === null || capacity <= 0) return
  const current = await snapshot()
  const occupied = current.items.filter(
    (item) => item.characterId === characterId && item.bucketHash === bucketHash,
  ).length
  if (occupied < capacity) return
  throw new BridgeFault(
    'DestinyNoRoomInDestination',
    `${storeLabel}的${bucket?.name ?? '这个'}槽已经满了（${occupied}/${capacity}）：先在游戏里腾出一格，或者把里面的一件拖到别处`,
  )
}

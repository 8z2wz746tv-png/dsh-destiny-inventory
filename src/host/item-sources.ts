/**
 * Profile rows → the fields a wire row is built from.
 *
 * Its own file because it is one narrow job and `dto.ts` is at its ceiling; the
 * service consumes the result and never looks inside.
 */
import type { ProfileItem } from '../bungie/profile'
import type { ItemSource } from './dto'

/**
 * Keep only what `toItemRows` reads.
 * @param items - rows straight from the profile read.
 */
export function toItemSources(items: ProfileItem[]): ItemSource[] {
  return items.map((item) => ({
    key: item.key,
    instanceId: item.instanceId,
    itemHash: item.itemHash,
    slotHash: item.slotHash,
    quantity: item.quantity,
    source: item.source,
    characterId: item.characterId,
    locked: item.locked,
    power: item.power,
    gearTier: item.gearTier ?? 0,
    crafted: item.crafted,
    masterwork: item.masterwork,
  }))
}

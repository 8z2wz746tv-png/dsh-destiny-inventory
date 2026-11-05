/**
 * Build one `ProfileItem` from a raw row plus where it was found.
 *
 * Split from `profile.ts` so that file stays inside its ceiling; the parsing of
 * the profile response lives there, the per-row assembly lives here.
 */
import type { ProfileItem, ItemLocation, RawItem, RawInstance } from './profile'
import type { RawPlugObjectives, RawReusable, RawSockets, RawStats } from './sockets'
import { readObjectives, readSockets } from './sockets'
import { itemKey } from './profile'
import { readStats } from './sockets'
import { num, str } from './values'

/** The component rows one item needs, keyed by instance id. */
export interface ProfileParts {
  instances: Record<string, RawInstance>
  socketData: Record<string, RawSockets | undefined>
  reusableData: Record<string, RawReusable | undefined>
  objectiveData: Record<string, RawPlugObjectives | undefined>
  statData: Record<string, RawStats | undefined>
}

export function toItem(
  raw: RawItem,
  source: ProfileItem['source'],
  location: ItemLocation,
  characterId: string | null,
  parts: ProfileParts,
): ProfileItem {
  const { instances, socketData, reusableData, objectiveData, statData } = parts
  const instanceId = str(raw.itemInstanceId, '0')
  const instance = instanceId === '' || instanceId === '0' ? undefined : instances[instanceId]
  const socketRow = instanceId === '' || instanceId === '0' ? undefined : socketData[instanceId]
  const reusableRow = instanceId === '' || instanceId === '0' ? undefined : reusableData[instanceId]
  return {
    key: itemKey(raw),
    instanceId,
    itemHash: num(raw.itemHash),
    bucketHash: num(raw.bucketHash),
    quantity: num(raw.quantity, 1),
    source,
    location,
    characterId,
    slotHash: source === 'equipment' ? num(raw.bucketHash) : null,
    equipped: source === 'equipment',
    upstreamEquipped: instance?.isEquipped === true,
    locked: (num(raw.state) & 1) === 1,
    crafted: (num(raw.state) & 8) === 8,
    masterwork: (num(raw.state) & 4) === 4,
    enhanced: (num(raw.state) & 32) === 32,
    gearTier: typeof instance?.gearTier === 'number' ? instance.gearTier : null,
    itemLevel: typeof instance?.itemLevel === 'number' ? instance.itemLevel : null,
    stats: readStats(statData[instanceId]),
    plugObjectives: readObjectives(objectiveData[instanceId]),
    power: typeof instance?.primaryStat?.value === 'number' ? instance.primaryStat.value : null,
    sockets: readSockets(socketRow, reusableRow),
  }
}

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

/**
 * 组件 300 的能量块 → 三个数字。
 * @param energy - 原始块；武器与旧数据里不存在。
 * @returns 缺失时 `null`，**绝不补 0**——0 是一个合法的已用能量值。
 */
function readEnergy(
  energy:
    | { energyCapacity?: number; energyUsed?: number; energyUnused?: number; energyTypeHash?: number }
    | undefined,
): { capacity: number; used: number; unused: number; typeHash: number } | null {
  if (energy === undefined || typeof energy.energyCapacity !== 'number') return null
  return {
    capacity: energy.energyCapacity,
    used: typeof energy.energyUsed === 'number' ? energy.energyUsed : 0,
    unused: typeof energy.energyUnused === 'number' ? energy.energyUnused : 0,
    typeHash: typeof energy.energyTypeHash === 'number' ? energy.energyTypeHash : 0,
  }
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
    /** 0 = transferable; anything else must not be moved (ADR-shaped guard). */
    transferStatus: num(raw.transferStatus),
    crafted: (num(raw.state) & 8) === 8,
    masterwork: (num(raw.state) & 4) === 4,
    enhanced: (num(raw.state) & 32) === 32,
    gearTier: typeof instance?.gearTier === 'number' ? instance.gearTier : null,
    itemLevel: typeof instance?.itemLevel === 'number' ? instance.itemLevel : null,
    stats: readStats(statData[instanceId]),
    plugObjectives: readObjectives(objectiveData[instanceId]),
    power: typeof instance?.primaryStat?.value === 'number' ? instance.primaryStat.value : null,
    energy: readEnergy(instance?.energy),
    sockets: readSockets(socketRow, reusableRow),
  }
}

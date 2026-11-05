/**
 * One item action against Bungie, with the lookups it needs handed in.
 *
 * Split out of the service so that file stays inside its ceiling; the service
 * still owns the client, the snapshot cache and invalidation.
 */
import type { BungieClient } from '../bungie/client'
import type { ProfileSnapshot } from '../bungie/profile'
import { equipItem, pullFromPostmaster, setLockState, transferItem } from '../bungie/write'
import type { ItemWrite, WriteTarget } from '../bungie/write'

/** What a write needs from the service. */
export interface WriteDeps {
  client: BungieClient
  target: WriteTarget
  snapshot: () => Promise<ProfileSnapshot>
  /** Called after a successful action so the next read sees the new state. */
  invalidate: () => void
}

/**
 * Run one item action.
 *
 * The item hash is resolved from the snapshot because a transfer needs both the
 * instance id and the definition hash.
 * @param deps - client, account identity, snapshot source, invalidation.
 * @param write - what to do.
 * @returns a human summary of what was asked.
 * @throws Error when the item or its owner cannot be found.
 */
export async function runItemWrite(deps: WriteDeps, write: ItemWrite): Promise<string> {
  const { client, target, instanceId } = { ...deps, instanceId: write.instanceId }

  if (write.kind === 'lock') {
    const owner = write.characterId ?? (await ownerOf(deps.snapshot, instanceId))
    await setLockState(client, target, instanceId, owner, write.locked === true)
    deps.invalidate()
    return write.locked === true ? '已锁定' : '已解锁'
  }
  if (write.kind === 'equip') {
    if (write.characterId === undefined) throw new Error('装备需要目标角色')
    await equipItem(client, target, instanceId, write.characterId)
    deps.invalidate()
    return '已装备'
  }
  const snapshot = await deps.snapshot()
  const item = snapshot.items.find((entry) => entry.instanceId === instanceId)
  if (item === undefined) throw new Error('这件物品不在当前快照里')
  if (write.kind === 'pull_postmaster') {
    if (write.characterId === undefined) throw new Error('取回需要指定角色')
    await pullFromPostmaster(client, target, instanceId, item.itemHash, write.characterId)
    deps.invalidate()
    return '已从邮政官取回'
  }
  const toVault = write.characterId === undefined
  await transferItem(client, target, instanceId, item.itemHash, toVault, write.characterId)
  deps.invalidate()
  return toVault ? '已存入仓库' : '已移到角色背包'
}

/** Which character holds this instance right now. */
async function ownerOf(
  snapshot: () => Promise<ProfileSnapshot>,
  instanceId: string,
): Promise<string> {
  const current = await snapshot()
  const item = current.items.find((entry) => entry.instanceId === instanceId)
  if (item === undefined || item.characterId === null) throw new Error('找不到这件物品所属的角色')
  return item.characterId
}

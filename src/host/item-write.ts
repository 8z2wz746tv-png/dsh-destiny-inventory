/**
 * One item action against Bungie, with the lookups it needs handed in.
 *
 * Split out of the service so that file stays inside its ceiling; the service
 * still owns the client, the snapshot cache and invalidation.
 */
import type { BungieClient } from '../bungie/client'
import type { ProfileSnapshot } from '../bungie/profile'
import { CLASS_LOCATION } from './dto'
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
    const owner =
      write.characterId ?? (await ownerOf(deps.snapshot, instanceId)) ?? (await activeCharacter(deps.snapshot))
    if (owner === undefined) throw new Error('找不到可以代表这次操作的角色，请刷新后再试')
    await setLockState(client, target, instanceId, owner, write.locked === true)
    deps.invalidate()
    return write.locked === true ? '已锁定' : '已解锁'
  }
  if (write.kind === 'equip') {
    if (write.characterId === undefined) throw new Error('装备需要目标角色')
    const wearer = await idOf(deps.snapshot, write.characterId)
    if (wearer === undefined) throw new Error('找不到目标角色，请刷新后再试')
    await equipItem(client, target, instanceId, wearer)
    deps.invalidate()
    return '已装备'
  }
  const snapshot = await deps.snapshot()
  const item = snapshot.items.find((entry) => entry.instanceId === instanceId)
  if (item === undefined) throw new Error('这件物品不在当前快照里')
  if (write.kind === 'pull_postmaster') {
    if (write.characterId === undefined) throw new Error('取回需要指定角色')
    const owner = await idOf(deps.snapshot, write.characterId)
    if (owner === undefined) throw new Error('找不到目标角色，请刷新后再试')
    await pullFromPostmaster(client, target, instanceId, item.itemHash, owner)
    deps.invalidate()
    return '已从邮政官取回'
  }
  const toVault = write.characterId === undefined
  // Banking names the character the item is leaving (DIM: `store.isVault ?
  // item.owner : store.id`). The bridge hands us a location key, so resolve it to
  // a real id first — `hunter` is not a character id and Bungie rejects it as a
  // malformed body.
  const destination = write.characterId
  const mover = toVault
    ? (item.characterId ?? (await activeCharacter(deps.snapshot)))
    : destination === undefined
      ? undefined
      : await idOf(deps.snapshot, destination)
  if (mover === undefined) throw new Error('找不到这件物品所属的角色，请刷新后再试')
  await transferItem(client, target, instanceId, item.itemHash, toVault, mover)
  deps.invalidate()
  return toVault ? '已存入仓库' : '已移到角色背包'
}

/** Which character holds this instance right now. */
async function ownerOf(
  snapshot: () => Promise<ProfileSnapshot>,
  instanceId: string,
): Promise<string | undefined> {
  const current = await snapshot()
  const item = current.items.find((entry) => entry.instanceId === instanceId)
  // A vault item has no owner; the caller falls back to the current character.
  return item?.characterId ?? undefined
}

/**
 * The character a vault write should name.
 *
 * Bungie's action endpoints take a character even for vault items; DIM passes the
 * currently selected store. We use the most recently played character, which is
 * what the game itself considers current.
 * @param snapshot - the current profile.
 * @returns the character id, or undefined when the account has none.
 */
async function activeCharacter(snapshot: () => Promise<ProfileSnapshot>): Promise<string | undefined> {
  const current = await snapshot()
  // `lastPlayed` is nullable; missing dates sort last.
  const played = [...current.characters].sort(
    (left, right) => Date.parse(right.lastPlayed ?? '') - Date.parse(left.lastPlayed ?? ''),
  )
  return played[0]?.characterId
}

/**
 * Resolve a location key (`hunter`) to the character id Bungie wants.
 *
 * The bridge's vocabulary is location keys; the action endpoints take ids. Passing
 * one where the other belongs comes back as "unexpected problem decoding", which
 * says nothing about the real mistake.
 * @param snapshot - the current profile.
 * @param location - `hunter` / `warlock` / `titan`, or an id that needs no lookup.
 * @returns the character id, or undefined when no character matches.
 */
async function idOf(snapshot: () => Promise<ProfileSnapshot>, location: string): Promise<string | undefined> {
  const current = await snapshot()
  const byKey = current.characters.find((character) => CLASS_LOCATION[character.classType] === location)
  if (byKey !== undefined) return byKey.characterId
  // Already an id (the client sometimes knows it); accept it as-is.
  return current.characters.some((character) => character.characterId === location) ? location : undefined
}

/**
 * One move, including the vault hop Bungie requires.
 *
 * Split out of `item-write.ts` when character-to-character moved in: that file was
 * at its ceiling, and the reason this is not one call deserves its own place.
 */
import type { BungieClient } from '../bungie/client'
import type { ProfileSnapshot } from '../bungie/profile'
import { transferItem } from '../bungie/write'
import type { ItemWrite, WriteTarget } from '../bungie/write'
import { CLASS_LOCATION } from './dto'
import { BridgeFault } from './http'

/**
 * Resolve a location key (`hunter`) to the character id Bungie wants.
 * @param snapshot - the current profile.
 * @param location - `hunter` / `warlock` / `titan`, or an id that needs no lookup.
 */
export async function idOf(
  snapshot: () => Promise<ProfileSnapshot>,
  location: string,
): Promise<string | undefined> {
  const current = await snapshot()
  const byKey = current.characters.find((character) => CLASS_LOCATION[character.classType] === location)
  if (byKey !== undefined) return byKey.characterId
  return current.characters.some((character) => character.characterId === location) ? location : undefined
}

/**
 * Move one item.
 *
 * `from` comes from the request, not the snapshot: Bungie syncs writes seconds
 * later, so a queued move could otherwise name the character the item already left.
 * @param client - platform client.
 * @param target - account identity.
 * @param snapshot - profile source, for resolving location keys.
 * @param write - what to do; `characterId` omitted means "bank it".
 * @param itemHash - the item's definition hash.
 * @returns a human summary.
 */
export async function moveItem(
  client: BungieClient,
  target: WriteTarget,
  snapshot: () => Promise<ProfileSnapshot>,
  write: ItemWrite,
  itemHash: number,
): Promise<string> {
  if (write.from === undefined) {
    throw new BridgeFault('BadRequest', 'move 需要 from（这件物品现在在哪个位置键）')
  }
  // Resolved only where it is needed: taking something *out* of the vault has no
  // source character, and asking for one would fail a perfectly good request.
  const ownerOf = async (): Promise<string> => {
    const owner = await idOf(snapshot, write.from as string)
    if (owner === undefined) throw new BridgeFault('BadRequest', '找不到这件物品所属的角色，请刷新后再试')
    return owner
  }
  if (write.characterId === undefined) {
    await transferItem(client, target, write.instanceId, itemHash, true, await ownerOf())
    return '已存入仓库'
  }
  const destination = await idOf(snapshot, write.characterId)
  if (destination === undefined) throw new BridgeFault('BadRequest', '找不到目标角色，请刷新后再试')
  // Character to character is not one transfer: Bungie answers 1623
  // `DestinyItemNotFound` for it, which reads like a data problem and is not one.
  // It goes out through the vault — the MCP's receipt says "via vault" for the same
  // reason.
  if (write.from !== 'vault') {
    await transferItem(client, target, write.instanceId, itemHash, true, await ownerOf())
    await transferItem(client, target, write.instanceId, itemHash, false, destination)
    return '已移到角色背包（经仓库中转）'
  }
  await transferItem(client, target, write.instanceId, itemHash, false, destination)
  return '已移到角色背包'
}

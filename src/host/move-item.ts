/**
 * One move, including the vault hop Bungie requires.
 *
 * Split out of `item-write.ts` when character-to-character moved in: that file was
 * at its ceiling, and the reason this is not one call deserves its own place.
 */
import { BungieApiError } from '../bungie/client'
import type { ProfileSnapshot } from '../bungie/profile'
import { transferItem } from '../bungie/write'
import type { ItemWrite } from '../bungie/write'
import { ensureRoom } from './make-room'
import { CLASS_LOCATION } from './dto'
import { BridgeFault } from './http'
import type { WriteDeps } from './item-write'

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

/** The words a player uses for each store. */
const STORE_LABEL: Record<string, string> = {
  vault: '仓库',
  hunter: '猎人',
  warlock: '术士',
  titan: '泰坦',
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
  deps: WriteDeps,
  write: ItemWrite,
  itemHash: number,
  bucketHash: number,
): Promise<string> {
  const { client, target, snapshot } = deps
  if (write.from === undefined) {
    throw new BridgeFault('BadRequest', 'move 需要 from（这件物品现在在哪个位置键）')
  }
  // "There are no item slots available" names neither the store nor the fix.
  const where = write.characterId === undefined ? '仓库' : (STORE_LABEL[write.characterId] ?? write.characterId)
  const attempt = async (
    transfer: () => Promise<void>,
    whenFull = `${where}那边放不下这件东西了：那个位置的槽已经满，先腾出一个位置再试`,
  ): Promise<void> => {
    try {
      await transfer()
    } catch (error) {
      if (error instanceof BungieApiError && error.errorStatus === 'DestinyNoRoomInDestination') {
        // The code is kept on purpose: `classifyFailure` reads it, and a made-up
        // code would turn a definite refusal into "unknown" and leave the item
        // looking unconfirmed forever.
        throw new BridgeFault(error.errorStatus, whenFull)
      }
      throw error
    }
  }

  // Resolved only where it is needed: taking something *out* of the vault has no
  // source character, and asking for one would fail a perfectly good request.
  const ownerOf = async (): Promise<string> => {
    const owner = await idOf(snapshot, write.from as string)
    if (owner === undefined) throw new BridgeFault('BadRequest', '找不到这件物品所属的角色，请刷新后再试')
    return owner
  }
  if (write.characterId === undefined) {
    const owner = await ownerOf()
    await attempt(() => transferItem(client, target, write.instanceId, itemHash, true, owner))
    return '已存入仓库'
  }
  const destination = await idOf(snapshot, write.characterId)
  if (destination === undefined) throw new BridgeFault('BadRequest', '找不到目标角色，请刷新后再试')
  // Character to character is not one transfer: Bungie answers 1623
  // `DestinyItemNotFound` for it, which reads like a data problem and is not one.
  // It goes out through the vault — the MCP's receipt says "via vault" for the same
  // reason.
  // Ask before spending a round trip: capacity and occupancy are both known here.
  const freed = await ensureRoom(deps, destination, bucketHash, write.instanceId, where)
  if (write.from !== 'vault') {
    const owner = await ownerOf()
    // The vault is only a waypoint here, so "术士那边满了" would point at the wrong
    // store. DIM reserves vault space for exactly this hop; we cannot count free
    // slots yet, so at least say what the vault is being used for.
    await attempt(
      () => transferItem(client, target, write.instanceId, itemHash, true, owner),
      '仓库那边放不下了 —— 角色之间的转移必须先从仓库中转，先腾出一格仓库再试',
    )
    await attempt(() => transferItem(client, target, write.instanceId, itemHash, false, destination))
    return '已移到角色背包（经仓库中转）'
  }
  await attempt(() => transferItem(client, target, write.instanceId, itemHash, false, destination))
  return freed === null ? '已移到角色背包' : `已移到角色背包（先腾出「${freed}」）`
}

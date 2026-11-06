/**
 * 目标格满时腾一件出去。
 *
 * 判据照 MCP 的 `ADR-029`（那边又照的 DIM v8.143.0）：这件事不能"随便挑一件"。
 * 唯一出处就在本模块，调用方只管搬，不许各写一套。
 *
 * 不腾的五类：穿着中的、锁定的、Bungie 标了不可转移的、本次要放进去的那一件，
 * 以及**已经在仓库里的**——仓库件"搬进仓库"什么也不会发生，格子照样满
 * （MCP 那边为此在真机上翻过一次车：单测绿、真机没腾成）。
 */
import { BungieApiError } from '../bungie/client'
import { transferItem } from '../bungie/write'
import type { ProfileItem } from '../bungie/profile'
import { bucketName, hasRoom } from './check-room'
import { BridgeFault } from './http'
import type { WriteDeps } from './item-write'

/** 越靠前越先腾：品阶低 → 光等低（未知最后）→ 非大师化 → 非巧匠 → id 稳定。 */
function rank(deps: WriteDeps, item: ProfileItem): [number, number, number, number, string] {
  return [
    deps.definitions().item(item.itemHash)?.tierType ?? 0,
    item.power ?? Number.MAX_SAFE_INTEGER,
    item.masterwork ? 1 : 0,
    item.crafted ? 1 : 0,
    item.instanceId,
  ]
}

function movable(item: ProfileItem, keep: string): boolean {
  return (
    item.instanceId !== keep &&
    item.source === 'character-inventory' &&
    !item.equipped &&
    !item.locked &&
    item.transferStatus === 0
  )
}

/**
 * Pick one item in that bucket and move it to the vault.
 * @returns the name of what was moved, for the receipt.
 */
export async function makeRoom(
  deps: WriteDeps,
  characterId: string,
  bucketHash: number,
  keep: string,
  storeLabel: string,
): Promise<string> {
  const current = await deps.snapshot()
  const candidates = current.items
    .filter((item) => item.characterId === characterId && item.bucketHash === bucketHash)
    .filter((item) => movable(item, keep))
    .sort((a, b) => {
      const [x, y] = [rank(deps, a), rank(deps, b)]
      return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || x[3] - y[3] || x[4].localeCompare(y[4])
    })
  const victim = candidates[0]
  if (victim === undefined) {
    throw new BridgeFault(
      'DestinyNoRoomInDestination',
      `${storeLabel}的${bucketName(deps.definitions, bucketHash)}槽满了（装不下这一件），而那格子里没有可以腾的 —— 穿着的、锁定的、不可转移的都不动。先自己挪一件出来`,
    )
  }
  const victimName = deps.definitions().item(victim.itemHash)?.name ?? victim.instanceId
  try {
    await transferItem(deps.client, deps.target, victim.instanceId, victim.itemHash, true, characterId)
  } catch (error) {
    // Only one hop is allowed: a full vault is reported, never recursively squeezed.
    if (error instanceof BungieApiError && error.errorStatus === 'DestinyNoRoomInDestination') {
      throw new BridgeFault(
        'DestinyNoRoomInDestination',
        `想把「${victimName}」挪进仓库腾位置，但仓库也满了 —— 先腾仓库`,
      )
    }
    throw error
  }
  return victimName
}

/**
 * Make sure the destination can take one more item, moving one aside if needed.
 * @returns `null` when there was room, otherwise the name of what was moved.
 */
export async function ensureRoom(
  deps: WriteDeps,
  characterId: string,
  bucketHash: number,
  keep: string,
  storeLabel: string,
): Promise<string | null> {
  const room = await hasRoom(deps.definitions, deps.snapshot, characterId, bucketHash)
  if (room !== false) return null
  return makeRoom(deps, characterId, bucketHash, keep, storeLabel)
}

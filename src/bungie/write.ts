/**
 * Bungie's item actions, called directly from our own data plane.
 *
 * PLAN-SELF-HOSTED-DIM §1: reads and writes both belong to the front end. The MCP
 * stays for the agent only. Going through it added two hops (host → MCP process →
 * Bungie) to every drag, which is why a move took seconds.
 */
import type { BungieClient } from './client'

/** Minimal account identity a write needs: which platform, which account. */
export interface WriteTarget {
  membershipType: number
  membershipId: string
}

/** One item action, as the bridge receives it. */
export interface ItemWrite {
  kind: 'move' | 'equip' | 'lock' | 'pull_postmaster'
  instanceId: string
  /** Destination for `move`; owner for `equip`/`lock`/`pull_postmaster`. */
  characterId?: string
  /** `lock` only. */
  locked?: boolean
}

/**
 * Move an item between a character and the vault.
 *
 * Bungie takes the item's *instance* id plus the item hash for stackable moves;
 * a vault stash with a stack size of 1 is what every caller here wants.
 * @param client - platform client.
 * @param target - account identity.
 * @param instanceId - the item instance.
 * @param itemHash - the item's definition hash (Bungie requires it).
 * @param toVault - `true` banks it, `false` pulls it to `characterId`.
 * @param characterId - the character, when pulling out of the vault.
 */
export async function transferItem(
  client: BungieClient,
  target: WriteTarget,
  instanceId: string,
  itemHash: number,
  toVault: boolean,
  characterId?: string,
): Promise<void> {
  await client.post(`/Destiny2/Actions/Items/TransferItem/`, {
    itemReferenceHash: itemHash,
    stackSize: 1,
    transferToVault: toVault,
    itemId: instanceId,
    characterId: characterId ?? '0',
    membershipType: target.membershipType,
  })
}

/**
 * Equip an item on a character.
 * @param client - platform client.
 * @param target - account identity.
 * @param instanceId - the item instance.
 * @param characterId - who wears it.
 */
export async function equipItem(
  client: BungieClient,
  target: WriteTarget,
  instanceId: string,
  characterId: string,
): Promise<void> {
  await client.post(`/Destiny2/Actions/Items/EquipItem/`, {
    itemId: instanceId,
    characterId,
    membershipType: target.membershipType,
  })
}

/**
 * Take one item out of the postmaster.
 * @param client - platform client.
 * @param target - account identity.
 * @param instanceId - the item instance.
 * @param itemHash - the item's definition hash (Bungie requires it).
 * @param characterId - whose postmaster it is.
 */
export async function pullFromPostmaster(
  client: BungieClient,
  target: WriteTarget,
  instanceId: string,
  itemHash: number,
  characterId: string,
): Promise<void> {
  await client.post(`/Destiny2/Actions/Items/PullFromPostmaster/`, {
    itemReferenceHash: itemHash,
    stackSize: 1,
    itemId: instanceId,
    characterId,
    membershipType: target.membershipType,
  })
}

/**
 * Lock or unlock an item.
 * @param client - platform client.
 * @param target - account identity.
 * @param instanceId - the item instance.
 * @param characterId - the character holding it (vault items pass the owner).
 * @param locked - desired state.
 */
export async function setLockState(
  client: BungieClient,
  target: WriteTarget,
  instanceId: string,
  characterId: string,
  locked: boolean,
): Promise<void> {
  await client.post(`/Destiny2/Actions/Items/SetLockState/`, {
    state: locked,
    itemId: instanceId,
    characterId,
    membershipType: target.membershipType,
  })
}

/**
 * Translate the bridge's action request into a write.
 *
 * The client still speaks the old `ActionRequest` shape; converting here keeps
 * that wire format stable while the execution moves into our own plane.
 * @param request - what the client asked for.
 * @returns the write to run.
 */
export function toItemWrite(request: {
  kind: 'move' | 'equip' | 'lock' | 'pull_postmaster'
  instanceId: string
  destination?: string
  character?: string
  locked?: boolean
  confirmed?: boolean
}): ItemWrite {
  if (request.kind === 'pull_postmaster') {
    return { kind: 'pull_postmaster', instanceId: request.instanceId, characterId: request.character }
  }
  if (request.kind === 'lock') {
    return { kind: 'lock', instanceId: request.instanceId, locked: request.locked === true }
  }
  if (request.kind === 'equip') {
    return { kind: 'equip', instanceId: request.instanceId, characterId: request.character }
  }
  // `destination` is a class key for characters and the literal `vault` to bank.
  return {
    kind: 'move',
    instanceId: request.instanceId,
    characterId: request.destination === 'vault' ? undefined : request.destination,
  }
}

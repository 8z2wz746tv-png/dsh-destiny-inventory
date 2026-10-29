import type { Context } from '@deepseek-ai/cordis'
import { callDestinyTool } from './client'
import { getInventory } from './inventory'
import { DestinyPayloadError, unwrapToolEnvelope } from './queries'
import type { ItemDetailView, ItemRow, PerkColumnView, PerkOptionView } from './types'

/**
 * The on-demand item detail read.
 *
 * Two tool calls back one card:
 * - `inventory_assistant(item)` knows this **instance** — power, equip state and
 *   which plug is socketed in each socket.
 * - `weapon_assistant(perk_pool)` knows the **definition** — every perk the
 *   weapon can roll, plus rarity and damage type that the list payload omits.
 *
 * The perk pool is keyed by weapon name, so two copies of one gun share it; only
 * the selected plugs differ, and those come from the instance read.
 */

/** Weapon/armor definition facts the list payload does not carry. */
export interface DefinitionFacts {
  rarity: string
  damageType: string
  ammoType: string
  weaponType: string
  frame: string
  description: string
  rollSummary: string
}

/** Cached details, keyed by server + item id. */
const cache = new Map<string, ItemDetailView>()

/** Per-weapon-name perk pool cache, so a second copy of the same gun is free. */
const poolCache = new Map<string, unknown>()

/** How long one detail stays fresh. */
export const DETAIL_TTL_MS = 10 * 60_000

/** Sockets as the instance read reports them. */
export interface InstanceSocket {
  index: number
  kind: string
  plugHash: number
  name: string
  icon: string
}

/** Read a number field. */
function num(value: unknown): number {
  return typeof value === 'number' ? value : 0
}

/** Read a string field. */
function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Pull the identity/instance/sockets branch out of an `item` response.
 *
 * The tool publishes this branch under `armor` for every item kind — weapons
 * included — so both keys are read and the first object wins.
 * @param value - the tool's canonical value.
 */
export function readItemBranch(value: unknown): {
  identity: Record<string, unknown>
  instance: Record<string, unknown>
  sockets: InstanceSocket[]
} {
  const envelope = unwrapToolEnvelope('item', value)
  const data = envelope.data
  if (typeof data !== 'object' || data === null) throw new DestinyPayloadError('item', 'no data')
  const record = data as Record<string, unknown>
  const branch = (record.weapon ?? record.armor) as Record<string, unknown> | undefined
  if (branch === undefined || typeof branch !== 'object' || branch === null) {
    throw new DestinyPayloadError('item', 'no weapon/armor branch')
  }
  const identity = branch.identity
  const instance = branch.instance
  if (typeof identity !== 'object' || identity === null || typeof instance !== 'object' || instance === null) {
    throw new DestinyPayloadError('item', 'branch is missing identity/instance')
  }
  const rawSockets = branch.sockets
  const sockets: InstanceSocket[] = Array.isArray(rawSockets)
    ? rawSockets.map((raw) => {
        const socket = raw as Record<string, unknown>
        return {
          index: num(socket.index),
          kind: str(socket.kind),
          plugHash: num(socket.plug_hash),
          name: str(socket.name),
          icon: str(socket.icon_url),
        }
      })
    : []
  return {
    identity: identity as Record<string, unknown>,
    instance: instance as Record<string, unknown>,
    sockets,
  }
}

/**
 * Pull the perk-pool columns and definition facts out of one
 * `weapon_assistant(perk_pool)` response.
 * @param value - the tool's canonical value.
 * @param selected - socket index → socketed plug hash, from the instance read.
 */
export function readPerkPool(
  value: unknown,
  selected: ReadonlyMap<number, number>,
): { columns: PerkColumnView[]; facts: DefinitionFacts } {
  const envelope = unwrapToolEnvelope('perk_pool', value)
  const data = envelope.data
  if (typeof data !== 'object' || data === null) throw new DestinyPayloadError('perk_pool', 'no data')
  const record = data as Record<string, unknown>
  const weapon = (record.weapon ?? {}) as Record<string, unknown>
  const rawSockets = record.sockets
  if (!Array.isArray(rawSockets)) throw new DestinyPayloadError('perk_pool', 'no sockets array')
  const columns: PerkColumnView[] = rawSockets.map((raw) => {
    const socket = raw as Record<string, unknown>
    const socketIndex = num(socket.socket_index)
    const rawOptions = Array.isArray(socket.options) ? socket.options : []
    const options: PerkOptionView[] = rawOptions.map((entry) => {
      const option = entry as Record<string, unknown>
      const hash = num(option.plug_hash)
      return {
        hash,
        name: str(option.name),
        description: str(option.description),
        icon: str(option.icon_url),
        selected: hash !== 0 && selected.get(socketIndex) === hash,
        enhancedHash: num(option.enhanced_plug_hash),
        statEffects: Array.isArray(option.stat_effects)
          ? option.stat_effects.map((effect) => {
              const stat = effect as Record<string, unknown>
              return { stat: str(stat.stat), value: num(stat.value) }
            })
          : [],
      }
    })
    return {
      socketIndex,
      slot: str(socket.slot),
      kind: str(socket.kind),
      options,
      optionsAvailable: socket.options_available !== false,
    }
  })
  return {
    columns,
    facts: {
      rarity: str(weapon.rarity),
      damageType: str(weapon.damage_type),
      ammoType: str(weapon.ammo_type),
      weaponType: str(weapon.weapon_type),
      frame: str(weapon.frame),
      description: str(weapon.description),
      rollSummary: str(weapon.roll_summary),
    },
  }
}

/**
 * Build columns for an item whose definition publishes no perk pool.
 * @param sockets - the instance's sockets.
 */
export function columnsFromSockets(sockets: InstanceSocket[]): PerkColumnView[] {
  return sockets
    .filter((socket) => socket.plugHash !== 0)
    .map((socket) => ({
      socketIndex: socket.index,
      slot: socket.kind,
      kind: socket.kind,
      optionsAvailable: true,
      options: [
        {
          hash: socket.plugHash,
          name: socket.name,
          description: '',
          icon: socket.icon,
          selected: true,
          enhancedHash: 0,
          statEffects: [],
        },
      ],
    }))
}

/** Read one weapon's perk pool, reusing the previous response by weapon name. */
async function perkPool(ctx: Context, server: string, name: string): Promise<unknown> {
  const key = `${server}:${name}`
  const hit = poolCache.get(key)
  if (hit !== undefined) return hit
  const value = await callDestinyTool(ctx, server, 'weapon_assistant', {
    intent: 'perk_pool',
    weapon_name: name,
  })
  poolCache.set(key, value)
  return value
}

/**
 * Read one item's detail card, caching the result.
 * @param ctx - plugin context carrying the tool registry.
 * @param server - configured MCP server name.
 * @param itemId - the snapshot row id, so identity comes from one place.
 * @param options - `force` bypasses the item cache.
 */
export async function readItemDetail(
  ctx: Context,
  server: string,
  itemId: string,
  options: { force?: boolean } = {},
): Promise<ItemDetailView> {
  const key = `${server}:${itemId}`
  const cached = cache.get(key)
  if (options.force !== true && cached !== undefined) return cached

  const snapshot = await getInventory(ctx, server)
  const row: ItemRow | undefined = snapshot.items.find((item) => item.id === itemId)
  if (row === undefined) {
    throw new DestinyPayloadError('item', `no item "${itemId}" in the current snapshot`)
  }
  if (row.instanceId === '' || row.instanceId === '0') {
    throw new DestinyPayloadError('item', 'stackable items have no instance detail')
  }

  const branch = readItemBranch(
    await callDestinyTool(ctx, server, 'inventory_assistant', {
      intent: 'item',
      item_instance_id: row.instanceId,
    }),
  )
  const selected = new Map<number, number>()
  for (const socket of branch.sockets) selected.set(socket.index, socket.plugHash)

  let columns = columnsFromSockets(branch.sockets)
  let facts: DefinitionFacts = {
    rarity: '',
    damageType: '',
    ammoType: '',
    weaponType: '',
    frame: '',
    description: '',
    rollSummary: '',
  }
  if (row.kind === 'weapon') {
    const pool = readPerkPool(await perkPool(ctx, server, row.name), selected)
    columns = pool.columns
    facts = pool.facts
  }

  const detail: ItemDetailView = {
    id: row.id,
    instanceId: row.instanceId,
    hash: row.hash,
    name: row.name,
    kind: row.kind,
    icon: row.icon,
    power: row.power,
    equipped: row.equipped,
    locked: row.locked,
    quantity: row.quantity,
    location: row.location,
    rarity: facts.rarity,
    damageType: facts.damageType,
    ammoType: facts.ammoType,
    weaponType: facts.weaponType,
    frame: facts.frame,
    description: facts.description,
    columns,
    rollSummary: facts.rollSummary,
  }
  cache.set(key, detail)
  return detail
}

/** Drop every detail cache; used by tests. */
export function clearItemCaches(): void {
  cache.clear()
  poolCache.clear()
}

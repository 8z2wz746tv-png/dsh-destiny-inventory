import type { Context } from '@deepseek-ai/cordis'
import { callDestinyTool } from './client'
import { DestinyPayloadError, unwrapToolEnvelope } from './queries'
import type { InventorySnapshot, ItemRarity, ItemRow } from './types'

/**
 * The account inventory read.
 *
 * `inventory_assistant(get)` is paginated, so this walks it to the end. The
 * page size is 1000 — the largest the tool honours — which turns an 1922-item
 * account into two calls instead of twenty.
 */

/** Page size requested from the tool. */
const PAGE_SIZE = 1000

/**
 * The rarity lookup, by instance id and by definition hash.
 *
 * Both keys are needed: stackables report instance id `"0"` for every one of
 * them, so their definition hash is the only thing that can place them.
 */
export interface RarityIndex {
  byInstance: ReadonlyMap<string, ItemRarity>
  byHash: ReadonlyMap<number, ItemRarity>
}

/** The rarities the tool can filter on, in the order they are fetched. */
const RARITY_FILTERS: { filter: string; rarity: ItemRarity }[] = [
  { filter: '异域', rarity: 'exotic' },
  { filter: '传说', rarity: 'legendary' },
  { filter: '稀有', rarity: 'rare' },
]

/** Build the rarity index from the three rarity-filtered reads. */
export function buildRarityIndex(
  tiers: { rarity: ItemRarity; rows: Record<string, unknown>[] }[],
): RarityIndex {
  const byInstance = new Map<string, ItemRarity>()
  const byHash = new Map<number, ItemRarity>()
  for (const tier of tiers) {
    for (const row of tier.rows) {
      const instanceId = row.item_instance_id
      const hash = row.item_hash
      if (typeof instanceId === 'string' && instanceId !== '' && instanceId !== '0') {
        byInstance.set(instanceId, tier.rarity)
      }
      if (typeof hash === 'number') byHash.set(hash, tier.rarity)
    }
  }
  return { byInstance, byHash }
}

/**
 * Make every row key unique.
 *
 * Some rows are genuinely indistinguishable in the tool's output — separate
 * bounties reported with instance id `"0"`, the same hash, the same bucket and
 * the same location. They are real items, so they are kept and disambiguated by
 * their ordinal within that key rather than silently dropped or merged.
 * @param items - rows already carrying a base identity.
 */
export function uniquifyKeys(items: ItemRow[]): ItemRow[] {
  const seen = new Map<string, number>()
  return items.map((item) => {
    const ordinal = (seen.get(item.id) ?? 0) + 1
    seen.set(item.id, ordinal)
    return ordinal === 1 ? item : { ...item, id: `${item.id}#${ordinal}` }
  })
}

/** Build the exotic index from the rarity-filtered read. */
/** A snapshot older than this is refetched on the next request. */
export const SNAPSHOT_TTL_MS = 60_000

/** One page of `inventory_assistant(get)`. */
interface InventoryPage {
  items: Record<string, unknown>[]
  totalItems: number
  nextOffset: number | null
}

/** Read the tool's inventory block out of one response. */
export function parseInventoryPage(value: unknown): InventoryPage {
  const envelope = unwrapToolEnvelope('inventory', value)
  const data = envelope.data
  if (typeof data !== 'object' || data === null) {
    throw new DestinyPayloadError('inventory', 'envelope has no data')
  }
  const inventory = (data as Record<string, unknown>).inventory
  if (typeof inventory !== 'object' || inventory === null) {
    throw new DestinyPayloadError('inventory', 'data has no inventory')
  }
  const page = inventory as Record<string, unknown>
  if (!Array.isArray(page.items)) {
    throw new DestinyPayloadError('inventory', 'inventory has no items array')
  }
  const total = page.total_items
  if (typeof total !== 'number') {
    throw new DestinyPayloadError('inventory', 'inventory has no total_items')
  }
  const next = page.next_offset
  return {
    items: page.items as Record<string, unknown>[],
    totalItems: total,
    nextOffset: typeof next === 'number' ? next : null,
  }
}

/**
 * Stable identity for one item.
 *
 * Stackable items (consumables, currencies, materials) carry no Bungie instance
 * id — the tool reports `"0"` for all of them, which collides as a React key and
 * would match any exotic lookup keyed by instance id. Those fall back to their
 * definition hash, scoped by location so two characters holding the same stack
 * stay distinct.
 * @param location - canonical location string from the tool.
 * @param instanceId - `item_instance_id` from the tool.
 * @param hash - `item_hash` from the tool.
 */
export function itemIdentity(location: string, instanceId: string, hash: number): string {
  const real = instanceId !== '' && instanceId !== '0'
  return `${location}:${real ? instanceId : `h${hash}`}`
}

/**
 * Project one tool row onto the wire row, dropping the fields the grid never
 * paints. Missing identity fields are a hard error, not a blank card.
 * @param row - one item from `inventory_assistant(get)`.
 * @param rarity - the rarity lookup built from the filtered reads.
 */
export function toItemRow(row: Record<string, unknown>, rarity: RarityIndex): ItemRow {
  const instanceId = row.item_instance_id
  const hash = row.item_hash
  const name = row.name
  if (typeof instanceId !== 'string' || typeof hash !== 'number' || typeof name !== 'string') {
    throw new DestinyPayloadError('inventory', 'item row is missing item_instance_id/item_hash/name')
  }
  const location = typeof row.location === 'string' ? row.location : ''
  const rawType = typeof row.item_type === 'string' ? row.item_type : ''
  const kind: ItemRow['kind'] =
    rawType === 'Weapon' ? 'weapon' : rawType === 'Armor' ? 'armor' : 'other'
  return {
    id: itemIdentity(location, instanceId, hash),
    instanceId,
    hash,
    name,
    kind,
    type: typeof row.item_type_display === 'string' ? row.item_type_display : '',
    bucket: typeof row.bucket_type === 'string' ? row.bucket_type : '',
    power: typeof row.power === 'number' ? row.power : null,
    equipped: row.is_equipped === true,
    locked: row.is_locked === true,
    quantity: typeof row.quantity === 'number' ? row.quantity : 1,
    icon: typeof row.icon_url === 'string' ? row.icon_url : '',
    location,
    characterId: typeof row.character_id === 'string' ? row.character_id : '',
    rarity:
      rarity.byInstance.get(instanceId) ?? rarity.byHash.get(hash) ?? ('unknown' as ItemRarity),
  }
}

/**
 * Walk one paginated read to completion.
 * @param ctx - plugin context carrying the tool registry.
 * @param server - configured MCP server name.
 * @param extra - extra tool arguments, e.g. a rarity filter.
 */
async function readAllPages(
  ctx: Context,
  server: string,
  extra: Record<string, unknown> = {},
): Promise<{ rows: Record<string, unknown>[]; total: number; truncated: boolean }> {
  const rows: Record<string, unknown>[] = []
  let offset = 0
  let total = 0
  for (;;) {
    const page = parseInventoryPage(
      await callDestinyTool(ctx, server, 'inventory_assistant', {
        intent: 'get',
        limit: PAGE_SIZE,
        offset,
        ...extra,
      }),
    )
    total = page.totalItems
    rows.push(...page.items)
    if (page.nextOffset === null || page.items.length === 0) break
    offset = page.nextOffset
    if (rows.length >= total) break
  }
  return { rows, total, truncated: rows.length < total }
}

/**
 * Read the whole account inventory and mark exotics.
 *
 * Rarity is a filter, not a field: the only way to learn an item's rarity is to
 * ask for each tier explicitly, so this pays one extra read per tier and reports
 * anything outside those three tiers as unknown.
 * @param ctx - plugin context carrying the tool registry.
 * @param server - configured MCP server name.
 */
export async function readInventory(ctx: Context, server: string): Promise<InventorySnapshot> {
  const [all, ...tiers] = await Promise.all([
    readAllPages(ctx, server),
    ...RARITY_FILTERS.map(async (tier) => ({
      rarity: tier.rarity,
      page: await readAllPages(ctx, server, { rarity: tier.filter }),
    })),
  ])
  const rarity = buildRarityIndex(
    tiers.map((tier) => ({ rarity: tier.rarity, rows: tier.page.rows })),
  )
  return {
    fetchedAt: Date.now(),
    total: all.total,
    truncated: all.truncated,
    items: uniquifyKeys(all.rows.map((row) => toItemRow(row, rarity))),
  }
}

/** Per-server snapshot cache, so a re-render does not re-read the account. */
const cache = new Map<string, InventorySnapshot>()

/**
 * Return a cached snapshot, refetching when it is stale or forced.
 * @param ctx - plugin context carrying the tool registry.
 * @param server - configured MCP server name.
 * @param options - `force` bypasses the TTL.
 */
export async function getInventory(
  ctx: Context,
  server: string,
  options: { force?: boolean } = {},
): Promise<InventorySnapshot> {
  const cached = cache.get(server)
  if (options.force !== true && cached !== undefined && Date.now() - cached.fetchedAt < SNAPSHOT_TTL_MS) {
    return cached
  }
  const snapshot = await readInventory(ctx, server)
  cache.set(server, snapshot)
  return snapshot
}

/** Drop the cache; used by tests and by a failed write's read-back. */
export function clearInventoryCache(): void {
  cache.clear()
}

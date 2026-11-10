/**
 * Manifest definition lookups.
 *
 * Source of truth: the MCP's already-downloaded SQLite manifest. This module does
 * NOT download, refresh or version anything — a second manifest pipeline is a
 * second thing to keep in sync, and the MCP already owns that job.
 *
 * Two rules the rest of the host half depends on:
 *  - a missing definition is `null`, never an empty string; callers must be able
 *    to tell "we do not know this hash" from "this thing has no name";
 *  - every lookup result keeps the original hash, because agent analysis, item
 *    identity and write confirmations all key on it.
 */
import { existsSync } from 'node:fs'
import { hasCraftingSocket, parseDamageTypes, parseOverlays, readCategoryHashes, readStatValues } from './manifest-shapes'
import { DatabaseSync } from 'node:sqlite'
import { EnergyTypeNames } from './energy-types'
import { ItemSets } from './item-sets'
import type { ArmorSet } from './item-sets'

/** Why the definition database cannot answer right now. */
export type ManifestFailure = 'missing' | 'unreadable' | 'empty' | 'query-failed'

/** Raised only for callers that explicitly require definitions. */
export class ManifestUnavailableError extends Error {
  readonly reason: ManifestFailure

  constructor(reason: ManifestFailure, message: string) {
    super(message)
    this.name = 'ManifestUnavailableError'
    this.reason = reason
  }
}

/** Reported to the bridge so the UI can degrade honestly. */
export interface ManifestStatus {
  available: boolean
  reason?: ManifestFailure
  dbPath: string
  itemCount?: number
  bucketCount?: number
}

/** One inventory bucket definition, trimmed. */
export interface BucketDefinition {
  /** Unsigned Bungie hash (what the API reports). */
  hash: number
  name: string
  category: number | null
  location: number | null
  itemCount: number | null
  hasTransferDestination: boolean
}

/** One item definition, trimmed to what the grid and the detail card paint. */
export interface ItemDefinition {
  /** Unsigned Bungie hash. */
  hash: number
  name: string
  description: string
  /** Absolute icon URL, or empty string when upstream has none. */
  icon: string
  /** DestinyItemType enum: 2 armor, 3 weapon, ... */
  itemType: number | null
  itemTypeDisplayName: string
  /** DestinyTierType enum: 2 common … 6 exotic. */
  tierType: number | null
  tierTypeName: string
  bucketTypeHash: number | null
  /** 1 primary, 2 special, 3 heavy. */
  ammoType: number | null
  damageType: number | null
  /** 0 titan, 1 hunter, 2 warlock, 3 any. */
  classType: number | null
  /** `stats.statGroupHash`: which ordered stat list this item uses. */
  statGroupHash: number | null
  /** Stat values by signed hash, with the maximum the game displays. */
  stats: Record<number, { value: number; displayMaximum: number }>
  /** Season watermark image URL; empty when the definition has none. */
  watermark: string
  /** Champion counter: 0 none, 1 barrier, 2 overload, 3 unstoppable. */
  breakerType: number
  /**
   * Definition-level: this item can be crafted (it owns a socket of DIM's
   * crafting category). `state` alone over-reports, so both are required.
   */
  categoryHashes: number[]
  craftingSocket: boolean
}

/** One plug (perk/mod) definition, trimmed. */
export interface PlugDefinition {
  hash: number
  name: string
  description: string
  icon: string
  /** e.g. `frames`, `barrels`, `magazines`, `v400.weapon.mod_guns`. */
  plugCategoryIdentifier: string
}

/** Tables this module is allowed to read; a whitelist, not interpolation. */
const TABLE = {
  bucket: 'DestinyInventoryBucketDefinition',
  item: 'DestinyInventoryItemDefinition',
  stat: 'DestinyStatDefinition',
  statGroup: 'DestinyStatGroupDefinition',
  record: 'DestinyRecordDefinition',
} as const

type TableKey = keyof typeof TABLE

const ICON_ORIGIN = 'https://www.bungie.net'

/** Bound the cache: an account touches ~2k items but a session can browse more. */
const MAX_CACHE_ENTRIES = 4000

/**
 * Convert an unsigned Bungie hash to the signed id the manifest stores.
 *
 * The tables key on signed 32-bit ids while the API reports unsigned hashes;
 * looking up `2905188646` as-is misses every hash above 2^31.
 */
export function toSignedHash(hash: number): number {
  if (!Number.isFinite(hash)) return 0
  const value = Math.trunc(hash)
  return value > 0x7fffffff ? value - 0x1_0000_0000 : value
}

/** Read a numeric field with a null fallback (never coerce to 0, which is meaningful). */
export function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Read a string field, defaulting to empty only for genuinely textual fields. */
export function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Render a manifest icon path into an absolute URL. */
function iconUrl(value: unknown): string {
  const path = str(value)
  if (path === '') return ''
  return path.startsWith('http') ? path : `${ICON_ORIGIN}${path}`
}

/** Narrow one bucket definition row. */
export function parseBucket(hash: number, raw: Record<string, unknown>): BucketDefinition {
  const display = (raw.displayProperties ?? {}) as Record<string, unknown>
  return {
    hash,
    name: str(display.name),
    category: num(raw.category),
    location: num(raw.location),
    itemCount: num(raw.itemCount),
    hasTransferDestination: raw.hasTransferDestination === true,
  }
}

/** Narrow one item definition row. */
export function parseItem(hash: number, raw: Record<string, unknown>): ItemDefinition {
  const display = (raw.displayProperties ?? {}) as Record<string, unknown>
  const inventory = (raw.inventory ?? {}) as Record<string, unknown>
  const equipping = (raw.equippingBlock ?? {}) as Record<string, unknown>
  return {
    hash,
    name: str(display.name),
    description: str(display.description),
    icon: iconUrl(display.icon),
    itemType: num(raw.itemType),
    itemTypeDisplayName: str(raw.itemTypeDisplayName),
    tierType: num(inventory.tierType),
    tierTypeName: str(inventory.tierTypeName),
    bucketTypeHash: num(inventory.bucketTypeHash),
    ammoType: num(equipping.ammoType),
    damageType: num(raw.defaultDamageType),
    classType: num(raw.classType),
    statGroupHash: typeof (raw.stats as Record<string, unknown> | undefined)?.statGroupHash === 'number'
      ? ((raw.stats as Record<string, unknown>).statGroupHash as number)
      : null,
    stats: readStatValues(raw.stats),
    watermark: iconUrl(raw.iconWatermark),
    breakerType: typeof raw.breakerType === 'number' ? raw.breakerType : 0,
    categoryHashes: readCategoryHashes(raw),
    craftingSocket: hasCraftingSocket(raw.sockets),
  }
}

/** Narrow one plug definition row (a plug is an item definition with a `plug` block). */
export function parsePlug(hash: number, raw: Record<string, unknown>): PlugDefinition | null {
  const plug = raw.plug as Record<string, unknown> | undefined
  if (plug === undefined) return null
  const display = (raw.displayProperties ?? {}) as Record<string, unknown>
  return {
    hash,
    name: str(display.name),
    description: str(display.description),
    icon: iconUrl(display.icon),
    plugCategoryIdentifier: str(plug.plugCategoryIdentifier),
  }
}

/**
 * Read-only view over the manifest database.
 *
 * Construction never throws: a missing or broken database is reported through
 * `status()` and every lookup answers `null`, so the inventory read keeps
 * working (definitions are explanation, not a prerequisite).
 */

export class ManifestStore {
  private readonly dbPath: string
  private readonly cache = new Map<string, Record<string, unknown> | null>()
  private db: DatabaseSync | null = null
  private failure: ManifestFailure | undefined
  private counts: { itemCount: number; bucketCount: number } | undefined
  /** Localized damage-type names, keyed by `defaultDamageType` enum value. */
  private readonly damageTypes = new Map<number, { name: string; icon: string }>()
  /** 能量元素名（懒加载）。 */
  private readonly energyTypes = new EnergyTypeNames(this.db)
  private readonly sets = new ItemSets(this.db)

  constructor(dbPath: string) {
    this.dbPath = dbPath
    // `DatabaseSync` reports an absent file as a generic sqlite error, so check
    // for existence first — "we never had it" and "we cannot open it" are
    // different operator actions.
    if (!existsSync(dbPath)) {
      this.failure = 'missing'
      this.db = null
      return
    }
    try {
      this.db = new DatabaseSync(dbPath, { readOnly: true })
    } catch {
      this.failure = 'unreadable'
      this.db = null
    }
  }

  /** Current capability of the store, including why it is unavailable. */
  status(): ManifestStatus {
    if (this.db === null) return { available: false, reason: this.failure ?? 'unreadable', dbPath: this.dbPath }
    if (this.counts === undefined) {
      try {
        const itemRow = this.db.prepare(`select count(*) as n from ${TABLE.item}`).get()
        const bucketRow = this.db.prepare(`select count(*) as n from ${TABLE.bucket}`).get()
        this.counts = {
          itemCount: Number(itemRow?.n ?? 0),
          bucketCount: Number(bucketRow?.n ?? 0),
        }
      } catch {
        this.failure = 'empty'
        this.counts = { itemCount: 0, bucketCount: 0 }
      }
    }
    if (this.counts.itemCount === 0) {
      return { available: false, reason: 'empty', dbPath: this.dbPath, ...this.counts }
    }
    return { available: true, dbPath: this.dbPath, ...this.counts }
  }

  /**
   * Localized damage-type name, read from `DestinyDamageTypeDefinition` rather
   * than hardcoded so a manifest update renames it here and nowhere else.
   */
  damageType(enumValue: number | null): string {
    return this.damageTypeInfo(enumValue).name
  }

  /** The game's own damage glyph; empty when the manifest carries none. */
  damageTypeIcon(enumValue: number | null): string {
    return this.damageTypeInfo(enumValue).icon
  }

  energyType(hash: number | null): string { return this.energyTypes.name(hash) }
  armorSet(itemHash: number): ArmorSet | null { return this.sets.of(itemHash) }

  private damageTypeInfo(enumValue: number | null): { name: string; icon: string } {
    const empty = { name: '', icon: '' }
    if (enumValue === null || this.db === null) return empty
    const cached = this.damageTypes.get(enumValue)
    if (cached !== undefined) return cached
    try {
      const rows = this.db.prepare('select json from DestinyDamageTypeDefinition').all() as {
        json: string
      }[]
      for (const [value, info] of parseDamageTypes(rows, ICON_ORIGIN)) this.damageTypes.set(value, info)
    } catch {
      this.failure = 'query-failed'
      return empty
    }
    return this.damageTypes.get(enumValue) ?? empty
  }

  /** 图标角标（锻造/品阶），来自 `DestinyInventoryItemConstantsDefinition`。 */
  iconOverlays(): { crafted: string; craftedBackground: string; tiers: string[] } {
    const empty = { crafted: '', craftedBackground: '', tiers: [] as string[] }
    if (this.db === null) return empty
    try {
      const row = this.db.prepare('select json from DestinyInventoryItemConstantsDefinition').get() as
        | { json?: string }
        | undefined
      if (typeof row?.json !== 'string') return empty
      return parseOverlays(JSON.parse(row.json), ICON_ORIGIN)
    } catch {
      this.failure = 'query-failed'
      return empty
    }
  }

  /**
   * Ordered stat hashes for a stat group, the way DIM reads them.
   *
   * `scaledStats` carries the game's own display order; walking the item's map
   * instead would sort by hash and put stability above range.
   * @param hash - the item's `stats.statGroupHash`.
   * @returns signed stat hashes in display order.
   */
  statOrder(hash: number | null): number[] {
    if (hash === null) return []
    const raw = this.row('statGroup', hash)
    const scaled = (raw?.scaledStats ?? []) as { statHash?: number }[]
    return scaled
      .map((entry) => entry.statHash)
      .filter((value): value is number => typeof value === 'number')
      .map((value) => (value > 2 ** 31 ? value - 2 ** 32 : value))
  }

  /**
   * A seal title, the way the game prints it under a character's name.
   *
   * Lives in `titleInfo.titlesByGender`, not `displayProperties.name` — the
   * latter is the record's own name ("突袭"), not the title it grants.
   * @param hash - `titleRecordHash` from the character.
   * @returns the title, or empty when the record grants none.
   */
  titleName(hash: number | null): string {
    if (hash === null) return ''
    const raw = this.row('record', hash)
    const info = (raw?.titleInfo ?? {}) as { titlesByGender?: Record<string, string>; hasTitle?: boolean }
    if (info.hasTitle !== true) return ''
    const byGender = info.titlesByGender ?? {}
    return byGender.Male ?? Object.values(byGender)[0] ?? ''
  }

  /** Localized stat name for a signed stat hash; empty when unknown. */
  statName(hash: number): string {
    const raw = this.row('stat', hash)
    const display = (raw?.displayProperties ?? {}) as Record<string, unknown>
    return typeof display.name === 'string' ? display.name : ''
  }

  /** One bucket definition, or `null` when unknown/unavailable. */
  bucket(hash: number): BucketDefinition | null {
    const raw = this.row('bucket', hash)
    return raw === null ? null : parseBucket(hash, raw)
  }

  /** One item definition, or `null` when unknown/unavailable. */
  item(hash: number): ItemDefinition | null {
    const raw = this.row('item', hash)
    return raw === null ? null : parseItem(hash, raw)
  }

  /** One plug definition; `null` both for unknown hashes and non-plug items. */
  plug(hash: number): PlugDefinition | null {
    const raw = this.row('item', hash)
    return raw === null ? null : parsePlug(hash, raw)
  }

  /** Release the database handle. */
  close(): void {
    if (this.db !== null) {
      this.db.close()
      this.db = null
    }
  }

  /** Cached row lookup keyed by table + unsigned hash. */
  private row(table: TableKey, hash: number): Record<string, unknown> | null {
    if (this.db === null) return null
    const key = `${table}:${hash}`
    if (this.cache.has(key)) return this.cache.get(key) ?? null
    let parsed: Record<string, unknown> | null = null
    try {
      const row = this.db.prepare(`select json from ${TABLE[table]} where id = ?`).get(toSignedHash(hash))
      const text = row?.json
      if (typeof text === 'string') parsed = JSON.parse(text) as Record<string, unknown>
    } catch {
      parsed = null
    }
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) this.cache.delete(oldest)
    }
    this.cache.set(key, parsed)
    return parsed
  }
}/** Narrow one plug definition row (a plug is an item definition with a `plug` block). */

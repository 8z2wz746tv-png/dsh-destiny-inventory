/**
 * Profile + Manifest → the bridge's wire shape.
 *
 * The browser half already speaks `ItemRow` / `PlayerProfileView` (see
 * `src/mcp/types.ts`). This module produces exactly those, so switching the data
 * source does not change the frontend contract.
 *
 * Degradation rule: a missing definition never becomes an empty string. The row
 * keeps the hash as a visible marker (`#1234`), the bucket keeps `bucket:5678`,
 * and the caller is told how many rows were degraded.
 */
import type { CharacterRow, EquippedState, ItemPlacement, ItemRow, ItemRarity } from '../mcp/types'

/** Bungie classType → the location key the frontend already uses. */
export const CLASS_LOCATION: Record<number, string> = { 0: 'titan', 1: 'hunter', 2: 'warlock' }

/** Bungie `DestinyItemType` values that matter here. */
const ITEM_TYPE_ARMOR = 2
const ITEM_TYPE_WEAPON = 3

/** Bungie `DestinyTierType` values. */
const TIER = { rare: 4, legendary: 5, exotic: 6 } as const

/** One character as the bridge reports it. */
export interface CharacterSource {
  characterId: string
  classType: number
  className: string
  light: number
  emblemPath: string | null
  emblemBackground: string | null
  /** Seal title text, empty when the character shows none. */
  title?: string
  lastPlayed: string | null
}

/** One item row plus the definitions that explain it. */
export interface ItemSource {
  key: string
  instanceId: string
  itemHash: number
  /** Component 205's slot hash when this row came from the equipment list. */
  slotHash: number | null
  quantity: number
  /** Which component delivered the row; position is derived from this. */
  source: 'profile' | 'character-inventory' | 'equipment' | 'postmaster'
  characterId: string | null
  locked: boolean
  power: number | null
  /** Gear tier 0..5 (component 300); 0 when the item predates tiers. */
  gearTier?: number
  /** Forged at the Relic. */
  crafted?: boolean
}

/** Whether component 205 answered for this snapshot. */
/** Definition lookups, injected so this module stays free of the store class. */
export interface DefinitionLookup {
  /** Full Manifest item definition: the detail view needs more than the row does. */
  item: (hash: number) => {
    name: string
    description: string
    icon: string
    itemType: number | null
    itemTypeDisplayName: string
    tierType: number | null
    tierTypeName: string
    /** Manifest `inventory.bucketTypeHash`: the classification bucket. */
    bucketTypeHash: number | null
    /** `defaultDamageType` enum value, resolved through `damageType`. */
    damageType: number | null
    /** `equippingBlock.ammoType`: 1 primary, 2 special, 3 heavy. */
    ammoType: number | null
    /** `stats.statGroupHash`: which ordered stat list applies. */
    statGroupHash: number | null
    /** Stat values by signed hash. */
    stats: Record<number, { value: number; displayMaximum: number }>
    /** Season watermark image path (relative to bungie.net). */
    watermark: string
    /** Champion counter: 0 none, 1 barrier, 2 overload, 3 unstoppable. */
    breakerType: number
    /** Definition owns a crafting socket. */
    craftingSocket: boolean
  } | null
  bucket: (hash: number) => { name: string } | null
  /** One perk/mod definition, or null when the hash is unknown. */
  plug: (hash: number) => { name: string; description: string; icon: string; plugCategoryIdentifier: string } | null
  /** Localized damage-type name for a `defaultDamageType` enum value. */
  damageType: (enumValue: number | null) => string
  /** Ordered stat hashes for one `statGroupHash`. */
  statOrder: (hash: number | null) => number[]
  /** Localized stat name for a signed stat hash. */
  statName: (hash: number) => string
}

/** Map `DestinyItemType` to the coarse kind the grid groups by. */
export function toKind(itemType: number | null): ItemRow['kind'] {
  if (itemType === ITEM_TYPE_WEAPON) return 'weapon'
  if (itemType === ITEM_TYPE_ARMOR) return 'armor'
  return 'other'
}

/** Map `DestinyTierType` to the four rarities the grid styles. */
export function toRarity(tierType: number | null): ItemRarity {
  if (tierType === TIER.exotic) return 'exotic'
  if (tierType === TIER.legendary) return 'legendary'
  if (tierType === TIER.rare) return 'rare'
  return 'unknown'
}

/**
 * One item row for the grid.
 * @param source - the profile-side item.
 * @param definitions - manifest lookups.
 * @param className - owner class key (`hunter`/`warlock`/`titan`), `''` in the vault.
 * @returns the wire row, with hash markers where definitions are missing.
 */
export function toItemRow(
  source: ItemSource,
  definitions: DefinitionLookup,
  className: string,
  equipped: EquippedState,
): ItemRow {
  const item = definitions.item(source.itemHash)
  // Classification comes from the definition, never from the instance row:
  // the platform reports `bucketHash` = General for every vault item.
  const bucketHash = item?.bucketTypeHash ?? null
  const bucket = bucketHash === null ? null : definitions.bucket(bucketHash)
  const placement = toPlacement(source)
  return {
    id: source.key,
    instanceId: source.instanceId,
    hash: source.itemHash,
    name: item === null || item.name === '' ? `#${source.itemHash}` : item.name,
    kind: toKind(item?.itemType ?? null),
    type: item?.itemTypeDisplayName ?? '',
    inventoryBucketHash: bucketHash,
    bucket: bucket?.name ?? null,
    power: source.power,
    equipped,
    locked: source.locked,
    quantity: source.quantity,
    icon: item?.icon ?? '',
    placement,
    locationKey: placementLocation(placement, className),
    characterId: source.characterId,
    rarity: toRarity(item?.tierType ?? null),
    gearTier: source.gearTier ?? 0,
    // Both must agree: the state bit alone tagged 933 of 1924 items.
    crafted: source.crafted === true && item?.craftingSocket === true,
    watermark: item?.watermark ?? '',
    breakerType: item?.breakerType ?? 0,
  }
}

/**
 * Derive the position from the component that delivered the row.
 * @param source - one profile row.
 * @returns the placement; equipment rows carry their 205 slot hash.
 */
export function toPlacement(source: ItemSource): ItemPlacement {
  if (source.source === 'equipment' && source.characterId !== null && source.slotHash !== null) {
    return { kind: 'equipped', characterId: source.characterId, slotHash: source.slotHash }
  }
  if (source.source === 'postmaster') {
    return { kind: 'postmaster', characterId: source.characterId }
  }
  if (source.characterId !== null) return { kind: 'inventory', characterId: source.characterId }
  return { kind: 'vault' }
}

/**
 * Which store column an item belongs to.
 *
 * Postmaster rows keep their owner's column so "whose mailbox" is answerable;
 * a postmaster row with no owner is genuinely account-level and falls to the
 * vault column instead of an unstyled one that renders nowhere.
 * @param placement - the item's position.
 * @param ownerClass - class key of the owning character, when there is one.
 */
function placementLocation(placement: ItemPlacement, ownerClass: string): string {
  if (placement.kind === 'equipped' || placement.kind === 'inventory') return ownerClass
  if (placement.kind === 'postmaster') return placement.characterId === null ? 'vault' : ownerClass
  return 'vault'
}

/** How many rows had to fall back to hash markers. */
export interface RowBatch {
  rows: ItemRow[]
  degraded: number
}

/**
 * Convert a whole snapshot.
 * @param items - profile items.
 * @param definitions - manifest lookups.
 * @param classByCharacter - characterId → class key.
 */
export function toItemRows(
  items: ItemSource[],
  definitions: DefinitionLookup,
  classByCharacter: Map<string, string>,
  equippedCharacters: Set<string> = new Set(),
): RowBatch {
  const rows = items.map((item) => {
    const placed = toPlacement(item)
    // A character with no equipment entry cannot be judged: `unknown`, never
    // "carries everything". Vault items have no owner and are never worn.
    const state: EquippedState =
      placed.kind === 'equipped'
        ? 'equipped'
        : placed.kind === 'inventory' && !equippedCharacters.has(placed.characterId)
          ? 'unknown'
          : 'not_equipped'
    return toItemRow(
      item,
      definitions,
      item.characterId === null ? '' : (classByCharacter.get(item.characterId) ?? ''),
      state,
    )
  })
  const degraded = rows.filter((row) => row.name.startsWith('#')).length
  return { rows, degraded }
}

/** One character row for the header. */
export function toCharacterRow(source: CharacterSource): CharacterRow {
  return {
    characterId: source.characterId,
    classType: source.classType,
    className: source.className,
    light: source.light,
    emblemPath: source.emblemPath,
    emblemBackground: source.emblemBackground,
    title: source.title ?? '',
    lastPlayed: source.lastPlayed,
  }
}

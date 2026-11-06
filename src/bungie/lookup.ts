/**
 * The read facade the host layer consumes.
 *
 * Kept out of `manifest.ts` so the store file stays inside its ceiling, and
 * declared here rather than in `host/` so the dependency arrow keeps pointing
 * downward: `host → bungie`, never the reverse.
 */
import type { BucketDefinition, ManifestStore } from './manifest'

/** Definition lookups the host layer is allowed to use. */
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
    /** Which class can wear it: 0 Titan, 1 Hunter, 2 Warlock, 3 any. */
    classType: number | null
    /** `itemCategoryHashes`, most specific last. */
    categoryHashes: number[]
    /** Definition owns a crafting socket. */
    craftingSocket: boolean
  } | null
  /** Full bucket definition: name for the receipt, `itemCount` for capacity. */
  bucket: (hash: number) => BucketDefinition | null
  /** One perk/mod definition, or null when the hash is unknown. */
  plug: (hash: number) => {
    name: string
    description: string
    icon: string
    plugCategoryIdentifier: string
  } | null
  /** Localized damage-type name for a `defaultDamageType` enum value. */
  damageType: (enumValue: number | null) => string
  /** Absolute icon URL for that damage type. */
  damageTypeIcon: (enumValue: number | null) => string
  /** Ordered stat hashes for one `statGroupHash`. */
  statOrder: (hash: number | null) => number[]
  /** Localized stat name for a signed stat hash. */
  statName: (hash: number) => string
}

/**
 * Bind a store's readers into the facade.
 * @param store - the manifest store.
 * @returns the lookup the host layer consumes.
 */
export function buildLookup(store: ManifestStore): DefinitionLookup {
  return {
    item: (hash) => store.item(hash),
    bucket: (hash) => store.bucket(hash),
    plug: (hash) => store.plug(hash),
    damageType: (value) => store.damageType(value),
    damageTypeIcon: (value) => store.damageTypeIcon(value),
    statOrder: (hash) => store.statOrder(hash),
    statName: (hash) => store.statName(hash),
  }
}

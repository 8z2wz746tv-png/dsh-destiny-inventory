export type InventoryCategory = "weapons" | "armor" | "general" | "postmaster";
export type InventoryCategoryFilter = "all" | InventoryCategory;
export type InventoryClass = "hunter" | "warlock" | "titan" | "unknown";
export type InventoryTier = "exotic" | "legendary" | "rare" | "common" | "unknown";
export type InventoryDamage = "kinetic" | "solar" | "arc" | "void" | "stasis" | "strand" | "unknown";
export type InventoryLockFilter = "all" | "locked" | "unlocked";
export type InventorySort = "power-desc" | "name-asc" | "type-asc" | "tier-desc";

export interface InventoryFilters {
  typeName: string;
  damage: "all" | InventoryDamage;
  tier: "all" | InventoryTier;
  ammoType: string;
  lockState: InventoryLockFilter;
  duplicatesOnly: boolean;
}

export interface InventoryStats {
  weapons?: number;
  health?: number;
  classStat?: number;
  grenade?: number;
  melee?: number;
  superStat?: number;
}

export interface InventoryWeaponStatView {
  hash: number;
  name: string;
  value: number;
  display: "bar" | "number";
}

export interface InventoryPerkView {
  hash: number;
  name: string;
  description?: string;
  iconUrl: string;
  category?: string;
  categoryLabel?: string;
  kind: "intrinsic" | "origin" | "masterwork" | "mod" | "perk";
  enabled: boolean;
  /** Selection share from the recorded community snapshot; null means unavailable. */
  selectionRate?: number | null;
  /** True when this plug is one of the options present on this weapon instance. */
  owned?: boolean;
  /** Enhanced perk variant, when the manifest exposes the distinction. */
  isEnhanced?: boolean;
  /** Explicit same-socket link to the enhanced variant when pairing is unambiguous. */
  enhancedPerkHash?: number;
  /** Explicit same-socket link back to the normal variant. */
  basePerkHash?: number;
}

export interface InventorySocketPlugView extends InventoryPerkView {
  selected: boolean;
  socketIndex: number;
  socketCategoryHash: number;
}

export interface InventorySocketColumnView {
  socketIndex: number;
  socketCategoryHash: number;
  label: string;
  visible: boolean;
  plugs: InventorySocketPlugView[];
}

export interface InventorySocketRowView {
  id: string;
  label: string;
  columns: InventorySocketColumnView[];
}

export interface InventorySocketGroupsView {
  intrinsics: InventorySocketColumnView[];
  perkColumns: InventorySocketColumnView[];
  socketRows: InventorySocketRowView[];
}

export interface InventoryWeaponKillTrackers {
  pve?: number;
  pvp?: number;
}

export interface InventoryItemView {
  id: string;
  hash: number;
  name: string;
  typeName: string;
  bucketId: string;
  ownerId: string;
  locationId: string;
  iconUrl: string;
  power?: number | null;
  quantity: number;
  equipped: boolean;
  locked: boolean;
  transferable: boolean;
  tier: InventoryTier;
  classType: InventoryClass;
  damageType?: InventoryDamage;
  stats?: InventoryStats;
  description?: string;
  flavorText?: string;
  watermarkUrl?: string;
  ammoType?: string;
  weaponStats?: InventoryWeaponStatView[];
  perks?: InventoryPerkView[];
  socketGroups?: InventorySocketGroupsView;
  /** Lightweight instance ownership facts, keyed by socket index. */
  ownedPlugHashesBySocket?: Record<string, number[]>;
  /** Destiny gear tier, when the instance exposes the post-Edge of Fate tier. */
  gearTier?: number;
  crafted?: boolean;
  enhanced?: boolean;
  enhanceable?: boolean;
  weaponLevel?: number;
  killTrackers?: InventoryWeaponKillTrackers;
}

export interface InventoryStoreView {
  id: string;
  kind: "character" | "vault";
  label: string;
  classType: InventoryClass;
  emblemUrl?: string;
  backgroundUrl?: string;
  power?: number | null;
  current?: boolean;
  items: InventoryItemView[];
}

export interface InventoryBucketView {
  id: string;
  label: string;
  category: InventoryCategory;
  equippable: boolean;
  capacity?: number;
  vaultBucketId?: string;
}

export interface InventoryOverviewPayload {
  ok: true;
  profile: {
    userId: string;
    displayName: string;
    profileName: string;
    refreshedAt: string;
  };
  buckets: InventoryBucketView[];
  stores: InventoryStoreView[];
}

export interface InventoryWeaponPerkPoolPayload {
  ok: true;
  itemHash: number;
  name: string;
  typeName: string;
  iconUrl: string;
  socketGroups: InventorySocketGroupsView;
  popularity?: {
    available: boolean;
    source?: Record<string, unknown> | null;
    warnings?: string[];
  };
}

export type InventoryAction =
  | {
    action: "transfer";
    itemId: string;
    /** Additional instances selected in one DIM-style drag. */
    itemIds?: string[];
    /** One optional overflow instance per item, moved to vault first. */
    overflowItemIds?: Array<string | null>;
    target: Exclude<InventoryClass, "unknown"> | "vault";
    targetCharacterId?: string;
  }
  | { action: "equip"; itemId: string; target: Exclude<InventoryClass, "unknown">; targetCharacterId?: string }
  | { action: "lock"; itemId: string; locked: boolean }
  | { action: "pull_postmaster"; itemId: string; target: Exclude<InventoryClass, "unknown">; targetCharacterId?: string };

export interface InventoryActionPayload {
  ok: true;
  action: InventoryAction["action"];
  message: string;
  /** Overflow instances the server actually moved after checking its latest profile. */
  movedOverflowItemIds?: string[];
}

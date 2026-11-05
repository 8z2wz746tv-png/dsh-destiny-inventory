/**
 * DTOs returned by the plugin's HTTP bridge.
 *
 * These are the plugin's own wire shape, deliberately narrower than the MCP
 * payload: the browser half must never depend on Bungie's component layout, and
 * the tools' envelope (MCP content blocks wrapping a JSON string) never crosses
 * the bridge.
 */

/** The rarities the tool can filter on, plus the honest remainder. */
export type ItemRarity = 'exotic' | 'legendary' | 'rare' | 'unknown'

/**
 * Whether an instance is worn right now.
 *
 * `unknown` is a first-class state: when component 205 did not load we cannot
 * tell equipped from carried, and pretending otherwise would silently turn the
 * whole account into "nothing is equipped".
 */
export type EquippedState = 'equipped' | 'not_equipped' | 'unknown'

/**
 * Where one instance sits right now.
 *
 * Position comes from *which profile component delivered the row*, never from a
 * hash: the platform reports the same `bucketHash` for every vault item.
 */
export type ItemPlacement =
  | { kind: 'equipped'; characterId: string; slotHash: number }
  | { kind: 'inventory'; characterId: string }
  | { kind: 'vault' }
  | { kind: 'postmaster'; characterId: string | null }

/** One character as the inventory view needs it. */
export interface CharacterRow {
  characterId: string
  /** Bungie classType: 0 Titan, 1 Hunter, 2 Warlock. */
  classType: number
  /** Localized class name as the MCP reports it. */
  className: string
  light: number
  emblemPath: string | null
  /** Wide name-card banner; the class card paints this, falling back to nothing. */
  emblemBackground: string | null
  /** Seal title the character displays (e.g. 魅痕克星); empty when none. */
  title: string
  lastPlayed: string | null
}

/** The player header the view renders above the character buckets. */
export interface PlayerProfileView {
  displayName: string
  membershipId: string
  triumphScore: number | null
  characters: CharacterRow[]
}

/**
 * Where an item lives. `profile` is the account-wide bucket (materials,
 * consumables, mods); `postmaster` is the postmaster.
 */
export type ItemLocation = 'vault' | 'hunter' | 'warlock' | 'titan' | 'profile' | 'postmaster' | string

/**
 * One inventory item, trimmed to what the grid paints.
 *
 * Sockets, perks and stats are deliberately absent: they cost ~7 KB per item
 * and belong to the on-demand detail read, not to a 1900-row snapshot.
 */
export interface ItemRow {
  /** Stable grid key; not usable as a Bungie instance id (stackables have none). */
  id: string
  /** Raw Bungie instance id as the tool reports it; `"0"` for stackables. */
  instanceId: string
  hash: number
  name: string
  /** `weapon`, `armor` or `other`, from the tool's `item_type`. */
  kind: 'weapon' | 'armor' | 'other'
  /** Localized item type, e.g. 手炮 / 腿部护甲. */
  type: string
  /**
   * Classification bucket, from Manifest `inventory.bucketTypeHash`.
   * `null` when the definition is missing — never a placeholder string.
   */
  inventoryBucketHash: number | null
  /** Localized bucket name from the Manifest; `null` when the definition is missing. */
  bucket: string | null
  power: number | null
  equipped: EquippedState
  locked: boolean
  quantity: number
  icon: string
  /** Full position semantics. */
  placement: ItemPlacement
  /**
   * Display key derived from `placement`: `vault`, `postmaster`, or the owner's
   * class key. Kept so the grid does not need the character table; it carries no
   * meaning that `placement` does not already have.
   */
  locationKey: string
  characterId: string | null
  /**
   * Rarity, recovered from the three rarity-filtered reads.
   *
   * The tool exposes rarity as a filter, never as a field, and it only knows
   * exotic/legendary/rare — so 81 of 1922 items (commons, consumables) come back
   * `unknown` and are drawn neutral rather than guessed.
   */
  rarity: ItemRarity
  /** Gear tier 0..5; 0 means the item predates the tier system. */
  gearTier: number
  /** Forged at the Relic: DIM marks these with a red corner badge. */
  crafted: boolean
  /**
   * A write is in flight, or the last one failed and the truth is unknown.
   *
   * View state only: the real location is always whatever Bungie says. The panel
   * uses it to draw a pending ring rather than pretending the move either happened
   * or did not.
   */
  pending?: 'applying' | 'unconfirmed'
  /** Masterworked: DIM paints the whole tile gold. */
  masterwork: boolean
  /** Season watermark image (the icon's top-left corner). */
  watermark: string
  /** Bungie `classType` of the item: 0 Titan, 1 Hunter, 2 Warlock, 3 any. */
  classType: number
  /** Bungie `itemCategoryHashes`, most specific last; drives the row glyph. */
  categoryHashes: number[]
  /** Localized ammo type (primary/special/heavy); empty for armor. */
  ammoType: string
  /** Localized damage-type name; empty when the definition reports none. */
  damageType: string
  /** `defaultDamageType` enum value, so groups sort in Bungie's order not A-Z. */
  damageRank: number
  /** Champion this weapon counters: 0 none, 1 barrier, 2 overload, 3 unstoppable. */
  breakerType: number
}

/** One cached read of the whole account inventory. */
export interface InventorySnapshot {
  /** Epoch milliseconds of the read that produced this snapshot. */
  fetchedAt: number
  /** How many items the account holds in total. */
  total: number
  items: ItemRow[]
  /** Set when a page read was cut short; the view shows this instead of pretending. */
  truncated: boolean
  /**
   * The game's own badge artwork (crafted chip, tier markers).
   *
   * Handed down with the inventory so tiles never invent a shape the game
   * already ships.
   */
  overlays?: { crafted: string; craftedBackground: string; tiers: string[] }
}

/** One selectable perk in a socket column. */
export interface PerkOptionView {
  hash: number
  name: string
  description: string
  icon: string
  /** Whether this option is currently socketed on this instance. */
  selected: boolean
  /** Enhanced variant of this perk, when the manifest links one. */
  enhancedHash: number
  /** Stat deltas the perk applies, as the tool reports them. */
  statEffects: { stat: string; value: number }[]
}

/** One socket column: every option it can hold, with the socketed one marked. */
export interface PerkColumnView {
  socketIndex: number
  /** Localized column label, e.g. 枪管 / 弹匣 / 插槽1. */
  slot: string
  kind: string
  options: PerkOptionView[]
  /** True when the manifest published the option list for this socket. */
  optionsAvailable: boolean
}

/** Everything the detail card paints for one item. */
export interface ItemDetailView {
  id: string
  instanceId: string
  hash: number
  name: string
  kind: 'weapon' | 'armor' | 'other'
  icon: string
  power: number | null
  equipped: EquippedState
  locked: boolean
  quantity: number
  location: string
  /** Weapon/armor definition facts; empty when the manifest could not supply them. */
  rarity: string
  damageType: string
  /** Absolute icon URL for the damage type (the game's own glyph). */
  damageIcon: string
  ammoType: string
  weaponType: string
  frame: string
  description: string
  columns: PerkColumnView[]
  /**
   * Stat lines in the game's own display order.
   *
   * A `number` display means the value has no meaningful bar (RPM, magazine,
   * recoil direction) — same rule DIM applies.
   */
  stats: { hash: number; name: string; value: number; display: 'bar' | 'number' | 'recoil' }[]
  /** Gear tier (T1..T5), null when the instance reports none. */
  gearTier: number | null
  /** Weapon/armor level. */
  itemLevel: number | null
  /** Forged at the Relic. */
  crafted: boolean
  /** Masterworked: the tile paints its icon gold. */
  masterwork: boolean
  /**
   * Kills the installed tracker has recorded, when one is socketed.
   *
   * `null` when the weapon carries no tracker; a weapon with a tracker that has
   * never killed anything reports 0, which is different.
   */
  killCount: number | null
  /** Masterworked or enhanced. */
  enhanced: boolean
  /**
   * The exotic's own effect, drawn as its own block above the perks.
   *
   * DIM gives this a full row with the flavour text; without it the card reads as
   * a pile of ordinary perks with no explanation of what makes the item exotic.
   */
  intrinsic: { name: string; description: string; icon: string } | null
  /** One line describing the current roll, as the tool words it. */
  rollSummary: string
}

/** One account write the browser half can request. */
export type ActionRequest =
  | { kind: 'move'; instanceId: string; destination: string; equip?: boolean }
  | { kind: 'lock'; instanceId: string; locked: boolean; character?: string }
  | { kind: 'pull_postmaster'; instanceId: string; character?: string }
  | { kind: 'equip'; instanceId: string; character?: string; confirmed?: boolean }

/** What the write actually did, plus the preview the envelope returned. */
export interface ActionReceipt {
  kind: ActionRequest['kind']
  /** True when the account changed; false when the request stopped at a preview. */
  applied: boolean
  /** The tool's own sentence describing the change. */
  message: string
  /** Human-readable summary of what the envelope would replay. */
  summary: string
  /** Present when the write needs the user to confirm before it is sent again. */
  needsConfirm?: boolean
  /** The replayable arguments the confirmation envelope handed back. */
  replay?: Record<string, unknown>
}

/** Envelope for every bridge response, so failures stay typed on the wire. */
export type BridgeResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } }

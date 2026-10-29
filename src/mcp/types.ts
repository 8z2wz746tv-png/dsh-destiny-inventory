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

/** One character as the inventory view needs it. */
export interface CharacterRow {
  characterId: string
  /** Bungie classType: 0 Titan, 1 Hunter, 2 Warlock. */
  classType: number
  /** Localized class name as the MCP reports it. */
  className: string
  light: number
  emblemPath: string | null
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
  /** Inventory bucket the item sits in, e.g. Kinetic Weapons. */
  bucket: string
  power: number | null
  equipped: boolean
  locked: boolean
  quantity: number
  icon: string
  location: ItemLocation
  characterId: string
  /**
   * Rarity, recovered from the three rarity-filtered reads.
   *
   * The tool exposes rarity as a filter, never as a field, and it only knows
   * exotic/legendary/rare — so 81 of 1922 items (commons, consumables) come back
   * `unknown` and are drawn neutral rather than guessed.
   */
  rarity: ItemRarity
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
  equipped: boolean
  locked: boolean
  quantity: number
  location: string
  /** Weapon/armor definition facts; empty when the manifest could not supply them. */
  rarity: string
  damageType: string
  ammoType: string
  weaponType: string
  frame: string
  description: string
  columns: PerkColumnView[]
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

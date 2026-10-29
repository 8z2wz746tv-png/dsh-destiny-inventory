/**
 * DTOs returned by the plugin's HTTP bridge.
 *
 * These are the plugin's own wire shape, deliberately narrower than the MCP
 * payload: the browser half must never depend on Bungie's component layout, and
 * the tools' envelope (MCP content blocks wrapping a JSON string) never crosses
 * the bridge.
 */

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
  id: string
  hash: number
  name: string
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
   * True when the item came back from the `rarity=异域` read. The snapshot has
   * no rarity field of its own — the MCP exposes rarity as a filter only — so
   * every other item is reported as unknown rather than assumed legendary.
   */
  exotic: boolean
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

/** Envelope for every bridge response, so failures stay typed on the wire. */
export type BridgeResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } }

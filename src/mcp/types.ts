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

/** Envelope for every bridge response, so failures stay typed on the wire. */
export type BridgeResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } }

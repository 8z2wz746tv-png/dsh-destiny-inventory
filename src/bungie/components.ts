/**
 * Destiny profile component ids.
 *
 * One definition for the whole host data plane, mirroring the MCP's
 * `services/profile_components.py` so both sides ask for the same sets.
 *
 * Why a module and not literals: a component left out of the request is not an
 * error upstream — it simply does not come back, and the lack of `305` then
 * looks like "socket matching is broken" instead of "we never asked".
 */

/** Bungie `DestinyComponentType` values this plugin uses. */
export const Component = {
  /** Profile identity: displayName lives here (without it the name comes back empty). */
  profiles: 100,
  /** Account-wide item list (vault + consumables + materials). */
  profileInventory: 102,
  /** Character rows (class, light, emblem, last played). */
  characters: 200,
  /** Items carried by each character. */
  characterInventories: 201,
  /** Items currently equipped on each character. */
  characterEquipment: 205,
  /** Per-instance state: light, gear tier, and `isEquipped`. */
  itemInstances: 300,
  itemStats: 304,
  /** Per-instance sockets (what is plugged in). */
  itemSockets: 305,
  itemReusablePlugs: 310,
  itemPlugObjectives: 309,
} as const

/**
 * The component set for the inventory grid.
 *
 * `300` is required for `isEquipped`; sockets are deliberately absent here and
 * requested per item on demand (a full socket payload is several KB per item).
 */
export const INVENTORY_COMPONENTS: number[] = [
  Component.profiles,
  Component.profileInventory,
  Component.characters,
  Component.characterInventories,
  Component.characterEquipment,
  Component.itemInstances,
  // Current stat values live per instance: armor has no stats in its definition
  // at all, and a weapon's definition carries base values without its perks.
  Component.itemStats,
]

/**
 * The component set for one item's detail card.
 *
 * Note: requesting only `305` returns no sockets at all upstream, so the
 * inventory components must always accompany it.
 */
export const ITEM_DETAIL_COMPONENTS: number[] = [
  ...INVENTORY_COMPONENTS,
  Component.itemSockets,
  Component.itemReusablePlugs,
  Component.itemPlugObjectives,
]

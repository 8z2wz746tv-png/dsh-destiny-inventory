/**
 * Stat display order and formatting rules, ported from DIM.
 *
 * DIM does not trust the manifest's `scaledStats` order: it keeps its own
 * allow-list, sorts by position in that list, and pushes anything unlisted to the
 * end. That is why magazine and recoil direction sit last in the game UI while
 * stability sits mid-list.
 */

/**
 * Which stats to show, in display order (`itemStatAllowList` in DIM).
 *
 * Signed hashes: the manifest stores unsigned ids, the rest of this project uses
 * signed ones.
 */
export const STAT_ORDER: number[] = [
  -10074103, // RoundsPerMinute
  -1333570656, // ChargeTime
  447667954, // DrawTime
  -680293697, // BlastRadius
  -1771501455, // Velocity
  -1209571963, // Persistence
  -1457759550, // SwingSpeed
  -251443477, // Impact
  1240592695, // Range
  1842278586, // ShieldDuration
  -1532896101, // GuardEfficiency
  209426660, // GuardResistance
  1591432999, // Accuracy
  155624089, // Stability
  943549884, // Handling
  602570185, // VentSpeed
  -1272665613, // ChargeRate
  -558119204, // GuardEndurance
  -106935929, // ReloadSpeed
  1345609583, // AimAssistance
  -1580510128, // AirborneEffectiveness
  -739697958, // Zoom
  1931675084, // AmmoGeneration
  -813672534, // HeatGenerated
  -288572571, // CoolingEfficiency
  -1579127956, // RecoilDirection
  -423736230, // Magazine
  925767036, // AmmoCapacity
]

/** Unlisted stats sort after listed ones, ordered by hash — DIM's rule. */
export function statSortOrder(hash: number): number {
  const index = STAT_ORDER.indexOf(hash)
  return index === -1 ? 999999 + Math.abs(hash) : index
}

/**
 * Stats the game prints as a bare number instead of a bar.
 *
 * Same list DIM uses (`statsNoBar`, plus the millisecond stats).
 */
export const NO_BAR = new Set<number>([
  -10074103, // RoundsPerMinute
  -423736230, // Magazine
  -1579127956, // RecoilDirection
  447667954, // DrawTime
  -1333570656, // ChargeTime
])

/** Recoil direction draws as a gauge, not a bar (DIM's `RecoilStat`). */
export const RECOIL_DIRECTION = -1579127956

/**
 * Armor's six stats, in the order the game lists them.
 *
 * Separate from `STAT_ORDER`: that is the weapon table, and an armor piece has
 * none of those stats, so without this every armor stat fell to the hash-ordered
 * tail and the sheet read in a meaningless order.
 */
export const ARMOR_STAT_ORDER: number[] = [
  392767087, // Health
  -50400078, // Melee
  1735777505, // Grenade
  144602215, // Super
  1943323491, // Class
  -1298820321, // Weapons
]

/** Display position for one armor stat; unlisted ones sort after, by hash. */
export function armorStatSortOrder(hash: number): number {
  const index = ARMOR_STAT_ORDER.indexOf(hash)
  return index === -1 ? 999999 + Math.abs(hash) : index
}

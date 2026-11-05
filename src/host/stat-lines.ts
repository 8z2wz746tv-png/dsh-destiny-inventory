/**
 * The stat sheet: which stats to show, in what order, with what value.
 *
 * Armor and weapons answer differently — armor's six stats exist only per
 * instance (component 304), and its definition carries no `statGroupHash`.
 */
import type { DefinitionLookup } from '../bungie/lookup'
import { ARMOR_STAT_ORDER, NO_BAR, RECOIL_DIRECTION } from './stat-order'

/** One rendered stat row. */
export interface StatLine {
  hash: number
  name: string
  value: number
  display: 'bar' | 'number' | 'recoil'
}

export function statLines(
  definition: { statGroupHash: number | null; stats: Record<number, { value: number; displayMaximum: number }> } | null,
  definitions: DefinitionLookup,
  isArmor: boolean,
  stats: Record<number, number> = {},
): { hash: number; name: string; value: number; display: 'bar' | 'number' | 'recoil' }[] {
  // Armor has no statGroupHash (its six stats are per instance, not per
  // definition), so the sheet's own list drives the walk instead.
  if (definition === null) return []
  return (isArmor ? ARMOR_STAT_ORDER : definitions.statOrder(definition.statGroupHash))
    .flatMap((hash) => {
      // Component 304 wins when it has the stat: those are the values the game
      // shows (base + perks). Armor carries nothing in the definition at all, so
      // its six stats only exist here.
      const instanceValue = stats[hash]
      const entry = instanceValue === undefined ? definition.stats[hash] : { value: instanceValue, displayMaximum: 100 }
      // Zero is a real value on armor (a piece can genuinely roll 0 Health), so
      // only a missing entry drops the row.
      if (entry === undefined) return []
      const name = definitions.statName(hash)
      if (name === '') return []
      const display = hash === RECOIL_DIRECTION ? ('recoil' as const) : NO_BAR.has(hash) ? ('number' as const) : ('bar' as const)
      return [{ hash, name, value: entry.value, display }]
    })

}

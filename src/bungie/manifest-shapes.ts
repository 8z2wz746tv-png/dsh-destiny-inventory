/**
 * Definition shape readers.
 *
 * Pure functions over one decoded Manifest row: no database, no cache. Split out
 * so the store file stays inside its size ceiling.
 */
/**
 * Read an item definition's stat values.
 *
 * Bungie keys these by unsigned hash while the rest of the pipeline uses signed
 * ones; convert once here rather than at every lookup.
 * @param raw - the definition's `stats` block.
 * @returns values by signed stat hash.
 */
export function readStatValues(raw: unknown): Record<number, { value: number; displayMaximum: number }> {
  const block = (raw ?? {}) as { stats?: Record<string, { value?: number; displayMaximum?: number }> }
  const out: Record<number, { value: number; displayMaximum: number }> = {}
  for (const [hash, entry] of Object.entries(block.stats ?? {})) {
    const key = Number(hash)
    out[key > 2 ** 31 ? key - 2 ** 32 : key] = {
      value: typeof entry.value === 'number' ? entry.value : 0,
      displayMaximum:
        typeof entry.displayMaximum === 'number' && entry.displayMaximum > 0 ? entry.displayMaximum : 100,
    }
  }
  return out
}

/**
 * Socket type in the weapon-crafting category.
 *
 * The manifest stores socket type hashes **unsigned** (3583996951); DIM's own
 * constant is the signed form (-710970345). Comparing signed against this table
 * silently matched nothing, which is why every crafted badge disappeared.
 */
const CRAFTING_SOCKET_TYPE = 3583996951

/** Does this definition own a crafting socket? */
export function hasCraftingSocket(raw: unknown): boolean {
  const entries = ((raw ?? {}) as { socketEntries?: { socketTypeHash?: number }[] }).socketEntries ?? []
  return entries.some((entry) => entry.socketTypeHash === CRAFTING_SOCKET_TYPE)
}

/**
 * Read the game's icon-overlay paths.
 *
 * These are the exact images DIM paints for the crafted chip and the tier
 * marker, so we never hand-draw a badge the game already ships.
 * @param raw - `DestinyInventoryItemConstantsDefinition`.
 * @param origin - bungie.net origin to prefix relative paths with.
 * @returns absolute URLs; empty strings/lists when the constants are missing.
 */
export function parseOverlays(
  raw: unknown,
  origin: string,
): { crafted: string; craftedBackground: string; tiers: string[] } {
  const block = (raw ?? {}) as Record<string, unknown>
  const path = (key: string): string =>
    typeof block[key] === 'string' ? `${origin}${block[key] as string}` : ''
  return {
    crafted: path('craftedOverlayPath'),
    craftedBackground: path('craftedBackgroundPath'),
    tiers: Array.isArray(block.gearTierOverlayImagePaths)
      ? (block.gearTierOverlayImagePaths as string[]).map((entry) => `${origin}${entry}`)
      : [],
  }
}

/**
 * Decode every damage-type definition into name + icon.
 *
 * The manifest keys these by `enumValue`, not by hash, so the whole table has to
 * be walked once and cached under the enum.
 * @param rows - raw `DestinyDamageTypeDefinition` rows.
 * @param origin - bungie.net origin to prefix icon paths with.
 * @returns name and absolute icon URL by enum value.
 */
export function parseDamageTypes(
  rows: { json: string }[],
  origin: string,
): Map<number, { name: string; icon: string }> {
  const out = new Map<number, { name: string; icon: string }>()
  for (const row of rows) {
    const definition = JSON.parse(row.json) as Record<string, unknown>
    const value = definition.enumValue
    if (typeof value !== 'number') continue
    const display = (definition.displayProperties ?? {}) as Record<string, unknown>
    const icon = typeof display.icon === 'string' ? `${origin}${display.icon}` : ''
    out.set(value, { name: typeof display.name === 'string' ? display.name : '', icon })
  }
  return out
}

/**
 * Read an item's category hashes.
 *
 * They arrive unsigned; the project compares signed values, so convert here the
 * same way the rest of the manifest readers do.
 * @param row - the parsed item definition.
 * @returns signed category hashes, most specific last.
 */
export function readCategoryHashes(row: Record<string, unknown>): number[] {
  const raw = row.itemCategoryHashes
  if (!Array.isArray(raw)) return []
  return raw
    .filter((value): value is number => typeof value === 'number')
    .map((value) => (value > 2 ** 31 ? value - 2 ** 32 : value))
}

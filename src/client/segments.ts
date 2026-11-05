/**
 * Split one vault cell's items into groups, as DIM's `StoreBucket` does.
 *
 * The grouping lives *inside* the vault cell: character cells always stay a flat
 * 3x3 grid, and the row itself is still one bucket. Splitting rows by weapon type
 * — which is what an earlier attempt did — breaks the four columns' alignment for
 * no gain.
 */
import type { ItemRow } from '../host/types'
import { classGlyph, weaponGlyph } from './group-glyphs'

/** One block inside a vault cell: a head glyph plus the items under it. */
export interface CellSegment {
  label: string
  /** SVG markup for the block head, or null when the group has no glyph. */
  icon: string | null
  items: ItemRow[]
}

const CLASS_LABEL: Record<number, string> = { 0: '泰坦', 1: '猎人', 2: '术士', 3: '通用' }
const CLASS_RANK: Record<number, number> = { 0: 0, 1: 1, 2: 2, 3: 3 }

/**
 * Group a vault cell's items.
 *
 * Weapons split by archetype, armor by the class that wears it; anything else is
 * left as one block, because neither axis means anything for it.
 * @param items - the cell's items, already sorted by the caller's chosen order.
 * @param kind - the section's item kind.
 * @returns blocks in display order; a single unlabelled block when there is
 *   nothing to group by.
 */
export function segmentsOf(items: ItemRow[], kind: string): CellSegment[] {
  if (items.length === 0) return []
  // Shelves have no axis to group by, and an empty wrapper would break their grid:
  // the caller falls back to a flat list, which is what the 5x2 engram layout needs.
  if (kind !== 'weapons' && kind !== 'armor') return []

  const byKey = new Map<string, CellSegment>()
  for (const item of items) {
    const [label, rank, icon] =
      kind === 'armor'
        ? [
            CLASS_LABEL[item.classType] ?? '通用',
            CLASS_RANK[item.classType] ?? 3,
            classGlyph(item.classType),
          ]
        : [item.type === '' ? '其他' : item.type, 0, weaponGlyph(item.categoryHashes)]

    const existing = byKey.get(label)
    if (existing !== undefined) {
      existing.items.push(item)
      continue
    }
    // The rank rides on the key so a class section keeps Titan/Hunter/Warlock order
    // without a second pass; weapon groups follow the items' own sort.
    byKey.set(label, { label: `${String(rank).padStart(2, '0')}${label}`, icon, items: [item] })
  }
  return [...byKey.values()]
    .sort((left, right) => left.label.localeCompare(right.label))
    .map((segment) => ({ ...segment, label: segment.label.slice(2) }))
}

/**
 * Inline layout for the engram shelf.
 *
 * Inline, not a class: three attempts at a selector all lost to the cell's own
 * flex rules, and a stylesheet fight is not worth another round.
 */
export const ENGRAM_SHELF_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(5, 52px)',
  gridAutoRows: '52px',
  gap: '2px',
  alignContent: 'start',
  inlineSize: '268px',
} as const

/** The cell that holds the shelf: fixed width, never stretched by flex. */
export const ENGRAM_CELL_STYLE = {
  flex: '0 0 268px',
  inlineSize: '268px',
  minInlineSize: '0',
  maxInlineSize: '268px',
} as const

/** A slot in the shelf grid. */
export const ENGRAM_TILE_STYLE = { inlineSize: '52px', blockSize: '52px' } as const

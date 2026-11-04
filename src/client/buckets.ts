/**
 * Inventory bucket → section, mirroring DIM's `d2-bucket-categories.ts`.
 *
 * DIM's page is organized by *bucket*, not by item type: the weapons section is
 * three rows (kinetic / energy / power), armor is five rows (one per slot). Our
 * rows used to be item types ("手炮", "头盔"), which mixed slots together and
 * made the weapon column look like a soup of gun archetypes.
 *
 * Hash values are Bungie's `BucketHashes` (the same constants DIM uses).
 */

/** One top-level section: a label plus the buckets it owns, in display order. */
export interface BucketSection {
  id: string
  label: string
  hashes: number[]
}

/** Buckets that are not listed anywhere below fall into this section. */
export const FALLBACK_SECTION = 'inventory'

/** DIM's `D2Categories`, in page order. */
export const BUCKET_SECTIONS: BucketSection[] = [
  {
    id: 'postmaster',
    label: '邮政官',
    hashes: [215593132, 3161908920, 1367666825],
  },
  {
    // Its own section, as in game: engrams are a ten-slot shelf, not mailbox
    // mail, and DIM draws them small for exactly that reason.
    id: 'engrams',
    label: '记忆水晶',
    hashes: [375726501],
  },
  {
    id: 'weapons',
    label: '武器',
    hashes: [1498876634, 2465295065, 953998645],
  },
  {
    id: 'armor',
    label: '护甲',
    hashes: [3448274439, 3551918588, 14239492, 20886954, 1585787867],
  },
  {
    id: 'general',
    label: '通用',
    hashes: [3284755031, 1506418338, 4023194814, 4274335291, 284967655, 2025709351, 1107761855, 3683254069],
  },
  {
    id: 'inventory',
    label: '物品',
    hashes: [687325600, 1469714392, 3313201758],
  },
]

/**
 * Buckets that keep their row even when empty.
 *
 * The mailbox is a fixed 21-slot shelf you always see in game, and the engram
 * shelf is a fixed 10; hiding them when empty would make the page's structure
 * change shape from day to day.
 */
export const ALWAYS_SHOWN: Record<string, { hash: number; label: string; capacity: number }[]> = {
  // One mailbox, not one row per mail bucket: DIM draws a single 21-slot shelf
  // and fills it with whatever the three mail buckets hold.
  postmaster: [{ hash: 215593132, label: '邮政官', capacity: 21 }],
  engrams: [{ hash: 375726501, label: '记忆水晶', capacity: 10 }],
}

/** bucket hash → owning section id. */
const SECTION_OF = new Map<number, string>()
/** bucket hash → rank inside its section (keeps DIM's row order). */
const ORDER_OF = new Map<number, number>()
for (const section of BUCKET_SECTIONS) {
  section.hashes.forEach((hash, index) => {
    SECTION_OF.set(hash, section.id)
    ORDER_OF.set(hash, index)
  })
}

/**
 * Which section an item belongs to.
 *
 * Classification comes from the Manifest bucket hash. When the manifest is
 * missing (`null`) we fall back to the coarse kind so items still land somewhere
 * sensible — that is a degradation, not a second source of truth.
 * @param inventoryBucketHash - Manifest `inventory.bucketTypeHash`.
 * @param kind - coarse item kind, used only when the bucket is unknown.
 */
export function sectionOfBucket(inventoryBucketHash: number | null, kind: string): string {
  if (inventoryBucketHash !== null) {
    return SECTION_OF.get(inventoryBucketHash) ?? FALLBACK_SECTION
  }
  return kind === 'weapon' ? 'weapons' : kind === 'armor' ? 'armor' : FALLBACK_SECTION
}

/**
 * Row order inside one section.
 * @param inventoryBucketHash - Manifest bucket hash.
 * @returns the DIM index, or a large number so unlisted buckets sort last.
 */
export function bucketRank(inventoryBucketHash: number | null): number {
  if (inventoryBucketHash === null) return Number.MAX_SAFE_INTEGER - 1
  return ORDER_OF.get(inventoryBucketHash) ?? Number.MAX_SAFE_INTEGER
}


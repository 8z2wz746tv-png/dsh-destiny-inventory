/**
 * Small field readers shared by the profile parsers.
 *
 * Every Bungie payload field is `unknown` at the boundary, so these exist to make
 * "the field is missing" explicit instead of leaking `any` inward.
 */

/** Numeric field with a fallback. */
export function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** String field with a fallback. */
export function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

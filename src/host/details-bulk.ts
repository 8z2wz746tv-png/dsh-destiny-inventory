/**
 * Build every item's detail in one pass — DIM's approach kept on the host.
 *
 * DIM reads the item components in its single profile call and builds each item
 * up front, which is why hovering never waits. Split from `item-detail.ts` so
 * that file stays inside its ceiling.
 */
import type { BungieService } from './bungie-service'
import { buildItemDetail } from './item-detail'
import type { ItemDetailView } from './types'

/**
 * Build every item's detail in one pass — DIM's approach kept on the host.
 * @param service - the inventory service.
 * @param options - `force` bypasses the snapshot cache.
 * @returns details keyed by row id.
 */
export async function readAllDetails(
  service: BungieService,
  options: { force?: boolean } = {},
): Promise<Record<string, ItemDetailView>> {
  const { snapshot, definitions } = await service.detailSource(options)
  const out: Record<string, ItemDetailView> = {}
  for (const item of snapshot.items) {
    out[item.key] = buildItemDetail(item, definitions, snapshot.equippedCharacters)
  }
  return out
}

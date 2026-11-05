/**
 * Turn one completed write into a journal entry.
 *
 * Kept out of `index.ts` so the route stays a route: deciding what the entry means
 * is its own concern, and the mapping is the part worth reading.
 */
import type { ContextStore, JournalEntry } from './context-store'
import type { ItemWrite } from '../bungie/write'

/**
 * Record one write.
 * @param store - the panel's context store.
 * @param write - what was attempted.
 * @param itemName - display name from the bridge, since the write carries only ids.
 * @param from - location key before the write, or null when unknown.
 * @param result - how it ended.
 * @param detail - upstream's words on failure, or the success summary.
 */
export function record(
  store: ContextStore,
  write: ItemWrite,
  itemName: string,
  from: string | null,
  result: JournalEntry['result'],
  detail: string,
): void {
  store.record({
    at: Date.now(),
    action: write.kind,
    item: { instanceId: write.instanceId, hash: 0, name: itemName },
    from,
    to: write.kind === 'move' ? (write.characterId ?? 'vault') : (write.characterId ?? null),
    result,
    source: 'ui',
    detail: result === 'ok' ? '' : detail,
  })
}

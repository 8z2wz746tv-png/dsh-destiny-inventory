/**
 * Notice writes the panel did not make.
 *
 * The agent can change the account through the MCP while the panel is open. The
 * panel only finds out on the next read, as items that moved without a matching
 * journal entry. Recording those keeps the journal honest: "why is this in the
 * vault when I did not put it there" has an answer.
 *
 * Deliberately quiet: no receipt, no interruption. The user did not do it, so
 * telling them would be noise.
 */
import type { ContextStore } from './context-store'
import type { ItemRow } from './types'

/** How long after a UI write its own change is expected back from upstream. */
const UI_GRACE_MS = 30_000

/**
 * Compare the previous read with this one and record unexplained movement.
 * @param store - the context store, for prior locations and journal lookups.
 * @param rows - the rows just read.
 * @param now - current time, injected so tests need no clock.
 * @returns nothing; the store is updated in place.
 */
export function detectExternal(store: ContextStore, rows: ItemRow[], now = Date.now()): void {
  const before = store.locations()
  // First read of a session: there is nothing to compare against, and everything
  // would look like it moved.
  if (before.size === 0) {
    store.setLocations(rows)
    return
  }

  const recent = store.recent(200)
  for (const row of rows) {
    if (row.instanceId === '' || row.instanceId === '0') continue
    const was = before.get(row.instanceId)
    if (was === undefined || was === row.locationKey) continue
    // A change we caused ourselves is already in the journal; only unexplained
    // ones are news.
    const mine = recent.some(
      (entry) =>
        entry.item.instanceId === row.instanceId && entry.source === 'ui' && now - entry.at < UI_GRACE_MS,
    )
    if (mine) continue
    store.record({
      at: now,
      action: 'move',
      item: { instanceId: row.instanceId, hash: row.hash, name: row.name },
      from: was,
      to: row.locationKey,
      result: 'ok',
      source: 'agent-detected',
      detail: '',
    })
  }
  store.setLocations(rows)
}

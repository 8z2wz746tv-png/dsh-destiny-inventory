/**
 * Notice changes the panel did not make — without inventing operations.
 *
 * The old version compared one read against the previous one and wrote a journal
 * entry for every difference. That conflated two different things: a **position
 * difference** is a fact about a projection, while an **operation** is a claim
 * about a cause. Bungie's profile is a projection that settles 3–10 seconds behind
 * a write, so for a while it reports the item where it used to be. Comparing
 * across that window turned my own transfer into "agent moved it back".
 *
 * So this keeps three states apart:
 *
 * - **observation** — what one read said (cheap, untrusted)
 * - **candidate**   — a difference that has not settled yet (never journalled)
 * - **event**       — a difference that stayed put past the sync window
 *
 * A candidate is dropped when the item goes back where it was: that is exactly
 * what a mid-sync read looks like, and it must produce nothing at all. A confirmed
 * change is recorded as `source: 'external'` — the panel says a change happened,
 * never who made it.
 */
import type { ContextStore } from './context-store'
import type { ItemRow } from './types'

/**
 * How long a difference has to stay put before it counts.
 *
 * Bungie's write-to-read lag was measured at 3–10 s; the upper end is the useful
 * number, because anything shorter can still be a projection catching up.
 */
const SETTLE_MS = 10_000

/** Stop tracking a candidate nobody has re-read for this long. */
const GIVE_UP_MS = 5 * 60_000

/**
 * How far back a local write still explains a position.
 *
 * The panel's own write puts the item somewhere; when a later read finally agrees,
 * that is the write landing, not someone else acting. The window is generous
 * because the sync lag is, and a false "external" is worse than a missed one.
 */
const OWN_OPERATION_MS = 30 * 60_000

/** One difference that has not settled yet. */
interface Candidate {
  /** Where the item was on the last settled read. */
  from: string
  /** Where it keeps being seen now. */
  to: string
  /** First time this difference was observed. */
  since: number
  /** Last time it was observed. */
  lastSeen: number
  /** How many reads have agreed on `to`. */
  observations: number
}

export class ExternalDetector {
  private readonly candidates = new Map<string, Candidate>()

  /**
   * Feed one inventory read through the detector.
   * @param store - holds the previous read's positions and receives confirmed events.
   * @param rows - the rows just read.
   * @param now - clock, injected so tests need no waiting.
   */
  observe(store: ContextStore, rows: ItemRow[], now = Date.now()): void {
    const before = store.locations()
    // First read: there is nothing to compare against, and everything would look
    // like it moved.
    if (before.size === 0) {
      store.setLocations(rows)
      return
    }

    const current = new Map<string, string>()
    for (const row of rows) {
      if (row.instanceId !== '' && row.instanceId !== '0') {
        current.set(row.instanceId, row.locationKey)
      }
    }

    // Candidates advance on their own observations, not on the baseline: the
    // baseline moves every read, so waiting for it to disagree again would mean
    // waiting forever.
    const confirmed = new Set<string>()
    for (const [instanceId, candidate] of this.candidates) {
      const seen = current.get(instanceId)
      if (seen !== candidate.to) {
        // Back where it started, or somewhere else entirely: nothing settled.
        this.candidates.delete(instanceId)
        continue
      }
      candidate.lastSeen = now
      candidate.observations += 1
      if (now - candidate.since < SETTLE_MS) continue

      this.candidates.delete(instanceId)
      confirmed.add(instanceId)
      if (this.explainedByOurOwnWrite(store, instanceId, seen, now)) continue
      const row = rows.find((entry) => entry.instanceId === instanceId)
      store.record({
        at: now,
        action: 'move',
        item: { instanceId, hash: row?.hash ?? 0, name: row?.name ?? '' },
        from: candidate.from,
        to: seen,
        result: 'ok',
        source: 'external',
        detail: `面板外发生的变更：连续 ${candidate.observations} 次读取位置一致`,
      })
    }

    // Differences this read saw for the first time start a candidate.
    for (const row of rows) {
      if (row.instanceId === '' || row.instanceId === '0') continue
      if (confirmed.has(row.instanceId) || this.candidates.has(row.instanceId)) continue
      const was = before.get(row.instanceId)
      if (was === undefined || was === row.locationKey) continue
      this.candidates.set(row.instanceId, {
        from: was,
        to: row.locationKey,
        since: now,
        lastSeen: now,
        observations: 1,
      })
    }

    this.retire(now)

    // The baseline is "where things settled", not "what the last read said". Letting
    // a mid-sync read advance it is what turned one transfer into a phantom move
    // back: the projection said vault once, the baseline believed it, and the next
    // honest read looked like a change in the opposite direction.
    const settled = new Map(before)
    for (const [instanceId, location] of current) {
      if (!this.candidates.has(instanceId)) settled.set(instanceId, location)
    }
    store.setLocations([...settled].map(([instanceId, locationKey]) => ({ instanceId, locationKey })))
  }

  /**
   * Drop candidates this read resolved or abandoned.
   *
   * Back where it started means the difference was a projection catching up, not a
   * change; that case must leave no trace at all.
   */
  private retire(now: number): void {
    for (const [instanceId, candidate] of this.candidates) {
      if (now - candidate.lastSeen > GIVE_UP_MS) this.candidates.delete(instanceId)
    }
  }

  /**
   * Is this position the landing of a write the panel already journalled?
   *
   * Matched on the destination, not just on "recently": our own write to `vault`
   * does not explain the item turning up on a character.
   */
  private explainedByOurOwnWrite(
    store: ContextStore,
    instanceId: string,
    location: string,
    now: number,
  ): boolean {
    return store.recent(200).some(
      (entry) =>
        entry.item.instanceId === instanceId &&
        entry.source === 'ui' &&
        entry.to === location &&
        now - entry.at < OWN_OPERATION_MS,
    )
  }
}

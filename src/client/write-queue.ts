/**
 * One serial queue for account writes.
 *
 * Two drags in a row used to mean two writes in flight at once. The second one
 * resolved its owner from a snapshot the first had just invalidated, and Bungie
 * syncs behind by seconds, so that snapshot could still describe the world before
 * the first write. Dragging the same item twice was worse: both requests went out
 * together and the loser's target was built from a stale position.
 *
 * This does three things and nothing else — run one write at a time, drop a move
 * that has not started when the same item is dragged somewhere else (the intent is
 * the final position, not the path), and let a queued write be cancelled before it
 * costs a round trip.
 */

/** What became of a queued write. */
export type QueueOutcome<T> =
  | { kind: 'ran'; value: T }
  | { kind: 'superseded' }
  | { kind: 'cancelled' }

/** One write waiting its turn. */
interface Entry {
  key: string
  replaceable: boolean
  execute: () => Promise<unknown>
  settle: (outcome: QueueOutcome<unknown>) => void
  fail: (error: unknown) => void
}

export class WriteQueue {
  private readonly waiting: Entry[] = []
  private inFlight = false
  private listener: ((depth: number) => void) | undefined
  /** Last depth reported, so a reshuffle that keeps the same depth stays quiet. */
  private lastDepth = 0

  /**
   * Watch the queue depth: in flight plus waiting.
   * @param listener - called whenever the depth changes, and once immediately.
   * @returns an unsubscribe.
   */
  watch(listener: (depth: number) => void): () => void {
    this.listener = listener
    this.lastDepth = this.depth()
    listener(this.lastDepth)
    return () => {
      if (this.listener === listener) this.listener = undefined
    }
  }

  /** In flight plus waiting. */
  depth(): number {
    return this.waiting.length + (this.inFlight ? 1 : 0)
  }

  /**
   * Add one write to the back of the queue.
   * @param key - usually the item instance; the unit that must not run twice.
   * @param replaceable - `true` when a later write for the same key supersedes this.
   * @param execute - the request itself.
   * @returns how it ended; rejects only when `execute` rejects.
   */
  enqueue<T>(
    key: string,
    replaceable: boolean,
    execute: () => Promise<T>,
  ): Promise<QueueOutcome<T>> {
    if (replaceable) this.supersede(key)
    return new Promise<QueueOutcome<T>>((resolve, reject) => {
      this.waiting.push({
        key,
        replaceable,
        execute,
        settle: resolve as (outcome: QueueOutcome<unknown>) => void,
        fail: reject,
      })
      this.notify()
      this.pump()
    })
  }

  /**
   * Drop a write that has not started yet.
   *
   * A write already on the wire cannot be taken back — the caller has to abort it
   * itself, which is why this reports whether it found anything to drop.
   * @param key - the item instance.
   * @returns `true` when a queued write was dropped, `false` when nothing waited.
   */
  cancel(key: string): boolean {
    const index = this.waiting.findIndex((entry) => entry.key === key)
    if (index < 0) return false
    const [dropped] = this.waiting.splice(index, 1)
    this.notify()
    dropped?.settle({ kind: 'cancelled' })
    return true
  }

  /** Replace a waiting move for the same item: the user changed their mind. */
  private supersede(key: string): void {
    const index = this.waiting.findIndex((entry) => entry.key === key && entry.replaceable)
    if (index < 0) return
    const [dropped] = this.waiting.splice(index, 1)
    this.notify()
    dropped?.settle({ kind: 'superseded' })
  }

  /** Start the next write when nothing is on the wire. */
  private pump(): void {
    if (this.inFlight) return
    const entry = this.waiting.shift()
    if (entry === undefined) {
      this.notify()
      return
    }
    this.inFlight = true
    this.notify()
    void entry.execute().then(
      (value) => {
        entry.settle({ kind: 'ran', value })
        this.release()
      },
      (error: unknown) => {
        entry.fail(error)
        this.release()
      },
    )
  }

  /** Free the wire and start whatever queued up behind. */
  private release(): void {
    this.inFlight = false
    this.notify()
    this.pump()
  }

  private notify(): void {
    const depth = this.depth()
    // Picking up the next write keeps the depth the same; nobody needs to hear it.
    if (depth === this.lastDepth) return
    this.lastDepth = depth
    this.listener?.(depth)
  }
}

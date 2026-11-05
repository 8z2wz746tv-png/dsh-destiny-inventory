/**
 * Let one account write run at a time.
 *
 * The browser half queues its own writes, so this is not a catch-up for that: it
 * is the data plane's own contract. Two tabs, or a future caller on this same
 * route, must not put two Bungie writes in flight at once — the profile snapshot
 * both of them read is a single cache, and each write invalidates it for the
 * other. Serialising here also makes the journal's order the order things really
 * happened, which is what the agent reads.
 */

export class WriteSerializer {
  /** The end of the chain: always settled, so one failure cannot wedge the queue. */
  private tail: Promise<unknown> = Promise.resolve()

  /**
   * Run one write after everything already accepted.
   * @param write - the request to make.
   * @returns the write's own result, including its failure.
   */
  run<T>(write: () => Promise<T>): Promise<T> {
    // `then(write, write)` — a failed predecessor must not skip this one.
    const next = this.tail.then(write, write)
    // Kept separately and swallowed: the caller owns `next`, and an unhandled
    // rejection here would be this file's fault, not theirs.
    this.tail = next.catch(() => undefined)
    return next
  }
}

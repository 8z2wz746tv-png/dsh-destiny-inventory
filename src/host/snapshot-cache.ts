/**
 * The account snapshot cache, and the reason it has three states.
 *
 * `current` is what a reader wants: fresh within the TTL, and refreshed straight
 * away once a write has said the account moved on.
 *
 * `stable` is what a write wants. A write needs two things from the profile — the
 * item's hash and the character table — and neither changes when an item moves. It
 * must NOT pay for a fresh read: with the queue running writes one at a time, every
 * write would otherwise invalidate the cache and the next one would spend 1.5 s
 * re-reading a profile to learn something it already knew. That is the difference
 * between five drags costing two seconds and costing eight.
 *
 * The stale flag is what keeps those two honest instead of letting a write quietly
 * serve old data to the grid: a write marks the cache stale, and the next `current`
 * goes back to Bungie.
 */
import type { ProfileSnapshot } from '../bungie/profile'

/** One cached read and when it was taken. */
interface Entry {
  value: ProfileSnapshot
  at: number
}

export class SnapshotCache {
  private entry: Entry | null = null
  private stale = false

  /**
   * @param read - performs the actual profile read.
   * @param now - clock, injectable so tests do not sleep.
   * @param ttlMs - how long a read stays fresh for readers.
   */
  constructor(
    private readonly read: () => Promise<ProfileSnapshot>,
    private readonly now: () => number,
    private readonly ttlMs: number,
  ) {}

  /**
   * A snapshot a reader can trust.
   * @param force - ignore both the TTL and the stale flag.
   */
  async current(force = false): Promise<ProfileSnapshot> {
    const cached = this.entry
    const fresh = cached !== null && this.now() - cached.at < this.ttlMs
    if (cached !== null && fresh && !this.stale && !force) return cached.value
    return this.reload()
  }

  /**
   * A snapshot a write can work from.
   *
   * Deliberately ignores the TTL and the stale flag: the write only reads values
   * that cannot change under it (item hash, character ids). One reload when there is
   * nothing cached at all, and never otherwise.
   */
  async stable(): Promise<ProfileSnapshot> {
    const cached = this.entry
    if (cached !== null) return cached.value
    return this.reload()
  }

  /** The account moved on: the next `current` has to go back to Bungie. */
  markStale(): void {
    this.stale = true
  }

  /** What `current` would return right now, or `null`. */
  peek(): Entry | null {
    return this.entry
  }

  private async reload(): Promise<ProfileSnapshot> {
    const value = await this.read()
    this.entry = { value, at: this.now() }
    this.stale = false
    return value
  }
}

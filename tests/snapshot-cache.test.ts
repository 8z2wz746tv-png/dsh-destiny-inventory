/**
 * Three states, and each one exists for a reason:
 *
 * - fresh      → a reader gets the cached read, no round trip.
 * - stale      → a write happened; the next reader goes back to Bungie.
 * - write-time → a write takes the cached read anyway, because the two things it
 *                needs (item hash, character ids) do not move.
 *
 * Getting this wrong is visible: with the write queue running one write at a time,
 * treating stale as "drop the cache" made every drag pay 1.5 s to re-read a profile
 * to learn something it already knew.
 */
import { describe, expect, it } from 'vitest'
import { SnapshotCache } from '../src/host/snapshot-cache'
import type { ProfileSnapshot } from '../src/bungie/profile'

/** A stand-in profile; only its identity matters here. */
const profile = (tag: string): ProfileSnapshot => ({ items: [{ instanceId: tag }] }) as unknown as ProfileSnapshot

describe('snapshot cache', () => {
  it('serves a fresh read from memory', async () => {
    let reads = 0
    const cache = new SnapshotCache(
      async () => {
        reads += 1
        return profile('a')
      },
      () => 0,
      30_000,
    )
    await cache.current()
    await cache.current()
    expect(reads).toBe(1)
  })

  it('goes back to Bungie once the TTL has passed', async () => {
    let clock = 0
    let reads = 0
    const cache = new SnapshotCache(
      async () => {
        reads += 1
        return profile(`r${reads}`)
      },
      () => clock,
      1_000,
    )
    await cache.current()
    clock = 1_500
    const second = await cache.current()
    expect(reads).toBe(2)
    expect(second).toBe(await cache.current())
  })

  it('re-reads for a reader after a write marks it stale', async () => {
    let reads = 0
    const cache = new SnapshotCache(
      async () => {
        reads += 1
        return profile(`r${reads}`)
      },
      () => 0,
      30_000,
    )
    await cache.current()
    cache.markStale()
    await cache.current()
    // Injectable violation: drop the stale check and this stays at 1.
    expect(reads).toBe(2)
    // And it settles: the second read cleared the flag.
    await cache.current()
    expect(reads).toBe(2)
  })

  it('lets a write read through a stale cache instead of paying for a reload', async () => {
    let reads = 0
    const cache = new SnapshotCache(
      async () => {
        reads += 1
        return profile(`r${reads}`)
      },
      () => 0,
      30_000,
    )
    await cache.current()
    cache.markStale()
    const forWrite = await cache.stable()
    // Injectable violation: route `stable` through `current` and this becomes 2 —
    // which is what made five queued drags take eight seconds instead of two.
    expect(reads).toBe(1)
    expect(forWrite).toBe(await cache.stable())
  })

  it('reads once when a write arrives with nothing cached', async () => {
    let reads = 0
    const cache = new SnapshotCache(
      async () => {
        reads += 1
        return profile('first')
      },
      () => 0,
      30_000,
    )
    await cache.stable()
    expect(reads).toBe(1)
  })

  it('reports what it is holding', async () => {
    const cache = new SnapshotCache(async () => profile('a'), () => 42, 30_000)
    expect(cache.peek()).toBeNull()
    await cache.current()
    expect(cache.peek()?.at).toBe(42)
  })
})

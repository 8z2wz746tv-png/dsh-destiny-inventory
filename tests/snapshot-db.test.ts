/**
 * 缓存层自己守的三件事：账号不串、坏数据不上屏、存不进去也不出事。
 *
 * IndexedDB 在 node 里不存在，所以这一层的"降级"是主要被测路径——而它在浏览器里
 * 恰恰是最常见的失败方式（被清、被禁、形状过期）。
 */
import { describe, expect, it } from 'vitest'
import { cacheKey, isUsable, readSnapshot, writeSnapshot } from '../src/client/snapshot-db'
import type { InventorySnapshot } from '../src/host/types'

const steam = { membershipType: 3, membershipId: '4611686018492803873' }
const psn = { membershipType: 2, membershipId: '4611686018492803873' }

const snapshot = (over: Partial<InventorySnapshot> = {}): InventorySnapshot =>
  ({
    account: steam,
    fetchedAt: 1_700_000_000_000,
    total: 2,
    items: [],
    truncated: false,
    overlays: {} as never,
    ...over,
  })

const record = (over: Record<string, unknown> = {}) => ({
  schema: 1,
  account: steam,
  snapshot: snapshot(),
  ...over,
})

describe('cacheKey', () => {
  it('is per account, not per machine', () => {
    // Injectable violation: drop the id and two accounts share one key, so a switch
    // briefly paints the previous account's vault.
    expect(cacheKey(steam)).toBe('3:4611686018492803873')
    expect(cacheKey(psn)).not.toBe(cacheKey(steam))
  })
})

describe('isUsable', () => {
  it('accepts a well-formed record for the right account', () => {
    expect(isUsable(record(), steam)).toBe(true)
  })

  it('rejects a record that belongs to another account', () => {
    expect(isUsable(record({ account: psn }), steam)).toBe(false)
  })

  it('rejects an older schema instead of migrating it', () => {
    expect(isUsable(record({ schema: 0 }), steam)).toBe(false)
  })

  it('rejects a half-written snapshot', () => {
    expect(isUsable(record({ snapshot: { fetchedAt: NaN, total: 0, items: [] } }), steam)).toBe(false)
    expect(isUsable(record({ snapshot: { fetchedAt: 1, total: 0 } }), steam)).toBe(false)
    expect(isUsable(record({ snapshot: { fetchedAt: 1, items: {} } }), steam)).toBe(false)
  })

  it('rejects things that are not records at all', () => {
    expect(isUsable(null, steam)).toBe(false)
    expect(isUsable('a string', steam)).toBe(false)
    expect(isUsable(undefined, steam)).toBe(false)
  })
})

describe('without IndexedDB', () => {
  it('reads as "no cache" instead of throwing', async () => {
    // node has no indexedDB; this is the same code path as a cleared or blocked store.
    expect(typeof indexedDB).toBe('undefined')
    await expect(readSnapshot(steam)).resolves.toBeNull()
  })

  it('swallows a write without throwing at the caller', async () => {
    expect(() => writeSnapshot(steam, snapshot())).not.toThrow()
    // Let the rejected open settle; an unhandled rejection would fail the run.
    await new Promise((resolve) => setTimeout(resolve, 5))
  })
})

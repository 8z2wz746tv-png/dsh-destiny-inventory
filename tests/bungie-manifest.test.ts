import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ManifestStore, parseBucket, parseItem, parsePlug, toSignedHash } from '../src/bungie/manifest'

const zhDb = join(homedir(), '项目/destiny2-mcp/manifest/destiny_manifest_zh.sqlite3')
const hasDb = existsSync(zhDb)

describe('toSignedHash', () => {
  it('keeps hashes below 2^31 untouched', () => {
    expect(toSignedHash(1498876634)).toBe(1498876634)
    expect(toSignedHash(1216319404)).toBe(1216319404)
  })

  it('maps hashes above 2^31 into signed 32-bit ids', () => {
    expect(toSignedHash(2905188646)).toBe(2905188646 - 2 ** 32)
    expect(toSignedHash(4294967295)).toBe(-1)
  })

  it('is stable for invalid input', () => {
    expect(toSignedHash(Number.NaN)).toBe(0)
  })
})

describe('definition parsing', () => {
  it('reads a bucket row', () => {
    const bucket = parseBucket(1498876634, {
      displayProperties: { name: '动能武器' },
      category: 3,
      location: 1,
      itemCount: 10,
      hasTransferDestination: true,
    })
    expect(bucket).toEqual({
      hash: 1498876634,
      name: '动能武器',
      category: 3,
      location: 1,
      itemCount: 10,
      hasTransferDestination: true,
    })
  })

  it('reads an item row and absolutises its icon', () => {
    const item = parseItem(1216319404, {
      displayProperties: { name: '命运终结者（失时）', icon: '/common/x.jpg' },
      itemType: 3,
      itemTypeDisplayName: '手炮',
      inventory: { tierType: 5, tierTypeName: '传说', bucketTypeHash: 1498876634 },
      equippingBlock: { ammoType: 1 },
      defaultDamageType: 1,
      classType: 3,
    })
    expect(item).toMatchObject({
      hash: 1216319404,
      name: '命运终结者（失时）',
      icon: 'https://www.bungie.net/common/x.jpg',
      itemType: 3,
      tierType: 5,
      ammoType: 1,
      bucketTypeHash: 1498876634,
    })
  })

  it('treats a missing name as empty, never as a fabricated label', () => {
    const item = parseItem(1, {})
    expect(item.name).toBe('')
    expect(item.tierType).toBeNull()
  })

  it('returns null for a row without a plug block', () => {
    expect(parsePlug(1, { displayProperties: { name: 'not a plug' } })).toBeNull()
  })

  it('reads a plug row', () => {
    const plug = parsePlug(2, {
      displayProperties: { name: '萤火虫', description: '击杀爆燃' },
      plug: { plugCategoryIdentifier: 'frames' },
    })
    expect(plug).toMatchObject({ name: '萤火虫', plugCategoryIdentifier: 'frames' })
  })
})

describe('ManifestStore without a database', () => {
  it('reports missing and answers null instead of throwing', () => {
    const store = new ManifestStore(join(homedir(), 'definitely-not-a-manifest.sqlite3'))
    expect(store.status()).toMatchObject({ available: false, reason: 'missing' })
    expect(store.item(1216319404)).toBeNull()
    expect(store.bucket(1498876634)).toBeNull()
    expect(store.plug(1)).toBeNull()
    store.close()
  })
})

describe.skipIf(!hasDb)('ManifestStore against the real manifest', () => {
  it('reports availability and counts', () => {
    const store = new ManifestStore(zhDb)
    const status = store.status()
    expect(status.available).toBe(true)
    expect(status.itemCount).toBeGreaterThan(10_000)
    store.close()
  })

  it('resolves the three definition kinds by unsigned hash', () => {
    const store = new ManifestStore(zhDb)
    expect(store.bucket(1498876634)?.name).toBe('动能武器')
    expect(store.item(1216319404)?.name).toBe('命运终结者（失时）')
    // A hash above 2^31: only reachable through the signed conversion.
    expect(store.item(2905188646)?.hash).toBe(2905188646)
    expect(store.item(2905188646)?.name).not.toBe('')
    store.close()
  })

  it('answers null for an unknown hash', () => {
    const store = new ManifestStore(zhDb)
    expect(store.item(1)).toBeNull()
    store.close()
  })
})

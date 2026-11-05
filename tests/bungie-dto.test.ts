/**
 * The three-state equipped rule, at the DTO boundary.
 *
 * This is the part the normal account cannot exercise: on a healthy response
 * every character has an equipment list, so `unknown` never appears. The cases
 * below are the degraded ones.
 */
import { describe, expect, it } from 'vitest'
import { toItemRows } from '../src/host/dto'
import type { DefinitionLookup, ItemSource } from '../src/host/dto'

/** A weapon definition with a kinetic bucket. */
const definitions: DefinitionLookup = {
  item: () => ({
    name: '测试枪',
    icon: '',
    itemType: 3,
    itemTypeDisplayName: '手炮',
    tierType: 5,
    tierTypeName: '传说',
    description: '测试用定义',
    damageType: 1,
    ammoType: 1,
    statGroupHash: 660767731,
    stats: { 155624089: { value: 43, displayMaximum: 100 } },
    watermark: '',
    breakerType: 0,
    classType: 3,
    categoryHashes: [3, 6],
    craftingSocket: false,
    bucketTypeHash: 1498876634,
  }),
  bucket: () => ({ name: '动能武器' }),
  plug: () => null,
  damageType: () => '动能',
  damageTypeIcon: () => '',
  statOrder: () => [],
  statName: () => '',
}

function source(overrides: Partial<ItemSource>): ItemSource {
  return {
    key: 'i1',
    instanceId: 'i1',
    itemHash: 1,
    slotHash: null,
    quantity: 1,
    source: 'character-inventory',
    characterId: 'c1',
    locked: false,
    power: 500,
    ...overrides,
  }
}

const classes = new Map([['c1', 'hunter']])

describe('equipped three-state', () => {
  it('marks an equipment row as equipped regardless of the character set', () => {
    const { rows } = toItemRows(
      [source({ source: 'equipment', slotHash: 1498876634 })],
      definitions,
      classes,
      new Set(['c1']),
    )
    expect(rows[0]!.equipped).toBe('equipped')
    expect(rows[0]!.placement).toEqual({ kind: 'equipped', characterId: 'c1', slotHash: 1498876634 })
  })

  it('marks carried items as not_equipped when that character returned equipment', () => {
    const { rows } = toItemRows([source({})], definitions, classes, new Set(['c1']))
    expect(rows[0]!.equipped).toBe('not_equipped')
  })

  it('reports unknown when the character has no equipment entry', () => {
    // 205 loaded for someone else, or not at all: c1's carried items cannot be judged.
    const { rows } = toItemRows([source({})], definitions, classes, new Set())
    expect(rows[0]!.equipped).toBe('unknown')
  })

  it('never marks vault items as unknown — they have no owner to judge', () => {
    const { rows } = toItemRows(
      [source({ source: 'profile', characterId: null })],
      definitions,
      classes,
      new Set(),
    )
    expect(rows[0]!.equipped).toBe('not_equipped')
    expect(rows[0]!.placement).toEqual({ kind: 'vault' })
  })

  it('judges each character independently', () => {
    const { rows } = toItemRows(
      [source({ key: 'a', instanceId: 'a', characterId: 'c1' }), source({ key: 'b', instanceId: 'b', characterId: 'c2' })],
      definitions,
      new Map([
        ['c1', 'hunter'],
        ['c2', 'warlock'],
      ]),
      new Set(['c1']),
    )
    expect(rows.find((r) => r.characterId === 'c1')?.equipped).toBe('not_equipped')
    expect(rows.find((r) => r.characterId === 'c2')?.equipped).toBe('unknown')
  })
})

describe('postmaster placement', () => {
  it('files a postmaster row into its owner\'s column', () => {
    const { rows } = toItemRows(
      [source({ source: 'postmaster' })],
      definitions,
      classes,
      new Set(['c1']),
    )
    expect(rows[0]!.placement).toEqual({ kind: 'postmaster', characterId: 'c1' })
    expect(rows[0]!.locationKey).toBe('hunter')
    expect(rows[0]!.equipped).toBe('not_equipped')
  })

  it('falls back to the vault column when a postmaster row names no character', () => {
    const { rows } = toItemRows(
      [source({ source: 'postmaster', characterId: null })],
      definitions,
      classes,
      new Set(['c1']),
    )
    expect(rows[0]!.placement).toEqual({ kind: 'postmaster', characterId: null })
    expect(rows[0]!.locationKey).toBe('vault')
  })
})

describe('classification', () => {
  it('takes the bucket from the definition, not from the instance', () => {
    const { rows } = toItemRows([source({})], definitions, classes, new Set(['c1']))
    expect(rows[0]!.inventoryBucketHash).toBe(1498876634)
    expect(rows[0]!.bucket).toBe('动能武器')
  })

  it('reports a missing definition as null, never a placeholder', () => {
    const empty: DefinitionLookup = {
    item: () => null,
    bucket: () => null,
    plug: () => null,
    damageType: () => '',
    damageTypeIcon: () => '',
    statOrder: () => [],
    statName: () => '',
  }
    const { rows } = toItemRows([source({})], empty, classes, new Set(['c1']))
    expect(rows[0]!.inventoryBucketHash).toBeNull()
    expect(rows[0]!.bucket).toBeNull()
    expect(rows[0]!.name).toBe('#1')
  })
})

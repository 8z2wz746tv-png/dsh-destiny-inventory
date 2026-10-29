import { describe, expect, it } from 'vitest'
import type { ItemRow } from '../src/mcp/types'
import {
  DEFAULT_FILTERS,
  availableLocations,
  availableTypes,
  buildSections,
  compareItems,
  locationCounts,
  matchesFilters,
} from '../src/client/filter'

/** One item row with the given overrides. */
function row(overrides: Partial<ItemRow>): ItemRow {
  return {
    id: 'i1',
    instanceId: 'i1',
    hash: 1,
    name: '测试',
    kind: 'weapon',
    type: '手炮',
    bucket: 'Kinetic Weapons',
    power: 500,
    equipped: false,
    locked: false,
    quantity: 1,
    icon: '',
    location: 'vault',
    characterId: '',
    exotic: false,
    ...overrides,
  }
}

describe('matchesFilters', () => {
  it('passes everything under the defaults', () => {
    expect(matchesFilters(row({}), DEFAULT_FILTERS)).toBe(true)
  })

  it('matches the search against the localized name, case-insensitively', () => {
    expect(matchesFilters(row({ name: 'The Queenbreaker' }), { ...DEFAULT_FILTERS, search: 'queen' })).toBe(true)
    expect(matchesFilters(row({ name: 'The Queenbreaker' }), { ...DEFAULT_FILTERS, search: '弑后' })).toBe(false)
  })

  it('ignores surrounding whitespace in the search box', () => {
    expect(matchesFilters(row({ name: '弑后者' }), { ...DEFAULT_FILTERS, search: '  弑后  ' })).toBe(true)
  })

  it('separates locked from unlocked', () => {
    const locked = row({ locked: true })
    expect(matchesFilters(locked, { ...DEFAULT_FILTERS, lock: 'locked' })).toBe(true)
    expect(matchesFilters(locked, { ...DEFAULT_FILTERS, lock: 'unlocked' })).toBe(false)
  })

  it('splits weapons from armor and from everything else', () => {
    const weapon = row({ kind: 'weapon' })
    const armor = row({ kind: 'armor' })
    const misc = row({ kind: 'other' })
    expect(matchesFilters(weapon, { ...DEFAULT_FILTERS, category: 'weapon' })).toBe(true)
    expect(matchesFilters(armor, { ...DEFAULT_FILTERS, category: 'weapon' })).toBe(false)
    expect(matchesFilters(misc, { ...DEFAULT_FILTERS, category: 'other' })).toBe(true)
    expect(matchesFilters(weapon, { ...DEFAULT_FILTERS, category: 'all' })).toBe(true)
  })

  it('opens on the vault, which is where most of the account lives', () => {
    expect(DEFAULT_FILTERS.location).toBe('vault')
  })

  it('filters by type and location together', () => {
    const item = row({ type: '手炮', location: 'hunter' })
    expect(matchesFilters(item, { ...DEFAULT_FILTERS, type: '手炮', location: 'hunter' })).toBe(true)
    expect(matchesFilters(item, { ...DEFAULT_FILTERS, type: '手炮', location: 'vault' })).toBe(false)
  })
})

describe('compareItems', () => {
  it('sorts unknown power last, not first', () => {
    const sorted = [row({ id: 'a', power: null }), row({ id: 'b', power: 10 })].sort((l, r) =>
      compareItems(l, r, 'power-desc'),
    )
    expect(sorted.map((item) => item.id)).toEqual(['b', 'a'])
  })

  it('breaks a type tie by name', () => {
    const sorted = [row({ id: 'a', name: 'B' }), row({ id: 'b', name: 'A' })].sort((l, r) =>
      compareItems(l, r, 'type-asc'),
    )
    expect(sorted.map((item) => item.id)).toEqual(['b', 'a'])
  })
})

describe('buildSections', () => {
  it('orders locations the way the game lists them', () => {
    const sections = buildSections(
      [row({ id: 'v', location: 'vault' }), row({ id: 'h', location: 'hunter' })],
      { ...DEFAULT_FILTERS, location: '' },
    )
    expect(sections.map((section) => section.location)).toEqual(['hunter', 'vault'])
    expect(sections.map((section) => section.label)).toEqual(['猎人', '仓库'])
  })

  it('orders buckets weapons-first and keeps counts', () => {
    const sections = buildSections(
      [
        row({ id: 'a', bucket: 'Consumables' }),
        row({ id: 'b', bucket: 'Kinetic Weapons' }),
        row({ id: 'c', bucket: 'Kinetic Weapons' }),
      ],
      DEFAULT_FILTERS,
    )
    expect(sections[0].buckets.map((bucket) => bucket.bucket)).toEqual([
      'Kinetic Weapons',
      'Consumables',
    ])
    expect(sections[0].itemCount).toBe(3)
    expect(sections[0].buckets[0].items).toHaveLength(2)
  })

  it('drops filtered-out items from the counts, not just the render', () => {
    const sections = buildSections(
      [row({ id: 'a' }), row({ id: 'b', type: '自动步枪' })],
      { ...DEFAULT_FILTERS, type: '手炮' },
    )
    expect(sections[0].itemCount).toBe(1)
  })

  it('returns nothing when every item is filtered out', () => {
    expect(buildSections([row({})], { ...DEFAULT_FILTERS, search: 'zzz' })).toEqual([])
  })
})

describe('locationCounts', () => {
  it('counts per location and keeps the game order', () => {
    const counts = locationCounts([
      row({ location: 'vault' }),
      row({ location: 'vault' }),
      row({ location: 'hunter' }),
      row({ location: 'profile' }),
    ])
    expect(counts).toEqual([
      { value: 'hunter', label: '猎人', count: 1 },
      { value: 'vault', label: '仓库', count: 2 },
      { value: 'profile', label: '账号', count: 1 },
    ])
  })
})

describe('availableTypes / availableLocations', () => {
  it('lists each type once, sorted', () => {
    const types = availableTypes([
      row({ type: '手炮' }),
      row({ type: '自动步枪' }),
      row({ type: '手炮' }),
      row({ type: '' }),
    ])
    expect(types).toHaveLength(2)
    expect(types).not.toContain('')
  })

  it('labels known locations and keeps unknown ones', () => {
    const locations = availableLocations([row({ location: 'vault' }), row({ location: 'weird' })])
    expect(locations[0]).toEqual({ value: 'vault', label: '仓库' })
    expect(locations[1]).toEqual({ value: 'weird', label: 'weird' })
  })
})

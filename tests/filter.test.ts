import { describe, expect, it } from 'vitest'
import type { ItemRow } from '../src/mcp/types'
import {
  DEFAULT_FILTERS,
  STORE_COLUMNS,
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
    bucket: 'Vault (General)',
    power: 500,
    equipped: false,
    locked: false,
    quantity: 1,
    icon: '',
    location: 'vault',
    characterId: '',
    rarity: 'legendary',
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
    expect(matchesFilters(row({ kind: 'weapon' }), { ...DEFAULT_FILTERS, category: 'weapon' })).toBe(true)
    expect(matchesFilters(row({ kind: 'armor' }), { ...DEFAULT_FILTERS, category: 'weapon' })).toBe(false)
    expect(matchesFilters(row({ kind: 'other' }), { ...DEFAULT_FILTERS, category: 'other' })).toBe(true)
  })

  it('filters by type', () => {
    expect(matchesFilters(row({ type: '手炮' }), { ...DEFAULT_FILTERS, type: '手炮' })).toBe(true)
    expect(matchesFilters(row({ type: '手炮' }), { ...DEFAULT_FILTERS, type: '自动步枪' })).toBe(false)
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
  it('lays out one row per type with a cell for every store', () => {
    const sections = buildSections([row({ id: 'a' })], DEFAULT_FILTERS)
    expect(sections[0].label).toBe('武器')
    const rowData = sections[0].rows[0]
    expect(rowData.label).toBe('手炮')
    expect(rowData.cells.map((cell) => cell.location)).toEqual(
      STORE_COLUMNS.map((column) => column.location),
    )
    expect(rowData.cells.filter((cell) => cell.flex).map((cell) => cell.location)).toEqual(['vault'])
  })

  it('puts each item in its own store cell, not the first one', () => {
    const sections = buildSections(
      [
        row({ id: 'h', location: 'hunter' }),
        row({ id: 'v', location: 'vault' }),
        row({ id: 'v2', location: 'vault' }),
      ],
      DEFAULT_FILTERS,
    )
    const cells = sections[0].rows[0].cells
    expect(cells.find((cell) => cell.location === 'hunter')?.items.map((i) => i.id)).toEqual(['h'])
    expect(cells.find((cell) => cell.location === 'vault')?.items.map((i) => i.id)).toEqual(['v', 'v2'])
  })

  it('keeps empty store cells so the columns stay aligned', () => {
    const sections = buildSections([row({ id: 'v', location: 'vault' })], DEFAULT_FILTERS)
    expect(sections[0].rows[0].cells).toHaveLength(STORE_COLUMNS.length)
    expect(sections[0].rows[0].cells.filter((cell) => cell.items.length === 0)).toHaveLength(3)
  })

  it('orders sections weapons, then armor, then the rest', () => {
    const sections = buildSections(
      [row({ id: 'c', kind: 'other', type: '消耗品' }), row({ id: 'a', kind: 'armor', type: '腿部护甲' }), row({ id: 'b' })],
      DEFAULT_FILTERS,
    )
    expect(sections.map((section) => section.label)).toEqual(['武器', '防具', '杂项'])
  })

  it('orders types the way the game lists them', () => {
    const sections = buildSections(
      [row({ id: 'a', type: '刀剑' }), row({ id: 'b', type: '手炮' }), row({ id: 'c', type: '自动步枪' })],
      DEFAULT_FILTERS,
    )
    expect(sections[0].rows.map((r) => r.label)).toEqual(['手炮', '自动步枪', '刀剑'])
  })

  it('gives account-wide items one full-width cell instead of four', () => {
    const sections = buildSections(
      [row({ id: 'p', location: 'profile', kind: 'other', type: '消耗品' })],
      DEFAULT_FILTERS,
    )
    const account = sections.find((section) => section.id === 'profile')
    expect(account?.fullWidth).toBe(true)
    expect(account?.rows[0].cells).toHaveLength(1)
  })

  it('drops filtered-out items from the counts, not just the render', () => {
    const sections = buildSections(
      [row({ id: 'a' }), row({ id: 'b', type: '自动步枪' })],
      { ...DEFAULT_FILTERS, type: '手炮' },
    )
    expect(sections[0].itemCount).toBe(1)
    expect(sections[0].rows).toHaveLength(1)
  })

  it('returns nothing when every item is filtered out', () => {
    expect(buildSections([row({})], { ...DEFAULT_FILTERS, search: 'zzz' })).toEqual([])
  })
})

describe('availableTypes / locationCounts', () => {
  it('lists each type once, sorted, skipping the untyped', () => {
    const types = availableTypes([row({ type: '手炮' }), row({ type: '自动步枪' }), row({ type: '手炮' }), row({ type: '' })])
    expect(types).toHaveLength(2)
    expect(types).not.toContain('')
  })

  it('counts per location in store order and skips empty ones', () => {
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

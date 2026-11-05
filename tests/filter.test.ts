import { describe, expect, it } from 'vitest'
import type { ItemRow } from '../src/host/types'
import type { SortKey } from '../src/client/filter'
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
    inventoryBucketHash: 1498876634,
    bucket: '动能武器',
    power: 500,
    equipped: 'not_equipped',
    locked: false,
    quantity: 1,
    icon: '',
    placement: { kind: 'vault' },
    locationKey: 'vault',
    characterId: null,
    rarity: 'legendary',
    gearTier: 5,
    crafted: false,
    masterwork: false,
    ammoType: '主要弹药',
    damageType: '动能伤害',
    damageRank: 1,
    classType: 3,
    categoryHashes: [3, 6],
    watermark: '',
    breakerType: 0,
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
  it('lays out one row per bucket with a cell for every store', () => {
    const sections = buildSections([row({ id: 'a' })], DEFAULT_FILTERS)
    const weapons = sections.find((section) => section.id === 'weapons')!
    expect(weapons.label).toBe('武器')
    const rowData = weapons.rows[0]
    // The row is the Manifest bucket (kinetic weapons), not the item type.
    expect(rowData.label).toBe('动能武器')
    expect(rowData.cells.map((cell) => cell.location)).toEqual(
      STORE_COLUMNS.map((column) => column.location),
    )
    expect(rowData.cells.filter((cell) => cell.flex).map((cell) => cell.location)).toEqual(['vault'])
  })

  it('puts each item in its own store cell, not the first one', () => {
    const sections = buildSections(
      [
        row({ id: 'h', locationKey: 'hunter' }),
        row({ id: 'v', locationKey: 'vault' }),
        row({ id: 'v2', locationKey: 'vault' }),
      ],
      DEFAULT_FILTERS,
    )
    const cells = sections.find((section) => section.id === 'weapons')!.rows[0].cells
    expect(cells.find((cell) => cell.location === 'hunter')?.items.map((i) => i.id)).toEqual(['h'])
    expect(cells.find((cell) => cell.location === 'vault')?.items.map((i) => i.id)).toEqual(['v', 'v2'])
  })

  it('keeps empty store cells so the columns stay aligned', () => {
    const sections = buildSections([row({ id: 'v', locationKey: 'vault' })], DEFAULT_FILTERS)
    const weapons = sections.find((section) => section.id === 'weapons')!
    expect(weapons.rows[0].cells).toHaveLength(STORE_COLUMNS.length)
    expect(weapons.rows[0].cells.filter((cell) => cell.items.length === 0)).toHaveLength(3)
  })

  it("orders sections the way DIM's D2Categories does", () => {
    // Classification comes from the bucket hash, so each fixture needs its own.
    const sections = buildSections(
      [
        row({ id: 'p', locationKey: 'postmaster', kind: 'other', inventoryBucketHash: 215593132, bucket: '丢失物品' }),
        row({ id: 'g', kind: 'other', inventoryBucketHash: 3284755031, bucket: '子职业' }),
        row({ id: 'i', kind: 'other', inventoryBucketHash: 1469714392, bucket: '消耗品' }),
        row({ id: 'a', kind: 'armor', type: '腿部护甲', inventoryBucketHash: 20886954, bucket: '腿部护甲' }),
        row({ id: 'w' }),
      ],
      DEFAULT_FILTERS,
    )
    expect(sections.map((section) => section.label)).toEqual(['邮政官', '武器', '护甲', '通用', '物品'])
  })

  it('keeps three weapon rows and five armor rows, like DIM', () => {
    const sections = buildSections(
      [
        row({ id: 'k', inventoryBucketHash: 1498876634, bucket: '动能武器' }),
        row({ id: 'e', inventoryBucketHash: 2465295065, bucket: '能量武器' }),
        row({ id: 'p', inventoryBucketHash: 953998645, bucket: '威能武器' }),
        row({ id: 'h', kind: 'armor', inventoryBucketHash: 3448274439, bucket: '头盔' }),
        row({ id: 'ga', kind: 'armor', inventoryBucketHash: 3551918588, bucket: '臂铠' }),
        row({ id: 'c', kind: 'armor', inventoryBucketHash: 14239492, bucket: '胸部护甲' }),
        row({ id: 'l', kind: 'armor', inventoryBucketHash: 20886954, bucket: '腿部护甲' }),
        row({ id: 'cl', kind: 'armor', inventoryBucketHash: 1585787867, bucket: '职业护甲' }),
      ],
      DEFAULT_FILTERS,
    )
    const weapons = sections.find((section) => section.id === 'weapons')
    const armor = sections.find((section) => section.id === 'armor')
    expect(weapons?.rows.map((r) => r.label)).toEqual(['动能武器', '能量武器', '威能武器'])
    expect(armor?.rows.map((r) => r.label)).toEqual(['头盔', '臂铠', '胸部护甲', '腿部护甲', '职业护甲'])
  })

  it('gives the worn item its own slot, ahead of the carried tiles', () => {
    const sections = buildSections(
      [
        row({ id: 'carried', name: 'A 携带', equipped: 'not_equipped', locationKey: 'hunter' }),
        row({ id: 'worn', name: 'Z 装备', equipped: 'equipped', locationKey: 'hunter', placement: { kind: 'equipped', characterId: 'c1', slotHash: 1498876634 } }),
      ],
      DEFAULT_FILTERS,
    )
    const cell = sections[0].rows[0].cells.find((c) => c.location === 'hunter')
    // The worn item is a slot, not the first element of the carried list.
    expect(cell?.equipped?.id).toBe('worn')
    expect(cell?.items.map((item) => item.id)).toEqual(['carried'])
  })

  it('puts subclass, artifact and ghost buckets in 通用, not 物品', () => {
    const sections = buildSections(
      [
        row({ id: 'a', kind: 'other', inventoryBucketHash: 1506418338, bucket: '神器' }),
        row({ id: 'b', kind: 'other', inventoryBucketHash: 4023194814, bucket: '机灵外壳' }),
        row({ id: 'c', kind: 'other', inventoryBucketHash: 1469714392, bucket: '消耗品' }),
      ],
      DEFAULT_FILTERS,
    )
    const general = sections.find((section) => section.label === '通用')
    const inventory = sections.find((section) => section.label === '物品')
    expect(general?.itemCount).toBe(2)
    expect(inventory?.itemCount).toBe(1)
  })

  it('orders rows by bucket rank, not by insertion order', () => {
    const sections = buildSections(
      [
        row({ id: 'p', inventoryBucketHash: 953998645, bucket: '威能武器' }),
        row({ id: 'k', inventoryBucketHash: 1498876634, bucket: '动能武器' }),
        row({ id: 'e', inventoryBucketHash: 2465295065, bucket: '能量武器' }),
      ],
      DEFAULT_FILTERS,
    )
    expect(sections[0].rows.map((r) => r.label)).toEqual(['动能武器', '能量武器', '威能武器'])
  })

  it('splits account-wide buckets by store, like every other category', () => {
    // DIM has no full-width category: an account-level item simply lands in the
    // vault column while the character columns stay empty.
    const sections = buildSections(
      [row({ id: 'p', locationKey: 'vault', kind: 'other', inventoryBucketHash: 1469714392, bucket: '消耗品' })],
      DEFAULT_FILTERS,
    )
    const inventory = sections.find((section) => section.id === 'inventory')
    expect(inventory?.rows[0].cells).toHaveLength(STORE_COLUMNS.length)
    const vault = inventory?.rows[0].cells.find((cell) => cell.location === 'vault')
    expect(vault?.items.map((item) => item.id)).toEqual(['p'])
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
      row({ locationKey: 'vault' }),
      row({ locationKey: 'vault' }),
      row({ locationKey: 'hunter' }),
      row({ locationKey: 'profile' }),
    ])
    expect(counts).toEqual([
      { value: 'hunter', label: '猎人', count: 1 },
      { value: 'vault', label: '仓库', count: 2 },
      { value: 'profile', label: '账号', count: 1 },
    ])
  })
})

describe('sort modes keep the worn item pinned', () => {
  /** Three hunter weapons: one worn (Z name, lowest power), two carried. */
  const squad = [
    row({ id: 'carriedC', name: 'C 携带', power: 550, equipped: 'not_equipped', locationKey: 'hunter', type: '手炮' }),
    row({ id: 'carriedA', name: 'A 携带', power: 540, equipped: 'not_equipped', locationKey: 'hunter', type: '自动步枪' }),
    row({
      id: 'worn',
      name: 'Z 装备',
      power: 500,
      equipped: 'equipped',
      locationKey: 'hunter',
      type: '刀剑',
      placement: { kind: 'equipped', characterId: 'c1', slotHash: 1498876634 },
    }),
  ]

  /** Worn slot first, then the carried list in the requested order. */
  function hunterCell(sort: SortKey): string[] {
    const sections = buildSections(squad, { ...DEFAULT_FILTERS, sort })
    const cell = sections.find((section) => section.id === 'weapons')!.rows[0]!.cells.find((c) => c.location === 'hunter')
    const carried = (cell?.items ?? []).map((item) => item.id)
    return cell?.equipped === null || cell?.equipped === undefined ? carried : [cell.equipped.id, ...carried]
  }

  it('pins the worn item under name sort and orders the rest by name', () => {
    expect(hunterCell('name-asc')).toEqual(['worn', 'carriedA', 'carriedC'])
  })

  it('pins the worn item under power sort and orders the rest by power', () => {
    // Worn has the lowest power; it still leads, the carried pair keeps 550 > 540.
    expect(hunterCell('power-desc')).toEqual(['worn', 'carriedC', 'carriedA'])
  })

  it('pins the worn item under type sort and orders the rest by type', () => {
    // 手炮 < 自动步枪 in zh collation.
    expect(hunterCell('type-asc')).toEqual(['worn', 'carriedC', 'carriedA'])
  })
})

describe('layout modes', () => {
  const items: ItemRow[] = [
    row({ id: '1', instanceId: '1', hash: 1, name: '猎人枪', locationKey: 'hunter', placement: { kind: 'inventory', characterId: 'c1' }, characterId: 'c1' }),
    row({ id: '2', instanceId: '2', hash: 2, name: '术士枪', locationKey: 'warlock', placement: { kind: 'inventory', characterId: 'c2' }, characterId: 'c2' }),
    row({ id: '3', instanceId: '3', hash: 3, name: '仓库枪', locationKey: 'vault', placement: { kind: 'vault' }, characterId: null }),
  ]

  it('wide mode shows every character plus the vault', () => {
    const sections = buildSections(items, DEFAULT_FILTERS, { layout: 'wide' })
    const row = sections[0]!.rows[0]!
    expect(row.cells.map((cell) => cell.location)).toEqual(['hunter', 'warlock', 'titan', 'vault'])
    expect(row.cells.map((cell) => cell.items.length)).toEqual([1, 1, 0, 1])
  })

  it('medium mode keeps the active character and the vault', () => {
    const sections = buildSections(items, DEFAULT_FILTERS, { layout: 'medium', activeCharacter: 'warlock' })
    const row = sections[0]!.rows[0]!
    expect(row.cells.map((cell) => cell.location)).toEqual(['warlock', 'vault'])
    expect(row.cells[0]!.items.map((item) => item.name)).toEqual(['术士枪'])
  })

  it('narrow mode collapses every location into one column', () => {
    const sections = buildSections(items, DEFAULT_FILTERS, { layout: 'narrow' })
    const row = sections[0]!.rows[0]!
    expect(row.cells).toHaveLength(1)
    expect(row.cells[0]!.items).toHaveLength(3)
    expect(row.cells[0]!.flex).toBe(true)
  })
})

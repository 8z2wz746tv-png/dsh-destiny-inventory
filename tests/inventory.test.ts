import { describe, expect, it } from 'vitest'
import { DestinyPayloadError } from '../src/mcp/queries'
import {
  buildExoticIndex,
  itemIdentity,
  parseInventoryPage,
  toItemRow,
  uniquifyKeys,
} from '../src/mcp/inventory'

/** Exotic index helper: hashes plus instance ids. */
function exotics(instances: string[] = [], hashes: number[] = []) {
  return { instances: new Set(instances), hashes: new Set(hashes) }
}

/** The exact envelope shape inventory_assistant answers with, condensed. */
function pageEnvelope(overrides: Record<string, unknown> = {}): unknown {
  const body = {
    ok: true,
    summary: '已读取背包。',
    data: {
      inventory: {
        location: 'all',
        items: [RAW_ROW],
        total_items: 1922,
        returned_items: 1,
        truncated: true,
        next_offset: 1000,
        ...overrides,
      },
    },
    candidates: [],
    next_actions: [],
    warnings: [],
  }
  return { content: [{ type: 'text', text: JSON.stringify(body) }] }
}

const RAW_ROW = {
  item_instance_id: '6917530198634644757',
  item_hash: 3718184802,
  name: '驱逐引擎',
  name_en: 'Ouster Engine',
  item_type: 'Weapon',
  item_type_display: '榴弹发射器',
  power: 550,
  bucket_type: 'Kinetic Weapons',
  is_equipped: true,
  is_locked: false,
  quantity: 1,
  location: 'hunter',
  character_id: '2305843009679355779',
  stats: null,
  icon_url: 'https://www.bungie.net/i.jpg',
  slot: '',
  slot_display: '',
  gear_tier: null,
  gear_tier_note: null,
  armor_system: '',
}

describe('parseInventoryPage', () => {
  it('reads the paging fields the walk depends on', () => {
    const page = parseInventoryPage(pageEnvelope())
    expect(page.totalItems).toBe(1922)
    expect(page.nextOffset).toBe(1000)
    expect(page.items).toHaveLength(1)
  })

  it('reports the last page as having no next offset', () => {
    const page = parseInventoryPage(pageEnvelope({ next_offset: null }))
    expect(page.nextOffset).toBeNull()
  })

  it('fails instead of walking a page with no total', () => {
    const body = { ok: true, data: { inventory: { items: [] } } }
    const value = { content: [{ type: 'text', text: JSON.stringify(body) }] }
    expect(() => parseInventoryPage(value)).toThrow(DestinyPayloadError)
  })
})

describe('toItemRow', () => {
  it('keeps the paint fields and drops the rest', () => {
    const row = toItemRow(RAW_ROW, exotics())
    expect(row).toEqual({
      id: 'hunter:6917530198634644757',
      hash: 3718184802,
      name: '驱逐引擎',
      type: '榴弹发射器',
      bucket: 'Kinetic Weapons',
      power: 550,
      equipped: true,
      locked: false,
      quantity: 1,
      icon: 'https://www.bungie.net/i.jpg',
      location: 'hunter',
      characterId: '2305843009679355779',
      exotic: false,
    })
    expect(JSON.stringify(row)).not.toContain('name_en')
    expect(JSON.stringify(row)).not.toContain('armor_system')
  })

  it('marks exotics by instance id', () => {
    const row = toItemRow(RAW_ROW, exotics(['6917530198634644757']))
    expect(row.exotic).toBe(true)
  })

  it('marks exotics by hash so stackables are not all gold', () => {
    const stackable = { ...RAW_ROW, item_instance_id: '0', item_hash: 999, location: 'profile' }
    expect(toItemRow(stackable, exotics([], [999])).exotic).toBe(true)
    expect(toItemRow(stackable, exotics(['123'], [])).exotic).toBe(false)
  })

  it('fails on a row missing its identity rather than painting a blank tile', () => {
    expect(() => toItemRow({ item_hash: 1, name: 'x' }, exotics())).toThrow(DestinyPayloadError)
  })

  it('keeps a null power instead of inventing zero', () => {
    const row = toItemRow({ ...RAW_ROW, power: null }, exotics())
    expect(row.power).toBeNull()
  })
})

describe('itemIdentity', () => {
  it('uses the instance id when the item has one', () => {
    expect(itemIdentity('hunter', '6917530198634644757', 1)).toBe('hunter:6917530198634644757')
  })

  it('falls back to the hash for stackables, which all report instance id "0"', () => {
    expect(itemIdentity('profile', '0', 4242)).toBe('profile:h4242')
    expect(itemIdentity('profile', '', 4242)).toBe('profile:h4242')
  })

  it('gives one stack per location distinct keys', () => {
    expect(itemIdentity('hunter', '0', 7)).not.toBe(itemIdentity('vault', '0', 7))
  })
})

describe('uniquifyKeys', () => {
  const base = toItemRow(RAW_ROW, exotics())

  it('leaves a unique key alone', () => {
    expect(uniquifyKeys([base])[0].id).toBe(base.id)
  })

  it('suffixes later rows that collide on identity', () => {
    const ids = uniquifyKeys([base, base, base]).map((row) => row.id)
    expect(ids).toEqual([base.id, `${base.id}#2`, `${base.id}#3`])
  })

  it('keeps every row, because they are real items', () => {
    expect(uniquifyKeys([base, base, base])).toHaveLength(3)
  })
})

describe('buildExoticIndex', () => {
  it('skips the placeholder instance id but keeps the hash', () => {
    const index = buildExoticIndex([{ item_instance_id: '0', item_hash: 5 }, { item_instance_id: '9', item_hash: 6 }])
    expect([...index.instances]).toEqual(['9'])
    expect([...index.hashes].sort()).toEqual([5, 6])
  })
})

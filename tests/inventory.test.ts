import { describe, expect, it } from 'vitest'
import { DestinyPayloadError } from '../src/mcp/queries'
import {
  buildRarityIndex,
  itemIdentity,
  parseInventoryPage,
  toItemRow,
  uniquifyKeys,
} from '../src/mcp/inventory'
import type { ItemRarity } from '../src/mcp/types'

/** Rarity index helper: instance ids and hashes at one tier. */
function rarityIndex(instances: string[] = [], hashes: number[] = [], tier: ItemRarity = 'exotic') {
  const byInstance = new Map<string, ItemRarity>()
  const byHash = new Map<number, ItemRarity>()
  for (const id of instances) byInstance.set(id, tier)
  for (const hash of hashes) byHash.set(hash, tier)
  return { byInstance, byHash }
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
    const row = toItemRow(RAW_ROW, rarityIndex())
    expect(row).toEqual({
      id: 'hunter:6917530198634644757',
      instanceId: '6917530198634644757',
      hash: 3718184802,
      name: '驱逐引擎',
      kind: 'weapon',
      type: '榴弹发射器',
      bucket: 'Kinetic Weapons',
      power: 550,
      equipped: true,
      locked: false,
      quantity: 1,
      icon: 'https://www.bungie.net/i.jpg',
      location: 'hunter',
      characterId: '2305843009679355779',
      rarity: 'unknown',
    })
    expect(JSON.stringify(row)).not.toContain('name_en')
    expect(JSON.stringify(row)).not.toContain('armor_system')
  })

  it('takes its rarity from the filtered reads, by instance id', () => {
    const row = toItemRow(RAW_ROW, rarityIndex(['6917530198634644757']))
    expect(row.rarity).toBe('exotic')
  })

  it('falls back to the hash so stackables are not all marked one rarity', () => {
    const stackable = { ...RAW_ROW, item_instance_id: '0', item_hash: 999, location: 'profile' }
    expect(toItemRow(stackable, rarityIndex([], [999])).rarity).toBe('exotic')
    expect(toItemRow(stackable, rarityIndex(['123'], [])).rarity).toBe('unknown')
  })

  it('fails on a row missing its identity rather than painting a blank tile', () => {
    expect(() => toItemRow({ item_hash: 1, name: 'x' }, rarityIndex())).toThrow(DestinyPayloadError)
  })

  it('keeps a null power instead of inventing zero', () => {
    const row = toItemRow({ ...RAW_ROW, power: null }, rarityIndex())
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
  const base = toItemRow(RAW_ROW, rarityIndex())

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

describe('buildRarityIndex', () => {
  it('indexes each tier by instance id and by hash', () => {
    const index = buildRarityIndex([
      { rarity: 'exotic', rows: [{ item_instance_id: '9', item_hash: 6 }] },
      { rarity: 'legendary', rows: [{ item_instance_id: '10', item_hash: 7 }] },
    ])
    expect(index.byInstance.get('9')).toBe('exotic')
    expect(index.byInstance.get('10')).toBe('legendary')
    expect(index.byHash.get(7)).toBe('legendary')
  })

  it('keeps the hash but not the placeholder id for stackables', () => {
    const index = buildRarityIndex([{ rarity: 'rare', rows: [{ item_instance_id: '0', item_hash: 5 }] }])
    expect(index.byInstance.has('0')).toBe(false)
    expect(index.byHash.get(5)).toBe('rare')
  })
})

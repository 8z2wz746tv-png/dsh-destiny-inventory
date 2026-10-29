import { describe, expect, it } from 'vitest'
import { columnsFromSockets, readItemBranch, readPerkPool } from '../src/mcp/item'
import type { InstanceSocket } from '../src/mcp/item'

/** Wrap a body the way the tool does. */
function envelope(body: Record<string, unknown>): unknown {
  return { content: [{ type: 'text', text: JSON.stringify(body) }] }
}

const ITEM_BODY = {
  ok: true,
  data: {
    // The tool names the branch `armor` even for weapons; observed on a launcher.
    armor: {
      identity: { item_hash: 1, name: '驱逐引擎' },
      instance: { item_instance_id: '42', power: 550, is_equipped: true },
      sockets: [
        { index: 0, kind: 'intrinsic', plug_hash: 111, name: '区域拒止框架', icon_url: 'i0' },
        { index: 1, kind: 'tubes', plug_hash: 222, name: '密闭发射', icon_url: 'i1' },
        { index: 2, kind: 'magazines_gl', plug_hash: 0, name: '', icon_url: '' },
      ],
    },
  },
}

const POOL_BODY = {
  ok: true,
  data: {
    weapon: {
      name: '驱逐引擎',
      rarity: '传说',
      damage_type: '虚空',
      ammo_type: '重型',
      weapon_type: '榴弹发射器',
      frame: '侵略型框架',
      description: '说明',
      roll_summary: '自动填装 + 混沌重塑',
    },
    sockets: [
      {
        slot: '枪管',
        kind: 'tubes',
        socket_index: 1,
        options: [
          { plug_hash: 222, name: '密闭发射', description: 'd', icon_url: 'i1', enhanced_plug_hash: 0 },
          { plug_hash: 333, name: '高爆弹药', description: 'd2', icon_url: 'i2', stat_effects: [{ stat: '爆炸范围', value: 15 }] },
        ],
        options_available: true,
      },
    ],
  },
}

describe('readItemBranch', () => {
  it('reads the branch the tool actually publishes', () => {
    const branch = readItemBranch(envelope(ITEM_BODY))
    expect(branch.sockets).toHaveLength(3)
    expect(branch.sockets[1].plugHash).toBe(222)
  })

  it('accepts a weapon-named branch too', () => {
    const body = { ok: true, data: { weapon: { identity: {}, instance: {}, sockets: [] } } }
    expect(readItemBranch(envelope(body)).sockets).toEqual([])
  })

  it('fails when the tool answered with an error', () => {
    expect(() => readItemBranch(envelope({ ok: false, error: { message: '没授权' } }))).toThrow('没授权')
  })
})

describe('readPerkPool', () => {
  it('marks the socketed option and leaves the rest unselected', () => {
    const pool = readPerkPool(envelope(POOL_BODY), new Map([[1, 222]]))
    const column = pool.columns[0]
    expect(column.slot).toBe('枪管')
    expect(column.options.map((option) => [option.name, option.selected])).toEqual([
      ['密闭发射', true],
      ['高爆弹药', false],
    ])
  })

  it('carries the definition facts the list payload omits', () => {
    const pool = readPerkPool(envelope(POOL_BODY), new Map())
    expect(pool.facts.rarity).toBe('传说')
    expect(pool.facts.damageType).toBe('虚空')
    expect(pool.facts.rollSummary).toBe('自动填装 + 混沌重塑')
  })

  it('keeps stat deltas on the options that have them', () => {
    const pool = readPerkPool(envelope(POOL_BODY), new Map())
    expect(pool.columns[0].options[1].statEffects).toEqual([{ stat: '爆炸范围', value: 15 }])
  })
})

describe('columnsFromSockets', () => {
  const sockets: InstanceSocket[] = [
    { index: 0, kind: 'intrinsic', plugHash: 5, name: '框架', icon: 'a' },
    { index: 1, kind: 'empty', plugHash: 0, name: '', icon: '' },
  ]

  it('drops empty sockets instead of rendering blank columns', () => {
    expect(columnsFromSockets(sockets)).toHaveLength(1)
  })

  it('marks the single known plug as selected', () => {
    expect(columnsFromSockets(sockets)[0].options[0].selected).toBe(true)
  })
})

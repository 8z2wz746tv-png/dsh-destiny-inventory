/**
 * 同类型持有候选解析。
 *
 * 重点不是“能解析”，而是：当前武器必须按 **selectedItemHash** 整组排除；
 * 即使第二次查询没有返回选中的那个实例，只返回了同 Hash 的另一副本，也不能把它当候选。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isAlternativesQuery,
  parseWeaponAlternatives,
} from '../src/client/agent/weapon-alternatives-model'

const FIXTURE = readFileSync(join(process.cwd(), 'tests/fixtures/weapon-alternatives.json'), 'utf8')
const CURRENT = { instanceId: '6917529431004309171', hash: 1216319404, name: '命运终结者（失时）' }

const withCurrentCopy = (): string => {
  const copy = JSON.parse(FIXTURE) as Record<string, any>
  copy.data.matched.unshift({
    item_hash: 1216319404,
    name: '命运终结者（失时）',
    name_en: 'Fatebringer (Timelost)',
    rarity: '传说',
    rarity_tier: 5,
    weapon_type: '手炮',
    frame: '适配框架',
    rpm: 140,
    roll_kind: 'random',
    is_craftable: false,
    icon_url: '',
    instance_id: '6917529431004309171',
    location: 'Hunter',
    power: 550,
    is_equipped: true,
    locked: true,
    perks: ['适配框架', '槽化枪管', '广口弹匣', '高爆载荷', '萤火虫'],
    reason: '命中筛选条件',
  })
  return JSON.stringify(copy)
}

describe('isAlternativesQuery', () => {
  it('recognizes a type query without a weapon name', () => {
    expect(isAlternativesQuery('{"weapon_type":"手炮"}')).toBe(true)
    expect(isAlternativesQuery('{"weapon_type":"手炮","weapon_name":""}')).toBe(true)
  })

  it('does not treat a named query or a mixed query as alternatives', () => {
    expect(isAlternativesQuery('{"weapon_name":"命运终结者"}')).toBe(false)
    expect(isAlternativesQuery('{"weapon_name":"命运终结者","weapon_type":"手炮"}')).toBe(false)
  })

  it('rejects malformed arguments', () => {
    expect(isAlternativesQuery('not json')).toBe(false)
    expect(isAlternativesQuery('')).toBe(false)
  })
})

describe('当前武器排除', () => {
  it('excludes the current item_hash even when the selected instance is absent', () => {
    const model = parseWeaponAlternatives(FIXTURE, CURRENT)
    expect(model).not.toBeNull()
    expect(model?.currentKnown).toBe(true)
    expect(model?.currentHash).toBe(1216319404)
    expect(model?.currentName).toBe('命运终结者（失时）')
    // 选中的 A 不在 fixture 里，但同 Hash 的 B 在；B 仍必须被整组排除。
    expect(model?.current).toBeNull()
    expect(model?.candidates.map((candidate) => candidate.name)).toEqual([
      '三冠得主',
      '信任',
      '克瑞米尔之匕',
    ])
    expect(model?.candidates.some((candidate) => candidate.itemHash === 1216319404)).toBe(false)
  })

  it('shows current details only when the selected instance is actually returned', () => {
    const model = parseWeaponAlternatives(withCurrentCopy(), CURRENT)
    expect(model?.current?.instanceId).toBe('6917529431004309171')
    expect(model?.current?.slots).toContain('高爆载荷')
    // 当前组（A 和同 Hash 的 B）仍然一起被排除。
    expect(model?.candidates.map((candidate) => candidate.name)).toEqual([
      '三冠得主',
      '信任',
      '克瑞米尔之匕',
    ])
  })

  it('refuses candidates when selectedItemHash is unknown', () => {
    const model = parseWeaponAlternatives(FIXTURE, { instanceId: CURRENT.instanceId, name: CURRENT.name })
    expect(model).not.toBeNull()
    expect(model?.currentKnown).toBe(false)
    expect(model?.currentHash).toBe(0)
    expect(model?.candidates).toEqual([])
  })

  it('does not exclude a group that merely happens to be absent from the result', () => {
    const model = parseWeaponAlternatives(FIXTURE, { ...CURRENT, hash: 999 })
    expect(model?.currentKnown).toBe(true)
    expect(model?.candidates).toHaveLength(4) // B + 三冠 + 信任 + 克瑞米尔
  })
})

describe('候选分组与证据', () => {
  const model = parseWeaponAlternatives(FIXTURE, CURRENT)

  it('groups multiple copies of the same item_hash into one candidate', () => {
    const trust = model?.candidates.find((candidate) => candidate.name === '信任')
    expect(trust?.copies.map((copy) => copy.instanceId)).toEqual([
      '6917530193973399564',
      '6917530193975673732',
    ])
  })

  it('keeps truncation facts instead of presenting a complete ranking', () => {
    expect(model?.matchedCount).toBe(126)
    expect(model?.returnedCount).toBe(5)
    expect(model?.truncated).toBe(true)
  })

  it('keeps community list records with source and date, not a recommendation flag', () => {
    const triple = model?.candidates.find((candidate) => candidate.name === '三冠得主')
    expect(triple?.community[0]).toMatchObject({
      list: '购物清单-白弹',
      tier: 'A',
      source: '忠诚纪念碑',
      updatedAt: '2026.8.30',
    })
    const trust = model?.candidates.find((candidate) => candidate.name === '信任')
    expect(trust?.community[0]?.note).toContain('Perk 多样性少')
  })

  it('leaves community empty when the list has no hit', () => {
    const copy = JSON.parse(FIXTURE) as Record<string, any>
    copy.data.farming_list.results = []
    const empty = parseWeaponAlternatives(JSON.stringify(copy), CURRENT)
    expect(empty?.candidates.every((candidate) => candidate.community.length === 0)).toBe(true)
  })
})

describe('降级', () => {
  it('returns null for empty, invalid JSON or a non-owned scope', () => {
    expect(parseWeaponAlternatives(null, CURRENT)).toBeNull()
    expect(parseWeaponAlternatives('', CURRENT)).toBeNull()
    expect(parseWeaponAlternatives('not json', CURRENT)).toBeNull()
    const copy = JSON.parse(FIXTURE) as Record<string, any>
    copy.data.scope = 'manifest_catalog'
    expect(parseWeaponAlternatives(JSON.stringify(copy), CURRENT)).toBeNull()
  })

  it('skips malformed rows instead of inventing copies', () => {
    const copy = JSON.parse(FIXTURE) as Record<string, any>
    copy.data.matched.push({ item_hash: 1, instance_id: '' })
    copy.data.matched.push(null)
    const model = parseWeaponAlternatives(JSON.stringify(copy), CURRENT)
    expect(model?.candidates).toHaveLength(3)
  })
})

/**
 * 武器卡解析。
 *
 * 样本是 2026-11-14 真机 `weapon_assistant(intent="analyze")` 的完整响应
 * （`tests/fixtures/weapon-analyze.json`，5 个副本）。这里钉三件事：
 *
 * - 只读真实字段，不补猜；
 * - 结构异常/解析失败返回 `null`，由 UI 回退原始文本；
 * - 未读账号（owned.status != checked）不把 0 件说成“你没有”。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isWeaponAssistant, parseWeaponCard } from '../src/client/agent/weapon-card-model'

const FIXTURE = readFileSync(join(process.cwd(), 'tests/fixtures/weapon-analyze.json'), 'utf8')
const FILTER_FIXTURE = readFileSync(join(process.cwd(), 'tests/fixtures/weapon-filter-rolls.json'), 'utf8')

/** 在真实结构上改一处，模拟协议坏掉；不改字段名。 */
function mutated(change: (root: Record<string, any>) => void): string {
  const copy = JSON.parse(FIXTURE) as Record<string, any>
  change(copy)
  return JSON.stringify(copy)
}

describe('真实响应', () => {
  const model = parseWeaponCard(FIXTURE)

  it('reads the identity and the account copies', () => {
    expect(model).not.toBeNull()
    expect(model?.source).toBe('analyze')
    expect(model?.name).toBe('命运终结者')
    expect(model?.nameEn).toBe('Fatebringer')
    expect(model?.weaponType).toBe('手炮')
    expect(model?.frame).toBe('适配框架')
    expect(model?.rarity).toBe('传说')
    expect(model?.damageType).toBe('动能')
    expect(model?.ammoType).toBe('白弹')
    expect(model?.rpm).toBe(140)
    expect(model?.inventoryChecked).toBe(true)
    expect(model?.inventoryStatus).toBe('complete')
    expect(model?.owned).toHaveLength(5)
  })

  it('reads gearTier from weapon.gear_tier, not from instance', () => {
    const raw = JSON.parse(FIXTURE) as Record<string, any>
    const instances = raw.data.inventory.instances
    // 真实 analyze fixture：gear_tier 在 weapon 顶层，instance 下没有。
    expect(instances[1].weapon.gear_tier).toBe(2)
    expect(instances[1].weapon.instance.gear_tier).toBeUndefined()
    expect(instances[2].weapon.gear_tier).toBe(5)
    expect(instances[2].weapon.instance.gear_tier).toBeUndefined()
    expect(instances[0].weapon.gear_tier).toBeNull()
    expect(instances[0].weapon.instance.gear_tier).toBeUndefined()
    // 解析结果必须与真实路径一致；改去读 instance 会让这里变成 undefined。
    expect(model?.owned[1].gearTier).toBe(2)
    expect(model?.owned[2].gearTier).toBe(5)
    expect(model?.owned[0].gearTier).toBeNull()
  })

  it('keeps the exact instance ids, not names or hashes', () => {
    expect(model?.owned.map((copy) => copy.instanceId)).toEqual([
      '6917530086191827487',
      '6917530086187977441',
      '6917530194681767321',
      '6917529923528575458',
      '6917529431004309171',
    ])
    const hunter = model?.owned.find((copy) => copy.instanceId === '6917529431004309171')
    expect(hunter).toMatchObject({
      location: 'Hunter',
      power: 550,
      equipped: true,
      locked: true,
      gearTier: null,
    })
    // null = 不在分级体系内，不是 T0；不要把它变成 0。
    expect(model?.owned[1].gearTier).toBe(2)
    expect(model?.owned[2].gearTier).toBe(5)
  })

  it('reads each copy current perks from its own sockets', () => {
    const hunter = model?.owned.find((copy) => copy.instanceId === '6917529431004309171')
    expect(hunter?.perks.map((perk) => perk.name)).toEqual([
      '适配框架',
      '槽化枪管',
      '广口弹匣',
      '高爆载荷',
      '萤火虫',
    ])
  })

  it('keeps stats, recommended hints and references with their source', () => {
    expect(model?.stats).toHaveLength(12)
    expect(model?.stats[0]).toMatchObject({ name: '每分钟发射数', display: '140' })
    expect(model?.perkHints.map((hint) => hint.slot)).toEqual(['枪管', '弹匣', '特性1', '特性2'])
    expect(model?.perkHints.every((hint) => hint.recommended.length <= 3)).toBe(true)
    expect(model?.references.some((ref) => ref.label === '刷取参考')).toBe(true)
    const wishlist = model?.references.find((ref) => ref.label === '愿单参考')
    expect(wishlist?.text).toContain('宏伟之嚎')
    expect(wishlist?.source).toContain('dim_wishlist')
  })

  it('keeps the same-name warning instead of dropping it', () => {
    expect(model?.warnings.some((line) => line.includes('同名的武器有 4 个版本'))).toBe(true)
  })
})

describe('filter_rolls 紧凑副本（analyze 被宿主截断时的回退）', () => {
  const model = parseWeaponCard(FILTER_FIXTURE)

  it('reads the real owned copies and their exact instance ids', () => {
    expect(model).not.toBeNull()
    expect(model?.source).toBe('filter_rolls')
    expect(model?.name).toBe('命运终结者（失时）')
    expect(model?.owned).toHaveLength(4)
    expect(model?.owned[0]).toMatchObject({
      instanceId: '6917529431004309171',
      location: 'Hunter',
      power: 550,
      equipped: true,
      locked: true,
    })
    expect(model?.owned[0].perks.map((perk) => perk.name)).toContain('高爆载荷')
    // filter_rolls 不给栏名；不要编一个。
    expect(model?.owned[0].perks[0].slot).toBe('')
  })

  it('does not claim stats, tiers or references it did not receive', () => {
    expect(model?.stats).toEqual([])
    expect(model?.perkHints).toEqual([])
    expect(model?.references).toEqual([])
    expect(model?.owned[0].gearTier).toBeUndefined()
    expect(model?.inventoryStatus).toBe('owned_inventory')
    expect(model?.inventoryChecked).toBe(true)
  })

  it('keeps incomplete coverage visible instead of presenting it as complete', () => {
    const copy = JSON.parse(FILTER_FIXTURE) as Record<string, any>
    copy.data.coverage_complete = false
    const partial = parseWeaponCard(JSON.stringify(copy))
    expect(partial?.owned).toHaveLength(4)
    expect(partial?.warnings.some((line) => line.includes('扫描未完整'))).toBe(true)
  })

  it('does not turn an empty filter_rolls result into a card', () => {
    const copy = JSON.parse(FILTER_FIXTURE) as Record<string, any>
    copy.data.matched = []
    expect(parseWeaponCard(JSON.stringify(copy))).toBeNull()
  })
})

describe('降级', () => {
  it('returns null for empty or invalid JSON', () => {
    expect(parseWeaponCard(null)).toBeNull()
    expect(parseWeaponCard('')).toBeNull()
    expect(parseWeaponCard('not json')).toBeNull()
    expect(parseWeaponCard('{"ok":true')).toBeNull()
  })

  it('returns null when the tool refused or the weapon is missing', () => {
    expect(parseWeaponCard(mutated((root) => { root.ok = false }))).toBeNull()
    expect(parseWeaponCard(mutated((root) => { delete root.data.weapon }))).toBeNull()
    expect(parseWeaponCard(mutated((root) => { root.data.weapon.name = '' }))).toBeNull()
  })

  it('does not claim the account was read when inventory is missing', () => {
    const model = parseWeaponCard(mutated((root) => { delete root.data.inventory }))
    expect(model).not.toBeNull()
    expect(model?.inventoryChecked).toBe(false)
    expect(model?.owned).toEqual([])
  })

  it('does not claim the account was read when owned.status is not checked', () => {
    const model = parseWeaponCard(mutated((root) => { root.data.inventory.weapon.owned.status = 'unavailable' }))
    expect(model?.inventoryChecked).toBe(false)
    expect(model?.owned).toEqual([])
  })

  it('skips malformed copies instead of inventing one', () => {
    const model = parseWeaponCard(
      mutated((root) => {
        root.data.inventory.instances.push({ weapon: { instance: { instance_id: '' } } })
        root.data.inventory.instances.push({ nope: true })
        root.data.inventory.instances.push(null)
      }),
    )
    expect(model?.owned).toHaveLength(5)
  })

  it('does not throw on malformed stats, sockets or options', () => {
    const model = parseWeaponCard(
      mutated((root) => {
        root.data.stats = [null, { name: '射程' }, { name: 42, display: 1 }, 'bad']
        root.data.sockets = [null, { kind: 'trait', slot: 42, options: [null, { name: 1 }] }, { kind: 'other' }]
        root.warnings = [null, 42, '真实警告']
      }),
    )
    expect(model).not.toBeNull()
    expect(model?.stats).toEqual([])
    expect(model?.perkHints).toEqual([])
    expect(model?.warnings).toContain('真实警告')
  })

  it('does not turn god_roll.kind=none into a recommendation', () => {
    const model = parseWeaponCard(
      mutated((root) => {
        root.data.god_roll = { kind: 'none', note: '愿单未收录' }
      }),
    )
    expect(model?.references.some((ref) => ref.label === '愿单参考')).toBe(false)
  })

  it('recognizes the MCP tool suffix', () => {
    expect(isWeaponAssistant('mcp__destiny__weapon_assistant')).toBe(true)
    expect(isWeaponAssistant('weapon_assistant')).toBe(true)
    expect(isWeaponAssistant('inventory_assistant')).toBe(false)
    expect(isWeaponAssistant('')).toBe(false)
  })
})

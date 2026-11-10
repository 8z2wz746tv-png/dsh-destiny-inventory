/**
 * 套装反向索引：hash 转换、一对多冲突、效果描述。
 *
 * 三条都是"错了不会报错"的类型——查不到东西看起来和"这件没套装"一模一样。
 */
import { describe, expect, it } from 'vitest'
import { ItemSets, parseItemSets } from '../src/bungie/item-sets'

/** 一个**负数** hash 的物品：有符号转换只在负数上分得开。 */
const NEGATIVE = -1875241285

const perk = (hash: number, name: string, description: string) => ({
  json: JSON.stringify({ hash, displayProperties: { name, description } }),
})

const set = (hash: number, name: string, items: number[], perks: { count: number; perk: number }[]) => ({
  json: JSON.stringify({
    hash,
    displayProperties: { name },
    setItems: items,
    setPerks: perks.map((p) => ({ requiredSetCount: p.count, sandboxPerkHash: p.perk })),
  }),
})

/** 组件与 manifest 用的是无符号 hash；表里的 id 是有符号。 */
const unsigned = (signed: number) => (signed < 0 ? signed + 2 ** 32 : signed)

describe('反向索引', () => {
  const perks = [perk(1001, '战斗冥想', '两件效果'), perk(1002, '利刃专注', '四件效果')]
  // 用负数 hash 的物品：转换与否在这里才分得开（正数转不转都一样）。
  const sets = [
    set(-500, '圣贤保护者', [unsigned(NEGATIVE), unsigned(-700)], [
      { count: 4, perk: 1002 },
      { count: 2, perk: 1001 },
    ]),
  ]

  it('finds the set from an item hash', () => {
    const { byItem } = parseItemSets(sets, perks)
    // 物品 hash 是负数；`setItems` 里存的是无符号 2419726011。不过 `toSignedHash` 就全落空。
    const found = byItem.get(NEGATIVE)
    expect(found).toHaveLength(1)
    expect(found?.[0].name).toBe('圣贤保护者')
  })

  it('resolves both tiers, ordered by count, with descriptions', () => {
    const { byItem } = parseItemSets(sets, perks)
    expect(byItem.get(NEGATIVE)?.[0].tiers).toEqual([
      { count: 2, name: '战斗冥想', description: '两件效果' },
      { count: 4, name: '利刃专注', description: '四件效果' },
    ])
  })

  it('an item in no set is simply absent', () => {
    expect(parseItemSets(sets, perks).byItem.get(999)).toBeUndefined()
  })
})

describe('一对多是实测前提，不是假设', () => {
  it('counts an item that belongs to two sets instead of silently keeping the first', () => {
    const two = [
      set(-500, '甲套装', [7], [{ count: 2, perk: 1001 }]),
      set(-501, '乙套装', [7], [{ count: 4, perk: 1002 }]),
    ]
    const index = parseItemSets(two, [])
    // Injectable violation: overwrite on the second insert and this reads 0, hiding
    // a data assumption that just broke.
    expect(index.conflictCount).toBe(1)
    expect(index.byItem.get(7)).toHaveLength(2)
  })

  it('a set listing the same item twice does not count as a conflict', () => {
    const dup = [set(-500, '甲套装', [7, 7], [{ count: 2, perk: 1001 }])]
    expect(parseItemSets(dup, []).byItem.get(7)).toHaveLength(1)
  })

  it('reports no conflict for well-formed data', () => {
    const clean = [
      set(-500, '甲套装', [1, 2], []),
      set(-501, '乙套装', [3, 4], []),
    ]
    expect(parseItemSets(clean, []).conflictCount).toBe(0)
  })
})

describe('降级', () => {
  it('a missing perk row leaves the tier name empty rather than inventing one', () => {
    const { byItem } = parseItemSets([set(-500, '甲', [7], [{ count: 2, perk: 9999 }])], [])
    expect(byItem.get(7)?.[0].tiers[0]).toMatchObject({ count: 2, name: '', description: '' })
  })

  it('a broken table yields no sets instead of throwing', () => {
    const broken = { prepare: () => { throw new Error('no such table') } }
    const sets = new ItemSets(broken as never)
    expect(sets.of(NEGATIVE)).toBeNull()
    expect(sets.conflictCount).toBe(0)
  })
})

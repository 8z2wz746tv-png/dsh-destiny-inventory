/**
 * 两块护甲内容的**判定**——该不该画、画成什么样。
 *
 * 判 `null` 而不是空对象，理由和套装那边相同：一个空的能量条和一条满的能量条
 * 在界面上都是"有条"，但前者是谎言。
 */
import { describe, expect, it } from 'vitest'
import { energyBar, setPanel } from '../src/client/armor-view'

describe('能量条', () => {
  it('a weapon reports null and draws nothing', () => {
    // Injectable violation: return a zero-filled bar and every weapon grows an empty
    // energy strip.
    expect(energyBar(null)).toBeNull()
  })

  it('computes the ratio against capacity', () => {
    const bar = energyBar({ capacity: 11, used: 10, unused: 1, type: '虚空能量' })
    expect(bar).toMatchObject({ used: 10, capacity: 11, type: '虚空能量', showBar: true })
    expect(bar?.ratio).toBeCloseTo(10 / 11)
  })

  it('an unmapped element keeps the numbers and an empty name', () => {
    // 名字空着，界面写"能量"；不替游戏猜是哪种元素。
    expect(energyBar({ capacity: 10, used: 0, unused: 10, type: '' })).toMatchObject({
      type: '',
      used: 0,
      capacity: 10,
    })
  })

  it('capacity zero means no bar, not a division by zero', () => {
    const bar = energyBar({ capacity: 0, used: 0, unused: 0, type: '' })
    expect(bar).toMatchObject({ showBar: false, ratio: 0 })
  })

  it('never reports a ratio above one', () => {
    expect(energyBar({ capacity: 10, used: 12, unused: 0, type: '' })?.ratio).toBe(1)
  })
})

describe('套装区', () => {
  const tiers = [
    { count: 2, name: '战斗冥想', description: '两件效果' },
    { count: 4, name: '利刃专注', description: '四件效果' },
  ]

  it('passes the tiers through in order, marking which are live', () => {
    const panel = setPanel({ hash: 1, name: '圣贤保护者', tiers, owned: 2 })
    expect(panel).toEqual({
      name: '圣贤保护者',
      owned: 2,
      tiers: [
        { count: 2, name: '战斗冥想', description: '两件效果', active: true },
        { count: 4, name: '利刃专注', description: '四件效果', active: false },
      ],
    })
  })

  it('an item in no set draws nothing', () => {
    expect(setPanel(null)).toBeNull()
  })

  it('a set with no name draws nothing rather than a bare header', () => {
    // Injectable violation: render it anyway and the card shows a "套装" label
    // followed by a blank line.
    expect(setPanel({ hash: 1, name: '', tiers, owned: 0 })).toBeNull()
  })

  it('a count between the tiers lights up exactly the lower one', () => {
    const three = setPanel({ hash: 1, name: '甲', tiers, owned: 3 })
    expect(three?.tiers.map((tier) => tier.active)).toEqual([true, false])
    const four = setPanel({ hash: 1, name: '甲', tiers, owned: 4 })
    expect(four?.tiers.map((tier) => tier.active)).toEqual([true, true])
  })

  it('zero owned lights nothing', () => {
    // Injectable violation: treat `owned` as always satisfied and a set the player
    // owns nothing of shows both tiers glowing.
    expect(setPanel({ hash: 1, name: '甲', tiers, owned: 0 })?.tiers.map((t) => t.active)).toEqual([
      false,
      false,
    ])
  })
})

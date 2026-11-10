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

  it('passes the set through in the order it arrived', () => {
    expect(setPanel({ hash: 1, name: '圣贤保护者', tiers })).toEqual({ name: '圣贤保护者', tiers })
  })

  it('an item in no set draws nothing', () => {
    expect(setPanel(null)).toBeNull()
  })

  it('a set with no name draws nothing rather than a bare header', () => {
    // Injectable violation: render it anyway and the card shows a "套装" label
    // followed by a blank line.
    expect(setPanel({ hash: 1, name: '', tiers })).toBeNull()
  })

  it('does not decide which tier is active', () => {
    // 激活状态需要"玩家共有这个套装几件"，是跨物品的事实，单件详情给不出来。
    // 这条钉住的是：判定不碰它，档位原样透传。
    const panel = setPanel({ hash: 1, name: '圣贤保护者', tiers })
    expect(panel?.tiers.every((tier) => !('active' in tier))).toBe(true)
  })
})

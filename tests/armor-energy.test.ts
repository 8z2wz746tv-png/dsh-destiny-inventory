/**
 * 能量链路：组件 300 → ProfileItem → ItemDetailView。
 *
 * 最要紧的一条不是"能读出来"，是**缺失时不补 0**——0 是一个合法的已用能量值，
 * 拿它当"没有数据"会让满配护甲看起来空着。
 */
import { describe, expect, it } from 'vitest'
import { toItem } from '../src/bungie/profile-item'
import { EnergyTypeNames } from '../src/bungie/energy-types'

const raw = { itemHash: 42, bucketHash: 100, quantity: 1, state: 0, transferStatus: 0, itemInstanceId: 'i1' }

/** 只喂组件 300，其余组件留空。 */
const build = (instance: Record<string, unknown> | undefined) =>
  toItem(raw as never, 'profile', 'vault', null, {
    instances: instance === undefined ? {} : { i1: instance },
    socketData: {},
    reusableData: {},
    objectiveData: {},
    statData: {},
  } as never)

describe('能量：三个数字一起读', () => {
  it('reads capacity, used and unused from the instance', () => {
    const item = build({
      energy: { energyCapacity: 11, energyUsed: 10, energyUnused: 1, energyTypeHash: 4069572561 },
    })
    expect(item.energy).toEqual({ capacity: 11, used: 10, unused: 1, typeHash: 4069572561 })
  })

  it('a weapon with no energy block reports null, never zeroes', () => {
    // Injectable violation: default the block to {0,0,0} and every weapon looks like
    // an armor piece with a full bar of nothing.
    expect(build({}).energy).toBeNull()
    expect(build(undefined).energy).toBeNull()
  })

  it('zero used is a real value and must survive', () => {
    const item = build({ energy: { energyCapacity: 10, energyUsed: 0, energyUnused: 10 } })
    expect(item.energy).toMatchObject({ capacity: 10, used: 0, unused: 10 })
  })

  it('a capacity with no used/unused still reports the capacity', () => {
    // 老数据可能只带容量。used/unused 缺失时读 0，但 capacity 在就是有能量。
    const item = build({ energy: { energyCapacity: 8 } })
    expect(item.energy).toMatchObject({ capacity: 8, used: 0, unused: 0 })
  })
})

describe('能量元素名', () => {
  const db = {
    prepare: () => ({
      all: () => [
        { json: JSON.stringify({ hash: 3373582085, displayProperties: { name: '虚空能量' } }) },
        { json: JSON.stringify({ hash: 591714140, displayProperties: { name: '烈日能量' } }) },
      ],
    }),
  }

  it('resolves a name through the signed hash', () => {
    const names = new EnergyTypeNames(db as never)
    // 组件给的是无符号 4069572561；表里存的也是无符号，内部统一转有符号再查。
    expect(names.name(3373582085)).toBe('虚空能量')
    expect(names.name(591714140)).toBe('烈日能量')
  })

  it('an unknown hash returns an empty string, not a guess', () => {
    // Injectable violation: fall back to a default element and the card paints a
    // colour the game never said.
    expect(new EnergyTypeNames(db as never).name(123)).toBe('')
    expect(new EnergyTypeNames(db as never).name(null)).toBe('')
  })

  it('a broken table degrades to empty rather than throwing', () => {
    const broken = { prepare: () => { throw new Error('no such table') } }
    expect(new EnergyTypeNames(broken as never).name(591714140)).toBe('')
  })
})

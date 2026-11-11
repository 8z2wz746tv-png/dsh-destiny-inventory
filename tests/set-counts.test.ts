/**
 * 套装件数：按**部位去重**。
 *
 * 这条规则错了不会报错——只会让"2 件已生效"在一个只穿了 1 件的角色身上亮起来。
 */
import { describe, expect, it } from 'vitest'
import { countSets } from '../src/host/set-counts'
import type { ProfileItem } from '../src/bungie/profile'

const item = (itemHash: number, bucketHash: number): ProfileItem =>
  ({ itemHash, bucketHash } as unknown as ProfileItem)

const SET = { hash: -500, name: '甲套装', tiers: [] }
/** 只有 hash 7 的装备属于这个套装。 */
const lookup = (itemHash: number) => (itemHash === 7 ? SET : null)

describe('按部位去重', () => {
  it('two copies of the same slot count once', () => {
    // 仓库里囤了两件同款胸甲，仍然只算 1 件。
    // Injectable violation: count every row and the panel claims 2 件已生效 off one slot.
    expect(countSets([item(7, 100), item(7, 100)], lookup).get(-500)).toBe(1)
  })

  it('different slots of the same set each count', () => {
    expect(countSets([item(7, 100), item(7, 200), item(7, 300)], lookup).get(-500)).toBe(3)
  })

  it('items outside any set are ignored', () => {
    expect(countSets([item(9, 100)], lookup).get(-500)).toBeUndefined()
  })

  it('a set nobody owns is simply absent', () => {
    expect(countSets([], lookup).size).toBe(0)
  })
})

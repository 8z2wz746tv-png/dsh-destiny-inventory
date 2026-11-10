/**
 * 对着**真实的 manifest** 跑一次两条新查询。
 *
 * 为什么需要它：单测都是喂假行，能证明"解析逻辑对"，但证明不了"类真的拿到了 db"。
 * 这一条曾经抓到过一个只有真机才会暴露的 bug——`EnergyTypeNames(this.db)` 写成类字段
 * 初始化，那时 `this.db` 还是 null，两个查询永远返回空，而所有单测都是绿的。
 *
 * 找不到库就跳过：这条路只在有本地 manifest 的机器上有意义。
 */
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ManifestStore } from '../src/bungie/manifest'

const MANIFEST = '/Users/husky/destiny2-mcp-fresh/manifest/destiny_manifest_zh.sqlite3'
const available = existsSync(MANIFEST)

describe.skipIf(!available)('真实 manifest', () => {
  it('constructs a usable store', () => {
    const store = new ManifestStore(MANIFEST)
    expect(store.status().available).toBe(true)
  })

  it('resolves an energy type through the signed hash', () => {
    // 组件给的是无符号 4069572561；表里 id 是有符号 -225394735。
    const store = new ManifestStore(MANIFEST)
    expect(store.energyType(4069572561)).toBe('虚空能量')
  })

  it('finds the set an armor piece belongs to, with both tiers', () => {
    // 圣贤保护者臂环。Injectable violation: construct the lookup eagerly and this
    // returns null while every fake-row test stays green.
    const set = new ManifestStore(MANIFEST).armorSet(1887527934)
    expect(set?.name).toBe('圣贤保护者')
    expect(set?.tiers.map((tier) => `${tier.count}:${tier.name}`)).toEqual([
      '2:战斗冥想',
      '4:利刃专注',
    ])
  })

  it('an item in no set returns null', () => {
    // 一件武器不会在任何护甲套装里。
    const store = new ManifestStore(MANIFEST)
    expect(store.armorSet(0)).toBeNull()
  })
})

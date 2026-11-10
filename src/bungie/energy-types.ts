/**
 * 能量元素名的查询。
 *
 * 单独一个文件，有两个原因：`manifest.ts` 贴着 400 行上限；而这件事和伤害类型同构却
 * 不能照抄——伤害类型按 **enum** 查，能量按 **hash** 查，而且 hash 是有符号的：
 * 组件 300 给 `4069572561`，sqlite 的 `id` 是 `-225394735`。不过 `toSignedHash` 就全落空。
 */
import type { DatabaseSync } from 'node:sqlite'
import { toSignedHash } from './manifest'

/** 懒加载的能量元素名表；一次查询，之后走内存。 */
export class EnergyTypeNames {
  private names: Map<number, string> | null = null

  constructor(private readonly db: DatabaseSync | null) {}

  /**
   * @param hash - 组件 300 的 `energyTypeHash`（无符号）。
   * @returns 本地化名称；查不到返回**空串**，调用方就只显示数字，不猜元素。
   */
  name(hash: number | null): string {
    if (hash === null) return ''
    if (this.names === null) this.names = this.load()
    return this.names.get(toSignedHash(hash)) ?? ''
  }

  private load(): Map<number, string> {
    const out = new Map<number, string>()
    if (this.db === null) return out
    try {
      const rows = this.db.prepare('select json from DestinyEnergyTypeDefinition').all() as {
        json: string
      }[]
      for (const row of rows) {
        const parsed = JSON.parse(row.json) as {
          hash?: number
          displayProperties?: { name?: string }
        }
        const name = parsed.displayProperties?.name ?? ''
        if (typeof parsed.hash === 'number' && name !== '') {
          out.set(toSignedHash(parsed.hash), name)
        }
      }
    } catch {
      // 表缺失或查询失败都退化成"没有名字"：详情卡只显示数字。
    }
    return out
  }
}

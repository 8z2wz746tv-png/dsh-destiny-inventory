/**
 * 护甲详情里两块的**判定**，与渲染分开。
 *
 * 分开的理由很实际：这个仓没有 jsdom，组件渲染测不了；能测的是"该不该画、画成什么样"。
 * 于是判定全在这里（纯函数），组件只负责把它画出来。
 */
import type { ArmorSetView, ItemDetailView } from '../host/types'

/** 能量条要画成什么样；不该画时返回 `null`。 */
export interface EnergyBar {
  /** 元素名；manifest 里查不到时是空串——界面只显示数字，不猜元素。 */
  type: string
  used: number
  capacity: number
  /** 0..1，用来画进度条。容量为 0 时是 0，不做除零。 */
  ratio: number
  /** 容量为 0 时没有可信比例，只报数字。 */
  showBar: boolean
}

/**
 * @param energy - 详情里的能量块；武器与缺失时是 `null`。
 * @returns `null` 表示**这一块整个不画**——不是画一条空的。
 */
export function energyBar(energy: ItemDetailView['energy']): EnergyBar | null {
  if (energy === null) return null
  return {
    type: energy.type,
    used: energy.used,
    capacity: energy.capacity,
    ratio: energy.capacity > 0 ? Math.min(1, energy.used / energy.capacity) : 0,
    showBar: energy.capacity > 0,
  }
}

/** 套装区要画成什么样；不该画时返回 `null`。 */
export interface SetPanel {
  name: string
  /** 玩家拥有的不同部位件数。 */
  owned: number
  /** 每一档，以及它是否已经生效（`owned >= count`）。 */
  tiers: { count: number; name: string; description: string; active: boolean }[]
}

/**
 * @param set - 详情里的套装块；不属任何套装时是 `null`。
 * @returns `null` 表示不画套装区。
 *
 * 哪一档生效由 `owned`（按部位去重的拥有件数）判断，这个数由 host 侧统计后随 DTO 下来。
 */
export function setPanel(set: ArmorSetView | null): SetPanel | null {
  if (set === null || set.name === '') return null
  return {
    name: set.name,
    owned: set.owned,
    tiers: set.tiers.map((tier) => ({ ...tier, active: set.owned >= tier.count })),
  }
}

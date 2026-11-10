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
  tiers: { count: number; name: string; description: string }[]
}

/**
 * @param set - 详情里的套装块；不属任何套装时是 `null`。
 * @returns `null` 表示不画套装区。
 *
 * **不判断哪一档已激活**：那需要"玩家一共拥有这个套装的几件"，是跨物品的事实，
 * 单件详情给不出来。这里只把档位与效果原样列出，不替玩家算。
 */
export function setPanel(set: ArmorSetView | null): SetPanel | null {
  if (set === null || set.name === '') return null
  return { name: set.name, tiers: set.tiers }
}

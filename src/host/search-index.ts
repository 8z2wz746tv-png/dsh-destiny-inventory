/**
 * 搜索索引：从 `ProfileItem` 组装可检索文本。
 *
 * **不经过 `item-detail` 的 perk 白名单**。那个白名单决定"详情卡要不要展开这个插槽的
 * 候选"，是展示口径；搜索要的是"这个东西上有没有这个词"，两回事。共用一把门会让
 * 放宽展示去适配搜索，或者反过来。
 *
 * 数据其实一直在：`ProfileItem.sockets[].options` 是组件 310 的可选池，早就解析好了。
 */
import type { DefinitionLookup } from '../bungie/lookup'
import type { ProfileItem } from '../bungie/profile'

/** 一件物品的可检索文本，按字段分开便于高亮。 */
export interface SearchEntry {
  /** 与 `ItemRow.id` 同一个键，用来在界面上定位。 */
  id: string
  /** 名称（中英文里 manifest 给的那个）。 */
  name: string
  /** 类型与框架：自动步枪、线性融合步枪… */
  types: string
  /** 当前装着的 perk、可切换的 perk、以及它们的描述，拼成一段。 */
  perks: string
}

/** 一段文本最多收多少个字符；超过就截断，别让一件护甲把索引撑爆。 */
const PERK_BUDGET = 1200

/**
 * @param items - 全量物品行。
 * @param definitions - manifest 查找。
 * @returns 每件一行；查不到定义的物品跳过（没名字就没得搜）。
 */
export function buildSearchIndex(
  items: ProfileItem[],
  definitions: DefinitionLookup,
): SearchEntry[] {
  const entries: SearchEntry[] = []
  for (const item of items) {
    const definition = definitions.item(item.itemHash)
    if (definition === null) continue
    const parts = new Set<string>()
    for (const socket of item.sockets) {
      // 当前装着的那个一定在 options 里，但有的插槽没池子，所以两边都收。
      for (const hash of [socket.plugHash, ...socket.options]) {
        const plug = definitions.plug(hash)
        if (plug === null) continue
        if (plug.name !== '') parts.add(plug.name)
        if (plug.description !== '') parts.add(plug.description)
      }
    }
    let perks = ''
    for (const part of parts) {
      if (perks.length + part.length > PERK_BUDGET) break
      perks += `${part} `
    }
    entries.push({
      id: item.key,
      name: definition.name,
      types: [definition.itemTypeDisplayName, definition.name].filter((t) => t !== '').join(' '),
      perks: perks.trim(),
    })
  }
  return entries
}

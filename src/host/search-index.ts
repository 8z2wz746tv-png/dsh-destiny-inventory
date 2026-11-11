/**
 * 搜索索引：从 `ProfileItem` 组装可检索文本。
 *
 * **不经过 `item-detail` 的 perk 白名单**。那个白名单决定"详情卡要不要展开这个插槽的
 * 候选"，是展示口径；搜索要的是"这个东西上有没有这个词"，两回事。共用一把门会让
 * 放宽展示去适配搜索，或者反过来。
 *
 * 数据其实一直在：`ProfileItem.sockets[].options` 是组件 310 的可选池，早就解析好了。
 *
 * **描述只存一份**。同一个 perk 会出现在几十件武器上，把描述写进每一件的话，
 * 1924 件会撑到 2.8 MB——比整份 `/details` 还大。所以物品只留 perk **名**，
 * 描述进一张按名字去重的词表。
 */
import type { DefinitionLookup } from '../bungie/lookup'
import type { ProfileItem } from '../bungie/profile'

/** 一件物品的可检索文本。`perks` 只有名字，描述在 `glossary` 里。 */
export interface SearchEntry {
  /** 与 `ItemRow.id` 同一个键，用来在界面上定位。 */
  id: string
  /** 名称。 */
  name: string
  /** 类型：自动步枪、线性融合步枪… */
  types: string
  /** 当前装着的与可切换的 perk 名（去重）。 */
  perks: string[]
}

/** 索引本体。 */
export interface SearchPayload {
  items: SearchEntry[]
  /** perk 名 → 描述。跨物品共享，只存一份。 */
  glossary: Record<string, string>
}

/** 一件物品最多收多少个 perk 名；奇异的插槽再多也不至于几百个。 */
const PERK_LIMIT = 40

/**
 * @param items - 全量物品行。
 * @param definitions - manifest 查找。
 * @returns 物品条目 + 去重后的描述词表。
 */
export function buildSearchIndex(items: ProfileItem[], definitions: DefinitionLookup): SearchPayload {
  const glossary: Record<string, string> = {}
  const entries: SearchEntry[] = []
  for (const item of items) {
    const definition = definitions.item(item.itemHash)
    if (definition === null) continue
    const names = new Set<string>()
    for (const socket of item.sockets) {
      for (const hash of [socket.plugHash, ...socket.options]) {
        const plug = definitions.plug(hash)
        if (plug === null || plug.name === '') continue
        names.add(plug.name)
        // 描述进词表；同一个 perk 只写一次，后面的物品直接复用。
        if (plug.description !== '' && glossary[plug.name] === undefined) {
          glossary[plug.name] = plug.description
        }
      }
    }
    entries.push({
      id: item.key,
      name: definition.name,
      types: definition.itemTypeDisplayName,
      perks: [...names].slice(0, PERK_LIMIT),
    })
  }
  return { items: entries, glossary }
}

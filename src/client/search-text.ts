/**
 * 搜索索引 → 可搜文本。
 *
 * 索引里物品只带 perk **名**，描述在 `glossary` 里共享。这里把两者拼成一件物品的
 * 一整段文本，**一次算好存进 Map**——搜索时每个按键都会问它，不能在查询里现拼。
 */
import type { SearchPayload } from '../host/search-index'

/** 按物品 id 取可搜文本；没有索引的条目回退成空串。 */
export type Haystack = (id: string) => string

/**
 * @param payload - `/search-index` 的响应；`null` 表示索引没拿到。
 * @returns 查文本的函数。索引缺失时返回空串，调用方会退回按名称匹配。
 */
export function haystackOf(payload: SearchPayload | null): Haystack {
  if (payload === null) return () => ''
  const byId = new Map<string, string>()
  for (const item of payload.items) {
    const parts = [item.name, item.types]
    for (const perk of item.perks) {
      parts.push(perk)
      const description = payload.glossary[perk]
      if (description !== undefined) parts.push(description)
    }
    byId.set(item.id, parts.join(' ').toLowerCase())
  }
  return (id) => byId.get(id) ?? ''
}

/**
 * 多关键词 AND。
 * @param haystack - 一整段已小写的文本。
 * @param query - 用户输入，可能含多个空格分隔的词。
 * @returns 全部关键词都出现时才为真；空查询为真。
 */
export function matchesQuery(haystack: string, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter((word) => word !== '')
  if (words.length === 0) return true
  return words.every((word) => haystack.includes(word))
}

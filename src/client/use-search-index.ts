/**
 * 搜索索引的取用。
 *
 * 单独一个 hook，理由和 `use-hover-card` / `use-receipts` 一样：面板贴着行数上限，
 * 而这件事有自己的生命周期（一次拉取、一次 abort、无依赖）。
 *
 * **索引失败不影响库存**。搜不到东西比"整页加载失败"轻得多，所以这里吞掉错误、
 * 退回空 haystack——调用方会退回按名称搜。
 */
import { useEffect, useMemo, useState } from 'react'
import { fetchSearchIndex } from './api'
import { haystackOf } from './search-text'
import type { Haystack } from './search-text'
import type { SearchPayload } from '../host/search-index'

/** 没有索引时的返回值：每件都是空串，`matchesFilters` 会退回按名称匹配。 */
const EMPTY: Haystack = () => ''

/**
 * @param routePath - 桥接路径。
 * @returns 按物品 id 取可搜文本；索引还没到或拉失败时返回空串。
 */
export function useSearchIndex(routePath: string): Haystack {
  const [payload, setPayload] = useState<SearchPayload | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchSearchIndex(routePath, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setPayload(data)
      })
      .catch(() => {
        // 索引是可选资料：没有它，按名称搜仍然可用。
      })
    return () => controller.abort()
  }, [routePath])

  return useMemo(() => (payload === null ? EMPTY : haystackOf(payload)), [payload])
}

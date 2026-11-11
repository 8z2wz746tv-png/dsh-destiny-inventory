/**
 * 搜索的两块：把索引摊成可搜文本、多关键词 AND。
 *
 * 这两块的失败方式都是"搜不到东西"——和"这东西没有"长得一样，所以每条都要
 * 有一个能搜到的正向样本在旁边。
 */
import { describe, expect, it } from 'vitest'
import { haystackOf, matchesQuery } from '../src/client/search-text'
import { matchesFilters, DEFAULT_FILTERS } from '../src/client/filter'
import type { ItemRow } from '../src/host/types'
import type { SearchPayload } from '../src/host/search-index'

const payload: SearchPayload = {
  items: [
    { id: 'w1', name: '弑后者', types: '线性融合步枪', perks: ['快速拔枪', '导线步枪'] },
    { id: 'a1', name: '圣贤保护者臂环', types: '术士臂环', perks: [] },
  ],
  glossary: { 快速拔枪: '装填后短暂提升武器切换速度' },
}

describe('可搜文本', () => {
  it('joins name, type, perk name and the shared description', () => {
    const text = haystackOf(payload)('w1')
    expect(text).toContain('弑后者')
    expect(text).toContain('线性融合步枪')
    expect(text).toContain('快速拔枪')
    // 描述来自 glossary，不在物品条目里。
    expect(text).toContain('装填后短暂提升武器切换速度')
  })

  it('an unknown id yields an empty string', () => {
    expect(haystackOf(payload)('nope')).toBe('')
  })

  it('no payload yields nothing for everything', () => {
    // 索引没拿到时调用方会退回按名称匹配，不能因此让搜索结果全空。
    expect(haystackOf(null)('w1')).toBe('')
  })
})

describe('多关键词 AND', () => {
  it('requires every word', () => {
    const text = haystackOf(payload)('w1')
    expect(matchesQuery(text, '弑后者')).toBe(true)
    expect(matchesQuery(text, '弑后者 快速拔枪')).toBe(true)
    // Injectable violation: OR semantics and this matches almost everything.
    expect(matchesQuery(text, '弑后者 不存在的词')).toBe(false)
  })

  it('an empty query matches everything', () => {
    expect(matchesQuery('', '')).toBe(true)
    expect(matchesQuery('任意', '   ')).toBe(true)
  })

  it('matches a perk description word', () => {
    expect(matchesQuery(haystackOf(payload)('w1'), '切换速度')).toBe(true)
  })
})

describe('接进筛选', () => {
  const row = { id: 'w1', name: '弑后者', type: '', kind: 'weapon', locked: false } as unknown as ItemRow
  const query = (search: string) => ({ ...DEFAULT_FILTERS, search })

  it('searches the index when one is present', () => {
    const hay = haystackOf(payload)
    expect(matchesFilters(row, query('快速拔枪'), hay)).toBe(true)
  })

  it('falls back to the name alone when there is no index', () => {
    // 索引请求失败时，名称搜索必须仍然可用——不能因为索引缺失就让搜索彻底失效。
    expect(matchesFilters(row, query('弑后者'))).toBe(true)
    expect(matchesFilters(row, query('快速拔枪'))).toBe(false)
  })
})

describe('宿主比前端旧的时候', () => {
  it('an array payload degrades to no index instead of throwing', () => {
    // 真机上崩过一次：宿主还在跑旧构建，`/search-index` 返回数组，
    // 而 `payload.items` 是 undefined——`for...of` 抛错，整个面板挂掉。
    // Injectable violation: drop the guard and `useMemo` throws during render.
    const old = [{ id: 'w1', name: '弑后者', types: '', perks: [] }] as unknown as SearchPayload
    expect(() => haystackOf(old)).not.toThrow()
    expect(haystackOf(old)('w1')).toBe('')
  })
})

describe('高亮：命中的 perk 要能看出来', () => {
  it('a perk is marked only when it actually matches the query', () => {
    // 这条钉住的是判定口径，不是渲染：命中靠 `matchesQuery`，与筛选完全同一条规则。
    // Injectable violation: 用 includes 直接比，多关键词 AND 就退化成子串匹配。
    expect(matchesQuery('光速拔枪', '光速拔枪')).toBe(true)
    expect(matchesQuery('光速拔枪', '光速')).toBe(true)
    expect(matchesQuery('快速命中', '光速拔枪')).toBe(false)
  })
})

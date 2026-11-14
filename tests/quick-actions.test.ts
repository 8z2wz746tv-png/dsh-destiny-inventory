/**
 * 快捷任务。
 *
 * 两件事要钉住：**没选中时不给"分析这件"**（那会发一句指向不存在物品的话），
 * 以及按钮文案里带的是**真名字**，不是"当前物品"这种占位。
 */
import { describe, expect, it } from 'vitest'
import { quickActions } from '../src/client/agent/quick-actions'

describe('没选中物品', () => {
  it('offers browsing questions instead of item analysis', () => {
    const actions = quickActions({ character: 'hunter' })
    // Injectable violation: 未选中还给"分析这件"，模型会收到一句指空的话。
    expect(actions.map((a) => a.id)).not.toContain('analyze')
    expect(actions.length).toBeGreaterThan(0)
  })

  it('handles a missing context', () => {
    expect(quickActions(null).length).toBeGreaterThan(0)
  })
})

describe('选中的是武器', () => {
  it('carries the real name and the exact tool intent into the prompt', () => {
    const actions = quickActions({
      selected: { name: '命运终结者', kind: 'weapon', observed: 'vault' },
    })
    const analyze = actions.find((a) => a.id === 'analyze')
    expect(analyze?.label).toBe('分析武器')
    expect(analyze?.prompt).toContain('命运终结者')
    expect(analyze?.prompt).toContain('weapon_assistant')
    expect(analyze?.prompt).toContain('intent="analyze"')
    expect(analyze?.prompt).toContain('include_inventory=true')
    // 回退条件覆盖“任何无法完整解析”，不是只认某个截断字符串。
    expect(analyze?.prompt).toContain('无法完整解析')
    expect(analyze?.prompt).toContain('filter_rolls')
  })

  it('offers only the analysis entry in this version', () => {
    const actions = quickActions({ selected: { name: '命运终结者', kind: 'weapon' } })
    expect(actions.map((a) => a.id)).toEqual(['analyze'])
  })
})

describe('选中的不是武器', () => {
  it('does not offer a weapon analysis entry', () => {
    const actions = quickActions({
      selected: { name: '圣贤保护者臂环', kind: 'armor', observed: 'vault' },
    })
    expect(actions.map((a) => a.id)).not.toContain('analyze')
    // 平替/配装入口本轮也不出现。
    expect(actions.map((a) => a.id)).not.toContain('swap')
    expect(actions.map((a) => a.id)).not.toContain('build')
  })

  it('still offers browsing questions', () => {
    expect(quickActions({ selected: { name: 'X', kind: 'armor' } }).length).toBeGreaterThan(0)
  })
})

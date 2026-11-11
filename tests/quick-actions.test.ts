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

describe('选中了物品', () => {
  it('carries the real name into the prompt', () => {
    const actions = quickActions({ selected: { name: '圣贤保护者臂环', observed: 'vault' } })
    const analyze = actions.find((a) => a.id === 'analyze')
    expect(analyze?.prompt).toContain('圣贤保护者臂环')
  })

  it('offers analysis first', () => {
    const actions = quickActions({ selected: { name: '大帝馈赠' } })
    expect(actions[0].id).toBe('analyze')
  })

  it('does not exceed four buttons', () => {
    expect(quickActions({ selected: { name: 'X' } }).length).toBeLessThanOrEqual(4)
  })
})

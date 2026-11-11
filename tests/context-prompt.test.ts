/**
 * 上下文 → prompt。
 *
 * 这里钉的是"说什么、不说什么"：只报面板上报过的事实，没有的字段一个字都不加。
 * 说错一句话，模型就会对着不存在的装备分析半天。
 */
import { describe, expect, it } from 'vitest'
import { contextPrompt, withContext } from '../src/client/agent/context-prompt'

describe('上下文说明', () => {
  it('names the focused class and the selected item with its place', () => {
    const text = contextPrompt({
      character: 'hunter',
      selected: { name: '圣贤保护者臂环', observed: 'vault' },
    })
    expect(text).toContain('焦点：猎人')
    expect(text).toContain('「圣贤保护者臂环」')
    expect(text).toContain('（在仓库）')
  })

  it('says so when an operation is still unverified', () => {
    const text = contextPrompt({
      character: 'warlock',
      selected: { name: '大帝馈赠', observed: 'hunter', pending: { target: 'vault' } },
    })
    // 协议要求：未核验的操作必须说出来，不能只报观测位置。
    expect(text).toContain('未核验的操作正发往仓库')
  })

  it('flags a rolled-back position as unconfirmed', () => {
    const text = contextPrompt({
      selected: { name: 'X', observed: 'vault', rollback: { location: 'hunter' } },
    })
    expect(text).toContain('回滚后的位置，未确认')
  })

  it('emits nothing when the panel has not reported anything', () => {
    // Injectable violation: 空上下文也拼一段，模型就会收到一句"焦点："然后开始瞎猜。
    expect(contextPrompt(null)).toBe('')
    expect(contextPrompt({})).toBe('')
  })

  it('omits a filter that is empty', () => {
    expect(contextPrompt({ character: 'hunter', filters: { search: '' } })).not.toContain('搜索框')
  })
})

describe('拼进消息', () => {
  it('puts the context above the question', () => {
    const text = withContext({ character: 'hunter', selected: { name: '甲', observed: 'vault' } }, '这件怎么样')
    expect(text.indexOf('面板上下文')).toBeLessThan(text.indexOf('这件怎么样'))
    expect(text).toContain('这件怎么样')
  })

  it('leaves a bare question alone when there is no context', () => {
    expect(withContext(null, '你好')).toBe('你好')
  })
})

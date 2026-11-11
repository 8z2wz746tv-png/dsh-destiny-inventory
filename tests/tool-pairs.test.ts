/**
 * 工具配对。
 *
 * 探针实证的关联字段：`tool/call.data.callId` === `tool/result.data.message.toolCallId`。
 * 这里全部按真实形状喂数据，不用简写。
 */
import { describe, expect, it } from 'vitest'
import { pairTools, toolStatus } from '../src/client/agent/tool-pairs'

const call = (callId: string, name = 'bash', args = '{"a":1}') => ({
  kind: 'tool',
  raw: { type: 'tool/call', seq: 1, data: { turn: 1, step: 1, callId, name, arguments: args } },
})

const result = (callId: string, text = 'ok', isError = false) => ({
  kind: 'tool',
  raw: {
    type: 'tool/result',
    seq: 2,
    data: {
      turn: 1,
      step: 1,
      message: {
        role: 'tool',
        toolCallId: callId,
        source: { kind: 'tool', callId },
        content: [{ type: 'text', text }],
        isError,
      },
      sourceEventSeqs: [1],
    },
  },
})

describe('按 callId 配对', () => {
  it('pairs a call with its result', () => {
    const m = pairTools([call('c1'), result('c1', '完成了')])
    expect(m.get('c1')).toMatchObject({ name: 'bash', result: '完成了', failed: false })
    expect(toolStatus(m.get('c1')!)).toBe('done')
  })

  it('marks an error result as failed', () => {
    const m = pairTools([call('c1'), result('c1', '炸了', true)])
    expect(toolStatus(m.get('c1')!)).toBe('failed')
  })

  it('stays pending until the result arrives', () => {
    const m = pairTools([call('c1')])
    expect(m.get('c1')?.result).toBeNull()
    expect(toolStatus(m.get('c1')!)).toBe('pending')
  })

  it('pairs a result that arrives before its call', () => {
    // 不假设顺序：结果先到也要能配，而且不能丢。
    const m = pairTools([result('c1', '先到的结果'), call('c1')])
    // Injectable violation: 顺序配对会让这条结果整条消失。
    expect(m.get('c1')).toMatchObject({ name: 'bash', result: '先到的结果' })
  })

  it('keeps a result whose call never showed up', () => {
    const m = pairTools([result('orphan', '没有对应调用')])
    expect(m.get('orphan')).toMatchObject({ name: '', result: '没有对应调用' })
  })

  it('does not confuse two concurrent calls', () => {
    const m = pairTools([call('a', 'first'), call('b', 'second'), result('b', 'B'), result('a', 'A')])
    expect(m.get('a')).toMatchObject({ name: 'first', result: 'A' })
    expect(m.get('b')).toMatchObject({ name: 'second', result: 'B' })
  })

  it('ignores non-tool rows', () => {
    const m = pairTools([{ kind: 'assistant', raw: { type: 'assistant/message' } }])
    expect(m.size).toBe(0)
  })
})

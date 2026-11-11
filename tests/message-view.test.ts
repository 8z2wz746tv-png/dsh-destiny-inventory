/**
 * 行 → 气泡。
 *
 * 这里只验证"Controller 的输出被正确摊开"，不验证会话状态——那是 A4 的事。
 */
import { describe, expect, it } from 'vitest'
import { bubblesOf } from '../src/client/agent/message-view'
import type { ConversationState } from '../src/client/agent/conversation'

const state = (lines: unknown[], streaming: ConversationState['streaming'] = null): ConversationState =>
  ({ lines, streaming, hasMore: false, loadingOlder: false, error: null }) as ConversationState

const textMsg = (seq: number, type: string, text: string) => ({
  key: `e${seq}`,
  kind: type.split('/')[0],
  raw: { type, seq, data: { content: [{ type: 'text', text }] } },
})

describe('气泡', () => {
  it('separates user and assistant', () => {
    const b = bubblesOf(state([textMsg(1, 'user/message', '你好'), textMsg(2, 'assistant/message', '在')]))
    expect(b.map((x) => [x.role, x.text])).toEqual([
      ['user', '你好'],
      ['assistant', '在'],
    ])
  })

  it('collapses a tool call and its result into one bubble', () => {
    const lines = [
      { key: 'e1', kind: 'tool', raw: { type: 'tool/call', seq: 1, data: { callId: 'c1', name: 'bash', arguments: '{}' } } },
      {
        key: 'e2',
        kind: 'tool',
        raw: { type: 'tool/result', seq: 2, data: { message: { toolCallId: 'c1', content: [{ type: 'text', text: 'done' }], isError: false } } },
      },
    ]
    const b = bubblesOf(state(lines))
    // 一次调用只出一条气泡；结果不另起一条。
    expect(b).toHaveLength(1)
    expect(b[0].tool).toMatchObject({ callId: 'c1', name: 'bash', result: 'done', status: 'done' })
  })

  it('shows a pending tool while its result is still missing', () => {
    const lines = [{ key: 'e1', kind: 'tool', raw: { type: 'tool/call', seq: 1, data: { callId: 'c1', name: 'bash', arguments: '{}' } } }]
    expect(bubblesOf(state(lines))[0].tool?.status).toBe('pending')
  })

  it('keeps a result whose call never arrived', () => {
    const lines = [
      {
        key: 'e1',
        kind: 'tool',
        raw: { type: 'tool/result', seq: 1, data: { message: { toolCallId: 'ghost', content: [{ type: 'text', text: '回来了' }], isError: true } } },
      },
    ]
    const b = bubblesOf(state(lines))
    expect(b).toHaveLength(1)
    expect(b[0].tool).toMatchObject({ callId: 'ghost', result: '回来了', status: 'failed' })
  })

  it('does not render the streaming text as a bubble', () => {
    // 流式那条由界面单独画，不进 lines；否则会和定型消息重复。
    const b = bubblesOf(state([textMsg(1, 'assistant/message', '完')], { attemptId: 'a1', text: '正在写' }))
    expect(b.map((x) => x.text)).toEqual(['完'])
  })
})

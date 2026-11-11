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

// 探针实证：assistant/message 的正文在 data.message.content。
const textMsg = (seq: number, type: string, text: string) => ({
  key: `e${seq}`,
  kind: type.split('/')[0],
  raw: {
    type,
    seq,
    // user/message 的正文在 data.content；assistant 在 data.message.content。
    // 探针实证：玩家的 user 消息带 source.kind === 'user'。
    data:
      type === 'user/message'
        ? { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] }
        : { message: { role: 'assistant', content: [{ type: 'text', text }] } },
  },
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

describe('消息正文的层级与块类型', () => {
  it('reads content from data.message, not data', () => {
    // 探针原样：data 里只有 turn/step/usage/stream，正文字段在 message 下。
    const line = {
      key: 'e20',
      kind: 'assistant',
      raw: {
        type: 'assistant/message',
        data: {
          turn: 1,
          step: 1,
          message: { role: 'assistant', content: [{ type: 'text', text: '你好。' }] },
          usage: { totalTokens: 1 },
        },
      },
    }
    // Injectable violation: 读 data.content 会拿到 undefined，气泡变空。
    expect(bubblesOf(state([line]))[0].text).toBe('你好。')
  })

  it('drops reasoning blocks', () => {
    // 同一份样本里 reasoning 排在 text 前面，且是空字符串。
    const line = {
      key: 'e20',
      kind: 'assistant',
      raw: {
        type: 'assistant/message',
        data: {
          message: {
            content: [
              { type: 'reasoning', text: '' },
              { type: 'text', text: '你好。' },
            ],
          },
        },
      },
    }
    // Injectable violation: 全拼会把模型思考也画进气泡。
    expect(bubblesOf(state([line]))[0].text).toBe('你好。')
  })

  it('ignores an unknown block type rather than showing it', () => {
    const line = {
      key: 'e21',
      kind: 'assistant',
      raw: {
        type: 'assistant/message',
        data: { message: { content: [{ type: 'tool-reference', text: '不该显示' }, { type: 'text', text: '真的' }] } },
      },
    }
    expect(bubblesOf(state([line]))[0].text).toBe('真的')
  })
})

describe('注入的 user 消息', () => {
  const injected = (seq: number, kind: string, text: string) => ({
    key: `e${seq}`,
    kind: 'user',
    raw: { type: 'user/message', seq, data: { role: 'user', source: { kind }, content: [{ type: 'text', text }] } },
  })

  it('drops context that arrives as a user message', () => {
    // 探针原样：这几条都是 role:'user'，靠 source.kind 区分。
    const lines = [
      textMsg(8, 'user/message', '测试一下'),
      injected(9, 'agent-instructions', '<system-reminder> The following instructions are ACTIVE…'),
      injected(10, 'runtime-context', 'Current runtime context. This snapshot supersedes…'),
      textMsg(20, 'assistant/message', '在的。'),
    ]
    // Injectable violation: 不筛就把三行注入当玩家发言画出来。
    expect(bubblesOf(state(lines)).map((b) => b.text)).toEqual(['测试一下', '在的。'])
  })

  it('treats an unknown source kind as injected', () => {
    const lines = [injected(1, 'some-new-context-form', '未来某种注入')]
    // 认不出来的一律当注入：少一条好过多一条假的。
    expect(bubblesOf(state(lines))).toHaveLength(0)
  })

  it('does not touch assistant or tool rows', () => {
    const lines = [
      { key: 'e1', kind: 'tool', raw: { type: 'tool/call', seq: 1, data: { callId: 'c1', name: 'bash', arguments: '{}' } } },
      textMsg(2, 'assistant/message', '好的'),
    ]
    expect(bubblesOf(state(lines)).map((b) => b.role)).toEqual(['tool', 'assistant'])
  })
})

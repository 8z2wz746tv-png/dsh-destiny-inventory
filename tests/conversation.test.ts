/**
 * 对话状态机。
 *
 * 六类事件、四个易漏时序，各自一条。失败方式都很像"看起来正常"：消息重复、
 * 工具结果混进正文、取消之后又冒出一段。所以每条都配一个注入。
 */
import { describe, expect, it } from 'vitest'
import { Conversation, chunkText } from '../src/client/agent/conversation'

const event = (seq: number, type = 'assistant/message') => ({ type: 'event', event: { type, seq } })
const tool = (seq: number) => ({ type: 'event', event: { type: 'tool/call', seq } })
const user = (seq: number) => ({ type: 'event', event: { type: 'user/message', seq } })
// 真实形状（探针实证）：chunk 是 type 驱动的；文本块用 text-delta。
const chunk = (attemptId: string, text: string) => ({
  type: 'transient',
  data: { attemptId, chunk: { type: 'text-delta', index: 1, text } },
})
const replace = (entries: unknown[], hasMore = false) =>
  ({ entries, hasMore, revision: 1, change: { kind: 'replace', entries } }) as never
const append = (entries: unknown[], hasMore = false) =>
  ({ entries, hasMore, revision: 2, change: { kind: 'append', entries } }) as never
const prepend = (entries: unknown[], hasMore = false) =>
  ({ entries, hasMore, revision: 3, change: { kind: 'prepend', entries } }) as never
const settle = (attemptId: string, entry?: unknown) =>
  ({ entries: [], hasMore: false, revision: 4, change: { kind: 'settle-assistant', attemptId, entry } }) as never

describe('历史初始化', () => {
  it('replaces the whole history rather than appending', () => {
    const c = new Conversation()
    c.accept(replace([user(1), event(2)]))
    c.accept(replace([user(3)]))
    // Injectable violation: append on replace and every refresh doubles the transcript.
    expect(c.snapshot().lines.map((l) => l.key)).toEqual(['e3'])
  })

  it('keeps a live chunk that arrived with the initial batch', () => {
    // 初始化那一批里已经带了实时块：全量替换不能把它冲掉。
    const c = new Conversation()
    c.accept(replace([event(1), chunk('a1', '你')]))
    expect(c.snapshot().streaming).toEqual({ attemptId: 'a1', text: '你' })
  })
})

describe('流式', () => {
  it('appends every chunk to the same attempt', () => {
    const c = new Conversation()
    c.accept(append([chunk('a1', '正在'), chunk('a1', '查询')]))
    // Injectable violation: create a message per chunk and the text splits apart.
    expect(c.snapshot().streaming).toEqual({ attemptId: 'a1', text: '正在查询' })
    expect(c.snapshot().lines).toHaveLength(0)
  })

  it('starts a new line for the next turn', () => {
    const c = new Conversation()
    c.accept(append([chunk('a1', '第一轮')]))
    c.accept(settle('a1', event(2)))
    c.accept(append([chunk('a2', '第二轮')]))
    // 两轮连续生成：新的 attempt 必须开新的，不能接着上一轮写。
    expect(c.snapshot().streaming).toEqual({ attemptId: 'a2', text: '第二轮' })
  })

  it('settles with no entry and adds no row', () => {
    // 探针原样：真实的 settle 只有 attemptId，没有 entry。
    // 正式消息是随后独立到达的 assistant/message。
    const c = new Conversation()
    c.accept(append([chunk('a1', '内容')]))
    c.accept(settle('a1'))
    // Injectable violation: 假设 settle 一定带 entry，就会在真实运行时少一条消息。
    expect(c.snapshot().lines).toHaveLength(0)
    expect(c.snapshot().streaming).toBeNull()
  })

  it('the real order works: chunk, settle, then the message arrives', () => {
    const c = new Conversation()
    c.accept(append([chunk('a1', '内容')]))
    c.accept(settle('a1'))
    c.accept(append([event(9)]))
    expect(c.snapshot().lines.map((l) => l.key)).toEqual(['e9'])
    expect(c.snapshot().streaming).toBeNull()
  })

  it('settles without duplicating the message', () => {
    const c = new Conversation()
    c.accept(append([chunk('a1', '内容')]))
    c.accept(settle('a1', event(2)))
    expect(c.snapshot().streaming).toBeNull()
    expect(c.snapshot().lines).toHaveLength(1)
  })
})

describe('工具调用', () => {
  it('keeps tool rows separate from assistant rows', () => {
    const c = new Conversation()
    c.accept(replace([event(1, 'assistant/message'), tool(2), user(3), event(4, 'assistant/message')]))
    expect(c.snapshot().lines.map((l) => l.kind)).toEqual(['assistant', 'tool', 'user', 'assistant'])
    // 顺序与身份都要保住：工具结果不能并进正文。
    expect(c.snapshot().lines.map((l) => l.key)).toEqual(['e1', 'e2', 'e3', 'e4'])
  })
})

describe('取消与迟到事件', () => {
  it('keeps what already arrived', () => {
    const c = new Conversation()
    c.accept(append([chunk('a1', '查到三件')]))
    c.stop('已取消')
    expect(c.snapshot().error).toBe('已取消')
    expect(c.snapshot().lines).toHaveLength(1)
    // Injectable violation: drop the partial line and the user sees nothing happened.
    expect(c.snapshot().streaming).toBeNull()
  })

  it('ignores a chunk that arrives after the cancel', () => {
    const c = new Conversation()
    c.accept(append([chunk('a1', '前半')]))
    c.stop('已取消')
    c.accept(append([chunk('a1', '后半')]))
    // 取消之后还在路上的 chunk 不能把状态重新激活。
    expect(c.snapshot().streaming).toBeNull()
    expect(c.snapshot().lines).toHaveLength(1)
  })

  it('ignores a chunk that arrives after the settle', () => {
    const c = new Conversation()
    c.accept(append([chunk('a1', '前半')]))
    c.accept(settle('a1', event(2)))
    c.accept(append([chunk('a1', '迟到')]))
    expect(c.snapshot().streaming).toBeNull()
  })
})

describe('分页', () => {
  it('prepends older lines without touching the tail or the stream', () => {
    const c = new Conversation()
    c.accept(replace([event(5)]))
    c.accept(append([chunk('a1', '正在写')]))
    c.accept(prepend([event(1), event(2)]))
    expect(c.snapshot().lines.map((l) => l.key)).toEqual(['e1', 'e2', 'e5'])
    // 向上翻页不该打断正在生成的那一条。
    expect(c.snapshot().streaming).toEqual({ attemptId: 'a1', text: '正在写' })
  })

  it('reports hasMore and clears the loading flag', () => {
    const c = new Conversation()
    c.accept(replace([event(1)], true))
    expect(c.snapshot().hasMore).toBe(true)
    c.setLoadingOlder(true)
    expect(c.snapshot().loadingOlder).toBe(true)
    c.accept(prepend([event(2)], false))
    expect(c.snapshot().loadingOlder).toBe(false)
    expect(c.snapshot().hasMore).toBe(false)
  })
})

describe('chunk 文本提取', () => {
  it('reads the shape the source confirms', () => {
    // dsh-llm 等五处一致：{ type: 'text-delta', index, text }。
    expect(chunkText({ type: 'text-delta', index: 1, text: '你好' })).toBe('你好')
  })

  it('does not take reasoning deltas for content', () => {
    // 同族但不同 type：那是模型的思考，不进气泡。
    expect(chunkText({ type: 'reasoning-delta', index: 0, text: '思考' })).toBe('')
  })

  it('ignores the tool chunks the probe actually captured', () => {
    // 探针原样：这两条是工具参数，不是正文。
    // Injectable violation: 按字段名硬找文本就会把 argumentsDelta 当正文塞进消息。
    expect(chunkText({ type: 'block-start', index: 0, blockType: 'tool-call' })).toBe('')
    expect(
      chunkText({ type: 'tool-call-delta', index: 0, id: 'call_x', name: 'bash', argumentsDelta: '{"' }),
    ).toBe('')
  })

  it('never throws on an unknown shape', () => {
    expect(chunkText({ weird: 1 })).toBe('')
    expect(chunkText(null)).toBe('')
  })
})

describe('状态类事件不是消息', () => {
  it('drops the bookkeeping events the real window carries', () => {
    // 探针实测：初始窗口第一条就是 permission/preset，后面跟着 turn/start、
    // request/header 等十几种。它们必须被挡在对话之外。
    const c = new Conversation()
    c.accept(
      replace([
        { type: 'event', event: { type: 'permission/preset', seq: 0 } },
        { type: 'event', event: { type: 'sandbox/mode', seq: 1 } },
        { type: 'event', event: { type: 'turn/start', seq: 2 } },
        { type: 'event', event: { type: 'request/header', seq: 3 } },
        { type: 'event', event: { type: 'session/title', seq: 4 } },
        { type: 'event', event: { type: 'system/message', seq: 5 } },
        user(6),
      ]),
    )
    // Injectable violation: drop the whitelist and the panel opens with five phantom rows.
    // system/message 也不进：真机上它是注入的系统提示词。
    expect(c.snapshot().lines.map((l) => l.key)).toEqual(['e6'])
  })

  it('keeps tool call and result as two separate rows', () => {
    const c = new Conversation()
    c.accept(
      replace([
        { type: 'event', event: { type: 'tool/call', seq: 7 } },
        { type: 'event', event: { type: 'tool/result', seq: 8 } },
      ]),
    )
    expect(c.snapshot().lines.map((l) => l.kind)).toEqual(['tool', 'tool'])
    expect(c.snapshot().lines.map((l) => l.key)).toEqual(['e7', 'e8'])
  })
})

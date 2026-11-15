/**
 * 调用时上下文绑定。
 *
 * 关键时序：A 选中的时候工具调用已经 pending；用户在结果返回前切到 B。
 * 绑定必须仍是 A；如果第一次看到调用就已经 done，则没有可靠的调用时上下文，不能绑。
 *
 * 绑定函数是纯的：只在 committed layout effect 里用返回值替换 state，不在 render 里写 ref。
 */
import { describe, expect, it } from 'vitest'
import type { Bubble } from '../src/client/agent/message-view'
import type { ViewContextLike } from '../src/client/agent/context-prompt'
import type { ToolContextSnapshot } from '../src/client/agent/tool-context'
import {
  bindNewToolContexts,
  contextKey,
  snapshotContext,
} from '../src/client/agent/tool-context'

const NOW = Date.now()
const view = (instanceId: string, hash: number, name: string): ViewContextLike => ({
  selected: { instanceId, hash, name, kind: 'weapon', observedAt: NOW },
})

const bubble = (
  key: string,
  status: 'pending' | 'done',
  args = '{"weapon_type":"手炮","include_inventory":true}',
): Bubble => ({
  key,
  role: 'tool',
  text: '',
  tool: {
    callId: `call-${key}`,
    name: 'mcp__destiny__weapon_assistant',
    args,
    result: status === 'done' ? '{}' : null,
    status,
  },
})

const bind = (
  bubbles: readonly Bubble[],
  context: ViewContextLike | null,
  bound: ReadonlyMap<string, ToolContextSnapshot>,
  scope = 'session-1',
): ReadonlyMap<string, ToolContextSnapshot> =>
  bindNewToolContexts(bubbles, context, bound, scope)

describe('bindNewToolContexts', () => {
  it('keeps the context captured when the call was pending after switching to B', () => {
    let bound: ReadonlyMap<string, ToolContextSnapshot> = new Map()
    bound = bind([bubble('t1', 'pending')], view('A', 100, '武器A'), bound)
    expect(bound.get(contextKey('session-1', 't1'))).toMatchObject({
      instanceId: 'A',
      hash: 100,
      name: '武器A',
    })

    // 查询结果返回时用户已经切到 B；同一 key 不能被改写。
    bound = bind([bubble('t1', 'done')], view('B', 200, '武器B'), bound)
    expect(bound.get(contextKey('session-1', 't1'))).toMatchObject({
      instanceId: 'A',
      hash: 100,
      name: '武器A',
    })
  })

  it('does not mutate the input map', () => {
    const input = new Map<string, ToolContextSnapshot>()
    const output = bind([bubble('t1', 'pending')], view('A', 100, '武器A'), input)
    expect(input.size).toBe(0)
    expect(output.get(contextKey('session-1', 't1'))?.hash).toBe(100)
  })

  it('returns the same map when there is nothing new to bind', () => {
    const input = new Map<string, ToolContextSnapshot>()
    expect(bind([], view('A', 100, '武器A'), input)).toBe(input)
    expect(bind([bubble('t1', 'done')], view('A', 100, '武器A'), input)).toBe(input)
  })

  it('never rebinds a key that was already bound', () => {
    let bound: ReadonlyMap<string, ToolContextSnapshot> = new Map()
    bound = bind([bubble('t1', 'pending')], view('A', 100, '武器A'), bound)
    // 同一 call 的气泡再次以 pending 出现（重复渲染/事件回放）也不改绑。
    bound = bind([bubble('t1', 'pending')], view('B', 200, '武器B'), bound)
    expect(bound.get(contextKey('session-1', 't1'))).toMatchObject({ hash: 100, name: '武器A' })
  })

  it('keeps the same bubble key separate across sessions', () => {
    let bound: ReadonlyMap<string, ToolContextSnapshot> = new Map()
    bound = bind([bubble('t1', 'pending')], view('A', 100, '武器A'), bound, 'session-A')
    bound = bind([bubble('t1', 'pending')], view('B', 200, '武器B'), bound, 'session-B')
    expect(bound.get(contextKey('session-A', 't1'))?.hash).toBe(100)
    expect(bound.get(contextKey('session-B', 't1'))?.hash).toBe(200)
  })

  it('binds a different pending call to the then-current context', () => {
    let bound: ReadonlyMap<string, ToolContextSnapshot> = new Map()
    bound = bind([bubble('t1', 'pending')], view('A', 100, '武器A'), bound)
    bound = bind([bubble('t2', 'pending')], view('B', 200, '武器B'), bound)
    expect(bound.get(contextKey('session-1', 't1'))?.hash).toBe(100)
    expect(bound.get(contextKey('session-1', 't2'))?.hash).toBe(200)
  })

  it('does not bind a call first seen as done', () => {
    const output = bind([bubble('t1', 'done')], view('A', 100, '武器A'), new Map())
    expect(output.has(contextKey('session-1', 't1'))).toBe(false)
  })

  it('ignores named queries and non-tool bubbles', () => {
    const output = bind(
      [bubble('t1', 'pending', '{"weapon_name":"武器A"}')],
      view('A', 100, '武器A'),
      new Map(),
    )
    expect(output.size).toBe(0)
  })
})

describe('snapshotContext', () => {
  it('keeps identity fields and marks a missing snapshot as stale', () => {
    expect(snapshotContext(view('A', 100, '武器A'))).toMatchObject({
      instanceId: 'A',
      hash: 100,
      name: '武器A',
      kind: 'weapon',
      observedAt: NOW,
      stale: false,
    })
    expect(snapshotContext(null)).toEqual({ stale: true })
  })
})

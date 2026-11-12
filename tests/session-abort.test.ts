/**
 * `attach()` 中途被 abort 时会怎样。
 *
 * 这是上一轮审查里我标"未证实"的那条：cleanup 调 `detach()` 时如果 `live` 还是 null，
 * 它什么也不做；而 `open()` 仍停在 `await ready`，之后可能继续给 `live` 赋值。
 * 那个赋值会留下一个没人再 detach 的 LiveSession，`release` 也不会发生。
 *
 * 用可控 Promise 直接造这个时序，比真机反复操作可靠。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const binding = (overrides: Record<string, unknown> = {}) => ({
  sessionId: 's1',
  session: { async prompt() { return { ok: true } } },
  eventSource: {
    getSnapshot: () => ({ entries: [], hasMore: false, revision: 1, change: { kind: 'replace', entries: [] } }),
    subscribe: () => () => {},
  },
  ...overrides,
})

beforeEach(() => {
  vi.resetModules()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  }
})

describe('attach 中途 abort', () => {
  it('releases the reference and never publishes a live session', async () => {
    const { SessionAdapter } = await import('../src/client/agent/session-adapter')
    let resolveReady: (value: unknown) => void = () => {}
    const ready = new Promise((resolve) => { resolveReady = resolve })
    let released = 0
    let retained = 0

    const adapter = new SessionAdapter(
      {
        async create() { return 's1' },
        retain: () => {
          retained += 1
          return { sessionId: 's1', binding: binding() as never, ready, release: () => { released += 1 } }
        },
        retainInfo: () => ({ getSnapshot: () => ({ referenceCount: 0 }) }),
      } as never,
    )

    const controller = new AbortController()
    const attaching = adapter.attach(controller.signal)
    // 等 ensure() 走完、retain 已经发生，此时 open() 正停在 await ready——
    // 这才是要验的时序：引用已经拿着了，ready 还没回。
    await vi.waitFor(() => expect(retained).toBe(1))
    controller.abort()
    adapter.detach()
    resolveReady(binding())
    await expect(attaching).rejects.toThrow()

    // 引用必须还回去，否则每切一次面板泄漏一条。
    expect(released).toBe(1)
    // **被取消不是会话失效**：id 必须留着，否则切一次面板就换一个新会话。
    expect(adapter.sessionId).toBe('s1')
  })

  it('attaches normally when nothing aborts', async () => {
    const { SessionAdapter } = await import('../src/client/agent/session-adapter')
    let released = 0
    const adapter = new SessionAdapter(
      {
        async create() { return 's2' },
        retain: () => ({ sessionId: 's2', binding: binding() as never, ready: Promise.resolve(binding()), release: () => { released += 1 } }),
        retainInfo: () => ({ getSnapshot: () => ({ referenceCount: 1 }) }),
      } as never,
    )
    const live = await adapter.attach()
    expect(live.sessionId).toBe('s2')
    adapter.detach()
    // detach 之后引用也该还。
    expect(released).toBe(1)
  })
})

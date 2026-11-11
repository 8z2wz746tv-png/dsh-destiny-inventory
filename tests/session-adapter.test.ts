/**
 * Session Adapter 的生命周期。
 *
 * 这里每一条失败方式都是**看不见的泄漏**：引用没还、订阅没退、两次 attach 叠出
 * 两份监听。它们不会报错，只会让计数慢慢涨——所以全部用假对象把计数钉死。
 */
import { describe, expect, it } from 'vitest'
import { SessionAdapter } from '../src/client/agent/session-adapter'
import type { SessionDeps } from '../src/client/agent/session-adapter'

/** 一个会记账的假会话服务。 */
function fakeDeps(options: { readyHangs?: boolean } = {}) {
  const state = {
    created: 0,
    retained: 0,
    released: 0,
    subscribes: 0,
    unsubscribes: 0,
    prompts: [] as string[],
  }
  let releaseReady: (() => void) | null = null
  const window = {
    entries: [] as unknown[],
    hasMore: false,
    revision: 0,
    change: { kind: 'replace' as const, entries: [] as unknown[] },
  }

  const deps: SessionDeps = {
    async create() {
      state.created += 1
      return 'session-1'
    },
    retain() {
      state.retained += 1
      const ready = new Promise<never>((resolve) => {
        releaseReady = () => resolve(sink as never)
      })
      const sink = {
        sessionId: 'session-1',
        session: {
          async prompt(content: { type: 'text'; text: string }[]) {
            state.prompts.push(content[0].text)
            return { ok: true }
          },
        },
        eventSource: {
          getSnapshot: () => window,
          subscribe: () => {
            state.subscribes += 1
            return () => {
              state.unsubscribes += 1
            }
          },
        },
      }
      return {
        sessionId: 'session-1',
        binding: sink,
        ready: options.readyHangs === true ? ready : Promise.resolve(sink),
        release: () => {
          state.released += 1
        },
      }
    },
    retainInfo: () => ({ getSnapshot: () => ({ referenceCount: state.retained - state.released }) }),
  }
  return { deps, state, settleReady: () => releaseReady?.() }
}

describe('创建与复用', () => {
  it('creates once and reuses the id', async () => {
    const { deps, state } = fakeDeps()
    const adapter = new SessionAdapter(deps)
    expect(await adapter.ensure()).toBe('session-1')
    expect(await adapter.ensure()).toBe('session-1')
    // Injectable violation: drop the `if (this.id !== null) return` short-circuit
    // and every ensure() creates another session.
    expect(state.created).toBe(1)
  })

  it('collapses concurrent creations', async () => {
    const { deps, state } = fakeDeps()
    const adapter = new SessionAdapter(deps)
    await Promise.all([adapter.ensure(), adapter.ensure(), adapter.ensure()])
    expect(state.created).toBe(1)
  })
})

describe('引用', () => {
  it('waits for ready before handing out a handle', async () => {
    const { deps, state, settleReady } = fakeDeps({ readyHangs: true })
    const adapter = new SessionAdapter(deps)
    let settled = false
    const attaching = adapter.attach().then((handle) => {
      settled = true
      return handle
    })
    await new Promise((r) => setTimeout(r, 10))
    // ready 没 settle 之前不许交出 binding——那时还没有历史。
    expect(settled).toBe(false)
    settleReady()
    const handle = await attaching
    expect(handle.sessionId).toBe('session-1')
    expect(state.retained).toBe(1)
  })

  it('returns the same handle when attached twice', async () => {
    const { deps, state } = fakeDeps()
    const adapter = new SessionAdapter(deps)
    const [a, b] = await Promise.all([adapter.attach(), adapter.attach()])
    expect(a).toBe(b)
    // Injectable violation: allow a second retain and the count climbs on every render.
    expect(state.retained).toBe(1)
  })

  it('releases on detach but keeps the session id', async () => {
    const { deps, state } = fakeDeps()
    const adapter = new SessionAdapter(deps)
    await adapter.attach()
    adapter.detach()
    expect(state.released).toBe(1)
    expect(adapter.sessionId).toBe('session-1')
  })

  it('releasing the reference is not destroying the session', async () => {
    const { deps, state } = fakeDeps()
    const adapter = new SessionAdapter(deps)
    await adapter.attach()
    adapter.detach()
    await adapter.attach()
    // 会话被复用，不是又建了一个。
    expect(state.created).toBe(1)
    expect(state.retained).toBe(2)
    expect(state.released).toBe(1)
  })
})

describe('三次开关', () => {
  it('leaves the reference count where it started', async () => {
    const { deps, state } = fakeDeps()
    const adapter = new SessionAdapter(deps)
    const before = adapter.referenceCount()
    for (let i = 0; i < 3; i += 1) {
      const handle = await adapter.attach()
      handle.subscribe(() => undefined)
      adapter.detach()
    }
    // 断言的是**这一开一关不留差额**，不是全局归零——别处可能也在用同一个会话。
    expect(adapter.referenceCount()).toBe(before)
    expect(state.retained - state.released).toBe(0)
  })

  it('pairs every subscribe with exactly one unsubscribe', async () => {
    const { deps, state } = fakeDeps()
    const adapter = new SessionAdapter(deps)
    for (let i = 0; i < 3; i += 1) {
      const handle = await adapter.attach()
      handle.subscribe(() => undefined)
      adapter.detach()
    }
    // Injectable violation: skip `unsubscribe` in detach and listeners accumulate
    // across every open/close cycle.
    expect(state.subscribes).toBe(3)
    expect(state.unsubscribes).toBe(3)
  })
})

describe('发送', () => {
  it('sends trimmed text', async () => {
    const { deps, state } = fakeDeps()
    const adapter = new SessionAdapter(deps)
    const handle = await adapter.attach()
    await handle.send('  分析这件护甲  ')
    expect(state.prompts).toEqual(['分析这件护甲'])
  })

  it('sends nothing for an empty message', async () => {
    const { deps, state } = fakeDeps()
    const adapter = new SessionAdapter(deps)
    const handle = await adapter.attach()
    await handle.send('   ')
    expect(state.prompts).toEqual([])
  })
})

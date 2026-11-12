/**
 * 会话 id 的持久化。
 *
 * 这两条决定了一个很实际的问题：**换个面板回来，刚才聊的还在不在。**
 * 存不住就每次都是新会话；存住但失效时不清，就会一直连不上。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** 每个用例干净的假 localStorage。 */
function fakeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
}

beforeEach(() => {
  vi.resetModules()
  ;(globalThis as { localStorage?: unknown }).localStorage = fakeStorage()
})

describe('存取', () => {
  it('round-trips an id', async () => {
    const store = await import('../src/client/agent/session-store')
    expect(store.readSessionId()).toBeNull()
    store.saveSessionId('session-1')
    expect(store.readSessionId()).toBe('session-1')
    store.clearSessionId()
    expect(store.readSessionId()).toBeNull()
  })

  it('treats an empty string as nothing stored', async () => {
    const g = globalThis as { localStorage: { setItem(k: string, v: string): void } }
    g.localStorage.setItem('dsh-destiny-agent-session', '')
    const store = await import('../src/client/agent/session-store')
    expect(store.readSessionId()).toBeNull()
  })

  it('survives a storage that throws', async () => {
    // 隐私模式下访问本身就抛：读写都该降级成"没有"，而不是把界面搞崩。
    ;(globalThis as { localStorage: unknown }).localStorage = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
      removeItem: () => { throw new Error('denied') },
    }
    const store = await import('../src/client/agent/session-store')
    expect(store.readSessionId()).toBeNull()
    expect(() => store.saveSessionId('x')).not.toThrow()
    expect(() => store.clearSessionId()).not.toThrow()
  })
})

describe('适配器复用', () => {
  it('reuses the stored id instead of creating a new session', async () => {
    const store = await import('../src/client/agent/session-store')
    store.saveSessionId('session-kept')
    const { SessionAdapter } = await import('../src/client/agent/session-adapter')
    let created = 0
    const deps = {
      async create() { created += 1; return 'session-new' },
      retain: () => ({
        sessionId: 'session-kept',
        binding: { sessionId: 'session-kept', session: { async prompt() { return { ok: true } } }, eventSource: { getSnapshot: () => ({ entries: [], hasMore: false, revision: 0, change: { kind: 'replace', entries: [] } }), subscribe: () => () => {} } },
        ready: Promise.resolve({ sessionId: 'session-kept', session: { async prompt() { return { ok: true } } }, eventSource: { getSnapshot: () => ({ entries: [], hasMore: false, revision: 0, change: { kind: 'replace', entries: [] } }), subscribe: () => () => {} } }),
        release: () => {},
      }),
      retainInfo: () => ({ getSnapshot: () => ({ referenceCount: 0 }) }),
    }
    const adapter = new SessionAdapter(deps as never)
    expect(await adapter.ensure()).toBe('session-kept')
    // Injectable violation: 不先读存储，切一次面板就换一个新会话。
    expect(created).toBe(0)
  })

  it('forgets a dead id so the next ensure creates a fresh one', async () => {
    const store = await import('../src/client/agent/session-store')
    store.saveSessionId('session-gone')
    const { SessionAdapter } = await import('../src/client/agent/session-adapter')
    const adapter = new SessionAdapter({
      async create() { return 'session-fresh' },
      retain: () => ({
        sessionId: 'session-gone',
        binding: {} as never,
        ready: Promise.reject(new Error('gone')),
        release: () => {},
      }),
      retainInfo: () => ({ getSnapshot: () => ({ referenceCount: 0 }) }),
    } as never)
    await expect(adapter.attach()).rejects.toThrow()
    // 失效的 id 必须忘掉，否则每一轮都拿它去 retain，永远失败。
    expect(store.readSessionId()).toBeNull()
    expect(await adapter.ensure()).toBe('session-fresh')
  })
})

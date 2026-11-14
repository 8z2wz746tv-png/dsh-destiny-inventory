/**
 * 失效会话的识别与一次性恢复。
 *
 * 背景（2026-11-13 查证）：DSH 只把用过的会话落盘，一个创建后从未成功发过消息的
 * 会话，宿主重启后就不在 `session.list()` 里；`retain` 会抛裸 `Error`，没有错误码。
 * 不处理它，浮窗就永久停在"连接失败"。
 *
 * A8.1a 之后语义变了：`unknown session` **不再**是清理的授权。清理只由
 * “成功基线 + 列表里确实没有”授权；列表还没就绪时的同一条错误说明不了任何事。
 * 这里钉的边界是：
 *
 * - 成功基线里没有它 → 清掉、重建一次；
 * - 列表还没就绪 / pull 失败 → 保留 id，不重建；
 * - 列表说在、retain 说不认识 → 不一致，保留 id，不重建。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountState } from '../src/client/agent/session-store'

const UNKNOWN = (id: string) => new Error(`sessions.retain: unknown session ${id}`)

const A: AccountState = { kind: 'confirmed', account: { membershipType: 3, membershipId: 'steam-a' } }
const B: AccountState = { kind: 'confirmed', account: { membershipType: 3, membershipId: 'steam-b' } }

function storage() {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
}

const bindingFor = (id: string) => ({
  sessionId: id,
  session: {
    async prompt() { return { ok: true } },
    getSnapshot: () => ({ openState: 'open' }),
  },
  eventSource: {
    getSnapshot: () => ({ entries: [], hasMore: false, revision: 1, change: { kind: 'replace', entries: [] } }),
    subscribe: () => () => {},
  },
})

/** 一个已经建立成功基线的列表；`sessions` 就是它说“在”的那些 id。 */
const listOf = (sessions: string[]) => {
  const snapshot = {
    phase: 'ready' as const,
    byId: Object.fromEntries(sessions.map((id) => [id, {}])),
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
  }
}

/** 首次基线授权：清理类用例的前提。 */
const initialTrust = {
  snapshot: () => ({
    trust: { kind: 'initial' as const, generation: 1 },
    generation: 1,
  }),
  subscribe: () => () => {},
}

let store: ReturnType<typeof storage>
beforeEach(() => {
  vi.resetModules()
  store = storage()
  ;(globalThis as { localStorage?: unknown }).localStorage = store
})

/** 造一个适配器；`behaviour` 决定每次 retain 的结果。 */
async function makeAdapter(
  behaviour: (id: string) => { ok: true } | { fail: unknown },
  account: () => AccountState,
  sessions: string[] = [],
) {
  const { SessionAdapter } = await import('../src/client/agent/session-adapter')
  const retained: string[] = []
  const releases: string[] = []
  let created = 0
  const adapter = new SessionAdapter(
    {
      async create() { created += 1; return `created-${created}` },
      retain: (id: string) => {
        retained.push(id)
        const result = behaviour(id)
        const base = {
          sessionId: id,
          binding: bindingFor(id) as never,
          release: () => { releases.push(id) },
        }
        return 'ok' in result
          ? { ...base, ready: Promise.resolve(bindingFor(id)) }
          : { ...base, ready: Promise.reject(result.fail) }
      },
      retainInfo: () => ({ getSnapshot: () => ({ referenceCount: 0 }) }),
      refresh: async () => {},
      list: listOf(sessions) as never,
    } as never,
    { trust: initialTrust as never },
    account,
  )
  return { adapter, retained, releases, createdCount: () => created }
}

describe('会话仍有效', () => {
  it('retains exactly once', async () => {
    const s = await import('../src/client/agent/session-store')
    s.saveSessionId(A, 'session-live')
    const { adapter, retained, createdCount } = await makeAdapter(() => ({ ok: true }), () => A, ['session-live'])
    expect((await adapter.attach()).sessionId).toBe('session-live')
    expect(retained).toEqual(['session-live'])
    expect(createdCount()).toBe(0)
  })
})

describe('成功基线说它不在', () => {
  it('rebuilds once without ever retaining the dead id', async () => {
    const s = await import('../src/client/agent/session-store')
    s.saveSessionId(A, 'session-dead')
    const { adapter, retained } = await makeAdapter(() => ({ ok: true }), () => A, [])
    const live = await adapter.attach()
    expect(live.sessionId).toBe('created-1')
    // 死 id 根本没进 retain：授权来自列表，不是来自一条 unknown。
    expect(retained).toEqual(['created-1'])
    expect(s.readSessionId(A)).toBe('created-1')
  })

  it('does not rebuild a second time when the fresh id also comes back unknown', async () => {
    const s = await import('../src/client/agent/session-store')
    s.saveSessionId(A, 'session-dead')
    const { adapter, retained, releases, createdCount } = await makeAdapter(
      (id) => ({ fail: UNKNOWN(id) }),
      () => A,
      [],
    )
    await expect(adapter.attach()).rejects.toThrow(/会话身份不一致/)
    // 只重建一次；第二次失败直接报，不再试第三次。
    expect(createdCount()).toBe(1)
    expect(retained).toEqual(['created-1'])
    // 失败的那次引用要还回去。
    expect(releases).toEqual(['created-1'])
    expect(s.readSessionId(A)).toBe('created-1')
  })
})

describe('列表说在、retain 说不认识', () => {
  it('keeps the id instead of clearing it', async () => {
    const s = await import('../src/client/agent/session-store')
    s.saveSessionId(A, 'session-live')
    const { adapter, retained, createdCount } = await makeAdapter(
      (id) => ({ fail: UNKNOWN(id) }),
      () => A,
      ['session-live'],
    )
    await expect(adapter.attach()).rejects.toThrow(/会话身份不一致/)
    // 不一致不是“会话没了”：不清 id、不新建。
    expect(retained).toEqual(['session-live'])
    expect(createdCount()).toBe(0)
    expect(s.readSessionId(A)).toBe('session-live')
  })
})

describe('其它错误', () => {
  it('does not forget on a network error', async () => {
    const s = await import('../src/client/agent/session-store')
    s.saveSessionId(A, 'session-live')
    const { adapter } = await makeAdapter(() => ({ fail: new Error('ECONNRESET') }), () => A, ['session-live'])
    await expect(adapter.attach()).rejects.toThrow(/ECONNRESET/)
    // 网络抖一下不该丢掉会话身份。
    expect(s.readSessionId(A)).toBe('session-live')
  })

  it('matches the prefix only, not the text somewhere inside', async () => {
    const s = await import('../src/client/agent/session-store')
    s.saveSessionId(A, 'session-live')
    // 正文里提到这串字、但前缀不是它——不能当成失效会话。
    const { adapter } = await makeAdapter(
      () => ({ fail: new Error('receipt mentions sessions.retain: unknown session x') }),
      () => A,
      ['session-live'],
    )
    await expect(adapter.attach()).rejects.toThrow()
    expect(s.readSessionId(A)).toBe('session-live')
  })
})

describe('取消', () => {
  it('does not clear the id when aborted mid-retain', async () => {
    const s = await import('../src/client/agent/session-store')
    s.saveSessionId(A, 'session-dead')

    // 时序要点：retain 已经发出、ready 还没回时就取消——这才可能出现
    // "取消" 与 "retain 报 unknown" 同时成立。
    const { SessionAdapter } = await import('../src/client/agent/session-adapter')
    let rejectReady: (e: unknown) => void = () => {}
    const retained: string[] = []
    let released = 0
    const adapter = new SessionAdapter(
      {
        async create() { return 'created-1' },
        retain: (id: string) => {
          retained.push(id)
          return {
            sessionId: id,
            binding: bindingFor(id) as never,
            ready: new Promise((_, reject) => { rejectReady = reject }),
            release: () => { released += 1 },
          }
        },
        retainInfo: () => ({ getSnapshot: () => ({ referenceCount: 0 }) }),
        refresh: async () => {},
        // 列表说它在——所以 retain 会被调用；随后 abort + unknown。
        list: listOf(['session-dead']) as never,
      } as never,
      {},
      () => A,
    )

    const controller = new AbortController()
    const attaching = adapter.attach(controller.signal)
    await vi.waitFor(() => expect(retained).toHaveLength(1))
    controller.abort()
    rejectReady(UNKNOWN('session-dead'))
    await expect(attaching).rejects.toThrow()

    // 引用归还；但“取消 + unknown”不再是清理的授权，id 必须留着。
    expect(retained).toEqual(['session-dead'])
    expect(released).toBe(1)
    expect(s.readSessionId(A)).toBe('session-dead')
  })
})

describe('账号隔离', () => {
  it('does not touch the new account slot when the old flow finishes late', async () => {
    const s = await import('../src/client/agent/session-store')
    s.saveSessionId(A, 'session-a-dead')
    s.saveSessionId(B, 'session-b-live')
    let current: AccountState = A
    const { adapter } = await makeAdapter(
      (id): { ok: true } | { fail: unknown } => (id === 'session-a-dead' ? { fail: UNKNOWN(id) } : { ok: true }),
      () => current,
      ['session-a-dead'],
    )
    // 模拟：A 的流程还在飞时账号切到了 B。
    const attaching = adapter.attach()
    current = B
    await expect(attaching).rejects.toThrow()
    // B 的会话必须原样还在——这正是无条件 forget 会弄坏的地方。
    expect(s.readSessionId(B)).toBe('session-b-live')
  })

  it('does not delete a value another flow already replaced', async () => {
    const s = await import('../src/client/agent/session-store')
    s.saveSessionId(A, 'session-old')
    // 另一个流程已经把槽位换成了新的 id。
    s.saveSessionId(A, 'session-new')
    const removed = s.clearSessionIdIfMatches(A, 'session-old')
    expect(removed).toBe(false)
    expect(s.readSessionId(A)).toBe('session-new')
  })
})

describe('并发', () => {
  it('shares one attaching promise', async () => {
    const s = await import('../src/client/agent/session-store')
    s.saveSessionId(A, 'session-live')
    const { adapter, retained } = await makeAdapter(() => ({ ok: true }), () => A, ['session-live'])
    const [first, second] = await Promise.all([adapter.attach(), adapter.attach()])
    expect(first).toBe(second)
    // 两次调用只该 retain 一次。
    expect(retained).toEqual(['session-live'])
  })
})

describe('清理的条件性（适配器层）', () => {
  it('does not delete when the slot already moved on before the rebuild', async () => {
    const s = await import('../src/client/agent/session-store')
    s.saveSessionId(A, 'session-dead')

    // 时序：ensure 读到旧 id → 等列表基线时另一个流程把槽位换成 session-newer
    // → 基线说 session-dead 不在 → 条件删除必须放过 session-newer。
    const { SessionAdapter } = await import('../src/client/agent/session-adapter')
    let snapshot: { phase: 'pending' | 'ready'; byId: Record<string, unknown> } = {
      phase: 'pending',
      byId: {},
    }
    const listeners = new Set<() => void>()
    const publish = (next: typeof snapshot): void => {
      snapshot = next
      for (const listener of [...listeners]) listener()
    }
    const retained: string[] = []
    const adapter = new SessionAdapter(
      {
        async create() { return 'created-1' },
        retain: (id: string) => {
          retained.push(id)
          return {
            sessionId: id,
            binding: bindingFor(id) as never,
            ready: Promise.resolve(bindingFor(id)),
            release: () => {},
          }
        },
        retainInfo: () => ({ getSnapshot: () => ({ referenceCount: 0 }) }),
        refresh: async () => {
          s.saveSessionId(A, 'session-newer')
          publish({ phase: 'ready', byId: {} })
        },
        list: {
          getSnapshot: () => snapshot,
          subscribe: (listener: () => void) => {
            listeners.add(listener)
            return () => {
              listeners.delete(listener)
            }
          },
        },
      } as never,
      { trust: initialTrust as never },
      () => A,
    )

    const live = await adapter.attach()

    // 槽位已换成 session-newer，条件删除就不该动它——于是 ensure() 读到的是
    // 那个新值，恢复的是它（而不是新建一个）。
    expect(live.sessionId).toBe('session-newer')
    expect(retained).toEqual(['session-newer'])
    // Injectable violation: 无条件 clearSessionId 会先删掉 session-newer，
    // 再让 ensure() 看到空槽位而新建——这个值就此消失。
    expect(s.readSessionId(A)).toBe('session-newer')
  })
})

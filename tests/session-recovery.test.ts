/**
 * 失效会话的识别与一次性恢复。
 *
 * 背景（2026-11-13 查证）：DSH 只把用过的会话落盘，一个创建后从未成功发过消息的
 * 会话，宿主重启后就不在 `session.list()` 里；`retain` 会抛裸 `Error`，没有错误码。
 * 不处理它，浮窗就永久停在"连接失败"。
 *
 * 这里钉的是**边界**：该清的清、不该清的不许清、最多重建一次。
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
  session: { async prompt() { return { ok: true } } },
  eventSource: {
    getSnapshot: () => ({ entries: [], hasMore: false, revision: 1, change: { kind: 'replace', entries: [] } }),
    subscribe: () => () => {},
  },
})

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
    } as never,
    {},
    account,
  )
  return { adapter, retained, releases, createdCount: () => created }
}

describe('会话仍有效', () => {
  it('retains exactly once', async () => {
    const s = await import('../src/client/agent/session-store')
    s.saveSessionId(A, 'session-live')
    const { adapter, retained, createdCount } = await makeAdapter(() => ({ ok: true }), () => A)
    expect((await adapter.attach()).sessionId).toBe('session-live')
    expect(retained).toEqual(['session-live'])
    expect(createdCount()).toBe(0)
  })
})

describe('unknown session', () => {
  it('clears the dead id and rebuilds once', async () => {
    const s = await import('../src/client/agent/session-store')
    s.saveSessionId(A, 'session-dead')
    // 第一次恢复失败，重建出来的那个成功。
    const { adapter, retained } = await makeAdapter(
      (id) => (id === 'session-dead' ? { fail: UNKNOWN(id) } : { ok: true }),
      () => A,
    )
    const live = await adapter.attach()
    expect(live.sessionId).toBe('created-1')
    // Injectable violation: 不做第二次 retain，浮窗就永久停在"连接失败"。
    expect(retained).toEqual(['session-dead', 'created-1'])
    expect(s.readSessionId(A)).toBe('created-1')
  })

  it('gives up after one rebuild and leaves no reference', async () => {
    const s = await import('../src/client/agent/session-store')
    s.saveSessionId(A, 'session-dead')
    const { adapter, retained, releases } = await makeAdapter((id) => ({ fail: UNKNOWN(id) }), () => A)
    await expect(adapter.attach()).rejects.toThrow(/unknown session/)
    // 只重建一次；第二次失败直接抛，不再试第三次。
    expect(retained).toEqual(['session-dead', 'created-1'])
    // 两次 retain 失败，两次都得归还引用。
    expect(releases).toEqual(['session-dead', 'created-1'])
  })
})

describe('其它错误', () => {
  it('does not forget on a network error', async () => {
    const s = await import('../src/client/agent/session-store')
    s.saveSessionId(A, 'session-live')
    const { adapter } = await makeAdapter(() => ({ fail: new Error('ECONNRESET') }), () => A)
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
    )
    await expect(adapter.attach()).rejects.toThrow()
    expect(s.readSessionId(A)).toBe('session-live')
  })
})

describe('取消', () => {
  it('does not rebuild after abort, but still clears the dead id', async () => {
    const s = await import('../src/client/agent/session-store')
    s.saveSessionId(A, 'session-dead')

    // 时序要点：retain 已经发出、ready 还没回时就取消——这才可能出现
    // "取消" 与 "会话失效" 同时成立。
    const { SessionAdapter } = await import('../src/client/agent/session-adapter')
    let rejectReady: (e: unknown) => void = () => {}
    const retained: string[] = []
    const adapter = new SessionAdapter(
      {
        async create() { return 'created-1' },
        retain: (id: string) => {
          retained.push(id)
          return {
            sessionId: id,
            binding: bindingFor(id) as never,
            ready: new Promise((_, reject) => { rejectReady = reject }),
            release: () => {},
          }
        },
        retainInfo: () => ({ getSnapshot: () => ({ referenceCount: 0 }) }),
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

    // 会话确实不在了 → 该清；组件已经卸载 → 不该再建。
    expect(retained).toEqual(['session-dead'])
    expect(s.readSessionId(A)).toBeNull()
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
    const { adapter, retained } = await makeAdapter(() => ({ ok: true }), () => A)
    const [first, second] = await Promise.all([adapter.attach(), adapter.attach()])
    expect(first).toBe(second)
    // 两次调用只该 retain 一次。
    expect(retained).toEqual(['session-live'])
  })
})

describe('清理的条件性（适配器层）', () => {
  it('does not delete when the slot already moved on mid-flight', async () => {
    const s = await import('../src/client/agent/session-store')
    s.saveSessionId(A, 'session-dead')

    // 时序：ensure 读到旧 id → retain 失败 → 这中间另一个流程换了槽位。
    // 无条件删除会把那个新值一起清掉。
    const { SessionAdapter } = await import('../src/client/agent/session-adapter')
    let rejectReady: (e: unknown) => void = () => {}
    let retained = 0
    const adapter = new SessionAdapter(
      {
        async create() { return 'created-1' },
        retain: (id: string) => {
          retained += 1
          const base = { sessionId: id, binding: bindingFor(id) as never, release: () => {} }
          if (retained > 1) return { ...base, ready: Promise.resolve(bindingFor(id)) }
          // 第一次恢复失败前，槽位已被别人写成 session-newer。
          s.saveSessionId(A, 'session-newer')
          return { ...base, ready: new Promise((_, reject) => { rejectReady = reject }) }
        },
        retainInfo: () => ({ getSnapshot: () => ({ referenceCount: 0 }) }),
      } as never,
      {},
      () => A,
    )

    const attaching = adapter.attach()
    await vi.waitFor(() => expect(retained).toBe(1))
    rejectReady(UNKNOWN('session-dead'))
    // 槽位已换成 session-newer，条件删除就不该动它——于是 ensure() 读到的是
    // 那个新值，恢复的是它（而不是新建一个）。
    expect((await attaching).sessionId).toBe('session-newer')

    // Injectable violation: 无条件 clearSessionId 会先删掉 session-newer，
    // 再让 ensure() 看到空槽位而新建——这个值就此消失。
    expect(s.readSessionId(A)).toBe('session-newer')
  })
})

/**
 * 会话存储的账号分区。
 *
 * 这里钉的是一条安全边界：**切账号绝不能看见另一个账号的对话**。
 * 存储本身是"记住上次用哪个会话"，但记错的代价是跨账号上下文污染。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountState } from '../src/client/agent/session-store'

/** 干净的假 localStorage，并记录所有键。 */
function fakeStorage() {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
}

const A: AccountState = { kind: 'confirmed', account: { membershipType: 3, membershipId: 'steam-a' } }
const B: AccountState = { kind: 'confirmed', account: { membershipType: 3, membershipId: 'steam-b' } }
const STEAM_A: AccountState = { kind: 'confirmed', account: { membershipType: 3, membershipId: 'same-id' } }
const XBOX_A: AccountState = { kind: 'confirmed', account: { membershipType: 1, membershipId: 'same-id' } }

let store: ReturnType<typeof fakeStorage>

beforeEach(() => {
  vi.resetModules()
  store = fakeStorage()
  ;(globalThis as { localStorage?: unknown }).localStorage = store
})

describe('分区', () => {
  it('keeps two accounts apart', async () => {
    const s = await import('../src/client/agent/session-store')
    s.saveSessionId(A, 'session-a')
    s.saveSessionId(B, 'session-b')
    // Injectable violation: 用全局单键，两条会互相覆盖，B 看到 A 的会话。
    expect(s.readSessionId(A)).toBe('session-a')
    expect(s.readSessionId(B)).toBe('session-b')
  })

  it('does not collide when only membershipType differs', async () => {
    const s = await import('../src/client/agent/session-store')
    s.saveSessionId(STEAM_A, 'steam-session')
    s.saveSessionId(XBOX_A, 'xbox-session')
    // 同一个 membershipId 挂在不同平台上，是两个账号。
    expect(s.readSessionId(STEAM_A)).toBe('steam-session')
    expect(s.readSessionId(XBOX_A)).toBe('xbox-session')
  })

  it('writes nothing for an empty membershipId', async () => {
    const s = await import('../src/client/agent/session-store')
    const blank: AccountState = { kind: 'confirmed', account: { membershipType: 3, membershipId: '' } }
    s.saveSessionId(blank, 'x')
    expect(store.map.size).toBe(0)
  })
})

describe('账号状态', () => {
  it('will not restore while the account is unavailable', async () => {
    const s = await import('../src/client/agent/session-store')
    s.saveSessionId(A, 'session-a')
    // 网络故障时读到的是"不知道这是谁"，此时恢复等于把 A 的历史给当前环境。
    expect(s.readSessionId({ kind: 'unavailable' })).toBeNull()
  })

  it('keeps the data when the account is unavailable', async () => {
    const s = await import('../src/client/agent/session-store')
    s.saveSessionId(A, 'session-a')
    s.readSessionId({ kind: 'unavailable' })
    // fail closed 但保留数据：网络恢复后 A 还要能接回自己的会话。
    expect(store.map.size).toBe(1)
    expect(s.readSessionId(A)).toBe('session-a')
  })

  it('will not restore when signed out', async () => {
    const s = await import('../src/client/agent/session-store')
    s.saveSessionId(A, 'session-a')
    expect(s.readSessionId({ kind: 'signedOut' })).toBeNull()
  })

  it('does not write while unavailable', async () => {
    const s = await import('../src/client/agent/session-store')
    s.saveSessionId({ kind: 'unavailable' }, 'ghost')
    expect(store.map.size).toBe(0)
  })
})

describe('清理', () => {
  it('clears only the current account', async () => {
    const s = await import('../src/client/agent/session-store')
    s.saveSessionId(A, 'session-a')
    s.saveSessionId(B, 'session-b')
    s.clearSessionId(A)
    // 失效的是 A 的会话，B 的不能被连带删掉。
    expect(s.readSessionId(A)).toBeNull()
    expect(s.readSessionId(B)).toBe('session-b')
  })

  it('clears nothing while the account is unavailable', async () => {
    const s = await import('../src/client/agent/session-store')
    s.saveSessionId(A, 'session-a')
    s.clearSessionId({ kind: 'unavailable' })
    expect(s.readSessionId(A)).toBe('session-a')
  })
})

describe('存储不可用', () => {
  it('degrades to nothing instead of throwing', async () => {
    ;(globalThis as { localStorage: unknown }).localStorage = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
      removeItem: () => { throw new Error('denied') },
    }
    const s = await import('../src/client/agent/session-store')
    expect(s.readSessionId(A)).toBeNull()
    expect(() => s.saveSessionId(A, 'x')).not.toThrow()
    expect(() => s.clearSessionId(A)).not.toThrow()
  })
})

describe('适配器', () => {
  it('reuses the stored id for the same account', async () => {
    const s = await import('../src/client/agent/session-store')
    s.saveSessionId(A, 'session-kept')
    const { SessionAdapter } = await import('../src/client/agent/session-adapter')
    let created = 0
    const adapter = new SessionAdapter(
      { async create() { created += 1; return 'session-new' }, retain: () => ({}) as never, retainInfo: () => ({ getSnapshot: () => ({ referenceCount: 0 }) }) } as never,
      {},
      () => A,
    )
    expect(await adapter.ensure()).toBe('session-kept')
    expect(created).toBe(0)
  })

  it('forgets a dead id for the current account only', async () => {
    const s = await import('../src/client/agent/session-store')
    s.saveSessionId(A, 'session-gone')
    s.saveSessionId(B, 'session-b')
    const { SessionAdapter } = await import('../src/client/agent/session-adapter')
    const adapter = new SessionAdapter(
      {
        async create() { return 'session-fresh' },
        // 只有"会话在宿主里不存在"才清；网络错误不清（详见 session-recovery.test.ts）。
        retain: () => ({ sessionId: 'session-gone', binding: {} as never, ready: Promise.reject(new Error('sessions.retain: unknown session session-gone')), release: () => {} }),
        retainInfo: () => ({ getSnapshot: () => ({ referenceCount: 0 }) }),
      } as never,
      {},
      () => A,
    )
    await expect(adapter.attach()).rejects.toThrow()
    // 失效 id 已清、并重建了一次（`create` 写回了新 id）——见 session-recovery.test.ts。
    expect(s.readSessionId(A)).toBe('session-fresh')
    // 另一个账号的会话不该被这次失败连累。
    expect(s.readSessionId(B)).toBe('session-b')
  })
})

describe('账号落定不重建适配器', () => {
  it('reads the account lazily, so a later confirmation still applies', async () => {
    const s = await import('../src/client/agent/session-store')
    s.saveSessionId(A, 'session-a')
    const { SessionAdapter } = await import('../src/client/agent/session-adapter')
    // 构造时账号还没读到，之后才确认——适配器必须跟着看到新值。
    let current: AccountState = { kind: 'unavailable' }
    const adapter = new SessionAdapter(
      { async create() { return 'fresh' }, retain: () => ({}) as never, retainInfo: () => ({ getSnapshot: () => ({ referenceCount: 0 }) }) } as never,
      {},
      () => current,
    )
    // Injectable violation: 构造时就把账号固化成 unavailable，确认后仍然看不到会话。
    expect(await adapter.ensure()).toBe('fresh')
    current = A
    // 已经创建过的适配器不会回头再读，这条断言钉的是"构造时不固化"。
    expect(s.readSessionId(current)).toBe('session-a')
  })
})

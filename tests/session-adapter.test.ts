/**
 * Session Adapter 的生命周期。
 *
 * 这里每一条失败方式都是**看不见的泄漏**：引用没还、订阅没退、两次 attach 叠出
 * 两份监听。它们不会报错，只会让计数慢慢涨——所以全部用假对象把计数钉死。
 *
 * 第二组是 A8.1a 的初始化竞态：列表还没就绪时 `retain` 会把一个仍然有效的会话
 * 判成 `unknown session`，然后清掉 id、新建一个——用户丢一次对话。这里的测试
 * 钉的是**屏障**：pending 不允许 retain，也不允许清理；只有成功基线 + 列表里
 * 确实没有，才允许重建一次。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SessionAdapter } from '../src/client/agent/session-adapter'
import type { SessionDeps, SessionListSnapshot } from '../src/client/agent/session-adapter'
import { readSessionId, saveSessionId } from '../src/client/agent/session-store'
import type { AccountState } from '../src/client/agent/session-store'
import {
  BaselineUnverifiedError,
  HistoryNotOpenError,
  ListNotReadyError,
  SessionIdentityConflictError,
} from '../src/client/agent/session-error'
import type { BaselineTrust, BaselineTrustSource } from '../src/client/agent/baseline-trust'

const ACCOUNT: AccountState = {
  kind: 'confirmed',
  account: { membershipType: 3, membershipId: '42' },
}
const OTHER: AccountState = {
  kind: 'confirmed',
  account: { membershipType: 3, membershipId: '43' },
}

/** 一份够用的 localStorage：会话 id 的存取要能真的发生。 */
function installStorage(): void {
  const map = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return map.size
    },
    clear: () => {
      map.clear()
    },
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => {
      map.delete(key)
    },
    setItem: (key, value) => {
      map.set(key, value)
    },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
    writable: true,
  })
}

beforeEach(installStorage)
afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage
})

/** 一个会记账的假会话服务。 */
interface FakeOptions {
  readyHangs?: boolean
  /** 列表初始状态；默认 ready，老测试不需要关心屏障。 */
  phase?: 'pending' | 'ready'
  /** 成功基线里有哪些 id；默认只有 `session-1`。 */
  sessions?: string[]
  /** `retain` 之后的历史状态；默认打开。 */
  openState?: string
  /** `retain` 直接报 unknown（模拟“列表说在、retain 说不认识”）。 */
  unknownOnRetain?: boolean
  /** 一次 pull 的行为；默认什么都不做（决议但 state 不变）。 */
  refresh?: (helpers: {
    publish: (snapshot: SessionListSnapshot) => void
    calls: number
  }) => void | Promise<void>
}

function fakeDeps(options: FakeOptions = {}) {
  const state = {
    created: 0,
    retained: 0,
    released: 0,
    subscribes: 0,
    unsubscribes: 0,
    refreshes: 0,
    prompts: [] as string[],
    retainedIds: [] as string[],
  }
  let releaseReady: (() => void) | null = null
  const window = {
    entries: [] as unknown[],
    hasMore: false,
    revision: 0,
    change: { kind: 'replace' as const, entries: [] as unknown[] },
  }

  let snapshot: SessionListSnapshot = {
    phase: options.phase ?? 'ready',
    byId: Object.fromEntries((options.sessions ?? ['session-1']).map((id) => [id, {}])),
  }
  const listeners = new Set<() => void>()
  const publish = (next: SessionListSnapshot): void => {
    snapshot = next
    for (const listener of [...listeners]) listener()
  }
  const list = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }

  const deps: SessionDeps = {
    async create() {
      state.created += 1
      return 'session-1'
    },
    retain(id) {
      if (options.unknownOnRetain === true) {
        throw new Error(`sessions.retain: unknown session ${id}`)
      }
      state.retained += 1
      state.retainedIds.push(id)
      const ready = new Promise<never>((resolve) => {
        releaseReady = () => resolve(sink as never)
      })
      const sink = {
        sessionId: id,
        session: {
          async prompt(content: { type: 'text'; text: string }[]) {
            state.prompts.push(content[0].text)
            return { ok: true }
          },
          getSnapshot: () => ({
            openState: options.openState ?? 'open',
            openError: options.openState === 'error' ? new Error('history route gone') : undefined,
          }),
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
        sessionId: id,
        binding: sink,
        ready: options.readyHangs === true ? ready : Promise.resolve(sink),
        release: () => {
          state.released += 1
        },
      }
    },
    retainInfo: () => ({ getSnapshot: () => ({ referenceCount: state.retained - state.released }) }),
    refresh: async () => {
      state.refreshes += 1
      await options.refresh?.({ publish, calls: state.refreshes })
    },
    list,
  }
  return { deps, state, publish, settleReady: () => releaseReady?.() }
}

/** 让 attach 走到“正在等列表”的位置。 */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/** 固定信任快照。 */
function trustOf(trust: BaselineTrust, generation: number | undefined): BaselineTrustSource {
  return {
    snapshot: () => ({ trust, generation }),
    subscribe: () => () => {},
  }
}

/** 可变的信任快照：用来模拟“异步操作期间 generation 变化”。 */
function mutableTrust(trust: BaselineTrust, generation: number | undefined) {
  let current = { trust, generation }
  return {
    source: {
      snapshot: () => current,
      subscribe: () => () => {},
    } satisfies BaselineTrustSource,
    set(next: BaselineTrust, nextGeneration: number | undefined): void {
      current = { trust: next, generation: nextGeneration }
    },
  }
}

const INITIAL_TRUST = (): BaselineTrustSource => trustOf({ kind: 'initial', generation: 1 }, 1)

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

describe('列表就绪屏障（A8.1a）', () => {
  it('keeps a stored id that the successful baseline contains', async () => {
    const { deps, state } = fakeDeps({ phase: 'ready', sessions: ['stored-1'] })
    saveSessionId(ACCOUNT, 'stored-1')
    const adapter = new SessionAdapter(deps, {}, () => ACCOUNT)

    const handle = await adapter.attach()

    expect(handle.sessionId).toBe('stored-1')
    expect(state.retainedIds).toEqual(['stored-1'])
    expect(state.created).toBe(0)
    expect(readSessionId(ACCOUNT)).toBe('stored-1')
  })

  it('does not retain while the list is pending, then retains once ready', async () => {
    const { deps, state, publish } = fakeDeps({ phase: 'pending', sessions: ['stored-1'] })
    saveSessionId(ACCOUNT, 'stored-1')
    const adapter = new SessionAdapter(deps, {}, () => ACCOUNT)

    const attaching = adapter.attach()
    await tick()

    // refresh 已经决议，但 phase 还是 pending：**决议不是成功**。
    expect(state.refreshes).toBe(1)
    expect(state.retained).toBe(0)
    expect(state.created).toBe(0)
    expect(readSessionId(ACCOUNT)).toBe('stored-1')

    publish({ phase: 'ready', byId: { 'stored-1': {} } })
    const handle = await attaching

    expect(handle.sessionId).toBe('stored-1')
    expect(state.retainedIds).toEqual(['stored-1'])
  })

  it('a failed or fenced pull is not evidence that the session is gone', async () => {
    const { deps, state, publish } = fakeDeps({ phase: 'pending', sessions: [] })
    saveSessionId(ACCOUNT, 'dead-1')
    const adapter = new SessionAdapter(deps, { trust: INITIAL_TRUST() }, () => ACCOUNT)

    const attaching = adapter.attach()
    await tick()

    // 这一次 pull 没有建立基线（RemoteFailure 或 generation fence）：
    // 既不许 retain，也不许把“没读到”当成“列表里没有”。
    expect(state.retained).toBe(0)
    expect(state.created).toBe(0)
    expect(readSessionId(ACCOUNT)).toBe('dead-1')

    // 下一次**成功**基线说它不在，这才允许一次性恢复。
    publish({ phase: 'ready', byId: {} })
    const handle = await attaching

    expect(handle.sessionId).toBe('session-1')
    expect(state.created).toBe(1)
    expect(state.retainedIds).toEqual(['session-1'])
    expect(readSessionId(ACCOUNT)).toBe('session-1')
  })

  it('keeps the id when refresh itself fails', async () => {
    const { deps, state } = fakeDeps({
      phase: 'pending',
      sessions: ['stored-1'],
      refresh: () => {
        throw new Error('gateway down')
      },
    })
    saveSessionId(ACCOUNT, 'stored-1')
    const adapter = new SessionAdapter(deps, {}, () => ACCOUNT)

    await expect(adapter.attach()).rejects.toBeInstanceOf(ListNotReadyError)

    expect(readSessionId(ACCOUNT)).toBe('stored-1')
    expect(state.created).toBe(0)
    expect(state.retained).toBe(0)
  })

  it('does not clear the id when retain disagrees with the list', async () => {
    const { deps, state } = fakeDeps({
      phase: 'ready',
      sessions: ['stored-1'],
      unknownOnRetain: true,
    })
    saveSessionId(ACCOUNT, 'stored-1')
    const adapter = new SessionAdapter(deps, {}, () => ACCOUNT)

    await expect(adapter.attach()).rejects.toBeInstanceOf(SessionIdentityConflictError)

    // 列表说在、retain 说不认识：这是不一致，不是“会话没了”。
    expect(readSessionId(ACCOUNT)).toBe('stored-1')
    expect(state.created).toBe(0)
    expect(state.retained).toBe(0)
  })

  it('does not call attach successful when history did not open', async () => {
    const { deps, state } = fakeDeps({
      phase: 'ready',
      sessions: ['stored-1'],
      openState: 'error',
    })
    saveSessionId(ACCOUNT, 'stored-1')
    const adapter = new SessionAdapter(deps, {}, () => ACCOUNT)

    await expect(adapter.attach()).rejects.toBeInstanceOf(HistoryNotOpenError)

    // 历史没打开：保留原 id、不新建、引用归还。
    expect(readSessionId(ACCOUNT)).toBe('stored-1')
    expect(state.created).toBe(0)
    expect(state.retained).toBe(1)
    expect(state.released).toBe(1)
    expect(state.subscribes).toBe(0)
  })

  it('does not touch the other account when the account changes while waiting', async () => {
    let account: AccountState = ACCOUNT
    const { deps, state, publish } = fakeDeps({ phase: 'pending', sessions: [] })
    saveSessionId(ACCOUNT, 'a-1')
    saveSessionId(OTHER, 'b-1')
    const adapter = new SessionAdapter(deps, {}, () => account)

    const attaching = adapter.attach()
    await tick()
    account = OTHER
    publish({ phase: 'ready', byId: {} })

    await expect(attaching).rejects.toThrow()

    // 旧账号的 id 不动，新账号的槽位也不能被这次流程碰到。
    expect(readSessionId(ACCOUNT)).toBe('a-1')
    expect(readSessionId(OTHER)).toBe('b-1')
    expect(state.created).toBe(0)
    expect(state.retainedIds).toEqual([])
  })

  it('does not create when the attach was already aborted', async () => {
    const { deps, state } = fakeDeps({ phase: 'pending', sessions: [] })
    const adapter = new SessionAdapter(deps, {}, () => ACCOUNT)
    const controller = new AbortController()
    controller.abort()

    await expect(adapter.attach(controller.signal)).rejects.toThrow()

    expect(state.created).toBe(0)
    expect(state.retained).toBe(0)
  })

  it('keeps the stored id when the baseline is revoked', async () => {
    const { deps, state } = fakeDeps({ phase: 'ready', sessions: [] })
    saveSessionId(ACCOUNT, 'dead-1')
    const adapter = new SessionAdapter(
      deps,
      { trust: trustOf({ kind: 'revoked' }, 2) },
      () => ACCOUNT,
    )

    await expect(adapter.attach()).rejects.toBeInstanceOf(BaselineUnverifiedError)

    // 重连后旧 ready + not found：不许清、不许建。
    expect(readSessionId(ACCOUNT)).toBe('dead-1')
    expect(state.created).toBe(0)
    expect(state.retained).toBe(0)
  })

  it('keeps the stored id when no baseline was ever trusted', async () => {
    const { deps, state } = fakeDeps({ phase: 'ready', sessions: [] })
    saveSessionId(ACCOUNT, 'dead-1')
    const adapter = new SessionAdapter(
      deps,
      { trust: trustOf({ kind: 'none' }, undefined) },
      () => ACCOUNT,
    )

    await expect(adapter.attach()).rejects.toBeInstanceOf(BaselineUnverifiedError)

    expect(readSessionId(ACCOUNT)).toBe('dead-1')
    expect(state.created).toBe(0)
    expect(state.retained).toBe(0)
  })

  it('still allows a non-destructive retain when the baseline is revoked but the id is present', async () => {
    const { deps, state } = fakeDeps({ phase: 'ready', sessions: ['stored-1'] })
    saveSessionId(ACCOUNT, 'stored-1')
    const adapter = new SessionAdapter(
      deps,
      { trust: trustOf({ kind: 'revoked' }, 2) },
      () => ACCOUNT,
    )

    const handle = await adapter.attach()

    expect(handle.sessionId).toBe('stored-1')
    expect(state.retainedIds).toEqual(['stored-1'])
    expect(state.created).toBe(0)
    expect(readSessionId(ACCOUNT)).toBe('stored-1')
  })

  it('rejects when the trusted generation is not the current one', async () => {
    const { deps, state } = fakeDeps({ phase: 'ready', sessions: [] })
    saveSessionId(ACCOUNT, 'dead-1')
    const adapter = new SessionAdapter(
      deps,
      // 快照自相矛盾：授权属于 G1，当前已经是 G2。
      { trust: trustOf({ kind: 'initial', generation: 1 }, 2) },
      () => ACCOUNT,
    )

    await expect(adapter.attach()).rejects.toBeInstanceOf(BaselineUnverifiedError)
    expect(readSessionId(ACCOUNT)).toBe('dead-1')
    expect(state.created).toBe(0)
  })

  it('a generation change during the wait revokes before the decision', async () => {
    const { deps, state, publish } = fakeDeps({ phase: 'pending', sessions: [] })
    saveSessionId(ACCOUNT, 'dead-1')
    const trust = mutableTrust({ kind: 'initial', generation: 1 }, 1)
    const adapter = new SessionAdapter(deps, { trust: trust.source }, () => ACCOUNT)

    const attaching = adapter.attach()
    await tick()

    // 列表还在等；这中间 generation 变了，旧授权必须失效。
    trust.set({ kind: 'revoked' }, 2)
    publish({ phase: 'ready', byId: {} })

    await expect(attaching).rejects.toBeInstanceOf(BaselineUnverifiedError)
    expect(readSessionId(ACCOUNT)).toBe('dead-1')
    expect(state.created).toBe(0)
    expect(state.retained).toBe(0)
  })
})

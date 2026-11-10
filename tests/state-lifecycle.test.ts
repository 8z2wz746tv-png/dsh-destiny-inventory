/**
 * P1 —— 一次操作的完整状态生命周期。
 *
 * 不是"`confirmMove` 会不会改入参"（那是 P0），而是：**从加载到失败回滚再到刷新，
 * `observed` 和 `rendered` 有没有各自走完自己的路。**
 *
 * 这里不渲染 React（这个仓没有 jsdom，也不为这一条测试引入），但每一步都调用真实模块：
 * `loadInventory` → `applyMove` → `confirmMove` → 再 `loadInventory`。状态用面板同一个形状。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/client/api', () => ({
  fetchAccount: vi.fn(),
  fetchCharacters: vi.fn(),
  fetchInventory: vi.fn(),
  fetchJournal: vi.fn(async () => []),
  BridgeError: class extends Error {},
}))
vi.mock('../src/client/snapshot-db', () => ({ readSnapshot: vi.fn(async () => null), writeSnapshot: vi.fn() }))

const api = (await import('../src/client/api')) as unknown as Record<string, ReturnType<typeof vi.fn>>
const { loadInventory } = await import('../src/client/load-inventory')
const { PendingOps } = await import('../src/client/pending-ops')
const { applyOverlay } = await import('../src/client/pending-ops-render')
const { applyMove, confirmMove } = await import('../src/client/apply-move')

import type { ItemRow } from '../src/host/types'

const steam = { membershipType: 3, membershipId: '4611' }

const row = (locationKey: string): ItemRow =>
  ({
    instanceId: 'i1',
    locationKey,
    location: locationKey,
    characterId: locationKey === 'vault' ? null : locationKey,
    placement: locationKey === 'vault' ? { kind: 'vault' } : { kind: 'inventory', characterId: locationKey },
    equipped: 'not_equipped',
    locked: false,
  }) as unknown as ItemRow

/** 面板那份状态，形状与 `InventoryPanel` 的 `LoadState.ready` 一致。 */
interface PanelState {
  observed: ItemRow[]
  rendered: ItemRow[]
}

function harness() {
  const pending = new PendingOps()
  const state: PanelState = { observed: [], rendered: [] }
  const deps = {
    routePath: '/b',
    pending,
    onSnapshot: (snap: { items: ItemRow[] }, observed: ItemRow[], _profile: unknown) => {
      // 和面板一样：观察和渲染各存一份。
      state.observed = observed
      state.rendered = snap.items
    },
    onError: vi.fn(),
  }
  const signal = () => new AbortController().signal
  /** 面板的 `patchRows`：只改渲染行。 */
  const patchRows = (change: (rows: ItemRow[]) => ItemRow[]): void => {
    state.rendered = change(state.rendered)
  }
  return { pending, state, deps, signal, patchRows }
}

const where = (rows: ItemRow[]) => rows[0]?.locationKey
const mark = (rows: ItemRow[]) => rows[0]?.pending

beforeEach(() => {
  vi.clearAllMocks()
  api.fetchAccount.mockResolvedValue(steam)
  api.fetchCharacters.mockResolvedValue({ displayName: 'X', triumphScore: 0, characters: [] })
})

describe('P1 · 一次拖拽走完全程，两份数据各走各的路', () => {
  it('keeps the observation at vault through move, rejection and rollback', async () => {
    const h = harness()
    api.fetchInventory.mockResolvedValue({
      account: steam, fetchedAt: Date.now(), total: 1, truncated: false, items: [row('vault')],
    })

    // 1) 初始加载：两边都是 vault。
    await loadInventory(h.deps, h.signal(), false)
    expect(where(h.state.observed)).toBe('vault')
    expect(where(h.state.rendered)).toBe('vault')

    // 2) 乐观移动：渲染行去 warlock，观测纹丝不动。
    h.pending.submit({ eventId: 'e1', instanceId: 'i1', action: 'move', target: 'warlock', from: 'vault', now: Date.now() })
    h.patchRows((rows) => applyMove(rows, 'i1', 'warlock'))
    h.patchRows((rows) => applyOverlay(rows, h.pending.all()))
    expect(where(h.state.rendered)).toBe('warlock')
    // Injectable violation: rebuild `observed` from `rendered` here and Bungie's answer
    // is gone for good — everything downstream would then be reading a guess.
    expect(where(h.state.observed)).toBe('vault')

    // 3) 明确拒绝：撤到上一位置，并戴未确认标记。
    h.pending.settle('e1', 'rejected')
    h.patchRows((rows) => confirmMove(rows, 'i1', 'hunter', false, 'rollback'))
    expect(where(h.state.rendered)).toBe('hunter')
    expect(mark(h.state.rendered)).toBe('unconfirmed')
    expect(where(h.state.observed)).toBe('vault')
    expect(mark(h.state.observed)).toBeUndefined()
  })

  it('a refresh replaces the observation wholesale and the rollback does not survive it', async () => {
    const h = harness()
    api.fetchInventory.mockResolvedValue({
      account: steam, fetchedAt: Date.now(), total: 1, truncated: false, items: [row('vault')],
    })
    await loadInventory(h.deps, h.signal(), false)
    h.patchRows((rows) => confirmMove(rows, 'i1', 'hunter', false, 'rollback'))
    expect(where(h.state.rendered)).toBe('hunter')

    // Bungie 仍然报 vault。新快照整体替换观测，也重新算出渲染行。
    await loadInventory(h.deps, h.signal(), true)
    // 预期来自当前失效规则，不是假设：新快照里没有回滚标记，`applyOverlay` 也没东西可盖，
    // 所以界面回到 Bungie 说的位置。
    expect(where(h.state.observed)).toBe('vault')
    expect(where(h.state.rendered)).toBe('vault')
    expect(mark(h.state.rendered)).toBeUndefined()
  })

  it('a refresh does not resurrect the observation from the rendered side', async () => {
    const h = harness()
    api.fetchInventory.mockResolvedValue({
      account: steam, fetchedAt: Date.now(), total: 1, truncated: false, items: [row('vault')],
    })
    await loadInventory(h.deps, h.signal(), false)
    // 让渲染行偏离，然后问：刷新读的是谁。
    h.patchRows((rows) => confirmMove(rows, 'i1', 'hunter', false, 'rollback'))

    api.fetchInventory.mockResolvedValue({
      account: steam, fetchedAt: Date.now(), total: 1, truncated: false, items: [row('vault')],
    })
    await loadInventory(h.deps, h.signal(), true)
    // Injectable violation: feed `rendered` back into the next load and the panel starts
    // believing its own drawing.
    expect(where(h.state.observed)).toBe('vault')
    expect(where(h.state.rendered)).toBe('vault')
  })

  it('a load that arrives while an intention is pending keeps the observation raw', async () => {
    const h = harness()
    // 用户在加载前就拖过了：这次快照回来时 pending 是满的，`applyOverlay` 会真的改写行。
    h.pending.submit({ eventId: 'e1', instanceId: 'i1', action: 'move', target: 'hunter', from: 'vault', now: Date.now() })
    api.fetchInventory.mockResolvedValue({
      account: steam, fetchedAt: Date.now(), total: 1, truncated: false, items: [row('vault')],
    })
    await loadInventory(h.deps, h.signal(), false)
    // 渲染行是 hunter（意图），观测必须仍是 vault（事实）。
    // Injectable violation: pass `items` instead of `fresh.items` to `onSnapshot` —
    // 没有这条测试就抓不到，因为只有"有 pending 的加载"才会让两者真的不同。
    expect(where(h.state.rendered)).toBe('hunter')
    expect(where(h.state.observed)).toBe('vault')
  })
})

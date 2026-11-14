/**
 * 列表基线信任（方案 B）。
 *
 * 这里钉的是「授权」而不是「读取」：先建立成功基线，只授予一次；任何
 * generation 变化立即撤销，而且本页面生命周期内不再恢复。revoked 之后
 * 即使再来一次 ready，也不许重新授权——那正是重连后误删会话的来源。
 */
import { describe, expect, it } from 'vitest'
import { BaselineTrustTracker } from '../src/client/agent/baseline-trust'
import type { BaselineGenerationSource, BaselineListSource } from '../src/client/agent/baseline-trust'

/** 两个可变源 + 监听器计数。 */
function harness(initial: { phase: 'pending' | 'ready'; generation?: number }) {
  let phase = initial.phase
  let generation = initial.generation === undefined ? undefined : { id: initial.generation }
  const listListeners = new Set<() => void>()
  const generationListeners = new Set<() => void>()

  const list: BaselineListSource = {
    getSnapshot: () => ({ phase }),
    subscribe: (listener) => {
      listListeners.add(listener)
      return () => {
        listListeners.delete(listener)
      }
    },
  }
  const generationSource: BaselineGenerationSource = {
    getSnapshot: () => generation,
    subscribe: (listener) => {
      generationListeners.add(listener)
      return () => {
        generationListeners.delete(listener)
      }
    },
  }

  return {
    list,
    generation: generationSource,
    setPhase(next: 'pending' | 'ready'): void {
      phase = next
      for (const listener of [...listListeners]) listener()
    },
    setGeneration(next?: number): void {
      generation = next === undefined ? undefined : { id: next }
      for (const listener of [...generationListeners]) listener()
    },
    counts: () => ({ list: listListeners.size, generation: generationListeners.size }),
  }
}

describe('首次启动', () => {
  it('first valid generation is not a reconnect, and the first ready grants it', () => {
    const h = harness({ phase: 'pending' })
    const tracker = new BaselineTrustTracker({ list: h.list, generation: h.generation })

    expect(tracker.snapshot().trust).toEqual({ kind: 'none' })
    h.setGeneration(1)
    // 首次连接不是重连：仍然 none，但记录 G1。
    expect(tracker.snapshot()).toEqual({ trust: { kind: 'none' }, generation: 1 })

    h.setPhase('ready')
    expect(tracker.snapshot()).toEqual({
      trust: { kind: 'initial', generation: 1 },
      generation: 1,
    })
  })

  it('grants when the generation is already known at construction', () => {
    const h = harness({ phase: 'pending', generation: 1 })
    const tracker = new BaselineTrustTracker({ list: h.list, generation: h.generation })
    h.setPhase('ready')
    expect(tracker.snapshot().trust).toEqual({ kind: 'initial', generation: 1 })
  })

  it('does not grant when the list was already ready before subscribing', () => {
    const h = harness({ phase: 'ready', generation: 1 })
    const tracker = new BaselineTrustTracker({ list: h.list, generation: h.generation })
    // 无法证明这份 ready 属于当前 generation。
    expect(tracker.snapshot().trust).toEqual({ kind: 'none' })
    h.setPhase('ready')
    expect(tracker.snapshot().trust).toEqual({ kind: 'none' })
  })
})

describe('重连撤销', () => {
  it('revokes on generation loss and never grants again', () => {
    const h = harness({ phase: 'pending', generation: 1 })
    const tracker = new BaselineTrustTracker({ list: h.list, generation: h.generation })
    h.setPhase('ready')
    expect(tracker.snapshot().trust.kind).toBe('initial')

    h.setGeneration(undefined)
    expect(tracker.snapshot().trust).toEqual({ kind: 'revoked' })

    h.setGeneration(2)
    h.setPhase('ready')
    expect(tracker.snapshot().trust).toEqual({ kind: 'revoked' })
  })

  it('revokes when the generation changes before the first ready', () => {
    const h = harness({ phase: 'pending', generation: 1 })
    const tracker = new BaselineTrustTracker({ list: h.list, generation: h.generation })

    h.setGeneration(2)
    expect(tracker.snapshot().trust).toEqual({ kind: 'revoked' })

    h.setPhase('ready')
    expect(tracker.snapshot().trust).toEqual({ kind: 'revoked' })
  })

  it('revokes on G1 -> G2 after initial', () => {
    const h = harness({ phase: 'pending', generation: 1 })
    const tracker = new BaselineTrustTracker({ list: h.list, generation: h.generation })
    h.setPhase('ready')

    h.setGeneration(2)
    expect(tracker.snapshot().trust).toEqual({ kind: 'revoked' })
  })
})

describe('订阅与释放', () => {
  it('notifies on grant and revoke, and stops after unsubscribe', () => {
    const h = harness({ phase: 'pending', generation: 1 })
    const tracker = new BaselineTrustTracker({ list: h.list, generation: h.generation })

    let calls = 0
    const stop = tracker.subscribe(() => {
      calls += 1
    })
    h.setPhase('ready')
    expect(calls).toBe(1)
    stop()
    h.setGeneration(undefined)
    expect(calls).toBe(1)
  })

  it('dispose releases both subscriptions and makes later changes inert', () => {
    const h = harness({ phase: 'pending', generation: 1 })
    const tracker = new BaselineTrustTracker({ list: h.list, generation: h.generation })
    h.setPhase('ready')
    const before = tracker.snapshot()

    tracker.dispose()
    expect(h.counts()).toEqual({ list: 0, generation: 0 })

    h.setGeneration(undefined)
    h.setPhase('ready')
    expect(tracker.snapshot()).toEqual(before)
    expect(tracker.subscribe(() => undefined)()).toBeUndefined()
  })
})

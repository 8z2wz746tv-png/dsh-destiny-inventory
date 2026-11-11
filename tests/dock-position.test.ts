/**
 * 悬浮窗位置的边界。
 *
 * 这里的失败方式都是"窗口跑到屏幕外，用户找不回来"——一次性、不可逆，
 * 所以每条规则都要有一条越界的反例在测。
 */
import { describe, expect, it } from 'vitest'
import { DOCK_SIZE, clampDock, defaultDock, loadDock, refit, saveDock } from '../src/client/agent/dock-position'

const view = { width: 1280, height: 800 }
const full = DOCK_SIZE.full

describe('夹回视口', () => {
  it('keeps a legal position untouched', () => {
    expect(clampDock({ x: 100, y: 200 }, full, view)).toEqual({ x: 100, y: 200 })
  })

  it('pulls a window dragged past the right edge back inside', () => {
    // Injectable violation: drop the upper bound and the window becomes
    // permanently unreachable off-screen.
    expect(clampDock({ x: 9999, y: 200 }, full, view)).toEqual({ x: 1280 - full.width, y: 200 })
  })

  it('pulls a window dragged past the bottom edge back inside', () => {
    expect(clampDock({ x: 100, y: 9999 }, full, view)).toEqual({ x: 100, y: 800 - full.height })
  })

  it('refuses negative coordinates', () => {
    expect(clampDock({ x: -50, y: -50 }, full, view)).toEqual({ x: 0, y: 0 })
  })

  it('pins to the corner when the viewport is smaller than the window', () => {
    // 浏览器窗口被拉到很窄时没有好答案，但起点必须固定、必须能被找到。
    expect(clampDock({ x: 100, y: 100 }, full, { width: 200, height: 100 })).toEqual({ x: 0, y: 0 })
  })

  it('is idempotent', () => {
    const once = clampDock({ x: 9999, y: -20 }, full, view)
    expect(clampDock(once, full, view)).toEqual(once)
  })
})

describe('视口变小之后', () => {
  it('refits a stored position that is now out of bounds', () => {
    const stored = { x: 900, y: 600, collapsed: false }
    const small = { width: 800, height: 600 }
    const after = refit(stored, small)
    // Injectable violation: skip the refit and the window sits entirely outside
    // the shrunken viewport with no way to grab it.
    expect(after.x).toBeLessThanOrEqual(small.width - full.width)
    expect(after.y).toBeLessThanOrEqual(small.height - full.height)
  })

  it('uses the mini size when collapsed', () => {
    const after = refit({ x: 9999, y: 9999, collapsed: true }, view)
    expect(after).toEqual({ x: view.width - DOCK_SIZE.mini.width, y: view.height - DOCK_SIZE.mini.height, collapsed: true })
  })
})

describe('默认位置', () => {
  it('sits in the bottom-right with a margin', () => {
    expect(defaultDock(full, view)).toEqual({ x: 1280 - full.width - 24, y: 800 - full.height - 24 })
  })
})

describe('存储', () => {
  const store = (raw: string) => ({ getItem: () => raw })

  it('round-trips', () => {
    const saved: Record<string, string> = {}
    saveDock({ setItem: (k, v) => void (saved[k] = v) }, { x: 10, y: 20, collapsed: true })
    expect(loadDock({ getItem: (k) => saved[k] ?? null })).toEqual({ x: 10, y: 20, collapsed: true })
  })

  it('treats junk as nothing stored', () => {
    // 隐私模式、手改坏了、旧版本字段不同——一律当作没存过，用默认位置。
    expect(loadDock(store('not json'))).toBeNull()
    expect(loadDock(store('{"x":"nope"}'))).toBeNull()
    expect(loadDock(store(''))).toBeNull()
  })

  it('tolerates a missing store', () => {
    expect(loadDock(null)).toBeNull()
    expect(() => saveDock(null, { x: 0, y: 0, collapsed: false })).not.toThrow()
  })

  it('swallows a throw from the store', () => {
    expect(loadDock({ getItem: () => { throw new Error('denied') } })).toBeNull()
    expect(() => saveDock({ setItem: () => { throw new Error('quota') } }, { x: 0, y: 0, collapsed: false })).not.toThrow()
  })
})

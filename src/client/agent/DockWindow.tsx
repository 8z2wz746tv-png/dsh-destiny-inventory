/**
 * 悬浮窗的壳子。
 *
 * **A2 只有壳**：开合、拖动、位置持久化、迷你/完整两态。它不创建会话、
 * 不持有 `SessionReference`、不调任何 `ctx.sessions` 方法——会话是 A3 的事。
 *
 * 位置一律先过 `clampDock`：拖动时限制、视口变化时重算、读回来时也校验。
 * 窗口跑到屏幕外是不可逆的，所以这三处都不能省。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { DOCK_SIZE, clampDock, defaultDock, loadDock, refit, saveDock } from './dock-position'
import { DockChat } from './DockChat'
import type { SessionDeps } from './session-adapter'
import type { BaselineTrustSource } from './baseline-trust'
import type { DockState } from './dock-position'

/** 拖动时不要每帧都写 localStorage。 */
const SAVE_DELAY_MS = 250

/** 取浏览器视口；没有 window 时给一个保守值（SSR 与测试）。 */
function viewport(): { width: number; height: number } {
  if (typeof window === 'undefined') return { width: 1280, height: 800 }
  return { width: window.innerWidth, height: window.innerHeight }
}

/** 取 localStorage；隐私模式下访问本身就会抛。 */
function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** 初始状态：存过的就恢复并重新约束，没存过就摆右下角。 */
function initialState(): DockState {
  const view = viewport()
  const stored = loadDock(storage())
  if (stored === null) return { ...defaultDock(DOCK_SIZE.full, view), collapsed: false }
  return refit(stored, view)
}

export function DockWindow({
  sessions = null,
  routePath = '',
  trust,
}: {
  sessions?: SessionDeps | null
  routePath?: string
  trust?: BaselineTrustSource
} = {}): ReactElement {
  const [state, setState] = useState<DockState>(initialState)
  /** 拖动中的起点，用 ref 避免每次 move 都重渲染。 */
  const drag = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const size = DOCK_SIZE[state.collapsed ? 'mini' : 'full']

  /** 位置变了就延迟落盘，拖动过程中不写。 */
  const persist = useCallback((next: DockState) => {
    if (saveTimer.current !== null) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveDock(storage(), next)
      saveTimer.current = null
    }, SAVE_DELAY_MS)
  }, [])

  // 视口变化：窗口自己没动，但原来合法的位置现在可能越界。
  useEffect(() => {
    const onResize = () => {
      setState((current) => {
        const next = refit(current, viewport())
        if (next.x === current.x && next.y === current.y) return current
        persist(next)
        return next
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [persist])

  // 卸下时清掉待写的定时器，别让它对着已卸载的组件跑。
  useEffect(() => () => {
    if (saveTimer.current !== null) clearTimeout(saveTimer.current)
  }, [])

  /** 拖动开始：只认主键，抓住窗口任意位置。 */
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: state.x,
      originY: state.y,
    }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = drag.current
    if (active === null || active.pointerId !== event.pointerId) return
    const moved = {
      x: active.originX + (event.clientX - active.startX),
      y: active.originY + (event.clientY - active.startY),
    }
    setState((current) => ({ ...current, ...clampDock(moved, size, viewport()) }))
  }

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current === null) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setState((current) => {
      persist(current)
      return current
    })
  }

  const toggle = () => {
    setState((current) => {
      // 换尺寸之后位置要重新约束：迷你变完整时右边缘可能出界。
      const collapsed = !current.collapsed
      const next = { ...refit({ ...current, collapsed }, viewport()) }
      persist(next)
      return next
    })
  }

  return (
    <div
      className={`inventory-dock${state.collapsed ? ' is-mini' : ''}`}
      style={{ left: state.x, top: state.y, width: size.width, height: size.height }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      data-destiny-dock=""
    >
      <div className="inventory-dock__bar">
        <span className="inventory-dock__dot" title="Agent 未接入（A3）" aria-hidden />
        {!state.collapsed && <span className="inventory-dock__title">命运助手</span>}
        <button
          type="button"
          className="inventory-dock__toggle"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={toggle}
          title={state.collapsed ? '展开' : '收起'}
          aria-label={state.collapsed ? '展开' : '收起'}
        >
          {state.collapsed ? '▢' : '—'}
        </button>
      </div>
      {!state.collapsed && (
        <div className="inventory-dock__body">
          <DockChat sessions={sessions} routePath={routePath} trust={trust} />
        </div>
      )}
    </div>
  )
}

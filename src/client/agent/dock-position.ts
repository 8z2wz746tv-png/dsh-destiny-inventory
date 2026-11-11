/**
 * 悬浮窗的位置：算、约束、存。
 *
 * 全是纯函数，**不碰 DOM**。拖动是最容易写成"能跑但边界全错"的那类代码，
 * 所以位置规则单独一块，测试能直接喂数字。
 */

/** 左上角坐标。 */
export interface DockPoint {
  x: number
  y: number
}

/** 窗口自身的尺寸。 */
export interface DockSize {
  width: number
  height: number
}

/** 视口尺寸。 */
export interface DockViewport {
  width: number
  height: number
}

/** 存下来的全部状态。 */
export interface DockState extends DockPoint {
  collapsed: boolean
}

/** 完整态与迷你态的尺寸。迷你只留图标，不遮格子。 */
export const DOCK_SIZE: Record<'full' | 'mini', DockSize> = {
  full: { width: 360, height: 460 },
  mini: { width: 56, height: 56 },
}

/**
 * 把窗口夹回视口内。
 *
 * **必须完整可见**，不是"露出一个角就行"：用户把窗口拖出屏幕边缘之后，
 * 唯一能抓回来的地方就是它自己——只露一条边等于找不回来。
 *
 * 视口比窗口还小时（比如浏览器窗口被拉到很窄），贴左上角，允许溢出：
 * 那种情况下没有更好的答案，但至少窗口起点固定在能被发现的位置。
 *
 * @param point - 想要的位置。
 * @param size - 窗口尺寸。
 * @param viewport - 可用区域（通常是 `window.innerWidth/innerHeight`）。
 * @returns 一个保证落在视口内的坐标。
 */
export function clampDock(point: DockPoint, size: DockSize, viewport: DockViewport): DockPoint {
  const maxX = viewport.width - size.width
  const maxY = viewport.height - size.height
  return {
    x: maxX <= 0 ? 0 : Math.min(Math.max(point.x, 0), maxX),
    y: maxY <= 0 ? 0 : Math.min(Math.max(point.y, 0), maxY),
  }
}

/** 默认位置：右下角，离边 24px。 */
export function defaultDock(size: DockSize, viewport: DockViewport): DockPoint {
  return clampDock({ x: viewport.width - size.width - 24, y: viewport.height - size.height - 24 }, size, viewport)
}

/**
 * 视口变化后重新约束。
 *
 * 这是"拖到屏幕外找不回"的另一半：窗口本身没动，但浏览器变小了，
 * 原来合法的位置现在越界。尺寸一变就得再过一遍 `clampDock`。
 *
 * @param state - 存下来的状态。
 * @param viewport - 新的视口尺寸。
 * @returns 约束后的坐标；`collapsed` 原样带回。
 */
export function refit(state: DockState, viewport: DockViewport): DockState {
  const size = DOCK_SIZE[state.collapsed ? 'mini' : 'full']
  return { ...clampDock(state, size, viewport), collapsed: state.collapsed }
}

/** 存储键。**不带账号**——位置是这台机器的偏好，不是某个守护者的。 */
const STORAGE_KEY = 'dsh-destiny-dock'

/**
 * 读回存的位置。
 *
 * 任何异常都当作"没存过"：隐私模式下 `localStorage` 会直接抛，
 * 而丢一个位置偏好远没有让整个面板起不来严重。
 *
 * @param store - 通常传 `localStorage`；测试里传假的。
 * @returns 解析成功才返回，否则 `null`。
 */
export function loadDock(store: Pick<Storage, 'getItem'> | null): DockState | null {
  if (store === null) return null
  try {
    const raw = store.getItem(STORAGE_KEY)
    if (raw === null || raw === '') return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { x, y, collapsed } = parsed as Record<string, unknown>
    if (typeof x !== 'number' || typeof y !== 'number') return null
    return { x, y, collapsed: collapsed === true }
  } catch {
    return null
  }
}

/**
 * 写回位置。
 * @param store - 同 `loadDock`。
 * @param state - 要存的状态。
 */
export function saveDock(store: Pick<Storage, 'setItem'> | null, state: DockState): void {
  if (store === null) return
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // 配额满或隐私模式：位置偏好丢了不影响用。
  }
}

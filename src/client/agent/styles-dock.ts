/**
 * 悬浮窗样式。
 *
 * 内联成模板字符串，理由和 `styles-detail.ts` 一样：客户端半没有构建期的 CSS 管线。
 * `position: fixed` + 视口坐标，所以它**不参与库存面板的布局**——这是 A2 的验收项。
 */
const STYLE_ID = 'dsh-destiny-dock-style'

const DOCK_STYLES = `
.inventory-dock {
  position: fixed;
  z-index: 40;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, .14);
  background: rgba(18, 20, 24, .96);
  box-shadow: 0 12px 32px rgba(0, 0, 0, .45);
  color: #e8eaed;
  font-size: 12px;
  overflow: hidden;
  touch-action: none;
  cursor: grab;
}
.inventory-dock:active { cursor: grabbing; }
.inventory-dock.is-mini {
  border-radius: 50%;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.inventory-dock__bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, .05);
  cursor: inherit;
}
.inventory-dock.is-mini .inventory-dock__bar { padding: 0; background: none; }
.inventory-dock__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #7bd88f;
  flex: none;
}
.inventory-dock__title { flex: 1 1 auto; font-weight: 600; }
.inventory-dock__toggle {
  flex: none;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  opacity: .7;
  padding: 0 2px;
}
.inventory-dock__toggle:hover { opacity: 1; }
.inventory-dock__body { flex: 1 1 auto; padding: 10px; overflow: auto; cursor: default; }
.inventory-dock__hint { margin: 0; opacity: .5; line-height: 1.5; }
`

/**
 * 装进文档，返回卸载函数。
 *
 * 与 `styles.ts` 的 `ensureStyles` 同构但**独立 id**：两条样式生命周期分开，
 * 卸掉悬浮窗不该影响面板样式，反之亦然。
 */
export function ensureDockStyles(): () => void {
  const existing = document.getElementById(STYLE_ID)
  if (existing !== null) return () => undefined
  const element = document.createElement('style')
  element.id = STYLE_ID
  element.textContent = DOCK_STYLES
  document.head.appendChild(element)
  return () => element.remove()
}

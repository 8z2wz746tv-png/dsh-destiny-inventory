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
.inventory-dock__body { flex: 1 1 auto; padding: 10px; overflow: hidden; cursor: default; min-height: 0; }
.inventory-dock__chat { display: flex; flex-direction: column; height: 100%; gap: 8px; }
.inventory-dock__log { flex: 1 1 auto; overflow: auto; display: flex; flex-direction: column; gap: 6px; }
.inventory-dock__hint { margin: 0; opacity: .5; line-height: 1.5; }
.inventory-dock__bubble {
  padding: 7px 9px;
  border-radius: 8px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  max-width: 92%;
}
.inventory-dock__bubble.is-user { align-self: flex-end; background: rgba(90, 150, 255, .22); }
.inventory-dock__bubble.is-assistant { align-self: flex-start; background: rgba(255, 255, 255, .07); }
.inventory-dock__bubble.is-streaming { opacity: .82; border-left: 2px solid rgba(240, 217, 138, .6); }
.inventory-dock__bubble.is-error { align-self: stretch; background: rgba(255, 90, 90, .16); color: #ffb3b3; }
.inventory-dock__tool {
  border: 1px solid rgba(255, 255, 255, .12);
  border-radius: 6px;
  padding: 6px 8px;
  background: rgba(255, 255, 255, .03);
}
.inventory-dock__tool.is-failed { border-color: rgba(255, 90, 90, .45); }
.inventory-dock__tool-head { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; }
.inventory-dock__tool-name { font-weight: 600; opacity: .9; }
.inventory-dock__tool-status { opacity: .6; }
.inventory-dock__tool.is-pending .inventory-dock__tool-status { color: #f0d98a; }
.inventory-dock__tool-result {
  margin: 6px 0 0;
  max-height: 90px;
  overflow: auto;
  font-size: 10px;
  opacity: .7;
  white-space: pre-wrap;
}
.inventory-dock__composer { display: flex; gap: 6px; flex: none; }
.inventory-dock__input {
  flex: 1 1 auto;
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, .16);
  border-radius: 6px;
  background: rgba(0, 0, 0, .3);
  color: inherit;
  font: inherit;
  padding: 6px 8px;
}
.inventory-dock__send {
  flex: none;
  border: 1px solid rgba(255, 255, 255, .18);
  border-radius: 6px;
  background: rgba(255, 255, 255, .08);
  color: inherit;
  font: inherit;
  padding: 6px 10px;
  cursor: pointer;
}
.inventory-dock__send:disabled { opacity: .4; cursor: default; }
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

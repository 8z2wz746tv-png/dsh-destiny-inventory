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
.inventory-dock__tool-unparsed {
  margin: 6px 0 0;
  font-size: 10px;
  line-height: 1.45;
  color: #e6a0a0;
}
.inventory-dock__tool-result {
  margin: 6px 0 0;
  max-height: 90px;
  overflow: auto;
  font-size: 10px;
  opacity: .7;
  white-space: pre-wrap;
}
.inventory-dock__quick { display: flex; flex-wrap: wrap; gap: 4px; flex: none; }
.inventory-dock__chip {
  border: 1px solid rgba(255, 255, 255, .14);
  border-radius: 999px;
  background: rgba(255, 255, 255, .04);
  color: inherit;
  font: inherit;
  font-size: 11px;
  padding: 3px 8px;
  cursor: pointer;
}
.inventory-dock__chip:hover { background: rgba(255, 255, 255, .1); }
.inventory-dock__chip:disabled { opacity: .4; cursor: default; }
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

/* 武器分析卡：只读模型，不承载解析逻辑。 */
.inventory-dock__weapon-card {
  margin-top: 6px;
  border: 1px solid rgba(255, 255, 255, .12);
  border-radius: 6px;
  background: rgba(0, 0, 0, .22);
  padding: 8px;
  display: grid;
  gap: 8px;
  font-size: 11px;
  line-height: 1.45;
}
.inventory-dock__weapon-head { display: flex; gap: 9px; align-items: center; }
.inventory-dock__weapon-icon {
  width: 52px;
  height: 52px;
  object-fit: cover;
  border-radius: 3px;
  background: #1a2026;
  border: 1px solid rgba(255, 255, 255, .18);
  flex: none;
}
.inventory-dock__weapon-icon.is-empty { display: block; }
.inventory-dock__weapon-identity { min-width: 0; display: grid; gap: 1px; }
.inventory-dock__weapon-kicker,
.inventory-dock__weapon-frame,
.inventory-dock__weapon-en { font-size: 9px; opacity: .68; }
.inventory-dock__weapon-en { font-family: ui-monospace, Consolas, monospace; opacity: .55; overflow-wrap: anywhere; }
.inventory-dock__weapon-name { font-size: 14px; line-height: 1.2; overflow-wrap: anywhere; }
.inventory-dock__weapon-source-tag {
  justify-self: start;
  border: 1px solid rgba(232, 197, 107, .35);
  border-radius: 999px;
  padding: 0 5px;
  font-size: 9px;
  line-height: 1.5;
  color: #e8c56b;
}
.inventory-dock__weapon-source-tag.is-analyze { border-color: rgba(255, 255, 255, .18); color: #b9c0c6; }
.inventory-dock__weapon-scope-note { margin: 0; font-size: 9px; line-height: 1.5; color: #e6c791; }
.inventory-dock__weapon-summary { margin: 0; font-size: 10px; opacity: .78; }
.inventory-dock__weapon-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px 8px; }
.inventory-dock__weapon-stat {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  font-size: 10px;
  padding: 2px 0;
  border-bottom: 1px solid rgba(255, 255, 255, .06);
}
.inventory-dock__weapon-stat span { opacity: .7; }
.inventory-dock__weapon-stat strong { font-variant-numeric: tabular-nums; }
.inventory-dock__weapon-section { display: grid; gap: 4px; }
.inventory-dock__weapon-section h4 { margin: 0; font-size: 10px; color: #c4c9cd; font-weight: 600; }
.inventory-dock__weapon-perks { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.inventory-dock__weapon-perks li { display: flex; gap: 6px; font-size: 10px; }
.inventory-dock__weapon-perks li span { opacity: .6; min-width: 42px; }
.inventory-dock__weapon-muted { margin: 0; font-size: 10px; opacity: .6; }
.inventory-dock__weapon-copy {
  display: grid;
  gap: 2px;
  width: 100%;
  text-align: left;
  border: 1px solid rgba(255, 255, 255, .1);
  border-radius: 4px;
  background: rgba(255, 255, 255, .03);
  color: inherit;
  font: inherit;
  padding: 5px 6px;
  cursor: pointer;
}
.inventory-dock__weapon-copy:hover { background: rgba(255, 255, 255, .08); }
.inventory-dock__weapon-copy.is-selected { border-color: rgba(232, 197, 107, .55); }
.inventory-dock__weapon-copy-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 5px; font-size: 10px; }
.inventory-dock__weapon-copy-line em { font-style: normal; font-size: 9px; opacity: .7; }
.inventory-dock__weapon-copy-perks { font-size: 9px; opacity: .72; overflow-wrap: anywhere; }
.inventory-dock__weapon-copy-score { font-size: 9px; opacity: .55; }
.inventory-dock__weapon-error { margin: 0; color: #e6a0a0; font-size: 10px; }
.inventory-dock__weapon-ok { margin: 0; color: #9fd6a8; font-size: 10px; }
.inventory-dock__weapon-hints { display: grid; gap: 3px; font-size: 9px; }
.inventory-dock__weapon-hints > div { display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 6px; }
.inventory-dock__weapon-hints span:first-child { opacity: .6; }
.inventory-dock__weapon-hints span:last-child { overflow-wrap: anywhere; }
.inventory-dock__weapon-ref { margin: 0; font-size: 9px; opacity: .8; }
.inventory-dock__weapon-source { opacity: .6; }
.inventory-dock__weapon-warnings {
  border-top: 1px solid rgba(230, 199, 145, .2);
  padding-top: 5px;
  color: #e6c791;
  font-size: 9px;
}
.inventory-dock__weapon-warnings strong { font-size: 10px; }
.inventory-dock__weapon-warnings ul { margin: 3px 0 0; padding-left: 16px; }
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

/**
 * Panel stylesheet, injected once per client entry.
 *
 * Geometry follows DIM (src/app/inventory-page/Stores.scss): each row is one
 * item type across every store — characters at a fixed width, the vault taking
 * the rest — and each cell packs items with
 * `repeat(auto-fill, var(--item-size))` (src/app/inventory-page/StoreBucket.scss).
 *
 * All chrome uses --dsw-alias-* theme tokens. The single exception is item
 * rarity: gold/purple/blue are what make a wall of icons readable, they belong
 * to the artwork layer, and they are named once here so nothing else hardcodes
 * a colour.
 */
import { INVENTORY_CSS } from './legacy/inventoryCss'

const CSS = `
.dsh-destiny-panel {
  display: flex;
  flex-direction: column;
  block-size: 100%;
  min-block-size: 0;
  padding: 12px 16px 0;
  gap: 10px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-base);
  font-size: 13px;
  overflow: hidden;
  --dsh-item-size: 72px;
  --dsh-label-width: 92px;
  --dsh-rarity-exotic-border: #ceb03d;
  --dsh-rarity-exotic-wash: rgba(206, 176, 61, 0.16);
  --dsh-rarity-legendary-border: #7d5aa6;
  --dsh-rarity-legendary-wash: rgba(93, 60, 122, 0.34);
  --dsh-rarity-rare-border: #3f7ea8;
  --dsh-rarity-rare-wash: rgba(56, 106, 143, 0.3);
}
.dsh-destiny-panel__state { color: var(--dsw-alias-label-secondary); }
.dsh-destiny-panel__state--error { color: var(--dsw-alias-state-error-primary); white-space: pre-wrap; }

.dsh-destiny-stores { display: flex; gap: 8px; flex-wrap: wrap; }
.dsh-destiny-store {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-inline-size: 150px;
  padding: 7px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2);
  overflow: hidden;
}
.dsh-destiny-store__emblem { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; object-fit: cover; opacity: 0.45; }
.dsh-destiny-store__wash { position: absolute; inset: 0; background: linear-gradient(90deg, var(--dsw-alias-bg-base) 10%, transparent 72%); }
.dsh-destiny-store__body { position: relative; display: flex; flex-direction: column; gap: 2px; }
.dsh-destiny-store__label { font-weight: 600; }
.dsh-destiny-store__stats { font-size: 11px; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
.dsh-destiny-store__count { position: relative; margin-inline-start: auto; font-size: 11px; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }

.dsh-destiny-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.dsh-destiny-toolbar__search,
.dsh-destiny-toolbar__select {
  font: inherit;
  color: inherit;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 5px 8px;
}
.dsh-destiny-toolbar__search { inline-size: 168px; }
.dsh-destiny-toolbar__search:focus-visible,
.dsh-destiny-toolbar__select:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }
.dsh-destiny-toolbar__refresh {
  font: inherit; color: inherit;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 5px 12px;
  cursor: pointer;
}
.dsh-destiny-toolbar__refresh:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-destiny-toolbar__refresh:disabled { opacity: 0.5; cursor: default; }
.dsh-destiny-toolbar__count { margin-inline-start: auto; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }

.dsh-destiny-segmented { display: flex; gap: 2px; padding: 2px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2); }
.dsh-destiny-segmented__item {
  font: inherit;
  color: var(--dsw-alias-label-secondary);
  background: none;
  border: 0;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
}
.dsh-destiny-segmented__item:hover { color: var(--dsw-alias-label-primary); }
.dsh-destiny-segmented__item.is-active { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-3); }

.dsh-destiny-body { flex: 1; min-block-size: 0; overflow: auto; padding-block-end: 16px; }
.dsh-destiny-section + .dsh-destiny-section { margin-block-start: 20px; }
.dsh-destiny-section__title {
  position: sticky;
  inset-block-start: 0;
  z-index: 2;
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 0 8px;
  padding: 6px 0 5px;
  font-size: 14px;
  font-weight: 600;
  background: var(--dsw-alias-bg-base);
  border-block-end: 1px solid var(--dsw-alias-border-l3);
}
.dsh-destiny-section__count { font-size: 11px; font-weight: 400; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }

.dsh-destiny-row {
  display: grid;
  grid-template-columns: var(--dsh-label-width) repeat(3, minmax(0, 196px)) minmax(0, 1fr);
  gap: 6px;
  align-items: start;
  padding-block: 3px;
  border-block-start: 1px solid var(--dsw-alias-border-l1);
}
.dsh-destiny-row.is-full { grid-template-columns: var(--dsh-label-width) minmax(0, 1fr); }
.dsh-destiny-row__label {
  margin: 0;
  padding-block-start: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--dsw-alias-label-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dsh-destiny-cell {
  display: grid;
  grid-template-columns: repeat(auto-fill, var(--dsh-item-size));
  gap: 5px;
  align-content: start;
  min-block-size: calc(var(--dsh-item-size) + 4px);
  border-radius: 8px;
}
.dsh-destiny-cell.is-over { outline: 2px dashed var(--dsw-alias-brand-primary); outline-offset: 2px; background: var(--dsw-alias-interactive-bg-hover); }

.dsh-destiny-tile {
  position: relative;
  inline-size: var(--dsh-item-size);
  block-size: var(--dsh-item-size);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-2);
  overflow: hidden;
  cursor: grab;
}
.dsh-destiny-tile:hover { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: -2px; }
.dsh-destiny-tile:active { cursor: grabbing; }
.dsh-destiny-tile.r-exotic { border-color: var(--dsh-rarity-exotic-border); background: var(--dsh-rarity-exotic-wash); }
.dsh-destiny-tile.r-legendary { border-color: var(--dsh-rarity-legendary-border); background: var(--dsh-rarity-legendary-wash); }
.dsh-destiny-tile.r-rare { border-color: var(--dsh-rarity-rare-border); background: var(--dsh-rarity-rare-wash); }
.dsh-destiny-tile__icon { inline-size: 100%; block-size: 100%; display: block; object-fit: cover; }
.dsh-destiny-tile__power {
  position: absolute;
  inset-block-end: 0;
  inset-inline-start: 0;
  padding: 0 4px;
  font-size: 11px;
  line-height: 15px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.6));
  border-start-end-radius: 5px;
  font-variant-numeric: tabular-nums;
}
.dsh-destiny-tile__lock { position: absolute; inset-block-start: 1px; inset-inline-start: 3px; font-size: 10px; line-height: 1; }
.dsh-destiny-tile__worn { position: absolute; inset-block-start: 2px; inset-inline-end: 2px; inline-size: 7px; block-size: 7px; border-radius: 50%; background: var(--dsw-alias-brand-primary); }

.dsh-destiny-receipts { display: flex; flex-direction: column; gap: 4px; padding-block: 8px; border-block-start: 1px solid var(--dsw-alias-border-l2); }
.dsh-destiny-receipt { display: flex; gap: 8px; align-items: baseline; font-size: 12px; }
.dsh-destiny-receipt.is-error { color: var(--dsw-alias-state-error-primary); }
.dsh-destiny-receipt__text { font-weight: 600; white-space: nowrap; }
.dsh-destiny-receipt__detail { color: var(--dsw-alias-label-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.dsh-destiny-detail__scrim { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 32px; background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.45)); }
.dsh-destiny-detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
  inline-size: min(1180px, 100%);
  max-block-size: 84vh;
  overflow: auto;
  padding: 18px 20px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-alias-bg-base);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
}
.dsh-destiny-detail__head { display: flex; gap: 14px; align-items: flex-start; }
.dsh-destiny-detail__icon { inline-size: 56px; block-size: 56px; border-radius: 8px; object-fit: cover; flex: none; background: var(--dsw-alias-bg-layer-2); }
.dsh-destiny-detail__titles { display: flex; flex-direction: column; gap: 3px; min-inline-size: 0; }
.dsh-destiny-detail__name { margin: 0; font-size: 17px; font-weight: 600; }
.dsh-destiny-detail__facts,
.dsh-destiny-detail__power { margin: 0; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.dsh-destiny-detail__close { margin-inline-start: auto; font: inherit; color: var(--dsw-alias-label-tertiary); background: none; border: 0; cursor: pointer; padding: 2px 6px; border-radius: 6px; }
.dsh-destiny-detail__close:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsh-destiny-detail__roll { margin: 0; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-destiny-detail__body { display: flex; gap: 8px; align-items: flex-start; overflow-x: auto; padding-block-end: 6px; }
.dsh-destiny-detail__actions { display: flex; gap: 8px; padding-block-start: 6px; border-block-start: 1px solid var(--dsw-alias-border-l2); }
.dsh-destiny-detail__actions button {
  font: inherit; color: inherit;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 6px 14px;
  cursor: pointer;
}
.dsh-destiny-detail__actions button:hover { background: var(--dsw-alias-interactive-bg-hover); }

.dsh-destiny-column { display: flex; flex-direction: column; gap: 5px; inline-size: 148px; flex: 0 0 auto; }
.dsh-destiny-column__label { margin: 0; font-size: 10px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--dsw-alias-label-tertiary); }
.dsh-destiny-column__cells { display: flex; flex-direction: column; gap: 3px; }
.dsh-destiny-perk {
  display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
  padding: 4px 6px;
  border-radius: 7px;
  border: 1px solid transparent;
  background: var(--dsw-alias-bg-layer-2);
  opacity: 0.5;
}
.dsh-destiny-perk.is-selected { opacity: 1; border-color: var(--dsw-alias-brand-primary); background: var(--dsw-alias-bg-layer-3); }
.dsh-destiny-perk__icon { inline-size: 20px; block-size: 20px; border-radius: 4px; flex: none; }
.dsh-destiny-perk__blank { inline-size: 20px; block-size: 20px; flex: none; }
.dsh-destiny-perk__name { font-size: 12px; line-height: 1.2; }
.dsh-destiny-perk__stats { inline-size: 100%; font-size: 10px; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }

.dsh-destiny-confirm {
  display: flex; flex-direction: column; gap: 8px;
  inline-size: min(420px, 100%);
  padding: 18px 20px;
  border: 1px solid var(--dsw-alias-border-l3);
  border-radius: 12px;
  background: var(--dsw-alias-bg-base);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
}
.dsh-destiny-confirm__title { margin: 0; font-size: 15px; font-weight: 600; }
.dsh-destiny-confirm__body { margin: 0; }
.dsh-destiny-confirm__note { margin: 0; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.dsh-destiny-confirm__actions { display: flex; justify-content: flex-end; gap: 8px; padding-block-start: 4px; }
.dsh-destiny-confirm__actions button {
  font: inherit; color: inherit;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 6px 14px;
  cursor: pointer;
}
.dsh-destiny-confirm__actions button.is-primary {
  background: var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary));
  border-color: transparent;
  color: var(--dsw-alias-label-primary-inverted, #fff);
}
`

/**
 * 老页面的主题桥。
 *
 * `inventory.css` 是按老项目 `styles/tokens.css` 那套变量名写的（--bg / --surface-*
 * / --accent…）。这里把这套名字接到宿主的 `--dsw-alias-*` 上，于是面板跟着 DSH
 * 的主题走、亮暗自动，而不是把老项目那套深色皮肤整个搬进来（红线：样式只用
 * 主题 token）。稀有度/元素/伤害类型那些本色不在此列——它们属于内容色，本来就在
 * inventory.css 里写死。
 */
const LEGACY_THEME = `
.dsh-destiny-legacy {
  --bg: var(--dsw-alias-bg-base);
  --bg-raised: var(--dsw-alias-bg-layer-1);
  --surface-1: var(--dsw-alias-bg-layer-1);
  --surface-2: var(--dsw-alias-bg-layer-2);
  --surface-3: var(--dsw-alias-bg-layer-3);
  --panel: var(--dsw-alias-bg-layer-2);
  --panel-hover: var(--dsw-alias-interactive-bg-hover);
  --panel-active: var(--dsw-alias-bg-layer-3);
  --line: var(--dsw-alias-border-l2);
  --line-soft: var(--dsw-alias-border-l1);
  --line-strong: var(--dsw-alias-border-l4);
  --text: var(--dsw-alias-label-primary);
  --text-strong: var(--dsw-alias-label-primary);
  --muted: var(--dsw-alias-label-secondary);
  --muted-strong: var(--dsw-alias-label-secondary);
  --accent: var(--dsw-alias-brand-primary);
  --accent-hover: var(--dsw-alias-brand-primary);
  --accent-soft: var(--dsw-alias-interactive-bg-hover);
  --accent-border: var(--dsw-alias-border-l4);
  --accent-ink: var(--dsw-alias-label-primary-inverted, #fff);
  --cool: var(--dsw-alias-link);
  --success: var(--dsw-alias-state-success-primary);
  --warning: var(--dsw-alias-state-warn-primary);
  --danger: var(--dsw-alias-state-error-primary);
  --focus: var(--dsw-alias-brand-primary);
  block-size: 100%;
  min-block-size: 0;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 13px;
}
`

/** Stable id so a second registration reuses the first stylesheet. */
const STYLE_ID = 'dsh-destiny-inventory-styles'

/** Insert the panel stylesheet once and return its disposer. */
export function ensureStyles(): () => void {
  const existing = document.getElementById(STYLE_ID)
  if (existing !== null) return () => undefined
  const element = document.createElement('style')
  element.id = STYLE_ID
  element.textContent = CSS + LEGACY_THEME + INVENTORY_CSS
  document.head.appendChild(element)
  return () => element.remove()
}

/**
 * Panel stylesheet, injected once per client entry.
 *
 * All chrome is coloured with `--dsw-alias-*` theme tokens, so the panel follows
 * the host theme instead of looking like a foreign surface (guide red line 1).
 * The one exception is item rarity: gold, purple and blue are what make a wall
 * of 1295 icons readable at a glance, they belong to the artwork layer rather
 * than to the surrounding chrome, and they are named once in `--dsh-rarity-*`
 * below so nothing else in this file hardcodes a colour.
 *
 * Layout rule: the panel never scrolls, the body does. Header strip, toolbar and
 * section titles stay put.
 */
const CSS = `
.dsh-destiny-panel {
  display: flex;
  flex-direction: column;
  block-size: 100%;
  min-block-size: 0;
  padding: 14px 18px 0;
  gap: 10px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-base);
  font-size: 13px;
  overflow: hidden;

  --dsh-rarity-exotic-border: #ceb03d;
  --dsh-rarity-exotic-wash: rgba(206, 176, 61, 0.16);
  --dsh-rarity-legendary-border: #7d5aa6;
  --dsh-rarity-legendary-wash: rgba(93, 60, 122, 0.34);
  --dsh-rarity-rare-border: #3f7ea8;
  --dsh-rarity-rare-wash: rgba(56, 106, 143, 0.3);
}
.dsh-destiny-panel__state {
  color: var(--dsw-alias-label-secondary);
}
.dsh-destiny-panel__state--error {
  color: var(--dsw-alias-state-error-primary);
  white-space: pre-wrap;
}

.dsh-destiny-stores {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.dsh-destiny-store {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-inline-size: 156px;
  padding: 8px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2);
  color: inherit;
  font: inherit;
  cursor: pointer;
  overflow: hidden;
  text-align: start;
}
.dsh-destiny-store:hover {
  border-color: var(--dsw-alias-border-l4);
}
.dsh-destiny-store.is-active {
  border-color: var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-bg-layer-3);
}
.dsh-destiny-store__emblem {
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
  object-fit: cover;
  opacity: 0.45;
}
.dsh-destiny-store__wash {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, var(--dsw-alias-bg-base) 12%, transparent 70%);
}
.dsh-destiny-store__body {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dsh-destiny-store__label {
  font-weight: 600;
}
.dsh-destiny-store__stats {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}
.dsh-destiny-store__count {
  position: relative;
  margin-inline-start: auto;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}

.dsh-destiny-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.dsh-destiny-toolbar__search,
.dsh-destiny-toolbar__select {
  font: inherit;
  color: inherit;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 5px 8px;
}
.dsh-destiny-toolbar__search {
  inline-size: 168px;
}
.dsh-destiny-toolbar__search:focus-visible,
.dsh-destiny-toolbar__select:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -1px;
}
.dsh-destiny-toolbar__refresh {
  font: inherit;
  color: inherit;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 5px 12px;
  cursor: pointer;
}
.dsh-destiny-toolbar__refresh:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-destiny-toolbar__refresh:disabled {
  opacity: 0.5;
  cursor: default;
}
.dsh-destiny-toolbar__count {
  margin-inline-start: auto;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}

.dsh-destiny-segmented {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
}
.dsh-destiny-segmented__item {
  font: inherit;
  color: var(--dsw-alias-label-secondary);
  background: none;
  border: 0;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
}
.dsh-destiny-segmented__item:hover {
  color: var(--dsw-alias-label-primary);
}
.dsh-destiny-segmented__item.is-active {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-3);
}

.dsh-destiny-dropbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px dashed var(--dsw-alias-brand-primary);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2);
}
.dsh-destiny-dropbar__hint {
  color: var(--dsw-alias-label-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dsh-destiny-dropbar__target {
  font: inherit;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-3);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 6px 14px;
  cursor: pointer;
}
.dsh-destiny-dropbar__target.is-over {
  border-color: var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsh-destiny-body {
  flex: 1;
  min-block-size: 0;
  overflow: auto;
  padding-block-end: 16px;
}
.dsh-destiny-section + .dsh-destiny-section {
  margin-block-start: 18px;
}
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
.dsh-destiny-section__count,
.dsh-destiny-group__count {
  font-size: 11px;
  font-weight: 400;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}
.dsh-destiny-group {
  margin-block-end: 12px;
}
.dsh-destiny-group__title {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-destiny-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px, 72px));
  gap: 6px;
}
.dsh-destiny-tile {
  position: relative;
  inline-size: 72px;
  block-size: 72px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-2);
  overflow: hidden;
  cursor: grab;
}
.dsh-destiny-tile:hover {
  outline: 2px solid var(--dsw-alias-label-primary);
  outline-offset: -2px;
}
.dsh-destiny-tile:active {
  cursor: grabbing;
}
.dsh-destiny-tile.r-exotic {
  border-color: var(--dsh-rarity-exotic-border);
  background: var(--dsh-rarity-exotic-wash);
}
.dsh-destiny-tile.r-legendary {
  border-color: var(--dsh-rarity-legendary-border);
  background: var(--dsh-rarity-legendary-wash);
}
.dsh-destiny-tile.r-rare {
  border-color: var(--dsh-rarity-rare-border);
  background: var(--dsh-rarity-rare-wash);
}
.dsh-destiny-tile__icon {
  inline-size: 100%;
  block-size: 100%;
  display: block;
  object-fit: cover;
}
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
.dsh-destiny-tile__lock {
  position: absolute;
  inset-block-start: 1px;
  inset-inline-start: 3px;
  font-size: 10px;
  line-height: 1;
}
.dsh-destiny-tile__worn {
  position: absolute;
  inset-block-start: 2px;
  inset-inline-end: 2px;
  inline-size: 7px;
  block-size: 7px;
  border-radius: 50%;
  background: var(--dsw-alias-brand-primary);
}

.dsh-destiny-receipts {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-block: 8px;
  border-block-start: 1px solid var(--dsw-alias-border-l2);
}
.dsh-destiny-receipt {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 12px;
}
.dsh-destiny-receipt.is-error {
  color: var(--dsw-alias-state-error-primary);
}
.dsh-destiny-receipt__text {
  font-weight: 600;
  white-space: nowrap;
}
.dsh-destiny-receipt__detail {
  color: var(--dsw-alias-label-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-destiny-detail__scrim {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 32px;
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.45));
}
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
.dsh-destiny-detail__head {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.dsh-destiny-detail__icon {
  inline-size: 56px;
  block-size: 56px;
  border-radius: 8px;
  object-fit: cover;
  flex: none;
  background: var(--dsw-alias-bg-layer-2);
}
.dsh-destiny-detail__titles {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-inline-size: 0;
}
.dsh-destiny-detail__name {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}
.dsh-destiny-detail__facts,
.dsh-destiny-detail__power {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-destiny-detail__close {
  margin-inline-start: auto;
  font: inherit;
  color: var(--dsw-alias-label-tertiary);
  background: none;
  border: 0;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
}
.dsh-destiny-detail__close:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dsh-destiny-detail__roll {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.dsh-destiny-detail__body {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  overflow-x: auto;
  padding-block-end: 6px;
}
.dsh-destiny-detail__actions {
  display: flex;
  gap: 8px;
  padding-block-start: 6px;
  border-block-start: 1px solid var(--dsw-alias-border-l2);
}
.dsh-destiny-detail__actions button {
  font: inherit;
  color: inherit;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 6px 14px;
  cursor: pointer;
}
.dsh-destiny-detail__actions button:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsh-destiny-column {
  display: flex;
  flex-direction: column;
  gap: 5px;
  inline-size: 148px;
  flex: 0 0 auto;
}
.dsh-destiny-column__label {
  margin: 0;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-destiny-column__cells {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.dsh-destiny-perk {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  padding: 4px 6px;
  border-radius: 7px;
  border: 1px solid transparent;
  background: var(--dsw-alias-bg-layer-2);
  opacity: 0.5;
}
.dsh-destiny-perk.is-selected {
  opacity: 1;
  border-color: var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-bg-layer-3);
}
.dsh-destiny-perk__icon {
  inline-size: 20px;
  block-size: 20px;
  border-radius: 4px;
  flex: none;
}
.dsh-destiny-perk__blank {
  inline-size: 20px;
  block-size: 20px;
  flex: none;
}
.dsh-destiny-perk__name {
  font-size: 12px;
  line-height: 1.2;
}
.dsh-destiny-perk__stats {
  inline-size: 100%;
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}

.dsh-destiny-confirm {
  display: flex;
  flex-direction: column;
  gap: 8px;
  inline-size: min(420px, 100%);
  padding: 18px 20px;
  border: 1px solid var(--dsw-alias-border-l3);
  border-radius: 12px;
  background: var(--dsw-alias-bg-base);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
}
.dsh-destiny-confirm__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.dsh-destiny-confirm__body {
  margin: 0;
}
.dsh-destiny-confirm__note {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-destiny-confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-block-start: 4px;
}
.dsh-destiny-confirm__actions button {
  font: inherit;
  color: inherit;
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

/** Stable id so a second registration reuses the first stylesheet. */
const STYLE_ID = 'dsh-destiny-inventory-styles'

/** Insert the panel stylesheet once and return its disposer. */
export function ensureStyles(): () => void {
  const existing = document.getElementById(STYLE_ID)
  if (existing !== null) return () => undefined
  const element = document.createElement('style')
  element.id = STYLE_ID
  element.textContent = CSS
  document.head.appendChild(element)
  return () => element.remove()
}

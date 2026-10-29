/**
 * Panel stylesheet, injected once per client entry.
 *
 * Scoped by the `dsh-destiny-` prefix and coloured exclusively with
 * `--dsw-alias-*` theme tokens, so the panel follows the host theme instead of
 * looking like a foreign surface (guide red line 1).
 *
 * A 1900-item vault is the reason for `content-visibility` on sections: the
 * browser then skips layout and paint for off-screen buckets, and `loading=lazy`
 * on the icons keeps Bungie's CDN from being hit 1900 times at once.
 */
const CSS = `
.dsh-destiny-panel {
  display: flex;
  flex-direction: column;
  block-size: 100%;
  min-block-size: 0;
  padding: 20px 24px;
  gap: 14px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-base);
  font-size: 13px;
  overflow: auto;
}
.dsh-destiny-panel__header {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.dsh-destiny-panel__name {
  font-size: 16px;
  font-weight: 600;
}
.dsh-destiny-panel__meta {
  color: var(--dsw-alias-label-tertiary);
}
.dsh-destiny-panel__state {
  color: var(--dsw-alias-label-secondary);
}
.dsh-destiny-panel__state--error {
  color: var(--dsw-alias-state-error-primary);
  white-space: pre-wrap;
}

.dsh-destiny-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding-block-end: 12px;
  border-block-end: 1px solid var(--dsw-alias-border-l2);
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
  inline-size: 180px;
}
.dsh-destiny-toolbar__search:focus-visible,
.dsh-destiny-toolbar__select:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -1px;
}
.dsh-destiny-toolbar__sort {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
}
.dsh-destiny-toolbar__sortButton {
  font: inherit;
  color: var(--dsw-alias-label-secondary);
  background: none;
  border: 0;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
}
.dsh-destiny-toolbar__sortButton.is-active {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-3);
}
.dsh-destiny-toolbar__sortButton:hover {
  color: var(--dsw-alias-label-primary);
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
.dsh-destiny-toolbar__refresh:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-destiny-toolbar__count {
  margin-inline-start: auto;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}

.dsh-destiny-sections {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.dsh-destiny-section {
  content-visibility: auto;
  contain-intrinsic-size: auto 320px;
}
.dsh-destiny-section__title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 0 10px;
  font-size: 15px;
  font-weight: 600;
}
.dsh-destiny-section__title.is-dropTarget {
  outline: 2px dashed var(--dsw-alias-brand-primary);
  outline-offset: 4px;
  border-radius: 6px;
}
.dsh-destiny-section__count,
.dsh-destiny-bucket__count {
  font-size: 11px;
  font-weight: 400;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}
.dsh-destiny-bucket {
  margin-block-end: 14px;
}
.dsh-destiny-bucket__title {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-destiny-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(48px, 48px));
  gap: 6px;
}
.dsh-destiny-tile {
  position: relative;
  inline-size: 48px;
  block-size: 48px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-2);
  overflow: hidden;
}
.dsh-destiny-tile:hover {
  border-color: var(--dsw-alias-label-dimmed, var(--dsw-alias-border-l4));
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-destiny-tile.is-exotic {
  border-color: var(--dsw-alias-state-warn-primary);
  background: var(--dsw-alias-bg-layer-3);
}
.dsh-destiny-tile[data-equipped="1"]::after {
  content: "";
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: 0;
  inline-size: 100%;
  block-size: 2px;
  background: var(--dsw-alias-brand-primary);
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
  inset-inline-end: 0;
  padding: 0 3px;
  font-size: 10px;
  line-height: 14px;
  color: var(--dsw-alias-label-primary-inverted, var(--dsw-alias-label-primary));
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.55));
  border-start-start-radius: 4px;
  font-variant-numeric: tabular-nums;
}
.dsh-destiny-tile__lock {
  position: absolute;
  inset-block-start: 1px;
  inset-inline-start: 2px;
  font-size: 9px;
  line-height: 1;
}
.dsh-destiny-tile:active {
  cursor: grabbing;
}

.dsh-destiny-receipts {
  position: sticky;
  inset-block-end: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-block-start: 8px;
}
.dsh-destiny-receipt {
  display: flex;
  gap: 8px;
  align-items: baseline;
  padding: 5px 10px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  font-size: 12px;
}
.dsh-destiny-receipt.is-error {
  border-color: var(--dsw-alias-state-error-primary);
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
  inline-size: min(920px, 100%);
  max-block-size: 82vh;
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
  gap: 10px;
  align-items: flex-start;
  overflow-x: auto;
  padding-block-end: 6px;
}
.dsh-destiny-detail__actions {
  display: flex;
  gap: 8px;
  padding-block-start: 4px;
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
  gap: 6px;
  min-inline-size: 132px;
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
  gap: 4px;
}
.dsh-destiny-perk {
  display: flex;
  gap: 7px;
  align-items: center;
  padding: 4px 6px;
  border-radius: 7px;
  border: 1px solid transparent;
  background: var(--dsw-alias-bg-layer-2);
  opacity: 0.55;
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

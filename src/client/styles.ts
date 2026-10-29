/**
 * Panel stylesheet, injected once per client entry.
 *
 * Scoped by the `dsh-destiny-` prefix and coloured exclusively with
 * `--dsw-alias-*` theme tokens, so the panel follows the host theme instead of
 * looking like a foreign surface (guide red line 1).
 */
const CSS = `
.dsh-destiny-panel {
  display: flex;
  flex-direction: column;
  block-size: 100%;
  min-block-size: 0;
  padding: 20px 24px;
  gap: 16px;
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
.dsh-destiny-panel__section {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-destiny-panel__characters {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.dsh-destiny-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2);
}
.dsh-destiny-card__emblem {
  inline-size: 40px;
  block-size: 40px;
  border-radius: 8px;
  object-fit: cover;
  background: var(--dsw-alias-bg-layer-3);
  flex: none;
}
.dsh-destiny-card__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-inline-size: 0;
}
.dsh-destiny-card__class {
  font-weight: 600;
}
.dsh-destiny-card__light {
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
}
.dsh-destiny-panel__state {
  color: var(--dsw-alias-label-secondary);
}
.dsh-destiny-panel__state--error {
  color: var(--dsw-alias-state-error-primary);
  white-space: pre-wrap;
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

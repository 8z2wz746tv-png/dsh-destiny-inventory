/**
 * Character name cards: the banner, the emblem thumbnail, class, seal, light.
 *
 * Split out of `styles.ts` to keep that file inside its size ceiling.
 */
export const STORE_CARD_CSS = `
.dsh-destiny-store {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
  inline-size: calc(var(--dsh-item-size) * 4 + 20px);
  min-inline-size: 132px;
  /* The name card is a banner, not a chip: give it the height the in-game card
     has so the class name and seal have room to breathe. */
  min-block-size: 54px;
  padding: 6px 12px;
  overflow: hidden;
  border-radius: 6px;
}
.dsh-destiny-store:last-child {
  flex: 1 1 auto;
  inline-size: auto;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2);
  overflow: hidden;
  /* A card is a button when the panel is too narrow to show every character:
     clicking it becomes the single-character switch. */
  font: inherit;
  color: inherit;
  text-align: start;
}
.dsh-destiny-store:not(:disabled) { cursor: pointer; }
.dsh-destiny-store:not(:disabled):hover { border-color: var(--dsw-alias-border-l3); }
.dsh-destiny-store:disabled { cursor: default; }
.dsh-destiny-store.is-active {
  border-color: var(--dsw-alias-brand-primary);
  box-shadow: inset 0 0 0 1px var(--dsw-alias-brand-primary);
}
.dsh-destiny-store__banner { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; object-fit: cover; opacity: 0.85; }
/* The banner already includes its own emblem artwork, so the text sits straight
   on it: a soft left-to-right darkening keeps the class name readable. */
.dsh-destiny-store__wash {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(0, 0, 0, .55) 0%, rgba(0, 0, 0, .22) 40%, transparent 74%);
}
.dsh-destiny-store__body {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  min-inline-size: 0;
  /* Clear the emblem artwork the banner already paints on its left side. */
  margin-inline-start: 52px;
}
.dsh-destiny-store__label { font-weight: 600; font-size: 15px; color: #f4f2f6; text-shadow: 0 1px 2px rgba(0, 0, 0, .9); }
.dsh-destiny-store__title {
  font-size: 11px;
  line-height: 1.25;
  color: #c9a9e0;
  text-shadow: 0 1px 2px rgba(0, 0, 0, .95);
}
.dsh-destiny-store__stats { font-size: 11px; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
.dsh-destiny-store__light {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-inline-start: auto;
  padding-inline-end: 4px;
  font-size: 13px;
  font-weight: 600;
  color: #e9d071;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 1px 2px rgba(0, 0, 0, .95);
}
.dsh-destiny-store__light i {
  inline-size: 7px;
  block-size: 7px;
  transform: rotate(45deg);
  background: #e9d071;
  box-shadow: 0 0 2px rgba(0, 0, 0, .9);
}
`

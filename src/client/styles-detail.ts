/**
 * Item detail card — the original webui stylesheet, ported as-is.
 *
 * The previous MCP web UI already solved this card; rather than restyling it by
 * hand (and doing it worse), its rules are carried over verbatim and the theme
 * variables they expect are mapped onto DSH's tokens. Structure and class names
 * stay `inventory-detail*` so the port remains a copy, not a paraphrase.
 */

/** Old-webui theme names → DSH aliases. Scoped to the panel so nothing leaks. */
export const DETAIL_VARS = `
.dsh-destiny-panel {
  --bg: var(--dsw-alias-bg-base);
  --surface-1: var(--dsw-alias-bg-layer-1);
  --surface-2: var(--dsw-alias-bg-layer-2);
  --surface-3: var(--dsw-alias-bg-layer-3);
  --line: var(--dsw-alias-border-l1);
  --line-soft: var(--dsw-alias-border-l1);
  --line-strong: var(--dsw-alias-border-l2);
  --text: var(--dsw-alias-label-primary);
  --text-strong: var(--dsw-alias-label-primary);
  --muted: var(--dsw-alias-label-tertiary);
  --muted-strong: var(--dsw-alias-label-secondary);
  --accent: var(--dsw-alias-brand-primary);
  --accent-soft: color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent);
  --accent-border: var(--dsw-alias-brand-primary);
  --accent-hover: var(--dsw-alias-brand-primary);
  --accent-ink: #0b0f14;
  --panel-hover: var(--dsw-alias-interactive-bg-hover);
  --panel-active: var(--dsw-alias-bg-layer-3);
  --focus: var(--dsw-alias-brand-primary);
  --danger: var(--dsw-alias-state-error-primary);
  --cool: #7cb2d8;
  --radius-xs: 4px;
  --radius-sm: 6px;
  --shadow-menu: 0 12px 32px rgba(0, 0, 0, 0.5);
  --z-tooltip: 60;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  --perk-icon-ink: #d8d1db;
  --perk-icon-surface: #29242c;
  --perk-icon-border: #5d5661;
  --inventory-damage-color: var(--dsw-alias-label-secondary);
  --inventory-perk-columns: 1;
}
`

/**
 * The panel column: the card docks to the right of the grid, as it did in the
 * webui this was ported from, instead of floating over it.
 */
export const DETAIL_LAYOUT_CSS = `
  flex: 0 0 auto;
  inline-size: 380px;
  max-inline-size: 42vw;
  border-inline-start: 1px solid var(--dsw-alias-border-l2);
}
.inventory-detail-actions {
  display: flex;
  gap: 8px;
  padding: 10px 14px 14px;
  border-block-start: 1px solid var(--line);
  background: var(--surface-1);
}
.inventory-detail-actions button {
  flex: 1 1 0;
  min-height: 32px;
  border-radius: var(--radius-xs);
  border: 1px solid var(--line-strong);
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.inventory-detail-actions button:hover { background: var(--panel-hover); }
.inventory-detail-description,
.inventory-detail-roll {
  margin: 0;
  padding: 8px 14px;
  font-size: 11px;
  line-height: 1.55;
  color: var(--muted-strong);
  border-block-end: 1px solid var(--line);
}
.inventory-detail-roll { color: var(--accent); }
`

/** The ported card rules. */

/**
 * Hover card — the webui's floating preview, ported as-is.
 *
 * This is the surface the user wanted: hover a tile, read the item. The panel
 * variant stays ported too, but the grid uses this one.
 */
export const HOVER_CARD_CSS = `
.inventory-hover-card { z-index: 2147483000 !important; }

.inventory-hover-card {
  --inventory-hover-tier: #8b9299;
  --inventory-hover-header: #394047;
  --inventory-hover-bar: #b9c0c5;
  position: fixed;
  z-index: 70;
  width: min(386px, calc(100vw - 24px));
  max-height: calc(100vh - 24px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #f1eef3;
  background: #0e0b10;
  border: 1px solid var(--inventory-hover-tier);
  border-radius: 4px;
  box-shadow: 0 20px 56px rgba(0,0,0,.68), 0 0 0 1px rgba(0,0,0,.82);
  pointer-events: auto;
  animation: inventory-hover-in 130ms cubic-bezier(.22, 1, .36, 1);
}
.inventory-hover-card.tier-exotic { --inventory-hover-tier: #d7c15d; --inventory-hover-header: #75652c; --inventory-hover-bar: #e4cf72; }
.inventory-hover-card.tier-legendary { --inventory-hover-tier: #aa91bb; --inventory-hover-header: #5a426c; --inventory-hover-bar: #b79ac9; }
.inventory-hover-card.tier-rare { --inventory-hover-tier: #70a2c7; --inventory-hover-header: #3d6988; --inventory-hover-bar: #7cb2d8; }
.inventory-hover-card.is-measuring { left: 0; top: 0; visibility: hidden; }
@keyframes inventory-hover-in {
  from { opacity: 0; transform: translateY(3px) scale(.99); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.inventory-hover-header {
  min-height: 104px;
  flex: 0 0 auto;
  padding: 13px 16px 14px;
  background-color: var(--inventory-hover-header);
  background-image: linear-gradient(115deg, rgba(255,255,255,.05), rgba(0,0,0,.18));
  background-position: center, right 12px center;
  background-repeat: no-repeat;
  background-size: auto, 112px;
  border-top: 3px solid var(--inventory-hover-tier);
  border-bottom: 1px solid rgba(255,255,255,.14);
}
.inventory-hover-header > span { display: block; color: rgba(255,255,255,.72); font-size: 10px; }
.inventory-hover-header h2 { max-width: 310px; margin: 4px 0 8px; overflow-wrap: anywhere; color: #fff; font-size: 23px; line-height: 1.12; text-shadow: 0 1px 2px rgba(0,0,0,.35); }
.inventory-hover-header > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.inventory-hover-header > div > strong { min-width: 0; overflow: hidden; color: rgba(255,255,255,.78); font-size: 12px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.inventory-hover-header > div > b { display: flex; align-items: center; gap: 5px; color: #fff; font-size: 19px; font-weight: 500; }
.inventory-hover-body { min-height: 0; max-height: calc(100vh - 126px); flex: 1 1 auto; overflow-y: auto; overscroll-behavior: contain; scrollbar-color: #4a5259 rgba(255,255,255,.06); scrollbar-width: thin; }
.inventory-hover-body::-webkit-scrollbar { width: 6px; }
.inventory-hover-body::-webkit-scrollbar-track { background: rgba(255,255,255,.04); }
.inventory-hover-body::-webkit-scrollbar-thumb { background: #4a5259; border-radius: 4px; }
.inventory-hover-card.is-pinned .inventory-hover-body:focus-visible { outline: 2px solid var(--inventory-hover-tier); outline-offset: -2px; }
.inventory-hover-meta { min-height: 34px; display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; padding: 7px 14px; background: #17131a; border-bottom: 1px solid rgba(255,255,255,.08); }
.inventory-hover-meta span { display: inline-flex; align-items: center; gap: 4px; color: #bdb6c1; font-size: 10px; }
.inventory-hover-description { display: -webkit-box; margin: 0; padding: 10px 14px; overflow: hidden; color: #c8c2cb; border-bottom: 1px solid rgba(255,255,255,.08); font-size: 10px; line-height: 1.55; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.inventory-hover-card.has-multiline-perks .inventory-hover-description { -webkit-line-clamp: 2; }
.inventory-hover-stats { padding: 10px 14px 11px; border-bottom: 1px solid rgba(255,255,255,.09); }
.inventory-hover-stats h3,
.inventory-hover-sockets h3 { margin: 0 0 7px; color: #eee9f0; font-size: 11px; font-weight: 650; }
.inventory-hover-stats h3 > strong { margin-left: 5px; color: var(--inventory-hover-tier); }
.inventory-hover-stats > div { min-height: 19px; display: grid; grid-template-columns: 76px 34px minmax(0, 1fr); align-items: center; gap: 7px; }
.inventory-hover-card.has-multiline-perks .inventory-hover-stats > div { min-height: 18px; }
.inventory-hover-stats > div > span { overflow: hidden; color: #c3bdc6; font-size: 10px; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
.inventory-hover-stats > div > strong { color: #f5f1f6; font-size: 11px; font-weight: 500; text-align: right; }
.inventory-hover-stats > div > i { height: 6px; overflow: hidden; background: #373239; }
.inventory-hover-stats > div > i > b { height: 100%; display: block; min-width: 2px; background: var(--inventory-hover-bar); }
.inventory-hover-stats > div > i.is-number { opacity: .35; }
.inventory-hover-intrinsics { border-bottom: 1px solid rgba(255,255,255,.09); }
.inventory-hover-intrinsic { min-width: 0; display: grid; grid-template-columns: 42px minmax(0, 1fr); align-items: center; gap: 10px; padding: 9px 14px; }
.inventory-hover-intrinsic + .inventory-hover-intrinsic { border-top: 1px solid rgba(255,255,255,.07); }
.inventory-hover-intrinsic > div { min-width: 0; }
.inventory-hover-intrinsic > div > strong { display: block; color: #f0ebf2; font-size: 10px; font-weight: 650; line-height: 1.35; overflow-wrap: anywhere; }
.inventory-hover-intrinsic > div > span { display: block; margin-top: 2px; color: #aaa3ad; font-size: 9px; line-height: 1.4; overflow-wrap: anywhere; }
.inventory-hover-sockets { padding: 10px 14px 12px; border-bottom: 1px solid rgba(255,255,255,.09); }
.inventory-hover-socket-columns { display: grid; grid-template-columns: repeat(var(--inventory-hover-socket-columns, 1), minmax(0, 1fr)); align-items: start; gap: 7px; }
.inventory-hover-socket-column { min-width: 0; display: flex; flex-direction: column; gap: 7px; }
.inventory-hover-socket-label { min-height: 12px; overflow: hidden; color: #8f8893; font-size: 8px; line-height: 12px; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
.inventory-hover-socket-row .inventory-hover-socket-columns { grid-template-columns: repeat(var(--inventory-hover-socket-columns, 1), minmax(52px, 62px)); justify-content: start; }
.inventory-hover-flat-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); align-items: start; gap: 7px; }
.inventory-hover-perk { min-width: 0; text-align: center; }
.inventory-hover-perk-icon { position: relative; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; margin: 0 auto; color: #d8d1db; background: #29242c; border: 1px solid #5d5661; }
.inventory-hover-perk.kind-intrinsic .inventory-hover-perk-icon { border-color: var(--inventory-hover-tier); }
.inventory-hover-perk.kind-origin .inventory-hover-perk-icon { border-color: #799eae; }
.inventory-hover-perk.kind-masterwork .inventory-hover-perk-icon { border-color: #d7bd55; }
.inventory-hover-perk.kind-mod .inventory-hover-perk-icon { border-color: #78717d; }
.inventory-hover-perk.is-selected .inventory-hover-perk-icon { border-color: #f5f1f6; box-shadow: inset 0 0 0 1px #f5f1f6; }
.inventory-hover-perk.is-disabled { opacity: .48; filter: grayscale(.65); }
.inventory-hover-perk.is-disabled strong { text-decoration: line-through; }
.inventory-hover-perk-icon > img { width: 100%; height: 100%; display: block; object-fit: cover; }
.inventory-hover-perk-selected { position: absolute; right: -4px; bottom: -4px; width: 15px; height: 15px; padding: 2px; color: #100d12; background: var(--inventory-hover-tier); border: 1px solid #100d12; border-radius: 50%; }
.inventory-hover-perk strong { min-height: 24px; display: block; margin-top: 4px; color: #c9c2cc; font-size: 9px; font-weight: 500; line-height: 12px; overflow-wrap: anywhere; }
.inventory-hover-empty { margin: 0; padding: 16px 14px; color: #a9a2ac; font-size: 10px; }
.inventory-hover-card .damage-kinetic { color: #d9d9d5; }
.inventory-hover-card .damage-solar { color: #ee8448; }
.inventory-hover-card .damage-arc { color: #68b7d5; }
.inventory-hover-card .damage-void { color: #a887cf; }
.inventory-hover-card .damage-stasis { color: #7894e9; }
.inventory-hover-card .damage-strand { color: #72c990; }
`

/** Anchor the floating card to a tile. */

/** Build stamp: which bundle the page is actually running. */
export const BUILD_STAMP_CSS = `
.dsh-destiny-build {
  position: absolute;
  inset-block-start: 2px;
  inset-inline-end: 4px;
  font-size: 9px;
  line-height: 1;
  color: var(--dsw-alias-label-tertiary);
  pointer-events: none;
}
`

/**
 * Icon corner badges, following DIM's tile decorations.
 *
 * Tier pips count the tier and take its colour (T1–T3 pale, T4 violet, T5 gold);
 * the crafted chip sits bottom-left; the champion counter top-right; the season
 * watermark fills the icon behind them.
 */
export const TILE_BADGES_CSS = `
.dsh-destiny-tile__watermark {
  /* A 96x96 sheet whose artwork is the season mark in the top-left corner; it
     covers the tile and places itself, exactly like the crafted overlay. */
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
  object-fit: fill;
  pointer-events: none;
}
.dsh-destiny-tile__tier {
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
  object-fit: fill;
  pointer-events: none;
}
.dsh-destiny-tile__crafted {
  /* The game's overlay is a 96x96 sheet whose artwork sits in the bottom-left
     corner, so it must cover the whole tile and carry its own placement. */
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
  object-fit: fill;
  pointer-events: none;
}
.dsh-destiny-tile__breaker {
  position: absolute;
  inset-block-start: 3px;
  inset-inline-end: 3px;
  inline-size: 9px;
  block-size: 9px;
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, .75);
  pointer-events: none;
}
.dsh-destiny-tile__breaker.is-1 { background: #6ec1e4; }
.dsh-destiny-tile__breaker.is-2 { background: #e0703f; }
.dsh-destiny-tile__breaker.is-3 { background: #c74fe0; }
`

/**
 * Perk columns, the way the ported webui draws them: one column per socket, its
 * pool stacked top-down, installed plug bright and alternatives dim.
 */
export const PERK_COLUMNS_CSS = `
.inventory-hover-socket-columns {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 4px 2px;
  padding-block: 2px;
}
.inventory-hover-socket-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  inline-size: 52px;
  padding-inline: 2px;
  border-inline-start: 1px solid rgba(255, 255, 255, .08);
}
.inventory-hover-socket-column:first-child { border-inline-start: 0; }
.inventory-hover-socket-column__label {
  margin: 0;
  font-size: 7px;
  letter-spacing: .01em;
  color: #8b8590;
  text-align: center;
  text-transform: uppercase;
  /* Long socket identifiers (holofoil skins…) must wrap inside the column
     instead of pushing their neighbours out of line. */
  overflow-wrap: anywhere;
  line-height: 1.15;
  max-block-size: 2.3em;
  overflow: hidden;
}
.inventory-hover-perk {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  opacity: .42;
}
.inventory-hover-perk.is-selected { opacity: 1; }
.inventory-hover-perk-icon {
  inline-size: 28px;
  block-size: 28px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, .22);
  border-radius: 50%;
  background: #26212a;
}
.inventory-hover-perk.is-selected .inventory-hover-perk-icon { border-color: var(--inventory-hover-tier); }
.inventory-hover-perk-icon img { inline-size: 100%; block-size: 100%; display: block; object-fit: cover; }
.inventory-hover-perk strong {
  font-size: 8px;
  font-weight: 500;
  line-height: 1.15;
  color: #b9b2bd;
  text-align: center;
  max-inline-size: 48px;
  overflow-wrap: anywhere;
}
.inventory-hover-perk.is-selected strong { color: #f0ebf2; }
`

/**
 * Size limits: the ported rules assume a taller viewport than a hover card gets.
 * Compress the rows and cap the card so it reads as a preview, not a page.
 */
export const HOVER_SIZE_CSS = `
.inventory-hover-card {
  max-block-size: min(78vh, 720px);
  inline-size: 372px;
}
.inventory-hover-header { min-height: 74px; padding: 9px 13px 10px; }
.inventory-hover-header h2 { font-size: 18px; }
.inventory-hover-body { padding-block-end: 4px; }
.inventory-hover-stats { padding: 7px 13px 8px; }
.inventory-hover-stats h3,
.inventory-hover-sockets h3 { margin-block-end: 4px; font-size: 10px; }
.inventory-hover-stats > div { min-height: 15px; grid-template-columns: 68px 28px minmax(0, 1fr); gap: 6px; }
.inventory-hover-stats > div > span { font-size: 9px; }
.inventory-hover-stats > div > strong { font-size: 10px; }
.inventory-hover-stats > div > i { height: 4px; }
.inventory-hover-sockets { padding: 7px 13px 9px; }
.inventory-hover-meta { padding: 5px 13px; font-size: 9px; }
.inventory-hover-description { padding: 6px 13px; font-size: 10px; }
`

/** Recoil gauge cell: the ported grid expects an `<i>` there, so it hosts the svg. */
export const RECOIL_CSS = `
.inventory-hover-stats > div > i.is-gauge {
  display: flex;
  align-items: center;
  block-size: 12px;
  background: none;
  opacity: 1;
}
.dsh-destiny-recoil { block-size: 12px; inline-size: auto; }
`

/** Kill tracker line, the webui's "已击败敌人 N". */
export const KILL_TRACKER_CSS = `
.inventory-hover-killtracker {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
  padding: 5px 13px;
  font-size: 10px;
  color: #b9b2bd;
  border-block-end: 1px solid rgba(255, 255, 255, .09);
}
.inventory-hover-killtracker strong { font-size: 12px; font-weight: 600; color: #f0ebf2; }
`

/** Enhanced-perk arrow, as the webui marks upgraded traits. */
export const ENHANCED_ARROW_CSS = `
.inventory-hover-perk { position: relative; }
.inventory-hover-perk__enhanced {
  position: absolute;
  inset-block-start: -3px;
  inset-inline-end: -1px;
  font-size: 7px;
  line-height: 1;
  color: #e9d071;
  text-shadow: 0 0 3px rgba(0, 0, 0, .9);
  pointer-events: none;
}
`

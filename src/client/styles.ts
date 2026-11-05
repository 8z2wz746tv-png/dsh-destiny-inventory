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

import { BUILD_STAMP_CSS, DETAIL_ACTIONS_CSS, DETAIL_LAYOUT_CSS, DETAIL_VARS, HOVER_CARD_CSS, ENHANCED_ARROW_CSS, GLYPH_CSS, HOVER_SIZE_CSS, KILL_TRACKER_CSS, PERK_COLUMNS_CSS, RECOIL_CSS, TILE_BADGES_CSS } from './styles-detail'

import { INTRINSIC_CSS } from './styles-intrinsic'
import { STORE_CARD_CSS } from './styles-store'

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
  --dsh-item-size: 60px;
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

.dsh-destiny-stores { display: flex; gap: 16px; flex-wrap: nowrap; }
/* Wide name-card banner: fills the card, darkened so the text stays legible. */
/* Legibility wash for the text half only: it starts after the emblem, otherwise
   the gradient dims the thumbnail and the card looks washed out. */
/* The emblem thumbnail leads the card: a square at the left, then class + seal. */
/* Seal title sits under the class name, like the in-game name card. */
/* Light level: gold gem + number, right-aligned as in game. */

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


/* A grouped block inside the vault cell: head glyph, then its tiles inline.
   Only the vault cell is segmented; character cells stay a flat 3x3. */
.dsh-destiny-segment {
  /* A block is its own flex run so the glyph leads its tiles; blocks flow inline
     with each other inside the cell's wrapping row. */
  display: inline-flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 4px;
}
.dsh-destiny-segment__glyph {
  /* One tile wide, like DIM: a glyph the size of the items beside it lines up on
     the same baseline instead of drifting against a taller tile. */
  flex: 0 0 auto;
  inline-size: var(--dsh-item-size);
  block-size: var(--dsh-item-size);
  display: grid;
  place-items: center;
  opacity: .5;
  color: var(--dsw-alias-label-secondary);
}
.dsh-destiny-segment__glyph svg {
  inline-size: 62%;
  block-size: 62%;
  fill: currentColor;
}
.dsh-destiny-row {
  /* Flex, not grid: a character column must shrink to what it holds (an empty
     character costs one tile, not a whole column) while the vault takes the
     rest. Grid cannot express that — minmax(a, min(b, max-content)) is invalid
     CSS (max-content is not a length) and the whole declaration collapsed the
     row into one column. */
  display: flex;
  /* Stretch, not flex-start: every column in a bucket row shares the tallest
     one's height, so the blank area under a short column is still droppable. */
  align-items: stretch;
  /* Wide enough that four stores read as four columns, not one long shelf. */
  gap: 28px;
  /* Exactly the container's width: the vault cell absorbs what the three
     character columns leave. */
  inline-size: 100%;
  padding-block: 2px;
  border-block-start: 1px solid var(--dsw-alias-border-l1);
}
.dsh-destiny-cell {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  align-items: flex-start;
  gap: 4px;
  /* A fixed column width, not max-content: every bucket row must put its four
     stores at the same x, or the columns stagger from row to row. */
  flex: 0 0 auto;
  /* One worn slot plus a three-wide carried grid: the worn item is a separate
     block, the rest is the 3x3 the character carries. */
  inline-size: calc(var(--dsh-item-size) * 4 + 20px);
  max-inline-size: none;
  /* Keep a drop target wide enough to aim at even when the cell is empty. */
  min-inline-size: var(--dsh-item-size);
  min-block-size: calc(var(--dsh-item-size) + 4px);
  border-radius: 8px;
  /* Stretch to the row's height so the blank space below a short column is still
     a drop target — DIM accepts a drag anywhere in the store column, not just on
     a tile. */
  align-self: stretch;
  overflow: hidden;
}
.dsh-destiny-cell__worn {
  /* The worn item keeps its own block, divided from the carried grid. */
  display: flex;
  flex: 0 0 auto;
  gap: 4px;
  padding-inline-end: 6px;
  border-inline-end: 1px solid var(--dsw-alias-border-l3);
}

.dsh-destiny-cell__rest {
  /* Three tiles wide: the carried 3x3 grid. */
  display: grid;
  grid-template-columns: repeat(3, var(--dsh-item-size));
  align-content: flex-start;
  gap: 4px;
  flex: 0 0 auto;
}
.dsh-destiny-cell.is-flex .dsh-destiny-cell__rest {
  /* The vault is not a 3x3: it fills whatever width the column got. */
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 4px;
  flex: 1 1 auto;
  min-inline-size: 0;
}

.dsh-destiny-cell[data-shelf] .dsh-destiny-cell__rest {
  /* Shelves lay out as a packed row, not the character 3x3 grid. */
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  flex: 1 1 auto;
  min-inline-size: 0;
}
.dsh-destiny-cell[data-shelf="engrams"] .dsh-destiny-cell__rest { gap: 0; }

.dsh-destiny-cell.is-flex {
  /* flex-basis 0, not auto: with auto the vault's *content* width feeds the
     row's max-content, the row grows past the viewport and the right edge is
     clipped. */
  flex: 1 1 0;
  inline-size: auto;
  max-inline-size: none;
  min-inline-size: 0;
}
/* Whole cell lights up while it is the drop target, matching DIM: the entire
   store column accepts a dragged item, not just the tiles inside it. */
.dsh-destiny-cell.is-over {
  outline: 2px dashed var(--dsw-alias-brand-primary);
  outline-offset: 2px;
  background: var(--dsw-alias-interactive-bg-hover);
  border-radius: 6px;
}

.dsh-destiny-skeleton { display: flex; flex-direction: column; gap: 6px; padding-block: 8px; }
.dsh-destiny-skeleton__row { display: flex; gap: 4px; }
.dsh-destiny-skeleton__tile {
  inline-size: var(--dsh-item-size);
  block-size: var(--dsh-item-size);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-2);
  animation: dsh-destiny-pulse 1.4s ease-in-out infinite;
}
@keyframes dsh-destiny-pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.9; } }

.dsh-destiny-tile {
  position: relative;
  box-sizing: border-box;
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
/* The engram shelf: five slots across, two rows, 52px a slot.
   Every length is fixed on purpose — flex-basis alone let the grid's content
   push the cell back out, so the tiles came out at twice their size. */
.dsh-destiny-cell[data-shelf='engrams'] {
  flex: 0 0 268px;
  inline-size: 268px;
  min-inline-size: 0;
  max-inline-size: 268px;
}
.dsh-destiny-cell__rest.is-engram-shelf {
  display: grid;
  grid-template-columns: repeat(5, 52px);
  grid-auto-rows: 52px;
  gap: 2px;
  align-content: start;
  inline-size: 268px;
}
.dsh-destiny-tile.is-compact {
  /* The shelf grid places these; the size is fixed so five fit exactly. */
  inline-size: 52px;
  block-size: 52px;
  border-radius: 5px;
}
.dsh-destiny-cell[data-shelf='engrams'] .dsh-destiny-engram-empty {
  inline-size: 52px;
  block-size: 52px;
}
.dsh-destiny-cell:has(.dsh-destiny-tile.is-compact),
.dsh-destiny-cell[data-shelf] {
  /* Shelves span four tiles so ten engrams or five mailbox slots fit a row. */
  inline-size: calc(var(--dsh-item-size) * 4 + 20px);
  max-inline-size: none;
}

.dsh-destiny-cell[data-shelf="engrams"] { gap: 0; }

.dsh-destiny-cell[data-shelf="postmaster"] .dsh-destiny-tile,
.dsh-destiny-engram-empty.is-tile {
  /* Mailbox grid: 42px a slot, six to a column, 21 slots in four rows. Mail and
     empty slots share the size or the shelf interleaves. */
  inline-size: 42px;
  block-size: 42px;
  border-radius: 5px;
  clip-path: none;
  border: 1px dashed var(--dsw-alias-border-l2);
  background: transparent;
  opacity: 0.7;
}
.dsh-destiny-engram-empty {
  box-sizing: border-box;
  inline-size: calc((var(--dsh-item-size) * 4 + 20px - 9px) / 10);
  block-size: calc((var(--dsh-item-size) * 4 + 20px - 9px) / 10);
  background: var(--dsw-alias-bg-layer-2);
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
  opacity: 0.5;
}

.dsh-destiny-tile[data-equipped="equipped"] {
  outline: 1px solid var(--dsw-alias-brand-primary);
  outline-offset: -1px;
}
.dsh-destiny-tile[data-equipped="unknown"] { opacity: 0.9; }
.dsh-destiny-tile__unknown {
  position: absolute;
  inset-block-start: 1px;
  inset-inline-end: 2px;
  font-size: 10px;
  line-height: 1;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-destiny-tile.r-exotic { border-color: var(--dsh-rarity-exotic-border); background: var(--dsh-rarity-exotic-wash); }
.dsh-destiny-tile.r-legendary { border-color: var(--dsh-rarity-legendary-border); background: var(--dsh-rarity-legendary-wash); }

/* After the rarity rules on purpose: same specificity, so a gold ring only wins
   if it is declared later. */
/* A write in flight: the grid already moved, this says "not confirmed yet".
   A failed write keeps the ring until a read-back says where it really is. */
.dsh-destiny-tile.is-applying { opacity: .62; }
.dsh-destiny-tile.is-unconfirmed {
  opacity: .62;
  outline: 2px dashed var(--dsw-alias-label-tertiary);
  outline-offset: -2px;
}

.dsh-destiny-tile.is-masterwork {
  border-color: #e9d071;
  box-shadow: inset 0 0 0 2px #e9d071, 0 0 6px rgba(233, 208, 113, .45);
}
.dsh-destiny-tile.r-rare { border-color: var(--dsh-rarity-rare-border); background: var(--dsh-rarity-rare-wash); }
.dsh-destiny-tile__icon { inline-size: 100%; block-size: 100%; display: block; object-fit: cover; }
.dsh-destiny-tile__power {
  /* Bottom-right, matching DIM: the crafted overlay owns the bottom-left corner,
     so putting the power number there stacked the two on top of each other. */
  position: absolute;
  inset-block-end: 0;
  inset-inline-end: 0;
  padding: 0 4px;
  z-index: 3;
  font-size: 11px;
  line-height: 15px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.6));
  border-start-end-radius: 5px;
  font-variant-numeric: tabular-nums;
}
.dsh-destiny-tile__lock { position: absolute; inset-block-start: 1px; inset-inline-start: 3px; font-size: 10px; line-height: 1; }
.dsh-destiny-tile__worn {
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: 0;
  inline-size: 10px;
  block-size: 10px;
  background: var(--dsw-alias-brand-primary);
  border-end-end-radius: 4px;
}

.dsh-destiny-receipts { display: flex; flex-direction: column; gap: 4px; padding-block: 8px; border-block-start: 1px solid var(--dsw-alias-border-l2); }
.dsh-destiny-receipt { display: flex; gap: 8px; align-items: baseline; font-size: 12px; }
.dsh-destiny-receipt.is-error { color: var(--dsw-alias-state-error-primary); }
.dsh-destiny-receipt__text { font-weight: 600; white-space: nowrap; }
.dsh-destiny-receipt__detail { color: var(--dsw-alias-label-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }



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




`

/** Stable id so a second registration reuses the first stylesheet. */
const STYLE_ID = 'dsh-destiny-inventory-styles'

/** Insert the panel stylesheet once and return its disposer. */
export function ensureStyles(): () => void {
  const existing = document.getElementById(STYLE_ID)
  if (existing !== null) return () => undefined
  const element = document.createElement('style')
  element.id = STYLE_ID
  element.textContent = DETAIL_VARS + CSS + RECEIPT_CSS + STORE_CARD_CSS + DETAIL_LAYOUT_CSS + HOVER_CARD_CSS + BUILD_STAMP_CSS + TILE_BADGES_CSS + PERK_COLUMNS_CSS + HOVER_SIZE_CSS + RECOIL_CSS + KILL_TRACKER_CSS + ENHANCED_ARROW_CSS + GLYPH_CSS + DETAIL_ACTIONS_CSS + INTRINSIC_CSS + LEGACY_THEME
  document.head.appendChild(element)
  return () => element.remove()
}

/** Receipts: one line per action, with an in-flight state and a spinner. */
export const RECEIPT_CSS = `
.dsh-destiny-receipts {
  position: absolute;
  inset-block-start: 8px;
  inset-inline-end: 8px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-inline-size: 320px;
  pointer-events: none;
}
.dsh-destiny-receipt__icon {
  inline-size: 26px;
  block-size: 26px;
  flex: 0 0 auto;
  border-radius: 4px;
  object-fit: cover;
}
.dsh-destiny-receipt {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 5px 9px;
  border-radius: 5px;
  background: rgba(24, 27, 32, .96);
  border: 1px solid var(--dsw-alias-border-l2);
  border-inline-start: 3px solid #6ac07a;
  font-size: 11px;
  line-height: 1.3;
  box-shadow: 0 4px 14px rgba(0, 0, 0, .45);
}
.dsh-destiny-receipt.is-error { border-inline-start-color: #d9534f; }
.dsh-destiny-receipt { cursor: pointer; }
.dsh-destiny-receipt.is-pending .dsh-destiny-receipt__detail::after {
  content: " · 点此取消";
  color: var(--dsw-alias-label-tertiary);
}
.dsh-destiny-receipt__text { color: var(--dsw-alias-label-primary); }
.dsh-destiny-receipt__detail { color: var(--dsw-alias-label-tertiary); font-size: 10px; }
/* In flight: a moving stripe reads as progress without inventing a percentage. */
.dsh-destiny-receipt.is-pending { border-inline-start-color: #4c8dff; }
.dsh-destiny-receipt.is-pending::after {
  content: "";
  block-size: 2px;
  margin-block-start: 3px;
  border-radius: 1px;
  background: linear-gradient(90deg, transparent, #4c8dff, transparent);
  background-size: 50% 100%;
  background-repeat: no-repeat;
  animation: dsh-receipt-run 1s linear infinite;
}
@keyframes dsh-receipt-run {
  from { background-position: -50% 0; }
  to { background-position: 150% 0; }
}
`

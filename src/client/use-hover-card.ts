/**
 * The detail card's state: opened by a click, dismissed by clicking outside.
 *
 * Previously a preview-on-hover card with a grace period. Hover previews kept
 * opening while the pointer crossed the grid to reach something else, so the card
 * is now a deliberate action: click a tile, click elsewhere to dismiss.
 */
import { useCallback, useState } from 'react'

/** What the card needs to render: which item and where to hang it. */
export interface HoverTarget {
  id: string
  anchor: DOMRect
  /** The grid row, so the head can paint before the detail read returns. */
  summary?: HoverSummary
}

/** The fields a tile already knows, enough to draw the card's head. */
export interface HoverSummary {
  name: string
  icon: string
  type: string
  rarity: string
  power: number | null
}

export interface HoverCardController {
  target: HoverTarget | null
  /** Open the card for one item. */
  show: (target: HoverTarget) => void
  /** Dismiss it. */
  close: () => void
}

/** Wire the click-to-open lifecycle into a component. */
export function useHoverCard(): HoverCardController {
  const [target, setTarget] = useState<HoverTarget | null>(null)
  const show = useCallback((next: HoverTarget) => setTarget(next), [])
  const close = useCallback(() => setTarget(null), [])
  return { target, show, close }
}

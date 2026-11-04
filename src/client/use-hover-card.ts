/**
 * Hover-card state: preview on hover, pin on click, and a grace period so the
 * pointer can cross the gap between a tile and the card without dismissing it.
 *
 * Extracted from the panel because it is a self-contained interaction rule (and
 * because the panel is at its size ceiling).
 */
import { useRef, useState } from 'react'

/** What the card needs to render: which item and where to hang it. */
export interface HoverTarget {
  id: string
  anchor: DOMRect
  /** Clicked: survives the pointer leaving. */
  pinned: boolean
}

/** Grace period between leaving a tile and the card closing. */
const CLOSE_DELAY_MS = 160

export interface HoverCardController {
  target: HoverTarget | null
  /** Preview or pin one item. */
  show: (target: { id: string; anchor: DOMRect }, pinned: boolean) => void
  /** Pointer is still nearby: cancel a pending close. */
  keepOpen: () => void
  /** Pointer left: close unless pinned. */
  closeSoon: () => void
  /** Close immediately. */
  close: () => void
}

/** Wire the hover/pin lifecycle into a component. */
export function useHoverCard(): HoverCardController {
  const [target, setTarget] = useState<HoverTarget | null>(null)
  const timer = useRef<number | null>(null)

  const keepOpen = (): void => {
    if (timer.current === null) return
    window.clearTimeout(timer.current)
    timer.current = null
  }

  const closeSoon = (): void => {
    keepOpen()
    timer.current = window.setTimeout(() => {
      timer.current = null
      setTarget((current) => (current !== null && current.pinned ? current : null))
    }, CLOSE_DELAY_MS)
  }

  const show = (next: { id: string; anchor: DOMRect }, pinned: boolean): void => {
    keepOpen()
    // Visible trace while the card is being wired up: if this never prints, the
    // tile never fired and the problem is upstream of rendering.
    setTarget({ ...next, pinned })
  }

  return { target, show, keepOpen, closeSoon, close: () => setTarget(null) }
}

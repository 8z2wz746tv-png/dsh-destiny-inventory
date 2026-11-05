/**
 * The action receipts shown in the corner.
 *
 * Mirrors DIM's notifications: one line per action, visible from the moment it
 * starts, auto-dismissed on success after five seconds, and left in place on
 * failure — the reason only appears there.
 */
import { useCallback, useMemo, useState } from 'react'

/** One line in the receipt stack. */
export interface ReceiptLine {
  id: number
  ok: boolean
  text: string
  detail: string
  /** Still in flight: shown immediately so a long move does not look dropped. */
  pending?: boolean
  /** The item's icon, as DIM's notification shows. */
  icon?: string
  /** Aborter for the in-flight request, so the line can be cancelled. */
  cancel?: () => void
}

/** How long a finished line stays. */
const TTL_MS = 5000

/** Handle for one in-flight action. */
export interface ReceiptHandle {
  /** Update the line's headline, e.g. after the host names what it did. */
  rename: (text: string) => void
  /**
   * Update the detail without finishing the line.
   *
   * A queued write has to say it is waiting rather than pretend it is on the wire:
   * the line appears the moment the user drops the item, seconds before the queue
   * gets to it.
   */
  progress: (detail: string) => void
  /** Finish it. A success schedules its own removal; a failure stays. */
  settle: (ok: boolean, detail: string) => void
}

export interface ReceiptController {
  lines: ReceiptLine[]
  begin: (text: string, icon?: string, cancel?: () => void) => ReceiptHandle
  dismiss: (id: number) => void
}

/** Wire the receipt stack into a component. */
export function useReceipts(): ReceiptController {
  const [lines, setLines] = useState<ReceiptLine[]>([])
  const dismiss = useCallback((id: number) => {
    setLines((current) => current.filter((line) => line.id !== id))
  }, [])

  const begin = useCallback((text: string, icon?: string, cancel?: () => void): ReceiptHandle => {
    const id = Date.now() + Math.random()
    setLines((current) => [{ id, ok: true, text, icon, cancel, detail: '正在处理…', pending: true }, ...current].slice(0, 3))
    const patch = (next: Partial<ReceiptLine>): void => {
      setLines((current) => current.map((line) => (line.id === id ? { ...line, ...next } : line)))
    }
    return {
      rename: (next) => patch({ text: next }),
      progress: (detail) => patch({ detail }),
      settle: (ok, detail) => {
        patch({ ok, pending: false, detail })
        if (ok) window.setTimeout(() => dismiss(id), TTL_MS)
      },
    }
  }, [dismiss])

  // A stable object: callers memoise on it, and a fresh identity every render
  // would rebuild their callbacks on every keystroke.
  return useMemo(() => ({ lines, begin, dismiss }), [lines, begin, dismiss])
}

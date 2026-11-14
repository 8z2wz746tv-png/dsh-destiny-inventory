/**
 * Report the panel's view to the host, so the agent can answer "this one".
 *
 * Throttled to one report per 200 ms and skipped when nothing changed: typing a
 * search term should not produce one request per keystroke, and an idle panel
 * should produce none at all.
 */
import { useEffect, useRef } from 'react'


/** The part of the panel's state the agent needs. */
export interface ReportedView {
  /** `all` when the panel shows every store, otherwise the class key in focus. */
  character: string
  filters: { search: string; category: string; lock: string; sort: string }
  selected: {
    instanceId: string
    hash: number
    name: string
    observed: string
    observedAt: number
    /** 领域类型；只加 kind，旧上下文没有它也照常工作。 */
    kind?: 'weapon' | 'armor' | 'other'
    pending?: { target: string; submittedAt: number; status: string }
    rollback?: { location: string }
  } | null
  lastDropTarget: string | null
}

/** How long to wait between reports. */
const THROTTLE_MS = 200

/**
 * Keep the host's copy of the view current.
 * @param routePath - bridge base pathname.
 * @param view - what to report; identity may change every render.
 */
export function useViewReport(routePath: string, view: ReportedView): void {
  const lastSent = useRef<string>('')
  const pending = useRef<number | null>(null)

  useEffect(() => {
    const serialized = JSON.stringify(view)
    if (serialized === lastSent.current) return
    if (pending.current !== null) return
    pending.current = window.setTimeout(() => {
      pending.current = null
      lastSent.current = serialized
      // Fire and forget: a failed report costs the agent a stale view, never the
      // user's interaction.
      void fetch(`${routePath}/context`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(view),
      }).catch(() => {})
    }, THROTTLE_MS)
    return () => {
      if (pending.current !== null) {
        window.clearTimeout(pending.current)
        pending.current = null
      }
    }
  }, [routePath, view])
}

/**
 * The client slot seam this panel relies on, declared locally.
 *
 * The real registry types ship inside the browser-only Harness client packages
 * (`@deepseek-ai/dsh-client-ui-renderer/client`). Depending on those at build
 * time buys nothing at runtime — the panel only ever calls `inject` and
 * `register` — and the guide's red line is to not reach into Harness client
 * packages. Declaring the two calls here keeps one cast at the plugin boundary
 * instead of a dependency that would rot on every host release.
 *
 * A host whose seam disagrees fails loudly at activation ("entry did not
 * activate") rather than rendering nothing.
 */

/** One entry's registration options, as far as this plugin sets them. */
export interface SlotRegistration {
  /** Slot key being contributed to. */
  name: string
  /** Stable id for list slots. */
  id?: string
  /** Dispatch key for keyed slots. */
  key?: string
  /** Order within a list slot. */
  order?: number
  /** Row label the owning shell asks for. */
  label?: () => string
  /** Values handed to the component's injected face. */
  inject?: () => Record<string, unknown>
}

/** The registry face this plugin uses. */
export interface ClientSlotSeam {
  /** Contribute into a slot, running only once its owner declared the seat. */
  inject: (name: string, callback: () => () => void) => () => void
  /** Register one cell; the returned disposer removes it. */
  register: (options: SlotRegistration, component: unknown) => () => void
}

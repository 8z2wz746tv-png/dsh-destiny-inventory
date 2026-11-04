/**
 * Components 305 (current plug per socket) and 310 (the plugs each socket can
 * hold). Together they are the perk pool DIM renders.
 *
 * This lives apart from `profile.ts` because the two components share one shape
 * question, and because that file sits at its size ceiling.
 */

/** One socket entry: what is in it now, and what else fits. */
export interface ProfileSocket {
  plugHash: number
  enabled: boolean
  /**
   * Every plug this socket accepts, in upstream order.
   *
   * Empty when component 310 was not requested or the socket has no pool — the
   * detail view then shows only the installed plug instead of inventing options.
   */
  options: number[]
}

/** Raw component-305 row for one instance. */
export interface RawSockets {
  sockets?: { plugHash?: number; isEnabled?: boolean; isVisible?: boolean }[]
}

/** Raw component-309 row: plug hash → the objectives it carries progress for. */
export interface RawPlugObjectives {
  objectivesPerPlug?: Record<string, { objectiveHash?: number; progress?: number }[]>
}

/** Raw component-310 row: socket index → the plugs it can hold. */
export interface RawReusable {
  plugs?: Record<string, { plugItemHash?: number; canInsert?: boolean }[]>
}

/**
 * Read one instance's sockets and their pools.
 * @param row - component 305's row for this instance.
 * @param reusable - component 310's row for this instance.
 * @returns sockets in slot order, hidden ones dropped.
 */
export function readSockets(row: RawSockets | undefined, reusable?: RawReusable): ProfileSocket[] {
  return (row?.sockets ?? [])
    .map((socket, index) => ({ socket, index }))
    .filter(({ socket }) => typeof socket.plugHash === 'number' && socket.isVisible !== false)
    .map(({ socket, index }) => ({
      plugHash: socket.plugHash as number,
      enabled: socket.isEnabled !== false,
      options: (reusable?.plugs?.[String(index)] ?? [])
        .filter((entry) => typeof entry.plugItemHash === 'number' && entry.canInsert !== false)
        .map((entry) => entry.plugItemHash as number),
    }))
}

/**
 * Read the objective progress a row reports, keyed by plug hash.
 *
 * The kill tracker's count lives here: it is progress on an objective attached to
 * the installed tracker plug, not a field on the item.
 * @param row - component 309's row for this instance.
 * @returns progress by plug hash; empty when the component was not requested.
 */
export function readObjectives(
  row: RawPlugObjectives | undefined,
): Record<number, { objectiveHash: number; progress: number }[]> {
  const out: Record<number, { objectiveHash: number; progress: number }[]> = {}
  for (const [plugHash, entries] of Object.entries(row?.objectivesPerPlug ?? {})) {
    const list = (entries ?? []).flatMap((entry) =>
      typeof entry.objectiveHash === 'number' && typeof entry.progress === 'number'
        ? [{ objectiveHash: entry.objectiveHash, progress: entry.progress }]
        : [],
    )
    if (list.length > 0) out[Number(plugHash)] = list
  }
  return out
}

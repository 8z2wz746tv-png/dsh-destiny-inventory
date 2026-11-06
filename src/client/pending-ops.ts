/**
 * Pending operations: what the panel has asked for but Bungie has not confirmed.
 *
 * The four states this protects are described in `docs/plans/PLAN-CONSISTENCY-LAYER.md`.
 * The short version: a write that returns ok is an **intention accepted**, not a
 * position. Bungie's profile keeps reporting the old place for about a minute, so
 * any state that a refresh can overwrite will flip the item back in front of the user.
 *
 * This module is pure: no React, no fetch, no timers. Everything is decided from
 * arguments, so the rules below can be tested without a browser.
 */

/** Where one operation is in its life. */
export type OperationState =
  | 'submitted'
  | 'succeeded'
  | 'verifying'
  | 'failed'
  | 'unknown'
  | 'verified'
  | 'superseded'

/** What the panel believes about one item, until Bungie agrees. */
export interface PendingOperation {
  /** Identifies this operation; a read-back claims its result by this id. */
  eventId: string
  /** Per-instance monotonic counter: a later operation always has a bigger one. */
  seq: number
  instanceId: string
  action: 'move' | 'equip' | 'lock'
  /** Where the panel thinks it should be, as a location key. */
  target: string
  /** Where it was when the operation started; journal uses it. */
  from: string | null
  state: OperationState
  submittedAt: number
  /** Last time a read was compared against `target`. */
  checkedAt: number
  /** Past this instant, still mismatching means `unknown`. */
  expiresAt: number
  /** How many consecutive reads disagreed with `target`. */
  mismatches: number
}

/**
 * One read's answer about one item.
 *
 * `startedAt` is the moment the read was *issued*, not when it came back: a read
 * issued before an operation was submitted may observe that operation's effect and
 * must not be used to verify it.
 */
export interface Observation {
  instanceId: string
  location: string
  startedAt: number
}

/** How the bridge answered. Not the same as "what happened upstream". */
export type Outcome = 'accepted' | 'rejected' | 'unclear'

/** A state change worth recording. Produced here, journalled by the caller. */
export interface Transition {
  eventId: string
  instanceId: string
  kind: 'verified' | 'failed' | 'unknown' | 'superseded'
  /** Where Bungie says it is, for the kinds that looked. */
  location?: string
}

/** How long an operation may stay unsettled before it is `unknown`. */
export const VERIFY_TTL_MS = 5 * 60_000

/**
 * Decide whether a bridge failure proves the write did not run.
 *
 * The distinction matters: `DestinyNoRoomInDestination` is Bungie saying no, while
 * a dropped connection says nothing at all. Treating the second as a failure is how
 * "it actually landed" became a lie in the P0 run.
 * @param code - the bridge's `error.code`.
 */
export function classifyFailure(code: string): 'rejected' | 'unclear' {
  if (code === 'BadRequest' || code === 'NotFound' || code === 'AUTH_UNAVAILABLE') return 'rejected'
  // Upstream said no by name; e.g. `DestinyNoRoomInDestination`.
  if (code.startsWith('Destiny')) return 'rejected'
  return 'unclear'
}

export class PendingOps {
  private readonly ops = new Map<string, PendingOperation>()
  /** Highest seq ever handed out per instance, so it never repeats. */
  private readonly seqs = new Map<string, number>()

  /**
   * Register an operation the moment it is queued.
   * @param input - what is being attempted.
   * @returns the stored operation, with its per-instance `seq`.
   */
  submit(input: {
    eventId: string
    instanceId: string
    action: PendingOperation['action']
    target: string
    from: string | null
    now: number
    ttlMs?: number
  }): PendingOperation {
    const seq = (this.seqs.get(input.instanceId) ?? 0) + 1
    this.seqs.set(input.instanceId, seq)
    const operation: PendingOperation = {
      eventId: input.eventId,
      seq,
      instanceId: input.instanceId,
      action: input.action,
      target: input.target,
      from: input.from,
      state: 'submitted',
      submittedAt: input.now,
      checkedAt: input.now,
      expiresAt: input.now + (input.ttlMs ?? VERIFY_TTL_MS),
      mismatches: 0,
    }
    this.ops.set(input.instanceId, operation)
    return operation
  }

  /**
   * Apply the bridge's answer.
   * @param eventId - which operation answered.
   * @param outcome - accepted, definitely rejected, or unclear.
   * @returns a transition when the answer removed the overlay.
   */
  settle(eventId: string, outcome: Outcome): Transition | null {
    const operation = this.find(eventId)
    if (operation === undefined) return null
    if (outcome === 'rejected') {
      // Definitely did not run: stop drawing an intention that upstream refused.
      this.ops.delete(operation.instanceId)
      return { eventId, instanceId: operation.instanceId, kind: 'failed' }
    }
    operation.state = outcome === 'accepted' ? 'succeeded' : 'verifying'
    return null
  }

  /**
   * Fold one batch of observations into the overlay.
   *
   * Pure with respect to the outside world: it returns the transitions for the
   * caller to journal, and never writes anything itself.
   * @param observations - what this read saw, with the time each read was issued.
   * @param now - current time, for expiry.
   */
  reconcile(observations: Observation[], now: number): Transition[] {
    const latest = new Map<string, Observation>()
    for (const observation of observations) {
      const previous = latest.get(observation.instanceId)
      if (previous === undefined || observation.startedAt >= previous.startedAt) {
        latest.set(observation.instanceId, observation)
      }
    }

    const transitions: Transition[] = []
    for (const operation of [...this.ops.values()]) {
      const seen = latest.get(operation.instanceId)
      if (seen === undefined) {
        transitions.push(...this.expire(operation, now))
        continue
      }
      // A read issued *at or before* this operation cannot be evidence about it:
      // it may have observed an earlier state, or a later operation's effect.
      // Same-millisecond counts as "before" — two `Date.now()` values inside one
      // millisecond cannot prove which happened first, and guessing is how a stale
      // read gets to confirm a drag it never saw.
      if (seen.startedAt <= operation.submittedAt) continue
      if (seen.location === operation.target) {
        this.ops.delete(operation.instanceId)
        transitions.push({
          eventId: operation.eventId,
          instanceId: operation.instanceId,
          kind: 'verified',
          location: seen.location,
        })
        continue
      }
      operation.mismatches += 1
      operation.checkedAt = now
      if (operation.state === 'unknown' && operation.mismatches >= 2) {
        // It settled somewhere else, twice over. The intention stops controlling
        // the grid, but the record stays.
        this.ops.delete(operation.instanceId)
        transitions.push({
          eventId: operation.eventId,
          instanceId: operation.instanceId,
          kind: 'superseded',
          location: seen.location,
        })
        continue
      }
      transitions.push(...this.expire(operation, now))
    }
    return transitions
  }

  /** The operation currently governing one item, if any. */
  get(instanceId: string): PendingOperation | undefined {
    return this.ops.get(instanceId)
  }

  /** Everything still unsettled, for rendering. */
  all(): Map<string, PendingOperation> {
    return new Map(this.ops)
  }

  /** How many operations are still governing the grid. */
  get size(): number {
    return this.ops.size
  }

  private expire(operation: PendingOperation, now: number): Transition[] {
    if (now < operation.expiresAt || operation.state === 'unknown') return []
    operation.state = 'unknown'
    return [
      { eventId: operation.eventId, instanceId: operation.instanceId, kind: 'unknown' },
    ]
  }

  private find(eventId: string): PendingOperation | undefined {
    for (const operation of this.ops.values()) {
      if (operation.eventId === eventId) return operation
    }
    return undefined
  }
}

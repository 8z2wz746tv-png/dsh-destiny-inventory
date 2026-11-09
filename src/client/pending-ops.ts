/**
 * 面板要求过、Bungie 还没确认的操作。
 *
 * 一次返回 ok 的写入是**被接受的意图**，不是一个位置——上游的 profile 会在约一分钟里
 * 继续报旧位置，所以任何能被一次刷新抹掉的状态，都会把物品当着用户的面弹回去。
 * 纯逻辑：没有 React、没有 fetch、没有计时器。
 */

/** Where one operation is in its life. */
import { restoreInto } from './pending-ops-restore'
import type { RestorableOperation } from './operation-chain'
import { SettledIds } from './settled-ids'

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

/** 判断一次桥接失败能不能证明"没执行"——`DestinyNoRoom` 是上游拒绝，断线什么也没说。 */
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
  /** 已经结束的操作；恢复时要靠它区分"没恢复过"和"恢复过、有答案了"。 */
  private readonly settled = new SettledIds()

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
    // 被新操作取代的旧意图也就此结束：它的意图不再是有效的，不能等下次刷新再复活。
    const previous = this.ops.get(input.instanceId)
    if (previous !== undefined) this.settled.add(previous.eventId)
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
      this.retire(operation) // 明确没执行：不再画一个上游拒绝过的意图
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
        this.retire(operation)
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
        this.retire(operation)
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

  restore(input: RestorableOperation): boolean { // 规则见 `pending-ops-restore.ts`
    return restoreInto(this.ops, this.seqs, this.settled, input)
  }

  /** 当前控制这件物品的操作。 */
  get(instanceId: string): PendingOperation | undefined {
    return this.ops.get(instanceId)
  }

  /** 还没结束的操作，给渲染用。 */
  all(): Map<string, PendingOperation> {
    return new Map(this.ops)
  }

  /** 有几条还在控制界面。 */
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

  /** 移除一条操作，并记住它已经有结论。 */
  private retire(operation: PendingOperation): void {
    this.settled.add(operation.eventId)
    this.ops.delete(operation.instanceId)
  }

  private find(eventId: string): PendingOperation | undefined {
    for (const operation of this.ops.values()) {
      if (operation.eventId === eventId) return operation
    }
    return undefined
  }
}

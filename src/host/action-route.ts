/**
 * One bridge action, from request shape to journal entry.
 *
 * Split out of `index.ts` for the usual reason: the route file sits on a ceiling,
 * and this is orchestration rather than routing. It also keeps the serialization
 * hard to bypass — there is exactly one place that calls `service.write`.
 */
import type { ActionRequest } from './types'
import { toItemWrite } from '../bungie/write'
import type { BungieService } from './bungie-service'
import type { ContextStore } from './context-store'
import { toFailure } from './http'
import { record } from './journal-record'
import type { WriteSerializer } from './serialize-writes'

/** What running one action needs. */
export interface ActionDeps {
  service: BungieService
  context: ContextStore
  /** One write at a time, whatever else is asking. */
  writes: WriteSerializer
}

/**
 * Run one account action and journal how it went.
 *
 * The origin is read *inside* the queue slot: read outside it, a write still
 * queued behind another one would be described by the state after that write.
 * @param deps - the data plane, the journal, and the serializer.
 * @param request - what the panel asked for.
 * @param itemName - display name, for the journal only.
 * @returns the summary the panel shows.
 */
export async function runAction(
  deps: ActionDeps,
  request: ActionRequest,
  itemName: string,
): Promise<string> {
  const write = toItemWrite(request)
  return deps.writes.run(async () => {
    // A move carries `from`; the others fall back to the snapshot because a lock
    // or a postmaster pull genuinely does not know which character to name.
    const from = write.from ?? (await deps.service.locationOf(write.instanceId))
    try {
      const done = await deps.service.write(write)
      record(deps.context, write, itemName, from, 'ok', done)
      return done
    } catch (error) {
      record(deps.context, write, itemName, from, 'failed', toFailure(error).message)
      throw error
    }
  })
}

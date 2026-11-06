/**
 * Accept a read-back result for a write the bridge already called a failure.
 *
 * The browser half is the only side that asks Bungie "did that actually land", so
 * it is the only side that can correct the journal. Kept out of `index.ts` because
 * that file is on its ceiling and this is a route, not assembly.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ContextStore } from './context-store'
import { readJsonBody, sendJson, toFailure } from './http'
import type { BridgeResponse } from './types'

/**
 * Handle `POST /journal/resolve`.
 * @param req - the request; body is `{ instanceId, landed, location? }`.
 * @param res - the response.
 * @param store - the journal to correct.
 */
export async function handleJournalResolve(
  req: IncomingMessage,
  res: ServerResponse,
  store: ContextStore,
): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: { code: 'MethodNotAllowed', message: 'POST only' } })
    return
  }
  try {
    const body = (await readJsonBody(req)) as {
      instanceId?: string
      landed?: boolean
      location?: string | null
    }
    if (body.instanceId === undefined || typeof body.landed !== 'boolean') {
      sendJson(res, 400, {
        ok: false,
        error: { code: 'BadRequest', message: 'body needs { instanceId, landed }' },
      })
      return
    }
    const entry = store.resolve(body.instanceId, body.landed, body.location ?? null)
    sendJson(res, 200, { ok: true, data: { corrected: entry !== null } } satisfies BridgeResponse<unknown>)
  } catch (error) {
    sendJson(res, 400, { ok: false, error: toFailure(error) } satisfies BridgeResponse<never>)
  }
}

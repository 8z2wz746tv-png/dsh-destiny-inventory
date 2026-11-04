import type { Context } from '@deepseek-ai/cordis'
import { callDestinyTool } from './client'
import { DestinyPayloadError, parseToolEnvelope } from './envelope'
import type { ActionReceipt, ActionRequest } from './types'

/**
 * Account writes, behind the tool's own confirmation envelope.
 *
 * Every write intent (`move`, `lock`, `pull_postmaster`, `equip`) answers a call
 * without `confirmed` with `error.code = 'confirmation_required'`, a
 * `candidates` array describing what would change, and `next_actions[0].arguments`
 * — the same call with `confirmed: true` filled in. That envelope is the single
 * source of truth for the replay; nothing here rebuilds it by hand.
 *
 * Moves execute in one round trip because a drag is itself the intent. `equip`
 * stops at the envelope so the card can show what it would displace.
 */

/** The write was refused for a reason the user should read. */
export class ActionRefusedError extends Error {
  readonly code: string
  constructor(kind: string, code: string, message: string) {
    super(message)
    this.name = 'ActionRefusedError'
    this.code = code
    this.kind = kind
  }
  readonly kind: string
}

/** Build the tool arguments for one request, without `confirmed`. */
export function buildActionArgs(
  request: ActionRequest,
  itemName: string,
): Record<string, unknown> {
  switch (request.kind) {
    case 'move':
      return {
        intent: 'move',
        item_name: itemName,
        item_instance_id: request.instanceId,
        destination: request.destination,
        ...(request.equip === true ? { equip: true } : {}),
      }
    case 'lock':
      return {
        intent: 'lock',
        item_name: itemName,
        item_instance_id: request.instanceId,
        locked: request.locked,
        ...(request.character !== undefined ? { character: request.character } : {}),
      }
    case 'pull_postmaster':
      return {
        intent: 'pull_postmaster',
        item_name: itemName,
        item_instance_id: request.instanceId,
        ...(request.character !== undefined ? { character: request.character } : {}),
      }
    case 'equip':
      return {
        intent: 'equip',
        item_name: itemName,
        item_instance_id: request.instanceId,
        ...(request.character !== undefined ? { character: request.character } : {}),
      }
  }
}

/** One sentence naming the item and the change, for the receipt line. */
export function summarizeAction(request: ActionRequest, itemName: string, candidate?: Record<string, unknown>): string {
  const name = `「${itemName}」`
  switch (request.kind) {
    case 'move':
      return `把${name}移到 ${request.destination}`
    case 'lock':
      return `${request.locked ? '锁定' : '解锁'}${name}`
    case 'pull_postmaster':
      return `从邮政官取回${name}`
    case 'equip': {
      const replaces = candidate?.replaces
      return typeof replaces === 'string' && replaces !== ''
        ? `装备${name}（会顶掉「${replaces}」）`
        : `装备${name}`
    }
  }
}

/**
 * The arguments to actually send, once the preview has been seen.
 *
 * Deliberately **not** taken from the envelope's `next_actions[0].arguments`:
 * that payload is built from the tool's own field list and drops request-specific
 * values — a `lock` replay arrives without `locked`, so replaying it verbatim
 * turns "unlock" into "lock". This rebuilds from the request the first call
 * already validated, which is complete by construction.
 * @param request - the write the user asked for.
 * @param itemName - the item's display name.
 */
export function buildReplayArguments(
  request: ActionRequest,
  itemName: string,
): Record<string, unknown> {
  return { ...buildActionArgs(request, itemName), confirmed: true }
}

/**
 * Pull the replayable arguments out of a confirmation envelope.
 *
 * Kept for inspection and tests only — see {@link buildReplayArguments} for why
 * these are not sent.
 */
export function replayArguments(body: Record<string, unknown>): Record<string, unknown> | undefined {
  const actions = body.next_actions
  if (Array.isArray(actions) && actions.length > 0) {
    const first = actions[0] as Record<string, unknown>
    const args = first.arguments
    if (typeof args === 'object' && args !== null) return args as Record<string, unknown>
  }
  const candidates = body.candidates
  if (Array.isArray(candidates) && candidates.length > 0) {
    const candidate = candidates[0] as Record<string, unknown>
    return { ...candidate, confirmed: true }
  }
  return undefined
}

/** Read the tool's own sentence out of a response body. */
function messageOf(body: Record<string, unknown>): string {
  const summary = body.summary
  if (typeof summary === 'string' && summary !== '') return summary
  const error = body.error as Record<string, unknown> | undefined
  const message = error?.message
  return typeof message === 'string' ? message : ''
}

/**
 * Run one account write.
 * @param ctx - plugin context carrying the tool registry.
 * @param server - configured MCP server name.
 * @param request - what the user asked for.
 * @param itemName - the item's display name; `move` and `lock` require it.
 */
export async function runAction(
  ctx: Context,
  server: string,
  request: ActionRequest,
  itemName: string,
): Promise<ActionReceipt> {
  const body = parseToolEnvelope(
    'action',
    await callDestinyTool(ctx, server, 'inventory_assistant', buildActionArgs(request, itemName)),
  )
  if (body.ok === true) {
    return {
      kind: request.kind,
      applied: true,
      message: messageOf(body),
      summary: summarizeAction(request, itemName),
    }
  }

  const error = (body.error ?? {}) as Record<string, unknown>
  const code = typeof error.code === 'string' ? error.code : 'unknown'
  if (code !== 'confirmation_required') {
    throw new ActionRefusedError(request.kind, code, messageOf(body) || `写入被拒（${code}）`)
  }

  const candidates = Array.isArray(body.candidates) ? body.candidates : []
  const candidate = candidates[0] as Record<string, unknown> | undefined
  const summary = summarizeAction(request, itemName, candidate)
  const replay = buildReplayArguments(request, itemName)

  if (request.kind === 'equip' && request.confirmed !== true) {
    return {
      kind: request.kind,
      applied: false,
      needsConfirm: true,
      message: messageOf(body),
      summary,
      replay,
    }
  }

  const applied = parseToolEnvelope(
    'action',
    await callDestinyTool(ctx, server, 'inventory_assistant', replay),
  )
  if (applied.ok !== true) {
    const appliedError = (applied.error ?? {}) as Record<string, unknown>
    const appliedCode = typeof appliedError.code === 'string' ? appliedError.code : 'unknown'
    throw new ActionRefusedError(request.kind, appliedCode, messageOf(applied) || `写入失败（${appliedCode}）`)
  }
  return {
    kind: request.kind,
    applied: true,
    message: messageOf(applied),
    summary,
  }
}

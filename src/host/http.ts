/** Small HTTP helpers shared by the bridge routes. */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { BungieApiError } from '../bungie/client'
import { AuthUnavailableError } from '../bungie/types'

/** Write one JSON response and end it. */
export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  })
  res.end(payload)
}

/** Read one JSON request body, refusing to buffer an unbounded payload. */
export async function readJsonBody(req: IncomingMessage, limitBytes = 64 * 1024): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    total += buffer.length
    if (total > limitBytes) throw new Error(`request body over ${limitBytes} bytes`)
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  return JSON.parse(text)
}

/** A refusal we decided on ourselves: the request cannot be carried out as sent. */
export class BridgeFault extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'BridgeFault'
    this.code = code
  }
}

/**
 * Wire status for a failure.
 *
 * Our own refusals are the caller's mistake and must not look like an outage: a
 * 502 sends people looking at the host log for a fault that never happened.
 * @param failure - the translated failure.
 */
export function statusOf(failure: { code: string }): number {
  if (failure.code === 'BadRequest') return 400
  if (failure.code === 'NotFound') return 404
  if (failure.code === 'AUTH_UNAVAILABLE') return 401
  return 502
}

/** Translate a thrown bridge fault into a stable wire code. */
export function toFailure(error: unknown): { code: string; message: string } {
  if (error instanceof BridgeFault) {
    // Already a sentence for the operator, with no guessing needed.
    return { code: error.code, message: error.message }
  }
  if (error instanceof AuthUnavailableError) {
    // Never paper over this: the browser half shows the reason verbatim.
    return { code: 'AUTH_UNAVAILABLE', message: `认证不可用（${error.reason}）：${error.message}` }
  }
  if (error instanceof BungieApiError) {
    // Upstream already wrote a specific sentence; say who refused and keep it.
    return { code: error.errorStatus || 'UPSTREAM', message: `Bungie 拒绝了这次请求：${error.message}` }
  }
  if (error instanceof Error) {
    const code =
      'code' in error && typeof error.code === 'string' ? error.code : error.name || 'BridgeError'
    // A bare upstream message is unreadable; name the next step instead.
    return {
      code,
      message: `${error.message}（连不上宿主，多半是它还在启动；一直这样再重启 DSH，日志里有栈）`,
    }
  }
  return { code: 'BridgeError', message: String(error) }
}

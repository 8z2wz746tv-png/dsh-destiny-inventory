import type { Context } from '@deepseek-ai/cordis'
// Side-effect type imports: they carry the module augmentations that put
// `ctx.tools` and `ctx.webServer` on Context.
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Config } from './config'
import type { Config as ConfigShape } from './config'
import { readItemDetail } from './host/item-detail'
import { AuthUnavailableError } from './bungie/types'
import { BungieService } from './host/bungie-service'
import { toItemWrite } from './bungie/write'
import type { ActionRequest, BridgeResponse } from './host/types'

export const name = 'dsh-destiny-inventory'

// Every service apply() touches must be declared: a missing entry fails at
// activation with "cannot get property ... without inject" and the host
// disables the whole bundle (guide §7.3).
export const inject = ['tools', 'webServer']

// Re-export the schema so the loader can validate this plugin's config.
export { Config }

/** Write one JSON response and end it. */
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  })
  res.end(payload)
}

/** Read one JSON request body, refusing to buffer an unbounded payload. */
async function readJsonBody(req: IncomingMessage, limitBytes = 64 * 1024): Promise<unknown> {
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

/** Translate a thrown bridge fault into a stable wire code. */
function toFailure(error: unknown): { code: string; message: string } {
  if (error instanceof AuthUnavailableError) {
    // Never paper over this: the browser half shows the reason verbatim.
    return { code: 'AUTH_UNAVAILABLE', message: `认证不可用（${error.reason}）：${error.message}` }
  }
  if (error instanceof Error) {
    const code =
      'code' in error && typeof error.code === 'string' ? error.code : error.name || 'BridgeError'
    return { code, message: error.message }
  }
  return { code: 'BridgeError', message: String(error) }
}

/**
 * Mount the browser half's read bridge.
 *
 * The browser cannot reach `ctx.tools`, so the host half exposes the account
 * reads it performs as one GET route. Writes deliberately do not go through
 * this route yet: they need the MCP confirmation envelope and land in P3.
 */
export function apply(ctx: Context, config: ConfigShape): void {
  // Host data plane: its own Bungie client, definitions from the manifest.
  // The MCP stays the only token writer/refresher during the transition.
  const service = new BungieService({
    tokenPath: config.tokenPath,
    manifestPath: config.manifestPath,
    apiKeyFile: config.apiKeyFile,
  })
  ctx.webServer.register({
    kind: 'prefix',
    path: config.routePath,
    async handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const query = url.pathname.slice(config.routePath.length) || '/'

      if (query === '/action') {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: { code: 'MethodNotAllowed', message: 'POST only' } })
          return
        }
        try {
          const body = (await readJsonBody(req)) as {
            request?: ActionRequest
            itemName?: string
          }
          if (body.request === undefined) {
            sendJson(res, 400, {
              ok: false,
              error: { code: 'BadRequest', message: 'body needs { request, itemName }' },
            })
            return
          }
          // Straight to Bungie: the MCP hop added seconds to every drag.
          const summary = await service.write(toItemWrite(body.request))
          sendJson(res, 200, {
            ok: true,
            data: { applied: true, summary, message: summary },
          } satisfies BridgeResponse<unknown>)
        } catch (error) {
          sendJson(res, 502, { ok: false, error: toFailure(error) } satisfies BridgeResponse<never>)
        }
        return
      }

      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, error: { code: 'MethodNotAllowed', message: 'GET only' } })
        return
      }
      try {
        if (query === '/characters') {
          const data = await service.characters()
          sendJson(res, 200, { ok: true, data } satisfies BridgeResponse<unknown>)
          return
        }
        if (query === '/status') {
          const data = await service.status()
          sendJson(res, 200, { ok: true, data } satisfies BridgeResponse<unknown>)
          return
        }
        if (query === '/item') {
          const id = url.searchParams.get('id') ?? ''
          if (id === '') {
            sendJson(res, 400, {
              ok: false,
              error: { code: 'BadRequest', message: 'item needs ?id=' },
            })
            return
          }
          const data = await readItemDetail(service, id, {
            force: url.searchParams.get('refresh') === '1',
          })
          if (data === null) {
            sendJson(res, 404, {
              ok: false,
              error: { code: 'ItemNotFound', message: '这件物品不在当前快照里，先刷新库存' },
            })
            return
          }
          sendJson(res, 200, { ok: true, data } satisfies BridgeResponse<unknown>)
          return
        }
        if (query === '/inventory') {
          const data = await service.inventory({ force: url.searchParams.get('refresh') === '1' })
          sendJson(res, 200, {
            ok: true,
            data: { ...data, overlays: service.overlays() },
          } satisfies BridgeResponse<unknown>)
          return
        }
        sendJson(res, 404, {
          ok: false,
          error: { code: 'NotFound', message: `no bridge route for ${query}` },
        })
      } catch (error) {
        const failure = toFailure(error)
        sendJson(res, failure.code === 'AUTH_UNAVAILABLE' ? 401 : 502, {
          ok: false,
          error: failure,
        } satisfies BridgeResponse<never>)
      }
    },
  })
}

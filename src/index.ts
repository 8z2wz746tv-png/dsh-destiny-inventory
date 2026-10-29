import type { Context } from '@deepseek-ai/cordis'
// Side-effect type imports: they carry the module augmentations that put
// `ctx.tools` and `ctx.webServer` on Context.
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Config } from './config'
import type { Config as ConfigShape } from './config'
import { callDestinyTool } from './mcp/client'
import { runInventoryQuery } from './mcp/queries'
import type { BridgeResponse } from './mcp/types'

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

/** Translate a thrown bridge fault into a stable wire code. */
function toFailure(error: unknown): { code: string; message: string } {
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
  ctx.webServer.register({
    kind: 'prefix',
    path: config.routePath,
    async handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, error: { code: 'MethodNotAllowed', message: 'GET only' } })
        return
      }
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const query = url.pathname.slice(config.routePath.length) || '/'
      try {
        if (query === '/characters') {
          const data = await runInventoryQuery(ctx, config.mcpServer, 'characters')
          sendJson(res, 200, { ok: true, data } satisfies BridgeResponse<unknown>)
          return
        }
        sendJson(res, 404, {
          ok: false,
          error: { code: 'NotFound', message: `no bridge route for ${query}` },
        })
      } catch (error) {
        sendJson(res, 502, { ok: false, error: toFailure(error) } satisfies BridgeResponse<never>)
      }
    },
  })
}

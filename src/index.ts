import type { Context } from '@deepseek-ai/cordis'
// Side-effect type imports: they carry the module augmentations that put
// `ctx.tools` and `ctx.webServer` on Context.
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Config } from './config'
import type { Config as ConfigShape } from './config'
import { readItemDetail } from './host/item-detail'
import { BungieService } from './host/bungie-service'
import { ContextStore } from './host/context-store'
import type { ViewContext } from './host/context-store'
import { registerAgentTools } from './host/agent-tools'
import { runAction } from './host/action-route'
import { handleJournalResolve } from './host/journal-resolve-route'
import { readJsonBody, sendJson, statusOf, toFailure } from './host/http'
import { WriteSerializer } from './host/serialize-writes'
import { ExternalDetector } from './host/detect-external'
import type { ActionRequest, BridgeResponse } from './host/types'

export const name = 'dsh-destiny-inventory'

// Every service apply() touches must be declared: a missing entry fails at
// activation with "cannot get property ... without inject" and the host
// disables the whole bundle (guide §7.3).
export const inject = ['tools', 'webServer']

// Re-export the schema so the loader can validate this plugin's config.
export { Config }

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
  // What the panel is showing and what has been done through it; the agent reads
  // this, it never writes through it.
  const context = new ContextStore(config.journalPath)
  const writes = new WriteSerializer() // one write at a time, whoever asks
  const detector = new ExternalDetector()
  registerAgentTools(ctx, context)
  ctx.webServer.register({
    kind: 'prefix',
    path: config.routePath,
    async handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const query = url.pathname.slice(config.routePath.length) || '/'

      if (query === '/context') {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: { code: 'MethodNotAllowed', message: 'POST only' } })
          return
        }
        try {
          context.setView((await readJsonBody(req)) as ViewContext)
          sendJson(res, 200, { ok: true, data: {} } satisfies BridgeResponse<unknown>)
        } catch (error) {
          sendJson(res, 400, { ok: false, error: toFailure(error) } satisfies BridgeResponse<never>)
        }
        return
      }

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
            sendJson(res, 400, { ok: false, error: { code: 'BadRequest', message: 'body needs { request, itemName }' } })
            return
          }
          // An incomplete move is the caller's mistake, not an outage: say so here
          // instead of letting the data plane turn it into a 502 and journal a
          // write that never left.
          if (body.request.kind === 'move' && !body.request.from) {
            sendJson(res, 400, {
              ok: false,
              error: { code: 'BadRequest', message: 'move 需要 from（这件物品现在在哪个位置键）' },
            })
            return
          }
          const summary = await runAction(
            { service, context, writes },
            body.request,
            body.itemName ?? '',
          )
          sendJson(res, 200, {
            ok: true,
            data: { applied: true, summary, message: summary },
          } satisfies BridgeResponse<unknown>)
        } catch (error) {
          const failure = toFailure(error)
          sendJson(res, statusOf(failure), { ok: false, error: failure } satisfies BridgeResponse<never>)
        }
        return
      }

      // A read-back can correct a write the bridge already reported as failed.
      if (query === '/journal/resolve') {
        await handleJournalResolve(req, res, context)
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
        if (query === '/item-state') {
          const id = url.searchParams.get('id') ?? ''
          if (id === '') {
            sendJson(res, 400, {
              ok: false,
              error: { code: 'BadRequest', message: 'need ?id=<instanceId>' },
            })
            return
          }
          const data = await service.itemState(id)
          sendJson(res, 200, { ok: true, data } satisfies BridgeResponse<unknown>)
          return
        }
        if (query === '/details') {
          const data = await service.details({ force: url.searchParams.get('refresh') === '1' })
          sendJson(res, 200, { ok: true, data } satisfies BridgeResponse<unknown>)
          return
        }
        if (query === '/inventory') {
          const data = await service.inventory({ force: url.searchParams.get('refresh') === '1' })
          // Note anything that moved without a matching journal entry. The agent
          // can change the account through the MCP; this is how the panel finds out.
          detector.observe(context, data.items)
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
        sendJson(res, statusOf(failure), {
          ok: false,
          error: failure,
        } satisfies BridgeResponse<never>)
      }
    },
  })
}

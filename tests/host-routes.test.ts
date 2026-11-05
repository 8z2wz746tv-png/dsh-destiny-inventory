/**
 * Route-level tests for the host data plane.
 *
 * These call the real handler that `apply` registers on `ctx.webServer`, against
 * the real account when the machine has the MCP token. What matters here is the
 * boundary: status codes, error codes and the wire shape the browser reads.
 */
import { existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { Config } from '../src/config'
import type { Config as ConfigShape } from '../src/config'
import { apply } from '../src/index'
import type { Context } from '@deepseek-ai/cordis'

const tokenPath = join(homedir(), '.destiny_mcp/tokens.json')
const envFile = join(homedir(), '项目/destiny2-mcp/.env')
const manifestPath = join(homedir(), '项目/destiny2-mcp/manifest/destiny_manifest_zh.sqlite3')
const live = existsSync(tokenPath) && existsSync(envFile) && existsSync(manifestPath)

interface Handler {
  handler: (req: unknown, res: unknown) => Promise<void>
}

/** Build the plugin's context stub and capture the registered route. */
function mount(config: ConfigShape): Handler {
  let captured: Handler | undefined
  const ctx = {
    webServer: {
      register: (entry: Handler) => {
        captured = entry
        return () => {}
      },
    },
    // The plugin registers two tools at activation; this stub just accepts them.
    tools: { register: () => () => {} },
  } as unknown as Context
  apply(ctx, config)
  if (captured === undefined) throw new Error('route was not registered')
  return captured
}

/** Call one already-mounted handler with a minimal GET and collect the JSON answer. */
async function getFrom(
  mounted: Handler,
  config: ConfigShape,
  path: string,
): Promise<{ status: number; body: any }> {
  const { handler } = mounted
  const url = `${config.routePath}${path}`
  const req = Object.assign(Readable.from([]), { url, method: 'GET', headers: {} })
  let status = 0
  const chunks: Buffer[] = []
  const res = {
    writeHead: (code: number) => {
      status = code
    },
    end: (data?: unknown) => {
      if (data !== undefined) chunks.push(Buffer.from(String(data)))
    },
  }
  await handler(req, res)
  return { status, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }
}

/** Convenience for single-call tests: mount a fresh plugin instance. */
function get(config: ConfigShape, path: string): Promise<{ status: number; body: any }> {
  return getFrom(mount(config), config, path)
}

const baseConfig: ConfigShape = {
  mcpServer: 'destiny',
  routePath: '/dsh-destiny-inventory',
  tokenPath,
  manifestPath,
  apiKeyFile: envFile,
  // A temp file: a test run must not append to the real journal.
  journalPath: join(tmpdir(), 'destiny-test-journal.jsonl'),
}

describe('config defaults', () => {
  it('ships a schema that accepts the transitional paths', () => {
    const parsed = Config(baseConfig)
    expect(parsed.tokenPath).toBe(tokenPath)
    expect(parsed.apiKeyFile).toBe(envFile)
  })
})

describe('auth failures are typed, not generic 502', () => {
  it('answers 401 AUTH_UNAVAILABLE when the token file is absent', async () => {
    const config: ConfigShape = { ...baseConfig, tokenPath: join(homedir(), 'no-such-token.json') }
    const { status, body } = await get(config, '/characters')
    expect(status).toBe(401)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('AUTH_UNAVAILABLE')
    expect(body.error.message).toContain('认证不可用')
  }, 30_000)

  it('reports the manifest as unavailable while characters still fail only on auth', async () => {
    const config: ConfigShape = {
      ...baseConfig,
      tokenPath: join(homedir(), 'no-such-token.json'),
      manifestPath: join(homedir(), 'no-such-manifest.sqlite3'),
    }
    const { body } = await get(config, '/status')
    expect(body.ok).toBe(true)
    expect(body.data.auth).toBe('unavailable')
    expect(body.data.manifest.available).toBe(false)
    expect(body.data.manifest.reason).toBe('missing')
  }, 30_000)
})

describe.skipIf(!live)('live routes', () => {
  // One mount per suite: the service caches its snapshot, and a fresh `apply`
  // (as a new plugin instance would) starts cold.
  const mounted = mount(baseConfig)

  it('serves characters', async () => {
    const { status, body } = await getFrom(mounted, baseConfig, '/characters')
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.characters.length).toBeGreaterThan(0)
    expect(body.data.displayName).not.toBe('')
    expect(body.data.characters[0]).toHaveProperty('className')
  }, 60_000)

  it('serves the inventory with definitions attached', async () => {
    const { status, body } = await getFrom(mounted, baseConfig, '/inventory')
    expect(status).toBe(200)
    const items = body.data.items as { name: string; bucket: string; rarity: string; hash: number }[]
    expect(items.length).toBeGreaterThan(100)
    // Definitions are available on this machine, so almost nothing degrades.
    const degraded = items.filter((item) => item.name.startsWith('#')).length
    expect(degraded / items.length).toBeLessThan(0.05)
    // On a healthy response every character returns equipment, so nothing is unknown.
    const unknown = (body.data.items as { equipped: string }[]).filter((i) => i.equipped === 'unknown')
    expect(unknown).toHaveLength(0)
    const worn = (body.data.items as { equipped: string }[]).filter((i) => i.equipped === 'equipped')
    expect(worn).toHaveLength(51)
    const sample = items.find((item) => item.rarity === 'exotic')
    expect(sample, 'account must hold at least one exotic').toBeDefined()
    expect(sample!.hash).toBeGreaterThan(0)
  }, 60_000)

  it('keeps serving inventory when the manifest is missing, with hash markers', async () => {
    // Definitions explain data; they must never gate the raw inventory read.
    const broken: ConfigShape = { ...baseConfig, manifestPath: join(homedir(), 'no-such-manifest.sqlite3') }
    const { status, body } = await get(broken, '/inventory')
    expect(status).toBe(200)
    const items = body.data.items as { name: string; bucket: string | null; inventoryBucketHash: number | null }[]
    expect(items.length).toBeGreaterThan(100)
    expect(items.every((item) => item.name.startsWith('#'))).toBe(true)
    // Without definitions there is no classification at all — null, not a fake name.
    expect(items.every((item) => item.inventoryBucketHash === null && item.bucket === null)).toBe(true)
  }, 60_000)

  it('reports a healthy status once a snapshot exists', async () => {
    // `/status` never triggers a network read; it reports the cache it has.
    await getFrom(mounted, baseConfig, '/inventory')
    const { body } = await getFrom(mounted, baseConfig, '/status')
    expect(body.data.auth).toBe('ok')
    expect(body.data.manifest.available).toBe(true)
    expect(body.data.snapshot.items).toBeGreaterThan(100)
  }, 60_000)
})

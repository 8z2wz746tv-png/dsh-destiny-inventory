/**
 * Failure isolation for the browser half's data path.
 *
 * The point of P0-c was to make the inventory independent of the MCP sidecar.
 * These tests prove it at the contract level: every request the panel can make
 * goes to the plugin's own route, and "no sidecar at all" is not an error.
 *
 * The stub fails any request that is not the bridge route, which is exactly what
 * a closed sidecar or an implicit fallback to another origin would look like.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BridgeError,
  STALE_HOST_MESSAGE,
  fetchCharacters,
  fetchInventory,
  fetchItemDetail,
  postAction,
} from '../src/client/api'

const ROUTE = '/dsh-destiny-inventory'
const signal = new AbortController().signal

/** Minimal Response stand-in: the client only reads `json()` and `ok`. */
function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

/** A bridge success envelope. */
function ok(data: unknown) {
  return jsonResponse({ ok: true, data })
}

/** Collect request URLs while answering from one handler. */
function stub(handler: (url: string, init?: RequestInit) => unknown): string[] {
  const urls: string[] = []
  vi.stubGlobal('fetch', async (url: unknown, init?: RequestInit) => {
    const text = String(url)
    urls.push(text)
    return handler(text, init)
  })
  return urls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the panel only talks to its own bridge route', () => {
  it('uses the route path for characters, inventory and item detail', async () => {
    const urls = stub(() =>
      ok({
        displayName: 'x',
        membershipId: 'm',
        characters: [],
        fetchedAt: 0,
        total: 0,
        items: [],
        truncated: false,
        id: 'i',
        instanceId: '0',
        hash: 1,
        name: 'n',
        kind: 'weapon',
        icon: '',
        power: null,
        equipped: false,
        locked: false,
        quantity: 1,
        location: 'vault',
        rarity: 'unknown',
        columns: [],
        rollSummary: '',
      }),
    )

    await fetchCharacters(ROUTE, signal)
    await fetchInventory(ROUTE, signal)
    await fetchInventory(ROUTE, signal, true)
    await fetchItemDetail(ROUTE, 'abc', signal)

    expect(urls).toEqual([
      `${ROUTE}/characters`,
      `${ROUTE}/inventory`,
      `${ROUTE}/inventory?refresh=1`,
      `${ROUTE}/item?id=abc`,
    ])
    for (const url of urls) {
      expect(url.startsWith(ROUTE)).toBe(true)
      expect(url).not.toContain('37511')
      expect(url).not.toContain('127.0.0.1')
    }
  })

  it('sends writes only to the route action endpoint', async () => {
    const urls = stub(() =>
      ok({ kind: 'move', applied: true, message: 'ok', summary: 'ok' }),
    )
    await postAction(ROUTE, { kind: 'move', instanceId: '1', destination: 'vault' }, 'x', signal)
    expect(urls).toHaveLength(1)
    expect(urls[0]).toBe(`${ROUTE}/action`)
  })
})

describe('a closed sidecar is not a failure', () => {
  it('serves the full inventory when nothing but the bridge answers', async () => {
    // Any request outside the bridge route throws: that is what a closed MCP
    // sidecar (or a fallback to another origin) would produce.
    stub((url) => {
      if (!url.startsWith(ROUTE)) throw new Error(`unexpected request: ${url}`)
      if (url.includes('/characters')) {
        return ok({ displayName: 'x', membershipId: 'm', characters: [], triumphScore: null })
      }
      if (url.includes('/inventory')) {
        return ok({ fetchedAt: 1, total: 1924, items: [], truncated: false })
      }
      return jsonResponse({ ok: false, error: { code: 'NotFound', message: 'no route' } }, 404)
    })

    await expect(fetchCharacters(ROUTE, signal)).resolves.toMatchObject({ displayName: 'x' })
    await expect(fetchInventory(ROUTE, signal)).resolves.toMatchObject({ total: 1924 })
  })
})

describe('detail failures stay readable instead of blanking the page', () => {
  it('surfaces the host reason when the MCP is unavailable', async () => {
    stub(() =>
      jsonResponse(
        { ok: false, error: { code: 'DestinyToolFailedError', message: 'Destiny MCP tool "inventory_assistant" failed' } },
        502,
      ),
    )
    const failure = await fetchItemDetail(ROUTE, 'abc', signal).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(BridgeError)
    expect((failure as BridgeError).code).toBe('DestinyToolFailedError')
    expect((failure as BridgeError).message).toContain('inventory_assistant')
  })

  it('tells the user to restart the host when the route is missing', async () => {
    stub(() => jsonResponse({ ok: false, error: { code: 'NotFound', message: 'no route' } }, 404))
    const failure = await fetchCharacters(ROUTE, signal).catch((error: unknown) => error)
    expect((failure as BridgeError).message).toBe(STALE_HOST_MESSAGE)
  })
})

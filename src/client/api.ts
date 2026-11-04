import type {
  ActionReceipt,
  ActionRequest,
  BridgeResponse,
  InventorySnapshot,
  ItemDetailView,
  PlayerProfileView,
} from '../mcp/types'

/**
 * Browser-half client for the plugin's own bridge route.
 *
 * The panel never talks to an MCP tool directly: only the host half can reach
 * `ctx.tools`, so every account read crosses this one HTTP boundary.
 */

/** The bridge answered with a typed failure. */
export class BridgeError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'BridgeError'
    this.code = code
  }
}

/**
 * The host half loaded in the running app has no such route.
 *
 * That is not a network fault: the browser half and the host half come from one
 * package, so a missing route means the app is still running an older build of
 * the plugin — installing a new one does not rebind a module the host already
 * loaded at startup.
 */
export const STALE_HOST_MESSAGE =
  '宿主里的插件还是旧版本（这条接口对新版本才有）。请完全退出 DSH 再打开——' +
  '只关窗口不够，插件的宿主半侧只在启动时加载一次。'

/** One bridge read: fetch, unwrap the envelope, fail with a typed error. */
async function readBridge<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, headers: { accept: 'application/json' } })
  const body = (await response.json()) as BridgeResponse<T>
  if (body.ok !== true) {
    if (body.error.code === 'NotFound') throw new BridgeError(body.error.code, STALE_HOST_MESSAGE)
    throw new BridgeError(body.error.code, body.error.message)
  }
  if (!response.ok) throw new BridgeError('http', `bridge answered ${response.status}`)
  return body.data
}

/**
 * Read the account header and characters.
 * @param routePath - bridge base pathname, as configured on the host half.
 * @param signal - caller-owned cancellation.
 */
export function fetchCharacters(routePath: string, signal: AbortSignal): Promise<PlayerProfileView> {
  return readBridge<PlayerProfileView>(`${routePath}/characters`, signal)
}

/**
 * Read the whole account inventory snapshot.
 * @param routePath - bridge base pathname, as configured on the host half.
 * @param signal - caller-owned cancellation.
 * @param refresh - bypass the host's snapshot cache.
 */
export function fetchInventory(
  routePath: string,
  signal: AbortSignal,
  refresh = false,
): Promise<InventorySnapshot> {
  const suffix = refresh ? '?refresh=1' : ''
  return readBridge<InventorySnapshot>(`${routePath}/inventory${suffix}`, signal)
}

/**
 * Read one item's detail card.
 * @param routePath - bridge base pathname.
 * @param id - snapshot row id.
 * @param signal - caller-owned cancellation.
 */
export function fetchItemDetail(
  routePath: string,
  id: string,
  signal: AbortSignal,
): Promise<ItemDetailView> {
  return readBridge<ItemDetailView>(
    `${routePath}/item?id=${encodeURIComponent(id)}`,
    signal,
  )
}

/**
 * Cache of detail reads, keyed by route + item id.
 *
 * DIM builds every item up front and draws from memory, so hovering never waits.
 * We keep the host as the source (one request per item) but memoise it here and
 * warm the cache ahead of the pointer, which gets the same feel without shipping
 * every socket in the first payload.
 */
const detailCache = new Map<string, Promise<ItemDetailView>>()

/** Cache key: the route scopes the cache to one bridge. */
function cacheKey(routePath: string, id: string): string {
  return `${routePath}|${id}`
}

/**
 * Detail with memoisation: the first caller fetches, everyone after joins it.
 * @param routePath - bridge base pathname.
 * @param id - snapshot row id.
 * @param signal - caller-owned cancellation; a cancelled read is not cached.
 */
export function readItemDetailCached(
  routePath: string,
  id: string,
  signal: AbortSignal,
): Promise<ItemDetailView> {
  const key = cacheKey(routePath, id)
  const cached = detailCache.get(key)
  if (cached !== undefined) return cached
  const pending = fetchItemDetail(routePath, id, signal).catch((error: unknown) => {
    // A failed or cancelled read must not poison the cache.
    detailCache.delete(key)
    throw error
  })
  detailCache.set(key, pending)
  return pending
}

/**
 * Warm the cache for one item, ignoring failures.
 *
 * Called from an idle loop so the work never competes with the grid's own
 * rendering; a miss simply means the hover falls back to a normal request.
 * @param routePath - bridge base pathname.
 * @param id - snapshot row id.
 */
export function prefetchItemDetail(routePath: string, id: string): void {
  const key = cacheKey(routePath, id)
  if (detailCache.has(key)) return
  const pending = fetchItemDetail(routePath, id, new AbortController().signal).catch(() => {
    detailCache.delete(key)
    return undefined as unknown as ItemDetailView
  })
  detailCache.set(key, pending)
}

/**
 * Ask the host to run one account write.
 * @param routePath - bridge base pathname.
 * @param request - what to do.
 * @param itemName - the tool needs the display name for move and lock.
 * @param signal - caller-owned cancellation.
 */
export async function postAction(
  routePath: string,
  request: ActionRequest,
  itemName: string,
  signal: AbortSignal,
): Promise<ActionReceipt> {
  const response = await fetch(`${routePath}/action`, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ request, itemName }),
  })
  const body = (await response.json()) as BridgeResponse<ActionReceipt>
  if (body.ok !== true) {
    if (body.error.code === 'NotFound') throw new BridgeError(body.error.code, STALE_HOST_MESSAGE)
    throw new BridgeError(body.error.code, body.error.message)
  }
  return body.data
}

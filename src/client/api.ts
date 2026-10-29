import type { BridgeResponse, InventorySnapshot, PlayerProfileView } from '../mcp/types'

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

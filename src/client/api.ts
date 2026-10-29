import type { BridgeResponse, PlayerProfileView } from '../mcp/types'

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
 * Read the account header and characters.
 * @param routePath - bridge base pathname, as configured on the host half.
 * @param signal - caller-owned cancellation.
 */
export async function fetchCharacters(
  routePath: string,
  signal: AbortSignal,
): Promise<PlayerProfileView> {
  const response = await fetch(`${routePath}/characters`, { signal, headers: { accept: 'application/json' } })
  const body = (await response.json()) as BridgeResponse<PlayerProfileView>
  if (body.ok !== true) {
    throw new BridgeError(body.error.code, body.error.message)
  }
  if (!response.ok) throw new BridgeError('http', `bridge answered ${response.status}`)
  return body.data
}

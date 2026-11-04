/**
 * Read-only token provider over the MCP's token file.
 *
 * Transitional (P0-c): the MCP is the only writer and the only refresher. This
 * provider therefore:
 *  - re-reads the file on EVERY call (no long-lived cache — the MCP rotates the
 *    token underneath us and a stale copy is the one bug we cannot detect);
 *  - never returns, logs or keeps the refresh token;
 *  - never refreshes; an expired token is reported, not repaired.
 *
 * It tolerates the writer's atomic replace (`write temp + os.replace`): a read
 * that lands inside that window gets ENOENT/partial data, so reads retry
 * briefly before declaring failure.
 */
import { readFile } from 'node:fs/promises'
import { AuthUnavailableError } from './types'
import type { AccessToken, AuthFailure, TokenProvider } from './types'

export interface FileTokenProviderOptions {
  /** Absolute path to the JSON token file. */
  path: string
  /** Treat the token as expired this many seconds early. Defaults to 60. */
  expirySkewSeconds?: number
  /** Total read attempts before giving up. Defaults to 3. */
  attempts?: number
  /** Delay between attempts, milliseconds. Defaults to 40. */
  retryDelayMs?: number
  /** Injectable clock (ms since epoch) for tests. */
  now?: () => number
}

/** The subset of the file this provider is willing to look at. */
interface TokenFileShape {
  access_token?: unknown
  expires_at?: unknown
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Classify a JSON.parse / type failure as malformed rather than missing. */
function malformed(detail: string): AuthUnavailableError {
  return new AuthUnavailableError('malformed', `token file has no usable access_token (${detail})`)
}

/** Narrow the raw file content to the two fields we consume. */
function readTokenFields(raw: string): { value: string; expiresAt: number } {
  let parsed: TokenFileShape
  try {
    parsed = JSON.parse(raw) as TokenFileShape
  } catch (error) {
    throw malformed(error instanceof Error ? error.message : 'invalid JSON')
  }
  if (parsed === null || typeof parsed !== 'object') throw malformed('not an object')
  const value = parsed.access_token
  if (typeof value !== 'string' || value === '') throw malformed('access_token is not a string')
  const rawExpiry = parsed.expires_at
  const expiresAt = typeof rawExpiry === 'number' && Number.isFinite(rawExpiry) ? rawExpiry : 0
  return { value, expiresAt }
}

/**
 * Reads one token file per call and reports problems as typed failures.
 */
export class FileTokenProvider implements TokenProvider {
  private readonly path: string
  private readonly expirySkewSeconds: number
  private readonly attempts: number
  private readonly retryDelayMs: number
  private readonly now: () => number

  constructor(options: FileTokenProviderOptions) {
    this.path = options.path
    this.expirySkewSeconds = options.expirySkewSeconds ?? 60
    this.attempts = Math.max(1, options.attempts ?? 3)
    this.retryDelayMs = options.retryDelayMs ?? 40
    this.now = options.now ?? Date.now
  }

  /**
   * Current access token, or a typed failure explaining why there is none.
   * @returns the token and its absolute expiry (epoch seconds, `0` if unknown).
   */
  async getAccessToken(): Promise<AccessToken> {
    const { value, expiresAt } = readTokenFields(await this.readWithRetry())
    if (expiresAt > 0) {
      const nowSeconds = this.now() / 1000
      if (nowSeconds >= expiresAt - this.expirySkewSeconds) {
        const secondsLeft = Math.round(expiresAt - nowSeconds)
        throw new AuthUnavailableError(
          'expired',
          `access token is expired or about to expire (${secondsLeft}s left); ` +
            'this provider never refreshes — start the MCP so it can renew the token',
        )
      }
    }
    return { value, expiresAt }
  }

  /** Read the file, retrying the transient window of the writer's atomic replace. */
  private async readWithRetry(): Promise<string> {
    let lastFailure: AuthUnavailableError | undefined
    for (let attempt = 1; attempt <= this.attempts; attempt += 1) {
      try {
        return await readFile(this.path, 'utf8')
      } catch (error) {
        lastFailure = this.classifyReadError(error)
        if (attempt < this.attempts) await sleep(this.retryDelayMs)
      }
    }
    throw lastFailure ?? new AuthUnavailableError('unreadable', `cannot read ${this.path}`)
  }

  /** ENOENT means "no token configured"; everything else is an I/O problem. */
  private classifyReadError(error: unknown): AuthUnavailableError {
    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
    if (code === 'ENOENT') {
      return new AuthUnavailableError('missing', `no token file at ${this.path}`)
    }
    const detail = error instanceof Error ? error.message : String(error)
    return new AuthUnavailableError('unreadable', `cannot read ${this.path}: ${detail}`)
  }
}

/**
 * Convenience factory for the transitional wiring.
 * @param path - absolute token file path.
 */
export function fileTokenProvider(path: string): FileTokenProvider {
  return new FileTokenProvider({ path })
}

/** Re-exported so callers only need this module for the auth failure type. */
export type { AuthFailure }

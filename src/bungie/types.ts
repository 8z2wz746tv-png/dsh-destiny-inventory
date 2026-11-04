/**
 * Authentication seam for the host-side Bungie client.
 *
 * Everything below the seam (GetProfile, Manifest, Inventory) must not know
 * where a token comes from. Today it is a read-only view of the MCP's token
 * file; later it is the OAuth broker. Swapping the provider must not touch the
 * business layer — that is the whole point of this file existing.
 */

/** One usable bearer token. */
export interface AccessToken {
  /** Raw OAuth access token value. */
  value: string
  /** Expiry as epoch seconds; `0` means upstream did not say. */
  expiresAt: number
}

/** Why authentication is not available right now. */
export type AuthFailure =
  | 'missing' // no token file / no token configured
  | 'unreadable' // file exists but cannot be read (permissions, I/O)
  | 'malformed' // file exists but does not carry the expected fields
  | 'expired' // token is present but past its expiry

/** Raised for every "we cannot authenticate" case; never thrown for network faults. */
export class AuthUnavailableError extends Error {
  readonly reason: AuthFailure

  constructor(reason: AuthFailure, message: string) {
    super(message)
    this.name = 'AuthUnavailableError'
    this.reason = reason
  }
}

/**
 * Supplies the current access token.
 *
 * `getAccessToken` is called before every upstream request: implementations
 * must read fresh state each time and must never cache a token past its expiry.
 */
export interface TokenProvider {
  getAccessToken(): Promise<AccessToken>
}

/**
 * Minimal Bungie Platform client for the host data plane.
 *
 * Two responsibilities only: attach credentials (`X-API-Key` + bearer) and turn
 * upstream failures into typed errors. Profile/Manifest/Inventory semantics live
 * in their own modules so a token-source change never reaches them.
 */
import type { TokenProvider } from './types'

/** Bungie wraps every platform answer in this envelope. */
export interface BungieEnvelope<T> {
  Response: T
  ErrorCode: number
  ErrorStatus: string
  Message: string
  ThrottleSeconds?: number
}

/** One upstream rejection, with the Bungie error code kept intact. */
export class BungieApiError extends Error {
  /** HTTP status. */
  readonly status: number
  /** Bungie `ErrorCode` when the body carried one. */
  readonly code: number | undefined
  /** Bungie `ErrorStatus`, e.g. `OriginHeaderDoesNotMatchKey`. */
  readonly errorStatus: string

  constructor(status: number, code: number | undefined, errorStatus: string, message: string) {
    super(message)
    this.name = 'BungieApiError'
    this.status = status
    this.code = code
    this.errorStatus = errorStatus
  }
}

export interface BungieClientOptions {
  /** Platform API key. Must belong to the same application that issued the token. */
  apiKey: string
  /** Current-token source; consulted before every request. */
  tokenProvider: TokenProvider
  /** Defaults to the public platform host. */
  baseUrl?: string
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch
}

/** Query values are dropped when `undefined` so callers can pass optionals. */
export type QueryValues = Record<string, string | number | undefined>

/**
 * How long one upstream call may hang.
 *
 * Measured `GetProfile` for a single account at 0.6 s on a good minute and 14.7 s on
 * a bad one; without a ceiling the request — and the refresh button behind it —
 * waits for as long as Bungie does. This is an engineering default, not a measured
 * P95: there are too few samples for that, and it should move once there are.
 */
export const UPSTREAM_TIMEOUT_MS = 20_000

/**
 * Translate the handful of upstream failures that have a known operator action.
 * Unknown codes keep Bungie's own text.
 */
export function describeBungieError(code: number | undefined, status: number, fallback: string): string {
  switch (code) {
    case 5:
      return 'Bungie 平台暂时停服维护。'
    case 99:
    case 2107:
      return '请求被上游拒绝：应用未登记来源（Origin）或值不匹配。'
    case 1601:
      return '该账号没有 Destiny 2 档案。'
    case 1663:
      return '这条写入只能在游戏里完成（This action can only be done in-game.）。'
    case 8:
      return '参数越界（ParameterInvalidRange）：最常见是 membershipType 写死。' +
        'token 里的 membership_id 是 Bungie.net 的 id，不是 GetProfile 要的 Destiny id。'
    case 2100:
      return 'Bungie 接口不支持该参数组合（参数非法）。'
    default:
      if (status === 401) return '凭据无效或已过期。'
      if (status === 429) return '请求过于频繁，被上游限流。'
      // Upstream sentences are English and often name the fix; translate the ones
      // a player actually meets rather than showing them the raw text.
      return CHINESE_BY_UPSTREAM.find(([needle]) => fallback.includes(needle))?.[1] ?? fallback
  }
}

/** Upstream sentences worth translating, matched on a distinctive fragment. */
const CHINESE_BY_UPSTREAM: [string, string][] = [
  [
    'logged in with a character',
    '游戏里没有活跃角色：进一次游戏（主菜单或轨道即可）再试。Bungie 要求角色在线才能移动或装备物品。',
  ],
  ['ThrottledByGameServer', '操作太快，被游戏服务器限流：等几秒再试。'],
  ['ItemNotFound', '这件物品已经不在了：刷新一下再操作。'],
  ['DestinyItemNotFound', '这件物品已经不在了：刷新一下再操作。'],
  ['not found', '上游找不到这个对象：刷新一下再试。'],
]

/**
 * One client per process is enough: it holds no state beyond its options.
 */
export class BungieClient {
  private readonly apiKey: string
  private readonly tokenProvider: TokenProvider
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(options: BungieClientOptions) {
    this.apiKey = options.apiKey
    this.tokenProvider = options.tokenProvider
    this.baseUrl = options.baseUrl ?? 'https://www.bungie.net'
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  /**
   * GET one platform path and unwrap its envelope.
   * @param path - path below `/Platform`, e.g. `/Destiny2/3/Profile/123/`.
   * @param query - optional query values; `undefined` entries are omitted.
   * @returns the envelope's `Response` body.
   * @throws AuthUnavailableError when no usable token exists.
   * @throws BungieApiError when upstream answers with a non-success envelope.
   */
  async get<T>(path: string, query: QueryValues = {}): Promise<T> {
    const token = await this.tokenProvider.getAccessToken()
    const url = new URL(`${this.baseUrl}/Platform${path}`)
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
    // A hang is a failure, not an indefinite wait: abort and say so.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey,
          Authorization: `Bearer ${token.value}`,
          accept: 'application/json',
        },
        signal: controller.signal,
      })
    } catch (error) {
      if (controller.signal.aborted) {
        throw new BungieApiError(504, undefined, 'UpstreamTimeout', `Bungie ${UPSTREAM_TIMEOUT_MS / 1000} 秒没有回应`)
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
    const text = await response.text()
    let envelope: BungieEnvelope<T> | undefined
    try {
      envelope = JSON.parse(text) as BungieEnvelope<T>
    } catch {
      envelope = undefined
    }
    if (!response.ok || envelope === undefined || typeof envelope.ErrorCode !== 'number') {
      const detail = envelope?.Message || envelope?.ErrorStatus || text.slice(0, 200) || 'empty body'
      const code = envelope?.ErrorCode
      throw new BungieApiError(
        response.status,
        code,
        envelope?.ErrorStatus ?? '',
        describeBungieError(code, response.status, detail),
      )
    }
    if (envelope.ErrorCode !== 1) {
      throw new BungieApiError(
        response.status,
        envelope.ErrorCode,
        envelope.ErrorStatus,
        describeBungieError(envelope.ErrorCode, response.status, envelope.Message || envelope.ErrorStatus),
      )
    }
    return envelope.Response
  }

  /**
   * POST one platform action and unwrap its envelope.
   *
   * The write endpoints take a JSON body and answer with the same envelope shape
   * as reads, so the decode path is shared.
   * @param path - path below `/Platform`, e.g. `/Destiny2/Actions/Items/EquipItem/`.
   * @param body - the action payload.
   * @returns the envelope's `Response` body.
   * @throws AuthUnavailableError when no usable token exists.
   * @throws BungieApiError when upstream answers with a non-success envelope.
   */
  async post<T>(path: string, body: unknown): Promise<T> {
    const token = await this.tokenProvider.getAccessToken()
    const response = await this.fetchImpl(new URL(`${this.baseUrl}/Platform${path}`), {
      method: 'POST',
      headers: {
        'X-API-Key': this.apiKey,
        Authorization: `Bearer ${token.value}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
    })
    const text = await response.text()
    let envelope: BungieEnvelope<T> | undefined
    try {
      envelope = JSON.parse(text) as BungieEnvelope<T>
    } catch {
      envelope = undefined
    }
    const code = envelope?.ErrorCode
    if (!response.ok || envelope === undefined || typeof code !== 'number' || code !== 1) {
      const detail = envelope?.Message || envelope?.ErrorStatus || text.slice(0, 200) || 'empty body'
      throw new BungieApiError(
        response.status,
        code,
        envelope?.ErrorStatus ?? '',
        describeBungieError(code, response.status, detail),
      )
    }
    return envelope.Response
  }
}

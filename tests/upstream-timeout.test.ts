/**
 * 上游挂死时必须变成一次失败，而不是无限等待。
 *
 * 实测 Bungie 的 `GetProfile` 在 0.6 到 14.7 秒之间跳；没有上限时，请求会一直挂着，
 * 刷新按钮也就一直转圈。20 秒是工程初值，不是测出来的 P95。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BungieApiError, BungieClient, UPSTREAM_TIMEOUT_MS } from '../src/bungie/client'

/** A fetch that never answers on its own, but rejects when aborted. */
const hangingFetch = (_url: unknown, init?: { signal?: AbortSignal }) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
  })

function client(fetchImpl: typeof fetch): BungieClient {
  return new BungieClient({
    apiKey: 'k',
    tokenProvider: { getAccessToken: async () => ({ value: 't', expiresAt: 0 }) } as never,
    fetchImpl,
  })
}

afterEach(() => {
  vi.useRealTimers()
})

describe('upstream timeout', () => {
  it('turns a hang into a named failure instead of waiting forever', async () => {
    vi.useFakeTimers()
    const promise = client(hangingFetch as never).get('/Destiny2/3/Profile/1/')
    const assertion = expect(promise).rejects.toBeInstanceOf(BungieApiError)
    await vi.advanceTimersByTimeAsync(UPSTREAM_TIMEOUT_MS)
    await assertion
    // Injectable violation: drop the timer and this never settles — the panel spins
    // for as long as Bungie does.
    const failure = await promise.catch((error: unknown) => error)
    expect((failure as BungieApiError).errorStatus).toBe('UpstreamTimeout')
  })

  it('does not trip when the answer is quick', async () => {
    vi.useFakeTimers()
    const ok = { ok: true, status: 200, text: async () => JSON.stringify({ ErrorCode: 1, Response: { x: 1 } }) }
    const promise = client((() => Promise.resolve(ok)) as never).get('/x')
    await vi.advanceTimersByTimeAsync(100)
    await expect(promise).resolves.toEqual({ x: 1 })
  })
})

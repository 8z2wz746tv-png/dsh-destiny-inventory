import { describe, expect, it, vi, afterEach } from 'vitest'
import { BridgeError, STALE_HOST_MESSAGE, fetchInventory } from '../src/client/api'

/** Stub global fetch with one JSON answer. */
function stubFetch(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: status < 400, status, json: async () => body })),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('bridge error mapping', () => {
  it('turns a missing route into the restart instruction, not the raw code', async () => {
    stubFetch(404, { ok: false, error: { code: 'NotFound', message: 'no bridge route for /inventory' } })
    await expect(fetchInventory('/dsh-destiny-inventory', new AbortController().signal)).rejects.toThrow(
      STALE_HOST_MESSAGE,
    )
  })

  it('keeps every other failure as upstream wrote it', async () => {
    stubFetch(502, { ok: false, error: { code: 'DestinyToolFailedError', message: 'Bungie 授权已过期' } })
    const error = await fetchInventory('/dsh-destiny-inventory', new AbortController().signal).catch(
      (thrown: unknown) => thrown,
    )
    expect(error).toBeInstanceOf(BridgeError)
    expect((error as BridgeError).message).toBe('Bungie 授权已过期')
    expect((error as BridgeError).code).toBe('DestinyToolFailedError')
  })

  it('returns the payload when the bridge answers', async () => {
    const snapshot = { fetchedAt: 1, total: 0, items: [], truncated: false }
    stubFetch(200, { ok: true, data: snapshot })
    await expect(fetchInventory('/dsh-destiny-inventory', new AbortController().signal)).resolves.toEqual(
      snapshot,
    )
  })
})

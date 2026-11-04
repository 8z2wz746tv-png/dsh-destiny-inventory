import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FileTokenProvider, fileTokenProvider } from '../src/bungie/token-file-provider'
import { AuthUnavailableError } from '../src/bungie/types'

/** A token file the writer would leave behind, minus the refresh token we must ignore. */
function tokenBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    access_token: 'CI75-access',
    refresh_token: 'CI75-refresh',
    expires_at: 10_000,
    membership_id: '24481657',
    ...overrides,
  })
}

describe('FileTokenProvider', () => {
  let dir: string
  let path: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dsh-token-'))
    path = join(dir, 'tokens.json')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns the access token when it is still valid', async () => {
    await writeFile(path, tokenBody())
    const provider = new FileTokenProvider({ path, now: () => 1_000_000 })
    await expect(provider.getAccessToken()).resolves.toEqual({ value: 'CI75-access', expiresAt: 10_000 })
  })

  it('never exposes the refresh token', async () => {
    await writeFile(path, tokenBody())
    const provider = new FileTokenProvider({ path, now: () => 1_000_000 })
    const token = await provider.getAccessToken()
    expect(Object.keys(token).sort()).toEqual(['expiresAt', 'value'])
    expect(JSON.stringify(token)).not.toContain('refresh')
  })

  it('re-reads the file on every call', async () => {
    await writeFile(path, tokenBody({ access_token: 'first' }))
    const provider = new FileTokenProvider({ path, now: () => 1_000_000 })
    await expect(provider.getAccessToken()).resolves.toMatchObject({ value: 'first' })
    await writeFile(path, tokenBody({ access_token: 'second' }))
    await expect(provider.getAccessToken()).resolves.toMatchObject({ value: 'second' })
  })

  it('reports a missing file as "missing" without throwing raw ENOENT', async () => {
    const provider = new FileTokenProvider({ path, attempts: 2, retryDelayMs: 1 })
    const failure = await provider.getAccessToken().catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(AuthUnavailableError)
    expect((failure as AuthUnavailableError).reason).toBe('missing')
  })

  it('reports invalid JSON as "malformed"', async () => {
    await writeFile(path, '{not json')
    const provider = new FileTokenProvider({ path, attempts: 1 })
    const failure = await provider.getAccessToken().catch((error: unknown) => error)
    expect((failure as AuthUnavailableError).reason).toBe('malformed')
  })

  it('reports a file without access_token as "malformed"', async () => {
    await writeFile(path, JSON.stringify({ refresh_token: 'only-refresh' }))
    const provider = new FileTokenProvider({ path, attempts: 1 })
    const failure = await provider.getAccessToken().catch((error: unknown) => error)
    expect((failure as AuthUnavailableError).reason).toBe('malformed')
  })

  it('reports an expired token instead of refreshing it', async () => {
    await writeFile(path, tokenBody({ expires_at: 1_000 }))
    const provider = new FileTokenProvider({ path, now: () => 2_000_000 })
    const failure = await provider.getAccessToken().catch((error: unknown) => error)
    expect((failure as AuthUnavailableError).reason).toBe('expired')
    expect(String((failure as Error).message)).toContain('never refreshes')
  })

  it('treats a token inside the expiry skew as expired', async () => {
    await writeFile(path, tokenBody({ expires_at: 10_060 }))
    const provider = new FileTokenProvider({ path, now: () => 10_000_000 }) // nowSeconds = 10000
    const failure = await provider.getAccessToken().catch((error: unknown) => error)
    expect((failure as AuthUnavailableError).reason).toBe('expired')
  })

  it('keeps working when expiry is absent', async () => {
    await writeFile(path, tokenBody({ expires_at: undefined }))
    const provider = new FileTokenProvider({ path, now: () => 10_000_000 })
    await expect(provider.getAccessToken()).resolves.toMatchObject({ value: 'CI75-access', expiresAt: 0 })
  })

  it('retries the transient window of the writer atomic replace', async () => {
    const provider = new FileTokenProvider({ path, attempts: 3, retryDelayMs: 30, now: () => 1_000_000 })
    const pending = provider.getAccessToken()
    // Simulate the writer: file appears only after the first read attempt fails.
    setTimeout(() => void writeFile(path, tokenBody()), 10)
    await expect(pending).resolves.toMatchObject({ value: 'CI75-access' })
  })

  it('factory wires the same defaults', async () => {
    await writeFile(path, tokenBody())
    const provider = fileTokenProvider(path)
    expect(provider).toBeInstanceOf(FileTokenProvider)
  })
})

/**
 * 腾格判据，照 MCP 的 ADR-029（那边照的 DIM）。
 *
 * 这些测试守的是"绝不腾"那五条：判据错一件，用户的装备就被搬走了。
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/bungie/write', () => ({ transferItem: vi.fn(async () => undefined) }))

const { transferItem } = (await import('../src/bungie/write')) as unknown as {
  transferItem: ReturnType<typeof vi.fn>
}
const { makeRoom, ensureRoom } = await import('../src/host/make-room')
const { BridgeFault } = await import('../src/host/http')
const { BungieApiError } = await import('../src/bungie/client')

const BUCKET = 953998645

const piece = (over: Record<string, unknown> = {}) => ({
  instanceId: 'i1',
  itemHash: 100,
  characterId: 'warlock-id',
  bucketHash: BUCKET,
  source: 'character-inventory',
  equipped: false,
  locked: false,
  transferStatus: 0,
  power: 550,
  masterwork: false,
  crafted: false,
  ...over,
})

function deps(items: ReturnType<typeof piece>[], itemCount = 3) {
  return {
    client: {} as never,
    target: { membershipType: 3, membershipId: '42' } as never,
    snapshot: async () => ({ items }) as never,
    definitions: () =>
      ({
        bucket: () => ({ hash: BUCKET, name: '威能武器', category: null, location: 0, itemCount, hasTransferDestination: false }),
        item: (hash: number) => ({ name: `物品${hash}`, tierType: hash === 999 ? 6 : 5 }),
      }) as never,
    invalidate: vi.fn(),
  }
}

const full = [piece({ instanceId: 'a' }), piece({ instanceId: 'b' }), piece({ instanceId: 'c' })]

describe('makeRoom', () => {
  it('moves the lowest-ranked spare into the vault', async () => {
    transferItem.mockClear()
    const items = [
      piece({ instanceId: 'high', power: 600 }),
      piece({ instanceId: 'low', power: 500 }),
      piece({ instanceId: 'exotic', itemHash: 999, power: 400 }),
    ]
    const moved = await makeRoom(deps(items), 'warlock-id', BUCKET, 'incoming', '术士')
    // Lower tier wins over lower power: the exotic stays even though it is weakest.
    expect(moved).toBe('物品100')
    expect(transferItem).toHaveBeenCalledTimes(1)
    const [, , instanceId, , toVault, from] = transferItem.mock.calls[0] as unknown[]
    expect(toVault).toBe(true)
    expect(from).toBe('warlock-id')
    expect(['high', 'low']).toContain(instanceId as string)
  })

  it('never moves something that is equipped, locked or not transferable', async () => {
    transferItem.mockClear()
    const items = [
      piece({ instanceId: 'worn', equipped: true, power: 1 }),
      piece({ instanceId: 'locked', locked: true, power: 1 }),
      piece({ instanceId: 'stuck', transferStatus: 1, power: 1 }),
      piece({ instanceId: 'incoming', power: 1 }),
      piece({ instanceId: 'spare', power: 900 }),
    ]
    const moved = await makeRoom(deps(items), 'warlock-id', BUCKET, 'incoming', '术士')
    // Injectable violation: drop any of those guards and something the player is
    // using, protecting or cannot move gets taken away.
    expect(moved).toBe('物品100')
    expect((transferItem.mock.calls[0] as unknown[])[2]).toBe('spare')
  })

  it('ignores copies already in the vault', async () => {
    transferItem.mockClear()
    const items = [
      piece({ instanceId: 'vaulted', source: 'vault', characterId: null, power: 1 }),
      // Postmaster rows carry an owner but cannot be transferred out directly, so
      // the source check — not the owner check — is what excludes them.
      piece({ instanceId: 'mailed', source: 'postmaster', power: 1 }),
      piece({ instanceId: 'spare', power: 800 }),
    ]
    const moved = await makeRoom(deps(items), 'warlock-id', BUCKET, 'incoming', '术士')
    // "Moving a vault item into the vault" changes nothing; the MCP shipped that bug
    // once and only found it on a real account.
    expect((transferItem.mock.calls[0] as unknown[])[2]).toBe('spare')
    expect(transferItem).toHaveBeenCalledTimes(1)
    expect(moved).toBe('物品100')
  })

  it('refuses honestly when nothing may be moved', async () => {
    transferItem.mockClear()
    const items = [piece({ instanceId: 'worn', equipped: true }), piece({ instanceId: 'locked', locked: true })]
    const failure = await makeRoom(deps(items), 'warlock-id', BUCKET, 'incoming', '术士').catch(
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(BridgeFault)
    expect((failure as InstanceType<typeof BridgeFault>).message).toContain('没有可以腾的')
    expect(transferItem).not.toHaveBeenCalled()
  })

  it('reports a full vault instead of recursively squeezing it', async () => {
    transferItem.mockRejectedValueOnce(
      new BungieApiError(400, 1642, 'DestinyNoRoomInDestination', 'There are no item slots available'),
    )
    const failure = await makeRoom(deps(full), 'warlock-id', BUCKET, 'incoming', '术士').catch(
      (error: unknown) => error,
    )
    expect((failure as InstanceType<typeof BridgeFault>).message).toContain('仓库也满了')
    expect(transferItem).toHaveBeenCalledTimes(1)
  })
})

describe('ensureRoom', () => {
  it('does nothing when the bucket has space', async () => {
    transferItem.mockClear()
    const freed = await ensureRoom(deps(full, 10), 'warlock-id', BUCKET, 'incoming', '术士')
    expect(freed).toBeNull()
    expect(transferItem).not.toHaveBeenCalled()
  })

  it('makes room when the bucket is full and says what it moved', async () => {
    transferItem.mockClear()
    const items = [piece({ instanceId: 'a' }), piece({ instanceId: 'b' }), piece({ instanceId: 'c' })]
    const freed = await ensureRoom(deps(items, 3), 'warlock-id', BUCKET, 'incoming', '术士')
    // Injectable violation: skip the move and the transfer that follows fails
    // upstream with the message this whole change exists to replace.
    expect(freed).toBe('物品100')
    expect(transferItem).toHaveBeenCalledTimes(1)
  })

  it('stays out of the way when the manifest publishes no capacity', async () => {
    transferItem.mockClear()
    const freed = await ensureRoom(deps(full, 0), 'warlock-id', BUCKET, 'incoming', '术士')
    expect(freed).toBeNull()
    expect(transferItem).not.toHaveBeenCalled()
  })
})

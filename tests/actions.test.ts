import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import {
  ActionRefusedError,
  buildActionArgs,
  buildReplayArguments,
  replayArguments,
  runAction,
  summarizeAction,
} from '../src/mcp/actions'

/** Envelope wrapper: responses go out as MCP content blocks holding JSON text. */
function envelope(body: Record<string, unknown>): { isError: false; value: unknown; content: [] } {
  return {
    isError: false,
    value: { content: [{ type: 'text', text: JSON.stringify(body) }] },
    content: [],
  }
}

/**
 * One confirmation envelope, copied from a real answer observed against the live
 * tool. Note what is **absent**: `locked` never appears in the replay payload,
 * which is exactly why this plugin does not send it.
 */
const CONFIRMATION = {
  ok: false,
  error: { code: 'confirmation_required', message: 'lock 会修改账号状态。' },
  candidates: [
    {
      intent: 'lock',
      item_name: '',
      item_instance_id: '42',
      item_instance_ids: [],
      destination: '',
      character: '',
    },
  ],
  next_actions: [
    {
      label: '确认后原样重发这次调用（只补 confirmed=true，参数一个不改）',
      arguments: {
        intent: 'lock',
        player_name: '__destiny_current_oauth_player__',
        item_name: '',
        item_instance_id: '42',
        item_instance_ids: [],
        destination: '',
        character: '',
        confirmed: true,
      },
    },
  ],
  warnings: [],
}

/** Registry stub replaying a scripted sequence of results. */
function fakeContext(results: unknown[]): { ctx: Context; calls: Record<string, unknown>[] } {
  const calls: Record<string, unknown>[] = []
  let index = 0
  const execute = vi.fn(async (input: Record<string, unknown>) => {
    calls.push(input.arguments as Record<string, unknown>)
    const next = results[Math.min(index, results.length - 1)]
    index += 1
    return next
  })
  const ctx = { tools: { get: vi.fn(() => ({ name: 'probe' })), execute } } as unknown as Context
  return { ctx, calls }
}

describe('buildActionArgs', () => {
  it('always carries the item name, which move and lock require', () => {
    const args = buildActionArgs({ kind: 'move', instanceId: '42', destination: 'vault' }, '弑后者')
    expect(args.item_name).toBe('弑后者')
    expect(args.item_instance_id).toBe('42')
    expect(args.destination).toBe('vault')
  })

  it('never sends confirmed, so the envelope always comes back first', () => {
    const args = buildActionArgs({ kind: 'lock', instanceId: '42', locked: true }, 'x')
    expect(args.confirmed).toBeUndefined()
  })

  it('passes the character for equip', () => {
    const args = buildActionArgs({ kind: 'equip', instanceId: '42', character: 'hunter' }, 'x')
    expect(args.character).toBe('hunter')
  })
})

describe('buildReplayArguments', () => {
  it('keeps locked=false, which the envelope drops', () => {
    const replay = buildReplayArguments({ kind: 'lock', instanceId: '42', locked: false }, '弑后者')
    expect(replay.locked).toBe(false)
    expect(replay.confirmed).toBe(true)
  })

  it('keeps the destination and item name for a move', () => {
    const replay = buildReplayArguments({ kind: 'move', instanceId: '42', destination: 'vault' }, '弑后者')
    expect(replay).toMatchObject({ destination: 'vault', item_name: '弑后者', confirmed: true })
  })

  it('proves the envelope alone would have lost the lock value', () => {
    const fromEnvelope = replayArguments(CONFIRMATION)
    expect(fromEnvelope).not.toHaveProperty('locked')
  })
})

describe('replayArguments', () => {
  it('returns the payload the tool handed back, lossy fields included', () => {
    expect(replayArguments(CONFIRMATION)).toEqual(CONFIRMATION.next_actions[0].arguments)
  })

  it('falls back to the candidate plus confirmed when no next_action exists', () => {
    const body = { ok: false, candidates: [{ intent: 'lock', item_instance_id: '7' }] }
    expect(replayArguments(body)).toEqual({ intent: 'lock', item_instance_id: '7', confirmed: true })
  })

  it('returns undefined rather than inventing arguments', () => {
    expect(replayArguments({ ok: false })).toBeUndefined()
  })
})

describe('summarizeAction', () => {
  it('names the item being displaced when equipping', () => {
    expect(
      summarizeAction({ kind: 'equip', instanceId: '1' }, '弑后者', { replaces: '驱逐引擎' }),
    ).toBe('装备「弑后者」（会顶掉「驱逐引擎」）')
  })

  it('does not claim a displacement it was not told about', () => {
    expect(summarizeAction({ kind: 'equip', instanceId: '1' }, '弑后者')).toBe('装备「弑后者」')
  })
})

describe('runAction', () => {
  it('moves in one round trip: preview, then the envelope replay', async () => {
    const { ctx, calls } = fakeContext([
      envelope(CONFIRMATION),
      envelope({ ok: true, summary: '移动流程已执行。' }),
    ])
    const receipt = await runAction(ctx, 'destiny', { kind: 'move', instanceId: '42', destination: 'vault' }, '弑后者')
    expect(receipt.applied).toBe(true)
    expect(receipt.message).toBe('移动流程已执行。')
    expect(calls).toHaveLength(2)
    expect(calls[1].confirmed).toBe(true)
  })

  it('stops at the preview for equip so the card can show the displaced item', async () => {
    const { ctx, calls } = fakeContext([envelope(CONFIRMATION)])
    const receipt = await runAction(ctx, 'destiny', { kind: 'equip', instanceId: '42', character: 'hunter' }, '弑后者')
    expect(receipt.applied).toBe(false)
    expect(receipt.needsConfirm).toBe(true)
    expect(calls).toHaveLength(1)
  })

  it('executes equip once confirmed', async () => {
    const { ctx, calls } = fakeContext([
      envelope(CONFIRMATION),
      envelope({ ok: true, summary: '装备已执行。' }),
    ])
    const receipt = await runAction(
      ctx,
      'destiny',
      { kind: 'equip', instanceId: '42', character: 'hunter', confirmed: true },
      '弑后者',
    )
    expect(receipt.applied).toBe(true)
    expect(calls).toHaveLength(2)
  })

  it('surfaces a refusal with its own code instead of retrying', async () => {
    const { ctx, calls } = fakeContext([
      envelope({ ok: false, error: { code: 'invalid_arguments', message: '需要 物品名' } }),
    ])
    await expect(
      runAction(ctx, 'destiny', { kind: 'move', instanceId: '42', destination: 'vault' }, ''),
    ).rejects.toBeInstanceOf(ActionRefusedError)
    expect(calls).toHaveLength(1)
  })

  it('reports a failed replay rather than claiming success', async () => {
    const { ctx } = fakeContext([
      envelope(CONFIRMATION),
      envelope({ ok: false, error: { code: 'ItemNotFound', message: '找不到这件' } }),
    ])
    await expect(
      runAction(ctx, 'destiny', { kind: 'lock', instanceId: '42', locked: true }, 'x'),
    ).rejects.toThrow('找不到这件')
  })

  it('skips the envelope entirely when the tool already executed', async () => {
    const { ctx, calls } = fakeContext([envelope({ ok: true, summary: '锁定状态已更新。' })])
    const receipt = await runAction(ctx, 'destiny', { kind: 'lock', instanceId: '42', locked: true }, 'x')
    expect(receipt.applied).toBe(true)
    expect(calls).toHaveLength(1)
  })
})

import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import {
  DestinyToolFailedError,
  DestinyToolMissingError,
  callDestinyTool,
  destinyToolName,
} from '../src/mcp/client'

/** Minimal registry stand-in: only get() and execute() are reachable from the call layer. */
function fakeContext(options: {
  registered?: boolean
  result?: unknown
  isError?: boolean
  content?: { type: string; text?: string }[]
}): { ctx: Context; execute: ReturnType<typeof vi.fn> } {
  const get = vi.fn(() => (options.registered === false ? undefined : { name: 'probe' }))
  const execute = vi.fn(async () => ({
    isError: options.isError === true,
    value: options.result,
    content: options.content ?? [],
    error: { message: 'ToolFailed' },
  }))
  const ctx = { tools: { get, execute } } as unknown as Context
  return { ctx, execute }
}

/** The exact envelope shape destiny MCP tools answer with, condensed. */
function profileEnvelope(characters: unknown[]): unknown {
  const body = {
    ok: true,
    summary: '已读取玩家档案。',
    data: {
      profile: {
        display_name: 'OneTop丶Husky#6641',
        membership_id: '4611686018492803873',
        membership_type: 3,
        characters,
        triumph_score: 23650,
      },
    },
    candidates: [],
    next_actions: [],
    warnings: [],
  }
  return { content: [{ type: 'text', text: JSON.stringify(body) }] }
}

const HUNTER = {
  id: '2305843009679355779',
  class_type: 1,
  class_name: '猎人',
  light: 547,
  emblem_path: '/common/hunter.jpg',
  last_played: '2026-10-06T14:43:35Z',
}

describe('destinyToolName', () => {
  it('namespaces the tool the way dsh-mcp-client registers it', () => {
    expect(destinyToolName('destiny', 'player_assistant')).toBe('mcp__destiny__player_assistant')
  })
})

describe('callDestinyTool', () => {
  it('executes the registered tool without an agent or parent', async () => {
    const { ctx, execute } = fakeContext({ result: { content: [] } })
    await callDestinyTool(ctx, 'destiny', 'player_assistant', { intent: 'profile' })
    const input = execute.mock.calls[0][0] as Record<string, unknown>
    expect(input.name).toBe('mcp__destiny__player_assistant')
    expect(input.arguments).toEqual({ intent: 'profile' })
    expect(input.agent).toBeUndefined()
    expect(input.parent).toBeUndefined()
    expect(input.signal).toBeInstanceOf(AbortSignal)
  })

  it('fails loud when the server is not connected instead of returning empty data', async () => {
    const { ctx } = fakeContext({ registered: false })
    await expect(callDestinyTool(ctx, 'destiny', 'player_assistant', {})).rejects.toBeInstanceOf(
      DestinyToolMissingError,
    )
  })

  it('surfaces the upstream failure text, not a generic error', async () => {
    const { ctx } = fakeContext({
      isError: true,
      content: [{ type: 'text', text: 'Bungie 授权已过期' }],
    })
    await expect(callDestinyTool(ctx, 'destiny', 'player_assistant', {})).rejects.toThrow(
      'Bungie 授权已过期',
    )
  })

  it('rejects with the typed failure class so the bridge can map a code', async () => {
    const { ctx } = fakeContext({ isError: true })
    await expect(callDestinyTool(ctx, 'destiny', 'player_assistant', {})).rejects.toBeInstanceOf(
      DestinyToolFailedError,
    )
  })
})



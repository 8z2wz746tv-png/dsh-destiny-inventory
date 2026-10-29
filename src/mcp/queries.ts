import type { Context } from '@deepseek-ai/cordis'
import { callDestinyTool } from './client'
import type { CharacterRow, PlayerProfileView } from './types'

/**
 * Account reads the bridge exposes, kept separate from the HTTP layer so each
 * one is unit-testable against a fake tool registry.
 */

/** The tool envelope did not look like the MCP result this read requires. */
export class DestinyPayloadError extends Error {
  readonly read: string
  constructor(read: string, detail: string) {
    super(`Destiny read "${read}" returned an unexpected payload: ${detail}`)
    this.name = 'DestinyPayloadError'
    this.read = read
  }
}

/** One MCP content block, as far as this read cares. */
interface ContentBlock {
  type?: unknown
  text?: unknown
}

/**
 * Unwrap the MCP result envelope down to the tool's own JSON body.
 *
 * Every destiny tool answers with one text block whose body is the JSON
 * envelope `{ ok, summary, data, candidates, next_actions, warnings }`. Failing
 * here is deliberate: a silently empty character list would render as "your
 * account is empty" instead of "the read broke".
 * @param read - read identifier, used in the diagnostic.
 * @param value - the tool's canonical value.
 */
export function unwrapToolEnvelope(read: string, value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new DestinyPayloadError(read, `expected an object, got ${typeof value}`)
  }
  const content = (value as { content?: unknown }).content
  if (!Array.isArray(content) || content.length === 0) {
    throw new DestinyPayloadError(read, 'no content blocks')
  }
  const text = (content as ContentBlock[])
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('')
  if (text.length === 0) throw new DestinyPayloadError(read, 'no text block')
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new DestinyPayloadError(read, 'text block is not JSON')
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new DestinyPayloadError(read, 'envelope is not an object')
  }
  if ((parsed as { ok?: unknown }).ok === false) {
    const message = (parsed as { error?: { message?: unknown } }).error?.message
    throw new DestinyPayloadError(read, typeof message === 'string' ? message : 'ok=false')
  }
  return parsed as Record<string, unknown>
}

/** Read one character entry without inventing defaults for missing fields. */
function toCharacterRow(read: string, entry: unknown): CharacterRow {
  if (typeof entry !== 'object' || entry === null) {
    throw new DestinyPayloadError(read, 'character entry is not an object')
  }
  const row = entry as Record<string, unknown>
  const characterId = row.id
  const classType = row.class_type
  const light = row.light
  if (typeof characterId !== 'string' || typeof classType !== 'number' || typeof light !== 'number') {
    throw new DestinyPayloadError(read, 'character entry is missing id/class_type/light')
  }
  return {
    characterId,
    classType,
    className: typeof row.class_name === 'string' ? row.class_name : '',
    light,
    emblemPath: typeof row.emblem_path === 'string' ? row.emblem_path : null,
    lastPlayed: typeof row.last_played === 'string' ? row.last_played : null,
  }
}

/**
 * Read the account header and its three characters.
 * @param ctx - plugin context carrying the tool registry.
 * @param server - configured MCP server name.
 */
export async function readPlayerProfile(ctx: Context, server: string): Promise<PlayerProfileView> {
  const value = await callDestinyTool(ctx, server, 'player_assistant', { intent: 'profile' })
  const envelope = unwrapToolEnvelope('characters', value)
  const data = envelope.data
  if (typeof data !== 'object' || data === null) {
    throw new DestinyPayloadError('characters', 'envelope has no data')
  }
  const profile = (data as Record<string, unknown>).profile
  if (typeof profile !== 'object' || profile === null) {
    throw new DestinyPayloadError('characters', 'data has no profile')
  }
  const header = profile as Record<string, unknown>
  if (typeof header.display_name !== 'string' || typeof header.membership_id !== 'string') {
    throw new DestinyPayloadError('characters', 'profile is missing display_name/membership_id')
  }
  const characters = header.characters
  if (!Array.isArray(characters)) {
    throw new DestinyPayloadError('characters', 'profile has no characters array')
  }
  return {
    displayName: header.display_name,
    membershipId: header.membership_id,
    triumphScore: typeof header.triumph_score === 'number' ? header.triumph_score : null,
    characters: characters.map((entry) => toCharacterRow('characters', entry)),
  }
}

/**
 * Run one named account read.
 * @param ctx - plugin context carrying the tool registry.
 * @param server - configured MCP server name.
 * @param read - read identifier from the bridge path.
 */
export async function runInventoryQuery(
  ctx: Context,
  server: string,
  read: string,
): Promise<unknown> {
  switch (read) {
    case 'characters':
      return readPlayerProfile(ctx, server)
    default:
      throw new Error(`unknown inventory read "${read}"`)
  }
}

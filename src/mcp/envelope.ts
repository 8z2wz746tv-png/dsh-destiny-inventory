/**
 * MCP tool envelope parsing, for the write path.
 *
 * Split out of the retired read helpers: writes still go through the MCP tool, so
 * they still need to tell "the tool returned a payload" from "the tool failed".
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
export function parseToolEnvelope(read: string, value: unknown): Record<string, unknown> {
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
  return parsed as Record<string, unknown>
}

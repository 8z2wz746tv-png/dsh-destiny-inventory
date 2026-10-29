import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'

/**
 * Thin call layer over the MCP tools the host already connected.
 *
 * `dsh-mcp-client` registers every tool of a configured server on `ctx.tools`
 * as `mcp__<serverName>__<toolName>`, so the plugin executes the SAME live
 * connection the agent uses: no second child process, no second OAuth token.
 *
 * The call passes neither `agent` nor `parent`. `ToolRuntime.collapses()` only
 * hides a tool from a model-direct call under a PTC layer, and an unscoped
 * call resolves through `defaultMode`, so the lookup stays visible.
 */

/** A missing tool is a configuration fault, never an empty result. */
export class DestinyToolMissingError extends Error {
  readonly toolName: string
  constructor(toolName: string, server: string) {
    super(
      `Destiny MCP tool "${toolName}" is not registered. Check that ` +
        `${server} is configured in this profile's dsh-mcp-client row and connected.`,
    )
    this.name = 'DestinyToolMissingError'
    this.toolName = toolName
  }
}

/** The MCP call settled as an error result; the reason is upstream's own text. */
export class DestinyToolFailedError extends Error {
  readonly toolName: string
  constructor(toolName: string, reason: string) {
    super(`Destiny MCP tool "${toolName}" failed: ${reason}`)
    this.name = 'DestinyToolFailedError'
    this.toolName = toolName
  }
}

let callSeq = 0

/** Resolve the model-facing tool name for one MCP server tool. */
export function destinyToolName(server: string, tool: string): string {
  return `mcp__${server}__${tool}`
}

/**
 * Execute one already-connected MCP tool and return its canonical value.
 * @param ctx - plugin context carrying the tool registry.
 * @param server - configured MCP server name.
 * @param tool - MCP tool name, e.g. `player_assistant`.
 * @param args - tool arguments, validated by the tool itself.
 * @param timeoutMs - caller-owned cancellation budget.
 */
export async function callDestinyTool(
  ctx: Context,
  server: string,
  tool: string,
  args: unknown,
  timeoutMs = 30_000,
): Promise<unknown> {
  const name = destinyToolName(server, tool)
  if (ctx.tools.get(name) === undefined) throw new DestinyToolMissingError(name, server)
  callSeq += 1
  const input = {
    callId: `dsh-destiny-inventory:${callSeq}`,
    name,
    arguments: args,
    signal: AbortSignal.timeout(timeoutMs),
  } as unknown as Parameters<typeof ctx.tools.execute>[0]
  const result = await ctx.tools.execute(input)
  if (result.isError) {
    const reason = result.content
      .map((block: { type: string; text?: string }) =>
        block.type === 'text' ? (block.text ?? '') : `[${block.type}]`,
      )
      .join(' ')
      .slice(0, 400)
    throw new DestinyToolFailedError(name, reason || result.error.message)
  }
  return result.value
}

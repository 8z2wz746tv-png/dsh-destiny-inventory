/**
 * The two read-only tools the agent uses to answer "this one" / "just now".
 *
 * Named `destiny_workspace_*` because there are other `context`/`actions` concepts
 * in DSH; the workspace prefix says which panel they describe.
 *
 * Read-only by design. The agent looks at what the user is doing; it does not drive
 * the panel, and it does not write the account through these.
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import type { ContextStore } from './context-store'

/** Render structured data the way the model reads best: compact JSON. */
const asJson = (value: unknown): { type: 'text'; text: string }[] => [
  { type: 'text', text: JSON.stringify(value, null, 2) },
]

/** A plain-data copy; the registry validates the declared schema at runtime. */
const json = (value: unknown) => JSON.parse(JSON.stringify(value))

/**
 * Register both tools.
 * @param ctx - the plugin context.
 * @param store - the panel's context store.
 */
export function registerAgentTools(ctx: Context, store: ContextStore): void {
  ctx.tools.register(
    defineTool({
      name: 'destiny_workspace_view',
      description:
        'What the Destiny inventory panel is showing right now: character, filters, the selected item, and where the last drag was aimed. Use this when the user says "this one" / "这件" / "刚才那件" instead of asking them which item they mean.',
      parameters: {},
      output: { schema: { type: 'json' }, render: (_args, value) => asJson(value) },
      execute: async () => json(store.readView()),
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'destiny_workspace_journal',
      description:
        'Recent writes made through the panel: what moved, from where to where, whether it succeeded, and the upstream reason when it failed. Entries with source "external" are changes the panel observed but did not make — it does not know who made them, so do not attribute them to the user or to yourself. A "resolution" field means the failed write was later checked against Bungie. Use this for "just now" / "我刚拖的那件" / "刚才为什么失败".',
      parameters: {
        limit: { type: 'number', description: 'How many entries, default 20, max 200.' },
      },
      output: { schema: { type: 'json' }, render: (_args, value) => asJson(value) },
      execute: async ({ limit }) => json(store.recent(limit ?? 20)),
    }),
  )
}

import { homedir } from 'node:os'
import { join } from 'node:path'
import Schema from '@deepseek-ai/schemastery'

// Tunable configuration must be a Schemastery Schema, never a plain object:
// the harness validates it at load time and fails loud on invalid values, and
// every key can be changed from cordis.yml without editing code (guide §3.6).
export interface Config {
  /** MCP server name as registered in the profile (dsh-mcp-client `serverName`). */
  mcpServer: string
  /** Absolute pathname of the bridge route the browser half reads. */
  routePath: string
  /**
   * MCP token file the host half reads. Transitional: the MCP stays the only
   * writer and the only refresher; this side re-reads it per request and never
   * refreshes.
   */
  tokenPath: string
  /** Manifest sqlite holding item/bucket/plug definitions. */
  manifestPath: string
  /** Append-only write journal the agent reads to answer "did that work". */
  journalPath: string
  /** File that defines `BUNGIE_API_KEY` (MCP's .env until the broker exists). */
  apiKeyFile: string
}

export const Config: Schema<Config> = Schema.object({
  mcpServer: Schema.string()
    .default('destiny')
    .description('MCP server name registered by dsh-mcp-client (serverName).'),
  routePath: Schema.string()
    .default('/dsh-destiny-inventory')
    .description('Absolute pathname of the plugin HTTP bridge, no trailing slash.'),
  tokenPath: Schema.string()
    .default(join(homedir(), '.destiny_mcp', 'tokens.json'))
    .description('MCP token file (read-only; this side never refreshes it).'),
  journalPath: Schema.string()
    .default(join(homedir(), '.dsh', 'destiny-workspace', 'journal.jsonl'))
    .description('Append-only write journal; the agent reads it to answer "did that work".'),
  manifestPath: Schema.string()
    .default(join(homedir(), '项目', 'destiny2-mcp', 'manifest', 'destiny_manifest_zh.sqlite3'))
    .description('Manifest sqlite used for item/bucket/plug definitions.'),
  apiKeyFile: Schema.string()
    .default(join(homedir(), '项目', 'destiny2-mcp', '.env'))
    .description('File that defines BUNGIE_API_KEY (transitional, until the OAuth broker).'),
})

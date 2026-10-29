import Schema from '@deepseek-ai/schemastery'

// Tunable configuration must be a Schemastery Schema, never a plain object:
// the harness validates it at load time and fails loud on invalid values, and
// every key can be changed from cordis.yml without editing code (guide §3.6).
export interface Config {
  /** MCP server name as registered in the profile (dsh-mcp-client `serverName`). */
  mcpServer: string
  /** Absolute pathname of the bridge route the browser half reads. */
  routePath: string
}

export const Config: Schema<Config> = Schema.object({
  mcpServer: Schema.string()
    .default('destiny')
    .description('MCP server name registered by dsh-mcp-client (serverName).'),
  routePath: Schema.string()
    .default('/dsh-destiny-inventory')
    .description('Absolute pathname of the plugin HTTP bridge, no trailing slash.'),
})

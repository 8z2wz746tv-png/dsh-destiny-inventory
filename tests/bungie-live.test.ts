/**
 * Live acceptance for the host data plane.
 *
 * Skipped unless this machine has the MCP token file and its .env — it is a real
 * read against Bungie, not a fixture. Keeps the seam honest: the token comes from
 * wherever the provider says, the business layer does not care.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BungieClient } from '../src/bungie/client'
import { pickPrimaryMembership, readMemberships } from '../src/bungie/memberships'
import { readProfile } from '../src/bungie/profile'
import { FileTokenProvider } from '../src/bungie/token-file-provider'

const tokenPath = join(homedir(), '.destiny_mcp/tokens.json')
const envPath = join(homedir(), '项目/destiny2-mcp/.env')
const available = existsSync(tokenPath) && existsSync(envPath)

/** Read one KEY=value line out of the MCP .env without exposing anything else. */
async function readEnvValue(key: string): Promise<string> {
  const text = await readFile(envPath, 'utf8')
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const index = trimmed.indexOf('=')
    if (trimmed.slice(0, index).trim() === key) return trimmed.slice(index + 1).trim()
  }
  return ''
}

describe.skipIf(!available)('live Bungie profile', () => {
  it('reads the account through an injected token provider', async () => {
    const apiKey = await readEnvValue('BUNGIE_API_KEY')
    expect(apiKey, 'MCP .env must carry BUNGIE_API_KEY').not.toBe('')

    const client = new BungieClient({
      apiKey,
      tokenProvider: new FileTokenProvider({ path: tokenPath }),
    })
    const memberships = await readMemberships(client)
    const primary = pickPrimaryMembership(memberships)
    expect(primary, 'account must expose at least one Destiny membership').not.toBeNull()
    const snapshot = await readProfile(client, primary!.membershipType, primary!.membershipId)

    expect(snapshot.characters.length).toBeGreaterThan(0)
    expect(snapshot.items.length).toBeGreaterThan(100)
    // Only the equipment component contributes equipped items, and each character
    // can wear at most one item per bucket.
    const perCharacter = new Map<string, number>()
    for (const key of snapshot.equippedByBucket.keys()) {
      const characterId = key.split(':')[0] ?? ''
      perCharacter.set(characterId, (perCharacter.get(characterId) ?? 0) + 1)
    }
    for (const count of perCharacter.values()) expect(count).toBeLessThan(20)
    const byLocation = new Map<string, number>()
    for (const item of snapshot.items) {
      byLocation.set(item.location, (byLocation.get(item.location) ?? 0) + 1)
    }
    console.log(
      `[live] ${snapshot.displayName}: ${snapshot.characters.length} characters, ` +
        `${snapshot.items.length} items, ${snapshot.equippedByBucket.size} equipped slots`,
    )
    console.log('[live] by location:', JSON.stringify(Object.fromEntries(byLocation)))
  }, 60_000)
})

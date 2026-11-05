import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BungieService } from '../src/host/bungie-service'
import { CLASS_LOCATION, toItemRows } from '../src/host/dto'
import { buildSections } from '../src/client/filter'

const svc = new BungieService({
  tokenPath: join(homedir(), '.destiny_mcp/tokens.json'),
  manifestPath: join(homedir(), '项目/destiny2-mcp/manifest/destiny_manifest_zh.sqlite3'),
  apiKey: process.env.BUNGIE_API_KEY,
})

describe.skipIf(
  !existsSync(join(homedir(), '.destiny_mcp/tokens.json')) || !process.env.BUNGIE_API_KEY,
)('segments', () => {
  it('groups only the vault column', async () => {
    const { snapshot, definitions } = await svc.detailSource()
    const classBy = new Map(snapshot.characters.map((c) => [c.characterId, CLASS_LOCATION[c.classType] ?? '']))
    const { rows } = toItemRows(
      snapshot.items as unknown as Parameters<typeof toItemRows>[0],
      definitions,
      classBy,
      snapshot.equippedCharacters,
    )
    const sections = buildSections(rows, { search: '', type: '', lock: 'all', category: 'all', sort: 'power-desc' }, {})
    const weapons = sections.find((s) => s.id === 'weapons')!
    const vaultCell = weapons.rows[0]!.cells.find((c) => c.location === 'vault')!
    const charCell = weapons.rows[0]!.cells.find((c) => c.location === 'hunter')!
    expect(vaultCell.segments.length).toBeGreaterThan(1)
    expect(charCell.segments).toEqual([])
    // every item is in exactly one segment
    const total = vaultCell.segments.reduce((n, s) => n + s.items.length, 0)
    expect(total).toBe(vaultCell.items.length)
    expect(vaultCell.segments.filter((s) => s.icon !== null).length).toBeGreaterThan(0)
  }, 180_000)
})

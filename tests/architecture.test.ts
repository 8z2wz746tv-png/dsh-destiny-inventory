/**
 * Architecture guards: the rules that keep this repo from drifting back into
 * what it was — one source of truth per fact, a size ceiling per file, and no
 * resurrected dead paths.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src')

/** Every TypeScript source file under src/. */
function sources(dir = SRC): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(ts|tsx)$/.test(entry) ? [path] : []
  })
}

/** Line count per file, relative to the repo root. */
function lineCounts(): Map<string, number> {
  return new Map(
    sources().map((path) => [relative(process.cwd(), path), readFileSync(path, 'utf8').split('\n').length]),
  )
}

describe('module size', () => {
  /** Ceilings ratchet down; raising one needs a split, not a bigger number. */
  const CEILINGS: Record<string, number> = {
    'src/client/InventoryPanel.tsx': 540,
    'src/client/styles.ts': 540,
    'src/client/filter.ts': 360,
    'src/bungie/profile.ts': 340,
    'src/host/stat-lines.ts': 80,
    'src/bungie/values.ts': 30,
    'src/bungie/profile-item.ts': 120,
    // One sqlite-backed lookup table with its parsers; splitting it produced a
    // circular mess (types in one half, table names in the other). Raise instead
    // of pretending, and keep it from growing further.
    'src/bungie/manifest.ts': 400,
    // The rest were unregistered, so they could grow unnoticed. Each ceiling sits
    // just above today's count: a split, not a bigger number, is the answer.
    'src/client/ItemDetail.tsx': 290,
    'src/client/RecoilGauge.tsx': 60,
    'src/client/styles-intrinsic.ts': 50,
    'src/client/IntrinsicBlock.tsx': 60,
    'src/client/ammo-icons.ts': 40,
    'src/client/styles-detail.ts': 430,
    'src/client/styles-store.ts': 130,
    'src/client/api.ts': 200,
    'src/client/ItemTile.tsx': 140,
    'src/client/use-hover-card.ts': 80,
    'src/host/bungie-service.ts': 300,
    'src/host/dto.ts': 260,
    'src/host/item-detail.ts': 260,
    'src/host/details-bulk.ts': 60,
    'src/host/stat-order.ts': 90,
    'src/host/enhanced-perks.ts': 470,
    'src/bungie/write.ts': 210,
    'src/host/item-write.ts': 130,
    'src/client/receipts.ts': 40,
    'src/mcp/envelope.ts': 80,
    'src/mcp/client.ts': 110,
    'src/mcp/types.ts': 260,
    'src/index.ts': 200,
  }

  it('keeps every served file inside its ceiling', () => {
    const counts = lineCounts()
    const over = Object.entries(CEILINGS)
      .map(([file, ceiling]) => ({ file, ceiling, lines: counts.get(file) ?? 0 }))
      .filter((entry) => entry.lines > entry.ceiling)
    expect(over).toEqual([])
  })

  it('has no file so large it should already be split', () => {
    const huge = [...lineCounts().entries()].filter(([, lines]) => lines > 600)
    expect(huge).toEqual([])
  })
})

describe('retired paths stay retired', () => {
  it('does not resurrect the MCP read helpers the host layer replaced', () => {
    const names = sources().map((path) => relative(process.cwd(), path))
    const resurrected = names.filter((name) =>
      /src\/mcp\/(item|inventory|queries)\.ts$/.test(name),
    )
    expect(resurrected).toEqual([])
  })

  it('writes through our own plane instead of the MCP tool', () => {
    const index = readFileSync(join(SRC, 'index.ts'), 'utf8')
    // PLAN §1: the front end owns its writes. Routing them through the MCP added
    // a host → MCP process → Bungie hop to every drag.
    expect(index).toContain('service.write(')
    expect(index).not.toContain('runAction')
  })

  it('invalidates the live snapshot after a write', () => {
    const write = readFileSync(join(SRC, 'host/item-write.ts'), 'utf8')
    expect(write).toContain('deps.invalidate()')
    expect(readFileSync(join(SRC, 'index.ts'), 'utf8')).not.toContain('clearInventoryCache')
  })
})

describe('dependency direction', () => {
  /** A layer may only import from the layers below it. */
  const LAYER: Record<string, number> = { client: 3, mcp: 2, host: 1, bungie: 0 }

  it('never imports upward', () => {
    const offenders: string[] = []
    for (const path of sources()) {
      const name = relative(join(process.cwd(), 'src'), path).split('/')[0] ?? ''
      const from = LAYER[name]
      if (from === undefined) continue
      const body = readFileSync(path, 'utf8')
      for (const match of body.matchAll(/from '\.\.?\/([a-z-]+)\//g)) {
        const to = LAYER[match[1] ?? '']
        if (to !== undefined && to > from) offenders.push(`${relative(process.cwd(), path)} → ${match[1]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('single source of truth', () => {
  /** A fact may only be declared once; everything else imports it. */
  const ONCE = ['BUCKET_SECTIONS', 'ALWAYS_SHOWN', 'POSTMASTER_BUCKETS']

  it.each(ONCE)('declares %s in exactly one file', (symbol) => {
    const declarations = sources().filter((path) =>
      new RegExp(`export const ${symbol}\\b`).test(readFileSync(path, 'utf8')),
    )
    expect(declarations.map((path) => relative(process.cwd(), path))).toHaveLength(1)
  })

  it('derives the section order from the bucket table instead of restating it', () => {
    const filter = readFileSync(join(SRC, 'client/filter.ts'), 'utf8')
    expect(filter).toContain('BUCKET_SECTIONS.map')
    // a hand-written second table would reintroduce the drift we removed
    expect(filter).not.toMatch(/label: '武器', fullWidth/)
  })
})

describe('no dead paths', () => {
  it('keeps no legacy inventory tree', () => {
    expect(sources().filter((path) => path.includes('/legacy/'))).toEqual([])
  })

  it('has no dangling full-width category flag', () => {
    const offenders = sources().filter((path) => /fullWidth/.test(readFileSync(path, 'utf8')))
    expect(offenders.map((path) => relative(process.cwd(), path))).toEqual([])
  })
})

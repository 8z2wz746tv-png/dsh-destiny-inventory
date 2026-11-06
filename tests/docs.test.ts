/**
 * `AGENTS.md` 的两张地图是新人（不管是人还是 agent）唯一的入口。
 *
 * 地图描述一棵已经不存在的树，比没有地图更糟：读的人会照着找一个删掉的文件。
 * 所以两个方向都查：**磁盘上有、地图里没有 → 红**；**地图里有、磁盘上没有 → 红**。
 * 这条规矩抄自 destiny2-mcp（它那半用 `tests/test_agent_docs.py` 干同一件事）。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const AGENTS = readFileSync(join(ROOT, 'AGENTS.md'), 'utf8')

/** Every file under `dir` whose name ends with `suffix`, as repo-relative paths. */
function filesUnder(dir: string, suffix: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return filesUnder(path, suffix)
    return entry.endsWith(suffix) ? [relative(ROOT, path)] : []
  })
}

/** The slice of AGENTS.md between two headings. */
function section(from: string, to: string | null): string {
  const start = AGENTS.indexOf(from)
  if (start < 0) throw new Error(`AGENTS.md 里没有这一节：${from}`)
  const end = to === null ? AGENTS.length : AGENTS.indexOf(to, start)
  if (end < 0) throw new Error(`AGENTS.md 里没有这一节：${to}`)
  return AGENTS.slice(start, end)
}

/** Paths the code map lists, in the order they appear. */
function codeMapPaths(): string[] {
  return [...section('## 9. 代码地图', '## 10. 文档地图').matchAll(/^\| `([^`]+)` \|/gm)].map(
    (match) => match[1] ?? '',
  )
}

/** Paths the document map lists, in the order they appear. */
function documentMapPaths(): string[] {
  return [...section('## 10. 文档地图', null).matchAll(/^- `([^`]+)` —/gm)].map((match) => match[1] ?? '')
}

describe('代码地图', () => {
  const mapped = codeMapPaths()
  const onDisk = filesUnder(join(ROOT, 'src'), '.ts')
    .concat(filesUnder(join(ROOT, 'src'), '.tsx'))
    .map((path) => path.split('\\').join('/'))

  it('登记了每一个源文件', () => {
    const missing = onDisk.filter((path) => !mapped.includes(path))
    expect(missing).toEqual([])
  })

  it('没有登记已经删掉的文件', () => {
    const ghosts = mapped.filter((path) => !onDisk.includes(path))
    expect(ghosts).toEqual([])
  })

  it('不重复登记同一个文件', () => {
    const seen = new Set<string>()
    const duplicates = mapped.filter((path) => (seen.has(path) ? true : (seen.add(path), false)))
    expect(duplicates).toEqual([])
  })
})

describe('文档地图', () => {
  const mapped = documentMapPaths().filter((path) => !path.includes('*'))
  /** 根目录必读四份 + 全部 docs/ 与 archive/ + 那个跟脚本走的说明。 */
  const onDisk = [
    'AGENTS.md',
    'README.md',
    'UPSTREAM.md',
    'LICENSE-DIM.md',
    'probe/README.md',
    ...filesUnder(join(ROOT, 'docs'), '.md'),
    ...filesUnder(join(ROOT, 'archive'), '.md'),
  ].map((path) => path.split('\\').join('/'))

  it('登记了每一份文档', () => {
    const missing = onDisk.filter((path) => !mapped.includes(path))
    expect(missing).toEqual([])
  })

  it('没有登记已经不存在的文档', () => {
    const ghosts = mapped.filter((path) => !onDisk.includes(path))
    expect(ghosts).toEqual([])
  })

  it('同一条只出现一次', () => {
    const seen = new Set<string>()
    const duplicates = mapped.filter((path) => (seen.has(path) ? true : (seen.add(path), false)))
    expect(duplicates).toEqual([])
  })
})

describe('文档里的相对链接点得开', () => {
  it('每一处 Markdown 链接都指向真实文件', () => {
    const dangling: string[] = []
    for (const path of filesUnder(ROOT, '.md')) {
      if (path.startsWith('node_modules') || path.startsWith('.workbuddy')) continue
      const body = readFileSync(join(ROOT, path), 'utf8')
      for (const match of body.matchAll(/\]\(([^)\s#]+\.md)(?:#[^)]*)?\)/g)) {
        const target = match[1] ?? ''
        if (target.startsWith('http')) continue
        const resolved = join(ROOT, path, '..', target)
        try {
          readFileSync(resolved)
        } catch {
          dangling.push(`${path} → ${target}`)
        }
      }
    }
    expect(dangling).toEqual([])
  })
})

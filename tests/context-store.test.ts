import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ContextStore } from '../src/host/context-store'
import type { JournalEntry } from '../src/host/context-store'

const entry = (over: Partial<JournalEntry> = {}): JournalEntry => ({
  at: 1,
  action: 'move',
  item: { instanceId: 'i1', hash: 1, name: '英勇利刃' },
  from: 'hunter',
  to: 'vault',
  result: 'ok',
  source: 'ui',
  detail: '',
  ...over,
})

describe('context store', () => {
  it('keeps the view the browser last reported', () => {
    const store = new ContextStore('/tmp/never-written.jsonl')
    store.setView({
      character: 'warlock',
      filters: { search: '快速', category: 'weapon', lock: 'all', sort: 'power-desc' },
      selected: null,
      lastDropTarget: 'vault',
    })
    expect(store.readView().character).toBe('warlock')
    expect(store.readView().lastDropTarget).toBe('vault')
  })

  it('returns journal entries newest first', () => {
    const store = new ContextStore('/tmp/never-written.jsonl')
    store.record(entry({ at: 1 }))
    store.record(entry({ at: 2 }))
    expect(store.recent()[0]?.at).toBe(2)
  })

  it('caps the ring at 200, dropping the oldest', () => {
    const store = new ContextStore('/tmp/never-written.jsonl')
    for (let i = 0; i < 250; i += 1) store.record(entry({ at: i }))
    const all = store.all()
    expect(all).toHaveLength(200)
    expect(all[0]?.at).toBe(249)
    expect(all.at(-1)?.at).toBe(50)
  })

  it('refuses to return more than the ring holds', () => {
    const store = new ContextStore('/tmp/never-written.jsonl')
    store.record(entry())
    expect(store.recent(999)).toHaveLength(1)
  })

  it('appends to disk so a session can be reconstructed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'journal-'))
    const path = join(dir, 'journal.jsonl')
    const store = new ContextStore(path)
    store.record(entry({ at: 7, result: 'failed', detail: 'Bungie 拒绝了这次请求' }))
    // the write is fire-and-forget; give it a tick
    await new Promise((resolve) => setTimeout(resolve, 20))
    const text = await readFile(path, 'utf8')
    const parsed = JSON.parse(text.trim()) as JournalEntry
    expect(parsed.at).toBe(7)
    expect(parsed.detail).toContain('拒绝了')
    expect(parsed.from).toBe('hunter')
    expect(parsed.to).toBe('vault')
  })
})

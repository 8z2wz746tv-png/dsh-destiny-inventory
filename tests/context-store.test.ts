import { mkdtempSync } from 'node:fs'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ContextStore } from '../src/host/context-store'
import type { JournalEntry } from '../src/host/context-store'

/** A path nothing else uses: the store now reads its trail back on construction. */
const scratch = (): string => join(mkdtempSync(join(tmpdir(), 'journal-')), 'journal.jsonl')

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
    const store = new ContextStore(scratch())
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
    const store = new ContextStore(scratch())
    store.record(entry({ at: 1 }))
    store.record(entry({ at: 2 }))
    expect(store.recent()[0]?.at).toBe(2)
  })

  it('caps the ring at 200, dropping the oldest', () => {
    const store = new ContextStore(scratch())
    for (let i = 0; i < 250; i += 1) store.record(entry({ at: i }))
    const all = store.all()
    expect(all).toHaveLength(200)
    expect(all[0]?.at).toBe(249)
    expect(all.at(-1)?.at).toBe(50)
  })

  it('refuses to return more than the ring holds', () => {
    const store = new ContextStore(scratch())
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

  it('corrects a failure the read-back says actually landed', async () => {
    const store = new ContextStore(scratch(), () => 99)
    store.record(entry({ at: 7, result: 'failed', detail: 'Bungie 拒绝了这次请求' }))
    const corrected = store.resolve('i1', true, 'vault')
    expect(corrected?.resolution).toEqual({ at: 99, landed: true, location: 'vault' })
    expect(store.recent()[0]?.resolution?.landed).toBe(true)
  })

  it('only corrects the newest unresolved failure for that item', () => {
    const store = new ContextStore(scratch(), () => 5)
    store.record(entry({ at: 1, result: 'failed' }))
    store.record(entry({ at: 2, result: 'failed' }))
    expect(store.resolve('i1', true, 'vault')?.at).toBe(2)
    // the older one belongs to a write the user already moved past
    expect(store.recent()[1]?.resolution).toBeUndefined()
  })

  it('does nothing when there is no failure to correct', () => {
    const store = new ContextStore(scratch())
    store.record(entry({ result: 'ok' }))
    // Injectable violation: match on instanceId alone and this returns the ok entry,
    // stamping a resolution onto a write that never needed one.
    expect(store.resolve('i1', true, 'vault')).toBeNull()
    expect(store.recent()[0]?.resolution).toBeUndefined()
  })

  it('writes the correction to disk as a second line, never an edit', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'journal-'))
    const path = join(dir, 'journal.jsonl')
    const store = new ContextStore(path, () => 42)
    store.record(entry({ at: 7, result: 'failed', detail: 'Bungie 拒绝了这次请求' }))
    store.resolve('i1', true, 'vault')
    await new Promise((resolve) => setTimeout(resolve, 20))
    const lines = (await readFile(path, 'utf8')).trim().split('\n').map((line) => JSON.parse(line) as JournalEntry)
    expect(lines).toHaveLength(2)
    expect(lines[0]?.resolution).toBeUndefined()
    expect(lines[1]?.resolution).toEqual({ at: 42, landed: true, location: 'vault' })
  })

  it('comes back after a restart instead of starting empty', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'journal-'))
    const path = join(dir, 'journal.jsonl')
    const first = new ContextStore(path)
    first.record(entry({ at: 10, item: { instanceId: 'a', hash: 1, name: '甲' } }))
    first.record(entry({ at: 11, item: { instanceId: 'b', hash: 1, name: '乙' } }))
    await new Promise((resolve) => setTimeout(resolve, 20))

    // A new process: the same file, nothing in memory.
    const second = new ContextStore(path)
    // Injectable violation: skip `restore()` and this is empty — which is exactly
    // what "why did that fail" got after every host restart.
    expect(second.all().map((row) => row.item.name)).toEqual(['乙', '甲'])
  })

  it('keeps the correction rather than the line it replaced', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'journal-'))
    const path = join(dir, 'journal.jsonl')
    const first = new ContextStore(path, () => 7)
    first.record(entry({ at: 20, result: 'failed', detail: '上游拒绝' }))
    first.resolve('i1', true, 'vault')
    await new Promise((resolve) => setTimeout(resolve, 20))

    const second = new ContextStore(path)
    expect(second.all()).toHaveLength(1)
    expect(second.all()[0]?.resolution?.landed).toBe(true)
  })

  it('survives a mangled line instead of dropping the trail', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'journal-'))
    const path = join(dir, 'journal.jsonl')
    await writeFile(path, `{"at":1,"action":"move","item":{"instanceId":"i1","hash":1,"name":"甲"},"from":"hunter","to":"vault","result":"ok","source":"ui","detail":""}\n{ not json\n`, 'utf8')
    const store = new ContextStore(path)
    expect(store.all()).toHaveLength(1)
  })
})

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ContextStore } from '../src/host/context-store'
import { detectExternal } from '../src/host/detect-external'
import type { ItemRow } from '../src/host/types'

const row = (over: Partial<ItemRow>): ItemRow =>
  ({ instanceId: 'i1', hash: 42, name: '英勇利刃', locationKey: 'hunter', ...over }) as ItemRow

/** A fresh path each time: the store reads its trail back on construction. */
const store = () =>
  new ContextStore(join(mkdtempSync(join(tmpdir(), 'journal-')), 'journal.jsonl'))

describe('external change detection', () => {
  it('says nothing on the first read: everything would look like it moved', () => {
    const s = store()
    detectExternal(s, [row({})])
    expect(s.recent()).toHaveLength(0)
  })

  it('records movement it did not cause', () => {
    const s = store()
    detectExternal(s, [row({})])
    detectExternal(s, [row({ locationKey: 'vault' })])
    const [entry] = s.recent()
    expect(entry?.source).toBe('agent-detected')
    expect(entry?.from).toBe('hunter')
    expect(entry?.to).toBe('vault')
  })

  it('stays quiet about a move the panel already journalled', () => {
    const s = store()
    detectExternal(s, [row({})])
    s.record({
      at: Date.now(),
      action: 'move',
      item: { instanceId: 'i1', hash: 42, name: '英勇利刃' },
      from: 'hunter',
      to: 'vault',
      result: 'ok',
      source: 'ui',
      detail: '',
    })
    detectExternal(s, [row({ locationKey: 'vault' })])
    expect(s.recent().filter((e) => e.source === 'agent-detected')).toHaveLength(0)
  })

  it('ignores changes older than the grace window', () => {
    const s = store()
    detectExternal(s, [row({})], 0)
    s.record({
      at: 0,
      action: 'move',
      item: { instanceId: 'i1', hash: 42, name: '英勇利刃' },
      from: 'hunter',
      to: 'vault',
      result: 'ok',
      source: 'ui',
      detail: '',
    })
    // far outside the 30s window: the change can no longer be attributed to it
    detectExternal(s, [row({ locationKey: 'vault' })], 120_000)
    expect(s.recent().some((e) => e.source === 'agent-detected')).toBe(true)
  })

  it('skips stackables, whose instance id is "0" and means nothing', () => {
    const s = store()
    detectExternal(s, [row({ instanceId: '0', locationKey: 'hunter' })])
    detectExternal(s, [row({ instanceId: '0', locationKey: 'vault' })])
    expect(s.recent()).toHaveLength(0)
  })
})

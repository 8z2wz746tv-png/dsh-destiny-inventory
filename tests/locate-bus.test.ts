/**
 * 定位命令总线。
 *
 * 钉两件事：面板未挂载时的失败、以及**按 instanceId 精确查找**（同 hash 的另一件
 * 副本绝不能被当成目标）。
 */
import { describe, expect, it } from 'vitest'
import { findInstance, locateItem, registerLocateHandler } from '../src/client/locate-bus'

const ITEMS = [
  { instanceId: 'a1', hash: 42, name: '命运终结者' },
  { instanceId: 'a2', hash: 42, name: '命运终结者' },
  { instanceId: 'b1', hash: 99, name: '另一把' },
]

describe('精确实例查找', () => {
  it('finds only the exact instance, never another copy with the same hash', () => {
    expect(findInstance(ITEMS, 'a2')).toEqual(ITEMS[1])
    expect(findInstance(ITEMS, 'a2')?.hash).toBe(42)
    // 同 hash 的另一件不是目标；不存在时返回 null，不退化到 hash/名字匹配。
    expect(findInstance(ITEMS, 'a3')).toBeNull()
    expect(findInstance(ITEMS, '')).toBeNull()
  })
})

describe('命令总线', () => {
  it('reports not-mounted without a panel handler', () => {
    expect(locateItem('a1')).toEqual({ ok: false, reason: 'not-mounted' })
  })

  it('delegates to the registered handler and unregisters cleanly', () => {
    const stop = registerLocateHandler((instanceId) =>
      findInstance(ITEMS, instanceId) === null
        ? { ok: false, reason: 'not-in-snapshot' }
        : { ok: true },
    )
    expect(locateItem('a1')).toEqual({ ok: true })
    expect(locateItem('missing')).toEqual({ ok: false, reason: 'not-in-snapshot' })
    stop()
    expect(locateItem('a1')).toEqual({ ok: false, reason: 'not-mounted' })
  })

  it('a stale cleanup cannot clear a newer handler', () => {
    const stopOld = registerLocateHandler(() => ({ ok: true }))
    const stopNew = registerLocateHandler(() => ({ ok: false, reason: 'not-in-snapshot' }))
    stopOld()
    // 旧面板卸载时的清理不能把新面板的 handler 清掉。
    expect(locateItem('a1')).toEqual({ ok: false, reason: 'not-in-snapshot' })
    stopNew()
    expect(locateItem('a1')).toEqual({ ok: false, reason: 'not-mounted' })
  })
})

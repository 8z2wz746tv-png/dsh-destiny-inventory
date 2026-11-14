/**
 * 卡片 intent / ok:false 的边界。
 *
 * 这些分支决定“解析失败”提示是否出现；compare/info 和可读错误不能被误报。
 */
import { describe, expect, it } from 'vitest'
import { cardIntentOf, toolRefusalOf } from '../src/client/agent/tool-card'

describe('cardIntentOf', () => {
  it('defaults a missing intent to analyze', () => {
    expect(cardIntentOf('{}')).toBe(true)
    expect(cardIntentOf('{"weapon_name":"命运终结者"}')).toBe(true)
  })

  it('accepts analyze and filter_rolls', () => {
    expect(cardIntentOf('{"intent":"analyze"}')).toBe(true)
    expect(cardIntentOf('{"intent":"filter_rolls"}')).toBe(true)
  })

  it('rejects compare and info', () => {
    expect(cardIntentOf('{"intent":"compare"}')).toBe(false)
    expect(cardIntentOf('{"intent":"info"}')).toBe(false)
  })

  it('rejects malformed argument JSON', () => {
    expect(cardIntentOf('not json')).toBe(false)
    expect(cardIntentOf('')).toBe(false)
  })
})

describe('toolRefusalOf', () => {
  it('detects a structured ok:false refusal', () => {
    expect(toolRefusalOf('{"ok":false,"error":{"code":"item_not_found"}}')).toBe(true)
  })

  it('does not mark ok:true or a non-boolean ok', () => {
    expect(toolRefusalOf('{"ok":true}')).toBe(false)
    expect(toolRefusalOf('{"ok":"false"}')).toBe(false)
  })

  it('does not mark malformed result JSON', () => {
    expect(toolRefusalOf('not json')).toBe(false)
    expect(toolRefusalOf('')).toBe(false)
  })
})

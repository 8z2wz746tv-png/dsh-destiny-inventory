/**
 * 发送结果的解释。
 *
 * 这条规则来自一次真机事故：`prompt` 回了 `gateway/input-invalid`，调用方把返回值
 * 丢了，界面上什么都没发生。所以这里每一种"不是明确的 ok"都必须被当成失败。
 */
import { describe, expect, it } from 'vitest'
import { sendOutcome } from '../src/client/agent/send-result'

describe('发送结果', () => {
  it('accepts an explicit ok', () => {
    expect(sendOutcome({ ok: true, value: { accepted: true } })).toEqual({ ok: true, reason: null })
  })

  it('reports the real error code', () => {
    // 探针原样。
    const out = sendOutcome({
      ok: false,
      error: { code: 'gateway/input-invalid', details: { field: 'request' } },
    })
    // Injectable violation: 忽略返回值（or 只判 truthy）就把这次拒绝吞掉了。
    expect(out.ok).toBe(false)
    expect(out.reason).toContain('gateway/input-invalid')
  })

  it('falls back to the message when there is no code', () => {
    expect(sendOutcome({ ok: false, error: { message: '上游超时' } }).reason).toContain('上游超时')
  })

  it('says so when the failure carries no reason', () => {
    expect(sendOutcome({ ok: false }).reason).toBe('发送被拒（没有给出原因）')
  })

  it('treats a missing result as unconfirmed, not success', () => {
    // `prompt` 若因为任何原因没回结果，也不能当成功——那正是静默失败的形状。
    expect(sendOutcome(undefined).ok).toBe(false)
    expect(sendOutcome(null).ok).toBe(false)
    expect(sendOutcome('nonsense').ok).toBe(false)
  })

  it('does not treat a truthy non-ok object as success', () => {
    // `{ok: 'yes'}` 这种形状不该放行：只有严格的 `true` 算成功。
    expect(sendOutcome({ ok: 'yes' }).ok).toBe(false)
  })
})

/**
 * Failure translation. The panel shows these strings verbatim, so a refusal we
 * decided on must not arrive dressed as an outage — a 502 sends the reader to the
 * host log for a fault that never happened.
 */
import { describe, expect, it } from 'vitest'
import { BridgeFault, statusOf, toFailure } from '../src/host/http'

describe('failure translation', () => {
  it('keeps our own refusal as written and gives it a 400', () => {
    const failure = toFailure(new BridgeFault('BadRequest', '找不到目标角色，请刷新后再试'))
    expect(failure).toEqual({ code: 'BadRequest', message: '找不到目标角色，请刷新后再试' })
    expect(statusOf(failure)).toBe(400)
  })

  it('does not tell the reader to restart the host over a bad request', () => {
    const { message } = toFailure(new BridgeFault('BadRequest', '装备需要目标角色'))
    expect(message).not.toContain('重启 DSH')
  })

  it('maps a missing item to 404, not 502', () => {
    const failure = toFailure(new BridgeFault('NotFound', '这件物品不在当前快照里，先刷新库存'))
    expect(statusOf(failure)).toBe(404)
  })

  it('still treats an unexplained fault as an outage', () => {
    const failure = toFailure(new Error('boom'))
    expect(statusOf(failure)).toBe(502)
    // Nothing known about it, so the next step is still the host log.
    expect(failure.message).toContain('重启 DSH')
  })

  it('keeps auth failures at 401 so the panel can say why', () => {
    expect(statusOf({ code: 'AUTH_UNAVAILABLE' })).toBe(401)
  })
})

/**
 * `/account` 结果 → 账号三态。
 *
 * 钉住的是**失败与未登录不是一回事**：混成一种，网络抖动会变成"清空历史"，
 * 或者反过来——不知道是谁的时候还去恢复上一个账号的会话。
 */
import { describe, expect, it } from 'vitest'
import { accountStateOf } from '../src/client/agent/account-state'

describe('账号三态', () => {
  it('confirms a real account', () => {
    expect(accountStateOf({ ok: true, account: { membershipType: 3, membershipId: 'steam-1' } })).toEqual({
      kind: 'confirmed',
      account: { membershipType: 3, membershipId: 'steam-1' },
    })
  })

  it('treats a failed request as unavailable, not signed out', () => {
    // Injectable violation: 把失败当未登录，会去清掉一个其实还属于某人的会话。
    expect(accountStateOf({ ok: false }).kind).toBe('unavailable')
  })

  it('treats an explicitly empty account as signed out', () => {
    expect(accountStateOf({ ok: true, account: null }).kind).toBe('signedOut')
    expect(accountStateOf({ ok: true, account: { membershipType: 3, membershipId: '' } }).kind).toBe('signedOut')
  })

  it('does not invent a membership type', () => {
    expect(accountStateOf({ ok: true, account: { membershipId: 'x' } })).toEqual({
      kind: 'confirmed',
      account: { membershipType: 0, membershipId: 'x' },
    })
  })
})

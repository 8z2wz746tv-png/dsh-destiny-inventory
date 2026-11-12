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

  it('refuses a missing membership type instead of inventing one', () => {
    // 编造一个 0 会写出语义错误的分区键；不知道平台就不认这个账号。
    expect(accountStateOf({ ok: true, account: { membershipId: 'x' } }).kind).toBe('unavailable')
  })

  it('accepts every platform the enum declares', () => {
    // rustgie 0.2.0 的完整枚举：4/5/10/254 都合法，漏掉会把真账号判成未知。
    for (const membershipType of [1, 2, 3, 4, 5, 6, 10, 254]) {
      expect(accountStateOf({ ok: true, account: { membershipType, membershipId: 'x' } }).kind).toBe('confirmed')
    }
  })

  it('rejects the values that are not accounts', () => {
    // 0 = None，-1 = All（只用于搜索），都不是某个玩家。
    for (const membershipType of [0, -1, 99]) {
      expect(accountStateOf({ ok: true, account: { membershipType, membershipId: 'x' } }).kind).toBe('unavailable')
    }
  })
})

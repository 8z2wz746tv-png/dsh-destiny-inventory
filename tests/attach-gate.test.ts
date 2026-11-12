/**
 * 账号确认是 attach 的前置条件。
 *
 * 这条边界是 A8.1a 真机验收发现缺的那块：`DockChat` 每次重挂，`account` 都会
 * 从"还在查"开始，如果此时就去 `ensure()`，读 session store 拿到 null，
 * 于是**新建一个会话**——收起再展开就换人了。
 */
import { describe, expect, it } from 'vitest'
import { accountStateOf } from '../src/client/agent/account-state'

/** 与 `use-conversation` 里同一份判据：未确认就不该建 adapter。 */
const accountKeyOf = (account: ReturnType<typeof accountStateOf> | null): string | null =>
  account?.kind === 'confirmed'
    ? `${account.account.membershipType}:${account.account.membershipId}`
    : null

describe('attach 门控', () => {
  it('has no key while the account is still being read', () => {
    // `null` 是"还在查"，与"查过、没查到"不是一回事。
    expect(accountKeyOf(null)).toBeNull()
  })

  it('has no key when the account is unavailable', () => {
    // 网络失败时不能 attach：否则 ensure 会在账号未定时新建会话。
    expect(accountKeyOf(accountStateOf({ ok: false }))).toBeNull()
  })

  it('has no key when signed out', () => {
    expect(accountKeyOf(accountStateOf({ ok: true, account: null }))).toBeNull()
  })

  it('produces a key only once confirmed', () => {
    expect(accountKeyOf(accountStateOf({ ok: true, account: { membershipType: 3, membershipId: 'steam-1' } }))).toBe(
      '3:steam-1',
    )
  })

  it('gives two accounts different keys, so one rebuilds into the other', () => {
    // A→B 换人时 key 变，adapter 重建，旧引用在 cleanup 里归还。
    const a = accountKeyOf(accountStateOf({ ok: true, account: { membershipType: 3, membershipId: 'steam-a' } }))
    const b = accountKeyOf(accountStateOf({ ok: true, account: { membershipType: 3, membershipId: 'steam-b' } }))
    expect(a).not.toBe(b)
  })

  it('keeps the same key across a re-read of the same account', () => {
    // 同一个账号再读一次不该重建 adapter——否则对话会被清空。
    const first = accountKeyOf(accountStateOf({ ok: true, account: { membershipType: 3, membershipId: 'steam-a' } }))
    const again = accountKeyOf(accountStateOf({ ok: true, account: { membershipType: 3, membershipId: 'steam-a' } }))
    expect(first).toBe(again)
  })
})

/**
 * 把一次 `/account` 的结果分成三种状态。
 *
 * **这条区分是安全边界**：请求失败说明我们不知道当前是谁的机器，
 * 此时恢复会话等于把上一个账号的对话摆到这个环境里。所以失败要 fail closed。
 *
 * 但"失败"和"没登录"不能混：前者是暂时不知道，后者是明确没有账号。
 * 混成一种，要么该清的没清，要么不该清的清了。
 */
import type { AccountState } from './session-store'

/** `/account` 的应答形状。 */
export interface AccountIdentityLike {
  membershipType?: number
  membershipId?: string
}

/**
 * Bungie 支持的平台类型（`BungieMembershipType` 的完整枚举）。
 *
 * 来源：rustgie 0.2.0 的类型定义（2026-10-08 核对）。**不能只写 [1,2,3,6]**：
 * Blizzard(4)、Stadia(5)、Demon(10)、BungieNext(254) 都是合法值，漏掉它们会把
 * 真实账号判成未知；而 `None(0)` 与 `All(-1)` 不是账号，必须排除。
 */
const KNOWN_MEMBERSHIP_TYPES: ReadonlySet<number> = new Set([1, 2, 3, 4, 5, 6, 10, 254])

/**
 * @param outcome - 成功时的账号、或失败原因。
 * @returns 账号三态。
 */
export function accountStateOf(
  outcome: { ok: true; account: AccountIdentityLike | null } | { ok: false },
): AccountState {
  if (!outcome.ok) return { kind: 'unavailable' }
  const account = outcome.account
  // 空对象/空 id 都是"接口明确说没有账号"。
  if (account === null || typeof account.membershipId !== 'string' || account.membershipId === '') {
    return { kind: 'signedOut' }
  }
  // 平台类型认不出来就不认这个账号：拿一个编造的 0 去当键，写出来的分区没有意义。
  // **失败仍然是 `unavailable` 而不是 `signedOut`**——我们不知道答案，不等于没有账号。
  const type = account.membershipType
  if (typeof type !== 'number' || !KNOWN_MEMBERSHIP_TYPES.has(type)) return { kind: 'unavailable' }
  return { kind: 'confirmed', account: { membershipType: type, membershipId: account.membershipId } }
}

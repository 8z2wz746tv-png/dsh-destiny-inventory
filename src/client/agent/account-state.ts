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
  return {
    kind: 'confirmed',
    account: {
      membershipType: typeof account.membershipType === 'number' ? account.membershipType : 0,
      membershipId: account.membershipId,
    },
  }
}

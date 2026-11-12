/**
 * 会话 id 的持久化，**按 Bungie 账号分区**。
 *
 * 浮窗每次换面板、每次刷新都会重建组件，`SessionAdapter` 的实例跟着没了。
 * 把 id 存下来，下次 `ensure()` 直接复用它——关窗不等于销毁会话。
 *
 * **账号维度是必须的**：不分区的话，切到账号 B 会恢复账号 A 的会话，
 * A 的历史对话与上下文就出现在 B 的环境里。这不是泄漏到 Bungie，
 * 是同一台机器上的两个账号互相看见，一样不该发生。
 *
 * 分键口径与 `snapshot-db.ts` 的 `accountKey` **一致**：
 * `membershipType:membershipId`。两个模块对"哪个账号"必须只有一个定义。
 */
import type { AccountIdentity } from '../../host/types'

/** 存的是 `${membershipType}:${membershipId}`，与 `snapshot-db.ts` 同口径。 */
const KEY_PREFIX = 'dsh-destiny-agent-session'

/** 账号身份的三种状态。**请求失败与未登录不是一回事**，这里必须分开。 */
export type AccountState =
  /** 读到了账号：只有这一种允许碰会话存储。 */
  | { kind: 'confirmed'; account: AccountIdentity }
  /** 请求失败/超时：既不能恢复，也不能清除——我们不知道这是谁的机器。 */
  | { kind: 'unavailable' }
  /** 接口明确应答"没有账号"：不得恢复任何账号的会话。 */
  | { kind: 'signedOut' }

/** 取浏览器存储；隐私模式下访问本身就会抛。 */
function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/**
 * 账号 → 存储键。
 *
 * @param account - 已确认的账号。
 * @returns 这个账号专用的键；`membershipId` 为空时返回 `null`（不写无名键）。
 */
export function sessionKey(account: AccountIdentity): string | null {
  if (account.membershipId === '') return null
  return `${KEY_PREFIX}:${account.membershipType}:${account.membershipId}`
}

/**
 * 读这个账号上次用的会话 id。
 *
 * @param state - 账号状态。**只有 `confirmed` 才读**——其余一律当作没有，
 *   于是 `ensure()` 不会恢复任何人的会话，数据也原样留着。
 * @returns 会话 id；没有、账号未确认、或存储不可用时都是 `null`。
 */
export function readSessionId(state: AccountState): string | null {
  if (state.kind !== 'confirmed') return null
  const key = sessionKey(state.account)
  if (key === null) return null
  const store = storage()
  if (store === null) return null
  try {
    const value = store.getItem(key)
    return value === null || value === '' ? null : value
  } catch {
    return null
  }
}

/**
 * 记下这个账号这次用的会话。
 *
 * @param state - 账号状态；**不是 `confirmed` 就不写**。
 * @param id - 会话 id。
 */
export function saveSessionId(state: AccountState, id: string): void {
  if (state.kind !== 'confirmed') return
  const key = sessionKey(state.account)
  if (key === null) return
  const store = storage()
  if (store === null) return
  try {
    store.setItem(key, id)
  } catch {
    // 配额满或隐私模式：下次会新建一个会话，功能不受影响。
  }
}

/**
 * 丢掉这个账号记下的 id（会话已经不存在时用）。
 *
 * 只清**当前确认账号**的那一条：别的账号的会话与我们无关，不能连带删掉。
 *
 * @param state - 账号状态；不是 `confirmed` 就什么都不做。
 */
export function clearSessionId(state: AccountState): void {
  if (state.kind !== 'confirmed') return
  const key = sessionKey(state.account)
  if (key === null) return
  const store = storage()
  if (store === null) return
  try {
    store.removeItem(key)
  } catch {
    // 同样只是下次新建，不影响用。
  }
}

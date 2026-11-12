/**
 * 会话 id 的持久化。
 *
 * 浮窗每次换面板、每次刷新都会重建组件，`SessionAdapter` 的实例跟着没了。
 * 把 id 存下来，下次 `ensure()` 直接复用它——**这才是"关窗不等于销毁会话"的落点**。
 *
 * 存的只是 id，不是会话本身。id 失效时（DSH 换过、会话被归档）上层要能退回新建。
 */
const KEY = 'dsh-destiny-agent-session'

/** 取浏览器存储；隐私模式下访问本身就会抛。 */
function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/**
 * @returns 上次用的会话 id；没有就是 `null`。
 */
export function readSessionId(): string | null {
  const store = storage()
  if (store === null) return null
  try {
    const value = store.getItem(KEY)
    return value === null || value === '' ? null : value
  } catch {
    return null
  }
}

/**
 * 记下这次用的会话。
 * @param id - 会话 id。
 */
export function saveSessionId(id: string): void {
  const store = storage()
  if (store === null) return
  try {
    store.setItem(KEY, id)
  } catch {
    // 配额满或隐私模式：下次会新建一个会话，功能不受影响。
  }
}

/** 丢掉记下的 id。会话已经不存在时用它，下次会新建。 */
export function clearSessionId(): void {
  const store = storage()
  if (store === null) return
  try {
    store.removeItem(KEY)
  } catch {
    // 同样只是下次新建，不影响用。
  }
}

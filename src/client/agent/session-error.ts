/**
 * 认出「这个会话在宿主里已经不存在了」。
 *
 * **DSH 没有给这个错误稳定标识**（2026-11-13 查证）：抛出点
 * `dsh-api-session-controller/lib/client.js:3010` 是裸 `new Error(...)`，没有 `code`、
 * 没有自定义类、没有 `cause`；经过 RPC 后 message 保真，其它都丢。
 *
 * 所以只能按 message 的**前缀**判断。为什么是 `startsWith` 而不是 `includes`：
 * 后者会把任何正文里提到这串字的错误也当成失效会话，而 `sessionId` 是会出现在
 * 别的消息里的（比如回执里引用它）。**多清一个仍有效的会话，比该清的没清更贵。**
 *
 * 提取 message 也要小心：RPC 之后前端拿到的是 `Error`，但调用方可能把任何东西
 * 递进来。这条判据只在**能可靠拿到 message** 时成立；拿不到就按普通错误处理。
 */

/** 抛出点拼的前缀，一字不差。 */
const UNKNOWN_SESSION_PREFIX = 'sessions.retain: unknown session '

/**
 * @param error - 捕获到的任意值。
 * @returns message 以此前缀开头的 `Error`。
 */
function messageOf(error: unknown): string | null {
  if (error instanceof Error && typeof error.message === 'string') return error.message
  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return null
}

/**
 * @param error - 捕获到的任意值。
 * @returns 会话在宿主里已不存在时为 `true`。
 */
export function isUnknownSession(error: unknown): boolean {
  const message = messageOf(error)
  return message !== null && message.startsWith(UNKNOWN_SESSION_PREFIX)
}

/**
 * 我们自己抛的取消错误；用来把「用户取消」与「会话失效」分开。
 * 两者可以同时成立，**判据不能互相替代**。
 */
export function abortedError(): Error {
  return new Error('attach aborted')
}

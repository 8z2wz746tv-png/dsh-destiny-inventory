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
 * 列表还没建立过成功基线。
 *
 * `unknown session` 只有在**成功基线确认它不在列表里**之后才说明会话没了；
 * 基线之前抛出的同一条错误说明不了任何事。两者用不同错误分开，
 * 免得调用方把"加载中"当成"失效"。
 */
export class ListNotReadyError extends Error {
  /** 触发这条错误的原始值，便于排查；不参与判据。 */
  readonly reason: unknown

  constructor(reason: unknown) {
    super(`会话列表尚未就绪：${String(reason)}`)
    this.name = 'ListNotReadyError'
    this.reason = reason
  }
}

/**
 * `retain` 成功、引用也 ready 了，但历史没有打开。
 *
 * DSH 的 `doOpen` 把 RemoteFailure 吞成 `openState === 'error'`，promise 照样决议。
 * 不看这一眼，attach 会"成功"而整段历史是空的——那只是把 unknown session
 * 换成了另一种静默丢失。
 */
export class HistoryNotOpenError extends Error {
  readonly openState: string

  constructor(openState: string, detail?: unknown) {
    super(
      `会话历史没有打开（openState=${openState}）${
        detail === undefined ? '' : `：${String(detail)}`
      }`,
    )
    this.name = 'HistoryNotOpenError'
    this.openState = openState
  }
}

/**
 * 列表与 `retain` 对同一个 id 的判断冲突。
 *
 * 这不是“会话没了”：成功基线说它在，`retain` 却说不认识。两边必有一边看到的是
 * 旧状态。**保留原 id**，不清理、不新建；重试一次通常就能对齐。
 */
export class SessionIdentityConflictError extends Error {
  readonly sessionId: string
  /** 原始 unknown 错误，便于排查；不参与判据。 */
  readonly reason: unknown

  constructor(sessionId: string, reason: unknown) {
    super(`会话身份不一致（${sessionId}）：列表说它在，retain 却说不认识。原 id 已保留，可重试。`)
    this.name = 'SessionIdentityConflictError'
    this.sessionId = sessionId
    this.reason = reason
  }
}

/**
 * 列表基线不可验证，因此**不允许**清掉原会话 id。
 *
 * 触发它的不是“列表还没到”，而是“列表可能来自旧 generation”：
 * 首次 pending → ready 之外的 ready 基线没有可证明的当前代次。保留 id，
 * 让用户刷新页面重新获得一次授权，比误删一个实际存在的会话便宜得多。
 */
export class BaselineUnverifiedError extends Error {
  readonly sessionId: string

  constructor(sessionId: string, trust: string) {
    const reason =
      trust === 'revoked'
        ? '重连后旧列表不再可信'
        : trust === 'initial'
          ? '授权的连接代次与当前不一致'
          : '没有观察到首次成功基线'
    super(`会话列表基线未验证：${reason}。已保留原会话 ${sessionId}；刷新页面可重试自动恢复。`)
    this.name = 'BaselineUnverifiedError'
    this.sessionId = sessionId
  }
}

/**
 * 我们自己抛的取消错误；用来把「用户取消」与「会话失效」分开。
 * 两者可以同时成立，**判据不能互相替代**。
 */
export function abortedError(): Error {
  return new Error('attach aborted')
}

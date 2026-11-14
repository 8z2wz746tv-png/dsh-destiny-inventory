/**
 * 会话的 React 接线。
 *
 * 这一层只做三件事：attach、把事件喂给 Controller、把发送结果交出去。
 * **它不解析事件、不维护第二份会话状态**——状态只有 `Conversation` 一份。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Conversation } from './conversation'
import { SessionAdapter } from './session-adapter'
import { sendOutcome } from './send-result'
import { fetchAccount, fetchContext } from '../api'
import { withContext } from './context-prompt'
import { accountStateOf } from './account-state'
import type { AccountState } from './session-store'
import type { ViewContextLike } from './context-prompt'
import type { AgentSession, SessionDeps } from './session-adapter'
import type { BaselineTrustSource } from './baseline-trust'
import type { ConversationState } from './conversation'

/** 发送的三个阶段，界面据此禁用按钮与显示错误。 */
export type SendPhase = 'idle' | 'sending'

export interface ConversationApi {
  state: ConversationState
  phase: SendPhase
  /** 上一次发送失败的原因；成功后清空。 */
  error: string | null
  /** 发一条；返回是否被接受。**失败不抛，靠返回值判断**。 */
  send(text: string): Promise<boolean>
  /** 最近一次读到的面板视图；快捷任务按它生成。 */
  view: ViewContextLike | null
  /** 账号三态；`null` = 还在查。**只有 `confirmed` 才会去碰会话。** */
  account: AccountState | null
  /** 账号没能确认时给用户看的话；`null` 表示不用提示。 */
  blocker: string | null
  /** 手动重试账号解析。**不轮询**——失败由用户决定要不要再试。 */
  retry(): void
}

/**
 * @param deps - 会话服务；`null` 表示还没准备好（探针之外通常是有的）。
 * @param enabled - 窗口展开时才订阅，收起时释放引用。
 */
export function useConversation(
  deps: SessionDeps | null,
  enabled: boolean,
  routePath = '',
  trust?: BaselineTrustSource,
): ConversationApi {
  const conversation = useMemo(() => new Conversation(), [])
  const [state, setState] = useState<ConversationState>(conversation.snapshot())
  const [phase, setPhase] = useState<SendPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ViewContextLike | null>(null)
  const session = useRef<AgentSession | null>(null)
  /**
   * 账号状态。`null` = **还在查**，与 `unavailable`（查过、没查到）是两回事。
   *
   * 这个区分是门控的基础：`null` 时绝不能 attach，否则 `ensure()` 会在账号未定时
   * 决定"没有存储的会话"→ 新建一个。**账号确认是 attach 的前置条件。**
   */
  const [account, setAccount] = useState<AccountState | null>(null)
  /** 手动重试计数；只由用户点重试递增，不做定时轮询。 */
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (routePath === '') return
    const controller = new AbortController()
    setAccount(null)
    fetchAccount(routePath, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setAccount(accountStateOf({ ok: true, account: value as never }))
      })
      .catch(() => {
        // 失败是 `unavailable`，**不是** `signedOut`：不知道是谁的机器，就不碰会话存储。
        if (!controller.signal.aborted) setAccount(accountStateOf({ ok: false }))
      })
    return () => controller.abort()
  }, [routePath, attempt])

  /**
   * 账号分区键。`null` 表示**尚未确认**——此时不建 adapter，也就不可能有 attach。
   *
   * 用它当 `useMemo` 依赖：A→B 换人时 adapter 重建，旧引用在 cleanup 里归还；
   * 而**同一个账号**下账号对象怎么变都不会重建，不会把对话清空。
   */
  const accountKey =
    account?.kind === 'confirmed'
      ? `${account.account.membershipType}:${account.account.membershipId}`
      : null

  const accountRef = useRef<AccountState>({ kind: 'unavailable' })
  if (account !== null) accountRef.current = account

  const adapter = useMemo(
    // **不传 agentPreset**：`destiny` 尚未在 registry 注册，传了会被 `not-found` 拒。
    () =>
      deps === null || accountKey === null
        ? null
        : new SessionAdapter(deps, trust === undefined ? {} : { trust }, () => accountRef.current),
    [deps, accountKey, trust],
  )

  useEffect(() => {
    if (!enabled || adapter === null) return
    const controller = new AbortController()
    let subscription: { unsubscribe(): void } | null = null
    adapter
      .attach(controller.signal)
      .then((handle) => {
        if (controller.signal.aborted) return
        session.current = handle
        subscription = handle.subscribe((window) => {
          conversation.accept(window)
          // Controller 的快照是不可变的，每次 accept 后换引用即可。
          setState(conversation.snapshot())
        })
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(`连接失败：${String(err)}`)
      })
    return () => {
      controller.abort()
      subscription?.unsubscribe()
      session.current = null
      adapter.detach()
      conversation.reset()
      setState(conversation.snapshot())
    }
  }, [adapter, conversation, enabled])

  // 面板的视图是它自己 POST 上去的，浮窗订阅不到，只能按期读。
  // 2 秒够跟上"选中一件东西"，又不至于把桥接打成筛子。
  useEffect(() => {
    if (routePath === '') return
    let stopped = false
    const tick = () => {
      if (stopped) return
      const controller = new AbortController()
      fetchContext(routePath, controller.signal)
        .then((next) => {
          if (!stopped) setView(next as ViewContextLike)
        })
        .catch(() => {
          // 读不到就保持上一次的：按钮宁可旧一点，也别忽然全变回"没选中"。
        })
    }
    tick()
    const timer = setInterval(tick, 2000)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [routePath])

  const send = useCallback(
    async (text: string): Promise<boolean> => {
      const handle = session.current
      if (handle === null || text.trim() === '') return false
      setPhase('sending')
      setError(null)
      try {
        // 发送前读一次面板视图：玩家说"这件"时，模型得知道"这件"是哪件。
        // 拿不到就发原话——上下文是加分项，不能因为它失败就发不出去。
        const context = await loadContext(routePath)
        if (context !== null) setView(context)
        // **必须看返回值**：探针里就是这样丢过一次 `gateway/input-invalid`。
        const outcome = sendOutcome(await handle.send(withContext(context, text)))
        if (!outcome.ok) setError(outcome.reason)
        return outcome.ok
      } catch (err: unknown) {
        setError(`发送失败：${String(err)}`)
        return false
      } finally {
        setPhase('idle')
      }
    },
    [],
  )

  // 只读观测点（A8.1a 验收用）：会话身份与引用计数现在没有任何界面可见处。
  // 不参与渲染，只把当前值挂到页面上供连续采样，**不改任何行为**。
  useEffect(() => {
    const w = globalThis as { __dockProbe?: () => unknown }
    w.__dockProbe = () => ({
      sessionId: adapter?.sessionId ?? null,
      references: adapter?.referenceCount() ?? 0,
      bubbles: state.lines.filter((l) => l.kind === 'user' || l.kind === 'assistant').length,
      streaming: state.streaming !== null,
      phase,
    })
  })

  /** 账号没能确认时给用户看的话；`null` 表示不用提示。 */
  const blocker =
    account === null
      ? null
      : account.kind === 'confirmed'
        ? null
        : account.kind === 'signedOut'
          ? '没有读到已登录的 Bungie 账号：登录后重试。'
          : '账号状态暂时无法确认（不是没登录）。会话不会恢复，也不会新建。'

  return {
    state,
    phase,
    error,
    send,
    view,
    /** 账号三态；`null` = 还在查。界面按它决定显示什么。 */
    account,
    blocker,
    /** 手动重试账号解析；不轮询。 */
    retry: () => setAttempt((n) => n + 1),
  }
}

/**
 * 读一次面板视图。
 *
 * 失败一律当"没有上下文"：浮窗能聊天是主线，知道玩家在看什么只是加分。
 * 这里不重试——发送已经被用户按下了，多等一轮不如先把话发出去。
 */
async function loadContext(routePath: string): Promise<ViewContextLike | null> {
  if (routePath === '') return null
  const controller = new AbortController()
  try {
    return (await fetchContext(routePath, controller.signal)) as ViewContextLike
  } catch {
    return null
  }
}

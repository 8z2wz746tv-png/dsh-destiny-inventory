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
import { fetchContext } from '../api'
import { withContext } from './context-prompt'
import type { ViewContextLike } from './context-prompt'
import type { AgentSession, SessionDeps } from './session-adapter'
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
}

/**
 * @param deps - 会话服务；`null` 表示还没准备好（探针之外通常是有的）。
 * @param enabled - 窗口展开时才订阅，收起时释放引用。
 */
export function useConversation(
  deps: SessionDeps | null,
  enabled: boolean,
  routePath = '',
): ConversationApi {
  const conversation = useMemo(() => new Conversation(), [])
  const [state, setState] = useState<ConversationState>(conversation.snapshot())
  const [phase, setPhase] = useState<SendPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ViewContextLike | null>(null)
  const session = useRef<AgentSession | null>(null)
  const adapter = useMemo(
    // **不传 agentPreset**。`~/.dsh/.agent-presets/` 那几份是 `dsh-agents` 插件的
    // 格式（Cordis 组合，`preset.yml` 里没有 `id`），不是核心 registry 的条目；
    // 传 `'destiny'` 会被 `agent-preset/not-found` 拒掉。真实的 id 待查。
    () => (deps === null ? null : new SessionAdapter(deps)),
    [deps],
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

  return { state, phase, error, send, view }
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

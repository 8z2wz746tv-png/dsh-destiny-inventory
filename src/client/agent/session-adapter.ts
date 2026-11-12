/**
 * DSH Session 的接线层。
 *
 * **A3 只有这一层**：create / retain / ready / eventSource / prompt / release。
 * 它不认识 React，不画任何东西，也不做消息状态——那是 A4 的 Controller。
 *
 * 契约在本文件末尾本地声明，理由和 `slots.ts` 一样：DSH 的 client 包不该成为
 * 构建期依赖，我们只用其中六个方法，声明出来比拉一个会跟着宿主版本漂的包划算。
 */

import { clearSessionId, clearSessionIdIfMatches, readSessionId, saveSessionId } from './session-store'
import { abortedError, isUnknownSession } from './session-error'
import type { AccountState } from './session-store'

/** 引用来源。**这是越过类型闸门的唯一一处**，理由见 `RETAIN_SOURCE`。 */
type Source = 'controllerOperation' | 'gateway'

/**
 * 借用 `gateway` 这个名字。
 *
 * `SessionReferenceSource` 在 DSH 的类型上是封闭的两值联合，运行时没有任何校验，
 * 先例（`dsh-plugin-session-panes`）用的是自由字符串。我们借 `gateway` 是因为它
 * 语义上最接近"另一个入口"。
 *
 * **这不是 DSH 的承诺**：将来若出现 `plugin` 之类的来源，要换掉这一行。
 */
const RETAIN_SOURCE: Source = 'gateway'

/** 一次订阅：拿窗口快照，返回退订。 */
export interface EventSubscription {
  snapshot(): SessionWindow
  unsubscribe(): void
}

/** 适配器对外的全部能力。 */
export interface AgentSession {
  /** 这个会话的 id；关窗后仍然可读，下次用它恢复。 */
  readonly sessionId: string
  /** 发一条纯文本；**返回值必须看**，失败不会抛。 */
  send(text: string): Promise<unknown>
  /** 订阅事件窗口；同一时间只有一份订阅。 */
  subscribe(listener: (window: SessionWindow) => void): EventSubscription
  /** 释放引用并退订。**不销毁会话**。 */
  detach(): void
}

/** 适配器依赖的最小外部面。 */
export interface SessionDeps {
  /** 创建会话；返回 id。 */
  create(options: { workspaceId?: string; agentPreset?: string }): Promise<string>
  /** 持有引用。 */
  retain(id: string, options: { source: Source; signal?: AbortSignal }): SessionReference
  /** 读引用计数，只用于观测。 */
  retainInfo(id: string): { getSnapshot(): { referenceCount: number } }
}

/**
 * 创建的会话与复用的会话分开记账。
 *
 * `ensure()` 只在没有 id 时创建一次；`detach()` 之后 id 还在，下次 attach
 * 直接复用它。这就是"关窗不等于销毁会话"的落点。
 */
export class SessionAdapter {
  private id: string | null = null
  private live: LiveSession | null = null

  constructor(
    private readonly deps: SessionDeps,
    private readonly options: { workspaceId?: string; agentPreset?: string } = {},
    /**
     * 取当前账号状态的函数，**不是快照值**。
     *
     * 账号是异步落定的（先 `unavailable`，读到 `/account` 才 `confirmed`）。
     * 如果这里收一个值，`useMemo` 就会在账号落定时重建 adapter，effect 跟着重跑，
     * `conversation.reset()` 把刚收到的对话清空——**发出去的消息凭空消失**。
     * 传函数就只读"此刻是谁"，adapter 本身始终是同一个。
     */
    private readonly accountOf: () => AccountState = () => ({ kind: 'unavailable' }),
  ) {}

  /** 当前会话 id；没创建过就是 `null`。 */
  get sessionId(): string | null {
    return this.id
  }

  /**
   * 拿到会话：有就复用，没有就创建。
   *
   * 创建是幂等的——并发调用只创建一次，靠 `pending` 收口。
   */
  async ensure(): Promise<string> {
    if (this.id !== null) return this.id
    // 上次用过的就复用：换面板、刷新页面都会重建组件，id 不存就等于每次都开新会话。
    const stored = readSessionId(this.accountOf())
    if (stored !== null) {
      this.id = stored
      return stored
    }
    this.pending ??= this.deps
      .create({ workspaceId: this.options.workspaceId, agentPreset: this.options.agentPreset })
      .then((id) => {
        this.id = id
        saveSessionId(this.accountOf(), id)
        return id
      })
      .finally(() => {
        this.pending = null
      })
    return this.pending
  }

  /**
   * 记下的 id 已经不在了：丢掉它，下次 `ensure` 会建新的。
   *
   * 会话可能被归档、也可能是 DSH 换过数据目录——那时 `retain` 拿不到 binding，
   * 继续拿着这个 id 只会一直失败。
   */
  forget(): void {
    this.id = null
    clearSessionId(this.accountOf())
  }

  private pending: Promise<string> | null = null

  /**
   * 建立引用并等首批历史打开。
   *
   * **`ready` 没 settle 之前不把 binding 交出去**：那时 `eventSource` 里还没有
   * 历史条目，先订阅会让第一批消息丢掉。
   *
   * 已经 attach 过就返回同一份，不会叠加引用。
   */
  async attach(signal?: AbortSignal): Promise<AgentSession> {
    if (this.live !== null) return this.live
    // 并发 attach 必须收口到同一次持有：否则两个调用各 retain 一次、
    // 各建一份 LiveSession，只有后者被记下来，前者永远还不回去。
    this.attaching ??= this.open(signal).finally(() => {
      this.attaching = null
    })
    return this.attaching
  }

  private attaching: Promise<AgentSession> | null = null

  /**
   * 建立一次引用并等首批历史。**成功时把 `live` 记下来**。
   *
   * @param id - 要恢复的会话。
   * @param signal - 取消信号。
   * @returns 接好的会话。
   */
  private async retainOnce(id: string, signal?: AbortSignal): Promise<AgentSession> {
    const reference = this.deps.retain(id, { source: RETAIN_SOURCE, signal })
    try {
      const binding = await reference.ready
      // `await` 之后可能已被取消：不建立引用就别留一份悬挂的订阅。
      if (signal?.aborted) throw abortedError()
      this.live = new LiveSession(id, reference, binding)
      return this.live
    } catch (error) {
      // 失败也要把引用还回去，否则这条路径就是泄漏。
      reference.release()
      throw error
    }
  }

  /**
   * 打开会话，**最多两次 retain**：先恢复存储里的 id，若它在宿主里已不存在，
   * 清掉它并新建一次。
   *
   * 为什么要重建而不是只清理：DSH 只把用过的会话落盘（查证见 session-error.ts），
   * 一个创建后从未成功发过消息的会话，宿主重启后就不在 `session.list()` 里了。
   * 只清理会让浮窗永久停在"连接失败"。
   *
   * 为什么只重建一次：第二次还失败就说明不是"这个 id 没了"这么简单，继续试只会
   * 在每次挂载产生一个新会话。**失败要如实报出来，不能靠下次挂载掩盖。**
   *
   * 账号身份在开头捕获、清理前与写回前各校验一次：一次 `open()` 可能在账号切换后
   * 才收尾，那时绝不能动新账号的槽位。
   */
  private async open(signal?: AbortSignal): Promise<AgentSession> {
    const keyAtStart = this.accountKey()
    const id = await this.ensure()
    if (signal?.aborted) throw abortedError()
    try {
      return await this.retainOnce(id, signal)
    } catch (error) {
      if (!isUnknownSession(error)) throw error
      // 会话确实不在了。但只有账号没变时才有资格动存储。
      if (this.accountKey() !== keyAtStart) throw error
      clearSessionIdIfMatches(this.accountOf(), id)
      this.id = null
      // 取消已经发生：清掉死 id 就够了，**不要**再建一个——组件都卸载了。
      if (signal?.aborted) throw error
      if (this.accountKey() !== keyAtStart) throw error
      const fresh = await this.ensure()
      if (signal?.aborted) throw error
      return this.retainOnce(fresh, signal)
    }
  }

  /** 当前账号分区键；未确认时为 `null`。**不用 membershipId 单独判断**。 */
  private accountKey(): string | null {
    const state = this.accountOf()
    if (state.kind !== 'confirmed') return null
    return `${state.account.membershipType}:${state.account.membershipId}`
  }

  /** 释放引用并退订；会话 id 保留。 */
  detach(): void {
    this.live?.detach()
    this.live = null
  }

  /** 当前引用计数，给验收用。 */
  referenceCount(): number {
    return this.id === null ? 0 : this.deps.retainInfo(this.id).getSnapshot().referenceCount
  }
}

/** 一次持有期间的全部资源。 */
class LiveSession implements AgentSession {
  private subscription: (() => void) | null = null

  constructor(
    readonly sessionId: string,
    private readonly reference: SessionReference,
    private readonly binding: Binding,
  ) {}

  async send(text: string): Promise<unknown> {
    const trimmed = text.trim()
    if (trimmed === '') return undefined
    return this.binding.session.prompt([{ type: 'text', text: trimmed }], 'queue')
  }

  subscribe(listener: (window: SessionWindow) => void): EventSubscription {
    this.subscription?.()
    const notify = () => {
      listener(this.binding.eventSource.getSnapshot())
    }
    // 先给一次当前快照：订阅者不该等下一次变更才看见已有历史。
    notify()
    this.subscription = this.binding.eventSource.subscribe(notify)
    return {
      snapshot: () => this.binding.eventSource.getSnapshot(),
      unsubscribe: () => {
        this.subscription?.()
        this.subscription = null
      },
    }
  }

  detach(): void {
    this.subscription?.()
    this.subscription = null
    this.reference.release()
  }
}

// ── 本地声明的最小契约（形状与 DSH 0.2.1-rc.5 一致，只取用到的部分） ──

/** 事件窗口：`entries` 是消息与流式条目，`hasMore` 表示还能往前翻。 */
export interface SessionWindow {
  readonly entries: readonly unknown[]
  readonly hasMore: boolean
  readonly revision: number
  /** 这一批的增量语义；`entries` 是当前窗口全量。 */
  readonly change: SessionChange
}

/** 窗口变更：DSH 自己给语义，不用我们 diff。 */
export type SessionChange =
  | { readonly kind: 'replace'; readonly entries: readonly unknown[] }
  | { readonly kind: 'prepend'; readonly entries: readonly unknown[] }
  | { readonly kind: 'append'; readonly entries: readonly unknown[] }
  | { readonly kind: 'settle-assistant'; readonly attemptId: string; readonly entry?: unknown }

interface Observable<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

interface Binding {
  readonly sessionId: string
  readonly session: {
    prompt(
      content: readonly ({ type: 'text'; text: string } | { type: 'image'; mediaType: string; data: string } | { type: 'file'; receiptId: string })[] ,
      mode: 'queue' | 'steer',
    ): Promise<unknown>
  }
  readonly eventSource: Observable<SessionWindow>
}

interface SessionReference {
  readonly sessionId: string
  readonly binding: Binding
  readonly ready: Promise<Binding>
  release(): void
}

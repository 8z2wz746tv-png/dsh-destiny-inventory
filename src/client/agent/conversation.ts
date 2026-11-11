/**
 * 对话状态机。
 *
 * **不画 UI**，也不认识 DSH 的 Session 类型：它只吃 Adapter 给的 `SessionWindow`，
 * 吐出可以渲染的行。事件语义靠 `change.kind` 分辨，**不靠猜 `event.type` 的字符串**——
 * 那是 A5 渲染时的事。
 *
 * 六件事各自有状态，因为它们的正确解法不同：
 *
 * - 历史初始化 → **全量替换**
 * - 流式增量 → 累积到**同一个** attempt，不是每条都新建
 * - 流式结束 → 定型成行，并记住这个 attempt 已经结束
 * - 工具调用/结果 → 独立行，不并进 assistant 正文
 * - 错误/取消 → 终止生成，**保留已收到的内容**
 * - 分页 → 向前插入，不动末尾
 */

import type { SessionWindow } from './session-adapter'

/** 一行定型内容。`raw` 留给 A5 解释，Controller 不碰。 */
export interface ConversationLine {
  /** 稳定 id：同一条消息在多次刷新后必须是同一个。 */
  readonly key: string
  /** `assistant` / `user` / `tool` / 其他，取自 `event.type` 的前缀。 */
  readonly kind: string
  readonly raw: unknown
}

/** 正在生成的那一条。 */
export interface StreamingLine {
  readonly attemptId: string
  readonly text: string
}

/** Controller 对外的全部状态。 */
export interface ConversationState {
  readonly lines: readonly ConversationLine[]
  readonly streaming: StreamingLine | null
  readonly hasMore: boolean
  readonly loadingOlder: boolean
  /** 最近一次生成被取消或出错的原因；成功后清空。 */
  readonly error: string | null
}

/** 条目：定型事件或流式块。 */
interface Entry {
  readonly type: 'event' | 'transient'
  readonly event?: { readonly type?: string; readonly seq?: number }
  readonly data?: { readonly attemptId?: string; readonly chunk?: unknown }
}

const EMPTY: ConversationState = {
  lines: [],
  streaming: null,
  hasMore: false,
  loadingOlder: false,
  error: null,
}

/**
 * 哪些 `event.type` 是**要显示成一行**的。
 *
 * 探针实测（2026-11-11）初始窗口里混着 `permission/preset`、`sandbox/mode`、
 * `turn/start`、`step/start`、`request/header`、`session/title` 等十几种事件——
 * 它们都是状态记录，不是对话。不过滤的话，第一次打开就是几十条假消息。
 *
 * `tool/call` 与 `tool/result` 是**两个独立的类型**，不是一条消息的两个阶段。
 */
const RENDERED = new Set([
  'user/message',
  'assistant/message',
  'tool/call',
  'tool/result',
  'system/message',
])

/** 从 `event.type` 取前缀（`assistant/message` → `assistant`）。 */
function kindOf(event: { type?: string } | undefined): string {
  const type = event?.type ?? ''
  const slash = type.indexOf('/')
  return slash < 0 ? 'unknown' : type.slice(0, slash)
}

/**
 * 从 chunk 里取文本。
 *
 * `StreamChunk` 的形状没在这份契约里给出，所以这里**只认几种常见字段，认不出就返回空**：
 * 宁可少显示一段增量，也不要因为一个没见过的 chunk 形状把整条流打断。
 * A5 之前会拿真实 chunk 校准一次。
 */
export function chunkText(chunk: unknown): string {
  if (typeof chunk !== 'object' || chunk === null) return ''
  const c = chunk as Record<string, unknown>
  for (const key of ['textDelta', 'text', 'delta', 'content']) {
    const value = c[key]
    if (typeof value === 'string') return value
  }
  return ''
}

/**
 * 一条状态机。
 *
 * 每次 `accept(window)` 只应用**这一批的增量**，靠 `change.kind` 决定怎么应用。
 */
export class Conversation {
  private state: ConversationState = EMPTY
  /** 已经结束的 attempt；迟到的 chunk 撞上它必须被丢弃。 */
  private readonly settled = new Set<string>()
  /** 已取消的 attempt：同样不接收后续 chunk。 */
  private readonly cancelled = new Set<string>()

  /** 当前状态；不可变，调用方可以直接比较引用。 */
  snapshot(): ConversationState {
    return this.state
  }

  /**
   * 应用一次窗口变更。
   * @param window - Adapter 交来的窗口。
   */
  accept(window: SessionWindow): void {
    const change = window.change
    switch (change.kind) {
      case 'replace':
        // 历史初始化：**整份换掉**，不能追加到旧历史后面。
        this.state = {
          ...this.state,
          lines: change.entries.map(toLine).filter(isLine),
          hasMore: window.hasMore,
          loadingOlder: false,
        }
        this.absorbTransients(change.entries)
        return
      case 'prepend':
        // 向前翻页：插到最前面，**不碰末尾**，也不清 streaming。
        this.state = {
          ...this.state,
          lines: [...change.entries.map(toLine).filter(isLine), ...this.state.lines],
          hasMore: window.hasMore,
          loadingOlder: false,
        }
        return
      case 'append':
        this.state = {
          ...this.state,
          lines: [...this.state.lines, ...change.entries.map(toLine).filter(isLine)],
          hasMore: window.hasMore,
        }
        this.absorbTransients(change.entries)
        return
      case 'settle-assistant': {
        // 流式结束：把这一轮定型，并记住它已经结束。
        const attemptId = change.attemptId
        this.settled.add(attemptId)
        const made = toLine(change.entry)
        const line = isLine(made) ? made : null
        this.state = {
          ...this.state,
          lines: line === null ? this.state.lines : [...this.state.lines, line],
          streaming:
            this.state.streaming?.attemptId === attemptId ? null : this.state.streaming,
          // 结束即成功：上一次的错误不再适用。
          error: null,
        }
        return
      }
    }
  }

  /**
   * 把一批里的 transient 条目并进当前 streaming。
   *
   * 三种情况必须区分：**新的 attempt** 开一条新的；**同一个 attempt** 追加；
   * **已结束或已取消的 attempt** 直接丢弃——那是取消之后还在路上的 chunk。
   */
  private absorbTransients(entries: readonly unknown[]): void {
    for (const raw of entries) {
      const entry = raw as Entry
      if (entry?.type !== 'transient') continue
      const attemptId = entry.data?.attemptId ?? ''
      if (attemptId === '') continue
      if (this.settled.has(attemptId) || this.cancelled.has(attemptId)) continue
      const text = chunkText(entry.data?.chunk)
      const current = this.state.streaming
      // 换了 attempt 就开新的一条：上一轮的文本不能并进这一轮。
      const base = current !== null && current.attemptId === attemptId ? current.text : ''
      this.state = { ...this.state, streaming: { attemptId, text: base + text } }
    }
  }

  /**
   * 用户取消或生成出错。
   *
   * **保留已经收到的内容**——把它定成行，然后清掉流式状态。这样用户看到的
   * 不是"什么都没发生"，而是"到这里为止"。
   *
   * @param reason - 写进 `error` 的说明。
   * @param attemptId - 要终止的 attempt；不传就终止当前那个。
   */
  stop(reason: string, attemptId?: string): void {
    const target = attemptId ?? this.state.streaming?.attemptId
    if (target === undefined) {
      this.state = { ...this.state, error: reason }
      return
    }
    this.cancelled.add(target)
    const partial = this.state.streaming?.attemptId === target ? this.state.streaming.text : ''
    const lines =
      partial === ''
        ? this.state.lines
        : [...this.state.lines, { key: `stopped:${target}`, kind: 'assistant', raw: partial }]
    this.state = {
      ...this.state,
      lines,
      streaming: this.state.streaming?.attemptId === target ? null : this.state.streaming,
      error: reason,
    }
  }

  /** 用户在翻历史。 */
  setLoadingOlder(loading: boolean): void {
    this.state = { ...this.state, loadingOlder: loading }
  }

  /** 清空（换会话时用）。 */
  reset(): void {
    this.state = EMPTY
    this.settled.clear()
    this.cancelled.clear()
  }
}

/** `event` 条目转成一行；`transient` 与状态类事件都不算行。 */
function toLine(raw: unknown): ConversationLine | null {
  const entry = raw as Entry
  if (entry?.type !== 'event') return null
  const type = entry.event?.type ?? ''
  if (!RENDERED.has(type)) return null
  const seq = entry.event?.seq ?? 0
  return { key: `e${seq}`, kind: kindOf(entry.event), raw: entry.event }
}

function isLine(value: ConversationLine | null): value is ConversationLine {
  return value !== null
}

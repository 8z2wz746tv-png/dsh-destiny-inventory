/**
 * 工具调用与结果的配对。
 *
 * **按 `callId` 配，不按顺序**。探针实证：`tool/call.data.callId` 与
 * `tool/result.data.message.toolCallId` 是同一个值，结果还带
 * `sourceEventSeqs` 指向调用的 seq——那是诊断用的，不是唯一依据。
 *
 * 结果先于调用到达也能配：两边各自记进表，最后合并。**不假设顺序**。
 */

/** 一次工具调用在界面上的状态。 */
export interface ToolState {
  readonly callId: string
  /** 工具名；只有结果先到时先空着。 */
  readonly name: string
  /** 参数原文（JSON 字符串）；只有结果先到时先空着。 */
  readonly args: string
  /** 结果正文；还没到就是 `null`。 */
  readonly result: string | null
  /** `isError`；结果未到为 `null`。 */
  readonly failed: boolean | null
}

/** 从一行里取出它携带的事件对象。 */
function dataOf(raw: unknown): Record<string, unknown> | null {
  const event = (raw as { data?: unknown } | null)?.data
  return typeof event === 'object' && event !== null ? (event as Record<string, unknown>) : null
}

/** 从结果行里取出 `message`。 */
function resultMessage(raw: unknown): Record<string, unknown> | null {
  const data = dataOf(raw)
  const message = data?.message
  return typeof message === 'object' && message !== null ? (message as Record<string, unknown>) : null
}

/** 结果里的正文：`content` 是 `[{type:'text', text}]`。 */
function resultText(message: Record<string, unknown> | null): string {
  const content = message?.content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      const p = part as { type?: string; text?: unknown }
      return p.type === 'text' && typeof p.text === 'string' ? p.text : ''
    })
    .filter((t) => t !== '')
    .join('\n')
}

/**
 * 把一批行里的工具调用与结果配对。
 *
 * @param lines - Controller 给出的行；非工具行会被忽略。
 * @returns `callId → ToolState`。只有结果、没有调用的也会出现（`name` 为空），
 *   这样界面上至少能看到"有一次调用返回了"，而不是整条消失。
 */
export function pairTools(lines: readonly { kind: string; raw: unknown }[]): Map<string, ToolState> {
  const calls = new Map<string, { name: string; args: string }>()
  const results = new Map<string, { text: string; failed: boolean }>()

  for (const line of lines) {
    const event = line.raw as { type?: string } | null
    if (line.kind !== 'tool') continue
    if (event?.type === 'tool/call') {
      const data = dataOf(line.raw)
      const callId = typeof data?.callId === 'string' ? data.callId : ''
      if (callId === '') continue
      calls.set(callId, {
        name: typeof data?.name === 'string' ? data.name : '',
        args: typeof data?.arguments === 'string' ? data.arguments : '',
      })
      continue
    }
    if (event?.type === 'tool/result') {
      const message = resultMessage(line.raw)
      const callId = typeof message?.toolCallId === 'string' ? message.toolCallId : ''
      if (callId === '') continue
      results.set(callId, {
        text: resultText(message),
        failed: message?.isError === true,
      })
    }
  }

  const out = new Map<string, ToolState>()
  // 两边的键都收：结果先到也不会丢。
  for (const callId of new Set([...calls.keys(), ...results.keys()])) {
    const call = calls.get(callId)
    const result = results.get(callId)
    out.set(callId, {
      callId,
      name: call?.name ?? '',
      args: call?.args ?? '',
      result: result === undefined ? null : result.text,
      failed: result === undefined ? null : result.failed,
    })
  }
  return out
}

/**
 * 一次调用在界面上的阶段。
 * @param state - 配对结果。
 * @returns `pending` 等结果、`done` 成功、`failed` 失败。
 */
export function toolStatus(state: ToolState): 'pending' | 'done' | 'failed' {
  if (state.result === null) return 'pending'
  return state.failed === true ? 'failed' : 'done'
}

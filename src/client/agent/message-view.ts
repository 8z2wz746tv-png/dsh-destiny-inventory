/**
 * 行 → 气泡。
 *
 * **消费 Controller 的输出，不读 DSH 事件流**：`ConversationLine.raw` 是 Controller
 * 存下来的原样事件，这里只把它摊成界面要的字段。会话状态机仍然只有一份（A4）。
 */
import { pairTools, toolStatus } from './tool-pairs'
import type { ConversationState } from './conversation'

/** 一条可渲染的气泡。 */
export interface Bubble {
  readonly key: string
  readonly role: 'user' | 'assistant' | 'tool'
  readonly text: string
  /** 工具气泡才有。 */
  readonly tool?: {
    readonly callId: string
    readonly name: string
    readonly args: string
    readonly result: string | null
    readonly status: 'pending' | 'done' | 'failed'
  }
}

/**
 * 从消息行里取正文。
 *
 * **探针实证（2026-11-12）**：`assistant/message` 的正文在
 * `data.message.content`，而 `data` 本身装的是 `turn` / `step` / `usage` / `stream`。
 * 早先读 `data.content` 是错的层级——取不到，于是回落到 `data.text`，那也是空的。
 *
 * 只认 `type: 'text'` 的块。同一份样本里还有 `type: 'reasoning'`（模型思考，空字符串），
 * 那不是给玩家看的内容。**按块类型取，不按文本内容猜。**
 */
function textOf(raw: unknown): string {
  const data = (raw as { data?: Record<string, unknown> } | null)?.data
  if (data === undefined) return ''
  const message = data.message as { content?: unknown } | undefined
  const content = Array.isArray(message?.content) ? message.content : data.content
  if (!Array.isArray(content)) {
    const direct = data.text
    return typeof direct === 'string' ? direct : ''
  }
  return content
    .map((part) => {
      const block = part as { type?: string; text?: unknown }
      // `reasoning` / 工具块 / 未知类型都不进气泡。
      return block.type === 'text' && typeof block.text === 'string' ? block.text : ''
    })
    .filter((t) => t !== '')
    .join('\n')
}

/** 事件类型 → 角色。 */
function roleOf(kind: string): Bubble['role'] {
  if (kind === 'user') return 'user'
  if (kind === 'tool') return 'tool'
  return 'assistant'
}

/**
 * 把状态摊成气泡列表。
 *
 * 工具行在这里**按 callId 合并**：一次调用只出一条气泡，`result` 到了就更新状态。
 * 结果先到、调用后到时，气泡出现在调用行的位置，不会凭空少一条。
 *
 * @param state - Controller 的快照。
 * @returns 从上到下的气泡；正在生成的那条附在末尾。
 */
export function bubblesOf(state: ConversationState): Bubble[] {
  const tools = pairTools(state.lines)
  /** 已经出过工具气泡的 callId，避免同一次调用画两遍。 */
  const drawn = new Set<string>()
  const out: Bubble[] = []

  for (const line of state.lines) {
    if (line.kind === 'tool') {
      const event = line.raw as { type?: string } | null
      const callId =
        event?.type === 'tool/call'
          ? String((line.raw as { data?: { callId?: string } }).data?.callId ?? '')
          : String((line.raw as { data?: { message?: { toolCallId?: string } } }).data?.message?.toolCallId ?? '')
      if (callId === '') continue
      const state2 = tools.get(callId)
      if (state2 === undefined) continue
      // 同一次调用只画第一条：`tool/result` 行不再单独成泡。
      if (drawn.has(callId) && event?.type === 'tool/result') continue
      drawn.add(callId)
      out.push({
        key: line.key,
        role: 'tool',
        text: state2.name,
        tool: {
          callId,
          name: state2.name,
          args: state2.args,
          result: state2.result,
          status: toolStatus(state2),
        },
      })
      continue
    }
    out.push({ key: line.key, role: roleOf(line.kind), text: textOf(line.raw) })
  }
  return out
}

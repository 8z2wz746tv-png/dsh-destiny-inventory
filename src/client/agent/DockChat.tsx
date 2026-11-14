/**
 * 悬浮窗里的对话界面。
 *
 * **只读 Controller 的状态**：气泡由 `bubblesOf` 摊出来，这里不解析任何事件，
 * 也不自己记消息。它拿到的每一样东西都能在 `Conversation` 的快照里找到。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { bubblesOf } from './message-view'
import { quickActions } from './quick-actions'
import { isWeaponAssistant, parseWeaponCard } from './weapon-card-model'
import { WeaponCard } from './WeaponCard'
import type { Bubble } from './message-view'
import { useConversation } from './use-conversation'
import type { SessionDeps } from './session-adapter'
import type { BaselineTrustSource } from './baseline-trust'

/** 这次调用是不是卡片关心的 intent；`weapon_assistant` 默认 intent 是 analyze。 */
function isCardIntent(args: string): boolean {
  try {
    const value = JSON.parse(args) as { intent?: unknown }
    const intent = typeof value.intent === 'string' ? value.intent : 'analyze'
    return intent === 'analyze' || intent === 'filter_rolls'
  } catch {
    return false
  }
}

/** 工具明确返回 ok:false 是可读的错误，不是“解析失败”；原始结果里已经写清原因。 */
function isToolRefusal(result: string): boolean {
  try {
    return (JSON.parse(result) as { ok?: unknown }).ok === false
  } catch {
    return false
  }
}

/** 一个工具气泡：名字、状态、参数与结果折叠；武器分析结果渲染成卡片。 */
function ToolBubble({
  bubble,
  selectedInstanceId,
}: {
  bubble: Bubble
  selectedInstanceId?: string
}): ReactElement {
  const tool = bubble.tool
  // 只解析**这一个气泡自己的** result；callId 已在 tool-pairs 里配对，不共享“最近一次”。
  const model = useMemo(() => {
    if (tool === undefined || tool.status !== 'done' || tool.result === null) return null
    if (!isWeaponAssistant(tool.name)) return null
    return parseWeaponCard(tool.result)
  }, [tool?.name, tool?.status, tool?.result])
  if (tool === undefined) return <span />
  const label = tool.status === 'pending' ? '等待结果…' : tool.status === 'failed' ? '失败' : '完成'
  const unparsedWeapon =
    isWeaponAssistant(tool.name) &&
    tool.status === 'done' &&
    tool.result !== null &&
    model === null &&
    isCardIntent(tool.args) &&
    !isToolRefusal(tool.result)
  return (
    <div className={`inventory-dock__tool is-${tool.status}`}>
      <div className="inventory-dock__tool-head">
        <span className="inventory-dock__tool-name">{tool.name === '' ? '工具' : tool.name}</span>
        <span className="inventory-dock__tool-status">{label}</span>
      </div>
      {unparsedWeapon && (
        <p className="inventory-dock__tool-unparsed">
          武器卡片结果无法完整解析，未生成卡片（可能被宿主截断或格式异常）。
        </p>
      )}
      {model !== null ? (
        <WeaponCard model={model} selectedInstanceId={selectedInstanceId} />
      ) : (
        tool.result !== null && (
          <pre className="inventory-dock__tool-result" onPointerDown={(event) => event.stopPropagation()}>
            {tool.result.slice(0, 400)}
          </pre>
        )
      )}
    </div>
  )
}

export function DockChat({
  sessions,
  routePath = '',
  trust,
}: {
  sessions: SessionDeps | null
  routePath?: string
  trust?: BaselineTrustSource
}): ReactElement {
  const [draft, setDraft] = useState('')
  const { state, phase, error, send, view, blocker, retry } = useConversation(sessions, true, routePath, trust)
  const bubbles = bubblesOf(state)
  const logRef = useRef<HTMLDivElement>(null)

  // 新消息或流式增量到达时贴到底。没有这一步，回复会一直待在视野外面——
  // 真机上就是"发出去了什么都看不见"。
  useEffect(() => {
    const element = logRef.current
    if (element !== null) element.scrollTop = element.scrollHeight
  }, [bubbles.length, state.streaming?.text])
  const submit = async () => {
    const text = draft.trim()
    if (text === '' || phase === 'sending') return
    // 只有被接受才清空：失败时保留输入，用户不用重打。
    if (await send(text)) setDraft('')
  }

  return (
    <div className="inventory-dock__chat">
      <div className="inventory-dock__log" ref={logRef}>
        {bubbles.length === 0 && state.streaming === null && (
          <p className="inventory-dock__hint">还没有对话。问点什么试试。</p>
        )}
        {bubbles.map((bubble) =>
          bubble.role === 'tool' ? (
            <ToolBubble
              key={bubble.key}
              bubble={bubble}
              selectedInstanceId={view?.selected?.instanceId}
            />
          ) : (
            <div key={bubble.key} className={`inventory-dock__bubble is-${bubble.role}`}>
              {bubble.text}
            </div>
          ),
        )}
        {state.streaming !== null && (
          <div className="inventory-dock__bubble is-assistant is-streaming">
            {state.streaming.text === '' ? '…' : state.streaming.text}
          </div>
        )}
        {state.error !== null && <div className="inventory-dock__bubble is-error">{state.error}</div>}
      </div>
      {error !== null && <div className="inventory-dock__bubble is-error">{error}</div>}
      {blocker !== null && (
        <div className="inventory-dock__bubble is-error">
          {blocker}
          <button
            type="button"
            className="inventory-dock__chip"
            style={{ marginLeft: 6 }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={retry}
          >
            重试
          </button>
        </div>
      )}
      <div className="inventory-dock__quick">
        {quickActions(view).map((action) => (
          <button
            key={action.id}
            type="button"
            className="inventory-dock__chip"
            disabled={phase === 'sending'}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => void send(action.prompt)}
          >
            {action.label}
          </button>
        ))}
      </div>
      <div className="inventory-dock__composer">
        <input
          className="inventory-dock__input"
          // 浮窗整体挂了拖动，`setPointerCapture` 会吞掉内部点击——交互控件必须自己挡住。
          onPointerDown={(event) => event.stopPropagation()}
          value={draft}
          placeholder="问点什么…"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void submit()
            }
          }}
        />
        <button
          type="button"
          className="inventory-dock__send"
          onPointerDown={(event) => event.stopPropagation()}
          disabled={phase === 'sending' || draft.trim() === ''}
          onClick={() => void submit()}
        >
          {phase === 'sending' ? '…' : '发送'}
        </button>
      </div>
    </div>
  )
}

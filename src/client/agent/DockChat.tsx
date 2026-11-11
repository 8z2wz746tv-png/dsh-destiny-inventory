/**
 * 悬浮窗里的对话界面。
 *
 * **只读 Controller 的状态**：气泡由 `bubblesOf` 摊出来，这里不解析任何事件，
 * 也不自己记消息。它拿到的每一样东西都能在 `Conversation` 的快照里找到。
 */
import { useState } from 'react'
import type { ReactElement } from 'react'
import { bubblesOf } from './message-view'
import type { Bubble } from './message-view'
import { useConversation } from './use-conversation'
import type { SessionDeps } from './session-adapter'

/** 一个工具气泡：名字、状态、参数与结果折叠。 */
function ToolBubble({ bubble }: { bubble: Bubble }): ReactElement {
  const tool = bubble.tool
  if (tool === undefined) return <span />
  const label = tool.status === 'pending' ? '等待结果…' : tool.status === 'failed' ? '失败' : '完成'
  return (
    <div className={`inventory-dock__tool is-${tool.status}`}>
      <div className="inventory-dock__tool-head">
        <span className="inventory-dock__tool-name">{tool.name === '' ? '工具' : tool.name}</span>
        <span className="inventory-dock__tool-status">{label}</span>
      </div>
      {tool.result !== null && (
        <pre className="inventory-dock__tool-result" onPointerDown={(event) => event.stopPropagation()}>
          {tool.result.slice(0, 400)}
        </pre>
      )}
    </div>
  )
}

export function DockChat({ sessions }: { sessions: SessionDeps | null }): ReactElement {
  const [draft, setDraft] = useState('')
  const { state, phase, error, send } = useConversation(sessions, true)
  const bubbles = bubblesOf(state)
  const submit = async () => {
    const text = draft.trim()
    if (text === '' || phase === 'sending') return
    // 只有被接受才清空：失败时保留输入，用户不用重打。
    if (await send(text)) setDraft('')
  }

  return (
    <div className="inventory-dock__chat">
      <div className="inventory-dock__log">
        {bubbles.length === 0 && state.streaming === null && (
          <p className="inventory-dock__hint">还没有对话。问点什么试试。</p>
        )}
        {bubbles.map((bubble) =>
          bubble.role === 'tool' ? (
            <ToolBubble key={bubble.key} bubble={bubble} />
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

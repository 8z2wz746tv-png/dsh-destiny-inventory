/**
 * 临时诊断入口：把真实的事件窗口原样 dump 出来。
 *
 * **只为确定 A5 的数据契约**。跑完就删，不进长期代码。
 * 只在 `?probe=1` 时注册，正常页面里不存在。
 */
import { useState } from 'react'
import type { ReactElement } from 'react'
import { SessionAdapter } from './session-adapter'
import type { SessionDeps } from './session-adapter'

/** 去掉可能很大的字段，只留结构与键名。 */
function shape(value: unknown, depth = 0): unknown {
  if (depth > 4) return '…'
  if (value === null) return null
  if (Array.isArray(value)) return value.slice(0, 3).map((v) => shape(v, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // 凭据与个人资料不进探针。
      if (/token|auth|secret|cookie|membership|displayName/i.test(k)) {
        out[k] = '<redacted>'
        continue
      }
      if (typeof v === 'string' && v.length > 300) {
        out[k] = `${v.slice(0, 300)}…(${v.length})`
        continue
      }
      out[k] = shape(v, depth + 1)
    }
    return out
  }
  return value
}

export function Probe({ sessions }: { sessions: SessionDeps }): ReactElement {
  const [log, setLog] = useState<string>('未运行')
  const [busy, setBusy] = useState(false)

  const run = async (text: string) => {
    setBusy(true)
    setLog('创建会话…')
    const adapter = new SessionAdapter(sessions)
    try {
      const handle = await adapter.attach()
      setLog('已就绪，发送中…')
      const captured: unknown[] = []
      handle.subscribe((window) => {
        captured.push({
          revision: window.revision,
          hasMore: window.hasMore,
          change: window.change,
          entries: window.entries,
        })
      })
      const sent = await handle.send(text)
      // eslint-disable-next-line no-console
      console.log('PROBE_SEND', JSON.stringify(sent))
      setLog('已发送（结果见 PROBE_SEND），等 20 秒采集…')
      await new Promise((r) => setTimeout(r, 20_000))
      const shaped = captured.map((c) => shape(c))
      // eslint-disable-next-line no-console
      console.log('PROBE_WINDOWS', JSON.stringify(shaped))
      // eslint-disable-next-line no-console
      console.log('PROBE_KINDS', JSON.stringify(collectKinds(captured)))
      setLog(`采集 ${captured.length} 次窗口变更，见控制台 PROBE_WINDOWS`)
      adapter.detach()
    } catch (error) {
      setLog(`失败：${String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        right: 12,
        bottom: 12,
        width: 320,
        background: '#111',
        border: '1px solid #555',
        borderRadius: 8,
        padding: 10,
        zIndex: 9999,
        fontSize: 11,
        color: '#ddd',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>探针（临时）</div>
      <div style={{ opacity: 0.7, marginBottom: 8, lineHeight: 1.4 }}>{log}</div>
      <button type="button" disabled={busy} onClick={() => void run('用 weapon_assistant 列出我当前的武器，随便说三把')}>
        跑一次（含工具调用）
      </button>
    </div>
  )
}

/** 汇总实际出现的条目类型。 */
function collectKinds(captured: unknown[]): Record<string, number> {
  const counts: Record<string, number> = {}
  const bump = (key: string) => {
    counts[key] = (counts[key] ?? 0) + 1
  }
  for (const raw of captured) {
    const w = raw as { entries?: unknown[] }
    for (const e of w.entries ?? []) {
      const entry = e as { type?: string; event?: { type?: string } }
      bump(`${entry.type ?? '?'}/${entry.event?.type ?? '-'}`)
    }
  }
  return counts
}

import type { ReactElement } from 'react'
import type { ReceiptLine } from './use-receipts'

/**
 * The action receipts stacked in the corner.
 *
 * A success disappears on its own after five seconds; a failure stays until it is
 * clicked, because the reason only exists there. A line still in flight can be
 * cancelled — that stops this client waiting, not the write upstream.
 * @param props - the lines and the dismiss handler.
 */
export function Receipts({
  lines,
  onDismiss,
}: {
  lines: ReceiptLine[]
  onDismiss: (id: number) => void
}): ReactElement | null {
  if (lines.length === 0) return null
  return (
    <div className="dsh-destiny-receipts">
      {lines.map((line) => (
        <div
          key={line.id}
          className={`dsh-destiny-receipt${line.ok ? '' : ' is-error'}${line.pending === true ? ' is-pending' : ''}`}
          title={line.detail}
          role="status"
          aria-busy={line.pending === true}
          onClick={() => {
            if (line.pending === true) line.cancel?.()
            onDismiss(line.id)
          }}
        >
          {line.icon !== undefined && <img className="dsh-destiny-receipt__icon" src={line.icon} alt="" />}
          <span className="dsh-destiny-receipt__text">{line.text}</span>
          <span className="dsh-destiny-receipt__detail">{line.detail}</span>
        </div>
      ))}
    </div>
  )
}

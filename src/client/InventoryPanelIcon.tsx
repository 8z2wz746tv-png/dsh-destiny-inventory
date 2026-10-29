import type { ReactElement } from 'react'

/**
 * Sidebar row glyph.
 *
 * The shell owns the button, label, tooltip and rail geometry; a panel row
 * contributes only its glyph, drawn at the size the shell asks for.
 * @param props - the shell's icon share: square edge and selection state.
 */
export function InventoryPanelIcon({ size }: { size?: number }): ReactElement {
  return (
    <svg
      data-dsh-panel-entry="dsh-destiny-inventory"
      viewBox="0 0 16 16"
      width={size ?? 16}
      height={size ?? 16}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
      <path d="M2 6h12M5.5 6v7.5M9 6v7.5" />
    </svg>
  )
}

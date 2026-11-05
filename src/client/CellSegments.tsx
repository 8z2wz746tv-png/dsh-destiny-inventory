import type { ReactElement } from 'react'
import type { ItemRow } from '../host/types'
import type { CellSegment } from './segments'

/** What a tile needs from the panel; passed through so this file stays presentational. */
export interface TileHandlers {
  overlays: { crafted: string; craftedBackground: string; tiers: string[] }
  compact: boolean
  onHover: (pick: { id: string; anchor: DOMRect; summary: never }) => void
  onPin: (pick: { id: string; anchor: DOMRect; summary: never }) => void
  onLeave: () => void
  onDragStart: (item: ItemRow) => void
  onDragEnd: () => void
}

/**
 * The blocks inside a vault cell: a head glyph, then that group's tiles.
 *
 * DIM groups the vault column alone and draws the group glyph at the head of each
 * block; character cells never split.
 * @param props - the segments and the tile callbacks.
 */
export function CellSegments(props: {
  segments: CellSegment[]
  renderTile: (item: ItemRow) => ReactElement
}): ReactElement {
  return (
    <>
      {props.segments.map((segment) => (
        <div className="dsh-destiny-segment" key={segment.label}>
          {segment.icon !== null && (
            <span
              className="dsh-destiny-segment__glyph"
              aria-hidden="true"
              // prettier-ignore
              dangerouslySetInnerHTML={{ __html: segment.icon }}
            />
          )}
          {segment.items.map((item) => props.renderTile(item))}
        </div>
      ))}
    </>
  )
}

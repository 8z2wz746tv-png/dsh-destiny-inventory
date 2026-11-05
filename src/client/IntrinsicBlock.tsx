import type { ReactElement } from 'react'
import type { ItemDetailView } from '../host/types'

/**
 * The exotic's own effect, drawn above the perks.
 *
 * DIM gives this its own row with the full flavour text; without it the card is a
 * pile of ordinary perks that never explains why the item is exotic.
 * @param props - the intrinsic, or null when the item has none.
 */
export function IntrinsicBlock(props: {
  intrinsic: ItemDetailView['intrinsic']
}): ReactElement | null {
  const { intrinsic } = props
  if (intrinsic === null) return null
  return (
    <section className="inventory-hover-intrinsic" aria-label="固有特性">
      {intrinsic.icon !== '' && (
        <img className="inventory-hover-intrinsic__icon" src={intrinsic.icon} alt="" />
      )}
      <div>
        <h3>{intrinsic.name}</h3>
        {intrinsic.description !== '' && <p>{intrinsic.description}</p>}
      </div>
    </section>
  )
}

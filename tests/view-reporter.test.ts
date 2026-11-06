/**
 * What the agent is told the user is looking at.
 *
 * The panel has three widths. In the narrow and medium ones a class key is the
 * honest answer; in the wide one every store is on screen at once, so naming one
 * character would be a lie the agent then repeats back to the user.
 */
import { describe, expect, it } from 'vitest'
import { viewOf } from '../src/client/view-reporter'
import { DEFAULT_FILTERS } from '../src/client/filter'
import type { ItemRow } from '../src/host/types'

const row = { instanceId: 'i1', hash: 42, name: '英勇利刃', locationKey: 'hunter' } as ItemRow

describe('viewOf', () => {
  it('reports the class key in focus when one store is on screen', () => {
    expect(viewOf('warlock', DEFAULT_FILTERS, undefined, null).character).toBe('warlock')
  })

  it('reports `all` when every store is on screen', () => {
    // Injectable violation: pass the class key through unconditionally and the
    // agent answers "you are looking at the hunter" over a four-column layout.
    expect(viewOf('all', DEFAULT_FILTERS, row, null).character).toBe('all')
  })

  it('reports the clicked item, not the hovered one', () => {
    expect(viewOf('all', DEFAULT_FILTERS, row, 'vault').selected).toEqual({
      instanceId: 'i1',
      hash: 42,
      name: '英勇利刃',
      location: 'hunter',
    })
  })
})

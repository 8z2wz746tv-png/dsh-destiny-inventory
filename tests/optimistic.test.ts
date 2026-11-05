import { describe, expect, it } from 'vitest'
import { applyMove, confirmMove, settleMove } from '../src/client/apply-move'
import type { ItemRow } from '../src/host/types'

const row = (over: Partial<ItemRow> = {}): ItemRow =>
  ({
    id: 'i1',
    instanceId: 'i1',
    name: '英勇利刃',
    kind: 'weapon',
    rarity: 'legendary',
    locationKey: 'hunter',
    location: 'hunter',
    characterId: 'char-hunter',
    equipped: 'equipped',
    placement: { kind: 'equipped', characterId: 'char-hunter', slotHash: 1 },
    ...over,
  }) as ItemRow

describe('optimistic move', () => {
  it('moves before the write lands and marks the row pending', () => {
    const [moved] = applyMove([row()], 'i1', 'vault')
    expect(moved?.locationKey).toBe('vault')
    expect(moved?.pending).toBe('applying')
    // a moved item is no longer worn on the character it left
    expect(moved?.equipped).toBe('not_equipped')
  })

  it('clears the hint once the write succeeds', () => {
    const [settled] = settleMove(applyMove([row()], 'i1', 'vault'), 'i1', undefined)
    expect(settled?.pending).toBeUndefined()
    expect(settled?.locationKey).toBe('vault')
  })

  it('marks unknown rather than rolling back when the write fails', () => {
    const [unknown] = settleMove(applyMove([row()], 'i1', 'vault'), 'i1', 'unconfirmed')
    // still where the optimistic move put it: rolling back could be wrong
    expect(unknown?.locationKey).toBe('vault')
    expect(unknown?.pending).toBe('unconfirmed')
  })

  it('takes whatever the read-back reports, even if it disagrees', () => {
    const [confirmed] = confirmMove(applyMove([row()], 'i1', 'vault'), 'i1', 'hunter', true)
    expect(confirmed?.locationKey).toBe('hunter')
    expect(confirmed?.equipped).toBe('equipped')
    expect(confirmed?.pending).toBeUndefined()
  })

  it('leaves other rows untouched', () => {
    const other = row({ id: 'i2', instanceId: 'i2' })
    const rows = applyMove([row(), other], 'i1', 'vault')
    expect(rows[1]).toBe(other)
  })
})

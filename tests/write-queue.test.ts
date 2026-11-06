/**
 * The write queue exists for one reason: two writes in flight at once let the
 * second one build its request from a position the first had already changed.
 * These tests pin the three behaviours that prevent it.
 */
import { describe, expect, it } from 'vitest'
import { WriteQueue } from '../src/client/write-queue'

/** A promise that settles after `ms`, so overlap is observable. */
function delay(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('write queue', () => {
  it('runs one write at a time', async () => {
    const queue = new WriteQueue()
    const log: string[] = []
    const task = (name: string, ms: number) => async (): Promise<string> => {
      log.push(`enter ${name}`)
      await delay(ms)
      log.push(`leave ${name}`)
      return name
    }

    const all = Promise.all([
      queue.enqueue('a', false, task('a', 12)),
      queue.enqueue('b', false, task('b', 1)),
      queue.enqueue('c', false, task('c', 5)),
    ])

    // Injectable violation: run these concurrently and the log interleaves.
    expect(log).toEqual(['enter a'])
    await all
    expect(log).toEqual([
      'enter a',
      'leave a',
      'enter b',
      'leave b',
      'enter c',
      'leave c',
    ])
  })

  it('drops a waiting move for the same item instead of sending both', async () => {
    const queue = new WriteQueue()
    const ran: string[] = []
    const gate = queue.enqueue('gate', false, async () => {
      await delay(10)
      return 'gate'
    })

    const first = queue.enqueue('i1', true, async () => {
      ran.push('first')
      return 'first'
    })
    const second = queue.enqueue('i1', true, async () => {
      ran.push('second')
      return 'second'
    })

    await gate
    expect(await first).toEqual({ kind: 'superseded' })
    expect(await second).toEqual({ kind: 'ran', value: 'second' })
    // The stale destination never reaches Bungie: only the final one does.
    expect(ran).toEqual(['second'])
  })

  it('leaves a different item alone', async () => {
    const queue = new WriteQueue()
    const gate = queue.enqueue('gate', false, async () => {
      await delay(5)
      return 'gate'
    })
    const banking = queue.enqueue('i1', true, async () => 'i1')
    const locking = queue.enqueue('i2', false, async () => 'i2')

    await gate
    expect(await banking).toEqual({ kind: 'ran', value: 'i1' })
    expect(await locking).toEqual({ kind: 'ran', value: 'i2' })
  })

  it('does not supersede a write that is not replaceable', async () => {
    const queue = new WriteQueue()
    const gate = queue.enqueue('gate', false, async () => {
      await delay(5)
      return 'gate'
    })
    const lock = queue.enqueue('i1', false, async () => 'lock')
    const move = queue.enqueue('i1', true, async () => 'move')

    await gate
    expect(await lock).toEqual({ kind: 'ran', value: 'lock' })
    expect(await move).toEqual({ kind: 'ran', value: 'move' })
  })

  it('cancels a write that has not started', async () => {
    const queue = new WriteQueue()
    const gate = queue.enqueue('gate', false, async () => {
      await delay(10)
      return 'gate'
    })
    let ran = false
    const queued = queue.enqueue('i1', true, async () => {
      ran = true
      return 'i1'
    })

    expect(queue.cancel('i1')).toBe(true)
    await gate
    expect(await queued).toEqual({ kind: 'cancelled' })
    expect(ran).toBe(false)
  })

  it('cannot cancel a write already on the wire', async () => {
    const queue = new WriteQueue()
    const running = queue.enqueue('i1', true, async () => {
      await delay(5)
      return 'i1'
    })
    // The caller has to abort this one itself; the queue says so by refusing.
    expect(queue.cancel('i1')).toBe(false)
    expect(await running).toEqual({ kind: 'ran', value: 'i1' })
  })

  it('keeps going after a write fails', async () => {
    const queue = new WriteQueue()
    const failed = queue
      .enqueue('a', false, async () => {
        await delay(1)
        throw new Error('nope')
      })
      .catch((error: unknown) => error)
    const next = queue.enqueue('b', false, async () => 'fine')

    expect(await failed).toBeInstanceOf(Error)
    expect(await next).toEqual({ kind: 'ran', value: 'fine' })
  })

  it('reports depth so the panel can show busy', async () => {
    const queue = new WriteQueue()
    const seen: number[] = []
    queue.watch((depth) => seen.push(depth))

    const done = queue.enqueue('a', false, async () => {
      await delay(5)
      return 'a'
    })
    expect(seen).toEqual([0, 1])
    await done
    expect(seen).toEqual([0, 1, 0])
  })

  it('never runs a task it reports as cancelled or superseded', async () => {
    const queue = new WriteQueue()
    const executed: string[] = []
    const gate = queue.enqueue('gate', false, async () => {
      await delay(10)
      return 'gate'
    })

    const replaced = queue.enqueue('a', true, async () => {
      executed.push('a-old')
      return 'a-old'
    })
    const dropped = queue.enqueue('b', false, async () => {
      executed.push('b')
      return 'b'
    })
    const replacement = queue.enqueue('a', true, async () => {
      executed.push('a-new')
      return 'a-new'
    })
    expect(queue.cancel('b')).toBe(true)

    await gate
    expect(await replaced).toEqual({ kind: 'superseded' })
    expect(await dropped).toEqual({ kind: 'cancelled' })
    expect(await replacement).toEqual({ kind: 'ran', value: 'a-new' })
    // The whole point: those two outcomes mean "Bungie never saw it", and the
    // caller turns that into a definite rejection. If the queue ever ran them,
    // that rejection would be a lie.
    expect(executed).toEqual(['a-new'])
  })
})

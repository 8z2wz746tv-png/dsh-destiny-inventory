/**
 * The route accepts writes from anyone who can reach it — two tabs, a script, a
 * future caller. One turn at a time is the data plane's own promise; these pin it.
 */
import { describe, expect, it } from 'vitest'
import { WriteSerializer } from '../src/host/serialize-writes'

/** A promise that settles after `ms`, so overlap is observable. */
function delay(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('write serializer', () => {
  it('never lets two writes overlap', async () => {
    const serializer = new WriteSerializer()
    const log: string[] = []
    const write = (name: string, ms: number) => async (): Promise<string> => {
      log.push(`enter ${name}`)
      await delay(ms)
      log.push(`leave ${name}`)
      return name
    }

    const results = await Promise.all([
      serializer.run(write('a', 12)),
      serializer.run(write('b', 1)),
      serializer.run(write('c', 5)),
    ])

    // Injectable violation: drop the chain and the log interleaves.
    expect(results).toEqual(['a', 'b', 'c'])
    expect(log).toEqual([
      'enter a',
      'leave a',
      'enter b',
      'leave b',
      'enter c',
      'leave c',
    ])
  })

  it('runs the next write after a failed one', async () => {
    const serializer = new WriteSerializer()
    const failed = serializer
      .run(async () => {
        await delay(1)
        throw new Error('nope')
      })
      .catch((error: unknown) => error)
    const next = serializer.run(async () => 'ok')

    expect(await failed).toBeInstanceOf(Error)
    expect(await next).toBe('ok')
  })
})

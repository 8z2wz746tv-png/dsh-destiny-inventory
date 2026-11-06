/**
 * What the panel is showing, and what has been done through it.
 *
 * The panel exists to give the agent something to look at; this is the "something".
 * Two parts, both per-process and both only about this session:
 *
 * - `ViewContext` — where the user is looking right now.
 * - `Journal` — a 200-entry ring of writes, appended to disk so a session can be
 *   reconstructed after the fact when Bungie's 3-10 second sync window makes
 *   "did that actually happen" hard to answer.
 *
 * Neither is account data: if the process dies, the account is untouched and the
 * next snapshot is the truth. The journal file is for diagnosis, not replay.
 */
import { readFileSync } from 'node:fs'
import { appendFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** Where the user is looking. */
export interface ViewContext {
  /**
   * Which character the user is looking at: `hunter` / `warlock` / `titan`, or
   * `all` when the panel is wide enough to show every store at once. Reporting a
   * fixed class key there told the agent "you are looking at the hunter" while the
   * user was reading all four columns side by side.
   */
  character: string
  filters: { search: string; category: string; lock: string; sort: string }
  /** The item under the pointer's last click, or null. */
  selected: { instanceId: string; hash: number; name: string; location: string } | null
  /** Where the last drag was aimed, including while it is still in flight. */
  lastDropTarget: string | null
}

/** One write, as the agent should see it. */
export interface JournalEntry {
  at: number
  action: 'move' | 'equip' | 'lock' | 'pull_postmaster'
  item: { instanceId: string; hash: number; name: string }
  /** Location key before the write; null when it was not known. */
  from: string | null
  /** Location key the write aimed at. */
  to: string | null
  /**
   * `ok` when the bridge accepted it, `failed` when the response said no.
   *
   * There is no `unconfirmed`: a refused write can still have landed, and that is
   * what `resolution` records once the panel asks. (The plan's `rolledback` went
   * away when rollbacks did — nothing is ever put back, it is resolved or unknown.)
   */
  result: 'ok' | 'failed'
  /** `ui` for a drag here, `agent-detected` for a change we noticed on read-back. */
  source: 'ui' | 'agent-detected'
  /** Upstream's own words on failure; empty on success. */
  detail: string
  /**
   * Set when a read-back later decided what a failed write really did.
   *
   * A failed response is not a failed write: Bungie syncs seconds behind, so the
   * panel asks again and takes the answer. Without this the entry keeps saying
   * `failed` for a move that landed, and "why did that fail" gets answered with a
   * reason that never happened.
   */
  resolution?: Resolution
}

/** What a read-back decided about a write the bridge had reported as failed. */
export interface Resolution {
  at: number
  /** True when the item really ended up where the write aimed. */
  landed: boolean
  /** Where Bungie says it is; null when the item is gone. */
  location: string | null
}

/** How many entries are kept; the plan's number. */
const RING_SIZE = 200

/** Default view before the browser reports anything. */
const EMPTY_VIEW: ViewContext = {
  character: 'hunter',
  filters: { search: '', category: 'all', lock: 'all', sort: 'power-desc' },
  selected: null,
  lastDropTarget: null,
}

/**
 * The panel's context, in memory with a disk trail.
 *
 * In memory is the source of truth; the file is an append-only echo used for
 * after-the-fact diagnosis.
 */
export class ContextStore {
  private view: ViewContext = EMPTY_VIEW
  private readonly entries: JournalEntry[] = []
  /** instanceId → location key, from the last read; the baseline for spotting changes. */
  private lastLocations = new Map<string, string>()
  private readonly journalPath: string
  private readonly now: () => number
  /** Lines are written in the order they were queued; concurrent appends do not promise that. */
  private tail: Promise<void> = Promise.resolve()

  /**
   * @param journalPath - where to append the trail; defaults to
   *   `~/.dsh/destiny-workspace/journal.jsonl`.
   */
  constructor(
    journalPath = join(homedir(), '.dsh', 'destiny-workspace', 'journal.jsonl'),
    now: () => number = Date.now,
  ) {
    this.journalPath = journalPath
    this.now = now
    this.restore()
  }

  /**
   * Take the trail back off disk.
   *
   * Without this the journal is per-process, and "why did that fail" has no answer
   * after the host restarts — which it does every time the host half changes. The
   * file is the reason it exists at all; keeping it write-only defeated that.
   *
   * Later lines win: a correction carries the same `at` as the entry it corrects.
   */
  private restore(): void {
    let text: string
    try {
      text = readFileSync(this.journalPath, 'utf8')
    } catch {
      // No trail yet: a first run, or someone deleted it.
      return
    }
    const byAt = new Map<number, JournalEntry>()
    // Only the tail can be in the ring; reading a year of history is not the job.
    for (const line of text.split('\n').slice(-RING_SIZE * 3)) {
      if (line.trim() === '') continue
      try {
        const entry = JSON.parse(line) as JournalEntry
        byAt.set(entry.at, entry)
      } catch {
        // One mangled line must not take the whole trail with it.
      }
    }
    this.entries.push(...[...byAt.values()].sort((a, b) => b.at - a.at).slice(0, RING_SIZE))
  }

  /** Replace the view; the browser sends the whole thing, not a diff. */
  setView(view: ViewContext): void {
    this.view = view
  }

  /** The current view. */
  readView(): ViewContext {
    return this.view
  }

  /** Where everything was on the previous read. */
  locations(): Map<string, string> {
    return this.lastLocations
  }

  /** Remember this read's locations as the next baseline. */
  setLocations(rows: { instanceId: string; locationKey: string }[]): void {
    this.lastLocations = new Map(
      rows.filter((row) => row.instanceId !== '' && row.instanceId !== '0').map((row) => [row.instanceId, row.locationKey]),
    )
  }

  /** Record one write and echo it to disk. */
  record(entry: JournalEntry): void {
    this.entries.unshift(entry)
    if (this.entries.length > RING_SIZE) this.entries.length = RING_SIZE
    // Fire and forget: a diagnostic trail must never block or fail a write.
    this.emit(entry)
  }

  /**
   * Attach a read-back result to the failed write it corrects.
   *
   * Only the newest unresolved failure for that instance is touched: an older one
   * belongs to a write the user already moved past.
   * @param instanceId - the item the read-back was about.
   * @param landed - whether it really ended up at the destination.
   * @param location - where Bungie says it is; null when gone.
   * @returns the corrected entry, or null when there is nothing to correct.
   */
  resolve(instanceId: string, landed: boolean, location: string | null): JournalEntry | null {
    const entry = this.entries.find(
      (candidate) =>
        candidate.item.instanceId === instanceId &&
        candidate.result === 'failed' &&
        candidate.resolution === undefined,
    )
    if (entry === undefined) return null
    entry.resolution = { at: this.now(), landed, location }
    // The trail is append-only: a correction is a second line, never an edit. Read
    // the file by taking the last line for a given `at`.
    this.emit(entry)
    return entry
  }

  /** The most recent entries, newest first. */
  recent(limit = 20): JournalEntry[] {
    return this.entries.slice(0, Math.max(0, Math.min(limit, RING_SIZE)))
  }

  /** Everything held, newest first. */
  all(): JournalEntry[] {
    return [...this.entries]
  }

  /**
   * Echo one entry to disk, serialized right now.
   *
   * Not inside the async body: the entry object is mutated later (`resolve` stamps
   * it), so a write that serialized after awaiting would record a shape that did
   * not exist when the line was queued — and the original `failed` line would come
   * out already carrying its own correction.
   */
  private emit(entry: JournalEntry): void {
    const line = `${JSON.stringify(entry)}\n`
    this.tail = this.tail.then(() => this.append(line))
  }

  private async append(line: string): Promise<void> {
    try {
      await mkdir(dirname(this.journalPath), { recursive: true })
      await appendFile(this.journalPath, line, 'utf8')
    } catch {
      // A missing trail is not a failure of the write it was recording.
    }
  }
}

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
import { appendFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** Where the user is looking. */
export interface ViewContext {
  /** `hunter` / `warlock` / `titan`. */
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
   * `unconfirmed` replaces the plan's original `rolledback`: writes are optimistic
   * with a read-back, so nothing is ever rolled back — it is resolved or it stays
   * unknown.
   */
  result: 'ok' | 'failed' | 'unconfirmed'
  /** `ui` for a drag here, `agent-detected` for a change we noticed on read-back. */
  source: 'ui' | 'agent-detected'
  /** Upstream's own words on failure; empty on success. */
  detail: string
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
  private readonly journalPath: string

  /**
   * @param journalPath - where to append the trail; defaults to
   *   `~/.dsh/destiny-workspace/journal.jsonl`.
   */
  constructor(journalPath = join(homedir(), '.dsh', 'destiny-workspace', 'journal.jsonl')) {
    this.journalPath = journalPath
  }

  /** Replace the view; the browser sends the whole thing, not a diff. */
  setView(view: ViewContext): void {
    this.view = view
  }

  /** The current view. */
  readView(): ViewContext {
    return this.view
  }

  /** Record one write and echo it to disk. */
  record(entry: JournalEntry): void {
    this.entries.unshift(entry)
    if (this.entries.length > RING_SIZE) this.entries.length = RING_SIZE
    // Fire and forget: a diagnostic trail must never block or fail a write.
    void this.append(entry)
  }

  /** The most recent entries, newest first. */
  recent(limit = 20): JournalEntry[] {
    return this.entries.slice(0, Math.max(0, Math.min(limit, RING_SIZE)))
  }

  /** Everything held, newest first. */
  all(): JournalEntry[] {
    return [...this.entries]
  }

  private async append(entry: JournalEntry): Promise<void> {
    try {
      await mkdir(dirname(this.journalPath), { recursive: true })
      await appendFile(this.journalPath, `${JSON.stringify(entry)}\n`, 'utf8')
    } catch {
      // A missing trail is not a failure of the write it was recording.
    }
  }
}

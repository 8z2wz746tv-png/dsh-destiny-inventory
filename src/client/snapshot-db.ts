/**
 * The last inventory this browser saw, so a panel can open with content.
 *
 * Measured: Bungie's `GetProfile` takes 3.7–14.7 seconds, while the host answers in
 * 0.04 s from its own cache. DIM's advantage is not a faster upstream — it paints a
 * persisted copy and replaces it when the real answer lands. This is that copy.
 *
 * Three rules make it safe to keep around:
 *
 * 1. **It is keyed by account.** A single fixed key would briefly show one account's
 *    vault to another after a switch.
 * 2. **It is display-only.** A cached snapshot may be minutes old; letting it reach
 *    `reconcile` would let stale data confirm or deny a drag the user just made.
 *    That separation lives in `load-inventory.ts`, not here — this module only stores.
 * 3. **Every failure degrades to "no cache".** No IndexedDB, a cleared store, an
 *    older schema, a corrupt record: the panel behaves exactly as it does today.
 */
import type { InventorySnapshot } from '../host/types'

/** Which Destiny account a cache belongs to. */
export interface AccountKey {
  /** Platform type: 1 Xbox, 2 PSN, 3 Steam, 6 Epic. */
  membershipType: number
  /** Platform membership id — not the Bungie.net id. */
  membershipId: string
}

/** Bump when `ItemRow` changes shape; older records are then ignored, not migrated. */
const SCHEMA = 1
const DB_NAME = 'dsh-destiny-cache'
const STORE = 'snapshots'

/** One stored snapshot and the account it belongs to. */
interface Cached {
  schema: number
  account: AccountKey
  snapshot: InventorySnapshot
}

/**
 * The storage key for one account.
 * @param account - platform type and membership id.
 */
export function cacheKey(account: AccountKey): string {
  return `${account.membershipType}:${account.membershipId}`
}

/**
 * Does this look like a stored snapshot we can paint?
 *
 * Deliberately strict about the fields the panel reads before trusting a record:
 * a half-written or older-shaped record must not reach the screen.
 * @param value - whatever came out of the store.
 * @param account - the account it claims to belong to.
 */
export function isUsable(value: unknown, account: AccountKey): value is Cached {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Partial<Cached>
  if (record.schema !== SCHEMA) return false
  if (record.account?.membershipId !== account.membershipId) return false
  if (record.account?.membershipType !== account.membershipType) return false
  const snapshot = record.snapshot
  if (typeof snapshot !== 'object' || snapshot === null) return false
  if (!Number.isFinite(snapshot.fetchedAt)) return false
  if (!Array.isArray(snapshot.items)) return false
  return typeof snapshot.total === 'number'
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, 1)
    } catch {
      resolve(null)
      return
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
}

/**
 * The last snapshot for one account, or `null` for any reason at all.
 * @param account - whose cache to read.
 */
export async function readSnapshot(account: AccountKey): Promise<InventorySnapshot | null> {
  const db = await openDb()
  if (db === null) return null
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(cacheKey(account))
      request.onsuccess = () => {
        const stored: unknown = request.result
        resolve(isUsable(stored, account) ? stored.snapshot : null)
      }
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/**
 * Keep one snapshot. Never throws and never leaves a rejection unhandled — a cache
 * is not worth an error, and a failed write must not clobber a good previous copy.
 * @param account - whose cache to write.
 * @param snapshot - what the host just returned.
 */
export function writeSnapshot(account: AccountKey, snapshot: InventorySnapshot): void {
  void openDb()
    .then((db) => {
      if (db === null) return
      try {
        const record: Cached = { schema: SCHEMA, account, snapshot }
        db.transaction(STORE, 'readwrite').objectStore(STORE).put(record, cacheKey(account))
      } catch {
        // Full disk, private mode, closed connection: none of it matters here.
      }
    })
    .catch(() => {
      // Opening itself failed; the next read will simply find nothing.
    })
}

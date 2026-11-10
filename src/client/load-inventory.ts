/**
 * Load the inventory: whose account, then the cache, then Bungie.
 *
 * Measured: `GetProfile` takes 3.7–14.7 seconds while `/account` takes 0.66–1.01.
 * The point is to paint something after the cheap question, which is DIM's trick —
 * not a faster network, just a screen that is not empty while it waits.
 *
 * Two boundaries do the real work: **a cached snapshot may be painted but never
 * verified** (only the network answer reaches `reconcile`), and **account and load
 * both have to match** (a switch between the two requests, or a slow earlier load
 * landing last, must not put one account's rows on another's screen).
 */
import { fetchAccount, fetchCharacters, fetchInventory } from './api'
import { applyOverlay, compareSnapshot } from './pending-ops-render'
import { restoreIntents } from './restore-intents'
import { readSnapshot, writeSnapshot } from './snapshot-db'
import type { PendingOps } from './pending-ops'
import type { AccountIdentity, InventorySnapshot, ItemRow, PlayerProfileView } from '../host/types'

/** Which load is allowed to touch the screen. Increments on every call. */
let loadSeq = 0

/** 缓存那趟没有角色信息，头顶的名字与凯旋分空着。 */
const NO_PROFILE: PlayerProfileView = {
  displayName: '',
  membershipId: '',
  triumphScore: null,
  characters: [],
}

/** What the panel does with a load. */
export interface LoadDeps {
  routePath: string
  pending: PendingOps
  /** A snapshot to paint. The cached paint gets `NO_PROFILE`. */
  /** @param observed - **未叠 overlay** 的原始行；报事实只能用这份，不能用 `items`。 */
  onSnapshot: (
    snapshot: InventorySnapshot,
    observed: ItemRow[],
    profile: PlayerProfileView,
  ) => void
  onError: (message: string) => void
}

/** Same account, by platform type and id. */
function sameAccount(a: AccountIdentity, b: AccountIdentity): boolean {
  return a.membershipType === b.membershipType && a.membershipId === b.membershipId
}

/**
 * Load once, painting up to twice.
 * @param deps - bridge path, overlay, sinks.
 * @param signal - caller-owned cancellation.
 * @param refresh - true when the user asked for Bungie's current answer.
 * @param attempt - internal: how many times this load has retried itself.
 */
export async function loadInventory(
  deps: LoadDeps,
  signal: AbortSignal,
  refresh: boolean,
  attempt = 0,
): Promise<void> {
  const startedAt = performance.now()
  const loadId = (loadSeq += 1)
  // A newer load owns the screen now; this one may still finish, but not paint.
  const stale = (): boolean => signal.aborted || loadId !== loadSeq
  const issuedAt = Date.now()

  try {
    const account = await fetchAccount(deps.routePath, signal)
    if (stale()) return

    let cached: InventorySnapshot | null = null
    if (!refresh) {
      cached = await readSnapshot(account)
      if (cached !== null && !stale()) {
        deps.onSnapshot({ ...cached, items: applyOverlay(cached.items, deps.pending.all()) }, cached.items, NO_PROFILE)
        console.info(`[destiny] 缓存上屏 ${Math.round(performance.now() - startedAt)}ms`)
      }
    }
    if (!refresh && !stale() && (await restoreIntents(deps.routePath, deps.pending, signal)) > 0) {
      if (cached !== null && !stale()) {
        deps.onSnapshot({ ...cached, items: applyOverlay(cached.items, deps.pending.all()) }, cached.items, NO_PROFILE)
      }
    }

    // `allSettled`, not `all`: the character list is decoration next to the items,
    // and a 502 on it must not cost the user a whole refresh. Seen live — the host
    // was still starting, `/characters` answered 502, and the whole load failed with
    // fresh rows already on the wire.
    const [inventoryResult, charactersResult] = await Promise.allSettled([
      fetchInventory(deps.routePath, signal, refresh),
      fetchCharacters(deps.routePath, signal),
    ])
    if (inventoryResult.status === 'rejected') throw inventoryResult.reason
    const fresh = inventoryResult.value
    const profile = charactersResult.status === 'fulfilled' ? charactersResult.value : NO_PROFILE
    if (stale()) return
    if (!sameAccount(fresh.account, account)) {
      deps.onError('账号在请求期间发生了切换，请重新加载')
      return
    }

    // 只有这里，一次读才成为关于 pending 的证据。
    deps.pending.reconcile(
      compareSnapshot(fresh.items, deps.pending.all(), issuedAt),
      Date.now(),
    )
    const items = applyOverlay(fresh.items, deps.pending.all())
    deps.onSnapshot({ ...fresh, items }, fresh.items, profile)
    console.info(
      `[destiny] 最新数据 ${Math.round(performance.now() - startedAt)}ms（${fresh.items.length} 件）`,
    )
    writeSnapshot(account, fresh)
  } catch (error) {
    if (stale()) return
    // A page opened while the host is still starting gets one silent retry instead
    // of an error the user has to clear by hand.
    if (attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1_500))
      if (!signal.aborted) return loadInventory(deps, signal, refresh, 1)
    }
    deps.onError(error instanceof Error ? error.message : String(error))
  }
}

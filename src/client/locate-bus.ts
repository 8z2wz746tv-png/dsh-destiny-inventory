/**
 * 浮窗 → 库存面板的内部定位命令。
 *
 * 这不是 Bungie/DIM 的外部命令，也不进 host：浮窗和面板在两个独立的 slot 里，
 * 读不到对方的 state，所以用一条**只在本页生效**的命令总线。
 *
 * 面板注册 handler，浮窗只调用 `locateItem(instanceId)`。handler 必须在当前快照里
 * 按 **instanceId** 精确查找；不能按 hash 或名字找，否则会定位到同款的另一件。
 */

export type LocateFailure = 'not-mounted' | 'not-in-snapshot'

export type LocateResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: LocateFailure }

type LocateHandler = (instanceId: string) => LocateResult

let handler: LocateHandler | null = null

/**
 * 注册/注销面板 handler。返回的清理函数只在当前 handler 仍是这一个时才注销，
 * 避免旧面板卸载时把新面板的 handler 清掉。
 */
export function registerLocateHandler(next: LocateHandler | null): () => void {
  handler = next
  return () => {
    if (handler === next) handler = null
  }
}

/** 面板没打开时返回 `not-mounted`；面板在，但快照里没有这个实例时返回 `not-in-snapshot`。 */
export function locateItem(instanceId: string): LocateResult {
  if (handler === null) return { ok: false, reason: 'not-mounted' }
  return handler(instanceId)
}

/**
 * 在快照行里按 instanceId 精确查找。
 *
 * **只看 instanceId**：同 hash 的另一件副本不是同一件装备；这里绝不能退化成
 * 按 hash/名字匹配。
 */
export function findInstance<T extends { instanceId: string }>(
  items: readonly T[],
  instanceId: string,
): T | null {
  if (instanceId === '') return null
  return items.find((item) => item.instanceId === instanceId) ?? null
}

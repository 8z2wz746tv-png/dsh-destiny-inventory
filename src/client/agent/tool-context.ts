/**
 * 工具调用与当时上下文的绑定。
 *
 * 候选查询的结果属于**发起调用时**选中的武器，而不是结果返回时的实时选择。
 * 这里只在工具调用第一次以 `pending` 气泡出现时记一次；如果第一次看到就已经完成，
 * 说明没有可靠的调用时上下文，返回 null，由调用方拒绝出卡。
 */
import type { ViewContextLike } from './context-prompt'
import type { Bubble } from './message-view'
import { contextIsStale } from './tool-card'
import { isAlternativesQuery } from './weapon-alternatives-model'

export interface ToolContextSnapshot {
  readonly instanceId?: string
  readonly hash?: number
  readonly name?: string
  readonly kind?: 'weapon' | 'armor' | 'other'
  readonly observedAt?: number
  /** 捕获时的快照是否已过期；过期后不再重新判断。 */
  readonly stale: boolean
}

/** 把当前视图压成一份不可变的调用时快照。 */
export function snapshotContext(view: ViewContextLike | null): ToolContextSnapshot {
  const selected = view?.selected ?? null
  return {
    ...(selected?.instanceId === undefined ? {} : { instanceId: selected.instanceId }),
    ...(selected?.hash === undefined ? {} : { hash: selected.hash }),
    ...(selected?.name === undefined ? {} : { name: selected.name }),
    ...(selected?.kind === undefined ? {} : { kind: selected.kind }),
    ...(selected?.observedAt === undefined ? {} : { observedAt: selected.observedAt }),
    stale: contextIsStale(selected?.observedAt),
  }
}

/**
 * 给新出现的候选调用绑定上下文。
 *
 * - 只处理 `weapon_type` 查询；
 * - 只在 `pending` 时绑定；首次见到已完成则**不绑**（返回的 map 里没有这个 key）；
 * - 绑定键是 `sessionId + bubble.key`，因为 bubble.key 来自会话内 event.seq，不能假设跨会话唯一；
 * - 已有 key 永不改写，所以结果返回后切装备不会改绑。
 */
export function contextKey(scope: string, bubbleKey: string): string {
  return `${scope}\u0000${bubbleKey}`
}

export function bindNewToolContexts(
  bubbles: readonly Bubble[],
  view: ViewContextLike | null,
  bound: ReadonlyMap<string, ToolContextSnapshot>,
  scope: string,
): ReadonlyMap<string, ToolContextSnapshot> {
  const next = new Map(bound)
  let changed = false
  for (const bubble of bubbles) {
    if (bubble.role !== 'tool' || bubble.tool === undefined) continue
    if (bubble.tool.status !== 'pending') continue
    if (!isAlternativesQuery(bubble.tool.args)) continue
    const key = contextKey(scope, bubble.key)
    if (next.has(key)) continue
    next.set(key, snapshotContext(view))
    changed = true
  }
  return changed ? next : bound
}

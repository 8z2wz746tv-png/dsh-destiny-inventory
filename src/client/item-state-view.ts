/**
 * 一件物品的状态，按来源分栏。
 *
 * 这是 **Agent 的事实模型**，不是渲染模型。它从三份独立的来源组装：
 * 未叠 overlay 的观测行、`PendingOps`、以及渲染行上的回滚标记。
 *
 * 它**不经过 `ItemRow` 的位置**——`locationKey` 那个字段是画出来的，
 * 谁拿它当事实，谁就在说一个可能从未被观测到的位置。
 *
 * `effective` 不在这里。它由 `pending > rollback > observed` 算出来，
 * 而算出来的东西一旦进了契约，迟早会被当成答案读。
 */
import type { ItemRow } from '../host/types'
import type { OperationState } from './pending-ops'
import type { PendingOperation } from './pending-ops'

/** 三个栏位，各自独立。没有就是没有，不留空字符串占位。 */
export interface ItemStateView {
  instanceId: string
  name: string
  /** Bungie 单次观测到的位置。不是"当前位置"。 */
  observed: string
  /** 那次观测的时间。缓存读出来的时刻不算，只能说它"不早于"某时。 */
  observedAt: number
  /** 用户要求它去哪、什么时候要求的、核验到哪一步。 */
  pending?: { target: string; submittedAt: number; status: OperationState }
  /** 一次失败的回滚留下的位置。**没有关联标识，所以不说是哪次失败。** */
  rollback?: { location: string }
}

/**
 * 这一格的不确定是回滚造成的吗？
 *
 * 判据依赖两条互相排斥的实现约定：
 * - `applyOverlay` 只给**有操作**的物品写标记；
 * - `confirmMove(..., 'rollback')` 只给**没有操作**的物品写标记。
 *
 * 两者不会同时成立，所以"有标记且无操作"唯一地指向回滚。
 * 这个互斥不是天然成立的，`tests/item-state-view.test.ts` 里的时序用例盯着它。
 * @param row - 渲染行，只读它的 `pending` 标记和位置。
 * @param operation - 这件物品当前的操作，没有就传 `undefined`。
 * @returns 回滚位置；不是回滚就返回 `null`。
 */
export function rollbackOf(row: ItemRow | undefined, operation: PendingOperation | undefined): string | null {
  if (row === undefined) return null
  if (operation !== undefined) return null
  return row.pending === 'unconfirmed' ? row.locationKey : null
}

/**
 * 组装一件物品的三栏视图。
 * @param observed - **未叠 overlay** 的观测行。
 * @param observedAt - 那次观测的时间。
 * @param operation - 这件物品当前的操作。
 * @param rendered - 渲染行，只为读回滚标记。
 * @returns 三栏视图；没有观测行时返回 `null`（看不见的东西不该出现在事实里）。
 */
export function itemStateView(
  observed: ItemRow | undefined,
  observedAt: number,
  operation: PendingOperation | undefined,
  rendered: ItemRow | undefined,
): ItemStateView | null {
  if (observed === undefined) return null
  const rollback = rollbackOf(rendered, operation)
  return {
    instanceId: observed.instanceId,
    name: observed.name,
    observed: observed.locationKey,
    observedAt,
    ...(operation === undefined
      ? {}
      : {
          pending: {
            target: operation.target,
            submittedAt: operation.submittedAt,
            status: operation.state,
          },
        }),
    ...(rollback === null ? {} : { rollback: { location: rollback } }),
  }
}

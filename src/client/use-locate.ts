/**
 * 面板侧的定位接线：命令状态、注册/注销 handler、滚动与高亮。
 *
 * 只清会遮住目标的筛选并切宽布局；**不动**焦点职业、排序或其它 UI 状态，
 * 也不碰 Journal / State Authority。
 */
import { useCallback, useEffect, useState } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { findInstance, registerLocateHandler } from './locate-bus'
import type { LocateResult } from './locate-bus'
import type { InventoryFilters, LayoutMode } from './filter'
import type { ItemRow } from '../host/types'

export interface LocateState {
  readonly instanceId: string
  readonly nonce: number
}

export function useLocate(
  items: readonly ItemRow[],
  setFilters: Dispatch<SetStateAction<InventoryFilters>>,
  setLayout: Dispatch<SetStateAction<LayoutMode>>,
  panelRef: RefObject<HTMLElement | null>,
): {
  locate: LocateState | null
  patch: (next: Partial<InventoryFilters>) => void
} {
  const [locate, setLocate] = useState<LocateState | null>(null)

  const patch = useCallback(
    (next: Partial<InventoryFilters>): void => {
      setFilters((current) => ({ ...current, ...next }))
    },
    [setFilters],
  )

  useEffect(() => {
    return registerLocateHandler((instanceId): LocateResult => {
      // 面板可能只是路由切走、组件还挂着；没有可见的根就当没打开。
      const root = panelRef.current
      if (root === null || !root.isConnected || root.getClientRects().length === 0) {
        return { ok: false, reason: 'not-mounted' }
      }
      const item = findInstance(items, instanceId)
      if (item === null) return { ok: false, reason: 'not-in-snapshot' }
      setLayout('wide')
      patch({ search: '', type: '', category: 'all', lock: 'all' })
      setLocate({ instanceId, nonce: Date.now() })
      return { ok: true }
    })
  }, [items, patch, setLayout, panelRef])

  useEffect(() => {
    if (locate === null) return
    const element = [...document.querySelectorAll<HTMLElement>('[data-instance-id]')].find(
      (candidate) => candidate.dataset.instanceId === locate.instanceId,
    )
    element?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const timer = window.setTimeout(() => setLocate(null), 2500)
    return () => window.clearTimeout(timer)
  }, [locate])

  return { locate, patch }
}

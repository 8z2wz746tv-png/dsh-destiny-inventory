import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { ToastProvider } from './legacy/components/ToastProvider'
import { InventoryPage } from './legacy/features/inventory/InventoryPage'

/**
 * 老 web 的仓库页，原样跑在 DSH 的槽位里。
 *
 * 数据来自 MCP 的 HTTP 侧门（`/api/webui/inventory/*`），也就是老项目的接法：
 * 界面吃为它定制的载荷，agent 吃 MCP 工具，两边共用同一个进程和同一份 Manifest。
 *
 * react-query 的 client 建在模块级：面板每次挂载都新建一个会把缓存扔掉，
 * 而这个页面最贵的一次读就是那份 8 MB 的清单快照。
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
})

/**
 * 槽位里挂的组件。
 * @returns 老仓库页，外面套上它需要的两个 provider。
 */
export function LegacyInventoryPanel(): ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <div className="dsh-destiny-legacy">
          <InventoryPage />
        </div>
      </ToastProvider>
    </QueryClientProvider>
  )
}

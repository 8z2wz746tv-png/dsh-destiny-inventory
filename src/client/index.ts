import type { Context } from '@deepseek-ai/cordis'
import { InventoryPanelIcon } from './InventoryPanelIcon'
import { InventoryPanel } from './InventoryPanel'
import type { ClientSlotSeam } from './slots'
import { ensureStyles } from './styles'
import { DockWindow } from './agent/DockWindow'
import type { SessionDeps } from './agent/session-adapter'
import { ensureDockStyles } from './agent/styles-dock'

/**
 * Browser half of the plugin.
 *
 * Contributes one row into the sidebar shell's global panel list and its page
 * into the layout's keyed `main` slot, so the shell owns the row box, label,
 * active highlight and panel switching exactly as it does for the shipped
 * pages. Both registrations go through `ctx.slots.inject`, which fires only
 * once the owning shell entry declared the seat: load order against
 * ui-layout / ui-sidebar does not matter, and a shell without those seats
 * leaves the panel absent instead of failing boot.
 */

/** Panel id, shared by the sidebar row and the main-slot page. */
const PANEL_ID = 'dsh-destiny-inventory'

/** Row order among the shell's global panel rows (Plugins is 0, Schedule 10). */
const PANEL_ORDER = 30

/** Route base pathname the host half mounts; kept in sync by configuration. */
const DEFAULT_ROUTE_PATH = '/dsh-destiny-inventory'

// Static array: cordis rejects a function form, and a missing entry fails at
// activation with "cannot get property ... without inject" (guide §7.3).
export const inject = ['slots', 'sessions']

/**
 * Register the sidebar row and the page.
 * @param ctx - client root context (services: slots).
 */
export function apply(ctx: Context): void {
  const slots = (ctx as unknown as { slots: ClientSlotSeam }).slots
  const routePath = DEFAULT_ROUTE_PATH
  const disposers: (() => void)[] = []
  disposers.push(ensureStyles())
  disposers.push(ensureDockStyles())
  disposers.push(
    slots.inject('sidebar.panellist', () =>
      slots.register(
        {
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: PANEL_ORDER,
          label: () => '命运仓库',
        },
        InventoryPanelIcon,
      ),
    ),
  )
  disposers.push(
    slots.inject('main', () =>
      slots.register(
        {
          name: 'main',
          key: PANEL_ID,
          inject: () => ({ routePath }),
        },
        InventoryPanel,
      ),
    ),
  )
  disposers.push(
    // 悬浮窗：order 1100 越过 dsh-plugin-session-panes 的 1000，避免被它压住。
    slots.inject('shell.overlay', () =>
      slots.register(
        {
          name: 'shell.overlay',
          id: 'destiny-dock',
          order: 1100,
          inject: () => ({ sessions: (ctx as unknown as { sessions: SessionDeps }).sessions }),
        },
        DockWindow,
      ),
    ),
  )
  ctx.effect(() => () => {
    for (const dispose of disposers.splice(0)) dispose()
  }, 'dsh-destiny-inventory: client lifecycle')
}

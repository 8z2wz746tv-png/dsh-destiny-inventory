/**
 * 把面板当前视图拼成一段能放进 prompt 的文字。
 *
 * **数据来自 host 的 `/context`**，那是面板自己通过 `useViewReport` 上报的：
 * 焦点职业、筛选、选中物品（含它在哪、有没有未核验的操作）。浮窗不自己猜——
 * 它和面板不在同一棵组件树里，读不到对方的 state。
 *
 * 拼的是**事实**，不是判断：说"在看什么"，不说"这件好不好"。
 */

/** `/context` 回来的形状；字段缺失就当作没上报。 */
export interface ViewContextLike {
  character?: string
  filters?: { search?: string; category?: string; lock?: string; sort?: string }
  selected?: {
    /** 实例 id；已由 host 上报，卡片用它标出“你选中的副本”。 */
    instanceId?: string
    /** 领域类型；本轮只加这一个字段，旧上下文没有它也照常工作。 */
    kind?: 'weapon' | 'armor' | 'other'
    name?: string
    observed?: string
    pending?: { target?: string; status?: string }
    rollback?: { location?: string }
  } | null
  lastDropTarget?: string | null
}

/** 位置的中文说法，认不出就原样给。 */
const PLACE: Record<string, string> = {
  hunter: '猎人',
  warlock: '术士',
  titan: '泰坦',
  vault: '仓库',
  postmaster: '邮政官',
}

const place = (key: string | undefined): string =>
  key === undefined || key === '' ? '' : (PLACE[key] ?? key)

const CLASS: Record<string, string> = { hunter: '猎人', warlock: '术士', titan: '泰坦', all: '全部角色' }

/**
 * @param view - `/context` 的响应；`null` 表示没拿到。
 * @returns 一段给模型看的说明；没有任何信息时返回空串。
 */
export function contextPrompt(view: ViewContextLike | null): string {
  if (view === null) return ''
  const lines: string[] = []

  const character = CLASS[view.character ?? ''] ?? view.character ?? ''
  if (character !== '') lines.push(`焦点：${character}`)

  const selected = view.selected ?? null
  if (selected !== null && (selected.name ?? '') !== '') {
    const where = place(selected.observed)
    let line = `正在看：「${selected.name ?? ''}」`
    if (where !== '') line += `（在${where}）`
    // 未核验 / 回滚是**事实**，不是推测——协议 §四 要求说出来。
    if (selected.pending !== undefined) {
      line += `；有一笔未核验的操作正发往${place(selected.pending.target) || '未知位置'}`
    }
    if (selected.rollback !== undefined) {
      line += `；界面上它显示在${place(selected.rollback.location) || '未知位置'}（回滚后的位置，未确认）`
    }
    lines.push(line)
  }

  const drop = place(view.lastDropTarget ?? undefined)
  if (drop !== '') lines.push(`最后拖向：${drop}`)

  const search = view.filters?.search ?? ''
  if (search !== '') lines.push(`搜索框：${search}`)

  if (lines.length === 0) return ''
  // 说明来源，免得模型把这些当成用户刚说的话。
  return ['[面板上下文 · 玩家此刻在库存界面上的状态]', ...lines].join('\n')
}

/** 拼进最终发给会话的那段文本。 */
export function withContext(context: ViewContextLike | null, message: string): string {
  const block = contextPrompt(context)
  return block === '' ? message : `${block}\n\n${message}`
}

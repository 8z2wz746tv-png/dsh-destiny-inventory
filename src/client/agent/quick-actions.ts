/**
 * 按当前上下文生成快捷任务。
 *
 * 按钮不是什么都要一个：**没选中东西时给"逛仓库"的问题，选中了才给"分析这件"**。
 * 点了等于替玩家打一句话，所以文案要像人话，不像菜单项。
 */
import type { ViewContextLike } from './context-prompt'

/** 一个按钮。 */
export interface QuickAction {
  readonly id: string
  readonly label: string
  /** 点下去实际发出去的话。 */
  readonly prompt: string
}

/**
 * @param view - `/context` 的视图；`null` 表示还没拿到。
 * @returns 最多四个按钮，按相关度排。
 */
export function quickActions(view: ViewContextLike | null): QuickAction[] {
  const selected = view?.selected ?? null
  const name = selected?.name ?? ''
  if (name === '') {
    return [
      { id: 'weekly', label: '本周有什么', prompt: '本周的轮换、夜幕和商人有什么值得拿的？' },
      { id: 'vault', label: '仓库里能清什么', prompt: '看看我的仓库，哪些可以拆或可以留着用？' },
      { id: 'loadout', label: '术士配装', prompt: '我这套术士现在什么状态？有什么能改的？' },
    ]
  }

  // 本版只做武器分析：选中武器才给入口；平替/配装按钮这一轮不出现。
  if (selected?.kind === 'weapon') {
    return [
      {
        id: 'analyze',
        label: '分析武器',
        prompt: `用 weapon_assistant（intent="analyze", weapon_name="${name}", include_inventory=true）分析这把武器。如果 analyze 结果无法完整解析（例如被宿主截断、出现 Omitted、JSON 不完整或格式异常），再调用 weapon_assistant（intent="filter_rolls", weapon_name="${name}", include_inventory=true）取当前持有副本；按真实结果展示，不要用 bash 猜，也不要补 stats/定义池/愿单。`,
      },
    ]
  }

  // 选中的不是武器：不给武器分析入口，保留两条不依赖选中物的浏览问题。
  return [
    { id: 'weekly', label: '本周有什么', prompt: '本周的轮换、夜幕和商人有什么值得拿的？' },
    { id: 'vault', label: '仓库里能清什么', prompt: '看看我的仓库，哪些可以拆或可以留着用？' },
  ]
}

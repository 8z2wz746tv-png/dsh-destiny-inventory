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
  const name = view?.selected?.name ?? ''
  if (name === '') {
    return [
      { id: 'weekly', label: '本周有什么', prompt: '本周的轮换、夜幕和商人有什么值得拿的？' },
      { id: 'vault', label: '仓库里能清什么', prompt: '看看我的仓库，哪些可以拆或可以留着用？' },
      { id: 'loadout', label: '术士配装', prompt: '我这套术士现在什么状态？有什么能改的？' },
    ]
  }
  // 只知道名字，不知道类型——让模型自己判断，别在按钮上猜错。
  return [
    { id: 'analyze', label: '分析这件', prompt: `帮我看看「${name}」怎么样，值不值得留。` },
    { id: 'build', label: '适合什么配装', prompt: `「${name}」适合什么配装？` },
    { id: 'swap', label: '找平替', prompt: `「${name}」有没有同类里更好的？` },
    { id: 'vault', label: '仓库里能清什么', prompt: '看看我的仓库，哪些可以拆或可以留着用？' },
  ]
}

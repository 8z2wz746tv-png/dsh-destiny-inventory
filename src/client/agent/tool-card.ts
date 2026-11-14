/**
 * 工具结果是否该走卡片、是否是可读的 ok:false。
 *
 * 从 DockChat 抽出来，只为了能对 compare/info/缺省 intent/非法 JSON 做边界测试；
 * 不改变任何渲染行为。
 */

/** 缺省 intent 按 analyze 处理；只有 analyze/filter_rolls 是卡片关心的调用。 */
export function cardIntentOf(args: string): boolean {
  try {
    const value = JSON.parse(args) as { intent?: unknown }
    const intent = typeof value.intent === 'string' ? value.intent : 'analyze'
    return intent === 'analyze' || intent === 'filter_rolls'
  } catch {
    return false
  }
}

/** 工具明确返回 ok:false 是可读的错误，不是“解析失败”；原始结果里已经写清原因。 */
export function toolRefusalOf(result: string): boolean {
  try {
    return (JSON.parse(result) as { ok?: unknown }).ok === false
  } catch {
    return false
  }
}

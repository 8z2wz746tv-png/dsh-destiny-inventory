/**
 * 发送结果的解释。
 *
 * `session.prompt` 返回的是 `RemoteResult`：**失败不抛，靠 `ok: false` 表达**。
 * 第一次探针就是在这里栽的——调用方 `await` 完就把结果丢了，界面上什么都没发生，
 * 而 `gateway/input-invalid` 已经躺在返回值里。
 *
 * 抽成纯函数是为了让"必须看返回值"这条规则能被测试咬住，而不是靠约定。
 */

/** 一次发送的判定。`reason` 只在失败时有值。 */
export interface SendOutcome {
  readonly ok: boolean
  readonly reason: string | null
}

/**
 * @param result - `prompt` 的返回值；形状不可信，按未知处理。
 * @returns 成功或一条能显示给用户的原因。
 */
export function sendOutcome(result: unknown): SendOutcome {
  if (typeof result !== 'object' || result === null) {
    // 没有返回值也算没确认：宁可报一次"未确认"，也不要假装成功。
    return { ok: false, reason: '发送未确认' }
  }
  const r = result as { ok?: unknown; error?: { code?: unknown; message?: unknown } }
  if (r.ok === true) return { ok: true, reason: null }
  const code = typeof r.error?.code === 'string' ? r.error.code : ''
  const message = typeof r.error?.message === 'string' ? r.error.message : ''
  const detail = code !== '' ? code : message
  return { ok: false, reason: detail === '' ? '发送被拒（没有给出原因）' : `发送被拒：${detail}` }
}

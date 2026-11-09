/**
 * 哪些操作已经有结论了。
 *
 * 结束的操作会从 `PendingOps` 里移除，于是"还没恢复"和"恢复过、已经有答案"在
 * 内存里长得一模一样。跨刷新恢复必须能区分这两者，否则一条已经 `verified` 的操作
 * 会在下次 F5 被重新挂回去，永远不结案。
 *
 * 只留最近一段，超出丢最旧的：这是防重复，不是历史。
 */
const CAPACITY = 200

export class SettledIds {
  private readonly ids = new Set<string>()
  private readonly order: string[] = []

  /** 这条操作是不是已经有结论了。 */
  has(id: string): boolean {
    return this.ids.has(id)
  }

  /** 记下一条已经结束的操作。重复记同一条不会撑大容量。 */
  add(id: string): void {
    if (this.ids.has(id)) return
    this.ids.add(id)
    this.order.push(id)
    if (this.order.length > CAPACITY) {
      const dropped = this.order.shift()
      if (dropped !== undefined) this.ids.delete(dropped)
    }
  }
}

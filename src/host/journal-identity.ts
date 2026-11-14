/**
 * 一次操作的稳定身份。
 *
 * journal 的身份是 `(at, instanceId)`，**不是 `at`**：
 *
 * - `resolve()` 把同一个对象再序列化一次，`at` 不变 —— 那是**同一条操作**的修正行；
 * - 两件**不同**的物品落在同一毫秒却是完全正常的 —— `detect-external` 一趟读取就
 *   可能记下多个变化，它们共享同一个 `at`。
 *
 * 只按 `at` 判身份，会把后者当成前者的旧版本丢掉：真机上就丢过一件甲
 * （`幻梦黎明手套` 与 `凯旋圣歌战靴` 同为 `1794272122011`）。丢掉的那条不在
 * `/journal` 里，于是前端跨刷新恢复看不到它，诊断也少一条。
 *
 * 放在 host 层是因为 `JournalEntry` 住在这里；client 向下引用它（层规则允许，
 * 客户端早已这样引用 `host/types`）。
 */

/** 判定身份所需的最小形状。 */
export interface JournalIdentity {
  at: number
  item: { instanceId: string }
}

/**
 * 同一条操作（原始行与修正行）得到同一个值，不同操作不会撞在一起。
 * @param line - 任意一行 journal，或内存里的条目。
 */
export function journalKey(line: JournalIdentity): string {
  return `${line.at}:${line.item.instanceId}`
}

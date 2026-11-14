/**
 * `weapon_assistant(analyze)` 的工具结果 → 卡片模型。
 *
 * **只读工具结果，不补字段、不猜账号数据。** 解析失败或结构不符合预期时返回
 * `null`，调用方保留原始结果文本；绝不能让一条坏结果把对话 UI 打崩。
 *
 * 字段路径全部来自 2026-11-14 的真实响应（「命运终结者」）：
 * `data.weapon` / `data.stats[]` / `data.sockets[]` / `data.inventory.instances[]`
 * / `data.god_roll` / `warnings[]`。
 */

export type WeaponCardSource = 'analyze' | 'filter_rolls'

export interface WeaponCardStat {
  readonly name: string
  readonly display: string
  readonly value: number | null
}

/** 定义级推荐项：只给可滚栏，不铺完整池子。 */
export interface WeaponCardPerkHint {
  readonly slot: string
  readonly kind: string
  readonly optionCount: number | null
  readonly recommended: readonly string[]
}

/** 一件持有副本；本版的“候选”。 */
export interface WeaponCardCopy {
  readonly instanceId: string
  readonly location: string
  readonly power: number | null
  readonly equipped: boolean
  readonly locked: boolean
  readonly gearTier: number | null | undefined
  readonly godRollScore: string
  /** 当前装着的 perk（栏名 + 名字），来自副本 sockets[].equipped。 */
  readonly perks: readonly { readonly slot: string; readonly name: string }[]
}

/** 愿单/刷取参考；每条都带来源，不混成官方结论。 */
export interface WeaponCardReference {
  readonly label: string
  readonly text: string
  readonly source: string
}

export interface WeaponCardModel {
  /** `analyze` 是武器分析；`filter_rolls` 只是持有副本信息，不能当完整分析。 */
  readonly source: WeaponCardSource
  readonly summary: string
  readonly name: string
  readonly nameEn: string
  readonly weaponType: string
  readonly frame: string
  readonly rarity: string
  readonly damageType: string
  readonly ammoType: string
  readonly rpm: number | null
  readonly iconUrl: string
  readonly description: string
  readonly stats: readonly WeaponCardStat[]
  readonly perkHints: readonly WeaponCardPerkHint[]
  readonly owned: readonly WeaponCardCopy[]
  readonly references: readonly WeaponCardReference[]
  readonly warnings: readonly string[]
  readonly inventoryStatus: string
  /** `data.inventory.weapon.owned.status === 'checked'` 才是真读过账号。 */
  readonly inventoryChecked: boolean
}

type Json = Record<string, unknown>

/** 只接受普通对象；数组、null、函数都不算。 */
function objectOf(value: unknown): Json | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : null
}

function arrayOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function numberOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** 可滚栏；非 roll 栏（模组/大师杰作/着色器…）不铺在卡上。 */
const ROLL_KINDS = new Set(['intrinsic', 'barrel', 'magazine', 'trait'])

/** 工具名是否属于武器分析。按后缀匹配，覆盖 `mcp__destiny__weapon_assistant`。 */
export function isWeaponAssistant(name: string): boolean {
  return name.endsWith('weapon_assistant')
}

/** 卡片里可点的“副本”必须来自 `data.inventory.instances`；不用顶层 candidates。 */
function parseCopy(value: unknown): WeaponCardCopy | null {
  const entry = objectOf(value)
  if (entry === null) return null
  const weapon = objectOf(entry.weapon)
  if (weapon === null) return null
  const instance = objectOf(weapon.instance)
  if (instance === null) return null
  const instanceId = textOf(instance.instance_id).trim()
  if (instanceId === '') return null

  const perks: { slot: string; name: string }[] = []
  for (const rawSocket of arrayOf(entry.sockets)) {
    const socket = objectOf(rawSocket)
    if (socket === null) continue
    const kind = textOf(socket.kind)
    if (!ROLL_KINDS.has(kind)) continue
    const slot = textOf(socket.slot).trim()
    if (slot === '') continue
    const equipped = objectOf(socket.equipped)
    const name = equipped === null ? '' : textOf(equipped.name).trim()
    if (name === '') continue
    perks.push({ slot, name })
  }

  return {
    instanceId,
    location: textOf(instance.location).trim(),
    power: numberOf(instance.power),
    equipped: instance.is_equipped === true,
    locked: instance.locked === true,
    // 真实 analyze 响应把 gear_tier 放在 weapon 顶层；weapon.instance 没有这个字段。
    gearTier: Object.prototype.hasOwnProperty.call(weapon, 'gear_tier')
      ? numberOf(weapon.gear_tier)
      : undefined,
    godRollScore: textOf(instance.god_roll_score).trim(),
    perks,
  }
}

/** 愿单里的一组名字；只取字符串，不猜结构。 */
function namesOf(value: unknown, limit: number): string[] {
  const names: string[] = []
  for (const raw of arrayOf(value)) {
    const entry = objectOf(raw)
    const name = entry === null ? '' : textOf(entry.name).trim()
    if (name !== '') names.push(name)
    if (names.length >= limit) break
  }
  return names
}

/** `filter_rolls` 的当前副本行：analyze 被宿主截断时的真实副本来源。 */
function parseFilterRolls(root: Json, data: Json): WeaponCardModel | null {
  const matched = arrayOf(data.matched)
  const first = objectOf(matched[0])
  if (first === null) return null
  const name = textOf(first.name).trim()
  if (name === '') return null

  const owned: WeaponCardCopy[] = []
  for (const raw of matched) {
    const row = objectOf(raw)
    if (row === null) continue
    const instanceId = textOf(row.instance_id).trim()
    if (instanceId === '') continue
    const perks: { slot: string; name: string }[] = []
    for (const rawPerk of arrayOf(row.perks)) {
      const perk = textOf(rawPerk).trim()
      if (perk !== '') perks.push({ slot: '', name: perk })
    }
    owned.push({
      instanceId,
      location: textOf(row.location).trim(),
      power: numberOf(row.power),
      equipped: row.is_equipped === true,
      locked: row.locked === true,
      gearTier: undefined,
      godRollScore: '',
      perks,
    })
  }
  if (owned.length === 0) return null

  const warnings: string[] = []
  for (const raw of arrayOf(root.warnings)) {
    const warning = textOf(raw).trim()
    if (warning !== '') warnings.push(warning)
  }
  if (data.coverage_complete !== true) warnings.push('副本扫描未完整；不能把没扫到当成“你没有”。')

  return {
    source: 'filter_rolls',
    summary: textOf(root.summary).trim(),
    name,
    nameEn: textOf(first.name_en).trim(),
    weaponType: textOf(first.weapon_type).trim(),
    frame: textOf(first.frame).trim(),
    rarity: textOf(first.rarity).trim(),
    damageType: '',
    ammoType: '',
    rpm: numberOf(first.rpm),
    iconUrl: textOf(first.icon_url).trim(),
    description: '',
    stats: [],
    perkHints: [],
    owned,
    references: [],
    warnings: [...new Set(warnings)],
    inventoryStatus: textOf(data.scope).trim(),
    inventoryChecked: true,
  }
}

/** 解析一次工具结果；失败返回 `null`，由调用方回退到原始文本。 */
export function parseWeaponCard(result: string | null): WeaponCardModel | null {
  if (result === null || result.trim() === '') return null
  let root: Json | null = null
  try {
    root = objectOf(JSON.parse(result.trim()) as unknown)
  } catch {
    return null
  }
  if (root === null || root.ok !== true) return null
  const data = objectOf(root.data)
  if (data === null) return null
  if (data.scope === 'owned_inventory') return parseFilterRolls(root, data)
  const weapon = objectOf(data.weapon)
  if (weapon === null) return null
  const name = textOf(weapon.name).trim()
  if (name === '') return null

  const inventory = objectOf(data.inventory)
  const inventoryWeapon = inventory === null ? null : objectOf(inventory.weapon)
  const ownedInfo = inventoryWeapon === null ? null : objectOf(inventoryWeapon.owned)
  const inventoryChecked = textOf(ownedInfo?.status) === 'checked'
  const owned = inventoryChecked
    ? arrayOf(inventory?.instances)
        .map(parseCopy)
        .filter((copy): copy is WeaponCardCopy => copy !== null)
    : []

  const stats: WeaponCardStat[] = []
  for (const raw of arrayOf(data.stats)) {
    const stat = objectOf(raw)
    if (stat === null) continue
    const statName = textOf(stat.name).trim()
    const display = textOf(stat.display).trim()
    if (statName === '' || display === '') continue
    stats.push({ name: statName, display, value: numberOf(stat.value) })
  }

  const perkHints: WeaponCardPerkHint[] = []
  for (const raw of arrayOf(data.sockets)) {
    const socket = objectOf(raw)
    if (socket === null) continue
    const kind = textOf(socket.kind)
    if (kind !== 'barrel' && kind !== 'magazine' && kind !== 'trait') continue
    const slot = textOf(socket.slot).trim()
    if (slot === '') continue
    const recommended: string[] = []
    for (const rawOption of arrayOf(socket.options)) {
      const option = objectOf(rawOption)
      if (option === null || option.recommended === undefined) continue
      const optionName = textOf(option.name).trim()
      if (optionName !== '' && !recommended.includes(optionName)) recommended.push(optionName)
      if (recommended.length >= 3) break
    }
    perkHints.push({
      slot,
      kind,
      optionCount: numberOf(socket.option_count),
      recommended,
    })
  }

  const references: WeaponCardReference[] = []
  const farming = objectOf(weapon.farming)
  if (farming !== null && farming.available === true) {
    const tier = textOf(farming.tier).trim()
    const scale = textOf(farming.scale).trim()
    const note = textOf(farming.note).trim()
    const listName = textOf(farming.list).trim()
    const source = textOf(farming.source).trim()
    const updated = textOf(objectOf(farming.source_ref)?.updated_at).trim()
    const headline = [tier === '' ? '' : `${tier}${scale}`, note].filter((part) => part !== '').join(' · ')
    if (headline !== '') {
      references.push({
        label: '刷取参考',
        text: headline,
        source: [listName, source, updated].filter((part) => part !== '').join(' · '),
      })
    }
  }

  const godRoll = objectOf(data.god_roll)
  if (godRoll !== null && textOf(godRoll.kind) !== 'none') {
    const pve = namesOf(godRoll.pve, 4)
    const pvp = namesOf(godRoll.pvp, 4)
    const note = textOf(godRoll.note).trim()
    const parts: string[] = []
    if (pve.length > 0) parts.push(`PvE：${pve.join(' / ')}`)
    if (pvp.length > 0) parts.push(`PvP：${pvp.join(' / ')}`)
    if (note !== '') parts.push(note)
    if (parts.length > 0) {
      const source = [textOf(godRoll.source).trim(), textOf(godRoll.source_detail).trim()]
        .filter((part) => part !== '')
        .join(' · ')
      references.push({ label: '愿单参考', text: parts.join('；'), source })
    }
  }

  const warnings: string[] = []
  for (const raw of arrayOf(root.warnings)) {
    const warning = textOf(raw).trim()
    if (warning !== '') warnings.push(warning)
  }
  const variantsNote = textOf(weapon.name_variants_note).trim()
  if (variantsNote !== '') warnings.push(variantsNote)

  return {
    source: 'analyze',
    summary: textOf(root.summary).trim(),
    name,
    nameEn: textOf(weapon.name_en).trim(),
    weaponType: textOf(weapon.weapon_type).trim(),
    frame: textOf(weapon.frame).trim(),
    rarity: textOf(weapon.rarity).trim(),
    damageType: textOf(weapon.damage_type).trim(),
    ammoType: textOf(weapon.ammo_type).trim(),
    rpm: numberOf(weapon.rpm),
    iconUrl: textOf(weapon.icon_url).trim(),
    description: textOf(weapon.description).trim(),
    stats,
    perkHints,
    owned,
    references,
    warnings: [...new Set(warnings)],
    inventoryStatus: textOf(data.inventory_status).trim(),
    inventoryChecked,
  }
}

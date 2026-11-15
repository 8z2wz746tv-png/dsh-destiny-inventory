/**
 * `weapon_assistant(intent="filter_rolls", weapon_type=…)` → 同类型持有候选模型。
 *
 * **排除当前武器只看 `selectedItemHash`**，不依赖第二次查询是否返回当前实例。
 * 查询可能 truncated；即使当前实例不在返回行里，只要出现同 Hash 的另一副本，
 * 也必须整组排除。Hash 缺失时拒绝生成候选。
 */
export interface AlternativeCopy {
  readonly instanceId: string
  readonly location: string
  readonly power: number | null
  readonly equipped: boolean
  readonly locked: boolean
  /** 当前插槽名字（真名；filter_rolls 不给 slot/kind）。 */
  readonly perks: readonly string[]
}

/** 社区清单记录，不是推荐结论。 */
export interface AlternativeCommunity {
  readonly list: string
  readonly scale: string
  readonly tier: string
  readonly note: string
  readonly source: string
  readonly updatedAt: string
}

export interface AlternativeCandidate {
  readonly itemHash: number
  readonly name: string
  readonly nameEn: string
  readonly weaponType: string
  readonly frame: string
  readonly rpm: number | null
  readonly iconUrl: string
  readonly copies: readonly AlternativeCopy[]
  readonly community: readonly AlternativeCommunity[]
}

export interface AlternativesCurrent {
  readonly instanceId: string
  readonly name: string
  readonly frame: string
  readonly rpm: number | null
  readonly slots: readonly string[]
}

export interface WeaponAlternativesModel {
  /** 来自 `/context.selected.hash`；没有可信 Hash 时 `currentKnown=false`。 */
  readonly currentHash: number
  readonly currentKnown: boolean
  readonly currentName: string
  /** 仅当第二次返回里恰好有当前实例时才有完整详情。 */
  readonly current: AlternativesCurrent | null
  readonly candidates: readonly AlternativeCandidate[]
  readonly matchedCount: number
  readonly returnedCount: number
  readonly truncated: boolean
  /** 去重后候选超过 10，只展示前 10 组。 */
  readonly candidatesTruncated: boolean
  readonly source: 'filter_rolls'
}

type Json = Record<string, unknown>

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

/** 第二次查询：有 weapon_type、没有 weapon_name，才是“同类型候选”结果。 */
export function isAlternativesQuery(args: string): boolean {
  try {
    const value = objectOf(JSON.parse(args) as unknown)
    if (value === null) return false
    const weaponName = textOf(value.weapon_name).trim()
    const weaponType = textOf(value.weapon_type).trim()
    return weaponName === '' && weaponType !== ''
  } catch {
    return false
  }
}

const MAX_CANDIDATES = 10

interface Group {
  itemHash: number
  name: string
  nameEn: string
  weaponType: string
  frame: string
  rpm: number | null
  iconUrl: string
  copies: AlternativeCopy[]
}

/** 解析一次同类型候选结果；失败返回 `null`，由 UI 回退原始文本。 */
export function parseWeaponAlternatives(
  result: string | null,
  current: { instanceId?: string; hash?: number; name?: string },
): WeaponAlternativesModel | null {
  if (result === null || result.trim() === '') return null
  let root: Json | null = null
  try {
    root = objectOf(JSON.parse(result.trim()) as unknown)
  } catch {
    return null
  }
  if (root === null || root.ok !== true) return null
  const data = objectOf(root.data)
  if (data === null || data.scope !== 'owned_inventory') return null

  const currentHash = numberOf(current.hash)
  const currentKnown = currentHash !== null && currentHash > 0
  const currentName = textOf(current.name).trim()
  const matched = arrayOf(data.matched)
  const groups = new Map<number, Group>()

  for (const raw of matched) {
    const row = objectOf(raw)
    if (row === null) continue
    const itemHash = numberOf(row.item_hash)
    if (itemHash === null || itemHash <= 0) continue
    const instanceId = textOf(row.instance_id).trim()
    if (instanceId === '') continue
    const name = textOf(row.name).trim()
    if (name === '') continue

    const copy: AlternativeCopy = {
      instanceId,
      location: textOf(row.location).trim(),
      power: numberOf(row.power),
      equipped: row.is_equipped === true,
      locked: row.locked === true,
      perks: arrayOf(row.perks)
        .map((perk) => textOf(perk).trim())
        .filter((perk) => perk !== ''),
    }

    const group = groups.get(itemHash)
    if (group === undefined) {
      groups.set(itemHash, {
        itemHash,
        name,
        nameEn: textOf(row.name_en).trim(),
        weaponType: textOf(row.weapon_type).trim(),
        frame: textOf(row.frame).trim(),
        rpm: numberOf(row.rpm),
        iconUrl: textOf(row.icon_url).trim(),
        copies: [copy],
      })
    } else {
      group.copies.push(copy)
    }
  }

  // 只在第二次结果恰好包含选中的那个实例时展示当前详情；否则留空，不拿同 Hash 的副本冒充。
  let currentDetails: AlternativesCurrent | null = null
  if (currentKnown && current.instanceId !== undefined) {
    const selected = [...groups.values()]
      .flatMap((group) => group.copies.map((copy) => ({ group, copy })))
      .find(({ copy }) => copy.instanceId === current.instanceId)
    if (selected !== undefined && selected.group.itemHash === currentHash) {
      currentDetails = {
        instanceId: selected.copy.instanceId,
        name: selected.group.name,
        frame: selected.group.frame,
        rpm: selected.group.rpm,
        slots: selected.copy.perks,
      }
    }
  }

  // farming_list 没有 item_hash；只能按武器名关联。保留为弱证据，不升级为定义身份匹配。
  const farmingByName = new Map<string, AlternativeCommunity[]>()
  const farmingList = objectOf(data.farming_list)
  for (const raw of arrayOf(farmingList?.results)) {
    const entry = objectOf(raw)
    if (entry === null) continue
    const name = textOf(entry.name).trim()
    if (name === '') continue
    const sourceRef = objectOf(entry.source_ref)
    const community: AlternativeCommunity = {
      list: textOf(entry.list).trim(),
      scale: textOf(entry.scale).trim(),
      tier: textOf(entry.tier).trim(),
      note: textOf(entry.note).trim(),
      source: textOf(entry.source).trim(),
      updatedAt: sourceRef === null ? '' : textOf(sourceRef.updated_at).trim(),
    }
    const existing = farmingByName.get(name)
    if (existing === undefined) farmingByName.set(name, [community])
    else existing.push(community)
  }

  // 当前 Hash 的整组排除；不依赖 selectedInstanceId 是否出现在返回里。
  const candidates: AlternativeCandidate[] = []
  if (currentKnown) {
    for (const group of groups.values()) {
      if (group.itemHash === currentHash) continue
      candidates.push({
        itemHash: group.itemHash,
        name: group.name,
        nameEn: group.nameEn,
        weaponType: group.weaponType,
        frame: group.frame,
        rpm: group.rpm,
        iconUrl: group.iconUrl,
        copies: group.copies,
        community: farmingByName.get(group.name) ?? [],
      })
    }
  }

  return {
    currentHash: currentKnown ? (currentHash as number) : 0,
    currentKnown,
    currentName,
    current: currentDetails,
    candidates: candidates.slice(0, MAX_CANDIDATES),
    matchedCount: numberOf(data.matched_count) ?? matched.length,
    returnedCount: numberOf(data.returned_count) ?? matched.length,
    truncated: data.truncated === true,
    candidatesTruncated: candidates.length > MAX_CANDIDATES,
    source: 'filter_rolls',
  }
}

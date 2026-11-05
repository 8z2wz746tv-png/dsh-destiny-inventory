/**
 * Item detail assembled from our own data plane.
 *
 * Deliberately does not go through MCP (PLAN-SELF-HOSTED-DIM §1): reading is the
 * front end's own job. Sources are the Manifest (definitions) plus components
 * 300 (instance stats) and 305 (sockets).
 */
import type { BungieService } from './bungie-service'
import { BASE_TO_ENHANCED, ENHANCED_PERK_HASHES } from './enhanced-perks'
import { statLines } from './stat-lines'
import { toRarity } from './dto'
import type { DefinitionLookup } from './dto'
import type { ProfileItem } from '../bungie/profile'
import type { ItemDetailView, PerkColumnView, PerkOptionView } from './types'

/**
 * Socket categories that never earn a perk row.
 *
 * Shaders, mementos and trackers are sockets too, but they are cosmetics: the
 * detail card is about what the weapon *does*.
 */
const HIDDEN_PLUG_CATEGORIES = new Set(['shader', 'memento'])

/**
 * Sockets whose pool is a real choice, versus mods that are simply installed.
 *
 * DIM draws perk sockets as columns with every option stacked and mod sockets as
 * a flat list of the installed plug only — a mod socket can offer ten plugs and
 * still belongs on one line.
 */
const PERK_CATEGORIES = new Set(['barrels', 'magazines', 'frames', 'origins', 'intrinsics', 'barrel', 'magazine', 'frame'])

/** Is this socket a perk choice rather than a mod slot? */
function isPerkCategory(identifier: string): boolean {
  if (PERK_CATEGORIES.has(identifier)) return true
  return /(barrels|magazines|frames|origins)/.test(identifier)
}

/**
 * Socket category → the label the game shows.
 *
 * Bungie publishes these as `plugCategoryIdentifier` keys (`barrels`,
 * `magazines`, …) with no localized name in the manifest we hold, so the common
 * ones are mapped here; anything unmapped falls back to its key rather than
 * inventing a label.
 */
const SOCKET_LABEL: Record<string, string> = {
  barrels: '枪管',
  magazines: '弹匣',
  frames: '框架',
  origins: '起源特性',
  masterworks: '大师杰作',
  mods: '武器模组',
  mod_guns: '武器模组',
  mod_armor: '护甲模组',
  weapon_trackers: '击杀记录器',
  weapon_masterworks: '大师杰作',
  intrinsics: '固有特性',
  shader: '着色器',
  memento: '纪念物',
  tracker: '击杀记录器',
}

/** Localized ammo names by `equippingBlock.ammoType` (Bungie's DestinyAmmunitionType). */
const AMMO_NAME: Record<number, string> = { 1: '主要弹药', 2: '特殊弹药', 3: '重型弹药' }

/**
 * Label one socket from its `plugCategoryIdentifier`.
 *
 * Bungie nests these (`v400.weapon.mod_guns`), so an exact-key table misses
 * most of them; match the leaf first, then a prefix, then give up honestly by
 * showing the leaf rather than a raw identifier.
 */
function socketLabel(identifier: string, fallbackIndex: number): string {
  const parts = identifier.split('.')
  const leaf = parts[parts.length - 1] ?? ''
  if (SOCKET_LABEL[leaf] !== undefined) return SOCKET_LABEL[leaf]
  if (identifier.includes('masterwork')) return '大师杰作'
  if (identifier.includes('skin')) return '外观'
  if (identifier.includes('vfx')) return '特效'
  if (identifier.includes('batteries')) return '电池'
  if (identifier.includes('tracker')) return '击杀记录器'
  if (identifier.startsWith('v400.weapon.mod')) return '武器模组'
  if (identifier.startsWith('v400.armor')) return '护甲模组'
  if (leaf !== '') return leaf.replace(/_/g, ' ')
  return `插槽 ${fallbackIndex + 1}`
}

/** One column per socket that holds a real perk. */
function columnsOf(item: ProfileItem, plug: DefinitionLookup['plug']): PerkColumnView[] {
  return item.sockets.flatMap((socket, index) => {
    const definition = plug(socket.plugHash)
    if (definition === null) return []
    const category = definition.plugCategoryIdentifier.split('.')[0] ?? ''
    if (HIDDEN_PLUG_CATEGORIES.has(category)) return []

    // Every plug the socket accepts, installed one first: that is the pool DIM
    // draws as a column, not a single cell.
    // Mod sockets show the installed plug only; their pool is a picker, not a
    // comparison. Perk sockets show everything the socket accepts.
    const perkSocket = isPerkCategory(definition.plugCategoryIdentifier)
    const hashes = perkSocket
      ? [socket.plugHash, ...socket.options.filter((hash) => hash !== socket.plugHash)]
      : [socket.plugHash]
    const options: PerkOptionView[] = hashes.flatMap((hash) => {
      const option = plug(hash)
      if (option === null) return []
      // Marks the enhanced variant so the card can draw the upgrade arrow; the
      // enhanced hash is the plug's own when it already is one.
      const enhanced = ENHANCED_PERK_HASHES.has(hash)
      return [
        {
          hash,
          name: option.name,
          description: option.description,
          icon: option.icon,
          selected: hash === socket.plugHash,
          enhancedHash: enhanced ? hash : (BASE_TO_ENHANCED.get(hash) ?? 0),
          statEffects: [],
        },
      ]
    })
    return [
      {
        socketIndex: index,
        slot: socketLabel(definition.plugCategoryIdentifier, index),
        kind: category,
        options,
        optionsAvailable: perkSocket && options.length > 1,
      },
    ]
  })
}

/**
 * Build the stat lines in the game's display order.
 *
 * Zero-valued stats are dropped: the manifest lists every stat the group defines,
 * and printing six zeroes under a weapon reads as missing data, not as a spec.
 * @param definition - the item's Manifest definition.
 * @param definitions - lookup for names and ordering.
 */

/**
 * Build the detail card for one instance.
 * @param service - the inventory service (snapshot cache + definitions).
 * @param instanceId - the instance to describe.
 * @param options - `force` bypasses the snapshot cache.
 * @returns the detail view, or `null` when the instance is not in the snapshot.
 */
export async function readItemDetail(
  service: BungieService,
  instanceId: string,
  options: { force?: boolean } = {},
): Promise<ItemDetailView | null> {
  const { snapshot, definitions } = await service.detailSource(options)
  const item = snapshot.items.find((candidate) => candidate.instanceId === instanceId)
  if (item === undefined) return null
  return buildItemDetail(item, definitions, snapshot.equippedCharacters)
}

/**
 * Assemble one detail from a row that is already parsed.
 *
 * Split from the lookup so a bulk build walks the snapshot once instead of
 * re-resolving it per item.
 * @param item - the parsed instance.
 * @param definitions - manifest lookups.
 * @returns the detail view.
 */
export function buildItemDetail(
  item: ProfileItem,
  definitions: DefinitionLookup,
  equippedCharacters: Set<string> = new Set(),
): ItemDetailView {
  const definition = definitions.item(item.itemHash)
  const columns = columnsOf(item, definitions.plug)
  const ammo = definition?.ammoType ?? null
  const equipped = pickEquipped(equippedCharacters, item)

  return {
    id: item.key,
    instanceId: item.instanceId,
    hash: item.itemHash,
    name: definition?.name ?? `#${item.itemHash}`,
    kind: definition?.itemType === 3 ? 'weapon' : definition?.itemType === 2 ? 'armor' : 'other',
    icon: definition?.icon ?? '',
    power: item.power,
    equipped,
    locked: item.locked,
    quantity: item.quantity,
    location: item.location,
    rarity: toRarity(definition?.tierType ?? null),
    damageType: definitions.damageType(definition?.damageType ?? null),
    damageIcon: definitions.damageTypeIcon(definition?.damageType ?? null),
    ammoType: ammo === null ? '' : (AMMO_NAME[ammo] ?? ''),
    weaponType: definition?.itemTypeDisplayName ?? '',
    frame: columns.find((column) => column.kind === 'frames')?.options[0]?.name ?? '',
    description: definition?.description ?? '',
    columns,
    stats: statLines(definition, definitions, definition?.itemType === 2, item.stats),
    gearTier: item.gearTier,
    itemLevel: item.itemLevel,
    crafted: item.crafted,
    masterwork: item.masterwork,
    killCount: killCount(item),
    enhanced: item.enhanced,
    intrinsic: intrinsicOf(item, definitions.plug, definition?.tierType ?? null),
    rollSummary:
      columns.length === 0
        ? '这件物品没有可切换的特性。'
        : columns.map((column) => column.options[0]?.name ?? '').filter(Boolean).join(' · '),
  }
}

/**
 * Kills recorded by the socketed tracker, if there is one.
 *
 * The tracker is an ordinary socket whose plug carries objective progress
 * (component 309), so the count comes from there rather than from the item.
 * @param item - the instance in the snapshot.
 * @returns the progress value, or `null` when no tracker is socketed.
 */
function killCount(item: ProfileItem): number | null {
  for (const socket of item.sockets) {
    const objectives = item.plugObjectives[socket.plugHash]
    if (objectives === undefined || objectives.length === 0) continue
    return objectives[0]?.progress ?? null
  }
  return null
}

/** Three-state equipped flag, per PLAN-P0's rule: no judgement without data. */
function pickEquipped(
  equippedCharacters: Set<string>,
  item: ProfileItem,
): 'equipped' | 'not_equipped' | 'unknown' {
  if (item.source === 'equipment') return 'equipped'
  if (item.characterId !== null && !equippedCharacters.has(item.characterId)) return 'unknown'
  return 'not_equipped'
}

/** The exotic intrinsic, when the item has one. */
function intrinsicOf(
  item: ProfileItem,
  plug: DefinitionLookup['plug'],
  tierType: number | null,
): { name: string; description: string; icon: string } | null {
  // Only exotics carry a distinct intrinsic; on a legendary the same socket holds
  // the frame, which already shows as its own perk column.
  if (tierType !== 6) return null
  for (const socket of item.sockets) {
    const definition = plug(socket.plugHash)
    if (definition === null || !definition.plugCategoryIdentifier.startsWith('intrinsics')) continue
    return { name: definition.name, description: definition.description, icon: definition.icon }
  }
  return null
}

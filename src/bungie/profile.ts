/**
 * GetProfile → the grid's data model.
 *
 * Deliberately narrow: characters, item positions, the equipped flags, and each
 * instance's socket list (component 305). Perk *definitions* are not resolved
 * here — that needs the manifest and belongs to the detail view.
 *
 * Trap this file exists to contain: component `300`'s `isEquipped` is true for
 * more things than "wearing it" — subclass and artifact buckets report it for
 * every item. So `equipped` here is derived from which component the item came
 * from (`205` = equipment), and the upstream flag is kept only for diagnostics.
 */
import { INVENTORY_COMPONENTS } from './components'
import { toItem } from './profile-item'
import { num, str } from './values'
import type { ProfileSocket, RawPlugObjectives, RawReusable, RawSockets, RawStats } from './sockets'
import type { BungieClient } from './client'

/** Where an item sits right now: `vault`, or a character id. */
export type ItemLocation = 'vault' | string

/** One character row. */
export interface ProfileCharacter {
  characterId: string
  /** Bungie classType: 0 Titan, 1 Hunter, 2 Warlock. */
  classType: number
  light: number
  /** Emblem icon path (relative to bungie.net). */
  emblemPath: string | null
  /** Wide name-card banner (`emblemBackgroundPath`); this is the card's backdrop. */
  emblemBackground: string | null
  /** `titleRecordHash`: the seal this character displays, when they have one. */
  titleRecordHash: number | null
  /** ISO timestamp of last play. */
  lastPlayed: string | null
}

/** One item instance, trimmed to grid needs. */
export interface ProfileItem {
  /** Stable key: instance id, or `hash:bucket` for stackables whose instance id is "0". */
  key: string
  /** Raw Bungie instance id (`"0"` for stackables). */
  instanceId: string
  itemHash: number
  bucketHash: number
  quantity: number
  location: ItemLocation
  /** Character owning it, or `null` in the vault. */
  characterId: string | null
  /** Which profile component delivered this row. Position comes from here, never from a hash. */
  source: 'profile' | 'character-inventory' | 'equipment' | 'postmaster'
  /** Component 205's own `bucketHash`: the slot this instance occupies. Only set for `equipment`. */
  slotHash: number | null
  /** True only for items delivered by component 205. */
  equipped: boolean
  /** Component 300's own flag; true for more buckets than "wearing". Diagnostics only. */
  upstreamEquipped: boolean
  /** Player lock flag from the item's `state` bitfield (`DestinyItemState.Locked`). */
  locked: boolean
  /**
   * `state` bit 8: forged at the Relic.
   *
   * The bit values are Bungie's `DestinyItemState`: Locked=1, Tracked=2,
   * **Masterwork=4**, **Crafted=8**, HighlightedObjective=16, Enhanced=32. Reading
   * 4 as "crafted" tagged 933 of 1924 items; the real crafting bit is 8 (204).
   */
  crafted: boolean
  /** `state` bit 4: masterworked. 933 items carry it. */
  masterwork: boolean
  /** `state` bit 32: enhanced. */
  enhanced: boolean
  /** Component 300's `gearTier`: the tier letter the game prints (T1..T5). */
  gearTier: number | null
  /** Component 300's `itemLevel`: the weapon/armor level number. */
  itemLevel: number | null
  /**
   * Component 309: progress on the objectives each installed plug carries.
   *
   * Keyed by plug hash; the kill tracker lives here.
   */
  plugObjectives: Record<number, { objectiveHash: number; progress: number }[]>
  /** Component 304: the instance's current stat values, by signed hash. */
  stats: Record<number, number>
  /** Primary stat value (power) when upstream reported one. */
  power: number | null
  /**
   * Component 305's sockets, in slot order.
   *
   * Empty when 305 was not requested or the item has no sockets; the detail
   * view must say "unavailable" rather than draw an empty perk list.
   */
  sockets: ProfileSocket[]
}
/** One account read. */
export interface ProfileSnapshot {
  displayName: string
  membershipId: string
  characters: ProfileCharacter[]
  items: ProfileItem[]
  /** `${characterId}:${bucketHash}` → instance id of the equipped item. */
  equippedByBucket: Map<string, string>
  /**
   * Whether component 205 answered at all.
   *
   * `unavailable` means we cannot tell equipped from carried: the caller must
   * report "unknown" rather than assuming everything is carried.
   */
  equipmentState: 'loaded' | 'unavailable'
  /**
   * Characters whose equipment list actually came back.
   *
   * Empty when 205 is missing; may be a subset when upstream returns only some
   * characters — a character without an entry must report `unknown`, not
   * "carries everything".
   */
  equippedCharacters: Set<string>
}

/** Shape of the parts of GetProfile this module consumes. */
export interface RawItem {
  itemHash?: number
  itemInstanceId?: string
  quantity?: number
  bucketHash?: number
  /**
   * Owner for rows that address one character (the postmaster). Absent in the
   * vault, where items are account-level.
   */
  characterId?: string
  /** Bitfield: 1 = locked, 2 = tracked. */
  state?: number
}

interface RawItemList {
  items?: RawItem[]
}

export interface RawInstance {
  /** Gear tier (component 300). */
  gearTier?: number
  /** Item level (component 300). */
  itemLevel?: number
  isEquipped?: boolean
  primaryStat?: { value?: number }
}

/** The subset of the GetProfile `Response` we read. */
export interface RawProfileResponse {
  profile?: {
    data?: {
      userInfo?: { displayName?: string; membershipId?: string }
      inventory?: RawItemList
    }
  }
  profileInventory?: { data?: RawItemList }
  characters?: {
    data?: Record<
      string,
      {
        characterId?: string
        classType?: number
        light?: number
        emblemPath?: string
        emblemBackgroundPath?: string
        titleRecordHash?: number
        dateLastPlayed?: string
      }
    >
  }
  characterInventories?: { data?: Record<string, RawItemList> }
  characterEquipment?: { data?: Record<string, RawItemList> }
  itemComponents?: {
    instances?: { data?: Record<string, RawInstance> }
    sockets?: { data?: Record<string, RawSockets> }
    reusablePlugs?: { data?: Record<string, RawReusable> }
    plugObjectives?: { data?: Record<string, RawPlugObjectives> }
    stats?: { data?: Record<string, RawStats> }
  }
}

/**
 * Buckets that live in a character's postmaster rather than the vault.
 *
 * Engrams are deliberately absent: they reach us through the vault and are not
 * addressed to a character, so filing them here would invent an owner.
 */
export const POSTMASTER_BUCKETS = new Set<number>([
  215593132, // LostItems
  3161908920, // Messages
  1367666825, // SpecialOrders
])

/** Stable key for one raw item. Stackables share instance id "0", so hash+bucket is the key. */
export function itemKey(raw: RawItem): string {
  const instanceId = str(raw.itemInstanceId, '0')
  if (instanceId !== '' && instanceId !== '0') return instanceId
  return `${num(raw.itemHash)}:${num(raw.bucketHash)}`
}


/**
 * Parse one GetProfile response into the grid model.
 * @param response - the envelope's `Response` body.
 * @returns characters, items and the per-bucket equipped index.
 */
export function parseProfile(response: RawProfileResponse): ProfileSnapshot {
  const instances = response.itemComponents?.instances?.data ?? {}

  const characters: ProfileCharacter[] = Object.entries(response.characters?.data ?? {})
    .map(([key, raw]) => ({
      characterId: str(raw.characterId, key),
      classType: num(raw.classType),
      light: num(raw.light),
      emblemPath: raw.emblemPath === undefined ? null : raw.emblemPath,
      emblemBackground: raw.emblemBackgroundPath === undefined ? null : raw.emblemBackgroundPath,
      titleRecordHash: typeof raw.titleRecordHash === 'number' ? raw.titleRecordHash : null,
      lastPlayed: raw.dateLastPlayed === undefined ? null : raw.dateLastPlayed,
    }))
    .sort((a, b) => a.classType - b.classType)

  const items: ProfileItem[] = []
  const equippedByBucket = new Map<string, string>()
  const socketData = response.itemComponents?.sockets?.data ?? {}
  const reusableData = response.itemComponents?.reusablePlugs?.data ?? {}
  const objectiveData = response.itemComponents?.plugObjectives?.data ?? {}
  const statData = response.itemComponents?.stats?.data ?? {}
  /** Everything one row needs from the components, passed as one value. */
  const parts = { instances, socketData, reusableData, objectiveData, statData }

  // Vault + account-wide buckets. Component 102 also carries the postmaster:
  // those rows keep their `characterId`, which is the only way to say whose
  // mailbox an item sits in. Everything else in 102 is genuinely account-level.
  for (const raw of response.profileInventory?.data?.items ??
    response.profile?.data?.inventory?.items ??
    []) {
    const bucketHash = num(raw.bucketHash)
    if (POSTMASTER_BUCKETS.has(bucketHash)) {
      items.push(toItem(raw, 'postmaster', 'postmaster', str(raw.characterId) || null, parts))
      continue
    }
    items.push(toItem(raw, 'profile', 'vault', null, parts))
  }

  // Carried by each character. The mailbox lives here too: Bungie delivers
  // postmaster rows inside component 201, addressed to the character, not in
  // the account vault where we first went looking for them.
  for (const [characterId, list] of Object.entries(response.characterInventories?.data ?? {})) {
    for (const raw of list.items ?? []) {
      if (POSTMASTER_BUCKETS.has(num(raw.bucketHash))) {
        items.push(toItem(raw, 'postmaster', 'postmaster', characterId, parts))
        continue
      }
      items.push(toItem(raw, 'character-inventory', characterId, characterId, parts))
    }
  }

  // Worn by each character — this is the only source of `equipped`.
  for (const [characterId, list] of Object.entries(response.characterEquipment?.data ?? {})) {
    for (const raw of list.items ?? []) {
      const item = toItem(raw, 'equipment', characterId, characterId, parts)
      items.push(item)
      equippedByBucket.set(`${characterId}:${item.bucketHash}`, item.instanceId)
    }
  }

  const equippedCharacters = new Set(Object.keys(response.characterEquipment?.data ?? {}))
  return {
    equipmentState: response.characterEquipment === undefined ? 'unavailable' : 'loaded',
    equippedCharacters,
    displayName: str(response.profile?.data?.userInfo?.displayName),
    membershipId: str(response.profile?.data?.userInfo?.membershipId),
    characters,
    items,
    equippedByBucket,
  }
}

/**
 * Read the account profile.
 * @param client - configured platform client.
 * @param membershipType - Bungie membership type (3 = Steam).
 * @param membershipId - Bungie membership id.
 * @param components - components to request; the detail view adds 305.
 * @returns the parsed snapshot.
 */
export async function readProfile(
  client: BungieClient,
  membershipType: number,
  membershipId: string,
  components: number[] = INVENTORY_COMPONENTS,
): Promise<ProfileSnapshot> {
  const response = await client.get<RawProfileResponse>(
    `/Destiny2/${membershipType}/Profile/${membershipId}/`,
    { components: components.join(',') },
  )
  return parseProfile(response)
}

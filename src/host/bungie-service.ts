/**
 * Host data service: one cached account snapshot, definitions attached on demand.
 *
 * Composition only — authentication comes from a `TokenProvider`, definitions
 * from the `ManifestStore`, and the wire shape from `dto`. Nothing here knows
 * about MCP tools or the old sidecar.
 */
import { readFile } from 'node:fs/promises'
import { BungieClient } from '../bungie/client'
import { ITEM_DETAIL_COMPONENTS } from '../bungie/components'
import { ManifestStore } from '../bungie/manifest'
import type { ManifestStatus } from '../bungie/manifest'
import { pickPrimaryMembership, readMemberships } from '../bungie/memberships'
import { readProfile } from '../bungie/profile'
import type { DestinyMembership } from '../bungie/memberships'
import type { ProfileSnapshot } from '../bungie/profile'
import { FileTokenProvider } from '../bungie/token-file-provider'
import { AuthUnavailableError } from '../bungie/types'
import { CLASS_LOCATION, toCharacterRow, toItemRows } from './dto'
import type { CharacterSource, DefinitionLookup, ItemSource } from './dto'
import type { InventorySnapshot, PlayerProfileView } from '../mcp/types'

/** Default class names until a localized definition supplies one. */
const CLASS_NAME: Record<number, string> = { 0: '泰坦', 1: '猎人', 2: '术士' }

export interface BungieServiceOptions {
  /** MCP token file; read-only, re-read on every upstream call. */
  tokenPath: string
  /** Manifest sqlite (definitions). */
  manifestPath: string
  /** File holding `BUNGIE_API_KEY` (the MCP's .env during the transition). */
  apiKeyFile?: string
  /** Explicit key, wins over `apiKeyFile`. */
  apiKey?: string
  /** Membership cache lifetime. */
  membershipTtlMs?: number
  /** Snapshot cache lifetime. */
  snapshotTtlMs?: number
  /** Injectable clock for tests. */
  now?: () => number
}

/** What the bridge reports about its own data plane. */
export interface DataPlaneStatus {
  auth: 'ok' | 'unavailable'
  authReason?: string
  manifest: ManifestStatus
  snapshot: { ageMs: number | null; items: number | null }
}

/** Read one `KEY=value` out of a dotenv-style file. */
async function readEnvValue(path: string, key: string): Promise<string> {
  const text = await readFile(path, 'utf8')
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const index = trimmed.indexOf('=')
    if (trimmed.slice(0, index).trim() !== key) continue
    return trimmed
      .slice(index + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
  }
  return ''
}

/**
 * One service per host process.
 */
export class BungieService {
  private readonly tokenPath: string
  private readonly manifestPath: string
  private readonly apiKeyFile: string | undefined
  private readonly explicitKey: string | undefined
  private readonly membershipTtlMs: number
  private readonly snapshotTtlMs: number
  private readonly now: () => number

  private client: BungieClient | null = null
  private manifest: ManifestStore | null = null
  private membership: { value: DestinyMembership; at: number } | null = null
  private snapshot: { value: ProfileSnapshot; at: number } | null = null
  /** Badge artwork; static for the life of the manifest. */
  private overlayCache: { crafted: string; craftedBackground: string; tiers: string[] } | null = null
  /** Separate cache: the detail read requests component 305, the list does not. */
  private detailSnapshot: { value: ProfileSnapshot; at: number } | null = null

  constructor(options: BungieServiceOptions) {
    this.tokenPath = options.tokenPath
    this.manifestPath = options.manifestPath
    this.apiKeyFile = options.apiKeyFile
    this.explicitKey = options.apiKey
    this.membershipTtlMs = options.membershipTtlMs ?? 10 * 60_000
    this.snapshotTtlMs = options.snapshotTtlMs ?? 30_000
    this.now = options.now ?? Date.now
  }

  /** Definitions store (created lazily; construction never throws). */
  private store(): ManifestStore {
    this.manifest ??= new ManifestStore(this.manifestPath)
    return this.manifest
  }

  /** Platform client, created once the API key is known. */
  private async platform(): Promise<BungieClient> {
    if (this.client !== null) return this.client
    let apiKey = this.explicitKey ?? ''
    if (apiKey === '' && this.apiKeyFile !== undefined) {
      apiKey = await readEnvValue(this.apiKeyFile, 'BUNGIE_API_KEY')
    }
    if (apiKey === '') {
      throw new AuthUnavailableError(
        'missing',
        `no BUNGIE_API_KEY: set config.apiKey or point apiKeyFile at a file that defines it`,
      )
    }
    this.client = new BungieClient({
      apiKey,
      tokenProvider: new FileTokenProvider({ path: this.tokenPath }),
    })
    return this.client
  }

  /** Resolve (and cache) the membership a profile read needs. */
  private async currentMembership(): Promise<DestinyMembership> {
    const cached = this.membership
    if (cached !== null && this.now() - cached.at < this.membershipTtlMs) return cached.value
    const memberships = await readMemberships(await this.platform())
    const primary = pickPrimaryMembership(memberships)
    if (primary === null) {
      throw new AuthUnavailableError('missing', 'this token has no Destiny 2 membership')
    }
    this.membership = { value: primary, at: this.now() }
    return primary
  }

  /** Cached account snapshot. */
  private async currentSnapshot(force = false): Promise<ProfileSnapshot> {
    const cached = this.snapshot
    if (!force && cached !== null && this.now() - cached.at < this.snapshotTtlMs) return cached.value
    const membership = await this.currentMembership()
    const snapshot = await readProfile(await this.platform(), membership.membershipType, membership.membershipId)
    this.snapshot = { value: snapshot, at: this.now() }
    return snapshot
  }

  /** Definition lookups bound to the current manifest. */
  private definitions(): DefinitionLookup {
    const store = this.store()
    return {
      item: (hash) => store.item(hash),
      bucket: (hash) => store.bucket(hash),
      plug: (hash) => store.plug(hash),
      damageType: (enumValue) => store.damageType(enumValue),
      statOrder: (hash) => store.statOrder(hash),
      statName: (hash) => store.statName(hash),
    }
  }

  /** Character header for the panel. */
  async characters(): Promise<PlayerProfileView> {
    const snapshot = await this.currentSnapshot()
    return {
      displayName: snapshot.displayName,
      membershipId: snapshot.membershipId,
      triumphScore: null,
      characters: snapshot.characters.map((character) =>
        toCharacterRow({
          characterId: character.characterId,
          classType: character.classType,
          className: CLASS_NAME[character.classType] ?? '',
          light: character.light,
          emblemPath: character.emblemPath,
      emblemBackground: character.emblemBackground,
      title: this.store().titleName(character.titleRecordHash),
          lastPlayed: character.lastPlayed,
        } satisfies CharacterSource),
      ),
    }
  }

  /** Full inventory snapshot in the bridge's wire shape. */
  async inventory(options: { force?: boolean } = {}): Promise<InventorySnapshot> {
    const snapshot = await this.currentSnapshot(options.force === true)
    const classByCharacter = new Map<string, string>(
      snapshot.characters.map((character) => [character.characterId, CLASS_LOCATION[character.classType] ?? '']),
    )
    const sources: ItemSource[] = snapshot.items.map((item) => ({
      key: item.key,
      instanceId: item.instanceId,
      itemHash: item.itemHash,
      slotHash: item.slotHash,
      quantity: item.quantity,
      source: item.source,
      characterId: item.characterId,
      locked: item.locked,
      power: item.power,
      gearTier: item.gearTier ?? 0,
      crafted: item.crafted,
    }))
    const { rows } = toItemRows(
      sources,
      this.definitions(),
      classByCharacter,
      snapshot.equippedCharacters,
    )
    return { fetchedAt: this.now(), total: rows.length, items: rows, truncated: false }
  }

  /**
   * Snapshot plus definitions, for the detail view.
   *
   * The detail needs raw sockets and Manifest plug definitions, which the wire
   * `ItemRow` deliberately drops; exposing them here keeps that knowledge in the
   * data plane instead of leaking component ids into the client.
   * @param options - `force` bypasses the snapshot cache.
   */
  async detailSource(options: { force?: boolean } = {}): Promise<{
    snapshot: ProfileSnapshot
    definitions: DefinitionLookup
  }> {
    const cached = this.detailSnapshot
    if (!options.force && cached !== null && this.now() - cached.at < this.snapshotTtlMs) {
      return { snapshot: cached.value, definitions: this.definitions() }
    }
    const membership = await this.currentMembership()
    const snapshot = await readProfile(
      await this.platform(),
      membership.membershipType,
      membership.membershipId,
      ITEM_DETAIL_COMPONENTS,
    )
    this.detailSnapshot = { value: snapshot, at: this.now() }
    return { snapshot, definitions: this.definitions() }
  }

  /**
   * The game's own badge artwork, fetched once per process.
   *
   * The client draws tiles from these URLs instead of inventing shapes.
   */
  overlays(): { crafted: string; craftedBackground: string; tiers: string[] } {
    if (this.overlayCache === null) this.overlayCache = this.store().iconOverlays()
    return this.overlayCache
  }

  /**
   * Drop cached snapshots after a write moved the account on.
   *
   * Without this the grid keeps painting the pre-write state for the cache
   * lifetime, which reads as "the equip did nothing".
   */
  invalidate(): void {
    this.snapshot = null
    this.detailSnapshot = null
  }

  /** Self-report used by `/status`: what works, what degrades, and why. */
  async status(): Promise<DataPlaneStatus> {
    let auth: DataPlaneStatus['auth'] = 'ok'
    let authReason: string | undefined
    try {
      await this.currentMembership()
    } catch (error) {
      auth = 'unavailable'
      authReason = error instanceof Error ? error.message : String(error)
    }
    const manifest = this.store().status()
    const ageMs = this.snapshot === null ? null : this.now() - this.snapshot.at
    return {
      auth,
      ...(authReason === undefined ? {} : { authReason }),
      manifest,
      snapshot: { ageMs, items: this.snapshot?.value.items.length ?? null },
    }
  }

  /** Release the manifest handle. */
  close(): void {
    this.manifest?.close()
    this.manifest = null
  }
}

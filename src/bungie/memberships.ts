/**
 * Bungie platform memberships for the signed-in account.
 *
 * Split out of `profile.ts`: "which Destiny account is this token for" is a
 * different question from "what is in that account", and it keeps the profile
 * parser under its size ceiling.
 */
import type { BungieClient } from './client'

/** Numeric field with a fallback. */
function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** String field with a fallback. */
function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

/** One platform membership under the current Bungie account. */
export interface DestinyMembership {
  /** Platform type: 1 Xbox, 2 PSN, 3 Steam, 6 Epic. */
  membershipType: number
  /** Destiny membership id for that platform (NOT the Bungie.net id). */
  membershipId: string
  displayName: string
  /** Non-zero when cross save is active: the platform whose save is authoritative. */
  crossSaveOverride: number
}

/** GetMembershipsForCurrentUser shape, narrowed. */
interface RawMemberships {
  destinyMemberships?: {
    membershipType?: number
    membershipId?: string
    displayName?: string
    crossSaveOverride?: number
  }[]
}

/**
 * Pick the membership a profile read should use.
 *
 * The token's `membership_id` is the Bungie.net id and is NOT the id GetProfile
 * wants; passing the wrong platform type (or hardcoding 3) answers
 * `ErrorCode 8 / ParameterInvalidRange`. Cross save wins when present.
 * @param list - memberships as upstream reports them.
 * @returns the preferred membership, or `null` for an account with no Destiny 2.
 */
export function pickPrimaryMembership(list: DestinyMembership[]): DestinyMembership | null {
  if (list.length === 0) return null
  const crossSave = list.find((m) => m.crossSaveOverride !== 0 && m.membershipType === m.crossSaveOverride)
  return crossSave ?? list[0]
}

/**
 * List the Destiny memberships behind the current token.
 * @param client - configured platform client.
 */
export async function readMemberships(client: BungieClient): Promise<DestinyMembership[]> {
  const response = await client.get<RawMemberships>('/User/GetMembershipsForCurrentUser/')
  return (response.destinyMemberships ?? []).map((raw) => ({
    membershipType: num(raw.membershipType),
    membershipId: str(raw.membershipId),
    displayName: str(raw.displayName),
    crossSaveOverride: num(raw.crossSaveOverride),
  }))
}

/**
 * Host-side Bungie data plane.
 *
 * Entry point for everything the grid reads. Authentication is injected as a
 * `TokenProvider`, so switching from the transitional file reader to the OAuth
 * broker is a wiring change here — not a change to profile, manifest or inventory.
 */
export { BungieApiError, BungieClient, describeBungieError } from './client'
export type { BungieClientOptions, BungieEnvelope, QueryValues } from './client'
export { Component, INVENTORY_COMPONENTS, ITEM_DETAIL_COMPONENTS } from './components'
export { readProfile, parseProfile, itemKey } from './profile'
export { readMemberships, pickPrimaryMembership } from './memberships'
export type { ProfileCharacter, ProfileItem, ProfileSnapshot, ItemLocation } from './profile'
export type { DestinyMembership } from './memberships'
export { FileTokenProvider, fileTokenProvider } from './token-file-provider'
export type { FileTokenProviderOptions } from './token-file-provider'
export { AuthUnavailableError } from './types'
export type { AccessToken, AuthFailure, TokenProvider } from './types'

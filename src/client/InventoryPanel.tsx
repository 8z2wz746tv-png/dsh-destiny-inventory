import { useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { PlayerProfileView } from '../mcp/types'
import { fetchCharacters } from './api'

/** Bungie serves every manifest art path off its own host. */
const BUNGIE_ORIGIN = 'https://www.bungie.net'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; profile: PlayerProfileView }
  | { kind: 'error'; message: string }

/**
 * Read one emblem path into an absolute URL, or `undefined` when absent.
 * @param path - manifest art path from the bridge payload.
 */
function emblemUrl(path: string | null): string | undefined {
  if (path === null || path === '') return undefined
  return `${BUNGIE_ORIGIN}${path}`
}

/**
 * One character card: emblem, localized class, light level.
 * @param props - the character row.
 */
function CharacterCard({ character }: { character: PlayerProfileView['characters'][number] }): ReactElement {
  const emblem = emblemUrl(character.emblemPath)
  return (
    <article className="dsh-destiny-card">
      {emblem === undefined ? (
        <div className="dsh-destiny-card__emblem" />
      ) : (
        <img className="dsh-destiny-card__emblem" src={emblem} alt="" loading="lazy" />
      )}
      <div className="dsh-destiny-card__body">
        <span className="dsh-destiny-card__class">{character.className || character.characterId}</span>
        <span className="dsh-destiny-card__light">光等 {character.light}</span>
      </div>
    </article>
  )
}

/**
 * The inventory page mounted in the layout's keyed `main` slot.
 *
 * The layout mounts it only while this panel is the selected one, so the read
 * runs on mount and its result is dropped on unmount.
 * @param props - the framework main-slot share plus this entry's injected face.
 */
export function InventoryPanel({ routePath }: { routePath: string }): ReactElement {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  const load = useCallback(
    (signal: AbortSignal): void => {
      fetchCharacters(routePath, signal).then(
        (profile) => {
          if (!signal.aborted) setState({ kind: 'ready', profile })
        },
        (error: unknown) => {
          if (signal.aborted) return
          const message = error instanceof Error ? error.message : String(error)
          setState({ kind: 'error', message })
        },
      )
    },
    [routePath],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  return (
    <div className="dsh-destiny-panel" data-dsh-destiny-view="">
      {state.kind === 'loading' && <p className="dsh-destiny-panel__state">正在读取仓库…</p>}
      {state.kind === 'error' && (
        <p className="dsh-destiny-panel__state dsh-destiny-panel__state--error">{state.message}</p>
      )}
      {state.kind === 'ready' && (
        <>
          <header className="dsh-destiny-panel__header">
            <span className="dsh-destiny-panel__name">{state.profile.displayName}</span>
            {state.profile.triumphScore !== null && (
              <span className="dsh-destiny-panel__meta">凯旋分 {state.profile.triumphScore}</span>
            )}
          </header>
          <p className="dsh-destiny-panel__section">角色</p>
          <div className="dsh-destiny-panel__characters">
            {state.profile.characters.map((character) => (
              <CharacterCard key={character.characterId} character={character} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

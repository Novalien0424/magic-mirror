import { useEffect, useState } from 'react'
import type { AppSnapshot, LifecycleState } from '../../shared/types'

export const MIRROR_STATE_COPY: Readonly<Record<LifecycleState, { readonly title: string; readonly detail: string }>> = Object.freeze({
  starting: Object.freeze({ title: 'Starting', detail: 'Preparing the local mirror.' }),
  dormant: Object.freeze({ title: 'Dormant', detail: 'Waiting for the wake word.' }),
  activating: Object.freeze({ title: 'Activating', detail: 'Waking the mirror.' }),
  active: Object.freeze({ title: 'Active', detail: 'Ready for conversation.' }),
  suspending: Object.freeze({ title: 'Suspending', detail: 'Returning to sleep.' }),
  offlineLoop: Object.freeze({
    title: 'OfflineLoop',
    detail: 'Cloud unavailable; local fallback is playing.',
  }),
  maintenance: Object.freeze({
    title: 'Maintenance',
    detail: 'Local service unavailable; see the Console.',
  }),
})

export interface MirrorView {
  readonly state: LifecycleState
  readonly className: string
  readonly title: string
  readonly detail: string
}

interface MirrorProjectionOptions {
  readonly offlineAssetAvailable?: boolean
}

const OFFLINE_LOOP_ASSET_SRC = 'resources/mock/offline-loop-v1.mp4'
const OFFLINE_LOOP_ASSET_UNAVAILABLE = 'offline_loop_asset_unavailable'

type OfflineLoopMediaStatus = 'unavailable' | 'playing'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readProperty(value: unknown, key: string): unknown {
  if (!isRecord(value)) return undefined
  try {
    return Reflect.get(value, key)
  } catch {
    return undefined
  }
}

function isLifecycleState(value: unknown): value is LifecycleState {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MIRROR_STATE_COPY, value)
}

function stableMaintenanceCode(value: unknown): string {
  const code = isRecord(value) ? readProperty(value, 'code') : undefined
  return typeof code === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(code)
    ? code
    : MIRROR_STATE_COPY.maintenance.detail
}

export function projectMirrorSnapshot(
  snapshot: unknown,
  options: MirrorProjectionOptions = {},
): MirrorView {
  const lifecycle = readProperty(snapshot, 'lifecycle')
  const state = isLifecycleState(lifecycle) ? lifecycle : 'starting'
  const copy = MIRROR_STATE_COPY[state]

  if (state === 'offlineLoop' && options.offlineAssetAvailable === false) {
    return {
      state,
      className: `screen screen--${state}`,
      title: copy.title,
      detail: OFFLINE_LOOP_ASSET_UNAVAILABLE,
    }
  }

  if (state === 'maintenance') {
    return {
      state,
      className: `screen screen--${state}`,
      title: copy.title,
      detail: stableMaintenanceCode(readProperty(snapshot, 'maintenance')),
    }
  }

  return {
    state,
    className: `screen screen--${state}`,
    title: copy.title,
    detail: copy.detail,
  }
}

const STARTING_SNAPSHOT: Pick<AppSnapshot, 'lifecycle'> = { lifecycle: 'starting' }

function OfflineLoopScreen(): React.JSX.Element {
  const [mediaStatus, setMediaStatus] = useState<OfflineLoopMediaStatus>('unavailable')
  const mediaIsPlaying = mediaStatus === 'playing'
  const detail = mediaIsPlaying
    ? MIRROR_STATE_COPY.offlineLoop.detail
    : OFFLINE_LOOP_ASSET_UNAVAILABLE

  return (
    <div className="screen screen--offlineLoop" data-state="offlineLoop">
      <p className="screen__title">{MIRROR_STATE_COPY.offlineLoop.title}</p>
      <p className="screen__detail">{detail}</p>
      <div
        className={`screen__offline screen__offline--${mediaStatus}`}
        aria-label="offline local fallback"
      >
        <video
          className="screen__offline-media"
          src={OFFLINE_LOOP_ASSET_SRC}
          autoPlay
          loop
          muted
          playsInline
          aria-hidden={!mediaIsPlaying}
          onCanPlay={(event) => {
            try {
              void event.currentTarget.play().catch(() => {
                setMediaStatus('unavailable')
              })
            } catch {
              setMediaStatus('unavailable')
            }
          }}
          onPlaying={() => setMediaStatus('playing')}
          onError={() => setMediaStatus('unavailable')}
        />
        {!mediaIsPlaying && <div className="screen__offline-fallback" aria-hidden="true" />}
      </div>
    </div>
  )
}

export function App(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<unknown>(STARTING_SNAPSHOT)
  const [bridgeMissing, setBridgeMissing] = useState(false)
  const view = projectMirrorSnapshot(snapshot)

  useEffect(() => {
    let mounted = true
    let unsubscribe: (() => void) | undefined
    const bridge = window.magicMirror

    if (bridge === undefined) {
      setBridgeMissing(true)
      return () => {
        mounted = false
      }
    }

    bridge.notifyReady()
    void bridge.getSnapshot()
      .then((initialSnapshot) => {
        if (!mounted) return
        setSnapshot(initialSnapshot)
        unsubscribe = bridge.onSnapshot((nextSnapshot) => {
          if (mounted) setSnapshot(nextSnapshot)
        })
      })
      .catch(() => {
        if (mounted) setBridgeMissing(true)
      })

    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [])

  if (bridgeMissing) {
    return (
      <div className="screen screen--starting">
        <p className="screen__title">Starting</p>
        <p className="screen__detail">bridge_unavailable</p>
      </div>
    )
  }

  if (view.state === 'offlineLoop') return <OfflineLoopScreen />

  return (
    <div className={view.className} data-state={view.state}>
      <p className="screen__title">{view.title}</p>
      <p className="screen__detail">{view.detail}</p>
    </div>
  )
}

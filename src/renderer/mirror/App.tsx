import { useEffect, useState } from 'react'
import type {
  MirrorBridge,
  RealtimeRendererMetadataKind,
  RealtimeRendererMetadataReport,
  RealtimeRendererMetadataStatus,
  RealtimeRuntimeCommand,
  RealtimeRuntimeOutcomeReport,
  RealtimeSessionIdentity,
  TransientRealtimeSecretResult,
} from '../../shared/bridge'
import type { AppSnapshot, LifecycleState } from '../../shared/types'
import { createBrowserRealtimeRuntimeOwner } from '../realtime/realtime-runtime-dependencies'
import type { PlaybackCompletionScheduler } from '../realtime/playback-completion'
import { createSessionCleanup, type SessionCleanupBoundary } from '../realtime/session-cleanup'
import { TranscriptBuffer } from '../realtime/transcript-buffer'
import { requestSleepAfterPlayback } from '../realtime/sleep-command'
import type {
  RealtimeRuntimeCleanup,
  RealtimeRuntimeCleanupBoundary,
  RealtimeRuntimeEventSink,
  RealtimeRuntimeOutcome,
  RealtimeRuntimeOwner,
  RealtimeRuntimeSession,
} from '../realtime/realtime-runtime-owner'

type MirrorInterruptBridge = Pick<MirrorBridge, 'onInterrupt'>
type MirrorInterruptTarget = Pick<RealtimeRuntimeOwner, 'interrupt'>
type MirrorRealtimeRuntimeBridge = Pick<
  MirrorBridge,
  | 'requestRealtimeClientSecret'
  | 'reportRealtimeRuntimeOutcome'
  | 'reportRealtimeMetadata'
  | 'reportRealtimeFailure'
  | 'onRealtimeRuntimeCommand'
  | 'onInterrupt'
  | 'requestSleep'
>
type MirrorRealtimeMetadataBridge = Pick<MirrorBridge, 'reportRealtimeMetadata'>
type MirrorRealtimeRuntimeOwner = Pick<
  RealtimeRuntimeOwner,
  'start' | 'rollover' | 'stop' | 'interrupt' | 'dispose'
>

const REALTIME_TRANSCRIPT_BUFFER_MAX_ENTRIES = 200

// PoC tail detection: allow the primary event first, then bound silent sampling.
const REALTIME_PLAYBACK_FALLBACK_AFTER_MS = 500
const REALTIME_PLAYBACK_SAMPLE_INTERVAL_MS = 50
const REALTIME_PLAYBACK_MAX_FALLBACK_MS = 2_000
const REALTIME_PLAYBACK_SILENCE_THRESHOLD = 0.02
const REALTIME_PLAYBACK_SILENT_SAMPLES_REQUIRED = 3
const REALTIME_METADATA_MAX_DURATION_MS = 86_400_000

const RUNTIME_TO_SESSION_CLEANUP_BOUNDARY: Readonly<
  Record<RealtimeRuntimeCleanupBoundary, SessionCleanupBoundary>
> = Object.freeze({
  close: 'close',
  stop: 'manual_stop',
  dispose: 'renderer_restart',
  rollover: 'rollover',
  offline_loop: 'offline_loop',
})

function failedRuntimeOutcome(
  operation: RealtimeRuntimeOutcomeReport['operation'],
  reason: string,
): RealtimeRuntimeOutcomeReport {
  return Object.freeze({
    status: 'failed',
    operation,
    reason,
  })
}

function boundedRuntimeOutcome(
  outcome: RealtimeRuntimeOutcome,
  fallbackOperation: RealtimeRuntimeOutcomeReport['operation'],
  fallbackReason: string,
): RealtimeRuntimeOutcomeReport {
  try {
    return Object.freeze({
      status: outcome.status,
      operation: outcome.operation,
      reason: outcome.reason,
    })
  } catch {
    return failedRuntimeOutcome(fallbackOperation, fallbackReason)
  }
}

function createNonthrowingOutcomeReporter(
  bridge: Pick<MirrorBridge, 'reportRealtimeRuntimeOutcome'>,
): (report: RealtimeRuntimeOutcomeReport) => void {
  return (report): void => {
    try {
      void Promise.resolve(bridge.reportRealtimeRuntimeOutcome(report)).catch(() => undefined)
    } catch {
      // Reporting cannot change runtime ownership or create a rejection.
    }
  }
}

export function subscribeMirrorRealtimeRuntime(
  bridge: Pick<
    MirrorBridge,
    | 'requestRealtimeClientSecret'
    | 'reportRealtimeRuntimeOutcome'
    | 'onRealtimeRuntimeCommand'
    | 'onInterrupt'
  >,
  owner: MirrorRealtimeRuntimeOwner,
): () => void {
  let disposed = false
  let commandUnsubscribe: (() => void) | undefined
  let interruptUnsubscribe: (() => void) | undefined

  const report = createNonthrowingOutcomeReporter(bridge)

  const reportFailure = (
    operation: RealtimeRuntimeOutcomeReport['operation'],
    reason: string,
  ): void => {
    report(failedRuntimeOutcome(operation, reason))
  }

  const invokeOwner = (
    operation: RealtimeRuntimeOutcomeReport['operation'],
    invoke: () => Promise<RealtimeRuntimeOutcome>,
    failureReason: string,
    reportAfterDispose = false,
  ): void => {
    if (disposed && !reportAfterDispose) return

    let result: Promise<RealtimeRuntimeOutcome>
    try {
      result = invoke()
    } catch {
      if (!disposed || reportAfterDispose) reportFailure(operation, failureReason)
      return
    }

    void Promise.resolve(result).then(
      (outcome) => {
        if (!disposed || reportAfterDispose) {
          report(boundedRuntimeOutcome(outcome, operation, failureReason))
        }
      },
      () => {
        if (!disposed || reportAfterDispose) reportFailure(operation, failureReason)
      },
    )
  }

  const invokeWithCredential = (
    operation: 'start' | 'rollover',
    failureReason: 'start_failed' | 'rollover_failed',
  ): void => {
    if (disposed) return

    let request: Promise<TransientRealtimeSecretResult>
    try {
      request = bridge.requestRealtimeClientSecret()
    } catch {
      reportFailure(operation, 'credential_request_failed')
      return
    }

    void Promise.resolve(request).then(
      (result) => {
        if (disposed) return

        try {
          if (result.status === 'rejected') {
            reportFailure(operation, result.reason)
            return
          }
          if (result.status !== 'accepted') {
            reportFailure(operation, 'credential_request_failed')
            return
          }

          invokeOwner(
            operation,
            () => owner[operation](result.value),
            failureReason,
          )
        } catch {
          if (!disposed) reportFailure(operation, 'credential_request_failed')
        }
      },
      () => {
        if (!disposed) reportFailure(operation, 'credential_request_failed')
      },
    )
  }

  const onCommand = (command: RealtimeRuntimeCommand): void => {
    if (disposed) return

    switch (command.operation) {
      case 'start':
        invokeWithCredential('start', 'start_failed')
        return
      case 'rollover':
        invokeWithCredential('rollover', 'rollover_failed')
        return
      case 'stop':
        invokeOwner('stop', () => owner.stop('stop'), 'stop_failed')
        return
    }
  }

  const onInterrupt = (): void => {
    if (disposed) return
    invokeOwner('interrupt', () => owner.interrupt(), 'interrupt_failed')
  }

  const safeUnsubscribe = (unsubscribe: (() => void) | undefined): void => {
    try {
      unsubscribe?.()
    } catch {
      // Listener removal is best effort; terminal disposal still continues.
    }
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true

    const registeredCommandUnsubscribe = commandUnsubscribe
    commandUnsubscribe = undefined
    safeUnsubscribe(registeredCommandUnsubscribe)

    const registeredInterruptUnsubscribe = interruptUnsubscribe
    interruptUnsubscribe = undefined
    safeUnsubscribe(registeredInterruptUnsubscribe)

    invokeOwner('dispose', () => owner.dispose(), 'dispose_failed', true)
  }

  try {
    const registeredCommandUnsubscribe = bridge.onRealtimeRuntimeCommand(onCommand)
    if (disposed) {
      safeUnsubscribe(registeredCommandUnsubscribe)
      return dispose
    }
    commandUnsubscribe = registeredCommandUnsubscribe

    const registeredInterruptUnsubscribe = bridge.onInterrupt(onInterrupt)
    if (disposed) {
      safeUnsubscribe(registeredInterruptUnsubscribe)
      return dispose
    }
    interruptUnsubscribe = registeredInterruptUnsubscribe
  } catch {
    dispose()
  }

  return dispose
}

function hasMirrorRealtimeRuntimeBridge(
  bridge: typeof window.magicMirror,
): bridge is MirrorBridge {
  if (bridge === undefined) return false

  try {
    const candidate = bridge as Partial<MirrorRealtimeRuntimeBridge>
    return (
      typeof candidate.requestRealtimeClientSecret === 'function' &&
      typeof candidate.reportRealtimeRuntimeOutcome === 'function' &&
      typeof candidate.reportRealtimeMetadata === 'function' &&
      typeof candidate.reportRealtimeFailure === 'function' &&
      typeof candidate.requestSleep === 'function' &&
      typeof candidate.onRealtimeRuntimeCommand === 'function' &&
      typeof candidate.onInterrupt === 'function'
    )
  } catch {
    return false
  }
}

function createBrowserPlaybackScheduler(): PlaybackCompletionScheduler {
  return {
    now: () => performance.now(),
    setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimeout: (handle) => window.clearTimeout(handle),
  }
}

function mapCleanupBoundary(
  boundary: RealtimeRuntimeCleanupBoundary,
): SessionCleanupBoundary {
  return RUNTIME_TO_SESSION_CLEANUP_BOUNDARY[boundary]
}

function createMirrorRuntimeCleanup(
  bridge: MirrorRealtimeMetadataBridge,
  session: RealtimeRuntimeSession | Readonly<RealtimeSessionIdentity>,
): RealtimeRuntimeCleanup {
  const transcriptBuffer = new TranscriptBuffer({
    realtimeSessionId: session.realtimeSessionId,
    maxEntries: REALTIME_TRANSCRIPT_BUFFER_MAX_ENTRIES,
    eventSink: (event) => reportMirrorRealtimeMetadata(bridge, 'transcript', event),
  })
  const cleanup = createSessionCleanup({
    currentRealtimeSessionId: session.realtimeSessionId,
    transcriptBuffer,
    clearCurrentTranscriptView: () => {
      // The transcript view clear remains local renderer RAM, not bridge metadata.
    },
    metadataSink: (event) => reportMirrorRealtimeMetadata(bridge, 'cleanup', event),
  })

  return Object.freeze({
    run: (boundary: RealtimeRuntimeCleanupBoundary): Promise<void> =>
      cleanup.run(mapCleanupBoundary(boundary)),
  })
}

function createMirrorRealtimeRuntimeOwner(
  bridge: MirrorRealtimeRuntimeBridge,
): RealtimeRuntimeOwner {
  const ignoreDuplicateRuntimeOutcome: RealtimeRuntimeEventSink = () => {
    // subscribeMirrorRealtimeRuntime reports each returned outcome exactly once.
  }

  const reportFailure = (
    failure: Parameters<MirrorBridge['reportRealtimeFailure']>[0],
  ): void => {
    try {
      void Promise.resolve(bridge.reportRealtimeFailure(failure)).catch(() => undefined)
    } catch {
      // Failure visibility cannot create an unhandled rejection or gate setup.
    }
  }

  return createBrowserRealtimeRuntimeOwner({
    eventSink: ignoreDuplicateRuntimeOutcome,
    sessionEventSink: (event) => reportMirrorRealtimeMetadata(bridge, 'session', event),
    micEventSink: (event) => reportMirrorRealtimeMetadata(bridge, 'mic', event),
    createCleanup: (session) => createMirrorRuntimeCleanup(bridge, session),
    onFailure: reportFailure,
    playbackCompletion: {
      scheduler: createBrowserPlaybackScheduler(),
      fallbackAfterMs: REALTIME_PLAYBACK_FALLBACK_AFTER_MS,
      sampleIntervalMs: REALTIME_PLAYBACK_SAMPLE_INTERVAL_MS,
      maxFallbackMs: REALTIME_PLAYBACK_MAX_FALLBACK_MS,
      silenceThreshold: REALTIME_PLAYBACK_SILENCE_THRESHOLD,
      silentSamplesRequired: REALTIME_PLAYBACK_SILENT_SAMPLES_REQUIRED,
      eventSink: (event) => reportMirrorRealtimeMetadata(bridge, 'playback', event),
    },
    onCompletedInputTranscript: async ({ transcript, realtimeSessionId, waitForActualEnd }) => {
      reportMirrorRealtimeMetadata(bridge, 'transcript', {
        status: 'success',
        reason: 'cause=transcript_available',
        realtimeSessionId,
      })
      await requestSleepAfterPlayback({
        transcript,
        waitForActualEnd,
        requestSleep: () => bridge.requestSleep(),
      })
    },
  })
}

export interface MirrorInterruptComposition {
  readonly target: MirrorInterruptTarget
  readonly sink: RealtimeRuntimeEventSink
}

export interface AppProps {
  readonly interruptComposition?: MirrorInterruptComposition
}

const INTERRUPT_FAILED_OUTCOME: RealtimeRuntimeOutcome = Object.freeze({
  status: 'failed',
  operation: 'interrupt',
  reason: 'interrupt_failed',
  attemptedSteps: Object.freeze([]),
  failedSteps: Object.freeze([]),
})

export function subscribeMirrorInterrupt(
  bridge: MirrorInterruptBridge,
  target: MirrorInterruptTarget,
  sink: RealtimeRuntimeEventSink,
): () => void {
  let disposed = false

  const report = (outcome: RealtimeRuntimeOutcome): void => {
    try {
      const result = sink(outcome)
      if (result !== undefined) {
        void Promise.resolve(result).catch(() => undefined)
      }
    } catch {
      // Sink failures must not change interrupt delivery or create a rejection.
    }
  }

  const onInterrupt = (): void => {
    if (disposed) return

    let interruptPromise: Promise<RealtimeRuntimeOutcome>
    try {
      interruptPromise = target.interrupt()
    } catch {
      report(INTERRUPT_FAILED_OUTCOME)
      return
    }

    void Promise.resolve(interruptPromise).then(
      (outcome) => report(outcome),
      () => report(INTERRUPT_FAILED_OUTCOME),
    )
  }

  const unsubscribe = bridge.onInterrupt(onInterrupt)

  return () => {
    if (disposed) return
    disposed = true
    try {
      unsubscribe()
    } catch {
      // Disposal is terminal even if the bridge cannot remove its listener.
    }
  }
}

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

const OFFLINE_LOOP_ASSET_UNAVAILABLE = 'offline_loop_asset_unavailable'
const MAINTENANCE_SCREEN_CLASS = 'screen screen--maintenance'

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

function isRealtimeRendererMetadataStatus(
  value: unknown,
): value is RealtimeRendererMetadataStatus {
  return value === 'success'
    || value === 'degraded'
    || value === 'failed'
    || value === 'info'
}

function invalidMirrorRealtimeMetadataReport(
  kind: RealtimeRendererMetadataKind,
): RealtimeRendererMetadataReport {
  return Object.freeze({
    kind,
    status: 'failed',
    reason: 'metadata_event_invalid',
  })
}

function createMirrorRealtimeMetadataReport(
  kind: RealtimeRendererMetadataKind,
  event: unknown,
): RealtimeRendererMetadataReport {
  try {
    if (!isRecord(event)) return invalidMirrorRealtimeMetadataReport(kind)

    const status = readProperty(event, 'status')
    const reason = readProperty(event, 'reason')
    if (
      !isRealtimeRendererMetadataStatus(status)
      || typeof reason !== 'string'
      || reason.length === 0
    ) {
      return invalidMirrorRealtimeMetadataReport(kind)
    }

    const report: {
      kind: RealtimeRendererMetadataKind
      status: RealtimeRendererMetadataStatus
      reason: string
      durationMs?: number
      sessionId?: string
    } = { kind, status, reason }

    const durationMs = readProperty(event, 'duration_ms')
    if (
      typeof durationMs === 'number'
      && Number.isFinite(durationMs)
      && Number.isSafeInteger(durationMs)
      && durationMs >= 0
      && durationMs <= REALTIME_METADATA_MAX_DURATION_MS
    ) {
      report.durationMs = durationMs
    }

    const realtimeSessionId = readProperty(event, 'realtimeSessionId')
    const sessionId = readProperty(event, 'session_id')
    if (typeof realtimeSessionId === 'string' && realtimeSessionId.length > 0) {
      report.sessionId = realtimeSessionId
    } else if (typeof sessionId === 'string' && sessionId.length > 0) {
      report.sessionId = sessionId
    }

    return Object.freeze(report)
  } catch {
    return invalidMirrorRealtimeMetadataReport(kind)
  }
}

export function reportMirrorRealtimeMetadata(
  bridge: MirrorRealtimeMetadataBridge,
  kind: RealtimeRendererMetadataKind,
  event: unknown,
): void {
  const report = createMirrorRealtimeMetadataReport(kind, event)
  try {
    const result = bridge.reportRealtimeMetadata(report)
    void Promise.resolve(result).catch(() => undefined)
  } catch {
    // Metadata delivery is one-shot and must not gate runtime or create a rejection.
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
      className: MAINTENANCE_SCREEN_CLASS,
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
          src="../mock/offline-loop-v1.mp4"
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

export function App({ interruptComposition }: AppProps = {}): React.JSX.Element {
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

  useEffect(() => {
    const bridge = window.magicMirror
    if (
      bridge === undefined ||
      interruptComposition !== undefined ||
      !hasMirrorRealtimeRuntimeBridge(bridge)
    ) {
      return
    }

    try {
      const owner = createMirrorRealtimeRuntimeOwner(bridge)
      return subscribeMirrorRealtimeRuntime(bridge, owner)
    } catch {
      // Setup failure must not gate the existing snapshot or fallback UI path.
      return
    }
  }, [interruptComposition])

  useEffect(() => {
    const bridge = window.magicMirror
    if (
      bridge === undefined ||
      interruptComposition === undefined ||
      !('onInterrupt' in bridge)
    ) {
      return
    }

    return subscribeMirrorInterrupt(
      bridge,
      interruptComposition.target,
      interruptComposition.sink,
    )
  }, [interruptComposition])

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

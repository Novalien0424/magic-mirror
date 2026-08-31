import { useEffect, useRef, useState } from 'react'
import type {
  AvatarRuntimeSnapshot,
  MirrorBridge,
  RealtimeRendererMetadataKind,
  RealtimeRendererMetadataReport,
  RealtimeRendererMetadataStatus,
  RealtimeRuntimeCommand,
  RealtimeRuntimeOutcomeReport,
  RealtimeSessionIdentity,
  TransientRealtimeSecretResult,
} from '../../shared/bridge'
import type { AppSnapshot, LifecycleState, SceneActionCommandContext, SceneRunResult } from '../../shared/types'
import { createBrowserRealtimeRuntimeOwner } from '../realtime/realtime-runtime-dependencies'
import { createSceneTranscriptController, type SceneTranscriptDecision } from './scene-transcript-controller'
import {
  createSceneVisualController,
  type SceneVisualController,
  type SceneVisualMedia,
} from './scene-visual-controller'
import type { PlaybackCompletionScheduler } from '../realtime/playback-completion'
import { createSessionCleanup, type SessionCleanupBoundary } from '../realtime/session-cleanup'
import { TranscriptBuffer } from '../realtime/transcript-buffer'
import type {
  RealtimeRuntimeCleanup,
  RealtimeRuntimeCleanupBoundary,
  RealtimeRuntimeEventSink,
  RealtimeRuntimeOutcome,
  RealtimeRuntimeOwner,
  RealtimeRuntimeSession,
} from '../realtime/realtime-runtime-owner'
import { AvatarCanvas } from '../avatar/AvatarCanvas'
import {
  projectAvatarState,
  type AvatarConversationState,
} from '../avatar/avatar-state'
import type { CubismAvatarRenderer } from '../avatar/cubism-avatar'
import {
  createAvatarAudioCoordinator,
  type AvatarAudioActivity,
  type AvatarAudioCoordinator,
} from '../avatar/audio/avatar-audio-coordinator'
import type { RealtimeAudioOutput } from '../realtime/realtime-audio-output'
import {
  createAvatarMediaController,
  type AvatarMediaController,
  type AvatarMediaSnapshot,
} from '../avatar/audio/avatar-media-controller'

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
  | 'reportAvatarRuntime'
  | 'getSceneCatalog'
  | 'triggerScene'
  | 'stopScene'
  | 'onSceneStatus'
  | 'onAvatarControl'
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
  beforeInterrupt?: () => void,
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
    try {
      beforeInterrupt?.()
    } catch {
      // Avatar stop-sync cannot block Realtime interruption.
    }
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
      typeof candidate.reportAvatarRuntime === 'function' &&
      typeof candidate.getSceneCatalog === 'function' &&
      typeof candidate.triggerScene === 'function' &&
      typeof candidate.stopScene === 'function' &&
      typeof candidate.onSceneStatus === 'function' &&
      typeof candidate.onAvatarControl === 'function' &&
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
  avatarAudio: {
    readonly onOutputAvailable: (output: RealtimeAudioOutput) => void
    readonly onOutputDisposed: (output: RealtimeAudioOutput) => void
    readonly onActivity: (activity: AvatarAudioActivity) => void
  },
  onQaTranscriptHandler?: (
    handler: ((input: {
      transcript: string
      realtimeSessionId: string
      turnId?: string
    }) => Promise<SceneTranscriptDecision>) | null,
  ) => void,
): Readonly<{ owner: RealtimeRuntimeOwner; disposeSceneStatus: () => void }> {
  let owner: RealtimeRuntimeOwner
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

  const sceneTranscript = createSceneTranscriptController({
    bridge,
    interrupt: async () => owner.interrupt(),
    metadataSink: (reason, realtimeSessionId) => reportMirrorRealtimeMetadata(bridge, 'transcript', {
      status: reason === 'transcript_available' ? 'success' : 'info',
      reason: `cause=${reason}`,
      realtimeSessionId,
    }),
  })
  const disposeSceneStatus = bridge.onSceneStatus((event) => sceneTranscript.handleStatus(event))
  const handleQaTranscript = async (input: {
    transcript: string
    realtimeSessionId: string
    turnId?: string
  }): Promise<SceneTranscriptDecision> => {
    const itemId = `qa-${input.turnId ?? 'turn'}`
    sceneTranscript.handleInputItemCreated(itemId, input.turnId)
    return sceneTranscript.handleCompletedTranscript({
      itemId,
      transcript: input.transcript,
      realtimeSessionId: input.realtimeSessionId,
    })
  }

  owner = createBrowserRealtimeRuntimeOwner({
    eventSink: ignoreDuplicateRuntimeOutcome,
    sessionEventSink: (event) => reportMirrorRealtimeMetadata(bridge, 'session', event),
    micEventSink: (event) => reportMirrorRealtimeMetadata(bridge, 'mic', event),
    createCleanup: (session) => createMirrorRuntimeCleanup(bridge, session),
    onFailure: reportFailure,
    onAudioOutputAvailable: avatarAudio.onOutputAvailable,
    onAudioOutputDisposed: avatarAudio.onOutputDisposed,
    onAudioActivity: avatarAudio.onActivity,
    playbackCompletion: {
      scheduler: createBrowserPlaybackScheduler(),
      fallbackAfterMs: REALTIME_PLAYBACK_FALLBACK_AFTER_MS,
      sampleIntervalMs: REALTIME_PLAYBACK_SAMPLE_INTERVAL_MS,
      maxFallbackMs: REALTIME_PLAYBACK_MAX_FALLBACK_MS,
      silenceThreshold: REALTIME_PLAYBACK_SILENCE_THRESHOLD,
      silentSamplesRequired: REALTIME_PLAYBACK_SILENT_SAMPLES_REQUIRED,
      eventSink: (event) => reportMirrorRealtimeMetadata(bridge, 'playback', event),
    },
    onReturnToDormant: () => bridge.requestSleep(),
    onInputItemCreated: ({ itemId }) => sceneTranscript.handleInputItemCreated(itemId),
    onCompletedInputTranscript: async (input) => {
      reportMirrorRealtimeMetadata(bridge, 'transcript', {
        status: 'success', reason: 'cause=transcript_available', realtimeSessionId: input.realtimeSessionId,
      })
      await sceneTranscript.handleCompletedTranscript(input)
    },
  })
  onQaTranscriptHandler?.(handleQaTranscript)
  return Object.freeze({ owner, disposeSceneStatus })
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
  const [conversationState, setConversationState] = useState<AvatarConversationState>('listening')
  const [avatarFallbackInjected, setAvatarFallbackInjected] = useState(false)
  const avatarRendererRef = useRef<CubismAvatarRenderer | null>(null)
  const realtimeRuntimeOwnerRef = useRef<RealtimeRuntimeOwner | null>(null)
  const phase4QaTranscriptHandlerRef = useRef<Parameters<NonNullable<Parameters<typeof createMirrorRealtimeRuntimeOwner>[2]>>[0]>(null)
  const pendingSceneMotionRef = useRef(new Map<string, SceneActionCommandContext>())
  const pendingSceneMusicRef = useRef<SceneActionCommandContext | null>(null)
  const avatarAudioOutputRef = useRef<RealtimeAudioOutput | null>(null)
  const avatarMediaControllerRef = useRef<AvatarMediaController | null>(null)
  const sceneVisualControllerRef = useRef<SceneVisualController | null>(null)
  const sceneVisualHostRef = useRef<HTMLDivElement | null>(null)
  const presentedSceneVisualRef = useRef<SceneVisualMedia | null>(null)
  const avatarMetricsRef = useRef<AvatarRuntimeSnapshot>({
    status: 'not_ready',
    reason: 'avatar_renderer_not_ready',
    state: 'Dormant',
    fps: 0,
    waveform: 0,
    mouthOpen: 0,
    audioUnderruns: 0,
    voiceGain: 1,
    musicGain: 1,
  })

  const reportAvatarRuntime = (patch: Partial<AvatarRuntimeSnapshot>): void => {
    const next = Object.freeze({ ...avatarMetricsRef.current, ...patch })
    avatarMetricsRef.current = next
    const bridge = window.magicMirror
    if (bridge !== undefined && 'reportAvatarRuntime' in bridge) {
      try { bridge.reportAvatarRuntime(next) } catch { /* reporting cannot gate rendering */ }
    }
  }
  const reportSceneAction = (
    context: SceneActionCommandContext,
    status: 'acknowledged' | 'completed' | 'failed' | 'timeout',
    errorCode?: string,
  ): void => {
    const bridge = window.magicMirror
    if (bridge === undefined || !('reportSceneAction' in bridge)) return
    bridge.reportSceneAction({
      ...context,
      status,
      ...(errorCode === undefined ? {} : { errorCode }),
    })
  }
  const avatarAudioCoordinatorRef = useRef<AvatarAudioCoordinator | null>(null)
  const ensureAvatarAudioCoordinator = (): AvatarAudioCoordinator => {
    if (avatarAudioCoordinatorRef.current !== null) return avatarAudioCoordinatorRef.current
    const coordinator = createAvatarAudioCoordinator({
      onConversationState: setConversationState,
      onMouthOpen: (value) => reportAvatarRuntime({ mouthOpen: value, waveform: value }),
      eventSink: (event) => {
        reportAvatarRuntime({ status: 'degraded', reason: event.reason })
      },
    })
    avatarAudioCoordinatorRef.current = coordinator
    return coordinator
  }
  ensureAvatarAudioCoordinator()
  const view = projectMirrorSnapshot(snapshot)
  const avatarState = projectAvatarState({
    lifecycle: view.state,
    conversation: conversationState,
  })
  const avatarStateRef = useRef(avatarState)
  avatarStateRef.current = avatarState

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
    const coordinator = ensureAvatarAudioCoordinator()
    let media: AvatarMediaController
    try {
      media = createAvatarMediaController({
        onRecordedOutput: (output) => {
          coordinator.setAudioOutput(output ?? avatarAudioOutputRef.current)
          if (output !== null) avatarRendererRef.current?.setState('Speaking')
          else if (avatarStateRef.current !== null) avatarRendererRef.current?.setState(avatarStateRef.current)
        },
        onActivity: (activity) => coordinator?.handleActivity(activity),
        onChanged: (metrics: AvatarMediaSnapshot) => reportAvatarRuntime(metrics),
        eventSink: (reason) => {
          reportAvatarRuntime({ status: 'degraded', reason })
          const bridge = window.magicMirror
          if (bridge !== undefined && 'reportRealtimeMetadata' in bridge) {
            bridge.reportRealtimeMetadata({ kind: 'avatar', status: 'degraded', reason })
          }
          const context = pendingSceneMusicRef.current
          if (context !== null) {
            if (reason === 'avatar_music_started') {
              pendingSceneMusicRef.current = null
              reportSceneAction(context, 'acknowledged')
            } else if (reason === 'avatar_music_stopped' || reason === 'avatar_music_fade_completed') {
              pendingSceneMusicRef.current = null
              reportSceneAction(context, 'completed')
            } else if (reason.startsWith('avatar_music_play_failed') || reason === 'avatar_music_analyser_inactive') {
              pendingSceneMusicRef.current = null
              reportSceneAction(context, 'failed', 'avatar_music_action_failed')
            }
          }
        },
      })
    } catch {
      reportAvatarRuntime({ status: 'degraded', reason: 'avatar_audio_graph_unavailable' })
      return
    }
    avatarMediaControllerRef.current = media
    reportAvatarRuntime(media.snapshot())
    return () => {
      media.dispose()
      if (avatarMediaControllerRef.current === media) avatarMediaControllerRef.current = null
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
      const coordinator = ensureAvatarAudioCoordinator()
      const sceneRuntime = createMirrorRealtimeRuntimeOwner(bridge, {
        onOutputAvailable: (output) => {
          avatarAudioOutputRef.current = output
          avatarMediaControllerRef.current?.setRealtimeOutput(output)
          coordinator?.setAudioOutput(output)
        },
        onOutputDisposed: (output) => {
          if (avatarAudioOutputRef.current !== output) return
          avatarAudioOutputRef.current = null
          avatarMediaControllerRef.current?.setRealtimeOutput(null)
          coordinator?.setAudioOutput(null)
        },
        onActivity: (activity) => {
          if (activity === 'interrupted') {
            coordinator.handleActivity(activity)
            avatarMediaControllerRef.current?.handleActivity(activity)
          } else {
            avatarMediaControllerRef.current?.handleActivity(activity)
            coordinator.handleActivity(activity)
          }
        },
      }, (handler) => { phase4QaTranscriptHandlerRef.current = handler })
      const owner = sceneRuntime.owner
      realtimeRuntimeOwnerRef.current = owner
      const unsubscribe = subscribeMirrorRealtimeRuntime(
        bridge,
        owner,
        () => {
          coordinator.handleActivity('interrupted')
          avatarMediaControllerRef.current?.handleActivity('interrupted')
        },
      )
      return () => {
        unsubscribe()
        sceneRuntime.disposeSceneStatus()
        phase4QaTranscriptHandlerRef.current = null
        if (realtimeRuntimeOwnerRef.current === owner) realtimeRuntimeOwnerRef.current = null
      }
    } catch {
      // Setup failure must not gate the existing snapshot or fallback UI path.
      return
    }
  }, [interruptComposition])

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('phase4Qa') !== '1') return
    const qaWindow = window as typeof window & {
      magicMirrorPhase4Qa?: Readonly<{
        injectFinalTranscript: (transcript: string, turnId: string) => Promise<unknown>
        injectFinalTranscriptStart: (transcript: string, turnId: string) => Promise<unknown>
      }>
    }
    const startTranscript = async (transcript: string, turnId: string): Promise<SceneTranscriptDecision> => {
      if (
        typeof transcript !== 'string'
        || transcript.length === 0
        || transcript.length > 1000
        || typeof turnId !== 'string'
        || !/^[A-Za-z0-9._:-]{1,64}$/.test(turnId)
      ) return { decision: 'failed', reason: 'qa_transcript_invalid' }
      const handler = phase4QaTranscriptHandlerRef.current
      if (handler === null) return { decision: 'failed', reason: 'qa_transcript_handler_not_ready' }
      return handler({ transcript, turnId, realtimeSessionId: 'phase4-qa-session' })
    }
    qaWindow.magicMirrorPhase4Qa = Object.freeze({
      injectFinalTranscriptStart: startTranscript,
      injectFinalTranscript: async (transcript: string, turnId: string): Promise<unknown> => {
        const bridge = window.magicMirror
        if (bridge === undefined || !('onSceneStatus' in bridge)) {
          return { decision: 'failed', reason: 'qa_scene_status_unavailable' }
        }
        const finished = new Map<string, SceneRunResult>()
        let finishWait: ((result: SceneRunResult) => void) | null = null
        let targetRunId: string | null = null
        const unsubscribe = bridge.onSceneStatus((event) => {
          if (event.type !== 'finished') return
          finished.set(event.result.runId, event.result)
          if (event.result.runId === targetRunId) finishWait?.(event.result)
        })
        try {
          const decision = await startTranscript(transcript, turnId)
          if (decision.decision !== 'triggered' || decision.result.status !== 'accepted') return decision
          targetRunId = decision.result.runId
          const completed = finished.get(targetRunId) ?? await new Promise<SceneRunResult>((resolve, reject) => {
            finishWait = resolve
            window.setTimeout(() => reject(new Error('phase4_qa_scene_status_timeout')), 120_000)
          })
          return { ...decision, result: completed }
        } finally {
          unsubscribe()
        }
      },
    })
    return () => { delete qaWindow.magicMirrorPhase4Qa }
  }, [])

  useEffect(() => {
    const bridge = window.magicMirror
    if (bridge === undefined || !('reportSceneVisual' in bridge)) return
    const visual = createSceneVisualController({
      createImage: () => new Image() as unknown as SceneVisualMedia,
      createVideo: () => document.createElement('video') as unknown as SceneVisualMedia,
      present: (media) => {
        presentedSceneVisualRef.current = media
        const host = sceneVisualHostRef.current
        if (host !== null) host.replaceChildren(...(media === null ? [] : [media as unknown as Node]))
      },
      report: (report) => bridge.reportSceneVisual(report),
      setVideoAudio: (media, gain) => avatarMediaControllerRef.current?.setSceneVideoAudio(
        media as unknown as HTMLVideoElement | null,
        gain,
      ),
    })
    sceneVisualControllerRef.current = visual
    return () => {
      visual.dispose()
      presentedSceneVisualRef.current = null
      if (sceneVisualControllerRef.current === visual) sceneVisualControllerRef.current = null
    }
  }, [])

  useEffect(() => {
    avatarMediaControllerRef.current?.setLifecycle(view.state)
    if (view.state !== 'active') {
      sceneVisualControllerRef.current?.handleCommand({
        type: 'scene_visual', action: 'stop', runId: 'all', sceneId: 'all',
      })
    }
    if (avatarState !== null) reportAvatarRuntime({ state: avatarState })
    else if (view.state === 'offlineLoop') reportAvatarRuntime({ state: 'OfflineLoop' })
  }, [avatarState, view.state])

  useEffect(() => {
    const bridge = window.magicMirror
    if (bridge === undefined || !('onAvatarControl' in bridge)) return
    return bridge.onAvatarControl((command) => {
      if (command.type === 'asset_failure') {
        const injected = command.action === 'inject'
        setAvatarFallbackInjected(injected)
        reportAvatarRuntime({
          status: injected || avatarRendererRef.current === null ? 'degraded' : 'ready',
          reason: injected
            ? 'avatar_asset_failure_injected'
            : avatarRendererRef.current === null
              ? 'avatar_renderer_not_ready'
              : 'avatar_asset_failure_injection_cleared',
        })
        return
      }
      if (command.type === 'state') {
        avatarRendererRef.current?.setState(command.state)
        reportAvatarRuntime({ state: command.state, reason: 'avatar_manual_state' })
        return
      }
      if (command.type === 'expression') {
        const renderer = avatarRendererRef.current
        renderer?.setExpression(command.name)
        reportAvatarRuntime({ reason: 'avatar_manual_expression' })
        if (command.context !== undefined) {
          reportSceneAction(
            command.context,
            renderer === null ? 'failed' : 'completed',
            renderer === null ? 'avatar_renderer_not_ready' : undefined,
          )
        }
        return
      }
      if (command.type === 'motion') {
        if (command.context !== undefined) pendingSceneMotionRef.current.set(command.group, command.context)
        const started = avatarRendererRef.current?.playMotion(command.group) ?? false
        if (!started && command.context !== undefined) {
          pendingSceneMotionRef.current.delete(command.group)
          reportSceneAction(command.context, 'failed', 'avatar_motion_unavailable')
        }
        reportAvatarRuntime({
          reason: started ? `avatar_motion_dispatched:${command.group}` : 'avatar_motion_unavailable',
          status: started ? 'ready' : 'degraded',
        })
        return
      }
      if (command.type === 'scene_dialogue') {
        const result = realtimeRuntimeOwnerRef.current?.speakVerbatim(command.text)
        const status = result?.status ?? 'ignored'
        const reason = result?.reason ?? 'no_active_realtime_session'
        reportSceneAction(
          command.context,
          status === 'dispatched' ? 'acknowledged' : 'failed',
          status === 'dispatched' ? undefined : reason,
        )
        reportAvatarRuntime({
          status: status === 'dispatched' ? 'ready' : 'degraded',
          reason,
        })
        return
      }
      if (command.type === 'scene_music' && command.context !== undefined) {
        pendingSceneMusicRef.current = command.context
      }
      if (command.type === 'scene_visual') {
        sceneVisualControllerRef.current?.handleCommand(command)
        return
      }
      reportAvatarRuntime({ reason: `avatar_${command.type}_command_received` })
      avatarMediaControllerRef.current?.handleCommand(command)
    })
  }, [])

  useEffect(() => () => {
    avatarAudioCoordinatorRef.current?.dispose()
    avatarAudioCoordinatorRef.current = null
    avatarAudioOutputRef.current = null
  }, [])

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

  if (avatarState !== null) {
    return (
      <>
        <AvatarCanvas
          state={avatarState}
          forceFallback={avatarFallbackInjected}
          onRenderer={(renderer) => {
          avatarRendererRef.current = renderer
          ensureAvatarAudioCoordinator().setRenderer(renderer)
          }}
          onEvent={(event) => {
          reportAvatarRuntime({
            status: event.status === 'ready' ? 'ready' : event.status,
            reason: event.reason,
          })
          const bridge = window.magicMirror
          if (bridge !== undefined && 'reportRealtimeMetadata' in bridge) {
            bridge.reportRealtimeMetadata({
              kind: 'avatar',
              status: event.status === 'ready' ? 'success' : event.status,
              reason: event.reason,
            })
          }
          if (event.reason.startsWith('avatar_motion_completed:')) {
            const group = event.reason.slice('avatar_motion_completed:'.length)
            const context = pendingSceneMotionRef.current.get(group)
            if (context !== undefined) {
              pendingSceneMotionRef.current.delete(group)
              reportSceneAction(context, 'completed')
            }
          }
          if (event.reason.startsWith('avatar_motion_started:')) {
            const group = event.reason.slice('avatar_motion_started:'.length)
            const context = pendingSceneMotionRef.current.get(group)
            if (context !== undefined) {
              pendingSceneMotionRef.current.delete(group)
              reportSceneAction(context, 'acknowledged')
            }
          }
          }}
          onMetrics={(metrics) => {
          reportAvatarRuntime({
            state: metrics.state,
            fps: Math.max(0, Math.min(240, metrics.fps)),
            mouthOpen: metrics.mouthOpen,
          })
          }}
        />
        <div
          className="scene-visual"
          aria-hidden="true"
          ref={(host) => {
            sceneVisualHostRef.current = host
            const media = presentedSceneVisualRef.current
            if (host !== null && media !== null) host.replaceChildren(media as unknown as Node)
          }}
        />
      </>
    )
  }

  return (
    <div className={view.className} data-state={view.state}>
      <p className="screen__title">{view.title}</p>
      <p className="screen__detail">{view.detail}</p>
    </div>
  )
}

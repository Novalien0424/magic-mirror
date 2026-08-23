import {
  REALTIME_ROLLOVER_AFTER_MS,
  RECOVERY_PROBE_DELAYS_MS,
  type RealtimeFailureInput,
} from '../../shared/realtime-recovery'

export { REALTIME_ROLLOVER_AFTER_MS }

type MaybePromise<T> = T | Promise<T>

type MetadataRecord = Record<string, unknown>

type SnapshotLike = Readonly<{
  configRevision?: number
  configFingerprint?: string
  modelRoleIds?: Readonly<Record<string, string>>
}>

type RealtimeSessionLike = Readonly<{
  realtimeSessionId: string
  snapshot?: SnapshotLike
  connect?: (options: { apiKey: unknown }) => MaybePromise<void>
}>

interface InternalDependencies {
  lifecycle: {
    get?: () => string
    transition?: (nextState: string) => MaybePromise<void>
  }
  getRealtimeSessionId?: () => string | null | undefined
  getCurrentSession?: () => RealtimeSessionLike | null | undefined
  stopOutput?: () => MaybePromise<void>
  closeSession?: (sessionId: string) => MaybePromise<void>
  releaseMic?: () => MaybePromise<void>
  clearRamSession?: () => MaybePromise<void>
  lightweightProbe?: () => MaybePromise<boolean>
  schedule?: (
    run: () => void | Promise<void>,
    delayMs: number,
  ) => unknown
  cancel?: (handle: unknown) => void
  acquireMic?: () => MaybePromise<unknown>
  getCallerOwnedMediaStream?: () => unknown
  getPublishedSnapshot?: () => SnapshotLike
  mintClientSecret?: (snapshot: SnapshotLike) => MaybePromise<unknown>
  createRealtimeSession?: (input: {
    snapshot: SnapshotLike
    mediaStream: unknown
  }) => RealtimeSessionLike
  setAuthoritativeSession?: (session: RealtimeSessionLike) => MaybePromise<void>
  currentTurnDone?: () => MaybePromise<void>
  playbackCompletion?: () => MaybePromise<{ source?: string }>
  emit?: (event: MetadataRecord) => void
  metadataSink?: (event: MetadataRecord) => void
  now?: () => number
}

export interface RealtimeOutageRecoveryController {
  handleRealtimeFailure(input: RealtimeFailureInput): Promise<MetadataRecord>
  scheduleRecoveryProbes(): void
  manualStart(): Promise<MetadataRecord>
  manualStop(): Promise<MetadataRecord>
  rolloverAtSafeBoundary(): Promise<MetadataRecord>
}

interface AttemptSuccess<T> {
  readonly ok: true
  readonly value: T
}

interface AttemptFailure {
  readonly ok: false
}

type Attempt<T> = AttemptSuccess<T> | AttemptFailure

interface ProbeCycle {
  readonly handles: unknown[]
  readonly completed: Set<number>
  finished: boolean
}

async function attempt<T>(operation: () => MaybePromise<T>): Promise<Attempt<T>> {
  try {
    return { ok: true, value: await operation() }
  } catch (_operationFailure) {
    return { ok: false }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function metadataSnapshot(snapshot: unknown): MetadataRecord {
  if (!isRecord(snapshot)) {
    return {}
  }

  const result: MetadataRecord = {}
  if (typeof snapshot.configRevision === 'number') {
    result.configRevision = snapshot.configRevision
  }
  if (typeof snapshot.configFingerprint === 'string') {
    result.configFingerprint = snapshot.configFingerprint
  }
  if (isRecord(snapshot.modelRoleIds)) {
    const modelRoleIds: Record<string, string> = {}
    for (const [role, modelId] of Object.entries(snapshot.modelRoleIds)) {
      if (typeof modelId === 'string') {
        modelRoleIds[role] = modelId
      }
    }
    result.modelRoleIds = modelRoleIds
  }
  return result
}

function metadataEvent(
  event: string,
  status: string,
  reason: string,
  fields: MetadataRecord = {},
): MetadataRecord {
  return {
    event,
    status,
    reason,
    source: 'runtime',
    ...fields,
  }
}

export function createRealtimeOutageRecoveryController<T extends object>(
  dependencies: T,
): RealtimeOutageRecoveryController {
  const deps = dependencies as unknown as InternalDependencies

  const emit = (event: MetadataRecord): void => {
    const sink = deps.emit ?? deps.metadataSink
    if (sink === undefined) {
      return
    }
    try {
      sink(event)
    } catch (_metadataFailure) {
      // Metadata delivery must never gate the visitor's recovery path.
    }
  }

  const now = (): number => {
    try {
      return deps.now?.() ?? Date.now()
    } catch (_clockFailure) {
      return Date.now()
    }
  }

  const lifecycleState = (): string | undefined => {
    try {
      return deps.lifecycle.get?.()
    } catch (_lifecycleReadFailure) {
      return undefined
    }
  }

  const transition = async (nextState: string): Promise<Attempt<void>> => {
    if (deps.lifecycle.transition === undefined) {
      return { ok: true, value: undefined }
    }
    return attempt(() => deps.lifecycle.transition!(nextState))
  }

  const stopOutput = (): MaybePromise<void> => deps.stopOutput?.() ?? undefined
  const releaseMic = (): MaybePromise<void> => deps.releaseMic?.() ?? undefined
  const clearRamSession = (): MaybePromise<void> =>
    deps.clearRamSession?.() ?? undefined

  const closeSessionById = (sessionId: string): MaybePromise<void> =>
    deps.closeSession?.(sessionId) ?? undefined

  const schedule =
    deps.schedule ??
    ((run: () => void | Promise<void>, delayMs: number): unknown =>
      setTimeout(() => {
        void run()
      }, delayMs))

  const cancel =
    deps.cancel ??
    ((handle: unknown): void => {
      clearTimeout(handle as ReturnType<typeof setTimeout>)
    })

  let probeCycle: ProbeCycle | null = null

  const finishProbeCycle = async (
    cycle: ProbeCycle,
    index: number,
    reason: string,
  ): Promise<void> => {
    if (cycle.finished) {
      return
    }
    cycle.finished = true

    for (let handleIndex = 0; handleIndex < cycle.handles.length; handleIndex += 1) {
      if (handleIndex === index || cycle.completed.has(handleIndex)) {
        continue
      }
      try {
        cancel(cycle.handles[handleIndex])
      } catch (_cancelFailure) {
        emit(
          metadataEvent('recovery_probe', 'failed', 'probe_cancel_failed', {
            probe_delay_ms: RECOVERY_PROBE_DELAYS_MS[handleIndex],
          }),
        )
      }
    }

    if (lifecycleState() === 'offlineLoop') {
      await transition('dormant')
    }
    emit(metadataEvent('recovery_dormant', 'success', reason))
  }

  const runProbe = async (
    cycle: ProbeCycle,
    index: number,
  ): Promise<void> => {
    if (cycle.finished || cycle.completed.has(index)) {
      return
    }
    cycle.completed.add(index)

    let probeResult: Attempt<boolean>
    if (deps.lightweightProbe === undefined) {
      probeResult = { ok: true, value: false }
    } else {
      probeResult = await attempt(() => deps.lightweightProbe!())
    }

    const succeeded = probeResult.ok && probeResult.value === true
    emit(
      metadataEvent(
        'recovery_probe',
        succeeded ? 'success' : probeResult.ok ? 'failed' : 'failed',
        succeeded ? 'probe_passed' : 'probe_failed',
        { probe_delay_ms: RECOVERY_PROBE_DELAYS_MS[index] },
      ),
    )

    if (succeeded) {
      await finishProbeCycle(cycle, index, 'recovery_probe_succeeded')
      return
    }

    if (index === RECOVERY_PROBE_DELAYS_MS.length - 1) {
      await finishProbeCycle(cycle, index, 'recovery_probes_exhausted')
    }
  }

  const scheduleRecoveryProbes = (): void => {
    if (lifecycleState() !== 'offlineLoop') {
      emit(
        metadataEvent('recovery_probe', 'info', 'recovery_not_in_offline_loop'),
      )
      return
    }
    if (probeCycle !== null && !probeCycle.finished) {
      return
    }

    const cycle: ProbeCycle = {
      handles: [],
      completed: new Set<number>(),
      finished: false,
    }
    probeCycle = cycle

    for (let index = 0; index < RECOVERY_PROBE_DELAYS_MS.length; index += 1) {
      try {
        const handle = schedule(
          () => runProbe(cycle, index),
          RECOVERY_PROBE_DELAYS_MS[index],
        )
        cycle.handles.push(handle)
      } catch (_scheduleFailure) {
        cycle.handles.push(undefined)
        emit(
          metadataEvent('recovery_probe', 'failed', 'probe_schedule_failed', {
            probe_delay_ms: RECOVERY_PROBE_DELAYS_MS[index],
          }),
        )
      }
    }
  }

  const realtimeSessionId = (): string | null | undefined => {
    try {
      return deps.getRealtimeSessionId?.()
    } catch (_sessionIdReadFailure) {
      return undefined
    }
  }

  const handleRealtimeFailure = async (
    input: RealtimeFailureInput,
  ): Promise<MetadataRecord> => {
    const authoritativeId = realtimeSessionId()
    if (authoritativeId !== input.realtimeSessionId) {
      const staleEvent = metadataEvent(
        'realtime_failure_entered',
        'info',
        'stale_realtime_session',
        {
          session_id: input.realtimeSessionId,
          failure_kind: input.kind,
        },
      )
      emit(staleEvent)
      return staleEvent
    }

    const failureEvent = metadataEvent(
      'realtime_failure_entered',
      'degraded',
      input.reason,
      {
        session_id: input.realtimeSessionId,
        failure_kind: input.kind,
      },
    )
    emit(failureEvent)

    const cleanupFailures: string[] = []
    const stopResult = await attempt(stopOutput)
    if (!stopResult.ok) {
      cleanupFailures.push('stop_output_failed')
    }

    const closeResult = await attempt(() =>
      closeSessionById(input.realtimeSessionId),
    )
    if (!closeResult.ok) {
      cleanupFailures.push('session_close_failed')
    }

    const releaseResult = await attempt(releaseMic)
    if (!releaseResult.ok) {
      cleanupFailures.push('mic_handoff_failed')
    }

    const clearResult = await attempt(clearRamSession)
    if (!clearResult.ok) {
      cleanupFailures.push('ram_session_clear_failed')
    }

    if (!releaseResult.ok) {
      const maintenanceEvent = metadataEvent(
        'realtime_cleanup_failed',
        'failed',
        'mic_handoff_failed',
        {
          classification: 'Maintenance',
          session_id: input.realtimeSessionId,
          failure_kind: input.kind,
        },
      )
      emit(maintenanceEvent)
      await transition('maintenance')
      return maintenanceEvent
    }

    if (cleanupFailures.length > 0) {
      const cleanupEvent = metadataEvent(
        'realtime_cleanup_failed',
        'failed',
        'realtime_cleanup_failed',
        {
          session_id: input.realtimeSessionId,
          failure_kind: input.kind,
        },
      )
      emit(cleanupEvent)
    }

    await transition('offlineLoop')
    const offlineEvent = metadataEvent('offline_loop_started', 'degraded', input.reason, {
      session_id: input.realtimeSessionId,
      failure_kind: input.kind,
    })
    emit(offlineEvent)
    scheduleRecoveryProbes()
    return offlineEvent
  }

  let manualStartInFlight: Promise<MetadataRecord> | null = null

  const manualStart = (): Promise<MetadataRecord> => {
    if (manualStartInFlight !== null) {
      return manualStartInFlight
    }

    const operation = (async (): Promise<MetadataRecord> => {
      if (lifecycleState() !== 'dormant') {
        const event = metadataEvent(
          'manual_realtime_start',
          'info',
          'manual_start_requires_dormant',
        )
        emit(event)
        return event
      }

      const activating = await transition('activating')
      if (!activating.ok) {
        const event = metadataEvent(
          'manual_realtime_start',
          'failed',
          'manual_start_activation_failed',
        )
        emit(event)
        return event
      }

      let mediaStream: unknown
      const acquireResult = await attempt(() =>
        deps.acquireMic !== undefined
          ? deps.acquireMic!()
          : deps.getCallerOwnedMediaStream?.(),
      )
      if (!acquireResult.ok || acquireResult.value === undefined) {
        const event = metadataEvent(
          'manual_realtime_start',
          'failed',
          'mic_acquisition_failed',
          { classification: 'Maintenance' },
        )
        emit(event)
        await transition('maintenance')
        return event
      }
      mediaStream = acquireResult.value

      let snapshot: SnapshotLike | undefined
      const snapshotResult = await attempt(() => deps.getPublishedSnapshot?.())
      if (snapshotResult.ok) {
        snapshot = snapshotResult.value
      }
      if (snapshot === undefined) {
        await attempt(releaseMic)
        await attempt(clearRamSession)
        const event = metadataEvent(
          'manual_realtime_start',
          'failed',
          'published_snapshot_unavailable',
        )
        emit(event)
        await transition('offlineLoop')
        scheduleRecoveryProbes()
        return event
      }

      const secretResult = await attempt(() =>
        deps.mintClientSecret?.(snapshot!),
      )
      if (!secretResult.ok || secretResult.value === undefined) {
        await attempt(releaseMic)
        await attempt(clearRamSession)
        const event = metadataEvent(
          'manual_realtime_start',
          'failed',
          'client_secret_mint_failed',
        )
        emit(event)
        await transition('offlineLoop')
        scheduleRecoveryProbes()
        return event
      }

      let session: RealtimeSessionLike | undefined
      const createResult = await attempt(() =>
        deps.createRealtimeSession?.({
          snapshot: snapshot!,
          mediaStream,
        }),
      )
      if (createResult.ok) {
        session = createResult.value
      }
      if (session === undefined || typeof session.realtimeSessionId !== 'string') {
        await attempt(releaseMic)
        await attempt(clearRamSession)
        const event = metadataEvent(
          'manual_realtime_start',
          'failed',
          'fresh_session_creation_failed',
        )
        emit(event)
        await transition('offlineLoop')
        scheduleRecoveryProbes()
        return event
      }

      const connectResult =
        session.connect === undefined
          ? ({ ok: false } as Attempt<void>)
          : await attempt(() => session!.connect!({ apiKey: secretResult.value }))
      if (!connectResult.ok) {
        await attempt(() => closeSessionById(session!.realtimeSessionId))
        await attempt(releaseMic)
        await attempt(clearRamSession)
        const event = metadataEvent(
          'manual_realtime_start',
          'failed',
          'realtime_connect_failed',
          { session_id: session.realtimeSessionId },
        )
        emit(event)
        await transition('offlineLoop')
        const offlineEvent = metadataEvent(
          'offline_loop_started',
          'degraded',
          'realtime_connect_failed',
          { session_id: session.realtimeSessionId },
        )
        emit(offlineEvent)
        scheduleRecoveryProbes()
        return event
      }

      const publishResult = await attempt(() =>
        deps.setAuthoritativeSession?.(session!),
      )
      if (!publishResult.ok) {
        await attempt(() => closeSessionById(session!.realtimeSessionId))
        await attempt(releaseMic)
        await attempt(clearRamSession)
        const event = metadataEvent(
          'manual_realtime_start',
          'failed',
          'authoritative_session_publish_failed',
          { session_id: session.realtimeSessionId },
        )
        emit(event)
        await transition('offlineLoop')
        scheduleRecoveryProbes()
        return event
      }

      const active = await transition('active')
      if (!active.ok) {
        const event = metadataEvent(
          'manual_realtime_start',
          'failed',
          'active_state_transition_failed',
          { session_id: session.realtimeSessionId },
        )
        emit(event)
        return event
      }

      const event = metadataEvent(
        'manual_realtime_start',
        'success',
        'manual_start_ready',
        { session_id: session.realtimeSessionId },
      )
      emit(event)
      return event
    })()

    manualStartInFlight = operation.finally(() => {
      manualStartInFlight = null
    })
    return manualStartInFlight
  }

  let manualStopInFlight: Promise<MetadataRecord> | null = null

  const manualStop = (): Promise<MetadataRecord> => {
    if (manualStopInFlight !== null) {
      return manualStopInFlight
    }

    const operation = (async (): Promise<MetadataRecord> => {
      const session = deps.getCurrentSession?.()
      const sessionId = session?.realtimeSessionId ?? realtimeSessionId() ?? undefined
      if (lifecycleState() !== 'active') {
        const event = metadataEvent(
          'manual_realtime_stop',
          'info',
          'manual_stop_requires_active',
          sessionId === undefined ? {} : { session_id: sessionId },
        )
        emit(event)
        return event
      }

      const suspending = await transition('suspending')
      if (!suspending.ok) {
        const event = metadataEvent(
          'manual_realtime_stop',
          'failed',
          'manual_stop_suspending_failed',
          sessionId === undefined ? {} : { session_id: sessionId },
        )
        emit(event)
        return event
      }

      const stopResult = await attempt(stopOutput)
      const closeResult =
        sessionId === undefined
          ? ({ ok: true, value: undefined } as Attempt<void>)
          : await attempt(() => closeSessionById(sessionId))
      const releaseResult = await attempt(releaseMic)
      const clearResult = await attempt(clearRamSession)

      if (!releaseResult.ok) {
        const event = metadataEvent(
          'manual_realtime_stop',
          'failed',
          'mic_handoff_failed',
          {
            classification: 'Maintenance',
            ...(sessionId === undefined ? {} : { session_id: sessionId }),
          },
        )
        emit(event)
        await transition('maintenance')
        return event
      }

      if (!stopResult.ok || !closeResult.ok || !clearResult.ok) {
        const event = metadataEvent(
          'manual_realtime_stop',
          'failed',
          'manual_stop_cleanup_failed',
          sessionId === undefined ? {} : { session_id: sessionId },
        )
        emit(event)
        await transition('maintenance')
        return event
      }

      const dormant = await transition('dormant')
      if (!dormant.ok) {
        const event = metadataEvent(
          'manual_realtime_stop',
          'failed',
          'manual_stop_dormant_transition_failed',
          sessionId === undefined ? {} : { session_id: sessionId },
        )
        emit(event)
        return event
      }

      const event = metadataEvent(
        'manual_realtime_stop',
        'success',
        'manual_stop_completed',
        sessionId === undefined ? {} : { session_id: sessionId },
      )
      emit(event)
      return event
    })()

    manualStopInFlight = operation.finally(() => {
      manualStopInFlight = null
    })
    return manualStopInFlight
  }

  let rolloverInFlight: Promise<MetadataRecord> | null = null

  const rolloverAtSafeBoundary = (): Promise<MetadataRecord> => {
    if (rolloverInFlight !== null) {
      return rolloverInFlight
    }

    const operation = (async (): Promise<MetadataRecord> => {
      const startedAt = now()
      const oldSession = deps.getCurrentSession?.()
      const oldSessionId = oldSession?.realtimeSessionId
      const oldSnapshot = oldSession?.snapshot
      const oldFields = metadataSnapshot(oldSnapshot)

      if (oldSession === null || oldSession === undefined || oldSessionId === undefined) {
        const event = metadataEvent(
          'realtime_rollover',
          'failure',
          'current_session_unavailable',
          oldFields,
        )
        emit(event)
        return event
      }

      const turnResult = await attempt(() => deps.currentTurnDone?.())
      if (!turnResult.ok) {
        const event = metadataEvent(
          'realtime_rollover',
          'failure',
          'turn_boundary_failed',
          {
            oldRealtimeSessionId: oldSessionId,
            ...oldFields,
            durationMs: Math.max(0, now() - startedAt),
          },
        )
        emit(event)
        return event
      }

      let playbackSource: string | undefined
      const playbackResult = await attempt(() => deps.playbackCompletion?.())
      if (playbackResult.ok) {
        playbackSource = playbackResult.value?.source
      }
      if (!playbackResult.ok) {
        const event = metadataEvent(
          'realtime_rollover',
          'failure',
          'playback_boundary_failed',
          {
            oldRealtimeSessionId: oldSessionId,
            ...oldFields,
            durationMs: Math.max(0, now() - startedAt),
          },
        )
        emit(event)
        return event
      }

      const closeForRollover = deps.closeSession as unknown as
        | ((session: RealtimeSessionLike) => MaybePromise<void>)
        | undefined
      const closeResult = await attempt(() =>
        closeForRollover?.(oldSession) ?? undefined,
      )
      if (!closeResult.ok) {
        const event = metadataEvent(
          'realtime_rollover',
          'failure',
          'old_session_close_failed',
          {
            oldRealtimeSessionId: oldSessionId,
            ...oldFields,
            durationMs: Math.max(0, now() - startedAt),
          },
        )
        emit(event)
        return event
      }

      const releaseResult = await attempt(releaseMic)
      if (!releaseResult.ok) {
        const event = metadataEvent(
          'realtime_rollover',
          'failure',
          'mic_handoff_failed',
          {
            classification: 'Maintenance',
            oldRealtimeSessionId: oldSessionId,
            ...oldFields,
            durationMs: Math.max(0, now() - startedAt),
          },
        )
        emit(event)
        return event
      }

      const acquireResult = await attempt(() => deps.acquireMic?.())
      if (!acquireResult.ok || acquireResult.value === undefined) {
        const event = metadataEvent(
          'realtime_rollover',
          'failure',
          'mic_acquisition_failed',
          {
            classification: 'Maintenance',
            oldRealtimeSessionId: oldSessionId,
            ...oldFields,
            durationMs: Math.max(0, now() - startedAt),
          },
        )
        emit(event)
        return event
      }
      const freshMediaStream = acquireResult.value

      const cleanupFreshResources = async (
        freshSession?: RealtimeSessionLike,
      ): Promise<void> => {
        if (freshSession !== undefined) {
          await attempt(() => closeForRollover?.(freshSession))
        }
        await attempt(releaseMic)
      }

      const snapshotResult = await attempt(() => deps.getPublishedSnapshot?.())
      if (!snapshotResult.ok || snapshotResult.value === undefined) {
        await cleanupFreshResources()
        const event = metadataEvent(
          'realtime_rollover',
          'failure',
          'published_snapshot_unavailable',
          {
            oldRealtimeSessionId: oldSessionId,
            ...oldFields,
            durationMs: Math.max(0, now() - startedAt),
          },
        )
        emit(event)
        return event
      }
      const currentSnapshot = snapshotResult.value
      const currentFields = metadataSnapshot(currentSnapshot)

      const secretResult = await attempt(() =>
        deps.mintClientSecret?.(currentSnapshot),
      )
      if (!secretResult.ok || secretResult.value === undefined) {
        await cleanupFreshResources()
        const event = metadataEvent(
          'realtime_rollover',
          'failure',
          'client_secret_mint_failed',
          {
            oldRealtimeSessionId: oldSessionId,
            ...currentFields,
            durationMs: Math.max(0, now() - startedAt),
          },
        )
        emit(event)
        return event
      }

      const createResult = await attempt(() =>
        deps.createRealtimeSession?.({
          snapshot: currentSnapshot,
          mediaStream: freshMediaStream,
        }),
      )
      if (!createResult.ok || createResult.value === undefined) {
        await cleanupFreshResources()
        const event = metadataEvent(
          'realtime_rollover',
          'failure',
          'fresh_session_creation_failed',
          {
            oldRealtimeSessionId: oldSessionId,
            ...currentFields,
            durationMs: Math.max(0, now() - startedAt),
          },
        )
        emit(event)
        return event
      }
      const freshSession = isRecord(createResult.value)
        ? (createResult.value as RealtimeSessionLike)
        : undefined
      if (
        freshSession === undefined ||
        typeof freshSession.realtimeSessionId !== 'string'
      ) {
        await cleanupFreshResources(freshSession)
        const event = metadataEvent(
          'realtime_rollover',
          'failure',
          'fresh_session_identity_missing',
          {
            oldRealtimeSessionId: oldSessionId,
            ...currentFields,
            durationMs: Math.max(0, now() - startedAt),
          },
        )
        emit(event)
        return event
      }

      const connectResult =
        freshSession.connect === undefined
          ? ({ ok: false } as Attempt<void>)
          : await attempt(() =>
              freshSession.connect!({ apiKey: secretResult.value }),
            )
      if (!connectResult.ok) {
        await cleanupFreshResources(freshSession)
        const event = metadataEvent(
          'realtime_rollover',
          'failure',
          'fresh_session_connect_failed',
          {
            oldRealtimeSessionId: oldSessionId,
            ...currentFields,
            durationMs: Math.max(0, now() - startedAt),
          },
        )
        emit(event)
        return event
      }

      const publishResult = await attempt(() =>
        deps.setAuthoritativeSession?.(freshSession),
      )
      if (!publishResult.ok) {
        await cleanupFreshResources(freshSession)
        const event = metadataEvent(
          'realtime_rollover',
          'failure',
          'authoritative_session_publish_failed',
          {
            oldRealtimeSessionId: oldSessionId,
            ...currentFields,
            durationMs: Math.max(0, now() - startedAt),
          },
        )
        emit(event)
        return event
      }

      const event = metadataEvent(
        'realtime_rollover',
        'success',
        'safe_boundary',
        {
          oldRealtimeSessionId: oldSessionId,
          newRealtimeSessionId: freshSession.realtimeSessionId,
          ...currentFields,
          playbackSource,
          count: 1,
          durationMs: Math.max(0, now() - startedAt),
        },
      )
      emit(event)
      return event
    })()

    rolloverInFlight = operation.finally(() => {
      rolloverInFlight = null
    })
    return rolloverInFlight
  }

  return {
    handleRealtimeFailure,
    scheduleRecoveryProbes,
    manualStart,
    manualStop,
    rolloverAtSafeBoundary,
  }
}

export interface Phase1LiveSmokeSnapshot {
  readonly lifecycle: string
}

export type Phase1LiveSmokeStage =
  | 'renderer_ready'
  | 'start'
  | 'active'
  | 'stop'
  | 'dormant'

export type Phase1LiveSmokeModelAvailability = 'available' | 'unavailable' | 'probe_failed'
export type Phase1LiveSmokeProvenance = 'passed' | 'failed'

export interface Phase1LiveSmokeProvenanceSnapshot {
  readonly userDataDir: string
  readonly configVersion: number
  readonly fingerprint: string
  readonly sdkVersion: string
  readonly realtimeDialogue: string
  readonly inputTranscription: string
  readonly memoryExtractor: string
  readonly voice: string
  readonly reasoningEffort: string
  readonly turnDetectionProfile: string
}

const PROVENANCE_FIELDS = Object.freeze([
  'userDataDir',
  'configVersion',
  'fingerprint',
  'sdkVersion',
  'realtimeDialogue',
  'inputTranscription',
  'memoryExtractor',
  'voice',
  'reasoningEffort',
  'turnDetectionProfile',
] as const)

export function matchesPhase1LiveSmokeProvenance(
  expected: unknown,
  actual: Phase1LiveSmokeProvenanceSnapshot,
): boolean {
  if (typeof expected !== 'object' || expected === null || Array.isArray(expected)) return false
  const candidate = expected as Record<string, unknown>
  if (Object.keys(candidate).length !== PROVENANCE_FIELDS.length) return false
  return PROVENANCE_FIELDS.every((field) => candidate[field] === actual[field])
}

export interface Phase1LiveSmokeResult {
  readonly status: 'passed' | 'failed'
  readonly exit: 0 | 1
  readonly stage: Phase1LiveSmokeStage
  readonly reason: string
  readonly duration_ms: number
  readonly modelAvailability: Phase1LiveSmokeModelAvailability
  readonly provenance: Phase1LiveSmokeProvenance
}

export interface Phase1LiveSmokeCoordinator {
  start(): void
  onMirrorRendererReady(): void
}

export interface Phase1LiveSmokeCoordinatorOptions {
  readonly getSnapshot: () => Phase1LiveSmokeSnapshot
  readonly getLastRealtimeRuntimeOutcomeReason?: () => string | null
  readonly subscribe: (listener: (snapshot: Phase1LiveSmokeSnapshot) => void) => { unsubscribe(): void }
  readonly checkProvenance?: () => boolean | Promise<boolean>
  readonly probeConfiguredModelAvailability?: () => Promise<unknown>
  readonly manualStart: () => Promise<Record<string, unknown>>
  readonly manualStop: () => Promise<Record<string, unknown>>
  readonly emitResult: (result: Phase1LiveSmokeResult) => void
  readonly stageTimeoutMs?: number
  readonly now?: () => number
  readonly scheduleTimeout?: (callback: () => void, delayMs: number) => unknown
  readonly clearScheduledTimeout?: (handle: unknown) => void
}

const MODEL_AVAILABILITY_PROBE_TIMEOUT_MS = 5_000

export function createPhase1LiveSmokeCoordinator(
  options: Phase1LiveSmokeCoordinatorOptions,
): Phase1LiveSmokeCoordinator {
  const stageTimeoutMs = Number.isFinite(options.stageTimeoutMs) && (options.stageTimeoutMs ?? 0) > 0
    ? Math.max(1, Math.floor(options.stageTimeoutMs ?? 0))
    : 60_000
  const now = options.now ?? (() => Date.now())
  const scheduleTimeout = options.scheduleTimeout
    ?? ((callback: () => void, delayMs: number): unknown => setTimeout(callback, delayMs))
  const clearScheduledTimeout = options.clearScheduledTimeout
    ?? ((handle: unknown): void => clearTimeout(handle as ReturnType<typeof setTimeout>))

  let started = false
  let initialized = false
  let finished = false
  let rendererReady = false
  let startTime = 0
  let stage: Phase1LiveSmokeStage = 'renderer_ready'
  let timeoutHandle: unknown = null
  let subscription: { unsubscribe(): void } | null = null
  let modelAvailability: Phase1LiveSmokeModelAvailability = 'probe_failed'
  let provenance: Phase1LiveSmokeProvenance = options.checkProvenance === undefined ? 'passed' : 'failed'
  let modelProbePending = false
  let modelProbeTimeoutHandle: unknown = null
  let modelProbeWaiter: Promise<void> | null = null
  let resolveModelProbe: (() => void) | null = null

  function safeNow(): number {
    try {
      const value = now()
      return Number.isFinite(value) ? value : Date.now()
    } catch {
      return Date.now()
    }
  }

  function safeReason(value: unknown, fallback: string): string {
    return typeof value === 'string' && /^[a-z][a-z0-9_]{0,95}$/.test(value)
      ? value
      : fallback
  }

  function durationMs(): number {
    return Math.max(0, Math.round(safeNow() - startTime))
  }

  function clearTimeoutHandle(): void {
    if (timeoutHandle === null) return
    try {
      clearScheduledTimeout(timeoutHandle)
    } catch {
      // The result is still emitted once; a timer cleanup failure cannot create
      // a second lifecycle action or expose non-metadata data.
    }
    timeoutHandle = null
  }

  function clearModelProbeTimeoutHandle(): void {
    if (modelProbeTimeoutHandle === null) return
    try {
      clearScheduledTimeout(modelProbeTimeoutHandle)
    } catch {
      // A probe timer cleanup failure cannot alter the fixed enum or lifecycle result.
    }
    modelProbeTimeoutHandle = null
  }

  function isModelAvailability(value: unknown): value is Phase1LiveSmokeModelAvailability {
    return value === 'available' || value === 'unavailable' || value === 'probe_failed'
  }

  function settleModelProbe(value: unknown): void {
    if (!modelProbePending) return
    modelProbePending = false
    modelAvailability = isModelAvailability(value) ? value : 'probe_failed'
    clearModelProbeTimeoutHandle()
    const resolve = resolveModelProbe
    resolveModelProbe = null
    resolve?.()
  }

  function startModelAvailabilityProbe(): void {
    const probe = options.probeConfiguredModelAvailability
    if (probe === undefined) return

    modelProbePending = true
    modelProbeWaiter = new Promise<void>((resolve) => {
      resolveModelProbe = resolve
    })

    let probePromise: Promise<unknown>
    try {
      probePromise = Promise.resolve(probe())
    } catch {
      settleModelProbe('probe_failed')
      return
    }

    void probePromise.then(
      (value) => settleModelProbe(value),
      () => settleModelProbe('probe_failed'),
    )

    let scheduledHandle: unknown
    try {
      scheduledHandle = scheduleTimeout(() => {
        modelProbeTimeoutHandle = null
        settleModelProbe('probe_failed')
      }, MODEL_AVAILABILITY_PROBE_TIMEOUT_MS)
    } catch {
      settleModelProbe('probe_failed')
      return
    }

    if (modelProbePending) {
      modelProbeTimeoutHandle = scheduledHandle
    } else {
      try {
        clearScheduledTimeout(scheduledHandle)
      } catch {
        // A timer created after probe settlement cannot gate the lifecycle result.
      }
    }
  }

  function finish(
    status: Phase1LiveSmokeResult['status'],
    resultStage: Phase1LiveSmokeStage,
    reason: string,
  ): void {
    if (finished) return
    finished = true
    clearTimeoutHandle()
    const currentSubscription = subscription
    subscription = null
    try {
      currentSubscription?.unsubscribe()
    } catch {
      // Listener cleanup is best effort; the terminal result remains visible.
    }
    const exit: Phase1LiveSmokeResult['exit'] = status === 'passed' ? 0 : 1
    const terminalLifecycleResult = Object.freeze({
      status,
      exit,
      stage: resultStage,
      reason: safeReason(reason, 'phase1_live_smoke_failed'),
      duration_ms: durationMs(),
    })
    const emitTerminalResult = (): void => {
      options.emitResult(Object.freeze({
        ...terminalLifecycleResult,
        modelAvailability,
        provenance,
      }))
    }
    if (modelProbePending && modelProbeWaiter !== null) {
      const probeWaiter = modelProbeWaiter
      void probeWaiter.then(emitTerminalResult)
      return
    }
    emitTerminalResult()
  }

  function fail(resultStage: Phase1LiveSmokeStage, reason: string): void {
    finish('failed', resultStage, reason)
  }

  function armTimeout(timeoutReason: string): void {
    clearTimeoutHandle()
    try {
      timeoutHandle = scheduleTimeout(() => {
        timeoutHandle = null
        fail(stage, timeoutReason)
      }, stageTimeoutMs)
    } catch {
      fail(stage, 'timer_setup_failed')
    }
  }

  function setStage(nextStage: Phase1LiveSmokeStage, timeoutReason: string): void {
    stage = nextStage
    armTimeout(timeoutReason)
  }

  function isSuccessfulAction(value: unknown): boolean {
    return typeof value === 'object'
      && value !== null
      && !Array.isArray(value)
      && (value as { status?: unknown }).status === 'success'
  }

  function actionReason(value: unknown, fallback: string): string {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return fallback
    return safeReason((value as { reason?: unknown }).reason, fallback)
  }

  function handleSnapshot(snapshot: Phase1LiveSmokeSnapshot): void {
    if (!started || finished) return

    if (snapshot.lifecycle === 'maintenance') {
      fail(stage, 'lifecycle_maintenance')
      return
    }
    if (snapshot.lifecycle === 'offlineLoop') {
      let reason = 'lifecycle_offline_loop'
      try {
        reason = safeReason(
          options.getLastRealtimeRuntimeOutcomeReason?.(),
          reason,
        )
      } catch {
        // The diagnostic accessor is optional; an accessor failure keeps the
        // established lifecycle marker visible and metadata-only.
      }
      fail(stage, reason)
      return
    }

    if (stage === 'active' && snapshot.lifecycle === 'active') {
      setStage('stop', 'stop_request_timeout')
      void requestStop()
      return
    }
    if (stage === 'dormant' && snapshot.lifecycle === 'dormant') {
      finish('passed', 'dormant', 'completed')
    }
  }

  async function requestStart(): Promise<void> {
    let result: Record<string, unknown>
    try {
      result = await options.manualStart()
    } catch {
      fail('start', 'manual_start_failed')
      return
    }
    if (finished) return
    if (!isSuccessfulAction(result)) {
      fail('start', actionReason(result, 'manual_start_failed'))
      return
    }

    setStage('active', 'active_timeout')
    if (finished) return
    try {
      handleSnapshot(options.getSnapshot())
    } catch {
      fail('active', 'snapshot_unavailable')
    }
  }

  async function requestStop(): Promise<void> {
    let result: Record<string, unknown>
    try {
      result = await options.manualStop()
    } catch {
      fail('stop', 'manual_stop_failed')
      return
    }
    if (finished) return
    if (!isSuccessfulAction(result)) {
      fail('stop', actionReason(result, 'manual_stop_failed'))
      return
    }

    setStage('dormant', 'dormant_timeout')
    if (finished) return
    try {
      handleSnapshot(options.getSnapshot())
    } catch {
      fail('dormant', 'snapshot_unavailable')
    }
  }

  function initializeAfterProvenance(): void {
    if (finished) return
    initialized = true
    startModelAvailabilityProbe()
    if (finished) return
    armTimeout('renderer_ready_timeout')
    if (finished) return

    try {
      const nextSubscription = options.subscribe(handleSnapshot)
      if (finished) {
        try {
          nextSubscription.unsubscribe()
        } catch {
          // The terminal result has already been emitted.
        }
      } else {
        subscription = nextSubscription
      }
    } catch {
      fail('renderer_ready', 'subscription_failed')
      return
    }

    if (finished) return
    try {
      handleSnapshot(options.getSnapshot())
    } catch {
      fail('renderer_ready', 'snapshot_unavailable')
    }

    if (rendererReady) requestStartAfterRendererReady()
  }

  async function verifyProvenance(): Promise<void> {
    const checkProvenance = options.checkProvenance
    if (checkProvenance === undefined) {
      initializeAfterProvenance()
      return
    }

    let matches = false
    try {
      matches = await checkProvenance()
    } catch {
      matches = false
    }
    if (finished) return
    if (!matches) {
      fail('renderer_ready', 'config_provenance_mismatch')
      return
    }
    provenance = 'passed'
    initializeAfterProvenance()
  }

  function start(): void {
    if (started || finished) return
    started = true
    startTime = safeNow()
    void verifyProvenance()
  }

  function requestStartAfterRendererReady(): void {
    if (!started || !initialized || finished || stage !== 'renderer_ready') return
    setStage('start', 'start_request_timeout')
    void requestStart()
  }

  function onMirrorRendererReady(): void {
    rendererReady = true
    requestStartAfterRendererReady()
  }

  return {
    start,
    onMirrorRendererReady,
  }
}

export interface TurnControllerSession {
  readonly realtimeSessionId: string
  interrupt(): void | PromiseLike<void>
}

export interface TurnControllerAudioOutput {
  setVolume(volume: number): void
}

export interface TurnControllerTranscriptEntry {
  readonly itemId: string
  readonly turnId: string
  readonly transcript: string
}

export interface TurnControllerTranscriptBuffer {
  get(itemId: string): TurnControllerTranscriptEntry | undefined
}

export type TurnControllerCallback = () => void | PromiseLike<void>

export type TurnControllerMetadataEventName =
  | 'transcript_unavailable'
  | 'transcript_available'
  | 'interruption_requested'
  | 'interruption_completed'

export type TurnControllerMetadataStatus = 'success' | 'degraded' | 'failed' | 'info'

export interface TurnControllerMetadataEvent {
  readonly [key: string]: unknown
  readonly event: TurnControllerMetadataEventName
  readonly realtimeSessionId: string
  readonly status: TurnControllerMetadataStatus
  readonly reason: string
  readonly duration_ms: number
}

export interface CompletedTranscriptInput {
  readonly realtimeSessionId: string
  readonly itemId: string
  readonly turnId: string
  readonly transcript?: string | PromiseLike<string | undefined>
}

export type TurnControllerEventSink = (
  event: TurnControllerMetadataEvent,
) => void | PromiseLike<void>

export interface TurnControllerDependencies {
  readonly session: TurnControllerSession
  readonly audioOutput: TurnControllerAudioOutput
  readonly currentSessionBuffer: TurnControllerTranscriptBuffer
  readonly onVoiceResponseProgress: TurnControllerCallback
  readonly onNewTurn: TurnControllerCallback
  readonly onTranscriptAvailable: (entry: TurnControllerTranscriptEntry) => void | PromiseLike<void>
  readonly eventSink: TurnControllerEventSink
}

const INTERRUPTION_REASON = 'user_requested'
const INTERRUPTION_FAILURE_REASON = 'cause=transport_error'
const TRANSCRIPT_UNAVAILABLE_REASON = 'transcript_unavailable'
const TRANSCRIPT_AVAILABLE_REASON = 'transcript_available'
const STALE_SESSION_REASON = 'stale_realtime_session'

function durationSince(startedAt: number): number {
  const elapsed = Date.now() - startedAt
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : 0
}

export class TurnController {
  private interruptionPromise: Promise<void> | null = null

  constructor(private readonly dependencies: TurnControllerDependencies) {}

  onUserSpeechStarted(): Promise<void> {
    return this.requestInterruption()
  }

  interrupt(): Promise<void> {
    return this.requestInterruption()
  }

  onCompletedTranscript(input: CompletedTranscriptInput): Promise<void> {
    if (input.realtimeSessionId !== this.dependencies.session.realtimeSessionId) {
      this.emitMetadata('transcript_unavailable', 'degraded', STALE_SESSION_REASON, 0)
      return Promise.resolve()
    }

    const startedAt = Date.now()
    this.invokeCallback(this.dependencies.onVoiceResponseProgress)

    let transcriptResolution: Promise<string | undefined>
    try {
      transcriptResolution = Promise.resolve(input.transcript)
    } catch {
      this.emitMetadata(
        'transcript_unavailable',
        'degraded',
        TRANSCRIPT_UNAVAILABLE_REASON,
        durationSince(startedAt),
      )
      return Promise.resolve()
    }

    return transcriptResolution.then(
      (transcript) => {
        if (typeof transcript !== 'string' || transcript.trim().length === 0) {
          this.emitMetadata(
            'transcript_unavailable',
            'degraded',
            TRANSCRIPT_UNAVAILABLE_REASON,
            durationSince(startedAt),
          )
          return
        }

        let entry: TurnControllerTranscriptEntry | undefined
        try {
          entry = this.dependencies.currentSessionBuffer.get(input.itemId)
          if (
            entry === undefined ||
            entry.itemId !== input.itemId ||
            entry.turnId !== input.turnId ||
            typeof entry.transcript !== 'string' ||
            entry.transcript.trim().length === 0
          ) {
            this.emitMetadata(
              'transcript_unavailable',
              'degraded',
              TRANSCRIPT_UNAVAILABLE_REASON,
              durationSince(startedAt),
            )
            return
          }
        } catch {
          this.emitMetadata(
            'transcript_unavailable',
            'degraded',
            TRANSCRIPT_UNAVAILABLE_REASON,
            durationSince(startedAt),
          )
          return
        }

        this.invokeTranscriptAvailable(entry)
        this.emitMetadata(
          'transcript_available',
          'success',
          TRANSCRIPT_AVAILABLE_REASON,
          durationSince(startedAt),
        )
      },
      () => {
        this.emitMetadata(
          'transcript_unavailable',
          'degraded',
          TRANSCRIPT_UNAVAILABLE_REASON,
          durationSince(startedAt),
        )
      },
    )
  }

  private requestInterruption(): Promise<void> {
    if (this.interruptionPromise !== null) return this.interruptionPromise

    const startedAt = Date.now()
    let resolveInterruption!: () => void
    const operation = new Promise<void>((resolve) => {
      resolveInterruption = resolve
    })
    this.interruptionPromise = operation

    this.invokeVolumeStop()
    this.invokeCallback(this.dependencies.onNewTurn)
    this.emitMetadata(
      'interruption_requested',
      'info',
      INTERRUPTION_REASON,
      durationSince(startedAt),
    )

    let sdkInterruption: void | PromiseLike<void>
    try {
      sdkInterruption = this.dependencies.session.interrupt()
    } catch {
      this.completeInterruption(
        operation,
        resolveInterruption,
        startedAt,
        'failed',
        INTERRUPTION_FAILURE_REASON,
      )
      return operation
    }

    void Promise.resolve(sdkInterruption).then(
      () => {
        this.completeInterruption(
          operation,
          resolveInterruption,
          startedAt,
          'success',
          INTERRUPTION_REASON,
        )
      },
      () => {
        this.completeInterruption(
          operation,
          resolveInterruption,
          startedAt,
          'failed',
          INTERRUPTION_FAILURE_REASON,
        )
      },
    )

    return operation
  }

  private completeInterruption(
    operation: Promise<void>,
    resolveInterruption: () => void,
    startedAt: number,
    status: 'success' | 'failed',
    reason: string,
  ): void {
    if (this.interruptionPromise !== operation) return

    this.emitMetadata(
      'interruption_completed',
      status,
      reason,
      durationSince(startedAt),
    )
    resolveInterruption()
    this.interruptionPromise = null
  }

  private invokeVolumeStop(): void {
    try {
      this.dependencies.audioOutput.setVolume(0)
    } catch {
      // Audio output failure must not gate the new turn or SDK interruption.
    }
  }

  private invokeCallback(callback: TurnControllerCallback): void {
    try {
      const result = callback()
      void Promise.resolve(result).catch(() => {})
    } catch {
      // Callback failure must not gate the remaining turn steps.
    }
  }

  private invokeTranscriptAvailable(entry: TurnControllerTranscriptEntry): void {
    try {
      const result = this.dependencies.onTranscriptAvailable(entry)
      void Promise.resolve(result).catch(() => {})
    } catch {
      // Transcript delivery failure must not gate Voice or metadata handling.
    }
  }

  private emitMetadata(
    event: TurnControllerMetadataEventName,
    status: TurnControllerMetadataStatus,
    reason: string,
    duration_ms: number,
  ): void {
    try {
      const result = this.dependencies.eventSink({
        event,
        realtimeSessionId: this.dependencies.session.realtimeSessionId,
        status,
        reason,
        duration_ms: duration_ms >= 0 && Number.isFinite(duration_ms) ? duration_ms : 0,
      })
      void Promise.resolve(result).catch(() => {})
    } catch {
      // Metadata delivery must not gate the realtime turn.
    }
  }
}

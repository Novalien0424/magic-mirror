export type PlaybackCompletionSource =
  | 'output_audio_buffer.stopped'
  | 'bounded_analyser_fallback'

export type PlaybackCompletionResult =
  | { readonly source: 'output_audio_buffer.stopped' }
  | {
      readonly source: 'bounded_analyser_fallback'
      readonly reason: 'tail_silence_detected' | 'fallback_bound_reached'
    }

export interface PlaybackCompletionTransport {
  on(eventName: string, listener: (event: unknown) => void): unknown
  off(eventName: string, listener: (event: unknown) => void): unknown
}

export interface PlaybackCompletionScheduler {
  now(): number
  setTimeout(callback: () => void, delayMs: number): number
  clearTimeout(handle: number): void
}

export interface PlaybackCompletionAnalyser {
  readPeakLevel(): number
}

export interface PlaybackCompletionMetadataEvent {
  readonly event: 'playback_completed' | 'playback_completion_fallback'
  readonly source: PlaybackCompletionSource
  readonly duration_ms: number
  readonly status: 'success' | 'degraded'
  readonly reason:
    | 'primary_event_received'
    | 'tail_silence_detected'
    | 'fallback_bound_reached'
  readonly count: 1
}

export type PlaybackCompletionMetadataEventSink = (
  event: PlaybackCompletionMetadataEvent,
) => void

export interface PlaybackCompletionInput {
  readonly transport: PlaybackCompletionTransport
  readonly analyser: PlaybackCompletionAnalyser
  readonly scheduler: PlaybackCompletionScheduler
  readonly fallbackAfterMs: number
  readonly sampleIntervalMs: number
  readonly maxFallbackMs: number
  readonly silenceThreshold: number
  readonly silentSamplesRequired: number
  readonly eventSink: PlaybackCompletionMetadataEventSink
}

function safeDuration(scheduler: PlaybackCompletionScheduler, startedAt: number): number {
  try {
    const elapsed = scheduler.now() - startedAt
    return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : 0
  } catch {
    return 0
  }
}

function safeNow(scheduler: PlaybackCompletionScheduler, fallback: number): number {
  try {
    const now = scheduler.now()
    return Number.isFinite(now) ? now : fallback
  } catch {
    return fallback
  }
}

function validateFiniteNonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`Invalid ${name}`)
  }
  return value
}

function validatePositiveFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`Invalid ${name}`)
  }
  return value
}

function validateSilenceThreshold(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError('Invalid silenceThreshold')
  }
  return value
}

function validateSilentSamplesRequired(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError('Invalid silentSamplesRequired')
  }
  return value
}

function abortError(): Error {
  const error = new Error('Playback completion aborted')
  error.name = 'AbortError'
  return error
}

export class PlaybackCompletion {
  private readonly transport: PlaybackCompletionTransport
  private readonly analyser: PlaybackCompletionAnalyser
  private readonly scheduler: PlaybackCompletionScheduler
  private readonly fallbackAfterMs: number
  private readonly sampleIntervalMs: number
  private readonly maxFallbackMs: number
  private readonly silenceThreshold: number
  private readonly silentSamplesRequired: number
  private readonly eventSink: PlaybackCompletionMetadataEventSink

  constructor(input: PlaybackCompletionInput) {
    this.transport = input.transport
    this.analyser = input.analyser
    this.scheduler = input.scheduler
    this.fallbackAfterMs = Math.max(0, Number.isFinite(input.fallbackAfterMs) ? input.fallbackAfterMs : 0)
    this.sampleIntervalMs = validatePositiveFinite(input.sampleIntervalMs, 'sampleIntervalMs')
    this.maxFallbackMs = validateFiniteNonNegative(input.maxFallbackMs, 'maxFallbackMs')
    this.silenceThreshold = validateSilenceThreshold(input.silenceThreshold)
    this.silentSamplesRequired = validateSilentSamplesRequired(input.silentSamplesRequired)
    this.eventSink = input.eventSink
  }

  waitForActualEnd(signal: AbortSignal): Promise<PlaybackCompletionResult> {
    return new Promise<PlaybackCompletionResult>((resolve, reject) => {
      const startedAt = safeNow(this.scheduler, 0)
      const fallbackStartsAt = startedAt + this.fallbackAfterMs
      const fallbackDeadline = fallbackStartsAt + this.maxFallbackMs
      const analyser = this.analyser
      const scheduler = this.scheduler
      const sampleIntervalMs = this.sampleIntervalMs
      const silenceThreshold = this.silenceThreshold
      const silentSamplesRequired = this.silentSamplesRequired
      let settled = false
      let cleanedUp = false
      let timeoutHandle: number | null = null
      let silentSamples = 0

      const cleanup = (): void => {
        if (cleanedUp) return
        cleanedUp = true
        try {
          this.transport.off('output_audio_buffer.stopped', onPrimary)
        } catch {
          // Cleanup is best effort and never exposes a provider error.
        }
        if (timeoutHandle !== null) {
          try {
            this.scheduler.clearTimeout(timeoutHandle)
          } catch {
            // Cleanup is best effort and never exposes a scheduler error.
          }
          timeoutHandle = null
        }
        try {
          signal.removeEventListener('abort', onAbort)
        } catch {
          // Cleanup is best effort and never exposes an abort-listener error.
        }
      }

      const emitMetadata = (event: PlaybackCompletionMetadataEvent): void => {
        try {
          this.eventSink(event)
        } catch {
          // Metadata delivery cannot delay or change the playback boundary.
        }
      }

      const settlePrimary = (): void => {
        if (settled) return
        settled = true
        const duration_ms = safeDuration(this.scheduler, startedAt)
        cleanup()
        emitMetadata({
          event: 'playback_completed',
          source: 'output_audio_buffer.stopped',
          duration_ms,
          status: 'success',
          reason: 'primary_event_received',
          count: 1,
        })
        resolve({ source: 'output_audio_buffer.stopped' })
      }

      const settleFallback = (
        reason: 'tail_silence_detected' | 'fallback_bound_reached',
      ): void => {
        if (settled) return
        settled = true
        const duration_ms = safeDuration(this.scheduler, startedAt)
        cleanup()
        emitMetadata({
          event: 'playback_completion_fallback',
          source: 'bounded_analyser_fallback',
          duration_ms,
          status: 'degraded',
          reason,
          count: 1,
        })
        resolve({
          source: 'bounded_analyser_fallback',
          reason,
        })
      }

      function onSample(): void {
        if (settled) return

        let peakLevel: number | null = null
        try {
          peakLevel = analyser.readPeakLevel()
        } catch {
          // An unreadable sample cannot prove silence; continue to the bound.
        }

        const now = safeNow(scheduler, fallbackStartsAt)
        if (now >= fallbackDeadline) {
          settleFallback('fallback_bound_reached')
          return
        }

        if (
          peakLevel !== null &&
          Number.isFinite(peakLevel) &&
          peakLevel <= silenceThreshold
        ) {
          silentSamples += 1
        } else {
          silentSamples = 0
        }

        if (silentSamples >= silentSamplesRequired) {
          settleFallback('tail_silence_detected')
          return
        }

        scheduleNextSample()
      }

      function scheduleNextSample(): void {
        if (settled) return

        const now = safeNow(scheduler, fallbackStartsAt)
        const remainingMs = fallbackDeadline - now
        if (remainingMs <= 0) {
          settleFallback('fallback_bound_reached')
          return
        }

        const delayMs = Math.min(sampleIntervalMs, remainingMs)
        try {
          const scheduledHandle = scheduler.setTimeout(onSample, delayMs)
          if (settled) {
            scheduler.clearTimeout(scheduledHandle)
          } else {
            timeoutHandle = scheduledHandle
          }
        } catch {
          settleFallback('fallback_bound_reached')
        }
      }

      const onAbort = (): void => {
        if (settled) return
        settled = true
        cleanup()
        reject(abortError())
      }

      const onPrimary = (): void => {
        settlePrimary()
      }

      if (signal.aborted) {
        onAbort()
        return
      }

      this.transport.on('output_audio_buffer.stopped', onPrimary)
      if (settled) return

      signal.addEventListener('abort', onAbort)
      if (settled) return

      try {
        const scheduledHandle = this.scheduler.setTimeout(
          onSample,
          this.fallbackAfterMs,
        )
        if (settled) {
          this.scheduler.clearTimeout(scheduledHandle)
        } else {
          timeoutHandle = scheduledHandle
        }
      } catch {
        settleFallback('fallback_bound_reached')
      }
    })
  }
}

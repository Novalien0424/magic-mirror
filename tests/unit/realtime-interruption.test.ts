import { describe, expect, it, vi } from 'vitest'
import { TurnController } from '../../src/renderer/realtime/turn-controller'

const CURRENT_SESSION_ID = 'realtime-session-current'
const STALE_SESSION_ID = 'realtime-session-stale'
const CURRENT_ITEM_ID = 'item-current'
const CURRENT_TURN_ID = 'turn-current'

// Synthetic sentinels are asserted only through in-memory callbacks. They are
// deliberately never accepted by the metadata assertions below.
const TRANSCRIPT_SENTINEL = '__synthetic_transcript_ram_only__'
const RAW_ERROR_SENTINEL = '__synthetic_raw_error_never_emitted__'
const SECRET_SENTINEL = '__synthetic_secret_never_emitted__'
const PRIVATE_CONTEXT_SENTINEL = '__synthetic_private_context_never_emitted__'

type MetadataEvent = Record<string, unknown>

interface TranscriptEntry {
  readonly itemId: string
  readonly turnId: string
  readonly transcript: string
}

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
  reject(reason?: unknown): void
}

function deferred<T>(): Deferred<T> {
  let resolvePromise!: (value: T) => void
  let rejectPromise!: (reason?: unknown) => void
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  }
}

function assertMetadataOnly(
  event: MetadataEvent,
  expectedEvent: string,
  expectedSessionId: string,
  expectedStatus: string,
): void {
  expect(event).toMatchObject({
    event: expectedEvent,
    realtimeSessionId: expectedSessionId,
    status: expectedStatus,
    reason: expect.any(String),
  })

  const latency = event.duration_ms ?? event.latency_ms
  expect(typeof latency).toBe('number')
  expect(Number.isFinite(latency)).toBe(true)

  const serialized = JSON.stringify(event)
  for (const forbidden of [
    TRANSCRIPT_SENTINEL,
    RAW_ERROR_SENTINEL,
    SECRET_SENTINEL,
    PRIVATE_CONTEXT_SENTINEL,
  ]) {
    expect(serialized).not.toContain(forbidden)
  }

  expect(Object.keys(event).some((key) =>
    /(^|_)(transcript|audio|secret|private(?:_?context)?|prompt)(_|$)/i.test(key) ||
    /^(raw_?error|error|error_?message|stack)$/i.test(key),
  )).toBe(false)
}

interface HarnessOptions {
  readonly transcriptEntry?: TranscriptEntry
}

function createHarness(options: HarnessOptions = {}) {
  const events: MetadataEvent[] = []
  const interruptSession = vi.fn(async () => {})
  const setVolume = vi.fn()
  const getTranscriptEntry = vi.fn((_itemId: string): TranscriptEntry | undefined => options.transcriptEntry)
  const onVoiceResponseProgress = vi.fn()
  const onNewTurn = vi.fn()
  const onTranscriptAvailable = vi.fn()

  const controller = new TurnController({
    session: {
      realtimeSessionId: CURRENT_SESSION_ID,
      interrupt: interruptSession,
    },
    audioOutput: {
      setVolume,
    },
    currentSessionBuffer: {
      get: getTranscriptEntry,
    },
    onVoiceResponseProgress,
    onNewTurn,
    onTranscriptAvailable,
    eventSink: (event: MetadataEvent) => {
      events.push(event)
    },
  })

  return {
    controller,
    events,
    interruptSession,
    setVolume,
    getTranscriptEntry,
    onVoiceResponseProgress,
    onNewTurn,
    onTranscriptAvailable,
  }
}

function eventsFor(events: readonly MetadataEvent[], eventName: string): MetadataEvent[] {
  return events.filter((event) => event.event === eventName)
}

describe('TurnController interruption and transcript-independent voice progression', () => {
  it('stops actual output immediately on SDK VAD speech start and permits one new turn before transcription resolves', async () => {
    const transcript = deferred<string>()
    const harness = createHarness({
      transcriptEntry: {
        itemId: CURRENT_ITEM_ID,
        turnId: CURRENT_TURN_ID,
        transcript: TRANSCRIPT_SENTINEL,
      },
    })

    const transcriptHandling = harness.controller.onCompletedTranscript({
      realtimeSessionId: CURRENT_SESSION_ID,
      itemId: CURRENT_ITEM_ID,
      turnId: CURRENT_TURN_ID,
      transcript: transcript.promise,
    })

    const interruption = harness.controller.onUserSpeechStarted()

    expect(harness.setVolume).toHaveBeenCalledWith(0)
    expect(harness.onNewTurn).toHaveBeenCalledTimes(1)
    expect(harness.onVoiceResponseProgress).toHaveBeenCalledTimes(1)
    expect(harness.onTranscriptAvailable).not.toHaveBeenCalled()

    await interruption

    expect(harness.interruptSession).toHaveBeenCalledTimes(1)
    expect(eventsFor(harness.events, 'interruption_requested')).toHaveLength(1)
    expect(eventsFor(harness.events, 'interruption_completed')).toHaveLength(1)
    assertMetadataOnly(
      eventsFor(harness.events, 'interruption_requested')[0],
      'interruption_requested',
      CURRENT_SESSION_ID,
      'info',
    )
    assertMetadataOnly(
      eventsFor(harness.events, 'interruption_completed')[0],
      'interruption_completed',
      CURRENT_SESSION_ID,
      'success',
    )

    transcript.resolve(TRANSCRIPT_SENTINEL)
    await transcriptHandling
  })

  it('stops actual output immediately on manual interrupt and permits one new turn before transcription resolves', async () => {
    const transcript = deferred<string>()
    const harness = createHarness({
      transcriptEntry: {
        itemId: CURRENT_ITEM_ID,
        turnId: CURRENT_TURN_ID,
        transcript: TRANSCRIPT_SENTINEL,
      },
    })

    const transcriptHandling = harness.controller.onCompletedTranscript({
      realtimeSessionId: CURRENT_SESSION_ID,
      itemId: CURRENT_ITEM_ID,
      turnId: CURRENT_TURN_ID,
      transcript: transcript.promise,
    })

    const interruption = harness.controller.interrupt()

    expect(harness.setVolume).toHaveBeenCalledWith(0)
    expect(harness.onNewTurn).toHaveBeenCalledTimes(1)
    expect(harness.onVoiceResponseProgress).toHaveBeenCalledTimes(1)
    expect(harness.onTranscriptAvailable).not.toHaveBeenCalled()

    await interruption

    expect(harness.interruptSession).toHaveBeenCalledTimes(1)
    expect(eventsFor(harness.events, 'interruption_requested')).toHaveLength(1)
    expect(eventsFor(harness.events, 'interruption_completed')).toHaveLength(1)
    assertMetadataOnly(
      eventsFor(harness.events, 'interruption_completed')[0],
      'interruption_completed',
      CURRENT_SESSION_ID,
      'success',
    )

    transcript.resolve(TRANSCRIPT_SENTINEL)
    await transcriptHandling
  })

  it('makes Voice response progression observable before final transcription completes', async () => {
    const transcript = deferred<string>()
    const harness = createHarness({
      transcriptEntry: {
        itemId: CURRENT_ITEM_ID,
        turnId: CURRENT_TURN_ID,
        transcript: TRANSCRIPT_SENTINEL,
      },
    })

    const transcriptHandling = harness.controller.onCompletedTranscript({
      realtimeSessionId: CURRENT_SESSION_ID,
      itemId: CURRENT_ITEM_ID,
      turnId: CURRENT_TURN_ID,
      transcript: transcript.promise,
    })

    expect(harness.onVoiceResponseProgress).toHaveBeenCalledTimes(1)
    expect(harness.onTranscriptAvailable).not.toHaveBeenCalled()

    transcript.resolve(TRANSCRIPT_SENTINEL)
    await transcriptHandling

    expect(harness.onTranscriptAvailable).toHaveBeenCalledTimes(1)
    expect(harness.onTranscriptAvailable).toHaveBeenCalledWith({
      itemId: CURRENT_ITEM_ID,
      turnId: CURRENT_TURN_ID,
      transcript: TRANSCRIPT_SENTINEL,
    })
    expect(harness.getTranscriptEntry).toHaveBeenCalledWith(CURRENT_ITEM_ID)

    const available = eventsFor(harness.events, 'transcript_available')
    expect(available).toHaveLength(1)
    assertMetadataOnly(available[0], 'transcript_available', CURRENT_SESSION_ID, 'success')
  })

  it('maps a completed transcript through the injected current-session buffer in RAM only', async () => {
    const harness = createHarness({
      transcriptEntry: {
        itemId: CURRENT_ITEM_ID,
        turnId: CURRENT_TURN_ID,
        transcript: TRANSCRIPT_SENTINEL,
      },
    })

    await harness.controller.onCompletedTranscript({
      realtimeSessionId: CURRENT_SESSION_ID,
      itemId: CURRENT_ITEM_ID,
      turnId: CURRENT_TURN_ID,
      transcript: TRANSCRIPT_SENTINEL,
    })

    expect(harness.getTranscriptEntry).toHaveBeenCalledTimes(1)
    expect(harness.getTranscriptEntry).toHaveBeenCalledWith(CURRENT_ITEM_ID)
    expect(harness.onTranscriptAvailable).toHaveBeenCalledTimes(1)
    expect(harness.onTranscriptAvailable).toHaveBeenCalledWith({
      itemId: CURRENT_ITEM_ID,
      turnId: CURRENT_TURN_ID,
      transcript: TRANSCRIPT_SENTINEL,
    })
  })

  it('emits transcript_unavailable for missing transcription while Voice and new-turn progression continue', async () => {
    const harness = createHarness()

    await harness.controller.onCompletedTranscript({
      realtimeSessionId: CURRENT_SESSION_ID,
      itemId: CURRENT_ITEM_ID,
      turnId: CURRENT_TURN_ID,
      transcript: undefined,
    })

    expect(harness.onVoiceResponseProgress).toHaveBeenCalledTimes(1)
    expect(harness.onTranscriptAvailable).not.toHaveBeenCalled()

    await harness.controller.interrupt()
    expect(harness.onNewTurn).toHaveBeenCalledTimes(1)

    const unavailable = eventsFor(harness.events, 'transcript_unavailable')
    expect(unavailable).toHaveLength(1)
    assertMetadataOnly(unavailable[0], 'transcript_unavailable', CURRENT_SESSION_ID, 'degraded')
  })

  it('emits transcript_unavailable for failed transcription without exposing the raw error or gating Voice', async () => {
    const harness = createHarness()

    await harness.controller.onCompletedTranscript({
      realtimeSessionId: CURRENT_SESSION_ID,
      itemId: CURRENT_ITEM_ID,
      turnId: CURRENT_TURN_ID,
      transcript: Promise.reject(new Error(RAW_ERROR_SENTINEL)),
    })

    expect(harness.onVoiceResponseProgress).toHaveBeenCalledTimes(1)
    expect(harness.onTranscriptAvailable).not.toHaveBeenCalled()

    await harness.controller.interrupt()
    expect(harness.onNewTurn).toHaveBeenCalledTimes(1)

    const unavailable = eventsFor(harness.events, 'transcript_unavailable')
    expect(unavailable).toHaveLength(1)
    assertMetadataOnly(unavailable[0], 'transcript_unavailable', CURRENT_SESSION_ID, 'degraded')
  })

  it('rejects a stale realtimeSessionId before consulting the current-session buffer', async () => {
    const harness = createHarness({
      transcriptEntry: {
        itemId: CURRENT_ITEM_ID,
        turnId: CURRENT_TURN_ID,
        transcript: TRANSCRIPT_SENTINEL,
      },
    })

    await harness.controller.onCompletedTranscript({
      realtimeSessionId: STALE_SESSION_ID,
      itemId: CURRENT_ITEM_ID,
      turnId: CURRENT_TURN_ID,
      transcript: TRANSCRIPT_SENTINEL,
    })

    expect(harness.getTranscriptEntry).not.toHaveBeenCalled()
    expect(harness.onTranscriptAvailable).not.toHaveBeenCalled()
    expect(eventsFor(harness.events, 'transcript_available')).toHaveLength(0)

    const stale = harness.events.find((event) => event.reason === 'stale_realtime_session')
    expect(stale).toBeDefined()
    assertMetadataOnly(
      stale!,
      String(stale!.event),
      String(stale!.realtimeSessionId),
      String(stale!.status),
    )
  })

  it('is idempotent for duplicate VAD/manual interruption signals', async () => {
    const harness = createHarness()

    await Promise.all([
      harness.controller.onUserSpeechStarted(),
      harness.controller.onUserSpeechStarted(),
      harness.controller.interrupt(),
      harness.controller.interrupt(),
    ])

    expect(harness.setVolume).toHaveBeenCalledTimes(1)
    expect(harness.interruptSession).toHaveBeenCalledTimes(1)
    expect(harness.onNewTurn).toHaveBeenCalledTimes(1)
    expect(eventsFor(harness.events, 'interruption_requested')).toHaveLength(1)
    expect(eventsFor(harness.events, 'interruption_completed')).toHaveLength(1)
    assertMetadataOnly(
      eventsFor(harness.events, 'interruption_completed')[0],
      'interruption_completed',
      CURRENT_SESSION_ID,
      'success',
    )
  })

  it('keeps interruption diagnostics metadata-only even when private inputs exist in RAM', async () => {
    const harness = createHarness()

    await harness.controller.interrupt()

    const completed = eventsFor(harness.events, 'interruption_completed')
    expect(completed).toHaveLength(1)
    assertMetadataOnly(completed[0], 'interruption_completed', CURRENT_SESSION_ID, 'success')
    expect(JSON.stringify(harness.events)).not.toContain(TRANSCRIPT_SENTINEL)
    expect(JSON.stringify(harness.events)).not.toContain(RAW_ERROR_SENTINEL)
    expect(JSON.stringify(harness.events)).not.toContain(SECRET_SENTINEL)
    expect(JSON.stringify(harness.events)).not.toContain(PRIVATE_CONTEXT_SENTINEL)
  })
})

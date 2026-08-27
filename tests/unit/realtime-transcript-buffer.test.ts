import { describe, expect, it, vi } from 'vitest'

import * as transcriptBufferModule from '../../src/renderer/realtime/transcript-buffer'
import { TranscriptBuffer } from '../../src/renderer/realtime/transcript-buffer'

const CURRENT_REALTIME_SESSION_ID = 'realtime-session-current'
const STALE_REALTIME_SESSION_ID = 'realtime-session-stale'
const SYNTHETIC_TRANSCRIPT_A = 'synthetic-transcript-alpha'
const SYNTHETIC_TRANSCRIPT_B = 'synthetic-transcript-beta'
const SYNTHETIC_TRANSCRIPT_C = 'synthetic-transcript-gamma'
const SYNTHETIC_RAW_ERROR = 'synthetic-raw-transcription-error'
const SYNTHETIC_SECRET = 'synthetic-secret-must-not-leak'
const SYNTHETIC_PRIVATE_PAYLOAD = 'synthetic-private-payload-must-not-leak'

const ALLOWED_METADATA_KEYS = new Set([
  'event',
  'realtimeSessionId',
  'itemId',
  'turnId',
  'itemCount',
  'turnCount',
  'droppedItemCount',
  'droppedTurnCount',
  'status',
  'reason',
])

type MetadataRecord = Record<string, unknown>

function createBuffer() {
  const metadata: unknown[] = []
  const eventSink = vi.fn((event: unknown) => {
    metadata.push(event)
  })

  const buffer = new TranscriptBuffer({
    realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
    maxEntries: 2,
    eventSink,
  })

  return { buffer, metadata, eventSink }
}

function asMetadata(value: unknown): MetadataRecord {
  expect(typeof value).toBe('object')
  expect(value).not.toBeNull()
  return value as MetadataRecord
}

function assertMetadataOnly(events: readonly unknown[]): void {
  for (const event of events) {
    const metadata = asMetadata(event)
    expect(Object.keys(metadata).every((key) => ALLOWED_METADATA_KEYS.has(key))).toBe(true)
    expect(metadata).not.toHaveProperty('transcript')
    expect(metadata).not.toHaveProperty('rawError')
    expect(metadata).not.toHaveProperty('error')
    expect(metadata).not.toHaveProperty('message')
    expect(metadata).not.toHaveProperty('stack')
    expect(metadata).not.toHaveProperty('secret')
    expect(metadata).not.toHaveProperty('privatePayload')

    const encoded = JSON.stringify(metadata)
    expect(encoded).not.toContain(SYNTHETIC_TRANSCRIPT_A)
    expect(encoded).not.toContain(SYNTHETIC_TRANSCRIPT_B)
    expect(encoded).not.toContain(SYNTHETIC_TRANSCRIPT_C)
    expect(encoded).not.toContain(SYNTHETIC_RAW_ERROR)
    expect(encoded).not.toContain(SYNTHETIC_SECRET)
    expect(encoded).not.toContain(SYNTHETIC_PRIVATE_PAYLOAD)
  }
}

function lastMetadata(metadata: readonly unknown[]): MetadataRecord {
  const event = metadata.at(-1)
  expect(event).toBeDefined()
  return asMetadata(event)
}

describe('TranscriptBuffer', () => {
  it('maps completed item IDs to turns and exposes only the current RAM projection', () => {
    const { buffer, metadata, eventSink } = createBuffer()

    buffer.addCompleted({
      realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
      itemId: 'item-current',
      turnId: 'turn-current',
      transcript: SYNTHETIC_TRANSCRIPT_A,
    })

    expect(eventSink).toHaveBeenCalledTimes(1)
    expect(buffer.get('item-current')).toEqual({
      itemId: 'item-current',
      turnId: 'turn-current',
      transcript: SYNTHETIC_TRANSCRIPT_A,
    })
    expect(buffer.current()).toEqual({
      realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
      itemCount: 1,
      turnCount: 1,
      entries: [
        {
          itemId: 'item-current',
          turnId: 'turn-current',
          transcript: SYNTHETIC_TRANSCRIPT_A,
        },
      ],
    })

    expect(buffer.current()).not.toHaveProperty('guestId')
    expect(buffer.current()).not.toHaveProperty('candidateProfileId')
    expect(lastMetadata(metadata)).toMatchObject({
      event: 'transcript_available',
      realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
      itemId: 'item-current',
      turnId: 'turn-current',
      itemCount: 1,
      turnCount: 1,
      status: 'success',
      reason: 'cause=transcript_available',
    })
    assertMetadataOnly(metadata)
  })

  it('ignores a stale realtime session without populating the current buffer', () => {
    const { buffer, metadata } = createBuffer()

    expect(() => buffer.addCompleted({
      realtimeSessionId: STALE_REALTIME_SESSION_ID,
      itemId: 'item-stale',
      turnId: 'turn-stale',
      transcript: SYNTHETIC_TRANSCRIPT_B,
    })).not.toThrow()

    expect(buffer.get('item-stale')).toBeUndefined()
    expect(buffer.current()).toEqual({
      realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
      itemCount: 0,
      turnCount: 0,
      entries: [],
    })
    expect(lastMetadata(metadata)).toMatchObject({
      event: 'transcript_unavailable',
      realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
      itemCount: 0,
      turnCount: 0,
      status: 'info',
      reason: 'cause=stale_realtime_session',
    })
    assertMetadataOnly(metadata)
  })

  it('rejects blank and failed final transcripts visibly without gating later turns', () => {
    const { buffer, metadata } = createBuffer()

    buffer.addCompleted({
      realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
      itemId: 'item-before-unavailable',
      turnId: 'turn-before-unavailable',
      transcript: SYNTHETIC_TRANSCRIPT_A,
    })
    const metadataBeforeUnavailable = metadata.length

    expect(() => buffer.addCompleted({
      realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
      itemId: 'item-blank',
      turnId: 'turn-blank',
      transcript: '   ',
    })).not.toThrow()

    const failedCompletion = {
      realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
      itemId: 'item-failed',
      turnId: 'turn-failed',
      transcript: '',
      status: 'failed' as const,
      error: new Error(SYNTHETIC_RAW_ERROR),
      secret: SYNTHETIC_SECRET,
      privatePayload: SYNTHETIC_PRIVATE_PAYLOAD,
    }
    expect(() => buffer.addCompleted(failedCompletion)).not.toThrow()

    expect(buffer.get('item-blank')).toBeUndefined()
    expect(buffer.get('item-failed')).toBeUndefined()
    expect(metadata.slice(metadataBeforeUnavailable)).toHaveLength(2)
    for (const event of metadata.slice(metadataBeforeUnavailable)) {
      expect(event).toMatchObject({
        event: 'transcript_unavailable',
        realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
        itemCount: 1,
        turnCount: 1,
        status: 'degraded',
        reason: 'cause=transcript_unavailable',
      })
    }

    buffer.addCompleted({
      realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
      itemId: 'item-after-unavailable',
      turnId: 'turn-after-unavailable',
      transcript: SYNTHETIC_TRANSCRIPT_B,
    })
    expect(buffer.get('item-after-unavailable')).toMatchObject({
      itemId: 'item-after-unavailable',
      turnId: 'turn-after-unavailable',
    })
    assertMetadataOnly(metadata)
  })

  it('drops the oldest item on overflow and reports item and turn counts', () => {
    const { buffer, metadata } = createBuffer()

    buffer.addCompleted({
      realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
      itemId: 'item-oldest',
      turnId: 'turn-oldest',
      transcript: SYNTHETIC_TRANSCRIPT_A,
    })
    buffer.addCompleted({
      realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
      itemId: 'item-middle',
      turnId: 'turn-middle',
      transcript: SYNTHETIC_TRANSCRIPT_B,
    })
    buffer.addCompleted({
      realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
      itemId: 'item-newest',
      turnId: 'turn-newest',
      transcript: SYNTHETIC_TRANSCRIPT_C,
    })

    expect(buffer.get('item-oldest')).toBeUndefined()
    expect(buffer.current()).toMatchObject({
      realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
      itemCount: 2,
      turnCount: 2,
    })
    expect(buffer.current().entries.map((entry) => entry.itemId)).toEqual([
      'item-middle',
      'item-newest',
    ])
    expect(lastMetadata(metadata)).toMatchObject({
      event: 'transcript_buffer_overflow',
      realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
      itemCount: 2,
      turnCount: 2,
      droppedItemCount: 1,
      droppedTurnCount: 1,
      status: 'degraded',
      reason: 'cause=transcript_buffer_overflow',
    })
    assertMetadataOnly(metadata)
  })

  it('clears every mapped value and emits the cleared counts and caller reason', () => {
    const { buffer, metadata } = createBuffer()

    buffer.addCompleted({
      realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
      itemId: 'item-clear-a',
      turnId: 'turn-clear',
      transcript: SYNTHETIC_TRANSCRIPT_A,
    })
    buffer.addCompleted({
      realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
      itemId: 'item-clear-b',
      turnId: 'turn-clear',
      transcript: SYNTHETIC_TRANSCRIPT_B,
    })

    buffer.clear('cause=session_close')

    expect(buffer.get('item-clear-a')).toBeUndefined()
    expect(buffer.get('item-clear-b')).toBeUndefined()
    expect(buffer.current()).toEqual({
      realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
      itemCount: 0,
      turnCount: 0,
      entries: [],
    })
    expect(lastMetadata(metadata)).toMatchObject({
      event: 'transcript_buffer_cleared',
      realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
      itemCount: 2,
      turnCount: 1,
      status: 'info',
      reason: 'cause=session_close',
    })
    assertMetadataOnly(metadata)
  })

  it('has no persistence, telemetry, SQLite, or export-serializer API surface', () => {
    const { buffer } = createBuffer()
    const forbiddenNames = [
      'appendTelemetry',
      'export',
      'exportSerializer',
      'persist',
      'serialize',
      'toJSON',
      'write',
      'writeToDisk',
      'sqlite',
      'database',
      'telemetry',
    ]

    expect(Object.keys(transcriptBufferModule)).not.toEqual(
      expect.arrayContaining(forbiddenNames),
    )
    expect(Object.getOwnPropertyNames(TranscriptBuffer.prototype)).toEqual(
      expect.arrayContaining(['addCompleted', 'get', 'current', 'clear']),
    )
    expect(Object.getOwnPropertyNames(TranscriptBuffer.prototype)).not.toEqual(
      expect.arrayContaining(forbiddenNames),
    )
    expect(Reflect.ownKeys(buffer)).not.toEqual(expect.arrayContaining(forbiddenNames))
  })

  it('rejects maxEntries above the shared hard cap while retaining positive-integer validation', () => {
    const eventSink = vi.fn()
    const options = {
      realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
      eventSink,
    }

    expect(() => new TranscriptBuffer({ ...options, maxEntries: 200 })).not.toThrow()
    expect(() => new TranscriptBuffer({ ...options, maxEntries: 201 })).toThrow(RangeError)
    expect(() => new TranscriptBuffer({ ...options, maxEntries: 0 })).toThrow(RangeError)
    expect(() => new TranscriptBuffer({ ...options, maxEntries: -1 })).toThrow(RangeError)
    expect(() => new TranscriptBuffer({ ...options, maxEntries: 1.5 })).toThrow(RangeError)
  })

  it('rejects oversized transcripts and blank identifiers while keeping later valid entries usable', () => {
    const { buffer, metadata } = createBuffer()
    const oversizedTranscript = 'x'.repeat(16_385)

    expect(() => buffer.addCompleted({
      realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
      itemId: 'item-too-long',
      turnId: 'turn-too-long',
      transcript: oversizedTranscript,
    })).not.toThrow()

    expect(buffer.get('item-too-long')).toBeUndefined()
    expect(lastMetadata(metadata)).toMatchObject({
      event: 'transcript_unavailable',
      realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
      itemId: 'item-too-long',
      turnId: 'turn-too-long',
      itemCount: 0,
      turnCount: 0,
      status: 'degraded',
      reason: 'cause=transcript_too_large',
    })
    assertMetadataOnly(metadata)

    buffer.addCompleted({
      realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
      itemId: 'item-after-too-long',
      turnId: 'turn-after-too-long',
      transcript: SYNTHETIC_TRANSCRIPT_A,
    })
    expect(buffer.get('item-after-too-long')).toEqual({
      itemId: 'item-after-too-long',
      turnId: 'turn-after-too-long',
      transcript: SYNTHETIC_TRANSCRIPT_A,
    })

    const metadataBeforeInvalidIdentifiers = metadata.length
    expect(() => buffer.addCompleted({
      realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
      itemId: '   ',
      turnId: 'turn-invalid-item',
      transcript: SYNTHETIC_TRANSCRIPT_B,
    })).not.toThrow()
    expect(() => buffer.addCompleted({
      realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
      itemId: 'item-invalid-turn',
      turnId: '\t',
      transcript: SYNTHETIC_TRANSCRIPT_C,
    })).not.toThrow()

    expect(buffer.get('   ')).toBeUndefined()
    expect(buffer.get('item-invalid-turn')).toBeUndefined()
    expect(metadata.slice(metadataBeforeInvalidIdentifiers)).toHaveLength(2)
    for (const event of metadata.slice(metadataBeforeInvalidIdentifiers)) {
      expect(event).toMatchObject({
        event: 'transcript_unavailable',
        realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
        itemCount: 1,
        turnCount: 1,
        status: 'degraded',
        reason: 'cause=invalid_transcript_identifier',
      })
      expect(event).not.toHaveProperty('itemId', '   ')
      expect(event).not.toHaveProperty('turnId', '\t')
    }
    assertMetadataOnly(metadata)
  })

  it('rejects unsafe session IDs and sanitizes caller clear reasons before metadata emission', () => {
    const metadata: unknown[] = []
    const eventSink = vi.fn((event: unknown) => {
      metadata.push(event)
    })

    for (const realtimeSessionId of ['', 'realtime/session']) {
      expect(() => new TranscriptBuffer({
        realtimeSessionId,
        maxEntries: 1,
        eventSink,
      })).toThrow()
    }
    expect(metadata).toHaveLength(0)

    const { buffer, metadata: validMetadata } = createBuffer()
    buffer.addCompleted({
      realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
      itemId: 'item-private-reason',
      turnId: 'turn-private-reason',
      transcript: SYNTHETIC_TRANSCRIPT_A,
    })

    expect(buffer.clear(`unsafe-caller-reason:${SYNTHETIC_PRIVATE_PAYLOAD}`)).toBe(1)
    const serializedMetadata = JSON.stringify(validMetadata)
    expect(lastMetadata(validMetadata)).toMatchObject({
      event: 'transcript_buffer_cleared',
      realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
      itemCount: 1,
      turnCount: 1,
      status: 'info',
      reason: 'cause=transcript_buffer_cleared',
    })
    expect(serializedMetadata).not.toContain(SYNTHETIC_PRIVATE_PAYLOAD)

    buffer.addCompleted({
      realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
      itemId: 'item-allowed-reason',
      turnId: 'turn-allowed-reason',
      transcript: SYNTHETIC_TRANSCRIPT_B,
    })
    expect(buffer.clear('cause=session_close')).toBe(1)
    expect(lastMetadata(validMetadata)).toMatchObject({
      event: 'transcript_buffer_cleared',
      realtimeSessionId: CURRENT_REALTIME_SESSION_ID,
      itemCount: 1,
      turnCount: 1,
      status: 'info',
      reason: 'cause=session_close',
    })
    assertMetadataOnly(validMetadata)
  })
})

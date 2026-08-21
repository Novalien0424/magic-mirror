type TranscriptBufferEventName =
  | 'transcript_available'
  | 'transcript_unavailable'
  | 'transcript_buffer_overflow'
  | 'transcript_buffer_cleared'

type TranscriptBufferStatus = 'success' | 'degraded' | 'info'

type TranscriptBufferEvent = {
  readonly event: TranscriptBufferEventName
  readonly realtimeSessionId: string
  readonly itemId?: string
  readonly turnId?: string
  readonly itemCount: number
  readonly turnCount: number
  readonly droppedItemCount?: number
  readonly droppedTurnCount?: number
  readonly status: TranscriptBufferStatus
  readonly reason: string
}

type TranscriptBufferEntry = {
  readonly itemId: string
  readonly turnId: string
  readonly transcript: string
}

type TranscriptCompletion = {
  readonly realtimeSessionId: string
  readonly itemId: string
  readonly turnId: string
  readonly transcript?: unknown
  readonly status?: unknown
  readonly [key: string]: unknown
}

type TranscriptBufferOptions = {
  readonly realtimeSessionId: string
  readonly maxEntries: number
  readonly eventSink: (event: TranscriptBufferEvent) => void
}

type TranscriptBufferProjection = {
  readonly realtimeSessionId: string
  readonly itemCount: number
  readonly turnCount: number
  readonly entries: readonly TranscriptBufferEntry[]
}

const MAX_ENTRIES = 200
const MAX_TRANSCRIPT_LENGTH = 16_384
const MAX_IDENTIFIER_LENGTH = 128
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/

function isSafeIdentifier(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_IDENTIFIER_LENGTH
    && SAFE_IDENTIFIER_PATTERN.test(value)
}

export class TranscriptBuffer {
  readonly #realtimeSessionId: string
  readonly #maxEntries: number
  readonly #eventSink: (event: TranscriptBufferEvent) => void
  readonly #entries: TranscriptBufferEntry[] = []
  readonly #entriesByItemId = new Map<string, TranscriptBufferEntry>()

  constructor(options: TranscriptBufferOptions) {
    if (!isSafeIdentifier(options.realtimeSessionId)) {
      throw new TypeError('realtimeSessionId must be a safe nonblank identifier')
    }

    if (
      !Number.isInteger(options.maxEntries)
      || options.maxEntries < 1
      || options.maxEntries > MAX_ENTRIES
    ) {
      throw new RangeError(`maxEntries must be an integer from 1 to ${MAX_ENTRIES}`)
    }

    this.#realtimeSessionId = options.realtimeSessionId
    this.#maxEntries = options.maxEntries
    this.#eventSink = options.eventSink
  }

  addCompleted(completion: TranscriptCompletion): void {
    if (completion.realtimeSessionId !== this.#realtimeSessionId) {
      this.#emit({
        event: 'transcript_unavailable',
        realtimeSessionId: this.#realtimeSessionId,
        itemCount: this.#entries.length,
        turnCount: this.#turnCount(),
        status: 'info',
        reason: 'cause=stale_realtime_session',
      })
      return
    }

    const itemId = completion.itemId
    const turnId = completion.turnId
    const transcript = completion.transcript

    if (!isSafeIdentifier(itemId) || !isSafeIdentifier(turnId)) {
      this.#emit({
        event: 'transcript_unavailable',
        realtimeSessionId: this.#realtimeSessionId,
        itemCount: this.#entries.length,
        turnCount: this.#turnCount(),
        status: 'degraded',
        reason: 'cause=invalid_transcript_identifier',
      })
      return
    }

    if (typeof transcript === 'string' && transcript.length > MAX_TRANSCRIPT_LENGTH) {
      this.#emit({
        event: 'transcript_unavailable',
        realtimeSessionId: this.#realtimeSessionId,
        itemId,
        turnId,
        itemCount: this.#entries.length,
        turnCount: this.#turnCount(),
        status: 'degraded',
        reason: 'cause=transcript_too_large',
      })
      return
    }

    if (
      completion.status === 'failed' ||
      typeof transcript !== 'string' ||
      transcript.trim().length === 0
    ) {
      this.#emit({
        event: 'transcript_unavailable',
        realtimeSessionId: this.#realtimeSessionId,
        itemId,
        turnId,
        itemCount: this.#entries.length,
        turnCount: this.#turnCount(),
        status: 'degraded',
        reason: 'cause=transcript_unavailable',
      })
      return
    }

    const entry: TranscriptBufferEntry = { itemId, turnId, transcript }
    const existingEntry = this.#entriesByItemId.get(itemId)
    if (existingEntry === undefined) {
      this.#entries.push(entry)
    } else {
      const existingIndex = this.#entries.indexOf(existingEntry)
      if (existingIndex === -1) {
        this.#entries.push(entry)
      } else {
        this.#entries[existingIndex] = entry
      }
    }
    this.#entriesByItemId.set(itemId, entry)

    const droppedEntries: TranscriptBufferEntry[] = []
    while (this.#entries.length > this.#maxEntries) {
      const dropped = this.#entries.shift()
      if (dropped === undefined) {
        break
      }
      droppedEntries.push(dropped)
      if (this.#entriesByItemId.get(dropped.itemId) === dropped) {
        this.#entriesByItemId.delete(dropped.itemId)
      }
    }

    if (droppedEntries.length > 0) {
      const remainingTurnIds = this.#turnIds()
      const droppedTurnIds = new Set(
        droppedEntries
          .map((dropped) => dropped.turnId)
          .filter((turnId) => !remainingTurnIds.has(turnId)),
      )

      this.#emit({
        event: 'transcript_buffer_overflow',
        realtimeSessionId: this.#realtimeSessionId,
        itemCount: this.#entries.length,
        turnCount: remainingTurnIds.size,
        droppedItemCount: droppedEntries.length,
        droppedTurnCount: droppedTurnIds.size,
        status: 'degraded',
        reason: 'cause=transcript_buffer_overflow',
      })
      return
    }

    this.#emit({
      event: 'transcript_available',
      realtimeSessionId: this.#realtimeSessionId,
      itemId,
      turnId,
      itemCount: this.#entries.length,
      turnCount: this.#turnCount(),
      status: 'success',
      reason: 'cause=transcript_available',
    })
  }

  get(itemId: string): TranscriptBufferEntry | undefined {
    const entry = this.#entriesByItemId.get(itemId)
    return entry === undefined ? undefined : this.#copyEntry(entry)
  }

  current(): TranscriptBufferProjection {
    return {
      realtimeSessionId: this.#realtimeSessionId,
      itemCount: this.#entries.length,
      turnCount: this.#turnCount(),
      entries: this.#entries.map((entry) => this.#copyEntry(entry)),
    }
  }

  clear(reason: string): number {
    const itemCount = this.#entries.length
    const turnCount = this.#turnCount()

    this.#entries.length = 0
    this.#entriesByItemId.clear()

    this.#emit({
      event: 'transcript_buffer_cleared',
      realtimeSessionId: this.#realtimeSessionId,
      itemCount,
      turnCount,
      status: 'info',
      reason: normalizeClearReason(reason),
    })

    return itemCount
  }

  #turnIds(): Set<string> {
    return new Set(this.#entries.map((entry) => entry.turnId))
  }

  #turnCount(): number {
    return this.#turnIds().size
  }

  #copyEntry(entry: TranscriptBufferEntry): TranscriptBufferEntry {
    return {
      itemId: entry.itemId,
      turnId: entry.turnId,
      transcript: entry.transcript,
    }
  }

  #emit(event: TranscriptBufferEvent): void {
    try {
      this.#eventSink(event)
    } catch {
      // Metadata delivery is best-effort and must not gate transcript handling.
    }
  }
}

function normalizeClearReason(reason: string): string {
  switch (reason) {
    case 'close':
      return 'cause=close'
    case 'manual_stop':
      return 'cause=manual_stop'
    case 'offline_loop':
      return 'cause=offline_loop'
    case 'rollover':
      return 'cause=rollover'
    case 'renderer_restart':
      return 'cause=renderer_restart'
    case 'cause=session_close':
      return 'cause=session_close'
    default:
      return 'cause=transcript_buffer_cleared'
  }
}

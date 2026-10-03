export type SessionCleanupBoundary =
  | 'close'
  | 'manual_stop'
  | 'offline_loop'
  | 'rollover'
  | 'renderer_restart'

type MaybePromise<T> = T | PromiseLike<T>

type MetadataEvent = Record<string, unknown>

interface SessionCleanupInput {
  readonly currentRealtimeSessionId: string
  readonly transcriptBuffer: {
    readonly clear: (boundary: SessionCleanupBoundary) => MaybePromise<number>
  }
  readonly clearCurrentTranscriptView: (
    boundary: SessionCleanupBoundary,
  ) => MaybePromise<void>
  readonly metadataSink: (event: MetadataEvent) => MaybePromise<void>
}

export interface SessionCleanup {
  run(boundary: SessionCleanupBoundary): Promise<void>
}

export function createSessionCleanup(
  input: SessionCleanupInput,
): SessionCleanup {
  const run = async (boundary: SessionCleanupBoundary): Promise<void> => {
    let cleanupFailed = false
    let count: number | undefined

    try {
      count = await input.transcriptBuffer.clear(boundary)
    } catch {
      cleanupFailed = true
    }

    try {
      await input.clearCurrentTranscriptView(boundary)
    } catch {
      cleanupFailed = true
    }

    const event: MetadataEvent = cleanupFailed
      ? {
          event: 'cleanup_failed',
          boundary,
          session_id: input.currentRealtimeSessionId,
          status: 'failed',
          reason: 'cleanup_failed',
        }
      : {
          event: 'transcript_buffer_cleared',
          boundary,
          session_id: input.currentRealtimeSessionId,
          count,
          status: 'success',
          reason: boundary,
        }

    try {
      await input.metadataSink(event)
    } catch {
      // Metadata delivery cannot gate RAM cleanup.
    }
  }

  return Object.freeze({ run })
}

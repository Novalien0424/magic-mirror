import type { RealtimeSessionHandle } from './realtime-session-adapter'
import type { PlaybackCompletionTransport } from './playback-completion'

const OUTPUT_AUDIO_BUFFER_STOPPED = 'output_audio_buffer.stopped'

type PlaybackCompletionListener = Parameters<PlaybackCompletionTransport['on']>[1]
type PlaybackCompletionSession = Pick<RealtimeSessionHandle, 'onOutputAudioBufferStopped'>

interface PlaybackCompletionSubscription {
  readonly disposer: () => void
}

export interface PlaybackCompletionTransportAdapter extends PlaybackCompletionTransport {
  dispose(): void
}

export class PlaybackCompletionTransportDisposeError extends Error {
  readonly reason = 'listener_dispose_failed' as const
  readonly count: number

  constructor(count: number) {
    super('Playback completion transport disposal failed')
    this.name = 'PlaybackCompletionTransportDisposeError'
    this.count = count
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export function createPlaybackCompletionTransport(
  session: PlaybackCompletionSession,
): PlaybackCompletionTransportAdapter {
  const subscriptions = new Map<PlaybackCompletionListener, PlaybackCompletionSubscription>()
  let disposed = false

  const on = (eventName: string, listener: PlaybackCompletionListener): void => {
    if (disposed || eventName !== OUTPUT_AUDIO_BUFFER_STOPPED || subscriptions.has(listener)) {
      return
    }

    const disposer = session.onOutputAudioBufferStopped(() => (listener as () => void)())
    subscriptions.set(listener, { disposer })
  }

  const off = (eventName: string, listener: PlaybackCompletionListener): void => {
    if (disposed || eventName !== OUTPUT_AUDIO_BUFFER_STOPPED) return

    const subscription = subscriptions.get(listener)
    if (subscription === undefined) return
    try {
      subscription.disposer()
      subscriptions.delete(listener)
    } catch {
      // The facade must not expose a raw provider disposer failure.
    }
  }

  const dispose = (): void => {
    disposed = true
    let failedCount = 0

    for (const [listener, subscription] of [...subscriptions]) {
      try {
        subscription.disposer()
        subscriptions.delete(listener)
      } catch {
        failedCount += 1
      }
    }

    if (failedCount > 0) {
      throw new PlaybackCompletionTransportDisposeError(failedCount)
    }
  }

  return Object.freeze({ on, off, dispose })
}

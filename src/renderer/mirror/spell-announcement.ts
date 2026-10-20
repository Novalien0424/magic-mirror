import { REALTIME_PROMPTS } from '../../shared/realtime-prompts'
import type { AvatarAudioActivity } from '../avatar/audio/avatar-audio-coordinator'

export type SpellAnnouncementResult = { readonly status: 'completed' }
  | { readonly status: 'failed'; readonly reason: string }

/** Only processed output activity (including its tail) can complete an announcement. */
export function createSpellAnnouncement(input: { speak(text: string, signal: AbortSignal, finished: (completed: boolean) => void): boolean }) {
  let disposed = false
  let pending: { settle(result: SpellAnnouncementResult): void } | null = null
  const cancel = (reason = 'spell_announcement_cancelled'): void => pending?.settle({ status: 'failed', reason })
  return {
    run(text = REALTIME_PROMPTS.spellAnnouncement): Promise<SpellAnnouncementResult> {
      cancel()
      if (disposed) return Promise.resolve({ status: 'failed', reason: 'spell_announcement_cancelled' })
      return new Promise(resolve => {
        const controller = new AbortController()
        const current = { settle(result: SpellAnnouncementResult) {
          if (pending !== current) return
          clearTimeout(timeout)
          pending = null
          if (result.status === 'failed') controller.abort()
          resolve(result)
        } }
        const timeout = setTimeout(() => current.settle({ status: 'failed', reason: 'spell_announcement_timeout' }), 12_000)
        pending = current
        try {
          if (!input.speak(text, controller.signal, completed => current.settle(completed
            ? { status: 'completed' } : { status: 'failed', reason: 'spell_announcement_output_interrupted' }))) current.settle({ status: 'failed', reason: 'spell_announcement_unavailable' })
        } catch { current.settle({ status: 'failed', reason: 'spell_announcement_unavailable' }) }
      })
    },
    handleActivity(activity: AvatarAudioActivity): void {
      if (activity === 'speech_started') { cancel('spell_announcement_visitor_speech'); return }
      // Global audio events can belong to scene dialogue or a cancelled model
      // reply. Only this cue's response completion callback can settle it.
    },
    cancel,
    dispose(): void { disposed = true; cancel() },
  }
}

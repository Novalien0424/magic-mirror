import { REALTIME_PROMPTS } from '../../shared/realtime-prompts'
import type { AvatarAudioActivity } from '../avatar/audio/avatar-audio-coordinator'

export type SpellAnnouncementResult = { readonly status: 'completed' }
  | { readonly status: 'failed'; readonly reason: string }

/** Only processed output activity (including its tail) can complete an announcement. */
export function createSpellAnnouncement(input: { speak(text: string): boolean }) {
  let disposed = false
  let pending: { started: boolean; settle(result: SpellAnnouncementResult): void } | null = null
  const cancel = (reason = 'spell_announcement_cancelled'): void => pending?.settle({ status: 'failed', reason })
  return {
    run(): Promise<SpellAnnouncementResult> {
      cancel()
      if (disposed) return Promise.resolve({ status: 'failed', reason: 'spell_announcement_cancelled' })
      return new Promise(resolve => {
        const current = { started: false, settle(result: SpellAnnouncementResult) {
          if (pending !== current) return
          clearTimeout(timeout)
          pending = null
          resolve(result)
        } }
        const timeout = setTimeout(() => current.settle({ status: 'failed', reason: 'spell_announcement_timeout' }), 12_000)
        pending = current
        try {
          if (!input.speak(REALTIME_PROMPTS.spellAnnouncement)) current.settle({ status: 'failed', reason: 'spell_announcement_unavailable' })
        } catch { current.settle({ status: 'failed', reason: 'spell_announcement_unavailable' }) }
      })
    },
    handleActivity(activity: AvatarAudioActivity): void {
      if (activity === 'speech_started') { cancel('spell_announcement_visitor_speech'); return }
      if (activity === 'interrupted') { cancel('spell_announcement_output_interrupted'); return }
      if (pending === null) return
      if (activity === 'output_started') pending.started = true
      if (activity === 'output_stopped' && pending.started) pending.settle({ status: 'completed' })
    },
    cancel,
    dispose(): void { disposed = true; cancel() },
  }
}

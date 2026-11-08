import type { LifecycleState } from '../shared/types'

export type JabraVoiceLevelReason = 'jabra_voice_level_reset' | 'jabra_voice_level_qa_skipped'

/**
 * The Jabra keeps a separate stored volume for its call path, which a conversation's
 * echo-cancelled capture enters (found 2026-11-08; the app's wake listener does not). A write made
 * there persists, and the level stays after the capture closes. It had been left at step 0
 * (muted) during the 11-07 sound work, and START's and STOP's resets, run outside a call, never
 * reached it. The first conversation after each app start, START or STUDIO returns it to the
 * Jabra's normal level (`stop-state --reset-voice`, which watches the switch for 10 s). Later
 * conversations keep what the visitor set with the Jabra's buttons. QA runs keep their quiet
 * levels and only report the skip.
 */
export function createJabraVoiceLevel(input: {
  readonly enabled: boolean
  reset(): Promise<void>
  report(reason: JabraVoiceLevelReason): void
  degraded(reason: 'jabra_voice_level_reset_failed'): void
}) {
  let armed = true, running = false, covered = false, skipReported = false
  return {
    arm(): void { armed = true },
    /** Main passes every lifecycle change. The helper starts as the conversation opens the microphone. */
    lifecycle(state: LifecycleState): void {
      // A conversation that reached active while the helper watched it has its call volume set.
      if (state === 'active' && running) { covered = true; return }
      if (state !== 'activating' || !armed || running) return
      if (!input.enabled) {
        armed = false
        if (!skipReported) { skipReported = true; input.report('jabra_voice_level_qa_skipped') }
        return
      }
      running = true; covered = false
      void input.reset().then(() => {
        input.report('jabra_voice_level_reset')
        if (covered) armed = false
      }, () => {
        // Retried by the next conversation.
        input.degraded('jabra_voice_level_reset_failed')
      }).finally(() => { running = false })
    },
  }
}

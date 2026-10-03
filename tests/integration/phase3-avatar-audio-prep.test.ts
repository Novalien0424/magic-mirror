import { describe, expect, it } from 'vitest'

import { validateCubismModelBundle } from '../../src/main/avatar/model-bundle'
import { projectAvatarState } from '../../src/renderer/avatar/avatar-state'
import {
  createLipSyncDriver,
  type AnimationFrameScheduler,
} from '../../src/renderer/avatar/audio/lip-sync-driver'
import { createMusicDuckingController } from '../../src/renderer/avatar/audio/music-ducking'
import { projectMirrorSnapshot } from '../../src/renderer/mirror/App'

class OneFrameScheduler implements AnimationFrameScheduler {
  private callback: ((timestampMs: number) => void) | null = null

  request(callback: (timestampMs: number) => void): number {
    this.callback = callback
    return 1
  }

  cancel(): void {
    this.callback = null
  }

  fire(timestampMs: number): void {
    const callback = this.callback
    if (callback === null) throw new Error('no_scheduled_frame')
    this.callback = null
    callback(timestampMs)
  }
}

describe('Phase 3 deterministic avatar/audio preparation', () => {
  it('runs state, speaking, interruption, music, and asset-failure boundaries without devices', () => {
    const states = [
      projectAvatarState({ lifecycle: 'dormant' }),
      projectAvatarState({ lifecycle: 'activating' }),
      projectAvatarState({ lifecycle: 'active', conversation: 'listening' }),
      projectAvatarState({ lifecycle: 'active', conversation: 'thinking' }),
      projectAvatarState({ lifecycle: 'active', conversation: 'speaking' }),
      projectAvatarState({ lifecycle: 'active', conversation: 'scene' }),
      projectAvatarState({ lifecycle: 'suspending' }),
    ]
    expect(states).toEqual([
      'Dormant',
      'Waking',
      'Listening',
      'Thinking',
      'Speaking',
      'Scene',
      'Suspending',
    ])

    const scheduler = new OneFrameScheduler()
    const mouthValues: number[] = []
    const lipEvents: unknown[] = []
    const lipSync = createLipSyncDriver({
      analyser: {
        fftSize: 4,
        getFloatTimeDomainData: (samples) => samples.fill(0.5),
      },
      mouth: { setMouthOpen: (value) => mouthValues.push(value) },
      scheduler,
      envelope: { silenceThreshold: 0.05, gain: 1, attackMs: 16, releaseMs: 32 },
      eventSink: (event) => lipEvents.push(event),
    })
    const gainRamps: Array<{ target: number; durationMs: number }> = []
    const musicEvents: unknown[] = []
    const music = createMusicDuckingController({
      tuning: { normalGain: 1, duckedGain: 0.25, duckMs: 150, restoreMs: 400, fadeOutMs: 2_000 },
      gain: { rampTo: (target, durationMs) => gainRamps.push({ target, durationMs }) },
      eventSink: (event) => musicEvents.push(event),
    })

    music.setSpeechActive(true)
    lipSync.start()
    scheduler.fire(100)
    lipSync.stop()
    music.setSpeechActive(false)
    music.fadeOut()

    expect(mouthValues).toEqual([0.5, 0])
    expect(gainRamps).toEqual([
      { target: 0.25, durationMs: 150 },
      { target: 1, durationMs: 400 },
      { target: 0, durationMs: 2_000 },
    ])
    expect(lipEvents).toEqual([])
    expect(musicEvents).toEqual([])

    const invalidBundle = validateCubismModelBundle({ model3: null, files: new Set() })
    expect(invalidBundle).toEqual({ ok: false, reason: 'avatar_model_manifest_invalid' })
    expect(projectMirrorSnapshot({
      lifecycle: 'maintenance',
      maintenance: { code: invalidBundle.ok ? 'unexpected' : invalidBundle.reason },
    })).toEqual({
      state: 'maintenance',
      className: 'screen screen--maintenance',
      title: 'Maintenance',
      detail: 'avatar_model_manifest_invalid',
    })
  })
})

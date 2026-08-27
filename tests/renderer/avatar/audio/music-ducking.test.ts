import { describe, expect, it } from 'vitest'

import {
  createMusicDuckingController,
  type MusicDuckingEvent,
} from '../../../../src/renderer/avatar/audio/music-ducking'

const tuning = {
  normalGain: 1,
  duckedGain: 0.25,
  duckMs: 150,
  restoreMs: 400,
  fadeOutMs: 2_000,
}

describe('createMusicDuckingController', () => {
  it('ducks for speech and restores smoothly afterward', () => {
    const ramps: Array<{ target: number; durationMs: number }> = []
    const controller = createMusicDuckingController({
      tuning,
      gain: { rampTo: (target, durationMs) => ramps.push({ target, durationMs }) },
      eventSink: () => undefined,
    })

    controller.setSpeechActive(true)
    controller.setSpeechActive(false)

    expect(ramps).toEqual([
      { target: 0.25, durationMs: 150 },
      { target: 1, durationMs: 400 },
    ])
  })

  it('avoids duplicate ramps and stays faded until explicitly restored', () => {
    const ramps: Array<{ target: number; durationMs: number }> = []
    const controller = createMusicDuckingController({
      tuning,
      gain: { rampTo: (target, durationMs) => ramps.push({ target, durationMs }) },
      eventSink: () => undefined,
    })

    controller.setSpeechActive(true)
    controller.setSpeechActive(true)
    controller.fadeOut()
    controller.setSpeechActive(false)
    controller.restore()

    expect(ramps).toEqual([
      { target: 0.25, durationMs: 150 },
      { target: 0, durationMs: 2_000 },
      { target: 1, durationMs: 400 },
    ])
  })

  it('reports gain failure without gating conversation', () => {
    const events: MusicDuckingEvent[] = []
    const controller = createMusicDuckingController({
      tuning,
      gain: { rampTo: () => { throw new Error('audio device internals') } },
      eventSink: (event) => events.push(event),
    })

    expect(() => controller.setSpeechActive(true)).not.toThrow()
    expect(events).toEqual([{ status: 'degraded', reason: 'music_gain_write_failed' }])
  })

  it('rejects invalid gain tuning with a stable reason', () => {
    expect(() => createMusicDuckingController({
      tuning: { ...tuning, duckedGain: 2 },
      gain: { rampTo: () => undefined },
      eventSink: () => undefined,
    })).toThrowError('music_ducking_configuration_invalid')
  })
})

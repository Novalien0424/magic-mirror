export interface MusicGainPort {
  rampTo(target: number, durationMs: number): void
}

export interface MusicDuckingTuning {
  readonly normalGain: number
  readonly duckedGain: number
  readonly duckMs: number
  readonly restoreMs: number
  readonly fadeOutMs: number
}

export interface MusicDuckingEvent {
  readonly status: 'degraded'
  readonly reason: 'music_gain_write_failed'
}

export interface MusicDuckingController {
  setSpeechActive(active: boolean): void
  fadeOut(): void
  restore(): void
}

export interface CreateMusicDuckingControllerInput {
  readonly tuning: MusicDuckingTuning
  readonly gain: MusicGainPort
  readonly eventSink: (event: MusicDuckingEvent) => void
}

type AppliedGainState = 'normal' | 'ducked' | 'faded'

function unit(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1
}

function duration(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

function validTuning(value: MusicDuckingTuning): boolean {
  return unit(value.normalGain)
    && unit(value.duckedGain)
    && value.duckedGain <= value.normalGain
    && duration(value.duckMs)
    && duration(value.restoreMs)
    && duration(value.fadeOutMs)
}

export function createMusicDuckingController(
  input: CreateMusicDuckingControllerInput,
): MusicDuckingController {
  if (!validTuning(input.tuning)) throw new Error('music_ducking_configuration_invalid')

  let appliedState: AppliedGainState = 'normal'
  let speechActive = false

  const reportFailure = (): void => {
    try {
      input.eventSink({ status: 'degraded', reason: 'music_gain_write_failed' })
    } catch {
      // Metadata delivery never gates conversation or local audio control.
    }
  }

  const apply = (state: AppliedGainState, target: number, durationMs: number): void => {
    if (appliedState === state) return
    try {
      input.gain.rampTo(target, durationMs)
      appliedState = state
    } catch {
      reportFailure()
    }
  }

  return Object.freeze({
    setSpeechActive: (active: boolean): void => {
      speechActive = active
      if (appliedState === 'faded') return
      if (active) apply('ducked', input.tuning.duckedGain, input.tuning.duckMs)
      else apply('normal', input.tuning.normalGain, input.tuning.restoreMs)
    },
    fadeOut: (): void => {
      speechActive = false
      apply('faded', 0, input.tuning.fadeOutMs)
    },
    restore: (): void => {
      if (speechActive) apply('ducked', input.tuning.duckedGain, input.tuning.duckMs)
      else apply('normal', input.tuning.normalGain, input.tuning.restoreMs)
    },
  })
}

import {
  advanceLipSyncEnvelope,
  type LipSyncEnvelopeOptions,
} from './lipSyncMath'

const MAX_ANALYSER_SAMPLES = 32_768
const FIRST_FRAME_DELTA_MS = 16

export interface LipSyncAnalyser {
  readonly fftSize: number
  getFloatTimeDomainData(samples: Float32Array): void
}

export interface AvatarMouthPort {
  setMouthOpen(value: number): void
}

export interface AnimationFrameScheduler {
  request(callback: (timestampMs: number) => void): number
  cancel(id: number): void
}

export type LipSyncDriverReason =
  | 'avatar_analyser_failed'
  | 'avatar_analyser_samples_invalid'
  | 'avatar_mouth_write_failed'
  | 'avatar_frame_schedule_failed'

export interface LipSyncDriverEvent {
  readonly status: 'degraded'
  readonly reason: LipSyncDriverReason
}

export interface LipSyncDriver {
  start(): void
  stop(): void
}

export interface CreateLipSyncDriverInput {
  readonly analyser: LipSyncAnalyser
  readonly mouth: AvatarMouthPort
  readonly scheduler: AnimationFrameScheduler
  readonly envelope: LipSyncEnvelopeOptions
  readonly eventSink: (event: LipSyncDriverEvent) => void
}

function analyserSampleSize(fftSize: number): number {
  if (!Number.isFinite(fftSize)) return 1
  return Math.min(MAX_ANALYSER_SAMPLES, Math.max(1, Math.floor(fftSize)))
}

export function createLipSyncDriver(input: CreateLipSyncDriverInput): LipSyncDriver {
  const samples = new Float32Array(analyserSampleSize(input.analyser.fftSize))
  let running = false
  let frameId: number | null = null
  let previousTimestampMs: number | null = null
  let mouthOpen = 0

  const report = (reason: LipSyncDriverReason): void => {
    try {
      input.eventSink({ status: 'degraded', reason })
    } catch {
      // Metadata delivery never gates the local animation boundary.
    }
  }

  const cancelPendingFrame = (): void => {
    if (frameId === null) return
    try {
      input.scheduler.cancel(frameId)
    } catch {
      // Cancellation is best-effort; the running flag rejects a stale callback.
    }
    frameId = null
  }

  const halt = (reason: LipSyncDriverReason, zeroMouth: boolean): void => {
    running = false
    cancelPendingFrame()
    previousTimestampMs = null
    mouthOpen = 0
    if (zeroMouth) {
      try {
        input.mouth.setMouthOpen(0)
      } catch {
        report('avatar_mouth_write_failed')
        return
      }
    }
    report(reason)
  }

  const schedule = (): void => {
    if (!running || frameId !== null) return
    try {
      frameId = input.scheduler.request(onFrame)
    } catch {
      halt('avatar_frame_schedule_failed', true)
    }
  }

  const onFrame = (timestampMs: number): void => {
    frameId = null
    if (!running) return

    try {
      input.analyser.getFloatTimeDomainData(samples)
    } catch {
      halt('avatar_analyser_failed', true)
      return
    }

    const deltaMs = previousTimestampMs === null
      ? FIRST_FRAME_DELTA_MS
      : Math.max(0, timestampMs - previousTimestampMs)
    const result = advanceLipSyncEnvelope(mouthOpen, {
      samples,
      playback: 'playing',
      deltaMs,
    }, input.envelope)
    if (result.status === 'invalid') {
      halt('avatar_analyser_samples_invalid', true)
      return
    }
    mouthOpen = result.mouthOpen
    previousTimestampMs = timestampMs

    try {
      input.mouth.setMouthOpen(mouthOpen)
    } catch {
      halt('avatar_mouth_write_failed', false)
      return
    }
    schedule()
  }

  return Object.freeze({
    start: (): void => {
      if (running) return
      running = true
      previousTimestampMs = null
      schedule()
    },
    stop: (): void => {
      running = false
      cancelPendingFrame()
      previousTimestampMs = null
      mouthOpen = 0
      try {
        input.mouth.setMouthOpen(0)
      } catch {
        report('avatar_mouth_write_failed')
      }
    },
  })
}

import { describe, expect, it } from 'vitest'

import {
  createLipSyncDriver,
  type AnimationFrameScheduler,
  type AvatarMouthPort,
  type LipSyncDriverEvent,
} from '../../../../src/renderer/avatar/audio/lip-sync-driver'

class ControlledScheduler implements AnimationFrameScheduler {
  private nextId = 1
  private pending = new Map<number, (timestampMs: number) => void>()
  readonly cancelled: number[] = []

  request(callback: (timestampMs: number) => void): number {
    const id = this.nextId
    this.nextId += 1
    this.pending.set(id, callback)
    return id
  }

  cancel(id: number): void {
    this.cancelled.push(id)
    this.pending.delete(id)
  }

  fire(timestampMs: number): void {
    const entry = this.pending.entries().next().value as
      | [number, (timestampMs: number) => void]
      | undefined
    if (entry === undefined) throw new Error('no_scheduled_frame')
    this.pending.delete(entry[0])
    entry[1](timestampMs)
  }

  get pendingCount(): number {
    return this.pending.size
  }
}

function createMouthPort(values: number[]): AvatarMouthPort {
  return { setMouthOpen: (value) => values.push(value) }
}

const envelope = {
  silenceThreshold: 0.05,
  gain: 1,
  attackMs: 16,
  releaseMs: 32,
}

describe('createLipSyncDriver', () => {
  it('drives the mouth from analyser samples on animation frames', () => {
    const scheduler = new ControlledScheduler()
    const mouthValues: number[] = []
    const analyser = {
      fftSize: 4,
      getFloatTimeDomainData: (samples: Float32Array) => samples.fill(0.5),
    }
    const driver = createLipSyncDriver({
      analyser,
      mouth: createMouthPort(mouthValues),
      scheduler,
      envelope,
      eventSink: () => undefined,
    })

    driver.start()
    scheduler.fire(100)

    expect(mouthValues).toEqual([0.5])
    expect(scheduler.pendingCount).toBe(1)
  })

  it('starts only one animation loop and zeros synchronously when stopped', () => {
    const scheduler = new ControlledScheduler()
    const mouthValues: number[] = []
    const driver = createLipSyncDriver({
      analyser: {
        fftSize: 2,
        getFloatTimeDomainData: (samples) => samples.fill(1),
      },
      mouth: createMouthPort(mouthValues),
      scheduler,
      envelope,
      eventSink: () => undefined,
    })

    driver.start()
    driver.start()
    expect(scheduler.pendingCount).toBe(1)

    driver.stop()

    expect(mouthValues).toEqual([0])
    expect(scheduler.pendingCount).toBe(0)
    expect(scheduler.cancelled).toEqual([1])
  })

  it('zeros, reports one bounded reason, and stops after analyser failure', () => {
    const scheduler = new ControlledScheduler()
    const mouthValues: number[] = []
    const events: LipSyncDriverEvent[] = []
    const driver = createLipSyncDriver({
      analyser: {
        fftSize: 2,
        getFloatTimeDomainData: () => { throw new Error('raw device details') },
      },
      mouth: createMouthPort(mouthValues),
      scheduler,
      envelope,
      eventSink: (event) => events.push(event),
    })

    driver.start()
    scheduler.fire(100)

    expect(mouthValues).toEqual([0])
    expect(events).toEqual([{ status: 'degraded', reason: 'avatar_analyser_failed' }])
    expect(scheduler.pendingCount).toBe(0)
  })

  it('stops visibly when the analyser returns invalid samples', () => {
    const scheduler = new ControlledScheduler()
    const mouthValues: number[] = []
    const events: LipSyncDriverEvent[] = []
    const driver = createLipSyncDriver({
      analyser: {
        fftSize: 2,
        getFloatTimeDomainData: (samples) => samples.fill(Number.NaN),
      },
      mouth: createMouthPort(mouthValues),
      scheduler,
      envelope,
      eventSink: (event) => events.push(event),
    })

    driver.start()
    scheduler.fire(100)

    expect(mouthValues).toEqual([0])
    expect(events).toEqual([{ status: 'degraded', reason: 'avatar_analyser_samples_invalid' }])
    expect(scheduler.pendingCount).toBe(0)
  })

  it('reports mouth-port failure without leaking the caught error', () => {
    const scheduler = new ControlledScheduler()
    const events: LipSyncDriverEvent[] = []
    const driver = createLipSyncDriver({
      analyser: {
        fftSize: 2,
        getFloatTimeDomainData: (samples) => samples.fill(0.5),
      },
      mouth: { setMouthOpen: () => { throw new Error('model internals') } },
      scheduler,
      envelope,
      eventSink: (event) => events.push(event),
    })

    driver.start()
    scheduler.fire(100)

    expect(events).toEqual([{ status: 'degraded', reason: 'avatar_mouth_write_failed' }])
    expect(scheduler.pendingCount).toBe(0)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWakeSupervisor, type WakeWorkerChild } from '../../../src/main/wake/supervisor'
import { createWakeCalibration } from '../../../src/main/wake/calibration'
import type { WakeWorkerCommand, WakeWorkerOutcome } from '../../../src/main/wake/protocol'

const wakePackage = {
  packageId: 'magic-mirror-zh-test-v1',
  engine: 'sherpa' as const,
  engineVersion: '1.13.6',
  modelVersion: 'test-v1',
  phrase: '魔鏡阿魔鏡',
  sampleRateHz: 16_000 as const,
  artifactPaths: { model: 'fixture/model.onnx' },
  tuning: { threshold: 0.25, score: 1.5 },
}

class FakeChild implements WakeWorkerChild {
  private readonly listeners = new Map<string, Array<(...args: never[]) => void>>()
  readonly commands: WakeWorkerCommand[] = []
  readonly kill = vi.fn()

  on(event: 'message' | 'exit', listener: (...args: never[]) => void): void {
    const current = this.listeners.get(event) ?? []
    current.push(listener)
    this.listeners.set(event, current)
  }

  postMessage(command: WakeWorkerCommand): void {
    this.commands.push(command)
  }

  emitMessage(message: WakeWorkerOutcome | unknown): void {
    for (const listener of this.listeners.get('message') ?? []) listener(message as never)
  }

  emitExit(): void {
    for (const listener of this.listeners.get('exit') ?? []) listener(1 as never)
  }
}

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

describe('wake worker supervisor', () => {
  it.each(['send', 'timer'] as const)('reports a replacement worker %s failure instead of staying restarting', async (failure) => {
    const first = new FakeChild(), second = new FakeChild()
    const spawn = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second)
    let failTimer = false
    const supervisor = createWakeSupervisor({ spawn, onWake() {},
      scheduleTimeout: (callback, delay) => {
        if (failTimer) throw new Error('synthetic timer failure')
        return setTimeout(callback, delay)
      } })
    const started = supervisor.start({ package: wakePackage })
    first.emitMessage({ type: 'ready', requestId: first.commands[0].requestId, packageId: wakePackage.packageId })
    await started
    if (failure === 'send') vi.spyOn(second, 'postMessage').mockImplementation(() => { throw new Error('synthetic send failure') })
    else failTimer = true
    first.emitExit()
    await flush()
    const reason = `wake_worker_${failure}_failed`
    expect(supervisor.snapshot()).toMatchObject({ status: 'failed', reason,
      input: { recovery: { state: 'failed', attempts: 1, reason } } })
    expect(spawn).toHaveBeenCalledTimes(2)
    await supervisor.shutdown()
  })

  it('lets Start live test recover after automatic worker recovery is exhausted', async () => {
    class RespondingChild extends FakeChild {
      override postMessage(command: WakeWorkerCommand): void {
        super.postMessage(command)
        queueMicrotask(() => {
          if (command.type === 'initialize' || command.type === 'update_config') {
            this.emitMessage({ type: 'ready', requestId: command.requestId, packageId: command.package.packageId })
          } else if (command.type === 'acquire_microphone') {
            this.emitMessage({ type: 'microphone_acquired', requestId: command.requestId })
          } else if (command.type === 'release_microphone') {
            this.emitMessage({ type: 'microphone_released', requestId: command.requestId })
          } else if (command.type === 'shutdown') {
            this.emitMessage({ type: 'stopped', requestId: command.requestId })
          }
        })
      }
    }
    const children = [new RespondingChild(), new RespondingChild(), new RespondingChild()]
    const spawn = vi.fn(() => children[spawn.mock.calls.length - 1])
    const supervisor = createWakeSupervisor({ spawn, onWake() {} })
    await supervisor.start({ package: wakePackage })
    await supervisor.acquire()
    children[0].emitExit()
    await flush()
    children[1].emitExit()
    expect(supervisor.snapshot().reason).toBe('wake_worker_exit_repeated')
    expect(supervisor.snapshot().input.recovery).toMatchObject({ state: 'failed', attempts: 1 })
    await supervisor.release()
    expect(supervisor.snapshot().input.recovery?.state).toBe('failed')
    expect(spawn).toHaveBeenCalledTimes(2)
    const calibration = createWakeCalibration({ supervisor: () => supervisor, canListen: () => true,
      load: async () => wakePackage })
    try {
      const started = await calibration.command({ type: 'start', settings: {
        avatarId: 'ren', phrase: wakePackage.phrase, threshold: 0.18, score: 1, numTrailingBlanks: 1,
      } })
      expect(started.status).toBe('testing')
      expect(spawn).toHaveBeenCalledTimes(3)
      expect(children[2].commands.map(command => command.type)).toEqual(['initialize', 'acquire_microphone'])
      expect(supervisor.configuration()?.calibration).toBe(true)
      expect(supervisor.snapshot().input.recovery).toMatchObject({ state: 'restarting', attempts: 2 })
      children[2].emitMessage({ type: 'input_activity', blocks: 1, peak: 0.1, rms: 0.02 })
      expect(supervisor.snapshot().input.state).toBe('signal')
      expect(supervisor.snapshot().input.recovery).toMatchObject({ state: 'recovered', attempts: 2 })
      await calibration.stop(true)
      expect(supervisor.configuration()).toEqual(wakePackage)
      expect(spawn).toHaveBeenCalledTimes(3)
    } finally {
      await calibration.stop(false)
      await supervisor.shutdown()
    }
  })

  it('projects numerical detector progress and clears it when microphone ownership ends', async () => {
    const child = new FakeChild()
    const supervisor = createWakeSupervisor({ spawn: () => child, onWake() {} })
    const start = supervisor.start({ package: { ...wakePackage, calibration: true } })
    child.emitMessage({ type: 'ready', requestId: child.commands[0].requestId, packageId: wakePackage.packageId })
    await start
    const acquire = supervisor.acquire()
    child.emitMessage({ type: 'microphone_acquired', requestId: child.commands[1].requestId })
    await acquire
    const detector = { acousticScore: 0.81, matchedTokens: 4, totalTokens: 9, trailingBlanks: 1, decodedSteps: 5 }
    child.emitMessage({ type: 'input_activity', blocks: 1, peak: 0.1, rms: 0.01, detector })
    expect(supervisor.snapshot().input.detector).toEqual(detector)
    const release = supervisor.release()
    child.emitMessage({ type: 'microphone_released', requestId: child.commands[2].requestId })
    await release
    expect(supervisor.snapshot().input.detector).toBeNull()
  })

  it('counts calibration triggers without starting conversation or releasing the microphone', async () => {
    const child = new FakeChild()
    const onWake = vi.fn()
    const supervisor = createWakeSupervisor({ spawn: () => child, onWake })
    const start = supervisor.start({ package: { ...wakePackage, calibration: true } })
    child.emitMessage({ type: 'ready', requestId: child.commands[0].requestId, packageId: wakePackage.packageId })
    await start
    const acquire = supervisor.acquire()
    child.emitMessage({ type: 'microphone_acquired', requestId: child.commands[1].requestId })
    await acquire
    child.emitMessage({ type: 'input_activity', blocks: 1, peak: 0.1, rms: 0.01 })
    const event = { type: 'wake_detected' as const, packageId: wakePackage.packageId, modelVersion: wakePackage.modelVersion }
    child.emitMessage(event); child.emitMessage(event)
    expect(onWake).not.toHaveBeenCalled()
    expect(supervisor.snapshot()).toMatchObject({ status: 'listening', input: { detections: 2 } })
    const release = supervisor.release()
    child.emitMessage({ type: 'microphone_released', requestId: child.commands[2].requestId })
    await release
  })
  afterEach(() => vi.useRealTimers())

  it('verifies first audio, recovers a missing stream once, and fails visibly if replacement stalls', async () => {
    vi.useFakeTimers()
    const first = new FakeChild()
    const second = new FakeChild()
    const spawn = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second)
    const supervisor = createWakeSupervisor({ spawn, onWake() {} })
    const started = supervisor.start({ package: wakePackage })
    first.emitMessage({ type: 'ready', requestId: first.commands[0].requestId, packageId: wakePackage.packageId })
    await started
    const acquired = supervisor.acquire()
    first.emitMessage({ type: 'microphone_acquired', requestId: first.commands[1].requestId })
    await acquired
    expect(supervisor.snapshot()).toMatchObject({ status: 'acquiring', input: { state: 'waiting', blocks: 0 } })
    await vi.advanceTimersByTimeAsync(3001)
    expect(first.kill).toHaveBeenCalledOnce()
    expect(supervisor.snapshot().reason).toBe('wake_audio_stalled')
    first.emitExit()
    second.emitMessage({ type: 'ready', requestId: second.commands[0].requestId, packageId: wakePackage.packageId })
    await vi.advanceTimersByTimeAsync(0)
    second.emitMessage({ type: 'microphone_acquired', requestId: second.commands[1].requestId })
    await vi.advanceTimersByTimeAsync(3001)
    expect(second.kill).toHaveBeenCalledOnce()
    second.emitExit()
    expect(spawn).toHaveBeenCalledTimes(2)
    expect(supervisor.snapshot()).toMatchObject({ status: 'failed', input: { state: 'failed' } })
  })

  it('accepts real silent blocks as healthy, then detects an established stream stopping', async () => {
    vi.useFakeTimers()
    const child = new FakeChild()
    const supervisor = createWakeSupervisor({ spawn: () => child, onWake() {} })
    const started = supervisor.start({ package: wakePackage })
    child.emitMessage({ type: 'ready', requestId: child.commands[0].requestId, packageId: wakePackage.packageId })
    await started
    const acquired = supervisor.acquire()
    child.emitMessage({ type: 'microphone_acquired', requestId: child.commands[1].requestId })
    await acquired
    for (let blocks = 1; blocks <= 8; blocks++) {
      child.emitMessage({ type: 'input_activity', blocks, peak: 0, rms: 0 })
      await vi.advanceTimersByTimeAsync(500)
    }
    expect(supervisor.snapshot()).toMatchObject({ status: 'listening', input: { state: 'silent', blocks: 8 } })
    expect(child.kill).not.toHaveBeenCalled()
    child.emitMessage({ type: 'input_activity', blocks: 9, peak: 0.0005, rms: 0.0002 })
    expect(supervisor.snapshot().input).toMatchObject({ state: 'silent', peak: 0.0005, rms: 0.0002 })
    await vi.advanceTimersByTimeAsync(3001)
    expect(child.kill).toHaveBeenCalledOnce()
  })

  it('cancels recovery on conversation handoff and ignores messages from the exited worker', async () => {
    const first = new FakeChild()
    const second = new FakeChild()
    const children = [first, second]
    const supervisor = createWakeSupervisor({ spawn: () => children.shift()!, onWake() {} })
    const started = supervisor.start({ package: wakePackage })
    first.emitMessage({ type: 'ready', requestId: first.commands[0].requestId, packageId: wakePackage.packageId })
    await started
    const acquired = supervisor.acquire()
    first.emitMessage({ type: 'microphone_acquired', requestId: first.commands[1].requestId })
    await acquired
    first.emitExit()
    const released = supervisor.release()
    second.emitMessage({ type: 'ready', requestId: second.commands[0].requestId, packageId: wakePackage.packageId })
    second.emitMessage({ type: 'microphone_released', requestId: second.commands[1].requestId })
    await released
    await flush()
    expect(second.commands.map(command => command.type)).toEqual(['initialize', 'release_microphone'])
    first.emitMessage({ type: 'failed', reason: 'wake_microphone_failed' })
    expect(supervisor.snapshot().status).toBe('released')
    expect(second.kill).not.toHaveBeenCalled()
  })

  it('cancels the audio watchdog on release and shutdown', async () => {
    vi.useFakeTimers()
    const child = new FakeChild()
    const supervisor = createWakeSupervisor({ spawn: () => child, onWake() {} })
    const started = supervisor.start({ package: wakePackage })
    child.emitMessage({ type: 'ready', requestId: child.commands[0].requestId, packageId: wakePackage.packageId })
    await started
    const acquired = supervisor.acquire()
    child.emitMessage({ type: 'microphone_acquired', requestId: child.commands[1].requestId })
    await acquired
    const released = supervisor.release()
    child.emitMessage({ type: 'microphone_released', requestId: child.commands[2].requestId })
    await released
    await vi.advanceTimersByTimeAsync(5000)
    expect(child.kill).not.toHaveBeenCalled()
    const reacquired = supervisor.acquire()
    child.emitMessage({ type: 'microphone_acquired', requestId: child.commands[3].requestId })
    await reacquired
    child.emitMessage({ type: 'input_activity', blocks: 1, peak: 0.1, rms: 0.01 })
    expect(supervisor.snapshot().status).toBe('listening')
    const shutdown = supervisor.shutdown()
    child.emitMessage({ type: 'stopped', requestId: child.commands[4].requestId })
    await shutdown
    await vi.advanceTimersByTimeAsync(5000)
    expect(child.kill).toHaveBeenCalledOnce()
    expect(supervisor.snapshot().status).toBe('stopped')
  })

  it('does not reacquire during shutdown of a recovering worker', async () => {
    const first = new FakeChild()
    const second = new FakeChild()
    const children = [first, second]
    const supervisor = createWakeSupervisor({ spawn: () => children.shift()!, onWake() {} })
    const started = supervisor.start({ package: wakePackage })
    first.emitMessage({ type: 'ready', requestId: first.commands[0].requestId, packageId: wakePackage.packageId })
    await started
    const acquired = supervisor.acquire()
    first.emitMessage({ type: 'microphone_acquired', requestId: first.commands[1].requestId })
    await acquired
    first.emitExit()
    const shutdown = supervisor.shutdown()
    second.emitMessage({ type: 'ready', requestId: second.commands[0].requestId, packageId: wakePackage.packageId })
    second.emitMessage({ type: 'stopped', requestId: second.commands[1].requestId })
    await shutdown
    await flush()
    expect(second.commands.map(command => command.type)).toEqual(['initialize', 'shutdown'])
    expect(supervisor.snapshot().status).toBe('stopped')
  })
  it('distinguishes waiting, missing blocks, silence, signal and released input', async () => {
    const child = new FakeChild()
    let now = 0
    const supervisor = createWakeSupervisor({ spawn: () => child, onWake() {}, now: () => now })
    const started = supervisor.start({ package: wakePackage })
    child.emitMessage({ type: 'ready', requestId: child.commands[0].requestId, packageId: wakePackage.packageId })
    await started
    const acquired = supervisor.acquire()
    child.emitMessage({ type: 'microphone_acquired', requestId: child.commands[1].requestId })
    await acquired
    expect(supervisor.snapshot().input.state).toBe('waiting')
    now = 3500
    expect(supervisor.snapshot().input.state).toBe('stalled')
    child.emitMessage({ type: 'input_activity', blocks: 10, peak: 0, rms: 0 })
    expect(supervisor.snapshot().input).toMatchObject({ state: 'silent', blocks: 10, lastBlockAgeMs: 0 })
    child.emitMessage({ type: 'input_activity', blocks: 15, peak: 0.5, rms: 0.1 })
    expect(supervisor.snapshot().input).toMatchObject({ state: 'signal', peak: 0.5, detections: 0 })
    now = 7000
    expect(supervisor.snapshot().input).toMatchObject({ state: 'stalled', peak: 0, lastBlockAgeMs: 3500 })
    const released = supervisor.release()
    child.emitMessage({ type: 'microphone_released', requestId: child.commands[2].requestId })
    await released
    expect(supervisor.snapshot().input).toMatchObject({ state: 'inactive', peak: 0 })
    child.emitMessage({ type: 'input_activity', blocks: 20, peak: 1, rms: 1 })
    expect(supervisor.snapshot().input.state).toBe('inactive')
  })
  it('tracks ready/acquire/release and emits one wake for duplicate worker messages', async () => {
    const child = new FakeChild()
    const wakes: string[] = []
    const supervisor = createWakeSupervisor({
      spawn: () => child,
      onWake: (packageId) => wakes.push(packageId),
      requestTimeoutMs: 1_000,
    })

    const started = supervisor.start({ package: wakePackage })
    const initialize = child.commands[0]
    child.emitMessage({ type: 'ready', requestId: initialize.requestId, packageId: wakePackage.packageId })
    await expect(started).resolves.toEqual({ status: 'success', reason: 'wake_worker_ready' })

    const acquired = supervisor.acquire()
    const acquire = child.commands[1]
    child.emitMessage({ type: 'microphone_acquired', requestId: acquire.requestId })
    await expect(acquired).resolves.toEqual({ status: 'success', reason: 'wake_microphone_acquired' })

    const detection = {
      type: 'wake_detected' as const,
      packageId: wakePackage.packageId,
      modelVersion: wakePackage.modelVersion,
    }
    child.emitMessage(detection)
    child.emitMessage(detection)
    expect(wakes).toEqual([wakePackage.packageId])

    const released = supervisor.release()
    const release = child.commands[2]
    child.emitMessage({ type: 'microphone_released', requestId: release.requestId })
    await expect(released).resolves.toEqual({ status: 'success', reason: 'wake_microphone_released' })
    expect(supervisor.snapshot()).toEqual(expect.objectContaining({ status: 'released', restartCount: 0 }))
  })

  it('restarts once after exit, reacquires when needed, then fails visibly', async () => {
    const first = new FakeChild()
    const second = new FakeChild()
    const children = [first, second]
    const statuses: string[] = []
    const supervisor = createWakeSupervisor({
      spawn: () => children.shift() ?? (() => { throw new Error('unexpected_spawn') })(),
      onWake() {},
      onStatus: (snapshot) => statuses.push(snapshot.status),
      requestTimeoutMs: 1_000,
    })
    const started = supervisor.start({ package: wakePackage })
    first.emitMessage({
      type: 'ready',
      requestId: first.commands[0].requestId,
      packageId: wakePackage.packageId,
    })
    await started
    const acquired = supervisor.acquire()
    first.emitMessage({ type: 'microphone_acquired', requestId: first.commands[1].requestId })
    await acquired

    first.emitExit()
    await flush()
    second.emitMessage({
      type: 'ready',
      requestId: second.commands[0].requestId,
      packageId: wakePackage.packageId,
    })
    await flush()
    second.emitMessage({ type: 'microphone_acquired', requestId: second.commands[1].requestId })
    await flush()
    second.emitMessage({ type: 'input_activity', blocks: 1, peak: 0, rms: 0 })
    expect(supervisor.snapshot()).toEqual(expect.objectContaining({ status: 'listening', restartCount: 1 }))

    second.emitExit()
    await flush()
    expect(supervisor.snapshot()).toEqual(expect.objectContaining({
      status: 'failed',
      reason: 'wake_worker_exit_repeated',
      restartCount: 1,
    }))
    expect(statuses).toContain('failed')
  })

  it('restarts once and reacquires after the listening microphone endpoint fails', async () => {
    const first = new FakeChild()
    const second = new FakeChild()
    const children = [first, second]
    const supervisor = createWakeSupervisor({
      spawn: () => children.shift() ?? (() => { throw new Error('unexpected_spawn') })(),
      onWake() {},
      requestTimeoutMs: 1_000,
    })
    const started = supervisor.start({ package: wakePackage })
    first.emitMessage({
      type: 'ready',
      requestId: first.commands[0].requestId,
      packageId: wakePackage.packageId,
    })
    await started
    const acquired = supervisor.acquire()
    first.emitMessage({ type: 'microphone_acquired', requestId: first.commands[1].requestId })
    await acquired

    first.emitMessage({ type: 'failed', reason: 'wake_microphone_failed' })

    expect(first.kill).toHaveBeenCalledOnce()
    first.emitExit()
    await flush()
    second.emitMessage({
      type: 'ready',
      requestId: second.commands[0].requestId,
      packageId: wakePackage.packageId,
    })
    await flush()
    second.emitMessage({ type: 'microphone_acquired', requestId: second.commands[1].requestId })
    await flush()
    second.emitMessage({ type: 'input_activity', blocks: 1, peak: 0, rms: 0 })
    expect(supervisor.snapshot()).toEqual(expect.objectContaining({
      status: 'listening',
      restartCount: 1,
      reason: 'wake_audio_recovered',
    }))
  })

  it('fails a pending request on an invalid worker message without exposing it', async () => {
    const child = new FakeChild()
    const supervisor = createWakeSupervisor({
      spawn: () => child,
      onWake() {},
      requestTimeoutMs: 1_000,
    })
    const result = supervisor.start({ package: wakePackage })
    child.emitMessage({ transcript: 'private speech' })

    await expect(result).resolves.toEqual({ status: 'failed', reason: 'invalid_wake_worker_outcome' })
    expect(JSON.stringify(supervisor.snapshot())).not.toContain('private speech')
  })
})

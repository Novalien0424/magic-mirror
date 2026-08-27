import { describe, expect, it, vi } from 'vitest'
import { createWakeSupervisor, type WakeWorkerChild } from '../../../src/main/wake/supervisor'
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
    expect(supervisor.snapshot()).toEqual(expect.objectContaining({
      status: 'listening',
      restartCount: 1,
      reason: null,
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

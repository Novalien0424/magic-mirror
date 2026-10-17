import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOperatorLoop } from '../../src/main/operator-loop'
import type { LoopVideoSettings, OperatorLoopSnapshot } from '../../src/shared/operator-loop'

const settings: LoopVideoSettings = {
  videoId: `folder-${'1'.repeat(40)}`, audioMode: 'embedded', audioId: '', fit: 'cover', volume: 0.35,
}
type Loop = ReturnType<typeof createOperatorLoop>
const directories: string[] = [], controllers: Loop[] = []
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose()
  vi.useRealTimers()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function observed<T>(promise: Promise<T>) {
  const settled = vi.fn()
  void promise.then(value => settled(value))
  return settled
}
function fixturePath() {
  const directory = mkdtempSync(join(tmpdir(), 'mm-operator-loop-test-'))
  directories.push(directory)
  return join(directory, 'loop.json')
}
function fixture(path = fixturePath()) {
  const input = {
    path, validate: vi.fn(async (_settings: LoopVideoSettings) => true),
    suspendAvatar: vi.fn(async () => {}), resumeAvatar: vi.fn(async () => {}),
    publish: vi.fn((_snapshot: OperatorLoopSnapshot) => {}), report: vi.fn((_reason: string) => {}),
  }
  const controller = createOperatorLoop(input)
  controllers.push(controller)
  return { ...input, controller }
}
async function start(chosen = settings) {
  const f = fixture()
  await f.controller.save(chosen)
  const playing = f.controller.play(), settled = observed(playing)
  await vi.advanceTimersByTimeAsync(0)
  expect(f.controller.view().snapshot).toMatchObject({ mode: 'loop', status: 'preparing' })
  return { ...f, playing, settled, generation: f.controller.view().snapshot.generation }
}
function advancePlayback(controller: Loop, generation: number) {
  controller.report({ generation, status: 'progress', videoTimeMs: 100, frames: 3, audioTimeMs: 100 })
  controller.report({ generation, status: 'progress', videoTimeMs: 200, frames: 6, audioTimeMs: 200 })
}

describe('operator loop appliance controller', () => {
  it('persists settings independently, and restores active loop intent after a crash', async () => {
    const first = fixture()
    await first.controller.save(settings)
    expect(JSON.parse(readFileSync(first.path, 'utf8'))).toEqual({ version: 1, settings, intent: 'avatar' })
    first.controller.dispose()

    const saved = fixture(first.path)
    expect(saved.controller.view().settings).toEqual(settings)
    const playing = saved.controller.play()
    await vi.advanceTimersByTimeAsync(0)
    advancePlayback(saved.controller, saved.controller.view().snapshot.generation)
    expect(await playing).toBe(true)
    expect(JSON.parse(readFileSync(first.path, 'utf8'))).toEqual({ version: 1, settings, intent: 'loop' })
    saved.controller.dispose()

    const restored = fixture(first.path)
    expect(restored.controller.isLoopMode()).toBe(true)
    expect(restored.controller.view()).toMatchObject({ settings, snapshot: { mode: 'loop', status: 'preparing', generation: 0 } })
    restored.controller.rendererReady()
    await vi.advanceTimersByTimeAsync(0)
    expect(restored.suspendAvatar).toHaveBeenCalledOnce()
    const generation = restored.controller.view().snapshot.generation
    expect(generation).toBeGreaterThan(0)
    advancePlayback(restored.controller, generation)
    expect(restored.controller.view().snapshot.status).toBe('playing')
    expect(restored.resumeAvatar).not.toHaveBeenCalled()
  })

  it('acknowledges advancing video with decoded frames, never a marker or stationary samples', async () => {
    const f = await start()
    const sample = (videoTimeMs: number, frames: number) => f.controller.report({ generation: f.generation, status: 'progress', videoTimeMs, frames })
    f.controller.report({ generation: f.generation, status: 'playing' })
    sample(0, 0); sample(0, 0); sample(100, 0)
    await vi.advanceTimersByTimeAsync(0)
    expect(f.settled).not.toHaveBeenCalled()

    sample(100, 3); sample(100, 3); sample(100, 4)
    await vi.advanceTimersByTimeAsync(0)
    expect(f.settled).not.toHaveBeenCalled()
    expect(f.controller.view().snapshot.status).toBe('preparing')

    sample(200, 6)
    expect(await f.playing).toBe(true)
    expect(f.controller.view().snapshot.status).toBe('playing')
  })

  it('also requires separate audio to advance while video advances', async () => {
    const f = await start({ ...settings, audioMode: 'separate', audioId: `folder-${'2'.repeat(40)}` })
    const sample = (videoTimeMs: number, frames: number, audioTimeMs?: number) => f.controller.report({
      generation: f.generation, status: 'progress', videoTimeMs, frames, ...(audioTimeMs === undefined ? {} : { audioTimeMs }),
    })
    f.controller.report({ generation: f.generation, status: 'playing' })
    sample(0, 0, 0); sample(100, 0, 100)
    sample(200, 2, 100); sample(300, 4); sample(400, 6, 100)
    await vi.advanceTimersByTimeAsync(0)
    expect(f.settled).not.toHaveBeenCalled()
    expect(f.controller.view().snapshot.status).toBe('preparing')

    sample(500, 8, 200)
    expect(await f.playing).toBe(true)
    expect(f.controller.view().snapshot.status).toBe('playing')
  })

  it('keeps duplicate Play idempotent, including the existing stall deadline', async () => {
    const f = await start()
    advancePlayback(f.controller, f.generation)
    expect(await f.playing).toBe(true)
    const before = f.controller.view().snapshot, publications = f.publish.mock.calls.length
    const validations = f.validate.mock.calls.length
    await vi.advanceTimersByTimeAsync(4000)
    expect(await f.controller.play()).toBe(true)
    expect(f.controller.view().snapshot).toEqual(before)
    expect(f.publish).toHaveBeenCalledTimes(publications)
    expect(f.validate).toHaveBeenCalledTimes(validations)
    expect(f.suspendAvatar).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(4000)
    expect(f.controller.view().snapshot).toMatchObject({ mode: 'loop', status: 'recovering', generation: f.generation + 1 })
  })

  it('plays a newly saved selection on the next button request while the old loop is playing', async () => {
    const f = await start()
    advancePlayback(f.controller, f.generation)
    expect(await f.playing).toBe(true)
    const changed = { ...settings, videoId: `folder-${'3'.repeat(40)}` }
    await f.controller.save(changed)
    expect(f.controller.view().snapshot.settings).toEqual(settings)
    expect(JSON.parse(readFileSync(f.path, 'utf8')).settings).toEqual(changed)
    const next = f.controller.play(), settled = observed(next)
    await vi.advanceTimersByTimeAsync(0)
    const generation = f.controller.view().snapshot.generation
    expect(generation).toBeGreaterThan(f.generation)
    expect(f.controller.view().snapshot.settings).toEqual(changed)
    advancePlayback(f.controller, f.generation)
    expect(settled).not.toHaveBeenCalled()
    advancePlayback(f.controller, generation)
    expect(await next).toBe(true)
    expect(f.resumeAvatar).not.toHaveBeenCalled()
  })

  it.each(['stall', 'error'] as const)('reloads once on watchdog expiry, then stays failed after another %s', async failure => {
    const f = await start()
    await vi.advanceTimersByTimeAsync(8000)
    const generation = f.generation + 1
    expect(f.controller.view().snapshot).toMatchObject({ mode: 'loop', status: 'recovering', generation })
    advancePlayback(f.controller, f.generation)
    await vi.advanceTimersByTimeAsync(0)
    expect(f.settled).not.toHaveBeenCalled()
    if (failure === 'stall') {
      f.controller.report({ generation, status: 'progress', videoTimeMs: 0, frames: 0 })
      await vi.advanceTimersByTimeAsync(8000)
    } else f.controller.report({ generation, status: 'failed', reason: 'operator_loop_playback_failed' })
    expect(await f.playing).toBe(false)
    const failed = f.controller.view().snapshot
    expect(failed).toMatchObject({ mode: 'loop', status: 'failed', generation })
    expect(f.report).toHaveBeenCalledWith(failed.reason)
    f.controller.report({ generation, status: 'failed', reason: 'operator_loop_playback_failed' })
    advancePlayback(f.controller, generation)
    f.controller.rendererReady()
    await vi.advanceTimersByTimeAsync(24000)
    expect(f.controller.view().snapshot).toEqual(failed)
    expect(f.controller.isLoopMode()).toBe(true)
    expect(f.publish.mock.calls.every(([snapshot]) => snapshot.mode === 'loop')).toBe(true)
    expect(f.resumeAvatar).not.toHaveBeenCalled()
  })

  it.each(['playing', 'failed'] as const)('waits for the matching generation release before returning from %s to Avatar', async status => {
    const f = await start()
    advancePlayback(f.controller, f.generation)
    expect(await f.playing).toBe(true)
    if (status === 'failed') {
      f.controller.report({ generation: f.generation, status: 'failed', reason: 'operator_loop_playback_failed' })
      f.controller.report({ generation: f.generation + 1, status: 'failed', reason: 'operator_loop_playback_failed' })
    }
    const generation = f.controller.view().snapshot.generation
    const returning = f.controller.normal(), settled = observed(returning)
    await vi.advanceTimersByTimeAsync(0)
    expect(f.controller.view().snapshot).toMatchObject({ mode: 'avatar', status: 'idle' })
    expect(f.resumeAvatar).not.toHaveBeenCalled()
    expect(settled).not.toHaveBeenCalled()
    for (const stale of [generation - 1, generation + 1]) f.controller.report({ generation: stale, status: 'released' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.resumeAvatar).not.toHaveBeenCalled()
    expect(settled).not.toHaveBeenCalled()
    f.controller.report({ generation, status: 'released' })
    expect(await returning).toBe(true)
    expect(f.resumeAvatar).toHaveBeenCalledOnce()
    expect(f.controller.isLoopMode()).toBe(false)
    expect(JSON.parse(readFileSync(f.path, 'utf8')).intent).toBe('avatar')
  })

  it.each(['avatar', 'loop'] as const)('returns from initial generation zero in %s mode without waiting for nonexistent playback', async intent => {
    const path = fixturePath()
    writeFileSync(path, JSON.stringify({ version: 1, settings, intent }))
    const f = fixture(path)
    expect(f.controller.view().snapshot.generation).toBe(0)
    const returning = f.controller.normal(), settled = observed(returning)
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toHaveBeenCalledExactlyOnceWith(true)
    expect(await returning).toBe(true)
    await vi.advanceTimersByTimeAsync(8000)
    expect(f.controller.view().snapshot).toMatchObject({ mode: 'avatar', status: 'idle' })
    expect(f.controller.isLoopMode()).toBe(false)
    expect(f.suspendAvatar).not.toHaveBeenCalled()
  })

  it.each(['validation', 'suspension'] as const)('cancels a pending start during %s without late resurrection or success acknowledgement', async stage => {
    const f = fixture(), gate = deferred<boolean>()
    await f.controller.save(settings)
    if (stage === 'validation') f.validate.mockImplementation(() => gate.promise)
    else f.suspendAvatar.mockImplementation(async () => { await gate.promise })
    const playing = f.controller.play(), settled = observed(playing)
    await vi.advanceTimersByTimeAsync(0)
    const returning = f.controller.normal()
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toHaveBeenCalledExactlyOnceWith(false)
    gate.resolve(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(await returning).toBe(true)
    const stopped = f.controller.view().snapshot
    expect(stopped).toMatchObject({ mode: 'avatar', status: 'idle' })
    expect(f.controller.isLoopMode()).toBe(false)
    expect(f.resumeAvatar).toHaveBeenCalledTimes(stage === 'suspension' ? 1 : 0)
    f.controller.rendererReady()
    advancePlayback(f.controller, stopped.generation)
    await vi.advanceTimersByTimeAsync(24000)
    expect(await playing).toBe(false)
    expect(settled).toHaveBeenCalledExactlyOnceWith(false)
    expect(f.controller.view().snapshot).toEqual(stopped)
    expect(f.publish.mock.calls.some(([snapshot]) => snapshot.status === 'playing' || snapshot.status === 'recovering')).toBe(false)
    expect(JSON.parse(readFileSync(f.path, 'utf8')).intent).toBe('avatar')
  })
})

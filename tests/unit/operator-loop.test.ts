import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOperatorLoop, OPERATOR_LOOP_HEALTHY_MS } from '../../src/main/operator-loop'
import { MUSIC_RESYNC_GAP_MS, musicResyncGapMs, type LoopVideoSettings, type OperatorLoopSnapshot } from '../../src/shared/operator-loop'

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
  it('reports each loop wrap once with the frames dropped since the previous wrap', async () => {
    const f = fixture(), smoothness = vi.fn()
    const loop = createOperatorLoop({ ...f, path: fixturePath(), smoothness }); controllers.push(loop)
    await loop.save(settings); void loop.play(); await vi.advanceTimersByTimeAsync(0)
    const generation = loop.view().snapshot.generation
    advancePlayback(loop, generation)
    loop.report({ generation, status: 'progress', videoTimeMs: 300, frames: 9, droppedFrames: 2, wraps: 0 })
    loop.report({ generation, status: 'progress', videoTimeMs: 50, frames: 12, droppedFrames: 5, wraps: 1 })
    loop.report({ generation, status: 'progress', videoTimeMs: 1050, frames: 40, droppedFrames: 5, wraps: 1 })
    loop.report({ generation, status: 'progress', videoTimeMs: 40, frames: 44, droppedFrames: 6, wraps: 2 })
    expect(smoothness.mock.calls).toEqual([[1, 5], [2, 1]])
  })
  it('owns Dance without input, makes repeats idempotent, cancels late start and never restores loud mode', async () => {
    const path = fixturePath(), started = deferred<boolean>()
    const dance = { start: vi.fn(() => started.promise), stop: vi.fn(async () => {}) }
    const music = { start: vi.fn(async () => true), stop: vi.fn(async () => {}) }
    const f = fixture(), controller = createOperatorLoop({ ...f, path, dance, music })
    controllers.push(controller)
    await controller.dance(); await controller.dance()
    expect(dance.start).toHaveBeenCalledOnce()
    expect(controller.isInputSuspended()).toBe(true)
    expect(JSON.parse(readFileSync(path, 'utf8')).intent).toBe('avatar')
    expect(f.resumeAvatar).not.toHaveBeenCalled()
    await controller.normal('black'); started.resolve(true); await vi.advanceTimersByTimeAsync(0)
    expect(controller.view().snapshot.mode).toBe('black')
    expect(dance.stop).toHaveBeenCalled()
    expect(fixture(path).controller.view().snapshot.mode).toBe('avatar')
    await controller.normal()
    expect(f.resumeAvatar).toHaveBeenCalledOnce()
  })
  it('keeps input suspended on Desktop, restores Desktop after a crash and resumes on normal', async () => {
    const f = fixture()
    f.suspendAvatar.mockImplementation(async () => { expect(f.controller.isInputSuspended()).toBe(true) })
    expect(await f.controller.desktop()).toBe(true)
    expect(f.controller.isDesktopMode()).toBe(true)
    expect(f.controller.view().snapshot).toMatchObject({ mode: 'desktop', status: 'idle' })
    expect(f.resumeAvatar).not.toHaveBeenCalled()
    const restored = fixture(f.path)
    expect(restored.controller.isInputSuspended()).toBe(true)
    restored.controller.rendererReady()
    await vi.advanceTimersByTimeAsync(0)
    expect(restored.suspendAvatar).toHaveBeenCalledOnce()
    expect(restored.controller.view().snapshot.mode).toBe('desktop')
    expect(await restored.controller.normal()).toBe(true)
    expect(restored.resumeAvatar).toHaveBeenCalledOnce()
    expect(restored.controller.isInputSuspended()).toBe(false)
  })
  it('waits for loop release before acknowledging Desktop and can play again', async () => {
    const f = await start()
    advancePlayback(f.controller, f.generation); await f.playing
    const desktop = observed(f.controller.desktop())
    await vi.advanceTimersByTimeAsync(0)
    expect(f.controller.isInputSuspended()).toBe(true)
    expect(desktop).not.toHaveBeenCalled()
    f.controller.report({ generation: f.generation, status: 'released' })
    await vi.advanceTimersByTimeAsync(0)
    expect(desktop).toHaveBeenCalledWith(true)
    expect(f.resumeAvatar).not.toHaveBeenCalled()
    const playing = f.controller.play()
    await vi.advanceTimersByTimeAsync(0)
    advancePlayback(f.controller, f.controller.view().snapshot.generation)
    expect(await playing).toBe(true)
    expect(f.controller.isDesktopMode()).toBe(false)
    expect(f.controller.isInputSuspended()).toBe(true)
  })
  it('fails Desktop visibly and keeps the input gate closed when input release fails', async () => {
    const f = fixture()
    f.suspendAvatar.mockRejectedValueOnce(Error('private failure'))
    expect(await f.controller.desktop()).toBe(false)
    expect(f.controller.view().snapshot).toMatchObject({ mode: 'desktop', status: 'failed', reason: 'operator_loop_release_failed' })
    expect(f.controller.isInputSuspended()).toBe(true)
    expect(f.resumeAvatar).not.toHaveBeenCalled()
    expect(await f.controller.desktop()).toBe(true)
  })
  it('abandons a slow media check when the operator returns to the avatar', async () => {
    const f = fixture()
    await f.controller.save(settings)
    const check = deferred<boolean>()
    f.validate.mockImplementationOnce(() => check.promise)
    const playing = observed(f.controller.play())
    await vi.advanceTimersByTimeAsync(0)
    const stopped = observed(f.controller.normal())
    await vi.advanceTimersByTimeAsync(0)
    expect(playing).toHaveBeenCalledWith(false)
    expect(stopped).toHaveBeenCalledWith(true)
    // The download finishing later never starts the cancelled loop.
    check.resolve(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(f.suspendAvatar).not.toHaveBeenCalled()
    expect(f.controller.view().snapshot.mode).toBe('avatar')
    expect(f.controller.isLoopMode()).toBe(false)
  })
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

describe('operator loop recovery and ownership (2026-11-08 audit)', () => {
  it('never waits for a release from a loop that failed before its player mounted, so START still works', async () => {
    const f = fixture()
    expect(await f.controller.normal()).toBe(true) // START: generation 1, no player
    f.suspendAvatar.mockRejectedValueOnce(Error('private microphone failure'))
    expect(await f.controller.play()).toBe(false)
    expect(f.controller.view().snapshot).toMatchObject({ mode: 'loop', status: 'failed', generation: 1 })
    // The Mirror renders black for this generation and never reports `released`.
    const returning = observed(f.controller.normal())
    await vi.advanceTimersByTimeAsync(0)
    expect(returning).toHaveBeenCalledExactlyOnceWith(true)
    expect(f.controller.view().snapshot).toMatchObject({ mode: 'avatar', status: 'idle' })
    expect(f.controller.isInputSuspended()).toBe(false)
    expect(f.report).not.toHaveBeenCalledWith('operator_loop_release_failed')
  })
  it('a release timeout fails one START, never every later one', async () => {
    const f = await start()
    advancePlayback(f.controller, f.generation); expect(await f.playing).toBe(true)
    const first = observed(f.controller.normal())
    await vi.advanceTimersByTimeAsync(4000) // the renderer never reports release
    expect(first).toHaveBeenCalledWith(false)
    expect(f.controller.view().snapshot).toMatchObject({ mode: 'loop', status: 'failed', reason: 'operator_loop_release_failed' })
    const second = observed(f.controller.normal())
    await vi.advanceTimersByTimeAsync(0)
    expect(second).toHaveBeenCalledWith(true)
    expect(f.controller.view().snapshot.mode).toBe('avatar')
  })
  it('re-arms the one automatic reload after a recovered loop has played healthily for five minutes', async () => {
    const f = await start()
    await vi.advanceTimersByTimeAsync(8000) // first stall: one automatic reload
    let generation = f.controller.view().snapshot.generation, time = 0
    expect(f.controller.view().snapshot).toMatchObject({ status: 'recovering', generation: f.generation + 1 })
    const tick = () => { time += 100; f.controller.report({ generation, status: 'progress', videoTimeMs: time, frames: time / 10 }) }
    tick(); tick()
    expect(f.controller.view().snapshot.status).toBe('playing')
    for (let elapsed = 0; elapsed <= OPERATOR_LOOP_HEALTHY_MS; elapsed += 1000) { tick(); await vi.advanceTimersByTimeAsync(1000) }
    expect(f.report).toHaveBeenCalledWith('operator_loop_recovery_rearmed')
    await vi.advanceTimersByTimeAsync(8000) // a stall hours later reloads again instead of failing black
    generation = f.controller.view().snapshot.generation
    expect(f.controller.view().snapshot).toMatchObject({ mode: 'loop', status: 'recovering', generation: f.generation + 2 })
    // Without another healthy period the next stall still fails visibly.
    await vi.advanceTimersByTimeAsync(8000)
    expect(f.controller.view().snapshot).toMatchObject({ mode: 'loop', status: 'failed', generation })
  })
  it('reports an unwritable mode file and still changes modes', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'mm-operator-loop-test-')); directories.push(directory)
    const f = fixture(join(directory, 'missing', 'loop.json'))
    expect(await f.controller.desktop()).toBe(true)
    expect(f.report).toHaveBeenCalledWith('operator_loop_save_failed')
    const playing = f.controller.play()
    await vi.advanceTimersByTimeAsync(0)
    advancePlayback(f.controller, f.controller.view().snapshot.generation)
    expect(await playing).toBe(true)
    const returning = f.controller.normal()
    await vi.advanceTimersByTimeAsync(0)
    f.controller.report({ generation: f.controller.view().snapshot.generation - 1, status: 'released' })
    expect(await returning).toBe(true)
    expect(f.report).not.toHaveBeenCalledWith('operator_loop_release_failed')
    expect(f.controller.isInputSuspended()).toBe(false)
  })
  it('lets a repeated MUSIC LOOP press win over a VIDEO LOOP start still validating behind the music', async () => {
    const f = fixture(), gate = deferred<boolean>()
    const music = { start: vi.fn(async () => true), stop: vi.fn(async () => {}) }
    const controller = createOperatorLoop({ ...f, path: fixturePath(), music }); controllers.push(controller)
    expect(await controller.music()).toBe(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.view().snapshot).toMatchObject({ mode: 'music', status: 'playing' })
    const stops = music.stop.mock.calls.length, suspensions = f.suspendAvatar.mock.calls.length
    f.validate.mockImplementationOnce(() => gate.promise)
    const video = observed(controller.play())
    await vi.advanceTimersByTimeAsync(0)
    expect(await controller.music()).toBe(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(video).toHaveBeenCalledExactlyOnceWith(false)
    gate.resolve(true) // the cloud video arrives later and must not take over
    await vi.advanceTimersByTimeAsync(24000)
    expect(controller.view().snapshot).toMatchObject({ mode: 'music', status: 'playing' })
    expect(controller.isLoopMode()).toBe(false)
    expect(music.start).toHaveBeenCalledOnce()
    expect(music.stop).toHaveBeenCalledTimes(stops)
    expect(f.suspendAvatar).toHaveBeenCalledTimes(suspensions)
    expect(f.report).toHaveBeenCalledWith('operator_loop_start_superseded')
  })
  it('restarts a pending music start that a VIDEO LOOP press had already cancelled', async () => {
    const f = fixture(), gate = deferred<boolean>(), started: Array<(value: boolean) => void> = []
    const music = { start: vi.fn(() => new Promise<boolean>(resolve => { started.push(resolve) })), stop: vi.fn(async () => { started.at(-1)?.(false) }) }
    const controller = createOperatorLoop({ ...f, path: fixturePath(), music }); controllers.push(controller)
    expect(await controller.music()).toBe(true) // still preparing
    f.validate.mockImplementationOnce(() => gate.promise)
    void controller.play() // cancels the pending start while the video validates
    await vi.advanceTimersByTimeAsync(0)
    expect(await controller.music()).toBe(true)
    expect(music.start).toHaveBeenCalledTimes(2)
    gate.resolve(true); await vi.advanceTimersByTimeAsync(0)
    expect(controller.isMusicMode()).toBe(true)
  })
  it('returns the speakers to their normal levels once after Dance ends by any path, after the player exits', async () => {
    const f = fixture(), order: string[] = []
    const dance = { start: vi.fn(async () => true), stop: vi.fn(async () => { order.push('dance_stop') }) }
    const resetSpeakers = vi.fn(async () => { order.push('reset') }), music = { start: vi.fn(async () => true), stop: vi.fn(async () => {}) }
    const controller = createOperatorLoop({ ...f, path: fixturePath(), dance, music, resetSpeakers }); controllers.push(controller)
    expect(await controller.dance()).toBe(true)
    expect(resetSpeakers).not.toHaveBeenCalled()
    order.length = 0
    expect(await controller.desktop()).toBe(true)
    expect(order).toEqual(['dance_stop', 'reset'])
    expect(await controller.normal()).toBe(true)
    expect(resetSpeakers).toHaveBeenCalledOnce()
    // Music, VIDEO LOOP and a renderer reload leave Dance the same way.
    expect(await controller.dance()).toBe(true)
    expect(await controller.music()).toBe(true)
    expect(resetSpeakers).toHaveBeenCalledTimes(2)
    expect(await controller.dance()).toBe(true)
    const playing = controller.play()
    await vi.advanceTimersByTimeAsync(0)
    expect(resetSpeakers).toHaveBeenCalledTimes(3)
    advancePlayback(controller, controller.view().snapshot.generation); expect(await playing).toBe(true)
    const back = controller.dance()
    await vi.advanceTimersByTimeAsync(0)
    controller.report({ generation: controller.view().snapshot.generation - 1, status: 'released' })
    expect(await back).toBe(true)
    resetSpeakers.mockRejectedValueOnce(Error('private helper failure'))
    controller.rendererReady()
    await vi.waitFor(() => expect(controller.view().snapshot.mode).toBe('avatar'))
    expect(resetSpeakers).toHaveBeenCalledTimes(4)
    expect(f.report).toHaveBeenCalledWith('operator_loop_dance_volume_restore_failed')
    // A failed reset never gates the mode change; nothing is retried without another Dance.
    expect(controller.isInputSuspended()).toBe(false)
    expect(await controller.desktop()).toBe(true)
    expect(resetSpeakers).toHaveBeenCalledTimes(4)
  })
})

describe('MusicLoop re-sync pause', () => {
  it('pauses between songs only on the direct speaker group, never on the Airfoil route', () => {
    expect(musicResyncGapMs({ musicResync: true }, false)).toBe(MUSIC_RESYNC_GAP_MS)
    expect(musicResyncGapMs({ musicResync: true }, true)).toBe(0)
    expect(musicResyncGapMs({ musicResync: false }, false)).toBe(0)
    expect(musicResyncGapMs({}, false)).toBe(0)
  })
})

describe('a loop pressed from STOP waits for the speaker route (owner 2026-11-09)', () => {
  it('launches VIDEO LOOP only once the route is final', async () => {
    const route = deferred<void>(), f = fixture()
    const controller = createOperatorLoop({ ...f, path: fixturePath(), routeReady: () => route.promise })
    controllers.push(controller)
    await controller.save(settings)
    const playing = observed(controller.play())
    await vi.advanceTimersByTimeAsync(5000)
    // Inputs are released, but no player has mounted yet and the stall watchdog has not started.
    expect(f.suspendAvatar).toHaveBeenCalledOnce()
    expect(controller.view().snapshot.generation).toBe(0)
    route.resolve()
    await vi.advanceTimersByTimeAsync(0)
    const { generation } = controller.view().snapshot
    expect(controller.view().snapshot).toMatchObject({ mode: 'loop', status: 'preparing', generation: 1 })
    advancePlayback(controller, generation)
    await vi.advanceTimersByTimeAsync(0)
    expect(playing).toHaveBeenCalledWith(true)
  })

  it('lets START abandon the wait, and the route settling later never launches the loop', async () => {
    const route = deferred<void>(), f = fixture()
    const controller = createOperatorLoop({ ...f, path: fixturePath(), routeReady: () => route.promise })
    controllers.push(controller)
    await controller.save(settings)
    const playing = observed(controller.play())
    await vi.advanceTimersByTimeAsync(0)
    const stopped = observed(controller.normal())
    await vi.advanceTimersByTimeAsync(0)
    expect(playing).toHaveBeenCalledWith(false)
    expect(stopped).toHaveBeenCalledWith(true)
    route.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.view().snapshot.mode).toBe('avatar')
    expect(controller.view().snapshot.generation).toBe(1)
  })

  it('starts MUSIC LOOP after the route, and not at all when another press came first', async () => {
    const route = deferred<void>(), f = fixture()
    const music = { start: vi.fn(async () => true), stop: vi.fn(async () => {}) }
    const controller = createOperatorLoop({ ...f, path: fixturePath(), music, routeReady: () => route.promise })
    controllers.push(controller)
    expect(await controller.music()).toBe(true)
    await vi.advanceTimersByTimeAsync(5000)
    expect(music.start).not.toHaveBeenCalled()
    expect(controller.view().snapshot).toMatchObject({ mode: 'music', status: 'preparing' })
    route.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(music.start).toHaveBeenCalledOnce()
    expect(controller.view().snapshot).toMatchObject({ mode: 'music', status: 'playing' })

    const later = deferred<void>()
    const next = createOperatorLoop({ ...f, path: fixturePath(), music, routeReady: () => later.promise })
    controllers.push(next)
    await next.music()
    await next.normal()
    later.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(music.start).toHaveBeenCalledOnce()
    expect(next.view().snapshot.mode).toBe('avatar')
  })
})

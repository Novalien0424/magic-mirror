import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { createSharedMusicOutput, SHARED_OUTPUT_HEALTHY_MS } from '../../src/main/shared-music-output'

function fakeChild() {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), kill: vi.fn() })
  return child
}

describe('shared music output owner', () => {
  it('reports counts only, restarts once and stays degraded after a repeated exit', async () => {
    const children: ReturnType<typeof fakeChild>[] = []
    const spawnImpl = vi.fn(() => { const child = fakeChild(); children.push(child); return child })
    const report = vi.fn(), degraded = vi.fn()
    const output = createSharedMusicOutput({ executable: '/helper', report, degraded, spawnImpl: spawnImpl as never, restartDelayMs: 0 })
    output.start()
    expect(spawnImpl).toHaveBeenCalledWith('/helper', ['--shared-output'], { stdio: ['pipe', 'pipe', 'ignore'] })
    children[0]!.stdout.write('{"event":"shared","outputs":4,"wireless":2,"uid":"private"}\n')
    children[0]!.stdout.write('{"event":"shared_failed","reason":"x"}\n')
    await vi.waitFor(() => expect(degraded).toHaveBeenCalledWith('music_output_shared_route_failed'))
    expect(report).toHaveBeenCalledWith('music_output_shared_ready', { outputs: 4, wireless: 2, airfoil: 0 })
    children[0]!.stdout.write('{"event":"speaker_matched","level":0.7000001}\n')
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith('music_output_speaker_matched', { level: 70 }))
    children[0]!.emit('exit', 1)
    expect(report).toHaveBeenCalledWith('music_output_shared_restarting')
    await vi.waitFor(() => expect(children).toHaveLength(2))
    children[1]!.emit('exit', 1)
    expect(degraded).toHaveBeenLastCalledWith('music_output_shared_exited')
    expect(children).toHaveLength(2)
  })

  it('earns its restart back after a healthy period, so a rare exit never ends the shared route', async () => {
    let time = 0
    const children: ReturnType<typeof fakeChild>[] = []
    const spawnImpl = vi.fn(() => { const child = fakeChild(); children.push(child); return child })
    const report = vi.fn(), degraded = vi.fn()
    const output = createSharedMusicOutput({ executable: '/helper', report, degraded, spawnImpl: spawnImpl as never, restartDelayMs: 0, now: () => time })
    output.start()
    children[0]!.emit('exit', 1) // early exit: the one restart
    await vi.waitFor(() => expect(children).toHaveLength(2))
    time += SHARED_OUTPUT_HEALTHY_MS
    children[1]!.emit('exit', 1) // hours later: restarts again
    await vi.waitFor(() => expect(children).toHaveLength(3))
    expect(degraded).not.toHaveBeenCalled()
    children[2]!.emit('exit', 1) // an immediate repeat stays degraded
    expect(degraded).toHaveBeenCalledWith('music_output_shared_exited')
    expect(children).toHaveLength(3)
    output.stop()
  })

  it('releases the helper on stop without reporting a failure', () => {
    const child = fakeChild(), degraded = vi.fn()
    const end = vi.spyOn(child.stdin, 'end')
    const output = createSharedMusicOutput({ executable: '/helper', report: vi.fn(), degraded, spawnImpl: (() => child) as never })
    output.start()
    output.stop()
    child.emit('exit', 0)
    expect(end).toHaveBeenCalled()
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(degraded).not.toHaveBeenCalled()
  })

  it('is ready for a start only on the expected route once macOS plays the default output through it', async () => {
    const child = fakeChild()
    const output = createSharedMusicOutput({ executable: '/helper', report: vi.fn(), degraded: vi.fn(), spawnImpl: (() => child) as never })
    output.start()
    const lines = async (...events: string[]) => { for (const event of events) child.stdout.write(event + '\n'); await new Promise(done => setTimeout(done, 10)) }
    const airfoil = vi.fn(), direct = vi.fn()
    void output.ready(true).then(airfoil)
    // At app start the direct group is built first and becomes the default: not yet the Airfoil route.
    await lines('{"event":"shared","outputs":3,"wireless":1,"airfoil":0}', '{"event":"default"}')
    expect(airfoil).not.toHaveBeenCalled()
    void output.ready(false).then(direct)
    await vi.waitFor(() => expect(direct).toHaveBeenCalled())
    // Rebuilt for Airfoil, but macOS still points at the destroyed one: keep waiting.
    await lines('{"event":"shared","outputs":1,"wireless":0,"airfoil":1}')
    expect(airfoil).not.toHaveBeenCalled()
    await lines('{"event":"default"}')
    expect(airfoil).toHaveBeenCalledOnce()
    // A later press on the settled route does not wait; a gone helper never holds music back.
    await expect(output.ready(true)).resolves.toBeUndefined()
    const stuck = vi.fn()
    void output.ready(false).then(stuck)
    await lines()
    expect(stuck).not.toHaveBeenCalled()
    output.stop()
    await vi.waitFor(() => expect(stuck).toHaveBeenCalled())
  })
})

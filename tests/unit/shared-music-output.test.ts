import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { createSharedMusicOutput } from '../../src/main/shared-music-output'

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
    expect(report).toHaveBeenCalledWith('music_output_shared_ready', { outputs: 4, wireless: 2 })
    children[0]!.stdout.write('{"event":"speaker_matched","level":0.7000001}\n')
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith('music_output_speaker_matched', { level: 70 }))
    children[0]!.emit('exit', 1)
    expect(report).toHaveBeenCalledWith('music_output_shared_restarting')
    await vi.waitFor(() => expect(children).toHaveLength(2))
    children[1]!.emit('exit', 1)
    expect(degraded).toHaveBeenLastCalledWith('music_output_shared_exited')
    expect(children).toHaveLength(2)
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
})

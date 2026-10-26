import { mkdtemp, mkdir, writeFile, rm, symlink, chmod, realpath, truncate } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMusicLoop, musicLoopFiles, MUSIC_LOOP_MAX_BYTES } from '../../src/main/music-loop'
import { createOperatorLoop } from '../../src/main/operator-loop'

const roots: string[] = [], players: ReturnType<typeof createMusicLoop>[] = []
afterEach(async () => {
  await Promise.all(players.splice(0).map(player => player.stop()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
async function fixture(names = ['01.wav', '02.mp3']) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'mm-music-loop-'))); roots.push(root)
  const folder = join(root, 'MusicLoop'); await mkdir(folder)
  for (const name of names) await writeFile(join(folder, name), 'fixture')
  return { root, folder }
}
async function playerFixture(names?: string[]) {
  const { root, folder } = await fixture(names)
  const executable = join(root, 'player')
  await writeFile(executable, `#!/usr/bin/env node
const send = value => process.stdout.write(JSON.stringify(value) + '\\n');
send({event:'ready',outputs:3});
require('node:readline').createInterface({input:process.stdin}).on('line', line => {
 const m=JSON.parse(line);
 if(m.mime !== (m.path.endsWith('.mp3') ? 'audio/mpeg' : 'audio/vnd.wave')) process.exit(2);
 if(m.path.includes('bad')) { send({event:'track_failed',id:m.id}); return }
 send({event:'playing',id:m.id,outputs:3});
 setTimeout(()=>send({event:'ended',id:m.id}),50);
}).on('close',()=>process.exit(0));
`)
  await chmod(executable, 0o700)
  const input = { executable, sharedRoot: async () => root,
    prepare: vi.fn(async (path: string, _size: number, _mtime: number, _signal: AbortSignal) => path),
    cached: vi.fn(async (_path: string, _size: number, _mtime: number): Promise<string | undefined> => undefined),
    isLocal: vi.fn(async (_path: string, _signal: AbortSignal) => true),
    state: vi.fn(), report: vi.fn(), failed: vi.fn() }
  const player = createMusicLoop(input); players.push(player)
  return { root, folder, input, player }
}

describe('MusicLoop playlist and lifecycle', () => {
  it('loads all 60 files in natural filename order, excludes non-audio, hidden files and symlink escapes', async () => {
    const f = await fixture(Array.from({ length: 60 }, (_, i) => `${i + 1}.mp3`))
    await writeFile(join(f.folder, 'video.mp4'), 'fixture')
    await writeFile(join(f.folder, '.hidden.wav'), 'fixture')
    await symlink(join(f.folder, '1.mp3'), join(f.folder, 'alias.wav'))
    await mkdir(join(f.folder, 'sub')); await writeFile(join(f.folder, 'sub', 'nested.FLAC'), 'fixture')
    const files = await musicLoopFiles(f.root)
    expect(files).toHaveLength(61)
    expect(files.slice(0, 3)).toEqual(['1.mp3', '2.mp3', '3.mp3'].map(name => join(f.folder, name)))
    expect(files.at(-1)).toBe(join(f.folder, 'sub', 'nested.FLAC'))
  })
  it('reports missing/empty folders without selecting music outside MusicLoop', async () => {
    const f = await fixture([])
    await expect(musicLoopFiles(undefined)).rejects.toThrow('operator_loop_music_shared_missing')
    await expect(musicLoopFiles(f.root)).rejects.toThrow('operator_loop_music_empty')
    await rm(f.folder, { recursive: true })
    await expect(musicLoopFiles(f.root)).rejects.toThrow('operator_loop_music_folder_missing')
  })
  it('plays the whole playlist, repeats, and cannot restart after stop', async () => {
    const f = await playerFixture()
    expect(await f.player.start()).toBe(true)
    await vi.waitFor(() => expect(f.input.report).toHaveBeenCalledWith('operator_loop_music_playlist_repeated', { cycles: 1 }))
    expect(f.input.prepare.mock.calls.map(call => call[0])).toEqual(['01.wav', '02.mp3'].map(name => join(f.folder, name)))
    await f.player.stop()
    const count = f.input.prepare.mock.calls.length
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(f.input.prepare).toHaveBeenCalledTimes(count)
    expect(f.input.failed).not.toHaveBeenCalled()
  })
  it('skips corrupt tracks and stops if every track is unusable', async () => {
    const good = await playerFixture(['01-bad.wav', '02.wav'])
    expect(await good.player.start()).toBe(true)
    expect(good.input.report).toHaveBeenCalledWith('operator_loop_music_decode_skipped', undefined)
    await good.player.stop()
    const bad = await playerFixture(['01-bad.wav'])
    expect(await bad.player.start()).toBe(false)
    expect(bad.input.failed).toHaveBeenCalledWith('operator_loop_music_no_playable_tracks')
  })
  it('aborts a cloud preparation and waits for worker release on repeated stop', async () => {
    const f = await playerFixture()
    f.input.prepare.mockImplementation((_path, _size, _mtime, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(Error('cancelled')), { once: true })
    }))
    const starting = f.player.start()
    await vi.waitFor(() => expect(f.input.prepare).toHaveBeenCalledOnce())
    await Promise.all([f.player.stop(), f.player.stop()])
    expect(await starting).toBe(false)
    expect(f.input.prepare.mock.calls[0]![3].aborted).toBe(true)
    expect(f.input.failed).not.toHaveBeenCalled()
  })
  it('releases native audio before resuming avatar and repeated MusicLoop is idempotent', async () => {
    const { root } = await fixture()
    const order: string[] = []
    const music = { start: vi.fn(async () => { order.push('play'); return true }), stop: vi.fn(async () => { order.push('stop') }) }
    const controller = createOperatorLoop({ path: join(root, 'settings.json'), music,
      validate: async () => true, suspendAvatar: async () => { expect(controller.isInputSuspended()).toBe(true); order.push('suspend') },
      resumeAvatar: async () => { order.push('resume') }, publish: vi.fn(), report: vi.fn() })
    try {
      expect(await controller.music()).toBe(true)
      expect(await controller.music()).toBe(true)
      expect(music.start).toHaveBeenCalledOnce()
      expect(controller.view().snapshot).toMatchObject({ mode: 'music', status: 'playing' })
      expect(await controller.normal()).toBe(true)
      expect(order).toEqual(['stop', 'suspend', 'play', 'stop', 'resume'])
      await controller.music(); await controller.desktop()
      expect(controller.view().snapshot.mode).toBe('desktop')
      expect(controller.isInputSuspended()).toBe(true)
    } finally { controller.dispose() }
  })
  it('shutdown cancels a pending native start and never resumes the avatar', async () => {
    const { root } = await fixture()
    let cancel: (() => void) | undefined
    const music = { start: vi.fn(() => new Promise<boolean>(resolve => { cancel = () => resolve(false) })),
      stop: vi.fn(async () => { cancel?.() }) }
    const resume = vi.fn()
    const controller = createOperatorLoop({ path: join(root, 'settings.json'), music,
      validate: async () => true, suspendAvatar: async () => {}, resumeAvatar: resume, publish: vi.fn(), report: vi.fn() })
    const started = controller.music()
    await vi.waitFor(() => expect(music.start).toHaveBeenCalledOnce())
    expect(await started).toBe(true) // mode accepted while preparation is pending
    expect(controller.view().snapshot.status).toBe('preparing')
    controller.clearIntent(); controller.dispose()
    expect(controller.isInputSuspended()).toBe(false)
    expect(resume).not.toHaveBeenCalled()
  })
  it('keeps playing music when a requested video is unavailable', async () => {
    const { root } = await fixture()
    const music = { start: vi.fn(async () => true), stop: vi.fn(async () => {}) }
    const controller = createOperatorLoop({ path: join(root, 'settings.json'), music,
      validate: async () => false, suspendAvatar: async () => {}, resumeAvatar: async () => {}, publish: vi.fn(), report: vi.fn() })
    try {
      expect(await controller.music()).toBe(true)
      const stops = music.stop.mock.calls.length
      expect(await controller.play()).toBe(false)
      expect(music.stop).toHaveBeenCalledTimes(stops)
      expect(controller.view().snapshot).toMatchObject({ mode: 'music', status: 'playing', reason: 'operator_loop_media_unavailable' })
    } finally { controller.dispose() }
  })
  it('cancels a pending music start even when the requested video is unavailable', async () => {
    const { root } = await fixture()
    let cancel: (() => void) | undefined
    const music = { start: vi.fn(() => new Promise<boolean>(resolve => { cancel = () => resolve(false) })),
      stop: vi.fn(async () => { cancel?.() }) }
    const controller = createOperatorLoop({ path: join(root, 'settings.json'), music,
      validate: async () => false, suspendAvatar: async () => {}, resumeAvatar: async () => {}, publish: vi.fn(), report: vi.fn() })
    try {
      const starting = controller.music()
      await vi.waitFor(() => expect(music.start).toHaveBeenCalledOnce())
      expect(await controller.play()).toBe(false)
      expect(await starting).toBe(true) // accepted before video cancelled the pending download
      expect(controller.view().snapshot).toMatchObject({ mode: 'music', status: 'failed' })
    } finally { controller.dispose() }
  })
  it('plays a later cache hit while the first cloud file waits, then joins it at a track boundary', async () => {
    const f = await playerFixture()
    f.input.cached.mockImplementation(async path => path.endsWith('02.mp3') ? path : undefined)
    let complete!: (path: string) => void
    f.input.prepare.mockImplementation(() => new Promise(resolve => { complete = resolve }))
    expect(await f.player.start()).toBe(true)
    await vi.waitFor(() => expect(f.input.report).toHaveBeenCalledWith('operator_loop_music_playlist_repeated', { cycles: 2 }))
    expect(f.input.state).toHaveBeenCalledWith('playing', 1, 0)
    expect(f.input.prepare).toHaveBeenCalledOnce()
    expect(f.input.report.mock.calls.filter(c => c[0] === 'operator_loop_music_playing').every(c => c[1].track === 2)).toBe(true)
    complete(join(f.folder, '01.wav'))
    await vi.waitFor(() => expect(f.input.report.mock.calls.some(c => c[0] === 'operator_loop_music_playing' && c[1].track === 1)).toBe(true))
    expect(f.input.failed).not.toHaveBeenCalled()
  })
  it('prepares locally downloaded sources before an earlier cloud placeholder', async () => {
    const f = await playerFixture()
    f.input.isLocal.mockImplementation(async path => path.endsWith('02.mp3'))
    f.input.prepare.mockImplementation((path, _size, _mtime, signal) => path.endsWith('02.mp3') ? Promise.resolve(path)
      : new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Error('cancelled')), { once: true })))
    expect(await f.player.start()).toBe(true)
    await vi.waitFor(() => expect(f.input.prepare).toHaveBeenCalledTimes(2))
    expect(f.input.prepare.mock.calls.map(call => call[0])).toEqual(['02.mp3', '01.wav'].map(name => join(f.folder, name)))
    await vi.waitFor(() => expect(f.input.report).toHaveBeenCalledWith('operator_loop_music_playlist_repeated', { cycles: 2 }))
    await f.player.stop()
    expect(f.input.failed).not.toHaveBeenCalled()
  })
  it('keeps cached music playing after another file download fails', async () => {
    const f = await playerFixture()
    f.input.cached.mockImplementation(async path => path.endsWith('02.mp3') ? path : undefined)
    f.input.prepare.mockRejectedValue(Error('private provider error'))
    expect(await f.player.start()).toBe(true)
    await vi.waitFor(() => expect(f.input.report).toHaveBeenCalledWith('operator_loop_music_playlist_repeated', { cycles: 2 }))
    expect(f.input.report).toHaveBeenCalledWith('operator_loop_music_download_failed', undefined)
    expect(f.input.failed).not.toHaveBeenCalled()
  })
  it('accepts exactly 200 MB and skips larger files before cache access or downloading', async () => {
    const f = await playerFixture(['01.mp3', '02.mp3'])
    await truncate(join(f.folder, '01.mp3'), 200_000_000)
    await truncate(join(f.folder, '02.mp3'), 200_000_001)
    expect(await f.player.start()).toBe(true)
    expect(f.input.cached).toHaveBeenCalledOnce()
    expect(f.input.prepare).toHaveBeenCalledOnce()
    expect(f.input.prepare.mock.calls[0]![0]).toBe(join(f.folder, '01.mp3'))
    expect(f.input.state).toHaveBeenCalledWith('playing', 0, 1)
    expect(f.input.report).toHaveBeenCalledWith('operator_loop_music_oversize_skipped', { bytes: 200_000_001, limit: 200_000_000 })
  })
  it('reports an all-abnormal playlist without starting downloads', async () => {
    const f = await playerFixture(['01.wav'])
    await truncate(join(f.folder, '01.wav'), MUSIC_LOOP_MAX_BYTES + 1)
    expect(await f.player.start()).toBe(false)
    expect(f.input.cached).not.toHaveBeenCalled()
    expect(f.input.prepare).not.toHaveBeenCalled()
    expect(f.input.failed).toHaveBeenCalledWith('operator_loop_music_all_oversize')
  })
  it('accepts repeated MusicLoop during preparation without restarting and can return immediately', async () => {
    const { root } = await fixture()
    let cancelled = false, finish!: (value: boolean) => void
    const music = { start: vi.fn(() => new Promise<boolean>(resolve => { finish = resolve })), stop: vi.fn(async () => { cancelled = true; finish?.(false) }) }
    const controller = createOperatorLoop({ path: join(root, 'settings.json'), music,
      validate: async () => true, suspendAvatar: async () => {}, resumeAvatar: async () => {}, publish: vi.fn(), report: vi.fn() })
    try {
      expect(await controller.music()).toBe(true)
      cancelled = false
      expect(await controller.music()).toBe(true)
      expect(music.start).toHaveBeenCalledOnce()
      expect(cancelled).toBe(false)
      expect(controller.view().snapshot.status).toBe('preparing')
      expect(await controller.normal()).toBe(true)
      expect(cancelled).toBe(true)
      finish(true); await Promise.resolve()
      expect(controller.view().snapshot.mode).toBe('avatar')
    } finally { controller.dispose() }
  })
})

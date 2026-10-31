import { mkdtemp, mkdir, writeFile, rm, symlink, chmod, realpath, truncate } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMusicLoop, musicLoopFiles, musicSubfolders, MUSIC_LOOP_MAX_BYTES } from '../../src/main/music-loop'
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
 if(m.path.includes('long')) return;
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
    // MUSIC LOOP plays the folder's own files; a subfolder plays only from its key.
    expect(files).toHaveLength(60)
    expect(files.slice(0, 3)).toEqual(['1.mp3', '2.mp3', '3.mp3'].map(name => join(f.folder, name)))
    expect(files.at(-1)).toBe(join(f.folder, '60.mp3'))
    expect(await musicLoopFiles(f.root, 'MusicLoop', undefined, 'sub')).toEqual([join(f.folder, 'sub', 'nested.FLAC')])
    expect(await musicSubfolders(f.root)).toEqual(['sub'])
    await expect(musicLoopFiles(f.root, 'MusicLoop', undefined, '../MusicLoop')).rejects.toThrow('operator_loop_music_folder_invalid')
  })
  it('skips a subfolder it cannot list (cloud folder not downloaded) and keeps the playable files', async () => {
    const f = await fixture(['01.wav'])
    const locked = join(f.folder, 'Not downloaded'); await mkdir(locked); await writeFile(join(locked, '02.wav'), 'fixture')
    await chmod(locked, 0)
    try {
      expect(await musicLoopFiles(f.root, 'MusicLoop')).toEqual([join(f.folder, '01.wav')])
      expect(await musicSubfolders(f.root)).toEqual(['Not downloaded'])
      // Its key reports the folder unavailable instead of stopping the music.
      await expect(musicLoopFiles(f.root, 'MusicLoop', undefined, 'Not downloaded')).rejects.toThrow('operator_loop_music_folder_unavailable')
      // Dance still walks its subfolders and skips the unreadable one.
      const dance = join(f.root, 'DanceFloor'); await mkdir(dance); await writeFile(join(dance, 'a.wav'), 'fixture')
      const lockedDance = join(dance, 'cloud'); await mkdir(lockedDance); await chmod(lockedDance, 0)
      const skipped = vi.fn()
      try { expect(await musicLoopFiles(f.root, 'DanceFloor', skipped)).toEqual([join(dance, 'a.wav')]) } finally { await chmod(lockedDance, 0o700) }
      expect(skipped).toHaveBeenCalledOnce()
    } finally { await chmod(locked, 0o700) }
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
  it('pauses between finished songs for the speaker re-sync, never after a failed track or once stopped', async () => {
    const f = await playerFixture(['01.wav', '02-bad.wav', '03.mp3'])
    const played: number[] = []
    f.input.report.mockImplementation((reason: string) => { if (reason === 'operator_loop_music_playing') played.push(Date.now()) })
    Object.assign(f.input, { resyncGapMs: () => 300 })
    const player = createMusicLoop(f.input); players.push(player)
    await f.player.stop()
    expect(await player.start()).toBe(true)
    await vi.waitFor(() => expect(played.length).toBeGreaterThanOrEqual(2), { timeout: 3000 })
    // 01 ends, gap; the corrupt 02 is skipped without another gap; 03 plays.
    expect(played[1]! - played[0]!).toBeGreaterThanOrEqual(300)
    expect(played[1]! - played[0]!).toBeLessThan(600)
    expect(f.input.report).toHaveBeenCalledWith('operator_loop_music_resync_gap', { ms: 300 })
    await player.stop()
    const count = played.length
    await new Promise(resolve => setTimeout(resolve, 450))
    expect(played).toHaveLength(count)
  })
  it('plays in natural file-name order and Previous/Next replace the song with wrap-around', async () => {
    const f = await playerFixture(['10-long.wav', '2-long.wav', '1-long.wav'])
    const played: string[] = []
    Object.assign(f.input, { beforePlay: vi.fn(async (path: string) => { played.push(path.split('/').pop()!) }) })
    const player = createMusicLoop(f.input); players.push(player)
    await f.player.stop()
    expect(player.skip(1)).toBe(false) // nothing playing yet
    expect(await player.start()).toBe(true)
    await vi.waitFor(() => expect(played).toEqual(['1-long.wav']))
    expect(player.skip(1)).toBe(true)
    await vi.waitFor(() => expect(played).toEqual(['1-long.wav', '2-long.wav']))
    expect(player.skip(1)).toBe(true)
    await vi.waitFor(() => expect(played.at(-1)).toBe('10-long.wav'))
    expect(player.skip(1)).toBe(true)
    await vi.waitFor(() => expect(played.at(-1)).toBe('1-long.wav'))
    expect(player.skip(-1)).toBe(true)
    await vi.waitFor(() => expect(played.at(-1)).toBe('10-long.wav'))
    expect(player.skip(-1)).toBe(true)
    await vi.waitFor(() => expect(played.at(-1)).toBe('2-long.wav'))
    expect(f.input.report).toHaveBeenCalledWith('operator_loop_music_next', undefined)
    expect(f.input.report).toHaveBeenCalledWith('operator_loop_music_previous', undefined)
    expect(f.input.report).not.toHaveBeenCalledWith('operator_loop_music_playlist_repeated', expect.anything())
  })
  it('plays only the chosen subfolder when a folder key selected it', async () => {
    const f = await playerFixture(['01.wav'])
    await mkdir(join(f.folder, 'Yunelle')); await writeFile(join(f.folder, 'Yunelle', '05-long.wav'), 'fixture')
    const played: string[] = []
    Object.assign(f.input, { subfolder: () => 'Yunelle', beforePlay: vi.fn(async (path: string) => { played.push(path) }) })
    const player = createMusicLoop(f.input); players.push(player)
    await f.player.stop()
    expect(await player.start()).toBe(true)
    await vi.waitFor(() => expect(played).toEqual([join(f.folder, 'Yunelle', '05-long.wav')]))
  })
  it('reports a timed-out helper release once without locking every later stop', async () => {
    const f = await playerFixture()
    // This helper ignores stdin EOF and SIGTERM, so only the release deadline ends the wait.
    await writeFile(f.input.executable, `#!/usr/bin/env node
process.on('SIGTERM', () => {});
const send = value => process.stdout.write(JSON.stringify(value) + '\\n');
send({event:'ready',outputs:1});
require('node:readline').createInterface({input:process.stdin}).on('line', line => send({event:'playing',id:JSON.parse(line).id,outputs:1}));
setInterval(() => {}, 1000);
`)
    expect(await f.player.start()).toBe(true)
    vi.useFakeTimers()
    try {
      const first = f.player.stop()
      const rejected = expect(first).rejects.toThrow('operator_loop_music_stop_failed')
      vi.advanceTimersByTime(3600)
      await rejected
      await expect(f.player.stop()).resolves.toBeUndefined()
    } finally { vi.useRealTimers() }
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
      // A folder key restarts the running MusicLoop with its new selection.
      expect(await controller.music(true)).toBe(true)
      expect(music.start).toHaveBeenCalledTimes(2)
      expect(await controller.normal()).toBe(true)
      expect(order).toEqual(['stop', 'suspend', 'play', 'stop', 'suspend', 'play', 'stop', 'resume'])
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

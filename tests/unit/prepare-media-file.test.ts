import { execFile } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, symlink, truncate, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMacMediaFilePreparer, prepareDeadlineSeconds } from '../../src/main/avatar/prepare-media-file'

vi.mock('node:child_process', () => ({ execFile: vi.fn() }))

const roots: string[] = []
const bytes = 'synthetic media'
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'mm-media-cache-')); roots.push(root)
  const report = vi.fn()
  return { root, report, prepare: createMacMediaFilePreparer('/app/native/media-file-prepare', root, report) }
}
function copy(error: Error | null = null, acknowledgement = 'media_file_prepared bytes=15\n', contents = bytes) {
  vi.mocked(execFile).mockImplementationOnce(((_file: string, args: string[], _options: unknown,
    callback: (error: Error | null, stdout: string) => void) => {
    void writeFile(args[2]!, contents).then(() => callback(error, acknowledgement))
  }) as typeof execFile)
}
afterEach(async () => {
  vi.mocked(execFile).mockReset()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('Mac local media cache', () => {
  it('sizes the download deadline to the file: at least 9 s, about 1 s per MiB, at most 10 minutes', () => {
    expect(prepareDeadlineSeconds(15)).toBe(9)
    expect(prepareDeadlineSeconds(48_686_672)).toBe(47)
    expect(prepareDeadlineSeconds(5 * 2 ** 30)).toBe(600)
  })
  it('copies only requested media once, coalesces requests, and reuses across restarts without cloud reads', async () => {
    const { prepare, root } = await fixture()
    expect(execFile).not.toHaveBeenCalled()
    copy()
    const paths = await Promise.all([prepare('/drive/selected.mp4', 15, 1), prepare('/drive/selected.mp4', 15, 1)])
    expect(paths[0]).toBe(paths[1]); expect(await readFile(paths[0]!, 'utf8')).toBe(bytes)
    expect(execFile).toHaveBeenCalledOnce()
    const restarted = createMacMediaFilePreparer('/app/native/media-file-prepare', root)
    expect(await restarted('/drive/selected.mp4', 15, 1)).toBe(paths[0])
    expect(execFile).toHaveBeenCalledOnce()
    copy()
    const changed = await restarted('/drive/selected.mp4', 15, 2)
    expect(changed).not.toBe(paths[0])
    expect(await readFile(paths[0]!, 'utf8')).toBe(bytes)
    expect((await readdir(root)).every(name => /^[a-f0-9]{64}\.media$/.test(name))).toBe(true)
  })

  it('repairs a missing/truncated cache entry and never follows a cached symlink', async () => {
    const { prepare, root } = await fixture()
    copy(); const path = await prepare('/drive/selected.mp4', 15, 1)
    await truncate(path, 2)
    copy(); expect(await prepare('/drive/selected.mp4', 15, 1)).toBe(path)
    await rm(path)
    copy(); expect(await prepare('/drive/selected.mp4', 15, 1)).toBe(path)
    const other = join(root, 'unrelated'); await writeFile(other, bytes)
    await rm(path); await symlink(other, path)
    copy(); expect(await prepare('/drive/selected.mp4', 15, 1)).toBe(path)
    expect(execFile).toHaveBeenCalledTimes(4)
    expect(await readFile(other, 'utf8')).toBe(bytes)
  })

  it.each([
    [null, 'media_file_prepared bytes=14\n', bytes],
    [Object.assign(Error('private provider detail'), { killed: true }), 'private output', bytes],
    [null, 'media_file_prepared bytes=15\n', 'partial'],
  ])('rejects invalid/failed copies, removes staging, sanitizes diagnostics and allows retry (%#)', async (error, acknowledgement, contents) => {
    const { prepare, root, report } = await fixture()
    copy(error, acknowledgement, contents)
    await expect(prepare('/drive/selected.mp4', 15, 1)).rejects.toThrow(/^media_file_prepare_failed$/)
    expect(await readdir(root)).toEqual([])
    expect(execFile).toHaveBeenLastCalledWith('/app/native/media-file-prepare',
      ['/drive/selected.mp4', '15', expect.stringMatching(/\.tmp$/), '9'],
      { timeout: 10000, killSignal: 'SIGKILL', maxBuffer: 1024, encoding: 'utf8' }, expect.any(Function))
    expect(report.mock.calls.flat()).toEqual(['media_file_preparing', 'media_file_prepare_failed'])
    copy(); await expect(prepare('/drive/selected.mp4', 15, 1)).resolves.toMatch(/\.media$/)
  })

  it('cleans abandoned staging and old cache files at startup, leaving unrelated files alone', async () => {
    const { root, report, prepare } = await fixture()
    const old = join(root, `${'a'.repeat(64)}.media`)
    await writeFile(old, bytes); await utimes(old, 1, 1)
    await writeFile(join(root, `${'b'.repeat(64)}.${'0'.repeat(36)}.tmp`), 'partial')
    await writeFile(join(root, 'unrelated'), 'keep')
    copy(); await prepare('/drive/selected.mp4', 15, 1)
    const names = await readdir(root)
    expect(names).toHaveLength(2); expect(names).toContain('unrelated')
    expect(names.some(name => /^[a-f0-9]{64}\.media$/.test(name))).toBe(true)
    expect(report).toHaveBeenCalledWith('media_file_cache_pruned')
    expect(await readFile(join(root, 'unrelated'), 'utf8')).toBe('keep')
  })

  it('trims older cache entries to the startup disk budget without downloading the library', async () => {
    const { root, prepare } = await fixture()
    const recent = join(root, `${'c'.repeat(64)}.media`), older = join(root, `${'d'.repeat(64)}.media`)
    for (const path of [recent, older]) { await writeFile(path, ''); await truncate(path, 1536 * 1024 ** 2) }
    const now = Date.now() / 1000
    await utimes(recent, now, now); await utimes(older, now - 60, now - 60)
    copy(); await prepare('/drive/selected.mp4', 15, 1)
    expect(await readdir(root)).toContain('c'.repeat(64) + '.media')
    expect(await readdir(root)).not.toContain('d'.repeat(64) + '.media')
    expect(execFile).toHaveBeenCalledOnce()
  })
})

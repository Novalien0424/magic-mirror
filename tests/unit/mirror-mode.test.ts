import { mkdtemp, readFile, rm, writeFile, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createMirrorMode } from '../../src/main/mirror-mode'

let dir = ''
afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); dir = '' })
const temp = async () => (dir = await mkdtemp(join(tmpdir(), 'mirror-mode-')))

describe('Mirror mode switch', () => {
  it('starts in conversation, persists a switch and restores it after a restart', async () => {
    const path = join(await temp(), 'mirror-mode.json')
    const reports: string[] = []
    const first = createMirrorMode({ path, report: r => reports.push(r) })
    expect(first.get()).toBe('conversation')
    const seen: unknown[] = []
    first.subscribe((mode, previous, source) => seen.push([mode, previous, source]))
    expect(first.set('studio', 'operator')).toBe(true)
    expect(first.set('studio', 'console')).toBe(true)
    expect(seen).toEqual([['studio', 'conversation', 'operator']])
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ version: 1, mode: 'studio' })
    expect(createMirrorMode({ path, report: () => undefined }).get()).toBe('studio')
    expect(reports).toEqual(['mirror_mode_studio_operator'])
  })

  it('falls back to conversation for an unreadable file and keeps the old mode when saving fails', async () => {
    const root = await temp()
    const path = join(root, 'mirror-mode.json')
    await writeFile(path, '{"version":1,"mode":"party"}')
    const reports: string[] = []
    const store = createMirrorMode({ path, report: r => reports.push(r) })
    expect(store.get()).toBe('conversation')
    expect(reports).toEqual(['mirror_mode_unreadable'])
    await chmod(root, 0o500)
    try {
      expect(store.set('studio', 'console')).toBe(false)
      expect(store.get()).toBe('conversation')
      expect(reports).toContain('mirror_mode_save_failed')
    } finally { await chmod(root, 0o700) }
  })
})

describe('Mirror mode per session', () => {
  it('captures the mode once per session identity, so a later switch applies to the next session', async () => {
    const store = createMirrorMode({ path: join(await temp(), 'mirror-mode.json'), report: () => undefined })
    const first = { realtimeSessionId: 'rt-1', sessionGeneration: 1 }
    expect(store.sessionMode(first)).toBe('conversation')
    store.set('studio', 'console')
    expect(store.sessionMode(first)).toBe('conversation')
    expect(store.sessionMode({ realtimeSessionId: 'rt-1', sessionGeneration: 2 })).toBe('studio')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PRESENTATION, parsePresentation } from '../../src/shared/presentation'
import { createPresentationController } from '../../src/renderer/avatar/presentation-controller'
import { mirrorConfigSchema } from '../../src/main/config-service'
import { readFileSync } from 'node:fs'
import { AVATAR_VOICES } from '../../src/shared/avatar-profiles'

describe('lifecycle presentation', () => {
  it('accepts stable linked-folder BGM references, but rejects arbitrary external paths', () => {
    const baseline = JSON.parse(readFileSync('resources/config/default.json', 'utf8'))
    delete baseline.schemaVersion
    const folderId = 'folder-' + 'a'.repeat(40)
    expect(mirrorConfigSchema.safeParse({ ...baseline, presentation: { ...DEFAULT_PRESENTATION, ambienceId: folderId } }).success).toBe(true)
    expect(mirrorConfigSchema.safeParse({ ...baseline, presentation: { ...DEFAULT_PRESENTATION, ambienceId: 'folder-untrusted' } }).success).toBe(false)
  })
  it('defaults legacy active BGM to silence and validates the independently saved active level', () => {
    const legacy = { mode: 'always_visible', backgroundId: '', ambienceId: '', ambienceGain: .25, entranceMs: 1800, exitMs: 1800 }
    expect(parsePresentation(legacy)?.activeAmbienceGain).toBe(0)
    expect(parsePresentation({ ...legacy, activeAmbienceGain: .15 })?.activeAmbienceGain).toBe(.15)
    for (const invalid of [-.1, 1.1, NaN, Infinity, '0.2', null]) {
      expect(parsePresentation({ ...legacy, activeAmbienceGain: invalid })).toBeNull()
    }
  })
  it('accepts bounded configurable greetings and farewells while upgrading old presentation values', () => {
    const legacy = { mode: 'always_visible', backgroundId: '', ambienceId: '', ambienceGain: .25, entranceMs: 1800, exitMs: 1800 }
    expect(parsePresentation(legacy)?.sleepFarewell).toBe('如你所願，再會')
    expect(parsePresentation({ ...legacy, wakeGreeting: 'Welcome.', sleepFarewell: 'Goodbye.' })?.wakeGreeting).toBe('Welcome.')
    expect(parsePresentation({ ...legacy, sleepFarewell: '' })).toBeNull()
    expect(parsePresentation({ ...legacy, wakeGreeting: 'x'.repeat(501) })).toBeNull()
  })
  it('validates managed references while preserving old configurations without migration', () => {
    const baseline = JSON.parse(readFileSync('resources/config/default.json', 'utf8'))
    delete baseline.schemaVersion
    const parsed = mirrorConfigSchema.safeParse(baseline)
    expect(parsed.success).toBe(true)
    expect(mirrorConfigSchema.safeParse({ ...baseline, presentation: { ...DEFAULT_PRESENTATION, backgroundId: 'not-imported' } }).success).toBe(false)
    expect(mirrorConfigSchema.safeParse({ ...baseline, presentation: { ...DEFAULT_PRESENTATION, ambienceId: 'not-imported' } }).success).toBe(false)
    const next = mirrorConfigSchema.safeParse({ ...baseline, presentation: { ...DEFAULT_PRESENTATION, mode: 'emerge' } })
    expect(next.success).toBe(true)
    if (next.success) expect((next.data as { presentation: { mode: string } }).presentation.mode).toBe('emerge')
  })
  it('defaults old installations to a visible avatar and rejects unsafe asset paths', () => {
    expect(parsePresentation(undefined)?.mode).toBe('always_visible')
    expect(parsePresentation({ ...DEFAULT_PRESENTATION, backgroundId: '../../private' })).toBeNull()
    expect(parsePresentation({ ...DEFAULT_PRESENTATION, exitMs: Infinity })).toBeNull()
    expect(parsePresentation({ ...DEFAULT_PRESENTATION, ambienceGain: 2 })).toBeNull()
    expect(parsePresentation({ ...DEFAULT_PRESENTATION, unknown: true })).toBeNull()
  })
  describe('ritual managed resource validation', () => {
    const video = { id: 'mist', name: 'Mist', kind: 'video', fileName: 'mist.webm', mimeType: 'video/webm',
      byteLength: 32, sha256: 'a'.repeat(64), width: 100, height: 100, orientation: 'square',
      windowsDecode: 'passed', durationMs: 5000, audioTrack: 'absent' }
    const baseline = () => {
      const config = JSON.parse(readFileSync('resources/config/default.json', 'utf8'))
      delete config.schemaVersion; delete config.avatarCatalog
      return { ...config, visualAssets: [video], presentation: { ...DEFAULT_PRESENTATION, mode: 'reflective', entranceMs: 4000, exitMs: 2400 } }
    }
    it.each(['entranceVideoId', 'exitVideoId'])('accepts only existing video media for %s', key => {
      const config = baseline()
      const presentation = { ...config.presentation, [key]: 'mist' }
      expect(mirrorConfigSchema.safeParse({ ...config, presentation }).success).toBe(true)
      expect(mirrorConfigSchema.safeParse({ ...config, presentation: { ...presentation, [key]: 'missing' } }).success).toBe(false)
      const { durationMs: _duration, ...image } = video
      expect(mirrorConfigSchema.safeParse({ ...config, presentation,
        visualAssets: [{ ...image, kind: 'image', mimeType: 'image/png', fileName: 'mist.png' }] }).success).toBe(false)
    })
    it.each(['entranceVideoId', 'exitVideoId'])('enforces per-avatar ownership of %s', key => {
      const config = baseline()
      const avatar = { id: 'host', name: 'Host', personality: 'Synthetic host.', speakingStyle: '',
        voice: AVATAR_VOICES[0], idleSeconds: 300, modelId: 'builtin-ren', scenes: [], spells: [],
        presentation: { ...config.presentation, [key]: 'mist' } }
      const catalog = { activeAvatarId: 'host', models: [], avatars: [avatar,
        { ...avatar, id: 'other', presentation: { ...config.presentation } }],
        locks: [{ kind: 'visual', resourceId: 'mist', avatarId: 'host' }] }
      expect(mirrorConfigSchema.safeParse({ ...config, avatarCatalog: catalog }).success).toBe(true)
      expect(mirrorConfigSchema.safeParse({ ...config, avatarCatalog: { ...catalog,
        locks: [{ kind: 'visual', resourceId: 'mist', avatarId: 'other' }] } }).success).toBe(false)
      expect(mirrorConfigSchema.safeParse({ ...config, visualAssets: [], avatarCatalog: catalog }).success).toBe(false)
    })
  })
  describe('reflective ritual parsing', () => {
    const ritual = {
      ...DEFAULT_PRESENTATION, mode: 'reflective', entranceMs: 4000, exitMs: 2400,
      entranceVideoId: 'mist-in', exitVideoId: 'mist-out', entranceBlend: 'screen', exitBlend: 'normal',
      blackHoldMs: 400, revealStartMs: 1500
    }
    it('accepts and preserves a valid reflective ritual', () => {
      expect(parsePresentation(ritual)).toEqual(ritual)
    })
    it('normalizes omitted ritual fields while preserving legacy durations and modes', () => {
      for (const mode of ['always_visible', 'emerge', 'reflective']) {
        const legacy = { mode, backgroundId: '', ambienceId: '', ambienceGain: .25, entranceMs: 1800, exitMs: 1800 }
        expect(parsePresentation(legacy)).toEqual({
          ...DEFAULT_PRESENTATION, mode, entranceMs: 1800, exitMs: 1800,
          entranceVideoId: '', exitVideoId: '', entranceBlend: 'screen', exitBlend: 'screen',
          blackHoldMs: 400, revealStartMs: 1500
        })
      }
    })
    it('accepts zero offsets and a hold ending exactly when the reveal starts', () => {
      for (const offset of [0, 1500]) {
        const config = { ...ritual, blackHoldMs: offset, revealStartMs: offset }
        expect(parsePresentation(config)).toEqual(config)
      }
    })
    it('enforces hold and reveal ordering only for reflective mode', () => {
      for (const timing of [{ blackHoldMs: 1501 }, { revealStartMs: 4000 }, { revealStartMs: 4001 }]) {
        expect(parsePresentation({ ...ritual, ...timing })).toBeNull()
        for (const mode of ['always_visible', 'emerge']) {
          const config = { ...ritual, ...timing, mode }
          expect(parsePresentation(config)).toEqual(config)
        }
      }
    })
    it.each(['blackHoldMs', 'revealStartMs', 'entranceMs', 'exitMs'])('rejects invalid %s milliseconds', key => {
      for (const invalid of [-1, 10001, 400.5, NaN, Infinity, '400', null]) {
        expect(parsePresentation({ ...ritual, [key]: invalid })).toBeNull()
      }
    })
    it.each(['entranceVideoId', 'exitVideoId'])('rejects unsafe managed video IDs in %s', key => {
      for (const invalid of ['../mist', 'mist/clip', 'mist\\clip', 'Mist', 'x'.repeat(97), null]) {
        expect(parsePresentation({ ...ritual, [key]: invalid })).toBeNull()
      }
    })
    it.each(['entranceBlend', 'exitBlend'])('rejects unsupported %s values', key => {
      for (const invalid of ['multiply', '', null]) {
        expect(parsePresentation({ ...ritual, [key]: invalid })).toBeNull()
      }
    })
  })
  it('finishes an exit after Main has already returned to dormant', () => {
    vi.useFakeTimers()
    const phases: string[] = []
    const c = createPresentationController({ entranceMs: 800, exitMs: 900, changed: p => phases.push(p) })
    c.update('active'); vi.advanceTimersByTime(800)
    c.update('suspending'); c.update('dormant')
    expect(phases.at(-1)).toBe('exiting')
    vi.advanceTimersByTime(900)
    expect(phases.at(-1)).toBe('asleep')
    c.dispose(); vi.useRealTimers()
  })
  it('starts the entrance clock once across activating and repeated active updates', () => {
    vi.useFakeTimers()
    try {
      const phases: string[] = []
      const controller = createPresentationController({ entranceMs: 4000, exitMs: 2400, changed: phase => phases.push(phase) })
      controller.update('activating')
      vi.advanceTimersByTime(1000); controller.update('active')
      vi.advanceTimersByTime(1000); controller.update('active')
      vi.advanceTimersByTime(2000)
      expect(phases).toEqual(['entering', 'awake'])
      controller.dispose()
      expect(vi.getTimerCount()).toBe(0)
    } finally { vi.useRealTimers() }
  })
  it('cancels stale exit completion on a rapid wake and stops on faults', () => {
    vi.useFakeTimers()
    const phases: string[] = []
    const c = createPresentationController({ entranceMs: 500, exitMs: 1000, changed: p => phases.push(p) })
    c.update('active'); vi.advanceTimersByTime(500)
    c.update('dormant'); vi.advanceTimersByTime(100)
    c.update('activating'); c.update('active'); vi.advanceTimersByTime(1500)
    expect(phases.at(-1)).toBe('awake')
    expect(phases.slice(-2)).toEqual(['entering', 'awake'])
    c.update('maintenance'); expect(phases.at(-1)).toBe('inactive')
    c.dispose(); vi.advanceTimersByTime(5000)
    expect(phases.at(-1)).toBe('inactive')
    vi.useRealTimers()
  })
})

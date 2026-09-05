import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PRESENTATION, parsePresentation } from '../../src/shared/presentation'
import { createPresentationController } from '../../src/renderer/avatar/presentation-controller'
import { mirrorConfigSchema } from '../../src/main/config-service'
import { readFileSync } from 'node:fs'

describe('lifecycle presentation', () => {
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

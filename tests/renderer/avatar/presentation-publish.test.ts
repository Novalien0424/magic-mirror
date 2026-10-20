import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PRESENTATION, type PresentationPayload } from '../../../src/shared/presentation'

type Slot = { value?: any; dependencies?: readonly unknown[]; cleanup?: () => void }
const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as Slot[], dirty: false,
  effects: [] as { layout: boolean; run(): void }[] }))
const audio = vi.hoisted(() => ({ cue: vi.fn(() => () => undefined) }))
const ritual = vi.hoisted(() => ({ play: vi.fn(() => () => undefined) }))
vi.mock('../../../src/renderer/avatar/wake-cue', () => ({ playWakeCue: audio.cue }))
vi.mock('../../../src/renderer/avatar/ritual-video-controller', () => ({ playRitualVideo: ritual.play }))
vi.mock('../../../src/renderer/audio-devices', () => ({ getAudioDeviceRouter: () => ({
  watchVolumes: () => () => undefined,
}) }))
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  const effect = (layout: boolean, create: () => unknown, dependencies: readonly unknown[]) => {
    const index = hooks.cursor++, previous = hooks.slots[index]
    if (previous && dependencies.length === previous.dependencies?.length
      && dependencies.every((value, i) => Object.is(value, previous.dependencies?.[i]))) return
    const slot = hooks.slots[index] = { dependencies: [...dependencies], cleanup: previous?.cleanup }
    hooks.effects.push({ layout, run: () => {
      slot.cleanup?.()
      const cleanup = create()
      slot.cleanup = typeof cleanup === 'function' ? cleanup as () => void : undefined
    } })
  }
  return { ...actual,
    useState: (initial: unknown) => {
      const index = hooks.cursor++
      if (!hooks.slots[index]) hooks.slots[index] = { value: typeof initial === 'function' ? initial() : initial }
      const slot = hooks.slots[index]!
      return [slot.value, (next: unknown) => {
        const value = typeof next === 'function' ? next(slot.value) : next
        if (!Object.is(value, slot.value)) { slot.value = value; hooks.dirty = true }
      }]
    },
    useRef: (initial: unknown) => {
      const index = hooks.cursor++
      return (hooks.slots[index] ??= { value: { current: initial } }).value
    },
    useEffect: (create: () => unknown, dependencies: readonly unknown[]) => effect(false, create, dependencies),
    useLayoutEffect: (create: () => unknown, dependencies: readonly unknown[]) => effect(true, create, dependencies),
  }
})
import { PresentationStage } from '../../../src/renderer/avatar/PresentationStage'

function render(props: Parameters<typeof PresentationStage>[0], video?: HTMLVideoElement) {
  for (let pass = 0; pass < 10; pass++) {
    hooks.cursor = 0; hooks.dirty = false
    const tree = PresentationStage(props)
    // Mount the ritual ref before layout effects, as React does in the browser.
    const overlay = React.Children.toArray(tree.props.children).find(child => React.isValidElement(child)
      && (child.props as Record<string, unknown>)['data-ritual-video']) as React.ReactElement<{ ref: { current: HTMLVideoElement | null } }> | undefined
    if (overlay && video) overlay.props.ref.current = video
    const effects = hooks.effects.splice(0)
    for (const entry of effects.filter(entry => entry.layout)) entry.run()
    for (const entry of effects.filter(entry => !entry.layout)) entry.run()
    if (!hooks.dirty) return tree
  }
  throw Error('Synthetic presentation did not settle')
}
beforeEach(() => {
  hooks.cursor = 0; hooks.slots = []; hooks.effects = []; hooks.dirty = false
  vi.useFakeTimers(); vi.stubGlobal('React', React)
  vi.stubGlobal('window', { matchMedia: () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) })
})
afterEach(() => {
  for (const slot of hooks.slots) slot.cleanup?.()
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks()
})

describe('published presentation keeps the current lifecycle', () => {
  const initial: PresentationPayload = { config: { ...DEFAULT_PRESENTATION, mode: 'reflective', entranceMs: 4000, exitMs: 2400 }, background: null }
  it('does not replay the entrance or cue in Active and uses the new timings on the next transition', () => {
    const onPhase = vi.fn()
    const props = { payload: initial, lifecycle: 'dormant' as const, children: null, onPhase }
    render(props)
    expect(render({ ...props, lifecycle: 'activating' }).props['data-phase']).toBe('entering')
    vi.advanceTimersByTime(4000)
    expect(render({ ...props, lifecycle: 'active' }).props['data-phase']).toBe('awake')
    expect(audio.cue).toHaveBeenCalledOnce()
    const published = { ...initial, model: { id: 'model-synthetic', manifestFileName: 'Synthetic.model3.json' },
      config: { ...initial.config, entranceMs: 5000, exitMs: 3000, revealStartMs: 1800 } }
    expect(render({ ...props, payload: published, lifecycle: 'active' }).props['data-phase']).toBe('awake')
    expect(audio.cue).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    expect(render({ ...props, payload: published, lifecycle: 'dormant' }).props['data-phase']).toBe('exiting')
    vi.advanceTimersByTime(3000)
    expect(render({ ...props, payload: published }).props['data-phase']).toBe('asleep')
    render({ ...props, payload: published, lifecycle: 'activating' })
    expect(audio.cue).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(4999)
    expect(render({ ...props, payload: published, lifecycle: 'active' }).props['data-phase']).toBe('entering')
    vi.advanceTimersByTime(1)
    expect(render({ ...props, payload: published, lifecycle: 'active' }).props['data-phase']).toBe('awake')
  })
  it('keeps an in-progress entrance deadline when a draft is published', () => {
    const props = { payload: initial, lifecycle: 'activating' as const, children: null }
    render(props)
    vi.advanceTimersByTime(1000)
    const payload = { ...initial, config: { ...initial.config, entranceMs: 6000 } }
    expect(render({ ...props, payload, lifecycle: 'active' }).props['data-phase']).toBe('entering')
    expect(audio.cue).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(3000)
    expect(render({ ...props, payload, lifecycle: 'active' }).props['data-phase']).toBe('awake')
    expect(audio.cue).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('authored reflective performance', () => {
  it.each([true, false])('plays both ritual videos with reduced motion %s', reducedMotion => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: reducedMotion, addEventListener: vi.fn(), removeEventListener: vi.fn() }) })
    const video = {} as HTMLVideoElement
    const onFailure = vi.fn()
    const props = { payload: { config: { ...DEFAULT_PRESENTATION, mode: 'reflective' as const,
      blackHoldMs: 400, revealStartMs: 1500, entranceMs: 4000, exitMs: 2400 }, background: null,
      entranceVideo: { id: 'mist', kind: 'video' as const }, exitVideo: { id: 'mist', kind: 'video' as const } },
      lifecycle: 'dormant' as const, children: null, onFailure }
    render(props, video)
    render({ ...props, lifecycle: 'activating' }, video)
    expect(ritual.play).toHaveBeenCalledTimes(1)
    expect(ritual.play).toHaveBeenLastCalledWith(expect.objectContaining({ video,
      src: 'magic-mirror-media://visual/mist', delayMs: 400, durationMs: 4000 }))
    vi.advanceTimersByTime(4000)
    expect(render({ ...props, lifecycle: 'active' }, video).props['data-phase']).toBe('awake')
    render(props, video)
    expect(ritual.play).toHaveBeenCalledTimes(2)
    expect(ritual.play).toHaveBeenLastCalledWith(expect.objectContaining({ video, delayMs: 0, durationMs: 2400 }))
    expect(onFailure).not.toHaveBeenCalled()
  })
})

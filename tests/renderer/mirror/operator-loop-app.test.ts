import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OperatorLoopSnapshot } from '../../../src/shared/operator-loop'
import { DEFAULT_LOOP_VIDEO } from '../../../src/shared/operator-loop'

// Exercise the mode boundary without mounting a rig, provider or browser DOM.
const hooks = vi.hoisted(() => ({ cursor: 0, values: [] as unknown[], effect: undefined as (() => void | (() => void)) | undefined, started: false }))
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return { ...actual,
    useState: (initial: unknown) => {
      const index = hooks.cursor++
      if (!(index in hooks.values)) hooks.values[index] = initial
      return [hooks.values[index], (next: unknown) => {
        hooks.values[index] = typeof next === 'function' ? next(hooks.values[index]) : next
      }]
    },
    useEffect: (effect: () => void | (() => void)) => {
      if (!hooks.started) { hooks.effect = effect; hooks.started = true }
    },
  }
})
import { App } from '../../../src/renderer/mirror/App'
import { OperatorLoopBlack, OperatorLoopPlayer } from '../../../src/renderer/mirror/OperatorLoopPlayer'

const snapshot = (patch: Partial<OperatorLoopSnapshot> = {}): OperatorLoopSnapshot => ({
  generation: 3, mode: 'loop', status: 'preparing', reason: 'operator_loop_preparing', settings: { ...DEFAULT_LOOP_VIDEO }, ...patch,
})
const render = () => { hooks.cursor = 0; return App() }
let cleanup: (() => void) | undefined
const mount = () => { const tree = render(); cleanup = hooks.effect?.() || undefined; return tree }
const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve() }
function fixture() {
  let resolve!: (value: OperatorLoopSnapshot) => void, reject!: (error: Error) => void
  let listener!: (value: OperatorLoopSnapshot) => void
  const pending = new Promise<OperatorLoopSnapshot>((yes, no) => { resolve = yes; reject = no })
  const unsubscribe = vi.fn(), report = vi.fn(), notifyReady = vi.fn()
  const get = vi.fn(() => pending)
  vi.stubGlobal('window', { magicMirror: { getOperatorLoop: get, notifyReady,
    onOperatorLoop(callback: typeof listener) { listener = callback; return unsubscribe }, reportRealtimeMetadata: report } })
  return { resolve, reject, unsubscribe, report, notifyReady, emit: (value: OperatorLoopSnapshot) => listener(value) }
}
beforeEach(() => { hooks.cursor = 0; hooks.values = []; hooks.started = false; hooks.effect = undefined; cleanup = undefined })
afterEach(() => { cleanup?.(); vi.unstubAllGlobals() })

describe('Mirror operator loop mode boundary', () => {
  it('keeps a restored intent black until Main validates and releases avatar resources', async () => {
    const h = fixture(); mount()
    h.resolve(snapshot({ generation: 0 })); await settle()
    expect(render().type).toBe(OperatorLoopBlack)
  })
  it('starts black and selects the dedicated player only after the snapshot resolves', async () => {
    const h = fixture()
    expect(mount().type).toBe(OperatorLoopBlack)
    expect(h.notifyReady).toHaveBeenCalledOnce()
    h.resolve(snapshot()); await settle()
    const tree = render()
    expect(tree.type).toBe(OperatorLoopPlayer); expect(tree.key).toBe('3')
  })
  it('keeps failed loop mode black and permits avatar mode only from Main', async () => {
    const h = fixture(); mount()
    h.resolve(snapshot({ status: 'failed' })); await settle()
    expect(render().type).toBe(OperatorLoopBlack)
    h.emit(snapshot({ mode: 'avatar', status: 'idle', generation: 4 }))
    expect((render().type as Function).name).toBe('AvatarApp')
  })
  it('keeps a newer recovery event when the initial read returns an older avatar snapshot', async () => {
    const h = fixture(); mount()
    h.emit(snapshot({ generation: 5, status: 'recovering' }))
    h.resolve(snapshot({ mode: 'avatar', status: 'idle', generation: 2 })); await settle()
    expect(render().type).toBe(OperatorLoopPlayer); expect(render().key).toBe('5')
    h.emit(snapshot({ mode: 'avatar', status: 'idle', generation: 1 }))
    expect(render().key).toBe('5')
  })
  it('reports only a bounded reason on snapshot failure and does not fall back to the avatar', async () => {
    const h = fixture(); mount()
    h.reject(Error('synthetic transport details')); await settle()
    expect(render().type).toBe(OperatorLoopBlack)
    expect(h.report).toHaveBeenCalledWith({ kind: 'avatar', status: 'failed', reason: 'operator_loop_snapshot_unavailable' })
  })
  it('unsubscribes and ignores late reads and events after disposal', async () => {
    const h = fixture(); mount(); cleanup?.(); cleanup = undefined
    h.resolve(snapshot()); h.emit(snapshot()); await settle()
    expect(h.unsubscribe).toHaveBeenCalledOnce(); expect(render().type).toBe(OperatorLoopBlack)
  })
})

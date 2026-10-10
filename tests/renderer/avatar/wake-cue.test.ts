import { afterEach, describe, expect, it, vi } from 'vitest'
import { playWakeCue } from '../../../src/renderer/avatar/wake-cue'

const f = vi.hoisted(() => ({ attach: vi.fn(), effects: 1 }))
vi.mock('../../../src/renderer/audio-devices', () => ({ getAudioDeviceRouter: () => ({ attach: f.attach,
  snapshot: () => ({ preferences: { volumes: { effects: f.effects } } }) }) }))
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
function setup() {
  vi.useFakeTimers(); f.effects = 1
  const detach = vi.fn(), close = vi.fn(async () => {}), start = vi.fn()
  const connect = vi.fn(function (this: unknown) { return this })
  const level = vi.fn(), param = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: level }
  class Context {
    currentTime = 0; destination = {}; close = close; resume = vi.fn(async () => {})
    createOscillator() { return { frequency: param, connect, start, stop: vi.fn(), type: '' } }
    createGain() { return { gain: param, connect } }
  }
  vi.stubGlobal('AudioContext', Context); f.attach.mockReset().mockResolvedValue(detach)
  return { detach, close, start, level }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
describe('local wake acknowledgement', () => {
  it('plays a brief routed cue and releases its context without a persistent audio owner', async () => {
    const p = setup(), failed = vi.fn(), stop = playWakeCue(failed)
    await tick(); expect(p.start).toHaveBeenCalledOnce(); expect(p.level).toHaveBeenCalledWith(.06, .015)
    await vi.advanceTimersByTimeAsync(221)
    expect(p.close).toHaveBeenCalledOnce(); expect(p.detach).toHaveBeenCalledOnce()
    stop(); expect(p.close).toHaveBeenCalledOnce(); expect(failed).not.toHaveBeenCalled()
  })
  it('honors effects mute loaded during routing', async () => {
    const p = setup(); let routed!: (release: () => void) => void
    f.attach.mockImplementationOnce(() => new Promise(resolve => { routed = resolve }))
    playWakeCue(vi.fn()); f.effects = 0; routed(p.detach); await tick()
    expect(p.start).not.toHaveBeenCalled(); expect(p.close).toHaveBeenCalledOnce()
  })
  it('cannot play a late cue after the entrance has been cancelled', async () => {
    const p = setup(); let routed!: (release: () => void) => void
    f.attach.mockImplementationOnce(() => new Promise(resolve => { routed = resolve }))
    const stop = playWakeCue(vi.fn()); stop(); routed(p.detach); await tick()
    expect(p.start).not.toHaveBeenCalled(); expect(p.detach).toHaveBeenCalledOnce(); expect(p.close).toHaveBeenCalledOnce()
  })
})

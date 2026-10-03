import { describe, expect, it, vi } from 'vitest'
import {
  createAvatarRuntimeController,
} from '../../../src/renderer/avatar/avatar-runtime-controller'
import type { AvatarState } from '../../../src/renderer/avatar/avatar-state'

function port() {
  return {
    setState: vi.fn<(state: AvatarState) => void>(),
    setMouthOpen: vi.fn<(value: number) => void>(),
    stopSpeakingMotion: vi.fn<() => void>(),
    clearExpression: vi.fn<() => void>(),
  }
}

describe('avatar runtime controller', () => {
  it('gates body motions by the projected avatar state', () => {
    const renderPort = port()
    const controller = createAvatarRuntimeController(renderPort)

    controller.setState('Dormant')
    controller.setState('Speaking')
    controller.setState('Speaking')

    expect(renderPort.setState).toHaveBeenCalledTimes(2)
    expect(renderPort.setState).toHaveBeenNthCalledWith(1, 'Dormant')
    expect(renderPort.setState).toHaveBeenNthCalledWith(2, 'Speaking')
  })

  it('clamps mouth values to the Cubism 0..1 boundary', () => {
    const renderPort = port()
    const controller = createAvatarRuntimeController(renderPort)

    controller.setMouthOpen(-0.4)
    controller.setMouthOpen(0.45)
    controller.setMouthOpen(1.8)

    expect(renderPort.setMouthOpen.mock.calls).toEqual([[0], [0.45], [1]])
  })

  it('stops audio-driven mouth, speaking motion, and expression together on interrupt', () => {
    const renderPort = port()
    const controller = createAvatarRuntimeController(renderPort)

    controller.setState('Speaking')
    controller.setMouthOpen(0.8)
    controller.interrupt()

    expect(renderPort.setMouthOpen).toHaveBeenLastCalledWith(0)
    expect(renderPort.stopSpeakingMotion).toHaveBeenCalledOnce()
    expect(renderPort.clearExpression).toHaveBeenCalledOnce()
    expect(controller.snapshot()).toEqual({ state: 'Listening', mouthOpen: 0 })
    expect(renderPort.setState).toHaveBeenLastCalledWith('Listening')
  })

  it('clears the mouth and pending speaking work when entering a non-Live2D state', () => {
    const renderPort = port()
    const controller = createAvatarRuntimeController(renderPort)

    controller.setState('Speaking')
    controller.setMouthOpen(0.7)
    controller.setState('OfflineLoop')

    expect(renderPort.setMouthOpen).toHaveBeenLastCalledWith(0)
    expect(renderPort.stopSpeakingMotion).toHaveBeenCalledOnce()
    expect(renderPort.clearExpression).toHaveBeenCalledOnce()
    expect(controller.snapshot()).toEqual({ state: 'OfflineLoop', mouthOpen: 0 })
  })
})

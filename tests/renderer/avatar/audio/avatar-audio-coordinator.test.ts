import { describe, expect, it, vi } from 'vitest'
import {
  createAvatarAudioCoordinator,
  type AvatarAudioOutput,
} from '../../../../src/renderer/avatar/audio/avatar-audio-coordinator'
import type { AvatarRenderPort } from '../../../../src/renderer/avatar/avatar-runtime-controller'
import type { LipSyncDriver } from '../../../../src/renderer/avatar/audio/lip-sync-driver'

function renderer(): AvatarRenderPort {
  return {
    setState: vi.fn(),
    setMouthOpen: vi.fn(),
    stopSpeakingMotion: vi.fn(),
    clearExpression: vi.fn(),
  }
}

function output(): AvatarAudioOutput {
  return {
    analyser: {
      fftSize: 4,
      getFloatTimeDomainData: vi.fn(),
    },
    attachAnalyserTap: vi.fn(),
  }
}

describe('actual-output avatar audio coordination', () => {
  it('starts lip sync only from actual output and projects speaking/listening', () => {
    const renderPort = renderer()
    const audioOutput = output()
    const driver: LipSyncDriver = { start: vi.fn(), stop: vi.fn() }
    const createDriver = vi.fn(() => driver)
    const onConversationState = vi.fn()
    const coordinator = createAvatarAudioCoordinator({
      createDriver,
      onConversationState,
      eventSink: vi.fn(),
    })

    coordinator.setRenderer(renderPort)
    coordinator.setAudioOutput(audioOutput)
    expect(createDriver).not.toHaveBeenCalled()

    coordinator.handleActivity('output_started')
    expect(audioOutput.attachAnalyserTap).toHaveBeenCalledOnce()
    expect(createDriver).toHaveBeenCalledOnce()
    expect(driver.start).toHaveBeenCalledOnce()
    expect(onConversationState).toHaveBeenLastCalledWith('speaking')

    coordinator.handleActivity('output_stopped')
    expect(driver.stop).toHaveBeenCalledOnce()
    expect(onConversationState).toHaveBeenLastCalledWith('listening')
    expect(renderPort.setMouthOpen).toHaveBeenLastCalledWith(0)
  })

  it('stops mouth, speaking motion, and expression immediately on interruption', () => {
    const renderPort = renderer()
    const driver: LipSyncDriver = { start: vi.fn(), stop: vi.fn() }
    const coordinator = createAvatarAudioCoordinator({
      createDriver: () => driver,
      onConversationState: vi.fn(),
      eventSink: vi.fn(),
    })
    coordinator.setRenderer(renderPort)
    coordinator.setAudioOutput(output())
    coordinator.handleActivity('output_started')

    coordinator.handleActivity('interrupted')

    expect(driver.stop).toHaveBeenCalledOnce()
    expect(renderPort.setMouthOpen).toHaveBeenLastCalledWith(0)
    expect(renderPort.stopSpeakingMotion).toHaveBeenCalledOnce()
    expect(renderPort.clearExpression).toHaveBeenCalledOnce()
    expect(renderPort.setState).toHaveBeenLastCalledWith('Listening')
  })

  it('projects user speech to listening and the post-speech gap to thinking', () => {
    const onConversationState = vi.fn()
    const coordinator = createAvatarAudioCoordinator({
      createDriver: vi.fn(),
      onConversationState,
      eventSink: vi.fn(),
    })

    coordinator.handleActivity('speech_started')
    coordinator.handleActivity('speech_stopped')

    expect(onConversationState.mock.calls).toEqual([['listening'], ['thinking']])
  })

  it('degrades visibly and keeps the mouth closed when the analyser tap cannot attach', () => {
    const renderPort = renderer()
    const audioOutput = output()
    const eventSink = vi.fn()
    vi.mocked(audioOutput.attachAnalyserTap).mockImplementation(() => {
      throw new Error('tap unavailable')
    })
    const coordinator = createAvatarAudioCoordinator({
      createDriver: vi.fn(),
      onConversationState: vi.fn(),
      eventSink,
    })
    coordinator.setRenderer(renderPort)
    coordinator.setAudioOutput(audioOutput)

    coordinator.handleActivity('output_started')

    expect(eventSink).toHaveBeenCalledWith({
      status: 'degraded',
      reason: 'avatar_analyser_attach_failed',
    })
    expect(renderPort.setMouthOpen).toHaveBeenLastCalledWith(0)
  })
})

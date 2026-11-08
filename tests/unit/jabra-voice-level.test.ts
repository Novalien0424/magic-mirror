import { describe, expect, it, vi } from 'vitest'
import { createJabraVoiceLevel } from '../../src/main/jabra-voice-level'

const settle = () => new Promise(resolve => setTimeout(resolve, 0))

function setup(input: { enabled?: boolean, fail?: boolean } = {}) {
  const reset = vi.fn(() => input.fail ? Promise.reject(Error('x')) : Promise.resolve())
  const report = vi.fn(), degraded = vi.fn()
  return { reset, report, degraded, level: createJabraVoiceLevel({ enabled: input.enabled ?? true, reset, report, degraded }) }
}

describe('Jabra call volume', () => {
  it('sets it as the first conversation of a run opens the microphone, then leaves later ones alone', async () => {
    const { reset, report, level } = setup()
    level.lifecycle('dormant')
    expect(reset).not.toHaveBeenCalled()
    level.lifecycle('activating')
    level.lifecycle('active')
    await settle()
    expect(reset).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith('jabra_voice_level_reset')
    for (const state of ['suspending', 'dormant', 'activating', 'active'] as const) level.lifecycle(state)
    await settle()
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('START or STUDIO re-arms it for the next conversation', async () => {
    const { reset, level } = setup()
    level.lifecycle('activating'); level.lifecycle('active'); await settle()
    level.lifecycle('dormant')
    level.arm()
    level.lifecycle('activating'); level.lifecycle('active'); await settle()
    expect(reset).toHaveBeenCalledTimes(2)
  })

  it('retries with the next conversation when the helper fails, and reports the failure', async () => {
    const { reset, degraded, level } = setup({ fail: true })
    level.lifecycle('activating'); level.lifecycle('active'); await settle()
    expect(degraded).toHaveBeenCalledWith('jabra_voice_level_reset_failed')
    level.lifecycle('dormant'); level.lifecycle('activating'); await settle()
    expect(reset).toHaveBeenCalledTimes(2)
  })

  it('stays armed when an activation ends before the helper watched an active conversation', async () => {
    let finish!: () => void
    const reset = vi.fn(() => new Promise<void>(done => { finish = done }))
    const level = createJabraVoiceLevel({ enabled: true, reset, report: vi.fn(), degraded: vi.fn() })
    level.lifecycle('activating'); level.lifecycle('dormant')
    finish(); await settle()
    level.lifecycle('activating')
    expect(reset).toHaveBeenCalledTimes(2)
  })

  it('never changes levels in QA runs and reports the skip once', async () => {
    const { reset, report, level } = setup({ enabled: false })
    level.lifecycle('activating'); level.lifecycle('active'); level.arm(); level.lifecycle('activating')
    await settle()
    expect(reset).not.toHaveBeenCalled()
    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith('jabra_voice_level_qa_skipped')
  })
})

import { afterEach, expect, it, vi } from 'vitest'
import { createAvatarRuntimeReporter } from '../../../src/renderer/mirror/avatar-runtime-reporter'
import type { AvatarRuntimeSnapshot } from '../../../src/shared/bridge'

afterEach(() => vi.useRealTimers())
it('bounds high-rate samples, keeps the latest value and cancels pending work', async () => {
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] })
  const send = vi.fn(), reporter = createAvatarRuntimeReporter(send)
  reporter.report({ mouthOpen: 0 })
  for (let i = 1; i <= 60; i++) reporter.report({ mouthOpen: i / 60 })
  expect(send).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(100)
  expect(send).toHaveBeenCalledTimes(2)
  expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ mouthOpen: 1 }))
  reporter.report({ mouthOpen: .5 }); reporter.dispose()
  await vi.advanceTimersByTimeAsync(100)
  expect(send).toHaveBeenCalledTimes(2)
})
it('normalizes metadata reasons, suppresses unchanged reports and sends devices only on change', () => {
  const send = vi.fn(), reporter = createAvatarRuntimeReporter(send)
  const audioDevices = { revision: 1 } as unknown as AvatarRuntimeSnapshot['audioDevices']
  reporter.report({ reason: 'avatar_motion_started:Dormant', audioDevices })
  expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ reason: 'avatar_motion_started_dormant', audioDevices }))
  reporter.report({ reason: 'avatar_motion_started:Dormant', audioDevices })
  expect(send).toHaveBeenCalledTimes(1)
  reporter.report({ state: 'Speaking' })
  expect(send.mock.calls[1][0]).not.toHaveProperty('audioDevices')
  reporter.dispose()
})

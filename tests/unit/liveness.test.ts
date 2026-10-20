import { describe, expect, it, vi } from 'vitest'
import { createRendererLiveness } from '../../src/main/liveness'

describe('renderer liveness', () => {
  it('allows startup, renews on heartbeats and reports a hang only once', () => {
    let time = 0
    const failed = vi.fn(), health = createRendererLiveness(() => time, failed)
    time = 29_999; health.check(); expect(failed).not.toHaveBeenCalled()
    health.beat()
    time = 59_998; health.check(); expect(failed).not.toHaveBeenCalled()
    time = 59_999; health.check(); expect(failed).toHaveBeenCalledOnce()
    health.beat(); time += 60_000; health.check(); expect(failed).toHaveBeenCalledOnce()
  })
})

import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { formatPhase1LiveResult, runPhase1LiveSmoke } from '../../scripts/run-phase1-live-smoke.mjs'

const fixture = resolve(
  fileURLToPath(new URL('../fixtures/phase1-live-smoke-child.mjs', import.meta.url)),
)

describe('phase 1 live smoke runner', () => {
  it.each(['available', 'unavailable', 'probe_failed'] as const)(
    'validates and preserves child model availability: %s',
    async (modelAvailability) => {
      const result = await runPhase1LiveSmoke({
        command: process.execPath,
        args: [fixture],
        env: { PHASE1_LIVE_FIXTURE_MODE: modelAvailability },
        timeoutMs: 2_000,
      })

      expect(result.status).toBe('passed')
      expect(result.exitCode).toBe(0)
      expect(result.markerCount).toBe(1)
      expect(result.modelAvailability).toBe(modelAvailability)
      expect(result.cleanup).toBe('passed')
      await expect(access(result.temporaryRoot)).rejects.toThrow()
    },
  )

  it('preserves a valid child value on a failed child result', async () => {
    const result = await runPhase1LiveSmoke({
      command: process.execPath,
      args: [fixture],
      env: { PHASE1_LIVE_FIXTURE_MODE: 'fail' },
      timeoutMs: 2_000,
    })

    expect(result.status).toBe('failed')
    expect(result.exitCode).toBe(1)
    expect(result.markerCount).toBe(1)
    expect(result.reason).toBe('active_timeout')
    expect(result.modelAvailability).toBe('unavailable')
    expect(result.cleanup).toBe('passed')
    await expect(access(result.temporaryRoot)).rejects.toThrow()
  })

  it.each(['missing_model_availability', 'invalid_model_availability'] as const)(
    'rejects a child marker with %s',
    async (mode) => {
      const result = await runPhase1LiveSmoke({
        command: process.execPath,
        args: [fixture],
        env: { PHASE1_LIVE_FIXTURE_MODE: mode },
        timeoutMs: 2_000,
      })

      expect(result.status).toBe('failed')
      expect(result.stage).toBe('runner')
      expect(result.reason).toBe('invalid_marker')
      expect(result.exitCode).toBe(1)
      expect(result.markerCount).toBe(1)
      expect(result.modelAvailability).toBe('probe_failed')
      expect(result.cleanup).toBe('passed')
      await expect(access(result.temporaryRoot)).rejects.toThrow()
    },
  )

  it('uses probe_failed for a synthetic duplicate-marker result', async () => {
    const result = await runPhase1LiveSmoke({
      command: process.execPath,
      args: [fixture],
      env: { PHASE1_LIVE_FIXTURE_MODE: 'duplicate' },
      timeoutMs: 2_000,
    })

    expect(result.status).toBe('failed')
    expect(result.stage).toBe('runner')
    expect(result.reason).toBe('duplicate_marker')
    expect(result.exitCode).toBe(1)
    expect(result.markerCount).toBe(2)
    expect(result.modelAvailability).toBe('probe_failed')
    expect(result.cleanup).toBe('passed')
    await expect(access(result.temporaryRoot)).rejects.toThrow()
  })

  it('kills a hanging child tree and reports a single timeout result', async () => {
    const result = await runPhase1LiveSmoke({
      command: process.execPath,
      args: [fixture],
      env: { PHASE1_LIVE_FIXTURE_MODE: 'hang' },
      timeoutMs: 150,
    })

    expect(result.status).toBe('failed')
    expect(result.stage).toBe('runner')
    expect(result.reason).toBe('timeout')
    expect(result.exitCode).toBe(1)
    expect(result.outputMarkerCount).toBe(1)
    expect(result.modelAvailability).toBe('probe_failed')
    await expect(access(result.temporaryRoot)).rejects.toThrow()
  })

  it('formats a missing result as a fixed probe_failed marker', () => {
    const marker = formatPhase1LiveResult({})

    expect(marker).toContain('model_availability=probe_failed')
    expect(marker).not.toContain('model_availability=available')
    expect(marker).not.toContain('model_availability=unavailable')
  })
})

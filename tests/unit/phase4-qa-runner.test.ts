import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const RUNNER_SOURCE = readFileSync(
  new URL('../../scripts/run-phase4-qa.mjs', import.meta.url),
  'utf8',
)
const QA_SOURCE = readFileSync(
  new URL('../../src/main/phase4-qa.ts', import.meta.url),
  'utf8',
)
const PACKAGE_JSON = JSON.parse(readFileSync(
  new URL('../../package.json', import.meta.url),
  'utf8',
)) as { scripts?: Record<string, string> }

describe('Phase 4 live QA runner', () => {
  it('keeps the isolated Realtime session alive through renderer capture', () => {
    expect(RUNNER_SOURCE).toContain('config.idleSeconds = 300')
    expect(RUNNER_SOURCE).toContain("MIRROR_DEVELOPER_MODE: 'disabled'")
  })

  it('observes a pending mouth probe when an earlier scene assertion fails', () => {
    expect(QA_SOURCE).toContain('void mouthPromise?.catch(() => undefined)')
  })

  it('provides an npm command that reliably enables live mode', () => {
    expect(PACKAGE_JSON.scripts?.['test:phase4:qa:live'])
      .toBe('node scripts/run-phase4-qa.mjs --live')
  })

  it('covers finite, looped, replaced, embedded-audio, and failed visuals', () => {
    for (const fixture of [
      'phase4-still.png',
      'phase4-finite-silent.webm',
      'phase4-loop-silent.webm',
      'phase4-finite-embedded-audio.webm',
      'phase4-intentionally-missing.webm',
    ]) expect(RUNNER_SOURCE).toContain(fixture)

    for (const step of [
      'visual_finite',
      'visual_loop_stop',
      'visual_replacement',
      'visual_embedded_audio',
      'visual_failure_cleanup',
    ]) expect(QA_SOURCE).toContain(step)
  })

  it('injects and rejects a stale visual event after scene replacement', () => {
    expect(QA_SOURCE).toContain("type: 'ended'")
    expect(QA_SOURCE).toContain("waitForAvatarReason(input.runtime, 'stale_scene_event'")
  })

  it('keeps step and result evidence metadata-only', () => {
    const evidenceShape = QA_SOURCE.slice(
      QA_SOURCE.indexOf('export interface Phase4QaEvidence'),
      QA_SOURCE.indexOf('export interface Phase4QaResult'),
    )
    expect(evidenceShape).not.toContain('transcript')
    expect(evidenceShape).not.toContain('absolutePath')
    expect(QA_SOURCE).toContain('readonly visualCount: number')
  })
})

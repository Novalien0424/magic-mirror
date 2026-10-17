import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error Shared plain-JavaScript evidence CLI.
import { qualityRates, wilson } from '../../scripts/raven-quality-rates.mjs'
describe('Wilson failure intervals', () => {
  it('does not turn zero observed failures into certainty', () => {
    expect(wilson(0, 10)).toMatchObject({ failures: 0, count: 10, rate: 0, low95: 0 })
    expect(wilson(0, 10).high95).toBeCloseTo(0.27753, 4)
    expect(wilson(5, 10).low95).toBeCloseTo(0.23659, 4)
    expect(wilson(5, 10).high95).toBeCloseTo(0.76341, 4)
    expect(wilson(0, 0).rate).toBeNull()
    expect(() => wilson(11, 10)).toThrow()
  })
  it('does not pool different reasoning efforts or physical and synthetic input', async () => {
    const root = await mkdtemp(join(tmpdir(), 'raven-rates-'))
    try {
      const dirs = []
      for (const [index, [reasoningEffort, deviceRoute, probeSha256]] of [
        ['low', 'virtual'], ['low', 'virtual'], ['minimal', 'virtual'], ['low', 'physical'], ['low', 'virtual', 'changed-probe'],
      ].entries()) {
        const directory = join(root, String(index)); dirs.push(directory); await mkdir(directory)
        await writeFile(join(directory, 'raven-provenance.json'), JSON.stringify({ renderedPromptSha256: 'public-prompt',
          judgeCriteriaSha256: 'criteria', reasoningEffort, deviceRoute, probeSha256, models: { dialogue: 'configured' } }))
        await writeFile(join(directory, 'raven-results.json'), JSON.stringify({ passed: true, qualityDiagnostics: [
          { scenario: 'case', turn: 'turn', codes: index === 2 ? ['wrong_language'] : [] },
        ] }))
      }
      const { groups } = await qualityRates(dirs)
      expect(groups).toHaveLength(4)
      expect(groups.find((g: { runs: number }) => g.runs === 2).rates.wrong_language).toMatchObject({ count: 2, failures: 0 })
      expect(groups.find((g: { reasoningEffort: string }) => g.reasoningEffort === 'minimal').rates.wrong_language).toMatchObject({ count: 1, failures: 1 })
    } finally { await rm(root, { recursive: true, force: true }) }
  })
  it('separates case mixes, excludes duplicate runs and leaves ungraded character unknown', async () => {
    const root = await mkdtemp(join(tmpdir(), 'raven-rates-'))
    try {
      const dirs: string[] = []
      for (const [index, scenario] of ['character_consistency', 'two_visit_memory', 'character_consistency'].entries()) {
        const directory = join(root, String(index)); dirs.push(directory); await mkdir(directory)
        await writeFile(join(directory, 'raven-provenance.json'), JSON.stringify({ renderedPromptSha256: 'same', judgeCriteriaSha256: 'same' }))
        await writeFile(join(directory, 'raven-results.json'), JSON.stringify({ passed: index !== 0,
          qualityDiagnostics: [{ scenario, turn: 'a', codes: [] }],
          quality: index === 0 ? [{ turns: [{ scores: [{ category: 'character', score: 2 }] }] }] : [],
        }))
      }
      const { groups, excluded } = await qualityRates([...dirs, dirs[0]])
      expect(groups).toHaveLength(2)
      expect(excluded).toEqual([{ run: '0', reason: 'duplicate_run' }])
      const character = groups.find((g: { runs: number }) => g.runs === 2)
      expect(character.rates.character_drift).toMatchObject({ count: 1, failures: 1, rate: 1 })
      expect(groups.find((g: { runs: number }) => g.runs === 1).rates.character_drift).toMatchObject({ count: 0, rate: null })
    } finally { await rm(root, { recursive: true, force: true }) }
  })
  it('rates measured preambles over quick-tool stages, excluding unattributed calls', async () => {
    const root = await mkdtemp(join(tmpdir(), 'raven-rates-'))
    try {
      await writeFile(join(root, 'raven-provenance.json'), JSON.stringify({ renderedPromptSha256: 'same', judgeCriteriaSha256: 'same' }))
      await writeFile(join(root, 'raven-results.json'), JSON.stringify({ passed: false, qualityDiagnostics: [{ scenario: 'case', turn: 'a', codes: [] }],
        toolTimingEvidence: [
          { stage: 'case_a', quickToolCalls: 1, unattributedQuickToolCalls: 0, quickToolPreambles: 1 },
          { stage: 'case_b', quickToolCalls: 2, unattributedQuickToolCalls: 0, quickToolPreambles: 0 },
          { stage: 'case_c', quickToolCalls: 1, unattributedQuickToolCalls: 1, quickToolPreambles: 0 },
          { stage: 'case_d', quickToolCalls: 0, unattributedQuickToolCalls: 0, quickToolPreambles: 0 },
        ] }))
      const { groups } = await qualityRates([root])
      expect(groups[0].rates.measured_tool_preamble).toMatchObject({ count: 2, failures: 1 })
      expect(groups[0].rates.tool_preamble).toMatchObject({ count: 1, failures: 0 })
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})

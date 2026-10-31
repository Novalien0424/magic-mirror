import { readFile, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function wilson(failures, count) {
  if (!Number.isInteger(count) || !Number.isInteger(failures) || failures < 0 || count < failures) throw Error('invalid_rate_counts')
  if (!count) return { count: 0, failures: 0, rate: null, low95: null, high95: null }
  const z = 1.959963984540054, p = failures / count, denominator = 1 + z * z / count
  const center = (p + z * z / (2 * count)) / denominator
  const radius = z * Math.sqrt(p * (1 - p) / count + z * z / (4 * count * count)) / denominator
  return { count, failures, rate: p, low95: Math.max(0, center - radius), high95: Math.min(1, center + radius) }
}

const BASELINE = fileURLToPath(new URL('../resources/testing/raven-quality-baseline.v1.json', import.meta.url))

/** Reply quality is a rate, not a gate (owner ruling 2026-10-31). A group regresses
 * when its judged-turn failure rate is significantly above the recorded baseline for
 * the same judge and dialogue model, weighted by the group's own scenario mix. */
export function compareBaseline(group, baseline) {
  const scenarios = baseline?.judgeVersion === group.judgeVersion ? baseline.models?.[group.models?.realtimeDialogue?.modelId] : undefined
  if (!scenarios) return { status: 'no_baseline' }
  let turns = 0, failures = 0, expected = 0
  for (const [id, row] of Object.entries(group.scenarioTurns)) {
    const reference = scenarios[id]
    if (!reference?.judgedTurns) continue
    turns += row.turns; failures += row.failures; expected += row.turns * reference.failedTurns / reference.judgedTurns
  }
  if (!turns) return { status: 'no_baseline' }
  const observed = wilson(failures, turns), expectedRate = expected / turns
  return { status: observed.low95 > expectedRate ? 'regression' : observed.high95 < expectedRate ? 'improvement' : 'within_baseline',
    comparedTurns: turns, failureRate: observed.rate, low95: observed.low95, high95: observed.high95, baselineFailureRate: expectedRate }
}

export async function qualityRates(directories, baseline) {
  baseline ??= JSON.parse(await readFile(BASELINE, 'utf8'))
  const groups = new Map(), excluded = [], seen = new Set()
  for (const directory of directories) {
    const canonical = await realpath(directory)
    if (seen.has(canonical)) { excluded.push({ run: directory.split('/').at(-1), reason: 'duplicate_run' }); continue }
    seen.add(canonical)
    const [p, result] = await Promise.all(['raven-provenance.json', 'raven-results.json'].map(name => readFile(join(directory, name), 'utf8').then(JSON.parse)))
    if (result.running || !p.renderedPromptSha256 || !p.judgeCriteriaSha256) { excluded.push({ run: directory.split('/').at(-1), reason: 'incomplete_or_unversioned' }); continue }
    const reasoningEffort = p.reasoningEffort ?? 'unrecorded', deviceRoute = p.deviceRoute ?? 'unrecorded'
    const probeSha256 = p.probeSha256 ?? 'unrecorded'
    const caseSet = [...new Set((result.qualityDiagnostics ?? []).map(row => `${row.scenario}/${row.turn}`))].sort()
    const key = JSON.stringify([p.promptCatalogSha256, p.toolCatalogSha256, p.renderedPromptSha256, p.judgeVersion, p.judgeCriteriaSha256, probeSha256, p.models, reasoningEffort, deviceRoute, caseSet])
    const group = groups.get(key) ?? { promptVariant: p.promptVariant, personaVariant: p.personaVariant ?? 'published', promptCatalogSha256: p.promptCatalogSha256, toolCatalogSha256: p.toolCatalogSha256,
      renderedPromptSha256: p.renderedPromptSha256, judgeVersion: p.judgeVersion, judgeCriteriaSha256: p.judgeCriteriaSha256,
      models: p.models, reasoningEffort, deviceRoute, probeSha256, caseSet, runs: 0, completedRuns: 0, judgedTurns: 0, toolTurns: 0,
      characterJudgedTurns: 0, characterFailures: 0, preambleStages: 0, preambleFailures: 0, scenarioTurns: {}, counts: { tool_preamble: 0, wrong_language: 0, invented_fact: 0, wrong_tool: 0 } }
    group.runs++; if (result.passed) group.completedRuns++
    for (const row of result.qualityDiagnostics ?? []) {
      group.judgedTurns++
      const stage = `${row.scenario}_${row.turn}`
      const runtime = result.results?.find(r => r.step === stage || r.step === row.turn)
      if (runtime?.calls?.length) group.toolTurns++
      for (const code of Object.keys(group.counts)) if (row.codes?.includes(code)) group.counts[code]++
    }
    // Application-measured timing; the judge's tool_preamble label stays separate.
    for (const timing of result.toolTimingEvidence ?? []) {
      if (!(timing.quickToolCalls > 0) || timing.unattributedQuickToolCalls > 0) continue
      group.preambleStages++
      if (timing.quickToolPreambles > 0) group.preambleFailures++
    }
    for (const verdict of result.quality ?? []) for (const turn of verdict.turns ?? []) {
      const row = group.scenarioTurns[verdict.scenarioId] ??= { turns: 0, failures: 0 }
      row.turns++; if (turn.passed !== true) row.failures++
      const character = turn.scores?.find(score => score.category === 'character')
      if (!character || !Number.isInteger(character.score) || character.score < 0 || character.score > 4) continue
      group.characterJudgedTurns++
      if (character.score < 3) group.characterFailures++
    }
    groups.set(key, group)
  }
  return { version: 6, interpretation: 'Descriptive failure proportions per judged turn (measured_tool_preamble: per attributed quick-tool stage), grouped by prompt, models, effort, device route, measurement probe and observed case set. quality_turn counts judged turns that missed a criterion or scored below 3; baseline compares it with the recorded v9 baseline for the same dialogue model and scenario mix. Character uses only explicitly scored turns; older unscored runs are unknown. Wilson intervals assume independent samples; turns within a conversation may be correlated. Unknown/unjudged turns are excluded; human acceptance is separate.',
    groups: [...groups.values()].map(({ counts, characterFailures, preambleStages, preambleFailures, ...group }) => ({ ...group, baseline: compareBaseline(group, baseline), rates: {
      quality_turn: wilson(Object.values(group.scenarioTurns).reduce((sum, row) => sum + row.failures, 0), Object.values(group.scenarioTurns).reduce((sum, row) => sum + row.turns, 0)),
      ...Object.fromEntries(Object.entries(counts).map(([code, failures]) => [code, wilson(failures, group.judgedTurns)])),
      character_drift: wilson(characterFailures, group.characterJudgedTurns),
      measured_tool_preamble: wilson(preambleFailures, preambleStages),
    } })), excluded }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length < 3) throw Error('usage: raven-quality-rates.mjs RUN_DIRECTORY...')
  process.stdout.write(JSON.stringify(await qualityRates(process.argv.slice(2)), null, 2) + '\n')
}

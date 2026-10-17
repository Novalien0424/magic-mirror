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

export async function qualityRates(directories) {
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
      characterJudgedTurns: 0, characterFailures: 0, preambleStages: 0, preambleFailures: 0, counts: { tool_preamble: 0, wrong_language: 0, invented_fact: 0, wrong_tool: 0 } }
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
      const character = turn.scores?.find(score => score.category === 'character')
      if (!character || !Number.isInteger(character.score) || character.score < 0 || character.score > 4) continue
      group.characterJudgedTurns++
      if (character.score < 3) group.characterFailures++
    }
    groups.set(key, group)
  }
  return { version: 5, interpretation: 'Descriptive failure proportions per judged turn (measured_tool_preamble: per attributed quick-tool stage), grouped by prompt, models, effort, device route, measurement probe and observed case set. Character uses only explicitly scored turns; older unscored runs are unknown. Wilson intervals assume independent samples; turns within a conversation may be correlated. Unknown/unjudged turns are excluded; human acceptance is separate.',
    groups: [...groups.values()].map(({ counts, characterFailures, preambleStages, preambleFailures, ...group }) => ({ ...group, rates: {
      ...Object.fromEntries(Object.entries(counts).map(([code, failures]) => [code, wilson(failures, group.judgedTurns)])),
      character_drift: wilson(characterFailures, group.characterJudgedTurns),
      measured_tool_preamble: wilson(preambleFailures, preambleStages),
    } })), excluded }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length < 3) throw Error('usage: raven-quality-rates.mjs RUN_DIRECTORY...')
  process.stdout.write(JSON.stringify(await qualityRates(process.argv.slice(2)), null, 2) + '\n')
}

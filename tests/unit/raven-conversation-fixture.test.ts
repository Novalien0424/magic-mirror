import { describe, expect, it } from 'vitest'
import {
  RAVEN_CONVERSATION_FIXTURE, RAVEN_CONVERSATION_SCENARIOS, RAVEN_QUALITY_JUDGE_CONTRACT,
  RAVEN_SYNTHETIC_MEDIA, parseRavenQualityVerdict, renderRavenVisitorText,
  type RavenScenarioId, type RavenQualityVerdict, type RavenFixtureTurn, type RavenSemanticCategory,
} from '../../src/main/raven-conversation-fixture'
import { createSpellTriggerGuard } from '../../src/main/scenes/spell-trigger'
import { REALTIME_TOOLS } from '../../src/shared/realtime-tools'

function scenario(id: RavenScenarioId) {
  return RAVEN_CONVERSATION_SCENARIOS.find(scenario => scenario.id === id)!
}
function fixtureTurn(id: RavenScenarioId, turnId: string): RavenFixtureTurn {
  return scenario(id).turns.find(turn => turn.id === turnId)!
}
function goodVerdict(id: RavenScenarioId) {
  return {
    version: RAVEN_QUALITY_JUDGE_CONTRACT.version, scenarioId: id, passed: true,
    turns: scenario(id).turns.map(turn => ({
      turnId: turn.id, passed: true,
      criteria: turn.expected.criteria.map(c => ({ category: c.category, passed: true })),
      scores: turn.expected.qualityDimensions.map(category => ({ category, score: 3 })),
    })),
  }
}
function recursivelyFrozen(value: unknown): boolean {
  return !value || typeof value !== 'object'
    || Object.isFrozen(value) && Object.values(value).every(recursivelyFrozen)
}

describe('bounded synthetic Raven fixture', () => {
  it('has immutable independent scenarios, unique turn/category codes and bounded catalog routes', () => {
    expect(recursivelyFrozen(RAVEN_CONVERSATION_FIXTURE)).toBe(true)
    expect(new Set(RAVEN_CONVERSATION_SCENARIOS.map(s => s.id)).size).toBe(RAVEN_CONVERSATION_SCENARIOS.length)
    expect(RAVEN_CONVERSATION_SCENARIOS.length).toBe(10)
    for (const s of RAVEN_CONVERSATION_SCENARIOS) {
      expect(s.turns.length).toBeGreaterThan(1)
      expect(s.turns.length).toBeLessThanOrEqual(12)
      expect(new Set(s.turns.map(t => t.id)).size).toBe(s.turns.length)
      for (const t of s.turns) {
        expect(new Set(t.expected.criteria.map(c => c.category)).size).toBe(t.expected.criteria.length)
        expect(new Set(t.expected.qualityDimensions).size).toBe(t.expected.qualityDimensions.length)
        expect(new Set(t.expected.runtimeChecks).size).toBe(t.expected.runtimeChecks.length)
        expect(t.expected.toolRoutes.length).toBeGreaterThan(0)
        for (const route of t.expected.toolRoutes) {
          expect(route.length).toBeLessThanOrEqual(RAVEN_CONVERSATION_FIXTURE.bounds.maxToolCallsPerTurn)
          for (const tool of route) expect(REALTIME_TOOLS.tools.some(spec => spec.name === tool.split('.')[0] && spec.enabled)).toBe(true)
        }
        for (const id of t.expected.localAssetIds) expect(RAVEN_SYNTHETIC_MEDIA.some(media => media.assetId === id)).toBe(true)
      }
    }
    expect(new Set(RAVEN_CONVERSATION_FIXTURE.runtimeRequirements.flatMap(r => r.invariants)))
      .toEqual(new Set(RAVEN_CONVERSATION_FIXTURE.invariantIds))
  })

  it('distinguishes discovery, ambiguity, actual start, once completion and loop handoff', () => {
    const ambiguous = fixtureTurn('local_media', 'ambiguous_rain').expected
    expect(ambiguous.toolRoutes.every(route => !route.includes('play_media') && !route.includes('search_youtube'))).toBe(true)
    expect(ambiguous.reply).toBe('clarification')
    const choice = fixtureTurn('local_media', 'choose_piano').expected
    expect(choice.localAssetIds).toHaveLength(1)
    expect(choice.mode).toBe('once')
    expect(choice.runtimeChecks).toEqual(expect.arrayContaining(['selection', 'playback_started', 'once_completed']))
    for (const s of RAVEN_CONVERSATION_SCENARIOS) {
      for (const t of s.turns.filter(t => t.expected.mode === 'loop')) {
        expect(t.expected.runtimeChecks).toEqual(expect.arrayContaining(['playback_started', 'loop_boundary', 'mic_release_before_acquire']))
        expect(t.expected.reply).toBe('silent')
        expect(t.expected.qualityDimensions).toEqual([])
      }
    }
    expect(fixtureTurn('local_loop', 'after_local_loop').before).toBe('operator_stop_loop')
  })

  it('keeps English/Chinese folder and sticky scope local, and requires ordered default fallback', () => {
    for (const turn of scenario('local_scope').turns) {
      expect(turn.expected.source).toBe('local_only')
      expect(turn.expected.toolRoutes.flat().some(tool => tool.includes('youtube'))).toBe(false)
    }
    const fallback = fixtureTurn('default_fallback', 'local_then_external').expected
    expect(scenario('default_fallback').turns[0]!.expected.source).toBe('local_only')
    expect(fallback.toolRoutes).toEqual([['find_media', 'search_youtube', 'play_youtube']])
    expect(fallback.criteria.some(c => c.category === 'local_first')).toBe(true)
    expect(fallback.runtimeChecks).toContain('selection')
    expect(fixtureTurn('youtube_modes', 'youtube_once').expected.toolRoutes.flat()).not.toContain('find_media')
  })

  it('requires separate delivered confirmation in both visits and locks denial/later unrelated yes', () => {
    const memory = scenario('two_visit_memory')
    expect(memory.setup).toBe('fresh_two_visits')
    expect(memory.turns.filter(t => t.before === 'identity_question_played')).toHaveLength(2)
    const returning = fixtureTurn('two_visit_memory', 'return_identify')
    expect(returning.visit).toBe(2)
    expect(returning.before).toBe('close_then_new_visit_after_learning')
    expect(returning.expected.runtimeChecks).toEqual(expect.arrayContaining(['private_memory_locked', 'clean_owner_session', 'question_played']))
    expect(fixtureTurn('two_visit_memory', 'ordinary_remember_word').expected.toolRoutes).toEqual([[]])
    const explicitSave = fixtureTurn('two_visit_memory', 'explicit_remember')
    expect(explicitSave.before).toBe('learning_settled')
    expect(explicitSave.expected.runtimeChecks).toContain('memory_saved')
    expect(fixtureTurn('two_visit_memory', 'recall_preference').visit).toBe(2)
    for (const t of scenario('identity_denial').turns) {
      expect(t.expected.toolRoutes).toEqual([[]])
      expect(t.expected.runtimeChecks).toContain('private_memory_locked')
    }
  })

  it('binds synthetic spell controls without authorizing quoted/extended matches or duplicate effects', () => {
    const binding = { approvedSpell: '施放咒語，試驗星光', sleepPhrase: '休息吧' }
    const guard = createSpellTriggerGuard([{ spellId: 'qa-approved', phrase: binding.approvedSpell }])
    for (const id of ['quoted_spell', 'extended_spell']) {
      const t = fixtureTurn('sleep_spells', id)
      const result = guard.evaluate({ status: 'final', turnId: id, transcript: renderRavenVisitorText(t, binding) })
      expect(result.decision).toBe('ignore')
      expect(t.expected.runtimeChecks).toContain('no_scene_trigger')
      expect(t.expected.toolRoutes).toEqual([[]])
    }
    const t = fixtureTurn('sleep_spells', 'exact_spell')
    const attempt = { status: 'final' as const, turnId: t.id, transcript: renderRavenVisitorText(t, binding) }
    expect(guard.evaluate(attempt).decision).toBe('trigger')
    expect(guard.evaluate(attempt)).toMatchObject({ decision: 'ignore', reason: 'duplicate_turn' })
    expect(t.expected.runtimeChecks).toEqual(expect.arrayContaining(['approved_exact_scene', 'scene_once', 'scene_without_announcement_gate']))
    expect(fixtureTurn('sleep_spells', 'directed_sleep').expected.runtimeChecks)
      .toEqual(expect.arrayContaining(['farewell_tail_before_close', 'mic_release_before_acquire']))
  })

  it('requires explicit bindings and emits only a fixed failure code for unusable values', () => {
    const t = fixtureTurn('default_fallback', 'local_then_external')
    for (const binding of [{}, { youtubeQuery: '' }, { youtubeQuery: 'private\nvalue' }, { youtubeQuery: 'x'.repeat(201) }]) {
      expect(() => renderRavenVisitorText(t, binding)).toThrow('raven_fixture_binding_invalid')
    }
    const text = renderRavenVisitorText(t, { youtubeQuery: 'Synthetic Public Video' })
    expect(text).toContain('Synthetic Public Video')
    expect(text).not.toContain('{{youtubeQuery}}')
    expect(t.visitorText).toContain('{{youtubeQuery}}')
  })
})

describe('metadata-only quality verdict boundary', () => {
  it('accepts complete verdicts for every manifest and returns an immutable independent copy', () => {
    for (const s of RAVEN_CONVERSATION_SCENARIOS) {
      const input = goodVerdict(s.id)
      const parsed = parseRavenQualityVerdict(input, s.id)
      expect(parsed?.passed).toBe(true)
      expect(recursivelyFrozen(parsed)).toBe(true)
      input.turns[0].criteria[0].passed = false
      expect(parsed?.turns[0].criteria[0].passed).toBe(true)
    }
  })

  it('canonicalizes complete unordered output without permitting duplicate or foreign codes', () => {
    const input = goodVerdict('empathy_context')
    input.turns.reverse()
    input.turns.forEach(t => { t.criteria.reverse(); t.scores.reverse() })
    const parsed = parseRavenQualityVerdict(input, 'empathy_context')
    expect(parsed?.turns.map(t => t.turnId)).toEqual(scenario('empathy_context').turns.map(t => t.id))
  })

  it('rejects invalid, partial and content-bearing output at every level', () => {
    const mutate: readonly ((value: Record<string, any>) => void)[] = [
      v => { delete v.version }, v => { v.version = 'other' }, v => { v.scenarioId = 'local_media' },
      v => { v.passed = 'true' }, v => { v.commentary = 'private response text' }, v => { v.turns = [] },
      v => { v.turns.pop() }, v => { v.turns.push(structuredClone(v.turns[0])) },
      v => { v.turns[1].turnId = v.turns[0].turnId }, v => { v.turns[0].turnId = 'arbitrary private text' },
      v => { v.turns[0].transcript = 'private reply' }, v => { v.turns[0].passed = 1 },
      v => { delete v.turns[0].scores }, v => { v.turns[0].criteria.pop() },
      v => { v.turns[0].criteria.push({ category: 'grounding', passed: true }) },
      v => { v.turns[0].criteria[1] = { ...v.turns[0].criteria[0] } },
      v => { v.turns[0].criteria[0].category = 'free text' }, v => { v.turns[0].criteria[0].passed = 'false' },
      v => { v.turns[0].criteria[0].reason = 'private rationale' }, v => { v.turns[0].scores.pop() },
      v => { v.turns[0].scores[1] = { ...v.turns[0].scores[0] } },
      v => { v.turns[0].scores[0].category = 'word_count' }, v => { v.turns[0].scores[0].score = '4' },
      v => { v.turns[0].scores[0].score = -1 }, v => { v.turns[0].scores[0].score = 5 },
      v => { v.turns[0].scores[0].score = 3.5 }, v => { v.turns[0].scores[0].score = NaN },
      v => { v.turns[0].scores[0].score = Infinity }, v => { v.turns[0].scores[0].quote = 'private text' },
    ]
    for (const change of mutate) {
      const value = goodVerdict('empathy_context')
      change(value)
      expect(parseRavenQualityVerdict(value, 'empathy_context')).toBeNull()
    }
    for (const value of [null, [], true, 3, '{}', '```json\n{}\n```', new Date()]) {
      expect(parseRavenQualityVerdict(value, 'empathy_context')).toBeNull()
    }
    const inherited = Object.assign(Object.create({ commentary: 'hidden content' }), goodVerdict('empathy_context'))
    expect(parseRavenQualityVerdict(inherited, 'empathy_context')).toBeNull()
    const extra = goodVerdict('empathy_context')
    Object.defineProperty(extra, 'privateText', { value: 'hidden', enumerable: false })
    expect(parseRavenQualityVerdict(extra, 'empathy_context')).toBeNull()
    const accessor = goodVerdict('empathy_context')
    Object.defineProperty(accessor, 'passed', { get() { throw new Error('do not inspect content') }, enumerable: true })
    expect(parseRavenQualityVerdict(accessor, 'empathy_context')).toBeNull()
  })

  it.each([
    ['two_visit_memory', 'recall_commitment', 'memory_accuracy'], // Old/current date mixture or missing recipient/quantity.
    ['two_visit_memory', 'commitment_correction', 'completion_truth'], // Planned samples falsely described as delivered.
    ['local_media', 'alias_video', 'tool_silence'], // Correct tool route but "let me find/play" narration.
    ['local_media', 'ambiguous_rain', 'ambiguity'], // Arbitrary choice despite multiple plausible matches.
    ['local_scope', 'vault_miss', 'local_scope'], // External lookup despite a local-only request.
    ['default_fallback', 'local_then_external', 'local_first'], // Same creator, wrong title accepted as a suitable match.
    ['identity_denial', 'unrelated_yes', 'consent_boundary'], // An unrelated yes treated as consent.
    ['sleep_spells', 'quoted_spell', 'spell_boundary'], // Substring/quoted phrase treated as authorization.
  ] as const)('retains a failing %s/%s result and rejects a forged pass', (id, turnId, category: RavenSemanticCategory) => {
    const input = goodVerdict(id)
    const turn = input.turns.find(t => t.turnId === turnId)!
    turn.scores.forEach(score => { score.score = 4 })
    turn.criteria.find(c => c.category === category)!.passed = false
    // High scores must never cancel a failed semantic requirement.
    expect(parseRavenQualityVerdict(input, id)).toBeNull()
    turn.passed = false
    expect(parseRavenQualityVerdict(input, id)).toBeNull()
    input.passed = false
    const parsed: RavenQualityVerdict | null = parseRavenQualityVerdict(input, id)
    expect(parsed?.passed).toBe(false)
    expect(parsed?.turns.find(t => t.turnId === turnId)?.criteria.find(c => c.category === category)?.passed).toBe(false)
  })

  it('fails superficial concision when relevance, completeness or empathy is inadequate', () => {
    for (const category of ['relevance', 'completeness', 'empathy']) {
      const input = goodVerdict('empathy_context')
      const turn = input.turns[0]
      turn.scores.find(s => s.category === category)!.score = 2
      expect(parseRavenQualityVerdict(input, 'empathy_context')).toBeNull()
      turn.passed = false; input.passed = false
      expect(parseRavenQualityVerdict(input, 'empathy_context')?.passed).toBe(false)
    }
  })

  it('rejects missing baseline checks even for silent tools and application-owned replies', () => {
    for (const id of ['local_loop', 'sleep_spells', 'two_visit_memory'] as const) {
      const input = goodVerdict(id)
      const turn = input.turns.find(t => t.scores.length === 0)!
      turn.criteria.splice(0, 1)
      expect(parseRavenQualityVerdict(input, id)).toBeNull()
    }
  })
})

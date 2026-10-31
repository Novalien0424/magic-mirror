import { describe, expect, it } from 'vitest'
import {
  RAVEN_CONVERSATION_FIXTURE, RAVEN_CONVERSATION_SCENARIOS, RAVEN_QUALITY_JUDGE_CONTRACT,
  RAVEN_SYNTHETIC_MEDIA, RAVEN_SYNTHETIC_VISITORS, RAVEN_MEMORY_IDENTITY_REPAIR,
  RavenMemoryQaIdentity, ravenMemoryQaComparisons, parseRavenQualityVerdict, parseRavenQualityAssessment, renderRavenVisitorText,
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
    expect(RAVEN_CONVERSATION_SCENARIOS.length).toBe(12)
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

  it('requires a separate character score while exempting exact application cues and silence', () => {
    for (const s of RAVEN_CONVERSATION_SCENARIOS) for (const t of s.turns) {
      expect(t.expected.qualityDimensions.includes('character')).toBe(t.expected.qualityDimensions.length > 0)
    }
    const passed = goodVerdict('character_consistency')
    expect(parseRavenQualityVerdict(passed, 'character_consistency')?.passed).toBe(true)
    const failed = structuredClone(passed)
    failed.turns[1]!.scores.find(score => score.category === 'character')!.score = 1
    // Correct helpfulness/facts cannot conceal a failed character score.
    expect(parseRavenQualityVerdict(failed, 'character_consistency')).toBeNull()
    failed.turns[1]!.passed = false; failed.passed = false
    expect(parseRavenQualityVerdict(failed, 'character_consistency')?.passed).toBe(false)
    const missing = structuredClone(passed)
    missing.turns[0]!.scores = missing.turns[0]!.scores.filter(score => score.category !== 'character')
    expect(parseRavenQualityVerdict(missing, 'character_consistency')).toBeNull()
  })

  it('keeps folder, sticky and phrase-less requests local, and goes online only after the opening phrase', () => {
    for (const turn of scenario('local_scope').turns) {
      expect(turn.expected.source).toBe('local_only')
      expect(turn.expected.toolRoutes.flat().some(tool => tool.includes('youtube'))).toBe(false)
    }
    for (const [id, turnId] of [['default_fallback', 'prior_local_request'], ['default_fallback', 'local_then_external'], ['youtube_modes', 'youtube_without_phrase']] as const) {
      const turn = fixtureTurn(id, turnId)
      expect(turn.visitorText).not.toContain('{{cloudSearchPhrase}}')
      expect(turn.expected.source).toBe('local_only')
      expect(turn.expected.toolRoutes.flat().some(tool => tool.includes('youtube'))).toBe(false)
    }
    for (const [id, turnId] of [['default_fallback', 'cloud_external'], ['default_fallback', 'chinese_fallback'], ['youtube_modes', 'youtube_once'], ['youtube_modes', 'youtube_loop']] as const) {
      const turn = fixtureTurn(id, turnId)
      expect(turn.visitorText.startsWith('{{cloudSearchPhrase}}')).toBe(true)
      expect(turn.expected.toolRoutes.every(route => route.at(-1) === 'play_youtube')).toBe(true)
      expect(turn.expected.runtimeChecks).toContain('selection')
    }
    expect(fixtureTurn('default_fallback', 'cloud_external').expected.criteria.some(c => c.category === 'local_first')).toBe(true)
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

  it('bounds explicit identity repair to denial and a new spelled introduction without a bundled yes', () => {
    const repair = RAVEN_MEMORY_IDENTITY_REPAIR
    expect(recursivelyFrozen(repair)).toBe(true)
    expect(repair.attemptsPerVisit).toBe(1)
    expect(repair.denial.before).toBe('identity_question_played')
    expect(repair.denial.expected.toolRoutes).toEqual([[]])
    expect(repair.denial.visitorText.startsWith('No,')).toBe(true)
    expect(repair.spelling.visitorText.startsWith('My name is ' + RAVEN_SYNTHETIC_VISITORS.mira.name)).toBe(true)
    expect(repair.spelling.visitorText.includes('M, I, R, A')).toBe(true)
    expect(repair.spelling.visitorText.includes('V, A, L, E')).toBe(true)
    expect(/\b(?:yes|that is me|that's me)\b/iu.test(repair.spelling.visitorText)).toBe(false)
    expect(repair.spelling.expected.toolRoutes).toEqual([['memory.identify']])
    expect(repair.spelling.expected.runtimeChecks).toEqual(expect.arrayContaining(['question_played', 'private_memory_locked']))
    expect(scenario('two_visit_memory').turns.filter(t => t.before === 'identity_question_played').map(t => t.id))
      .toEqual(['first_confirm', 'return_confirm'])
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

  it('grades replies against the selected reply language, which only an explicit request changes', () => {
    expect(RAVEN_QUALITY_JUDGE_CONTRACT.version).toBe('raven-quality.v9')
    expect(RAVEN_CONVERSATION_FIXTURE.version).toBe('raven-conversation.v2')
    expect(RAVEN_QUALITY_JUDGE_CONTRACT.dimensions.relevance).toContain('in the selected reply language')
    const rule = RAVEN_QUALITY_JUDGE_CONTRACT.instructions.find(line => line.startsWith('Reply language:'))!
    expect(rule).toContain('Traditional Chinese reply to it is correct')
    expect(rule).toContain('unrequested switch to English')
    const title = fixtureTurn('character_consistency', 'english_with_title')
    expect(title.language).toBe('en')
    expect(title.expected.criteria.map(c => c.expectation).join(' ')).not.toContain('Answer in English')
    expect(title.expected.criteria.find(c => c.category === 'command_intent')!.expectation).toContain('selected reply language')
    // The explicit Chinese request may select Chinese again; it is never an unknown route.
    expect(fixtureTurn('character_consistency', 'return_to_chinese').expected.toolRoutes).toEqual([['set_reply_language'], []])
    // No turn presupposes context the visitor never supplied.
    expect(fixtureTurn('sleep_spells', 'after_spell').visitorText).toBe('我們繼續聊吧。我下週六有個社區展覽，如果只有十分鐘，我能先準備什麼？')
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

describe('RAM-only two-visit QA identity assertions', () => {
  const intended = RAVEN_SYNTHETIC_VISITORS.mira.name
  // Production strips confirmation tokens from this model-visible result.
  const proposal = (name: unknown = intended) => ({
    status: 'accepted', code: 'memory_confirmation_required', name,
  })

  it('rejects an unintended first proposal before confirmation or adoption as the recall scope', () => {
    const identity = new RavenMemoryQaIdentity()
    expect(() => identity.propose(1, proposal('Unintended Fixture'), 'question-1')).toThrow('raven_qa_first_identity_mismatch')
    expect(identity.confirmedName).toBeUndefined()
    expect(() => identity.requireConfirmation(1)).toThrow('raven_qa_question_not_delivered')
    expect(() => identity.confirmed(1)).toThrow('raven_qa_question_not_delivered')
    expect(identity.expectedName(1) === intended).toBe(true)
    expect(() => identity.expectedName(2)).toThrow('raven_qa_first_identity_unconfirmed')
  })

  it('requires delivery and a separate confirmation before retaining the first label', () => {
    const identity = new RavenMemoryQaIdentity()
    const label = ' ' + intended.toUpperCase() + ' '
    identity.propose(1, proposal(label), 'question-1')
    expect(identity.confirmedName).toBeUndefined()
    expect(() => identity.confirmed(1)).toThrow('raven_qa_question_not_delivered')
    identity.delivered(1)
    expect(() => identity.requireConfirmation(2)).toThrow('raven_qa_question_not_delivered')
    identity.confirmed(1)
    expect(identity.confirmedName === label).toBe(true)
    expect(identity.expectedName(2) === label).toBe(true)
    expect(() => identity.requireConfirmation(1)).toThrow('raven_qa_question_not_delivered')
  })

  it('requires a new question token after the one permitted first-visit correction', () => {
    const identity = new RavenMemoryQaIdentity()
    expect(() => identity.propose(1, proposal('Unintended Fixture'), 'question-1')).toThrow('raven_qa_first_identity_mismatch')
    identity.beginRecovery(1)
    expect(() => identity.propose(1, proposal(intended), 'question-1')).toThrow('raven_qa_identity_question_not_fresh')
    expect(() => identity.requireConfirmation(1)).toThrow('raven_qa_question_not_delivered')
    expect(() => identity.beginRecovery(1)).toThrow('raven_qa_identity_recovery_exhausted')
  })

  it('continues through separate confirmation and a return proposal after a valid correction', () => {
    const identity = new RavenMemoryQaIdentity()
    expect(() => identity.propose(1, proposal('Unintended Fixture'), 'question-1')).toThrow('raven_qa_first_identity_mismatch')
    identity.beginRecovery(1)
    identity.propose(1, proposal(intended), 'question-2')
    expect(() => identity.requireConfirmation(1)).toThrow('raven_qa_question_not_delivered')
    identity.delivered(1)
    identity.confirmed(1)
    identity.propose(2, proposal(intended), 'question-3')
    identity.delivered(2)
    identity.confirmed(2)
    expect(identity.confirmedName === intended).toBe(true)
  })

  it('rejects a different return label and permits only one fresh-question correction on that visit', () => {
    const identity = new RavenMemoryQaIdentity()
    identity.propose(1, proposal(), 'question-1'); identity.delivered(1); identity.confirmed(1)
    expect(() => identity.propose(2, proposal('Unintended Fixture'), 'question-2')).toThrow('raven_qa_return_identity_mismatch')
    identity.beginRecovery(2)
    identity.propose(2, proposal(intended), 'question-3')
    identity.delivered(2); identity.confirmed(2)
    expect(identity.confirmedName === intended).toBe(true)
    expect(() => identity.beginRecovery(2)).toThrow('raven_qa_identity_recovery_exhausted')
  })

  it('fails closed when a corrected proposal still differs instead of rerolling or confirming it', () => {
    const identity = new RavenMemoryQaIdentity()
    expect(() => identity.propose(1, proposal('Unintended Fixture'), 'question-1')).toThrow('raven_qa_first_identity_mismatch')
    identity.beginRecovery(1)
    expect(() => identity.propose(1, proposal('Another Fixture'), 'question-2')).toThrow('raven_qa_first_identity_mismatch')
    expect(() => identity.beginRecovery(1)).toThrow('raven_qa_identity_recovery_exhausted')
    expect(() => identity.requireConfirmation(1)).toThrow('raven_qa_question_not_delivered')
    expect(identity.confirmedName).toBeUndefined()
  })

  it.each([undefined, '', 'x'.repeat(81), '\u0000fixture'])('does not authorize a missing or invalid proposal', name => {
    const identity = new RavenMemoryQaIdentity()
    const raw = proposal(); raw.name = name
    expect(() => identity.propose(1, raw, 'question-1')).toThrow('raven_qa_identity_name_missing')
    expect(() => identity.requireConfirmation(1)).toThrow('raven_qa_question_not_delivered')
    expect(() => identity.beginRecovery(1)).toThrow('raven_qa_identity_recovery_exhausted')
  })

  it('rejects incomplete/failed proposals and spaced letter guesses without fuzzy authorization', () => {
    const identity = new RavenMemoryQaIdentity()
    expect(() => identity.propose(1, { ...proposal(), status: 'failed' }, 'question-1')).toThrow('raven_qa_identity_proposal_missing')
    expect(() => identity.propose(1, proposal(), undefined)).toThrow('raven_qa_identity_proposal_missing')
    expect(() => identity.propose(1, proposal('M I R A V A L E'), 'question-1')).toThrow('raven_qa_first_identity_mismatch')
    expect(identity.confirmedName).toBeUndefined()
  })

  it('emits only comparison and length categories for script, ASR, proposal and extraction', () => {
    const script = fixtureTurn('two_visit_memory', 'first_identify').visitorText
    const metadata = ravenMemoryQaComparisons({ script, asr: script.toUpperCase(), expected: intended,
      proposed: intended, tool: 'Unintended Fixture', reasons: [
        'memory_identity_evidence_tool_different_asr_literal_length_9',
        'memory_identity_evidence_tool_equal_asr_absent_length_80',
        'memory_identity_evidence_tool_equal_asr_literal_length_99',
        'memory_identity_evidence_tool_private_asr_literal_length_9', script,
      ] })
    expect(metadata).toEqual({ scriptAsr: 'equal', expectedProposal: 'equal', toolProposal: 'different',
      lengths: { script: '21_80', asr: '21_80', expected: '1_20', proposed: '1_20', tool: '1_20' },
      extraction: [{ tool: 'different', asr: 'literal', length: '1_20' }, { tool: 'equal', asr: 'absent', length: '21_80' }] })
    const encoded = JSON.stringify(metadata)
    for (const value of [script, intended, 'Unintended Fixture', 'length_9', 'length_80']) expect(encoded.includes(value)).toBe(false)
  })

  it('categorizes absent/long evidence without content and bounds duplicate extraction metadata', () => {
    const metadata = ravenMemoryQaComparisons({ script: '', asr: 'x'.repeat(4001), expected: intended, reasons:
      Array.from({ length: 10 }, () => 'memory_identity_evidence_tool_absent_asr_formatted_length_0') })
    expect(metadata.scriptAsr).toBe('different')
    expect(metadata.expectedProposal).toBe('absent')
    expect(metadata.toolProposal).toBe('absent')
    expect(metadata.lengths).toEqual({ script: 'empty', asr: 'over_4000', expected: '1_20', proposed: 'empty', tool: 'empty' })
    expect(metadata.extraction).toHaveLength(4)
  })
})

describe('metadata-only quality verdict boundary', () => {
  it('derives pass/fail from complete provider assessments without accepting missing, duplicate or extra evidence', () => {
    for (const scenario of RAVEN_CONVERSATION_SCENARIOS) {
      const { passed: _overall, turns, ...header } = goodVerdict(scenario.id)
      expect(parseRavenQualityAssessment({ ...header, turns: turns.map(({ passed: _turn, ...grade }) => grade) }, scenario.id)?.passed).toBe(true)
    }
    const { passed: _passed, ...good } = goodVerdict('character_consistency')
    const assessment = { ...good, turns: good.turns.map(({ passed: _turnPassed, ...turn }) => turn) }
    expect(parseRavenQualityAssessment(assessment, 'character_consistency')?.passed).toBe(true)
    const low = structuredClone(assessment)
    low.turns[0]!.scores.find(s => s.category === 'character')!.score = 2
    const failed = parseRavenQualityAssessment(low, 'character_consistency')
    expect(failed?.passed).toBe(false)
    expect(failed?.turns[0]?.passed).toBe(false)
    const criterionFailure = structuredClone(assessment); criterionFailure.turns[0]!.criteria[0]!.passed = false
    expect(parseRavenQualityAssessment(criterionFailure, 'character_consistency')?.passed).toBe(false)
    for (const score of [NaN, Infinity, -1, 5, 3.5]) {
      const invalidScore = structuredClone(assessment); invalidScore.turns[0]!.scores[0]!.score = score
      expect(parseRavenQualityAssessment(invalidScore, 'character_consistency')).toBeNull()
    }
    const missing = structuredClone(assessment); missing.turns[0]!.scores.pop()
    expect(parseRavenQualityAssessment(missing, 'character_consistency')).toBeNull()
    const duplicate = structuredClone(assessment); duplicate.turns[1] = duplicate.turns[0]!
    expect(parseRavenQualityAssessment(duplicate, 'character_consistency')).toBeNull()
    expect(parseRavenQualityAssessment({ ...assessment, commentary: 'synthetic private text' }, 'character_consistency')).toBeNull()
    expect(parseRavenQualityAssessment({ ...assessment, passed: true }, 'character_consistency')).toBeNull()
  })
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
    ['default_fallback', 'cloud_external', 'local_first'], // Same creator, wrong title accepted as a suitable match.
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

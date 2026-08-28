import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { App, CONSOLE_UI_CONTRACT, PhaseTestsPanel } from '../../src/renderer/console/App'
import type { ConsoleBridge } from '../../src/shared/bridge'
import type {
  ConsoleEventsQuery,
  ConsoleOverviewPayload,
  ConsolePhaseTestsPayload,
  PhaseTestRecord,
} from '../../src/shared/console-types'

const EXPECTED_TABS = [
  'Overview',
  'Avatar / Audio',
  'Simulator',
  'Events',
  'Phase Tests',
  'Config',
  'Models',
] as const

const EXPECTED_EVENT_COLUMNS = [
  'time',
  'module',
  'event',
  'status',
  'duration',
  'error code',
  'session',
  'reason',
  'source',
] as const

const EXISTING_SIMULATOR_COMMANDS = [
  'wake',
  'cloud_failure',
  'cloud_recovery',
  'camera_result',
  'avatar_state',
  'scene_result',
  'sqlite_failure',
  'sleep',
] as const

const PRIVACY_SENTINELS = [
  '__TEST_TRANSCRIPT_SENTINEL__',
  '__TEST_AUDIO_SENTINEL__',
  '__TEST_PRIVATE_MEMORY_SENTINEL__',
  '__TEST_CREDENTIAL_SENTINEL__',
  '__TEST_IMAGE_SENTINEL__',
  '__TEST_EMBEDDING_SENTINEL__',
  '__TEST_CONFIGURED_VALUE_SENTINEL__',
] as const

const BOUNDED_OVERVIEW_FIELDS = [
  'lifecycle',
  'identityStatus',
  'developerMode',
  'modules',
  'audioTcc',
  'cameraTcc',
] as const satisfies readonly (keyof ConsoleOverviewPayload)[]

const EVENT_QUERY_FIELDS = [
  'beforeSequence',
  'module',
  'status',
  'source',
] as const satisfies readonly (keyof ConsoleEventsQuery)[]

type ConsoleUiBridge = Pick<
  ConsoleBridge,
  | 'getOverview'
  | 'getEvents'
  | 'simulate'
  | 'startConversation'
  | 'interrupt'
  | 'disconnect'
  | 'getPhaseTests'
>

const PHASE_RECORD_KEYS = ['phase', 'demoId', 'build', 'time', 'result', 'note'] as const
const CANONICAL_PHASE_0_TIME = '2026-08-22T00:00:00.000Z'
const CANONICAL_PHASE_1_TIME = '2026-08-23T00:00:00.000Z'
const CANONICAL_PHASE_3_TIME = '2026-08-28T00:00:00.000Z'

const P3_D1_NOT_EXECUTED = {
  phase: '3', demoId: 'P3-D1', build: 'phase3-build-canonical',
  time: CANONICAL_PHASE_3_TIME, result: 'not_executed', note: 'live_evidence_not_executed',
} as const satisfies PhaseTestRecord

const P1_D1_NOT_EXECUTED = {
  phase: '1',
  demoId: 'P1-D1',
  build: 'phase1-build-canonical',
  time: CANONICAL_PHASE_1_TIME,
  result: 'not_executed',
  note: 'live_evidence_not_executed',
} as const satisfies PhaseTestRecord

const P1_D1_MOCK_PASSED = {
  phase: '1',
  demoId: 'P1-D1',
  build: 'phase1-build-canonical',
  time: CANONICAL_PHASE_1_TIME,
  result: 'mock_passed',
  note: 'mock_evidence_only',
} as const satisfies PhaseTestRecord

const P0_D1_PASSED = {
  phase: '0',
  demoId: 'P0-D1',
  build: 'phase0-build-canonical',
  time: CANONICAL_PHASE_0_TIME,
  result: 'passed',
  note: 'real_evidence',
} as const satisfies PhaseTestRecord

const P0_D2_FAILED = {
  phase: '0',
  demoId: 'P0-D2',
  build: 'phase0-build-canonical',
  time: CANONICAL_PHASE_0_TIME,
  result: 'failed',
  note: 'real_evidence_failed',
} as const satisfies PhaseTestRecord

/*
 * The server renderer used by this focused test does not run useEffect, and
 * this repository has no client renderer/test-DOM dependency. Keep the
 * fallback source contract narrow: it guards only the typed bridge calls and
 * the response/data tokens that must be rendered by the effect-driven UI.
 */
const CONSOLE_APP_SOURCE = readFileSync(
  new URL('../../src/renderer/console/App.tsx', import.meta.url),
  'utf8',
)

function bridgeCallSource(method: keyof ConsoleUiBridge): string {
  const methodPattern = new RegExp(
    `(?:\\bbridge|\\bmagicMirror|window\\.magicMirror)[^;\\n]{0,80}\\.${method}\\s*\\(`,
  )
  const match = methodPattern.exec(CONSOLE_APP_SOURCE)
  expect(match, `Console renderer must call the Main-owned ${method} bridge method`).not.toBeNull()

  if (match === null) {
    return ''
  }

  return CONSOLE_APP_SOURCE.slice(
    Math.max(0, match.index - 5000),
    Math.min(CONSOLE_APP_SOURCE.length, match.index + 5000),
  )
}

function bridgeCallArguments(method: keyof ConsoleUiBridge): string {
  const methodPattern = new RegExp(
    `(?:\\bbridge|\\bmagicMirror|window\\.magicMirror)[^;\\n]{0,80}\\.${method}\\s*\\(([\\s\\S]{0,600}?)\\)`,
  )
  return methodPattern.exec(CONSOLE_APP_SOURCE)?.[1] ?? ''
}

function renderConsole(): string {
  return renderToStaticMarkup(createElement(App))
}

function phaseTestsPanelSource(): string {
  const start = CONSOLE_APP_SOURCE.indexOf('export function PhaseTestsPanel')
  const end = CONSOLE_APP_SOURCE.indexOf('\nfunction safeDraftFromConfig', start)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return CONSOLE_APP_SOURCE.slice(start, end)
}

function phaseTestsRequestSource(): string {
  const start = CONSOLE_APP_SOURCE.indexOf('const requestPhaseTests =')
  const end = CONSOLE_APP_SOURCE.indexOf('\n  const requestConfig', start)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return CONSOLE_APP_SOURCE.slice(start, end)
}

function phaseSelectorSource(): string {
  const selectBlocks = [...CONSOLE_APP_SOURCE.matchAll(/<select\b[\s\S]*?<\/select>/g)]
  const phaseSelector = selectBlocks.find((match) => /Phase 1/.test(match[0]) && /Phase 0/.test(match[0]))
  expect(phaseSelector, 'Phase Tests must expose a selector for both phases').toBeDefined()
  return phaseSelector?.[0] ?? ''
}

function phaseTestsPayload(record: PhaseTestRecord): ConsolePhaseTestsPayload {
  expect(Object.keys(record)).toEqual(PHASE_RECORD_KEYS)
  return {
    phase: record.phase,
    source: 'reader',
    latest: record,
    records: [record],
  }
}

function renderPhaseRecord(record: PhaseTestRecord): string {
  return renderToStaticMarkup(createElement(PhaseTestsPanel, {
    state: { status: 'success', value: phaseTestsPayload(record) },
  }))
}

function resultMarkup(html: string, label: string): string {
  const index = html.indexOf(label)
  expect(index, `Phase Tests must render result label ${label}`).toBeGreaterThanOrEqual(0)
  return html.slice(Math.max(0, index - 180), Math.min(html.length, index + label.length + 180))
}

function classTokens(markup: string): string[] {
  return [...markup.matchAll(/class="([^"]*)"/g)]
    .flatMap((match) => (match[1] ?? '').split(/\s+/).filter(Boolean))
}

describe('Phase 0 Task 9 Gate 9A.1 Console UI RED contract', () => {
  it('shows the configured wake package, mic owner, and idle timer in one bounded card', () => {
    expect(CONSOLE_APP_SOURCE).toMatch(/Wake lifecycle/)
    expect(CONSOLE_APP_SOURCE).toMatch(/wake\.phrase/)
    expect(CONSOLE_APP_SOURCE).toMatch(/wake\.packageId/)
    expect(CONSOLE_APP_SOURCE).toMatch(/wake\.modelVersion/)
    expect(CONSOLE_APP_SOURCE).toMatch(/mic owner/)
    expect(CONSOLE_APP_SOURCE).toMatch(/idle timer/)
  })

  it('renders exactly the six Console tabs and exposes the phase-exit Phase Tests ownership sentence', () => {
    const html = renderConsole()

    expect(CONSOLE_UI_CONTRACT.tabs).toEqual(EXPECTED_TABS)
    for (const tab of EXPECTED_TABS) {
      expect(html).toContain(tab)
    }
    expect(CONSOLE_UI_CONTRACT).not.toHaveProperty('placeholders')
    expect(html).toContain('Phase exit owns demo execution and record production.')
    expect(html).not.toContain('Task 10 owns demo execution and record production.')
    expect(html).not.toMatch(/Not implemented|reserved for later/i)
  })

  it('keeps the established Models panel present in the initial Console render', () => {
    const html = renderConsole()

    expect(html).toContain('aria-labelledby="console-models"')
  })

  it('shows mock simulator readiness and explicit unverified TCC copy on Overview', () => {
    const html = renderConsole()

    expect(CONSOLE_UI_CONTRACT.overview.readinessLabel).toBe('Mock / simulator')
    expect(CONSOLE_UI_CONTRACT.overview.tccLabel).toBe('TCC: not_checked')
    expect(html).toContain('Mock / simulator')
    expect(html).toContain('TCC: not_checked')
  })

  it('shows a visible Developer Mode disabled explanation without adding a simulator command', () => {
    const html = renderConsole()

    expect(CONSOLE_UI_CONTRACT.simulator.disabledCopy).toMatch(/Developer Mode.*disabled/i)
    expect(CONSOLE_UI_CONTRACT.simulator.commands).toEqual(EXISTING_SIMULATOR_COMMANDS)
    expect(CONSOLE_UI_CONTRACT.simulator.commands).not.toContain('realtime_ready')
    expect(html).toMatch(/Developer Mode.*disabled/i)
    expect(html).not.toContain('realtime_ready')
  })

  it('limits Events to metadata columns and exposes filters plus pagination', () => {
    const html = renderConsole()

    expect(CONSOLE_UI_CONTRACT.events.columns).toEqual(EXPECTED_EVENT_COLUMNS)
    expect(CONSOLE_UI_CONTRACT.events.filters).toEqual(expect.arrayContaining([
      'module',
      'status',
      'source',
    ]))
    expect(CONSOLE_UI_CONTRACT.events.pagination).toEqual(expect.arrayContaining([
      'beforeSequence',
      'nextBeforeSequence',
    ]))
    expect(html).not.toMatch(/\btranscripts?\b|\bprivate\s+memory\b|\bcredentials?\b|\bembeddings?\b|\bconfigured\s+values?\b/i)
    for (const sentinel of PRIVACY_SENTINELS) {
      expect(html).not.toContain(sentinel)
    }
  })

  it('retrieves Overview through the typed Main bridge and renders bounded response states', () => {
    const html = renderConsole()
    const source = bridgeCallSource('getOverview')

    expect(CONSOLE_APP_SOURCE).toMatch(/useEffect/)
    expect(source).toMatch(/(?:\.ok\b|error|reason|unavailable|failed)/i)
    for (const field of BOUNDED_OVERVIEW_FIELDS) {
      expect(source).toContain(field)
    }
    expect(html).toContain('Mock / simulator')
    expect(html).toContain('TCC: not_checked')
  })

  it('retrieves initial and older filtered Events pages through the typed Main bridge', () => {
    const html = renderConsole()
    const source = bridgeCallSource('getEvents')
    const argumentsSource = bridgeCallArguments('getEvents')

    expect(CONSOLE_APP_SOURCE).toMatch(/useEffect/)
    expect(source).toMatch(/(?:\.ok\b|error|reason|unavailable|failed)/i)
    expect(argumentsSource).toMatch(/(?:query|filter|beforeSequence|module|status|source)/i)
    for (const field of EVENT_QUERY_FIELDS) {
      expect(source).toMatch(new RegExp(`\\b${field}\\b\\s*(?::|[,}])`))
    }
    expect(source).toContain('nextBeforeSequence')
    expect(source).toMatch(/load older events/i)
    expect(html).toMatch(/Load older events/i)
  })

  it('gates simulator controls on Main Overview Developer Mode and delegates enabled commands', () => {
    const html = renderConsole()
    const source = bridgeCallSource('simulate')
    const argumentsSource = bridgeCallArguments('simulate')

    expect(source).toMatch(/developerMode/)
    expect(source).toMatch(/![^;\n]{0,160}developerMode|developerMode[^;\n]{0,160}(?:!==?\s*true|===\s*false)/i)
    expect(source).toMatch(/disabled\s*=\s*\{[^}]*developerMode|developerMode[^\n]{0,160}disabled/i)
    expect(source).toMatch(/disabled/)
    expect(source).toMatch(/Developer Mode.*disabled/i)
    expect(argumentsSource).toMatch(/command|type|wake|cloud_failure/i)
    expect(CONSOLE_APP_SOURCE).not.toMatch(/realtime_ready/)
    expect(html).toMatch(/Developer Mode.*disabled/i)
  })

  it('exposes typed Start Conversation, Interrupt, and Disconnect controls with metadata-only outcomes', () => {
    const html = renderConsole()
    const startSource = bridgeCallSource('startConversation')
    const interruptSource = bridgeCallSource('interrupt')
    const disconnectSource = bridgeCallSource('disconnect')

    expect(CONSOLE_UI_CONTRACT.lifecycle.controls).toEqual([
      'Start Conversation',
      'Interrupt',
      'Disconnect',
    ])
    expect(html).toContain('Start Conversation')
    expect(html).toContain('Interrupt')
    expect(html).toContain('Disconnect')
    expect(startSource).toMatch(/ok|error|reason/i)
    expect(interruptSource).toMatch(/ok|error|reason/i)
    expect(disconnectSource).toMatch(/ok|error|reason/i)
    expect(CONSOLE_APP_SOURCE).toMatch(/console_lifecycle_action|Lifecycle action|action outcome/i)
  })

  it('defaults Phase Tests to controlled Phase 3, requests it once, and renders pending P3-D1 metadata', () => {
    const html = renderPhaseRecord(P3_D1_NOT_EXECUTED)
    const panelSource = phaseTestsPanelSource()
    const selectorSource = phaseSelectorSource()
    const phaseTestCalls = CONSOLE_APP_SOURCE.match(/(?:\bbridge|\bmagicMirror|window\.magicMirror)\.getPhaseTests\s*\(/g) ?? []

    expect(CONSOLE_APP_SOURCE).toMatch(/useState<PhaseTestPhase>\(\s*['"]3['"]\s*\)/)
    expect(phaseTestCalls).toHaveLength(1)
    expect(bridgeCallArguments('getPhaseTests')).toMatch(/(?:selectedPhase|requestedPhase|phase)/i)
    expect(selectorSource).toMatch(/value=\{[^}]+\}/)
    expect(selectorSource).toMatch(/onChange=/)

    expect(html).toMatch(/selected phase\s*:\s*(?:phase\s*)?3/i)
    expect(html).toMatch(/Latest validated Phase 3 record/i)
    expect(html).toContain(P3_D1_NOT_EXECUTED.demoId)
    expect(html).toContain(P3_D1_NOT_EXECUTED.build)
    expect(html).toContain(P3_D1_NOT_EXECUTED.time)
    expect(html).toContain(P3_D1_NOT_EXECUTED.note)
    expect(html).toContain('Not executed')
    expect(html).not.toMatch(/Phase 0|Task 10 owns/i)
    expect(panelSource).not.toMatch(/Latest validated Phase 0|Task 10 owns|No Phase 0/i)

    const notExecutedMarkup = resultMarkup(html, 'Not executed')
    expect(notExecutedMarkup).not.toMatch(/console__success|console__status--success/)
    expect(notExecutedMarkup).toMatch(/console__muted|console__notice|console__status--disabled|console__status--not-executed/)
  })

  it('exposes Phases 3, 2, 1, and 0, switches to phase 0, and renders real P0-D1 evidence', () => {
    const selectorSource = phaseSelectorSource()
    const html = renderPhaseRecord(P0_D1_PASSED)

    expect(selectorSource.match(/<option\b/g) ?? []).toHaveLength(4)
    expect(selectorSource).toMatch(/<option\s+value=["']3["']\s*>\s*Phase 3\s*<\/option>/)
    expect(selectorSource).toMatch(/<option\s+value=["']2["']\s*>\s*Phase 2\s*<\/option>/)
    expect(selectorSource).toMatch(/<option\s+value=["']1["']\s*>\s*Phase 1\s*<\/option>/)
    expect(selectorSource).toMatch(/<option\s+value=["']0["']\s*>\s*Phase 0\s*<\/option>/)
    expect(selectorSource).toMatch(/value=\{[^}]*phase[^}]*\}/i)
    expect(selectorSource).toMatch(/onChange=\{[\s\S]{0,300}(?:setSelectedPhase|setPhase|currentTarget\.value)/i)
    expect(bridgeCallArguments('getPhaseTests')).toMatch(/(?:selectedPhase|requestedPhase|phase)/i)

    expect(html).toMatch(/selected phase\s*:\s*(?:phase\s*)?0/i)
    expect(html).toMatch(/Latest validated Phase 0 record/i)
    expect(html).toContain(P0_D1_PASSED.demoId)
    expect(html).toContain(P0_D1_PASSED.build)
    expect(html).toContain(P0_D1_PASSED.time)
    expect(html).toContain(P0_D1_PASSED.note)
    expect(html).toContain('Passed (real evidence)')
  })

  it('gives passed, failed, mock_passed, and not_executed distinct visible result labels and styles', () => {
    const passedHtml = renderPhaseRecord(P0_D1_PASSED)
    const failedHtml = renderPhaseRecord(P0_D2_FAILED)
    const mockPassedHtml = renderPhaseRecord(P1_D1_MOCK_PASSED)
    const notExecutedHtml = renderPhaseRecord(P1_D1_NOT_EXECUTED)

    const passedMarkup = resultMarkup(passedHtml, 'Passed (real evidence)')
    const failedMarkup = resultMarkup(failedHtml, 'Failed')
    const mockPassedMarkup = resultMarkup(mockPassedHtml, 'Mock passed')
    const notExecutedMarkup = resultMarkup(notExecutedHtml, 'Not executed')
    const labels = ['Passed (real evidence)', 'Failed', 'Mock passed', 'Not executed']

    expect(new Set(labels)).toHaveLength(4)
    expect(passedMarkup).toMatch(/console__success/)
    expect(failedMarkup).toMatch(/console__fault|console__status--failed/)
    expect(mockPassedMarkup).toMatch(/console__status--mock|console__mock|console__notice/)
    expect(notExecutedMarkup).not.toMatch(/console__success|console__status--success/)
    expect(classTokens(failedMarkup)).not.toEqual(classTokens(passedMarkup))
    expect(classTokens(mockPassedMarkup)).not.toEqual(classTokens(passedMarkup))
    expect(classTokens(mockPassedMarkup)).not.toEqual(classTokens(notExecutedMarkup))
    expect(classTokens(notExecutedMarkup)).not.toEqual(classTokens(passedMarkup))
  })

  it('guards Phase Tests from stale Phase 1 responses and payloads with the wrong requested phase', () => {
    const source = phaseTestsRequestSource()

    expect(source).toMatch(/requestId/)
    expect(source).toMatch(/current\s*!==\s*requestId/)
    expect(source).toMatch(/response\.value\.phase\s*!==\s*(?:requestedPhase|selectedPhase|phase)/)
    expect(source).toMatch(/response\.value\.phase\s*!==\s*(?:requestedPhase|selectedPhase|phase)[\s\S]{0,240}return/)
  })
})

import { readFileSync } from 'node:fs'
import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  App,
  CONSOLE_UI_CONTRACT,
  PhaseTestsPanel,
} from '../../src/renderer/console/App'
import type { ConsoleBridge } from '../../src/shared/bridge'
import type {
  ConsolePhaseTestsPayload,
  ConsoleResponse,
} from '../../src/shared/console-types'

const EXACT_EMPTY_COPY = 'No Phase 0 records yet — Task 10 owns demo execution and record production.'
const EXACT_FAILURE_COPY = 'Phase Tests failed: console_phase_tests_read_failed; cause=reader_failed'

const PRIVACY_SENTINELS = [
  '__TEST_TRANSCRIPT_SENTINEL__',
  '__TEST_AUDIO_SENTINEL__',
  '__TEST_PRIVATE_MEMORY_SENTINEL__',
  '__TEST_CREDENTIAL_SENTINEL__',
  '__TEST_IMAGE_SENTINEL__',
  '__TEST_EMBEDDING_SENTINEL__',
  '__TEST_CONFIGURED_VALUE_SENTINEL__',
] as const

const MODEL_BEARING_KEY_PATTERN = /\b(?:modelId|credential|apiKey|clientSecret|modelValue|guestId|candidateProfileId|profileId)\b/i

const CONSOLE_APP_SOURCE = readFileSync(
  new URL('../../src/renderer/console/App.tsx', import.meta.url),
  'utf8',
)

const latestRecord = {
  phase: '0' as const,
  demoId: 'P0-D5' as const,
  build: 'fixture-build',
  time: '2026-08-19T00:00:00.000Z',
  result: 'mock_passed' as const,
  note: 'latest metadata note',
}

const latestPayload = {
  phase: '0' as const,
  source: 'reader' as const,
  latest: latestRecord,
  records: [latestRecord],
} satisfies ConsolePhaseTestsPayload

type PhaseTestsViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly value: ConsolePhaseTestsPayload }
  | {
      readonly status: 'failure'
      readonly error: string
      readonly reason: string
    }

type PhaseTestsPanelContract = (props: {
  readonly state: PhaseTestsViewState
}) => React.JSX.Element

function renderPhaseTests(state: PhaseTestsViewState): string {
  const panel = PhaseTestsPanel as unknown as PhaseTestsPanelContract
  return renderToStaticMarkup(createElement(panel, { state }))
}

function sourceSection(startMarker: string, endMarkers: readonly string[]): string {
  const start = CONSOLE_APP_SOURCE.indexOf(startMarker)
  expect(start, `missing source marker: ${startMarker}`).toBeGreaterThanOrEqual(0)

  const end = endMarkers
    .map((marker) => CONSOLE_APP_SOURCE.indexOf(marker, start + startMarker.length))
    .filter((index) => index > start)
    .sort((left, right) => left - right)[0]
  if (end === undefined) throw new Error(`missing source boundary after: ${startMarker}`)
  return CONSOLE_APP_SOURCE.slice(start, end)
}

function expectNoSensitiveOutput(value: unknown): void {
  const serialized = JSON.stringify(value) ?? ''
  for (const sentinel of PRIVACY_SENTINELS) {
    expect(serialized).not.toContain(sentinel)
  }
  expect(serialized).not.toMatch(MODEL_BEARING_KEY_PATTERN)
}

function makeTypedPhaseTestsBridge(): Pick<ConsoleBridge, 'getPhaseTests'> {
  const response: ConsoleResponse<ConsolePhaseTestsPayload> = {
    ok: true,
    value: latestPayload,
  }
  const getPhaseTests: ConsoleBridge['getPhaseTests'] = async () => response
  return { getPhaseTests }
}

describe('Phase 0 Task 9 Gate 9C.1 Phase Tests UI RED contract', () => {
  it('renders the exact honest empty Phase Tests copy', () => {
    const html = renderPhaseTests({
      status: 'success',
      value: {
        phase: '0',
        source: 'empty',
        latest: null,
        records: [],
      },
    })
    const contract = (CONSOLE_UI_CONTRACT as unknown as Record<string, unknown>).phaseTests

    expect(CONSOLE_UI_CONTRACT.tabs).toContain('Phase Tests')
    expect(contract).toEqual(expect.objectContaining({
      emptyCopy: EXACT_EMPTY_COPY,
    }))
    expect(html).toContain(EXACT_EMPTY_COPY)
    expect(html).not.toContain('passed')
    expectNoSensitiveOutput({ html, contract })
  })

  it('renders latest demo metadata and labels mock_passed as Mock passed', () => {
    const html = renderPhaseTests({ status: 'success', value: latestPayload })
    const contract = (CONSOLE_UI_CONTRACT as unknown as Record<string, unknown>).phaseTests

    expect(contract).toEqual(expect.objectContaining({
      resultLabels: expect.objectContaining({
        passed: 'Passed',
        failed: 'Failed',
        mock_passed: 'Mock passed',
      }),
    }))
    expect(html).toContain('P0-D5')
    expect(html).toContain('fixture-build')
    expect(html).toContain('2026-08-19T00:00:00.000Z')
    expect(html).toContain('Mock passed')
    expect(html).toContain('latest metadata note')
    expectNoSensitiveOutput({ html, payload: latestPayload, contract })
  })

  it('renders stable failure copy without exposing a raw reader exception', () => {
    const html = renderPhaseTests({
      status: 'failure',
      error: 'console_phase_tests_read_failed',
      reason: 'cause=reader_failed',
    })

    expect(html).toContain(EXACT_FAILURE_COPY)
    expect(html).not.toContain('__TEST_PRIVATE_MEMORY_SENTINEL__')
    expectNoSensitiveOutput(html)
  })

  it('retrieves Phase Tests through the typed Main bridge contract', async () => {
    const bridge = makeTypedPhaseTestsBridge()
    expect(await bridge.getPhaseTests()).toEqual({ ok: true, value: latestPayload })

    const bridgeSource = sourceSection('function isConsoleBridge', ['function readConsoleBridge'])
    expect(bridgeSource).toMatch(/getPhaseTests/)
    expect(CONSOLE_APP_SOURCE).toMatch(/bridge\.getPhaseTests\s*\(\)/)
  })

  it('keeps Phase Tests read-only, non-fabricating, and free of model-bearing actions', () => {
    const html = renderPhaseTests({ status: 'success', value: latestPayload })
    const phaseTestsSource = sourceSection('function PhaseTestsPanel', [
      'function ConfigPanel',
      'function ModelsPanel',
      'function Placeholder',
      'export function App',
    ])

    expect(html).not.toMatch(/<button\b/i)
    expect(html).not.toMatch(/\b(?:Run|Write|Exit|Tag)\b/i)
    expect(html).not.toMatch(/runDemo|executeDemo|writeRecord|persistRecord|checkExit|tagPhase/i)
    expect(phaseTestsSource).not.toMatch(/runDemo|executeDemo|writeRecord|persistRecord|checkExit|tagPhase/i)
    expect(phaseTestsSource).not.toMatch(MODEL_BEARING_KEY_PATTERN)
    expectNoSensitiveOutput({ html, payload: latestPayload, phaseTestsSource })
  })

  it('keeps the Phase Tests page visible in the Console shell without a fabricated record', () => {
    const html = renderToStaticMarkup(createElement(App))

    expect(html).toContain('Phase Tests')
    expect(html).toContain('Task 10 owns demo execution and record production.')
    expect(html).not.toContain('P0-D1')
    expect(html).not.toContain('P0-D2')
    expect(html).not.toContain('P0-D3')
    expect(html).not.toContain('P0-D4')
    expect(html).not.toContain('P0-D5')
    expectNoSensitiveOutput(html)
  })
})

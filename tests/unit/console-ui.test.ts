import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { App, CONSOLE_UI_CONTRACT } from '../../src/renderer/console/App'
import type { ConsoleBridge } from '../../src/shared/bridge'
import type { ConsoleEventsQuery, ConsoleOverviewPayload } from '../../src/shared/console-types'

const EXPECTED_TABS = [
  'Overview',
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
  'getOverview' | 'getEvents' | 'simulate' | 'startConversation' | 'disconnect'
>

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

describe('Phase 0 Task 9 Gate 9A.1 Console UI RED contract', () => {
  it('renders exactly the six Console tabs and exposes the Task 10 Phase Tests ownership sentence', () => {
    const html = renderConsole()

    expect(CONSOLE_UI_CONTRACT.tabs).toEqual(EXPECTED_TABS)
    for (const tab of EXPECTED_TABS) {
      expect(html).toContain(tab)
    }
    expect(CONSOLE_UI_CONTRACT).not.toHaveProperty('placeholders')
    expect(html).toContain('Task 10 owns demo execution and record production.')
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

  it('exposes typed Start Conversation and Disconnect controls with metadata-only outcomes', () => {
    const html = renderConsole()
    const startSource = bridgeCallSource('startConversation')
    const disconnectSource = bridgeCallSource('disconnect')

    expect(CONSOLE_UI_CONTRACT.lifecycle.controls).toEqual(['Start Conversation', 'Disconnect'])
    expect(html).toContain('Start Conversation')
    expect(html).toContain('Disconnect')
    expect(startSource).toMatch(/ok|error|reason/i)
    expect(disconnectSource).toMatch(/ok|error|reason/i)
    expect(CONSOLE_APP_SOURCE).toMatch(/console_lifecycle_action|Lifecycle action|action outcome/i)
  })
})

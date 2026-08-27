import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  App,
  ConfigPanel,
  ModelsPanel,
  CONSOLE_UI_CONTRACT,
} from '../../src/renderer/console/App'
import type { ConsoleModelsPayload } from '../../src/shared/console-types'

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

const EXPECTED_SIMULATOR_COMMANDS = [
  'wake',
  'cloud_failure',
  'cloud_recovery',
  'camera_result',
  'avatar_state',
  'scene_result',
  'sqlite_failure',
  'sleep',
] as const

const EXPECTED_SAFE_CONFIG_FIELDS = [
  'personaName',
  'voice',
  'idleSeconds',
  'wake.phrase',
  'wake.modelVersion',
  'faceModel.detectorId',
  'faceModel.recognizerId',
  'assets.offlineLoopVideo',
  'assets.avatarDir',
  'assets.musicDir',
  'adapters.lighting',
  'adapters.fog',
  'adapters.music',
] as const

const EXPECTED_MODEL_ROLES = [
  'realtimeDialogue',
  'inputTranscription',
  'memoryExtractor',
] as const

const EXPECTED_MODEL_CARDS = [
  'Realtime Dialogue',
  'Input Transcription',
  'Memory Extractor',
] as const

const EXPECTED_MODEL_SECTIONS = [
  'Draft',
  'Published Active',
  'Runtime loaded',
  'Previous',
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

const CONSOLE_APP_SOURCE = readFileSync(
  new URL('../../src/renderer/console/App.tsx', import.meta.url),
  'utf8',
)

function renderConsole(): string {
  return renderToStaticMarkup(createElement(App))
}

function renderModelsWithTest(latestTest: ConsoleModelsPayload['latestTest']): string {
  const value: ConsoleModelsPayload = {
    cards: [],
    runtime: { current: null, old: null, new: null },
    latestTest,
  }
  return renderToStaticMarkup(createElement(ModelsPanel, {
    state: { status: 'success', value },
    bridge: null,
    bridgeAvailable: false,
    onChanged: () => {},
  }))
}

function contractPage(name: 'config' | 'models'): Record<string, unknown> {
  const page = (CONSOLE_UI_CONTRACT as unknown as Record<string, unknown>)[name]
  expect(page, `${name} UI contract must be exported`).toBeDefined()
  return (page ?? {}) as Record<string, unknown>
}

function sourceSection(startMarker: string, endMarker: string): string {
  const start = CONSOLE_APP_SOURCE.indexOf(startMarker)
  const end = CONSOLE_APP_SOURCE.indexOf(endMarker, start + startMarker.length)
  expect(start, `missing view export source: ${startMarker}`).toBeGreaterThanOrEqual(0)
  expect(end, `missing following view source: ${endMarker}`).toBeGreaterThan(start)
  return CONSOLE_APP_SOURCE.slice(start, end > start ? end : CONSOLE_APP_SOURCE.length)
}

function expectNoPrivacySentinels(value: unknown): void {
  const serialized = JSON.stringify(value) ?? ''
  for (const sentinel of PRIVACY_SENTINELS) expect(serialized).not.toContain(sentinel)
}

describe('Phase 0 Task 9B Gate 9B.1 Config + Models UI RED contract', () => {
  it('preserves the six existing tabs and all 9A Overview, Simulator, and Events contracts', () => {
    const html = renderConsole()

    expect(CONSOLE_UI_CONTRACT.tabs).toEqual(EXPECTED_TABS)
    for (const tab of EXPECTED_TABS) expect(html).toContain(tab)
    expect(CONSOLE_UI_CONTRACT.overview.readinessLabel).toBe('Mock / simulator')
    expect(CONSOLE_UI_CONTRACT.overview.tccLabel).toBe('TCC: not_checked')
    expect(CONSOLE_UI_CONTRACT.simulator.commands).toEqual(EXPECTED_SIMULATOR_COMMANDS)
    expect(CONSOLE_UI_CONTRACT.simulator.commands).not.toContain('realtime_ready')
    expect(CONSOLE_UI_CONTRACT.events.columns).toEqual(EXPECTED_EVENT_COLUMNS)
    expect(CONSOLE_UI_CONTRACT.events.filters).toEqual(expect.arrayContaining(['module', 'status', 'source']))
    expect(CONSOLE_UI_CONTRACT.events.pagination).toEqual(expect.arrayContaining(['beforeSequence', 'nextBeforeSequence']))
    expect(html).toContain('Mock / simulator')
    expect(html).toContain('TCC: not_checked')
    expect(html).not.toContain('realtime_ready')
    expect(html).toContain('No mock Test Draft result yet.')
    expect(html).not.toContain('Mock passed · source=simulator')
    expectNoPrivacySentinels(html)
  })

  it('renders Config with only safe fields and no credential or model-value control', () => {
    const html = renderConsole()
    const config = contractPage('config')
    const configSource = sourceSection('function ConfigPanel', 'function ModelsPanel')

    expect(typeof ConfigPanel).toBe('function')
    expect(config).toEqual(expect.objectContaining({
      safeFields: EXPECTED_SAFE_CONFIG_FIELDS,
      actions: expect.arrayContaining(['saveDraft', 'testDraft', 'publish', 'rollback']),
    }))
    for (const field of EXPECTED_SAFE_CONFIG_FIELDS) expect(configSource).toContain(field.split('.')[0])
    expect(configSource).toMatch(/saveDraft/)
    expect(configSource).toMatch(/testDraft/)
    expect(configSource).toMatch(/publish/)
    expect(configSource).toMatch(/rollback/)
    expect(configSource).not.toMatch(/modelId|aiModels|credential|apiKey|clientSecret|safeStorage/i)
    expect(configSource).not.toMatch(/saveModelDraft|getModels/)
    expect(html).toMatch(/Config/)
    expect(html).not.toMatch(/credential editor|api key|client secret/i)
    expectNoPrivacySentinels({ html, config })
  })

  it('renders Models with exactly three bounded Draft role inputs and the saveModelDraft action', () => {
    const html = renderConsole()
    const models = contractPage('models')
    const modelsSource = sourceSection('function ModelsPanel', 'export function App')
    const saveCall = /\.saveModelDraft\s*\(([\s\S]{0,800})\)/.exec(modelsSource)

    expect(typeof ModelsPanel).toBe('function')
    expect(models).toEqual(expect.objectContaining({
      roles: EXPECTED_MODEL_ROLES,
      cardLabels: EXPECTED_MODEL_CARDS,
      sections: EXPECTED_MODEL_SECTIONS,
      draftInputs: EXPECTED_MODEL_ROLES,
    }))
    expect(saveCall).not.toBeNull()
    expect(saveCall?.[1]).toMatch(/realtimeDialogue/)
    expect(saveCall?.[1]).toMatch(/inputTranscription/)
    expect(saveCall?.[1]).toMatch(/memoryExtractor/)
    expect(modelsSource).toMatch(/bounded|input/i)
    expect(modelsSource).toMatch(/saveModelDraft/)
    expect(modelsSource).toMatch(/type\s*=\s*["']text["']/i)
    expect(modelsSource).not.toMatch(/provider|chooser|router|auto.?latest|fallback|contract[_ ]passed/i)
    expect(html).toMatch(/Realtime Dialogue/)
    expect(html).toMatch(/Input Transcription/)
    expect(html).toMatch(/Memory Extractor/)
    expectNoPrivacySentinels({ html, models })
  })

  it('shows complete Publish and Rollback diff categories plus Mock passed Test Draft evidence', () => {
    const html = renderConsole()
    const testedModelsHtml = renderModelsWithTest({
      result: 'mock_passed',
      source: 'simulator',
      configVersion: 7,
      fingerprint: 'fixture-fingerprint',
      roleCount: 3,
      reason: 'cause=all_configured_ids_observed',
    })
    const configSource = sourceSection('function ConfigPanel', 'function ModelsPanel')
    const modelsSource = sourceSection('function ModelsPanel', 'export function App')

    expect(configSource).toMatch(/changed paths|changedPaths/i)
    expect(configSource).toMatch(/nonModelChanges/)
    expect(configSource).toMatch(/complete|confirmationDigest/i)
    expect(configSource).toMatch(/Publish/)
    expect(configSource).toMatch(/Rollback/)
    expect(modelsSource).toMatch(/Mock passed/)
    expect(modelsSource).toMatch(/source\s*[:=]\s*["']?simulator/i)
    expect(testedModelsHtml).toMatch(/Mock passed/)
    expect(testedModelsHtml).toMatch(/source=simulator/)
    expect(html).toMatch(/changed paths/i)
    expect(html).toMatch(/nonModelChanges/)
    expectNoPrivacySentinels({ html, configSource, modelsSource })
  })

  it('shows Draft, Published Active, Runtime loaded, Previous, and pending next session/job evidence', () => {
    const html = renderConsole()
    const modelsSource = sourceSection('function ModelsPanel', 'export function App')

    for (const section of EXPECTED_MODEL_SECTIONS) expect(modelsSource).toContain(section)
    expect(modelsSource).toMatch(/current|old|new/)
    expect(modelsSource).toMatch(/pending/)
    expect(modelsSource).toMatch(/next[_ ]session/i)
    expect(modelsSource).toMatch(/next[_ ]job/i)
    expect(html).toMatch(/Draft/)
    expect(html).toMatch(/Published Active/)
    expect(html).toMatch(/Runtime loaded/)
    expect(html).toMatch(/Previous/)
    expect(html).toMatch(/next session/i)
    expect(html).toMatch(/next job/i)
    expect(modelsSource).not.toMatch(/provider|chooser|router|auto.?latest|fallback|contract[_ ]passed|fetch\s*\(|ipcRenderer/i)
    expectNoPrivacySentinels({ html, modelsSource })
  })

  it('keeps the Config/Models view contract free of provider calls, credentials, and privacy-bearing output', () => {
    const config = contractPage('config')
    const models = contractPage('models')
    const configSource = sourceSection('function ConfigPanel', 'function ModelsPanel')
    const modelsSource = sourceSection('function ModelsPanel', 'export function App')
    const serializedContracts = JSON.stringify({ config, models })

    expect(serializedContracts).not.toMatch(/credential|apiKey|clientSecret|safeStorage|provider|router|auto.?latest|contract[_ ]passed/i)
    expect(configSource).not.toMatch(/(?:^|[^A-Za-z0-9_$])(?:transcript|audio|privateContext|image|embedding|guestId|candidateProfileId|profileId)(?:[A-Z_][A-Za-z0-9_$]*)?(?:$|[^A-Za-z0-9_$])/i)
    expect(modelsSource).not.toMatch(/\b(?:transcript|audio|privateContext|image|embedding|guestId|candidateProfileId|profileId|credential|apiKey|clientSecret)\b/i)
    expectNoPrivacySentinels({ config, models, configSource, modelsSource })
  })
})

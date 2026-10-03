import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const CLI_PATH = join(REPO_ROOT, 'scripts', 'run-phase0-demos.mjs')
const TASK10_USER_DATA_ROOT = join(
  REPO_ROOT,
  '.superpowers',
  'sdd',
  '2026-08-19-phase0-task8-boot-ipc-mirror',
  'task10-user-data',
)
const BUILD_COMMIT = 'phase0-task10-contract-test'

const ALLOWED_MARKERS = new Set([
  'PHASE_DEMO_START',
  'PHASE_DEMO_STEP',
  'PHASE_DEMO_RESULT',
  'PHASE_RECORD_WRITTEN',
  'PHASE_REOPEN_RESULT',
  'OFFLINE_LOOP_SAMPLE',
])

const PRIVATE_FIELD_PATTERN = /(?:transcript|audio|credential|secret|token|embedding|prompt|utterance|private[_-]?context|raw[_-]?(?:line|jsonl)|(?:guest|candidate)_?id|profile_?id|memory[_-]?(?:value|text|content))/i
const ALLOWLISTED_HASH_KEYS = new Set([
  'realtimeHash',
  'transcriptionHash',
  'extractorHash',
  'personaHash',
])
const SHA256_HASH_PATTERN = /^[0-9a-f]{64}$/
const PRIVATE_SENTINELS = [
  'synthetic-private-marker',
  'synthetic-credential-marker',
] as const

const FIXTURES = {
  realtimeDialogue: 'fixture-realtime-p0-v2',
  inputTranscription: 'fixture-transcription-p0-v2',
  memoryExtractor: 'fixture-extractor-p0-v2',
  persona: 'Phase0Fixture',
} as const

const DEMO_IDS = ['P0-D1', 'P0-D2', 'P0-D3', 'P0-D4', 'P0-D5'] as const
type DemoId = typeof DEMO_IDS[number]
type FailureCase = 'cloud-failure' | 'core-failure'
type Marker = Record<string, unknown> & { readonly marker: string }

interface DemoOptions {
  readonly caseName?: FailureCase
  readonly retainOnSuccess?: boolean
  readonly soakMs?: number
  readonly sampleMs?: number
  readonly noTimeCompression?: boolean
}

interface DemoRun {
  readonly exitCode: number | null
  readonly stdout: string
  readonly stderr: string
  readonly markers: readonly Marker[]
}

function runCli(
  demo: DemoId,
  userDataRoot: string,
  options: DemoOptions = {},
): DemoRun {
  const args = [
    CLI_PATH,
    '--demo',
    demo,
    '--build-commit',
    BUILD_COMMIT,
    '--user-data-root',
    userDataRoot,
    '--timeout-ms',
    '120000',
    '--marker-timeout-ms',
    '15000',
    ...(options.caseName === undefined ? [] : ['--case', options.caseName]),
    ...(options.soakMs === undefined ? [] : ['--soak-ms', String(options.soakMs)]),
    ...(options.sampleMs === undefined ? [] : ['--sample-ms', String(options.sampleMs)]),
    ...(options.noTimeCompression === true ? ['--no-time-compression'] : []),
    ...(options.retainOnSuccess === false ? [] : ['--retain-on-success']),
  ]

  const environment = { ...process.env }
  delete environment.MIRROR_PHASE0_DEMO
  delete environment.MIRROR_PHASE0_USER_DATA_ROOT
  delete environment.MIRROR_USER_DATA_DIR
  delete environment.MIRROR_BUILD_COMMIT
  delete environment.MIRROR_SMOKE_MS

  const child = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: environment,
    timeout: 130_000,
    windowsHide: true,
  })
  const stdout = typeof child.stdout === 'string' ? child.stdout : String(child.stdout ?? '')
  const stderr = typeof child.stderr === 'string' ? child.stderr : String(child.stderr ?? '')

  return {
    exitCode: child.status,
    stdout,
    stderr,
    markers: parseMarkers(stdout),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJsonObject(line: string): Record<string, unknown> | null {
  const trimmed = line.trim()
  if (trimmed === '') return null

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) return null

  try {
    const candidate: unknown = JSON.parse(trimmed.slice(start, end + 1))
    return isRecord(candidate) ? candidate : null
  } catch {
    return null
  }
}

function parseMarkers(output: string): readonly Marker[] {
  const markers: Marker[] = []
  for (const line of output.split(/\r?\n/)) {
    const record = parseJsonObject(line)
    if (record !== null && typeof record.marker === 'string') {
      markers.push(record as Marker)
    }
  }
  return markers
}

function runDemo(demo: DemoId, options: DemoOptions = {}): DemoRun {
  mkdirSync(TASK10_USER_DATA_ROOT, { recursive: true })
  return runCli(demo, TASK10_USER_DATA_ROOT, options)
}

function assertMetadataValue(value: unknown, key: string): void {
  if (ALLOWLISTED_HASH_KEYS.has(key)) {
    expect(typeof value).toBe('string')
    expect(value).toMatch(SHA256_HASH_PATTERN)
    return
  }

  expect(PRIVATE_FIELD_PATTERN.test(key)).toBe(false)

  if (Array.isArray(value)) {
    for (const item of value) assertMetadataValue(item, key)
    return
  }

  if (isRecord(value)) {
    for (const [childKey, childValue] of Object.entries(value)) {
      assertMetadataValue(childValue, childKey)
    }
    return
  }

  expect(
    value === null
      || typeof value === 'boolean'
      || (typeof value === 'number' && Number.isFinite(value))
      || typeof value === 'string',
  ).toBe(true)
  if (typeof value === 'string') {
    expect(value.length).toBeLessThanOrEqual(4096)
    expect(value.includes('\r')).toBe(false)
    expect(value.includes('\n')).toBe(false)
  }
}

function assertMetadataOnly(run: DemoRun): void {
  expect(run.markers.length).toBeGreaterThan(0)
  for (const marker of run.markers) {
    expect(ALLOWED_MARKERS.has(marker.marker)).toBe(true)
    assertMetadataValue(marker, 'marker')
  }

  const output = `${run.stdout}\n${run.stderr}`
  for (const sentinel of PRIVATE_SENTINELS) {
    expect(output).not.toContain(sentinel)
  }
}

function markerOf(run: DemoRun, name: string): Marker[] {
  return run.markers.filter((marker) => marker.marker === name)
}

function onlyMarker(run: DemoRun, name: string): Marker {
  const matches = markerOf(run, name)
  expect(matches).toHaveLength(1)
  return matches[0] as Marker
}

function onlyStep(run: DemoRun, fields: Readonly<Record<string, unknown>>): Marker {
  const matches = run.markers.filter((marker) => {
    if (marker.marker !== 'PHASE_DEMO_STEP') return false
    return Object.entries(fields).every(([key, expected]) => marker[key] === expected)
  })
  expect(matches).toHaveLength(1)
  return matches[0] as Marker
}

function stringField(marker: Marker, key: string): string {
  const value = marker[key]
  expect(typeof value).toBe('string')
  return value as string
}

function integerField(marker: Marker, key: string, minimum: number): number {
  const value = marker[key]
  expect(typeof value).toBe('number')
  expect(Number.isFinite(value)).toBe(true)
  expect(Number.isInteger(value)).toBe(true)
  expect(value).toBeGreaterThanOrEqual(minimum)
  return value as number
}

function assertMemorySeries(samples: readonly Marker[], key: string): void {
  const values = samples.map((sample) => integerField(sample, key, 1))
  const baseline = values[0] as number
  const maximum = Math.max(...values)
  expect(maximum - baseline).toBeLessThanOrEqual(
    Math.max(134_217_728, baseline * 0.25),
  )

  const strictlyIncreasing = values.slice(1).every((value, index) => value > (values[index] as number))
  if (strictlyIncreasing) {
    const finalValue = values[values.length - 1] as number
    expect(finalValue - baseline).toBeLessThanOrEqual(134_217_728)
  }
}

function demoIdField(marker: Marker): string {
  const value = marker.demoId ?? marker.demo
  expect(typeof value).toBe('string')
  return value as string
}

function runDirectoryField(marker: Marker): string {
  const value = marker.userDataDir ?? marker.runDirectory
  expect(typeof value).toBe('string')
  return resolve(value as string)
}

function isStrictDescendant(root: string, candidate: string): boolean {
  const child = relative(resolve(root), resolve(candidate))
  return child !== ''
    && child !== '..'
    && !child.startsWith(`..${sep}`)
    && !isAbsolute(child)
}

function assertRunDirectory(
  run: DemoRun,
  demo: DemoId,
  expectRetained: boolean,
): string {
  const start = onlyMarker(run, 'PHASE_DEMO_START')
  expect(demoIdField(start)).toBe(demo)
  const directory = runDirectoryField(start)
  expect(isStrictDescendant(TASK10_USER_DATA_ROOT, directory)).toBe(true)

  if (expectRetained) {
    expect(existsSync(directory)).toBe(true)
    expect(statSync(directory).isDirectory()).toBe(true)
    expect(readdirSync(directory).length).toBeGreaterThan(0)
  }
  return directory
}

function assertPassedDemo(
  run: DemoRun,
  demo: DemoId,
  options: { readonly expectRetained?: boolean } = {},
): string {
  expect(run.exitCode).toBe(0)
  assertMetadataOnly(run)

  const directory = assertRunDirectory(run, demo, options.expectRetained !== false)
  const record = onlyMarker(run, 'PHASE_RECORD_WRITTEN')
  expect(record.phase).toBe('0')
  expect(demoIdField(record)).toBe(demo)
  expect(record.result).toBe('passed')
  expect(record.count).toBe(1)

  const result = onlyMarker(run, 'PHASE_DEMO_RESULT')
  expect(demoIdField(result)).toBe(demo)
  expect(result.result).toBe('passed')
  expect(result.exit).toBe(0)

  const startIndex = run.markers.indexOf(onlyMarker(run, 'PHASE_DEMO_START'))
  const recordIndex = run.markers.indexOf(record)
  const resultIndex = run.markers.indexOf(result)
  expect(startIndex).toBeLessThan(recordIndex)
  expect(recordIndex).toBeLessThan(resultIndex)
  return directory
}

function assertNoRawJsonObjectLines(output: string): void {
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    const record = parseJsonObject(trimmed)
    if (record === null) continue
    expect(typeof record.marker).toBe('string')
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

describe('Phase 0 Task 10C black-box demos', () => {
  it('P0-D1 emits the exact lifecycle sequence and one passed phase record', () => {
    const run = runDemo('P0-D1')
    assertPassedDemo(run, 'P0-D1')

    const lifecycleStates = markerOf(run, 'PHASE_DEMO_STEP')
      .map((marker) => marker.state)
      .filter((state): state is string => typeof state === 'string')
    expect(lifecycleStates).toEqual([
      'starting',
      'dormant',
      'activating',
      'active',
      'suspending',
      'dormant',
    ])
    expect(markerOf(run, 'PHASE_DEMO_STEP')).toHaveLength(6)
    expect(markerOf(run, 'PHASE_RECORD_WRITTEN')).toHaveLength(1)
    expect(markerOf(run, 'OFFLINE_LOOP_SAMPLE')).toHaveLength(0)
    expect(markerOf(run, 'PHASE_REOPEN_RESULT')).toHaveLength(0)
  })

  it('P0-D2 keeps cloud and local-core failures visible, nonblack, and non-gating in independent runs', () => {
    const cloud = runDemo('P0-D2', { caseName: 'cloud-failure' })
    const core = runDemo('P0-D2', { caseName: 'core-failure' })
    const cloudDirectory = assertPassedDemo(cloud, 'P0-D2')
    const coreDirectory = assertPassedDemo(core, 'P0-D2')

    expect(cloudDirectory).not.toBe(coreDirectory)

    const activationFailure = onlyStep(cloud, { step: 'activation_cloud_failure' })
    expect(activationFailure).toMatchObject({
      after: 'WAKE_DETECTED',
      before: 'REALTIME_READY',
      reason: 'cloud_unavailable',
      status: 'degraded',
    })

    const activeFailure = onlyStep(cloud, { step: 'active_cloud_failure' })
    expect(activeFailure).toMatchObject({
      state: 'offlineLoop',
      visible: true,
      nonblack: true,
      reason: 'cloud_unavailable',
      unrelated: 'not_gated',
    })

    const cloudSample = markerOf(cloud, 'OFFLINE_LOOP_SAMPLE')
    expect(cloudSample).toHaveLength(1)
    expect(cloudSample[0]).toMatchObject({
      state: 'offlineLoop',
      nonblack: true,
      playing: true,
      reason: 'cloud_unavailable',
    })

    const localFailure = onlyStep(core, { step: 'local_core_failure' })
    expect(localFailure).toMatchObject({
      state: 'maintenance',
      visible: true,
      nonblack: true,
      reason: 'sqlite_open_failed',
      unrelated: 'not_gated',
    })
    expect(markerOf(core, 'OFFLINE_LOOP_SAMPLE')).toHaveLength(0)
    expect(markerOf(cloud, 'PHASE_RECORD_WRITTEN')).toHaveLength(1)
    expect(markerOf(core, 'PHASE_RECORD_WRITTEN')).toHaveLength(1)
  })

  it('P0-D2 cloud failure provides real OfflineLoop soak media and memory evidence', () => {
    const soakMs = 2_400
    const sampleMs = 800
    const startedAt = Date.now()
    const run = runDemo('P0-D2', {
      caseName: 'cloud-failure',
      soakMs,
      sampleMs,
      noTimeCompression: true,
    })
    const wallClockMs = Date.now() - startedAt
    const directory = assertPassedDemo(run, 'P0-D2')
    const samples = markerOf(run, 'OFFLINE_LOOP_SAMPLE')

    expect(samples).toHaveLength(4)
    expect(samples.map((sample) => sample.elapsedMs)).toEqual([0, 800, 1_600, 2_400])
    expect(wallClockMs).toBeGreaterThanOrEqual(soakMs - sampleMs / 2)

    for (const sample of samples) {
      expect(sample).toMatchObject({
        demoId: 'P0-D2',
        state: 'offlineLoop',
        reason: 'cloud_unavailable',
        playing: true,
        nonblack: true,
      })
      const userDataDir = stringField(sample, 'userDataDir')
      expect(isAbsolute(userDataDir)).toBe(true)
      expect(userDataDir).toBe(directory)
      const runId = stringField(sample, 'runId')
      expect(runId.length).toBeGreaterThan(0)
      expect(runId).toBe(basename(directory))
      integerField(sample, 'rssBytes', 1)
      integerField(sample, 'workingSetBytes', 1)
      integerField(sample, 'heapUsedBytes', 1)
      integerField(sample, 'mediaCurrentTimeMs', 0)
      integerField(sample, 'loopCount', 0)
    }

    for (let index = 1; index < samples.length; index += 1) {
      const previous = samples[index - 1] as Marker
      const current = samples[index] as Marker
      const previousMediaTime = integerField(previous, 'mediaCurrentTimeMs', 0)
      const currentMediaTime = integerField(current, 'mediaCurrentTimeMs', 0)
      const previousLoopCount = integerField(previous, 'loopCount', 0)
      const currentLoopCount = integerField(current, 'loopCount', 0)
      expect(currentLoopCount).toBeGreaterThanOrEqual(previousLoopCount)
      expect(currentMediaTime > previousMediaTime || currentLoopCount > previousLoopCount).toBe(true)
    }

    assertMemorySeries(samples, 'rssBytes')
    assertMemorySeries(samples, 'workingSetBytes')
    assertMemorySeries(samples, 'heapUsedBytes')
  })

  it('P0-D3 queries Overview, Events, and Phase Tests in both degraded states', () => {
    const run = runDemo('P0-D3')
    assertPassedDemo(run, 'P0-D3')

    const cases = [
      { state: 'offlineLoop', reason: 'cloud_unavailable' },
      { state: 'maintenance', reason: 'sqlite_open_failed' },
    ] as const
    const views = ['overview', 'events', 'phase_tests'] as const

    for (const testCase of cases) {
      for (const view of views) {
        const query = onlyStep(run, {
          step: 'console_query',
          state: testCase.state,
          view,
        })
        expect(query.status).toBe('readable')

        if (view === 'overview') {
          expect(query).toMatchObject({
            lifecycle: testCase.state,
            fallback: testCase.state,
          })
        } else if (view === 'events') {
          expect(query).toMatchObject({
            lastError: testCase.reason,
            reason: testCase.reason,
          })
        } else {
          expect(query.recordStatus).toBe('passed')
          expect(query.recordCount).toBeGreaterThan(0)
        }
      }
    }

    expect(markerOf(run, 'PHASE_DEMO_STEP').filter((marker) => marker.step === 'console_query')).toHaveLength(6)
    expect(markerOf(run, 'PHASE_RECORD_WRITTEN')).toHaveLength(1)
  })

  it('P0-D4 reopens one exact user-data directory across process A and process B', () => {
    const run = runDemo('P0-D4')
    const directory = assertPassedDemo(run, 'P0-D4')
    assertNoRawJsonObjectLines(`${run.stdout}\n${run.stderr}`)

    const processAConfig = onlyStep(run, { process: 'A', action: 'publish_config' })
    const processARecord = onlyStep(run, { process: 'A', action: 'append_phase_record' })
    const processATelemetry = onlyStep(run, { process: 'A', action: 'emit_reopen_probe' })
    const processAShutdown = onlyStep(run, { process: 'A', action: 'shutdown' })
    const processBReopen = onlyStep(run, { process: 'B', action: 'reopen' })

    expect(processAConfig).toMatchObject({ status: 'success' })
    expect(processARecord).toMatchObject({ count: 1, status: 'success' })
    expect(processATelemetry).toMatchObject({
      count: 1,
      module: 'app',
      event: 'phase_reopen_probe',
      status: 'success',
      source: 'contract_test',
      reason: 'process_a_metadata_probe',
    })
    expect(processAShutdown).toMatchObject({ flushCount: 1, closeCount: 1 })
    expect(processBReopen).toMatchObject({ config: 'readable', phaseRecord: 'readable' })

    expect(stringField(processAConfig, 'userDataDir')).toBe(directory)
    expect(stringField(processARecord, 'userDataDir')).toBe(directory)
    expect(stringField(processATelemetry, 'userDataDir')).toBe(directory)
    expect(stringField(processAShutdown, 'userDataDir')).toBe(directory)
    expect(stringField(processBReopen, 'userDataDir')).toBe(directory)

    const reopened = onlyMarker(run, 'PHASE_REOPEN_RESULT')
    expect(reopened).toMatchObject({
      config: 'readable',
      phaseRecord: 'readable',
      event: 'readable',
    })
    expect(reopened.rawLine).toBeUndefined()
    expect(reopened.telemetryLine).toBeUndefined()
    expect(reopened.telemetryRecords).toBeUndefined()
    expect(markerOf(run, 'PHASE_RECORD_WRITTEN')).toHaveLength(1)
    expect(run.stdout.toLowerCase()).not.toContain('app.relaunch')
  })

  it('P0-D5 proves isolated fixture routing, model preservation, snapshots, and rollback metadata', () => {
    const run = runDemo('P0-D5')
    assertPassedDemo(run, 'P0-D5')

    const fixtureRouting = onlyStep(run, { step: 'fixture_routing' })
    expect(fixtureRouting).toMatchObject({
      realtimeHash: sha256(FIXTURES.realtimeDialogue),
      transcriptionHash: sha256(FIXTURES.inputTranscription),
      extractorHash: sha256(FIXTURES.memoryExtractor),
      personaHash: sha256(FIXTURES.persona),
    })

    const invalidDraft = onlyStep(run, { step: 'invalid_draft' })
    expect(invalidDraft).toMatchObject({
      field: 'realtimeDialogue',
      status: 'rejected',
      reason: 'cause=draft_invalid',
      activePreserved: true,
      versionPreserved: true,
      fingerprintPreserved: true,
    })
    expect(invalidDraft.activeVersionBefore).toBe(invalidDraft.activeVersionAfter)
    expect(invalidDraft.activeFingerprintBefore).toBe(invalidDraft.activeFingerprintAfter)

    const successfulProbe = onlyStep(run, { step: 'mock_probe', probe: 'success' })
    expect(successfulProbe).toMatchObject({
      result: 'mock_passed',
      source: 'simulator',
      reason: 'cause=all_configured_ids_observed',
    })

    const failedProbe = onlyStep(run, { step: 'mock_probe', probe: 'failure' })
    expect(failedProbe).toMatchObject({
      result: 'failed',
      source: 'simulator',
      reason: 'cause=mock_probe_failed',
      activePreserved: true,
      versionPreserved: true,
      fingerprintPreserved: true,
    })
    expect(failedProbe.activeVersionBefore).toBe(failedProbe.activeVersionAfter)
    expect(failedProbe.activeFingerprintBefore).toBe(failedProbe.activeFingerprintAfter)

    const snapshotBoundary = onlyStep(run, { step: 'snapshot_boundary' })
    expect(snapshotBoundary).toMatchObject({
      oldSession: 'retained',
      oldJob: 'retained',
      next: 'explicit',
    })

    const rollback = onlyStep(run, { step: 'rollback' })
    expect(rollback).toMatchObject({ operation: 'rollback', nonModelChanges: true })

    const output = `${run.stdout}\n${run.stderr}`
    for (const fixture of Object.values(FIXTURES)) {
      expect(output).not.toContain(fixture)
    }
    expect(markerOf(run, 'PHASE_RECORD_WRITTEN')).toHaveLength(1)
  })

  it('keeps the task root and sibling data while removing only an unretained successful child', () => {
    mkdirSync(join(TASK10_USER_DATA_ROOT, 'task10-contract-sentinel'), { recursive: true })
    const run = runDemo('P0-D1', { retainOnSuccess: false })
    const directory = assertPassedDemo(run, 'P0-D1', { expectRetained: false })

    expect(existsSync(directory)).toBe(false)
    expect(existsSync(TASK10_USER_DATA_ROOT)).toBe(true)
    expect(existsSync(join(TASK10_USER_DATA_ROOT, 'task10-contract-sentinel'))).toBe(true)
    expect(resolve(directory)).not.toBe(resolve(TASK10_USER_DATA_ROOT))
  })

  it('maps invalid user-data isolation to exit 2 without deleting the invalid-root sentinel', () => {
    mkdirSync(TASK10_USER_DATA_ROOT, { recursive: true })
    const invalidRoot = join(TASK10_USER_DATA_ROOT, 'task10-invalid-user-data-root')
    writeFileSync(invalidRoot, 'metadata-sentinel', 'utf8')

    const run = runCli('P0-D1', invalidRoot)
    expect(run.exitCode).toBe(2)
    expect(existsSync(invalidRoot)).toBe(true)
    expect(statSync(invalidRoot).isFile()).toBe(true)
  })
})

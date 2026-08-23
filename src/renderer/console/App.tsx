import * as React from 'react'
import { useEffect, useRef, useState } from 'react'

import type { ConsoleBridge } from '../../shared/bridge'
import type {
  ConsoleConfigDraftInput,
  ConsoleConfigPayload,
  ConsoleDiffConfirmation,
  ConsoleEventSummary,
  ConsoleEventsQuery,
  ConsoleLifecycleActionResult,
  ConsoleModuleObservation,
  ConsoleOverviewPayload,
  ConsoleModelsPayload,
  ConsoleModelDraftInput,
  ConsolePhaseTestsPayload,
  ConsoleResponse,
  PhaseTestPhase,
  PhaseTestRecord,
} from '../../shared/console-types'
import type {
  MirrorEvent,
  ModuleId,
  SimulatorCommand,
  SimulatorResult,
} from '../../shared/types'

const PAGES = ['Overview', 'Simulator', 'Events', 'Phase Tests', 'Config', 'Models'] as const
const MODULES = [
  'app',
  'openai',
  'wake',
  'audio',
  'camera',
  'identity',
  'memory',
  'avatar',
  'lighting',
  'fog',
  'music',
  'sqlite',
  'config',
  'telemetry',
] as const satisfies readonly ModuleId[]
const SIMULATOR_COMMANDS = [
  'wake',
  'cloud_failure',
  'cloud_recovery',
  'camera_result',
  'avatar_state',
  'scene_result',
  'sqlite_failure',
  'sleep',
] as const
const EVENT_COLUMNS = [
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
const EVENT_STATUSES = ['success', 'degraded', 'failed', 'info'] as const
const EVENT_SOURCES = ['runtime', 'simulator', 'contract_test'] as const
const EVENT_PAGE_LIMIT = 50

type SimulatorCommandName = (typeof SIMULATOR_COMMANDS)[number]
type EventModuleFilter = 'all' | ModuleId
type EventStatusFilter = 'all' | (typeof EVENT_STATUSES)[number]
type EventSourceFilter = 'all' | (typeof EVENT_SOURCES)[number]

const SIMULATOR_COMMAND_VALUES: Readonly<Record<SimulatorCommandName, SimulatorCommand>> = {
  wake: { type: 'wake' },
  cloud_failure: { type: 'cloud_failure' },
  cloud_recovery: { type: 'cloud_recovery' },
  camera_result: { type: 'camera_result', faces: 0 },
  avatar_state: { type: 'avatar_state', state: 'idle' },
  scene_result: { type: 'scene_result', sceneId: 'demo_scene', status: 'success' },
  sqlite_failure: { type: 'sqlite_failure' },
  sleep: { type: 'sleep' },
}

export const CONSOLE_UI_CONTRACT = {
  tabs: PAGES,
  overview: {
    readinessLabel: 'Mock / simulator',
    tccLabel: 'TCC: not_checked',
  },
  lifecycle: {
    controls: ['Start Conversation', 'Disconnect'] as const,
    outcomeCopy: 'Lifecycle action outcomes contain metadata only: action, status, and reason.',
  },
  simulator: {
    disabledCopy: 'Developer Mode is disabled for simulator controls until Main authorizes them.',
    commands: SIMULATOR_COMMANDS,
  },
  events: {
    columns: EVENT_COLUMNS,
    filters: ['module', 'status', 'source'] as const,
    pagination: ['beforeSequence', 'nextBeforeSequence'] as const,
  },
  phaseTests: {
    emptyCopy: 'No records yet for the selected phase.',
    ownershipCopy: 'Phase exit owns demo execution and record production.',
    resultLabels: {
      passed: 'Passed (real evidence)',
      failed: 'Failed',
      mock_passed: 'Mock passed',
      not_executed: 'Not executed',
    },
  },
  config: {
    safeFields: [
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
    ] as const,
    actions: ['saveDraft', 'testDraft', 'publish', 'rollback'] as const,
  },
  models: {
    roles: ['realtimeDialogue', 'inputTranscription', 'memoryExtractor'] as const,
    cardLabels: ['Realtime Dialogue', 'Input Transcription', 'Memory Extractor'] as const,
    sections: ['Draft', 'Published Active', 'Runtime loaded', 'Previous'] as const,
    draftInputs: ['realtimeDialogue', 'inputTranscription', 'memoryExtractor'] as const,
  },
} as const

interface ConsoleFailure {
  readonly error: string
  readonly reason: string
}

type OverviewState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly value: ConsoleOverviewPayload }
  | ({ readonly status: 'failure' } & ConsoleFailure)

interface EventsStatePage {
  readonly events: readonly ConsoleEventSummary[]
  readonly nextBeforeSequence: number | null
}

type EventsState =
  | ({ readonly status: 'loading' } & EventsStatePage)
  | ({ readonly status: 'success' } & EventsStatePage)
  | ({ readonly status: 'failure' } & EventsStatePage & ConsoleFailure)

type LifecycleActionName = 'startConversation' | 'disconnect'

type LifecycleActionState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly action: LifecycleActionName }
  | {
      readonly status: 'success'
      readonly action: LifecycleActionName
      readonly result: ConsoleLifecycleActionResult
    }
  | ({ readonly status: 'failure'; readonly action: LifecycleActionName } & ConsoleFailure)

export type PhaseTestsViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly value: ConsolePhaseTestsPayload }
  | ({ readonly status: 'failure' } & ConsoleFailure)

type SimulatorState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly command: SimulatorCommandName }
  | {
      readonly status: 'success'
      readonly command: SimulatorCommandName
      readonly result: SimulatorResult
    }
  | ({ readonly status: 'failure'; readonly command: SimulatorCommandName } & ConsoleFailure)

type ConfigState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly value: ConsoleConfigPayload }
  | ({ readonly status: 'failure' } & ConsoleFailure)

type ModelsState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly value: ConsoleModelsPayload }
  | ({ readonly status: 'failure' } & ConsoleFailure)

const BRIDGE_FAILURE: ConsoleFailure = {
  error: 'console_request_rejected',
  reason: 'cause=console_data_plane_unavailable',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isConsoleBridge(value: unknown): value is ConsoleBridge {
  if (!isRecord(value)) return false
  return typeof value.notifyReady === 'function'
    && typeof value.getSnapshot === 'function'
    && typeof value.onSnapshot === 'function'
    && typeof value.simulate === 'function'
    && typeof value.startConversation === 'function'
    && typeof value.disconnect === 'function'
    && typeof value.getOverview === 'function'
    && typeof value.getEvents === 'function'
    && typeof value.getConfig === 'function'
    && typeof value.getModels === 'function'
    && typeof value.saveModelDraft === 'function'
    && typeof value.saveDraft === 'function'
    && typeof value.testDraft === 'function'
    && typeof value.publish === 'function'
    && typeof value.rollback === 'function'
    && typeof value.createNextRuntimeSnapshots === 'function'
    && typeof value.getPhaseTests === 'function'
}

function readConsoleBridge(): ConsoleBridge | null {
  const candidate = window.magicMirror
  return isConsoleBridge(candidate) ? candidate : null
}

function displayValue(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === '' ? '—' : String(value)
}

function statusClass(status: string): string {
  if (status === 'success' || status === 'ready') return 'console__status console__status--success'
  if (status === 'degraded') return 'console__status console__status--degraded'
  if (status === 'failed') return 'console__status console__status--failed'
  if (status === 'loading') return 'console__status console__status--loading'
  if (status === 'not_implemented') return 'console__status console__status--muted'
  return 'console__status'
}

function buildEventsQuery(
  module: EventModuleFilter,
  status: EventStatusFilter,
  source: EventSourceFilter,
  beforeSequence?: number,
): ConsoleEventsQuery {
  const query: {
    limit: number
    beforeSequence?: number
    module?: ModuleId
    status?: MirrorEvent['status']
    source?: NonNullable<MirrorEvent['source']>
  } = { limit: EVENT_PAGE_LIMIT }

  if (beforeSequence !== undefined) query.beforeSequence = beforeSequence
  if (module !== 'all') query.module = module
  if (status !== 'all') query.status = status
  if (source !== 'all') query.source = source
  return query
}

function eventSummaryKey(event: ConsoleEventSummary): string {
  return [
    event.time,
    event.module,
    event.event,
    event.status,
    event.duration_ms,
    event.error_code,
    event.session_id,
    event.scene_id,
    event.reason,
    event.source,
  ].map((value) => String(value ?? '')).join('\u001f')
}

function appendUniqueEvents(
  existing: readonly ConsoleEventSummary[],
  incoming: readonly ConsoleEventSummary[],
): readonly ConsoleEventSummary[] {
  const seen = new Set(existing.map(eventSummaryKey))
  const appended = incoming.filter((event) => {
    const key = eventSummaryKey(event)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return [...existing, ...appended]
}

function requestFailure(response: ConsoleResponse<unknown>): ConsoleFailure | null {
  return response.ok ? null : { error: response.error, reason: response.reason }
}

function OverviewField({
  label,
  value,
  detail,
}: {
  readonly label: string
  readonly value: string
  readonly detail?: string
}): React.JSX.Element {
  return (
    <div className="console__overview-field">
      <span className="console__label">{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  )
}

function MetadataEntry({
  name,
  value,
  valueClassName,
}: {
  readonly name: string
  readonly value: string | number | undefined
  readonly valueClassName?: string
}): React.JSX.Element | null {
  if (value === undefined) return null
  return (
    <div>
      <dt>{name}</dt>
      <dd className={valueClassName}>{String(value)}</dd>
    </div>
  )
}

function phaseTestResultClass(result: PhaseTestRecord['result']): string {
  if (result === 'passed') return 'console__success'
  if (result === 'failed') return 'console__status console__status--failed'
  if (result === 'mock_passed') return 'console__status console__status--mock'
  return 'console__muted console__status--not-executed'
}

function BoundedSummary({ summary }: { readonly summary: ConsoleEventSummary }): React.JSX.Element {
  return (
    <dl className="console__summary-fields">
      <MetadataEntry name="time" value={summary.time} />
      <MetadataEntry name="event" value={summary.event} />
      <MetadataEntry name="status" value={summary.status} />
      <MetadataEntry name="duration_ms" value={summary.duration_ms} />
      <MetadataEntry name="error_code" value={summary.error_code} />
      <MetadataEntry name="session_id" value={summary.session_id} />
      <MetadataEntry name="scene_id" value={summary.scene_id} />
      <MetadataEntry name="reason" value={summary.reason} />
      <MetadataEntry name="source" value={summary.source} />
    </dl>
  )
}

function ModuleSummary({
  label,
  summary,
}: {
  readonly label: string
  readonly summary: ConsoleEventSummary | null
}): React.JSX.Element {
  return (
    <div className="console__module-summary">
      <span className="console__label">{label}</span>
      {summary ? <BoundedSummary summary={summary} /> : <span className="console__muted">—</span>}
    </div>
  )
}

function ModuleCard({
  module,
  observation,
}: {
  readonly module: ModuleId
  readonly observation?: ConsoleModuleObservation
}): React.JSX.Element {
  const moduleStatus = observation?.status ?? 'not_implemented'
  const readinessLabel = observation?.readiness === 'not_checked'
    ? 'Not checked'
    : CONSOLE_UI_CONTRACT.overview.readinessLabel

  return (
    <li className="console__module-card">
      <div className="console__module-heading">
        <strong>{module}</strong>
        <span className={statusClass(moduleStatus)}>{moduleStatus}</span>
      </div>
      <span className="console__module-readiness">{readinessLabel}</span>
      <div className="console__module-summaries">
        <ModuleSummary label="last success" summary={observation?.lastSuccess ?? null} />
        <ModuleSummary label="last error" summary={observation?.lastError ?? null} />
        <ModuleSummary label="last fallback" summary={observation?.lastFallback ?? null} />
      </div>
    </li>
  )
}

function OverviewPanel({ state }: { readonly state: OverviewState }): React.JSX.Element {
  const overview = state.status === 'success' ? state.value : null
  const audioTcc = overview?.audioTcc ?? 'not_checked'
  const cameraTcc = overview?.cameraTcc ?? 'not_checked'

  return (
    <section className="console__panel" aria-labelledby="console-overview">
      <div className="console__panel-heading">
        <div>
          <p className="console__eyebrow">Observation</p>
          <h2 id="console-overview">Overview</h2>
        </div>
        <span className="console__status console__status--mock">{CONSOLE_UI_CONTRACT.overview.readinessLabel}</span>
      </div>

      {state.status === 'loading' ? (
        <p className="console__request-state" aria-live="polite">Loading Overview…</p>
      ) : null}
      {state.status === 'failure' ? (
        <p className="console__fault" role="status">Overview failed: {state.error}; {state.reason}</p>
      ) : null}

      <div className="console__overview-grid">
        <OverviewField label="lifecycle" value={displayValue(overview?.lifecycle)} />
        <OverviewField label="appVersion" value={displayValue(overview?.appVersion)} />
        <OverviewField label="buildCommit" value={displayValue(overview?.buildCommit)} />
        <OverviewField label="configVersion" value={displayValue(overview?.configVersion)} />
        <OverviewField label="identityStatus" value={displayValue(overview?.identityStatus)} />
        <OverviewField label="realtimeSessionId" value={displayValue(overview?.realtimeSessionId)} />
        <OverviewField label="sessionGeneration" value={displayValue(overview?.sessionGeneration)} />
        <OverviewField
          label="uptime"
          value={overview ? `${overview.uptimeSeconds}s` : '—'}
        />
        <OverviewField
          label="developerMode"
          value={overview ? (overview.developerMode ? 'enabled' : 'disabled') : '—'}
          detail={overview?.developerModeSource}
        />
        <OverviewField label="audioTcc" value={`TCC: ${audioTcc}`} />
        <OverviewField label="cameraTcc" value={`TCC: ${cameraTcc}`} />
      </div>

      <p className="console__muted">Module health is informational and never gates conversation.</p>
      <ul className="console__modules" aria-label="Module health">
        {MODULES.map((module) => (
          <ModuleCard key={module} module={module} observation={overview?.modules[module]} />
        ))}
      </ul>
    </section>
  )
}

function LifecycleControls({
  bridgeAvailable,
  state,
  onStartConversation,
  onDisconnect,
}: {
  readonly bridgeAvailable: boolean
  readonly state: LifecycleActionState
  readonly onStartConversation: () => void
  readonly onDisconnect: () => void
}): React.JSX.Element {
  const controlsDisabled = !bridgeAvailable || state.status === 'loading'

  return (
    <section className="console__panel" aria-labelledby="console-lifecycle">
      <div className="console__panel-heading">
        <div>
          <p className="console__eyebrow">Conversation lifecycle</p>
          <h2 id="console-lifecycle">Conversation Controls</h2>
        </div>
        <span className={bridgeAvailable ? 'console__status console__status--success' : 'console__status console__status--disabled'}>
          {bridgeAvailable ? 'Ready' : 'Unavailable'}
        </span>
      </div>

      <p className="console__muted">{CONSOLE_UI_CONTRACT.lifecycle.outcomeCopy}</p>
      <div className="console__command-list" aria-label="Conversation lifecycle controls">
        <button type="button" disabled={controlsDisabled} onClick={onStartConversation}>
          Start Conversation
        </button>
        <button type="button" disabled={controlsDisabled} onClick={onDisconnect}>
          Disconnect
        </button>
      </div>

      {state.status === 'loading' ? (
        <p className="console__result console__result--loading" role="status" aria-live="polite">
          Running {state.action}…
        </p>
      ) : null}
      {state.status === 'success' ? (
        <div className="console__result console__result--success" role="status" aria-live="polite">
          <strong>Lifecycle action: {state.result.action}</strong>
          <span>Status: {state.result.status}</span>
          <span>Reason: {state.result.reason}</span>
        </div>
      ) : null}
      {state.status === 'failure' ? (
        <p className="console__result console__result--failed" role="status" aria-live="polite">
          Lifecycle action failed: {state.error}; {state.reason}
        </p>
      ) : null}
    </section>
  )
}

function SimulatorPanel({
  developerMode,
  bridgeAvailable,
  state,
  onSimulate,
}: {
  readonly developerMode: boolean
  readonly bridgeAvailable: boolean
  readonly state: SimulatorState
  readonly onSimulate: (command: SimulatorCommand) => void
}): React.JSX.Element {
  const developerModeDisabled = !developerMode
  const controlsDisabled = developerModeDisabled || !bridgeAvailable || state.status === 'loading'

  return (
    <section className="console__panel" aria-labelledby="console-simulator">
      <div className="console__panel-heading">
        <div>
          <p className="console__eyebrow">Main-owned controls</p>
          <h2 id="console-simulator">Simulator</h2>
        </div>
        <span className={developerMode && bridgeAvailable ? 'console__status console__status--success' : 'console__status console__status--disabled'}>
          {developerMode && bridgeAvailable ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      {developerModeDisabled ? (
        <p className="console__notice">{CONSOLE_UI_CONTRACT.simulator.disabledCopy}</p>
      ) : null}
      {!developerModeDisabled && !bridgeAvailable ? (
        <p className="console__fault" role="status">Simulator unavailable: {BRIDGE_FAILURE.error}; {BRIDGE_FAILURE.reason}</p>
      ) : null}
      {developerMode && bridgeAvailable ? (
        <p className="console__muted">Commands use fixed metadata-only defaults and remain non-production controls.</p>
      ) : null}

      <div className="console__command-list" aria-label="Simulator commands">
        {CONSOLE_UI_CONTRACT.simulator.commands.map((commandName) => (
          <button
            key={commandName}
            type="button"
            disabled={controlsDisabled}
            onClick={() => onSimulate(SIMULATOR_COMMAND_VALUES[commandName])}
          >
            {commandName}
          </button>
        ))}
      </div>

      {state.status === 'loading' ? (
        <p className="console__result console__result--loading" role="status" aria-live="polite">
          Running {state.command}…
        </p>
      ) : null}
      {state.status === 'success' ? (
        <div className="console__result console__result--success" role="status" aria-live="polite">
          <strong>Simulator result: {state.result.op}</strong>
          {state.result.lifecycleEvent ? <span>Lifecycle event: {state.result.lifecycleEvent}</span> : null}
        </div>
      ) : null}
      {state.status === 'failure' ? (
        <p className="console__result console__result--failed" role="status" aria-live="polite">
          Simulator failed: {state.error}; {state.reason}
        </p>
      ) : null}
    </section>
  )
}

function toModuleFilter(value: string): EventModuleFilter {
  return value === 'all' || MODULES.includes(value as ModuleId) ? value as EventModuleFilter : 'all'
}

function toStatusFilter(value: string): EventStatusFilter {
  return value === 'all' || EVENT_STATUSES.includes(value as (typeof EVENT_STATUSES)[number])
    ? value as EventStatusFilter
    : 'all'
}

function toSourceFilter(value: string): EventSourceFilter {
  return value === 'all' || EVENT_SOURCES.includes(value as (typeof EVENT_SOURCES)[number])
    ? value as EventSourceFilter
    : 'all'
}

function EventsPanel({
  state,
  moduleFilter,
  statusFilter,
  sourceFilter,
  onModuleFilterChange,
  onStatusFilterChange,
  onSourceFilterChange,
  onLoadOlder,
  bridgeAvailable,
}: {
  readonly state: EventsState
  readonly moduleFilter: EventModuleFilter
  readonly statusFilter: EventStatusFilter
  readonly sourceFilter: EventSourceFilter
  readonly onModuleFilterChange: (value: EventModuleFilter) => void
  readonly onStatusFilterChange: (value: EventStatusFilter) => void
  readonly onSourceFilterChange: (value: EventSourceFilter) => void
  readonly onLoadOlder: () => void
  readonly bridgeAvailable: boolean
}): React.JSX.Element {
  const loading = state.status === 'loading'
  const canLoadOlder = bridgeAvailable && !loading && state.nextBeforeSequence !== null

  return (
    <section className="console__panel" aria-labelledby="console-events">
      <div className="console__panel-heading">
        <div>
          <p className="console__eyebrow">Metadata only</p>
          <h2 id="console-events">Events</h2>
        </div>
        <span className="console__status">RAM page</span>
      </div>

      {loading ? <p className="console__request-state" aria-live="polite">Loading Events…</p> : null}
      {state.status === 'success' ? (
        <p className="console__success" role="status">Loaded {state.events.length} metadata events.</p>
      ) : null}
      {state.status === 'failure' ? (
        <p className="console__fault" role="status">Events failed: {state.error}; {state.reason}</p>
      ) : null}

      <div className="console__filters" aria-label="Event filters">
        <label>
          <span>module</span>
          <select
            aria-label="module"
            value={moduleFilter}
            onChange={(event) => onModuleFilterChange(toModuleFilter(event.currentTarget.value))}
          >
            <option value="all">All</option>
            {MODULES.map((module) => <option key={module} value={module}>{module}</option>)}
          </select>
        </label>
        <label>
          <span>status</span>
          <select
            aria-label="status"
            value={statusFilter}
            onChange={(event) => onStatusFilterChange(toStatusFilter(event.currentTarget.value))}
          >
            <option value="all">All</option>
            {EVENT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
        <label>
          <span>source</span>
          <select
            aria-label="source"
            value={sourceFilter}
            onChange={(event) => onSourceFilterChange(toSourceFilter(event.currentTarget.value))}
          >
            <option value="all">All</option>
            {EVENT_SOURCES.map((source) => <option key={source} value={source}>{source}</option>)}
          </select>
        </label>
      </div>

      <div className="console__table-wrap">
        <table>
          <thead>
            <tr>
              {CONSOLE_UI_CONTRACT.events.columns.map((column) => <th key={column}>{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {state.events.length === 0 ? (
              <tr>
                <td colSpan={CONSOLE_UI_CONTRACT.events.columns.length} className="console__empty">
                  {loading ? 'Loading events…' : 'No events loaded.'}
                </td>
              </tr>
            ) : state.events.map((event, index) => (
              <tr key={`${eventSummaryKey(event)}-${index}`}>
                <td>{event.time}</td>
                <td>{event.module}</td>
                <td>{event.event}</td>
                <td>{event.status}</td>
                <td>{event.duration_ms === undefined ? '—' : `${event.duration_ms} ms`}</td>
                <td>{displayValue(event.error_code)}</td>
                <td>{displayValue(event.session_id)}</td>
                <td>{displayValue(event.reason)}</td>
                <td>{displayValue(event.source)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="console__pagination">
        <span>beforeSequence: cursor; nextBeforeSequence: {displayValue(state.nextBeforeSequence)}</span>
        <button type="button" disabled={!canLoadOlder} onClick={onLoadOlder}>Load older events</button>
      </div>
    </section>
  )
}

export function PhaseTestsPanel({
  state,
  selectedPhase,
}: {
  readonly state: PhaseTestsViewState
  readonly selectedPhase?: PhaseTestPhase
}): React.JSX.Element {
  const payload = state.status === 'success' ? state.value : null
  const latest = payload?.latest ?? null
  const phase = payload?.phase ?? selectedPhase ?? '1'

  return (
    <section className="console__panel" aria-labelledby="console-phase-tests">
      <div className="console__panel-heading">
        <div>
          <p className="console__eyebrow">Validated metadata only</p>
          <h2 id="console-phase-tests">Phase Tests</h2>
        </div>
        <span className="console__status">Read-only</span>
      </div>

      <p className="console__muted">{CONSOLE_UI_CONTRACT.phaseTests.ownershipCopy}</p>
      <p className="console__muted">Selected phase: Phase {phase}</p>
      {state.status === 'loading' ? (
        <p className="console__request-state" aria-live="polite">Loading Phase Tests…</p>
      ) : null}
      {state.status === 'failure' ? (
        <p className="console__fault" role="status">
          Phase Tests failed: {state.error}; {state.reason}
        </p>
      ) : null}
      {state.status === 'success' && latest === null ? (
        <p className="console__notice" role="status">No Phase {phase} records yet.</p>
      ) : null}
      {latest !== null ? (
        <div className="console__phase-test-record" role="status">
          <p className="console__muted">Latest validated Phase {phase} record</p>
          <dl className="console__summary-fields">
            <MetadataEntry name="phase" value={latest.phase} />
            <MetadataEntry name="demoId" value={latest.demoId} />
            <MetadataEntry name="build" value={latest.build} />
            <MetadataEntry name="time" value={latest.time} />
            <MetadataEntry
              name="result"
              value={CONSOLE_UI_CONTRACT.phaseTests.resultLabels[latest.result]}
              valueClassName={phaseTestResultClass(latest.result)}
            />
            <MetadataEntry name="note" value={latest.note} />
          </dl>
        </div>
      ) : null}
    </section>
  )
}

function safeDraftFromConfig(value: ConsoleConfigPayload['draft']): ConsoleConfigDraftInput {
  return {
    personaName: value.personaName,
    voice: value.voice,
    idleSeconds: value.idleSeconds,
    wake: { ...value.wake },
    faceModel: { ...value.faceModel },
    assets: { ...value.assets },
    adapters: { ...value.adapters },
  }
}

function confirmationFromDiff(
  diff: ConsoleConfigPayload['publishDiff'],
): ConsoleDiffConfirmation {
  return {
    operation: diff.operation,
    expectedActiveVersion: diff.expectedActiveVersion,
    changedPaths: diff.changed.map((entry) => entry.path).slice().sort(),
    nonModelChanges: diff.nonModelChanges,
    confirmationDigest: diff.confirmationDigest,
  }
}

interface ConfigPanelProps {
  readonly state: ConfigState
  readonly bridge: ConsoleBridge | null
  readonly bridgeAvailable: boolean
  readonly onChanged: () => void
}

export function ConfigPanel({
  state,
  bridge,
  bridgeAvailable,
  onChanged,
}: ConfigPanelProps): React.JSX.Element {
  const config = state.status === 'success' ? state.value : null
  const [draft, setDraft] = useState<ConsoleConfigDraftInput | null>(
    config === null ? null : safeDraftFromConfig(config.draft),
  )

  useEffect(() => {
    if (config !== null) setDraft(safeDraftFromConfig(config.draft))
  }, [config])

  const disabled = !bridgeAvailable || bridge === null || draft === null
  const updateDraft = (update: (current: ConsoleConfigDraftInput) => ConsoleConfigDraftInput): void => {
    setDraft((current) => current === null ? current : update(current))
  }
  const run = async (action: () => Promise<unknown>): Promise<void> => {
    try {
      await action()
      onChanged()
    } catch {
      onChanged()
    }
  }

  return (
    <section className="console__panel" aria-labelledby="console-config">
      <div className="console__panel-heading">
        <div>
          <p className="console__eyebrow">Main-owned safe fields</p>
          <h2 id="console-config">Config</h2>
        </div>
        <span className="console__status">Safe Draft</span>
      </div>

      {state.status === 'loading' ? <p className="console__request-state">Loading Config…</p> : null}
      {state.status === 'failure' ? (
        <p className="console__fault" role="status">Config failed: {state.error}; {state.reason}</p>
      ) : null}
      {config === null ? <p className="console__muted">Config is unavailable until Main is ready.</p> : null}

      <div className="console__config-grid">
        <fieldset>
          <legend>Active</legend>
          <dl className="console__summary-fields">
            <MetadataEntry name="configVersion" value={config?.active.configVersion} />
            <MetadataEntry name="personaName" value={config?.active.personaName} />
            <MetadataEntry name="voice" value={config?.active.voice} />
            <MetadataEntry name="idleSeconds" value={config?.active.idleSeconds} />
            <MetadataEntry name="wake" value={config?.active.wake.phrase} />
            <MetadataEntry name="faceModel" value={config?.active.faceModel.detectorId} />
            <MetadataEntry name="assets" value={config?.active.assets.offlineLoopVideo} />
            <MetadataEntry name="adapters" value={config?.active.adapters.lighting} />
          </dl>
        </fieldset>

        <fieldset>
          <legend>Previous</legend>
          <dl className="console__summary-fields">
            <MetadataEntry name="configVersion" value={config?.previous.configVersion} />
            <MetadataEntry name="personaName" value={config?.previous.personaName} />
            <MetadataEntry name="voice" value={config?.previous.voice} />
            <MetadataEntry name="idleSeconds" value={config?.previous.idleSeconds} />
            <MetadataEntry name="wake" value={config?.previous.wake.phrase} />
            <MetadataEntry name="faceModel" value={config?.previous.faceModel.detectorId} />
            <MetadataEntry name="assets" value={config?.previous.assets.offlineLoopVideo} />
            <MetadataEntry name="adapters" value={config?.previous.adapters.lighting} />
          </dl>
        </fieldset>

        <fieldset>
          <legend>Draft safe fields</legend>
          <label>
            <span>personaName</span>
            <input
              type="text"
              value={draft?.personaName ?? ''}
              disabled={disabled}
              onChange={(event) => updateDraft((current) => ({ ...current, personaName: event.currentTarget.value }))}
            />
          </label>
          <label>
            <span>voice</span>
            <input
              type="text"
              value={draft?.voice ?? ''}
              disabled={disabled}
              onChange={(event) => updateDraft((current) => ({ ...current, voice: event.currentTarget.value }))}
            />
          </label>
          <label>
            <span>idleSeconds</span>
            <input
              type="number"
              value={draft?.idleSeconds ?? ''}
              disabled={disabled}
              onChange={(event) => updateDraft((current) => ({ ...current, idleSeconds: Number(event.currentTarget.value) }))}
            />
          </label>
          <label>
            <span>wake.phrase</span>
            <input
              type="text"
              value={draft?.wake.phrase ?? ''}
              disabled={disabled}
              onChange={(event) => updateDraft((current) => ({ ...current, wake: { ...current.wake, phrase: event.currentTarget.value } }))}
            />
          </label>
          <label>
            <span>wake.modelVersion</span>
            <input
              type="text"
              value={draft?.wake.modelVersion ?? ''}
              disabled={disabled}
              onChange={(event) => updateDraft((current) => ({ ...current, wake: { ...current.wake, modelVersion: event.currentTarget.value } }))}
            />
          </label>
          <label>
            <span>faceModel.detectorId</span>
            <input
              type="text"
              value={draft?.faceModel.detectorId ?? ''}
              disabled={disabled}
              onChange={(event) => updateDraft((current) => ({ ...current, faceModel: { ...current.faceModel, detectorId: event.currentTarget.value } }))}
            />
          </label>
          <label>
            <span>faceModel.recognizerId</span>
            <input
              type="text"
              value={draft?.faceModel.recognizerId ?? ''}
              disabled={disabled}
              onChange={(event) => updateDraft((current) => ({ ...current, faceModel: { ...current.faceModel, recognizerId: event.currentTarget.value } }))}
            />
          </label>
          <label>
            <span>assets.offlineLoopVideo</span>
            <input
              type="text"
              value={draft?.assets.offlineLoopVideo ?? ''}
              disabled={disabled}
              onChange={(event) => updateDraft((current) => ({ ...current, assets: { ...current.assets, offlineLoopVideo: event.currentTarget.value } }))}
            />
          </label>
          <label>
            <span>assets.avatarDir</span>
            <input
              type="text"
              value={draft?.assets.avatarDir ?? ''}
              disabled={disabled}
              onChange={(event) => updateDraft((current) => ({ ...current, assets: { ...current.assets, avatarDir: event.currentTarget.value } }))}
            />
          </label>
          <label>
            <span>assets.musicDir</span>
            <input
              type="text"
              value={draft?.assets.musicDir ?? ''}
              disabled={disabled}
              onChange={(event) => updateDraft((current) => ({ ...current, assets: { ...current.assets, musicDir: event.currentTarget.value } }))}
            />
          </label>
          <label>
            <span>adapters.lighting</span>
            <select
              value={draft?.adapters.lighting ?? 'mock'}
              disabled={disabled}
              onChange={(event) => updateDraft((current) => ({ ...current, adapters: { ...current.adapters, lighting: event.currentTarget.value as 'mock' | 'physical' } }))}
            >
              <option value="mock">mock</option>
              <option value="physical">physical</option>
            </select>
          </label>
          <label>
            <span>adapters.fog</span>
            <select
              value={draft?.adapters.fog ?? 'mock'}
              disabled={disabled}
              onChange={(event) => updateDraft((current) => ({ ...current, adapters: { ...current.adapters, fog: event.currentTarget.value as 'mock' | 'physical' } }))}
            >
              <option value="mock">mock</option>
              <option value="physical">physical</option>
            </select>
          </label>
          <label>
            <span>adapters.music</span>
            <select
              value={draft?.adapters.music ?? 'mock'}
              disabled={disabled}
              onChange={(event) => updateDraft((current) => ({ ...current, adapters: { ...current.adapters, music: event.currentTarget.value as 'mock' | 'physical' } }))}
            >
              <option value="mock">mock</option>
              <option value="physical">physical</option>
            </select>
          </label>
        </fieldset>
      </div>

      <div className="console__action-row">
        <button type="button" disabled={disabled} onClick={() => bridge && draft && void run(() => bridge.saveDraft(draft))}>Save Draft</button>
        <button type="button" disabled={!bridgeAvailable || bridge === null} onClick={() => bridge && void run(() => bridge.testDraft())}>Test Draft</button>
      </div>

      {config?.draftTest ? (
        <p className={config.draftTest.result === 'mock_passed' ? 'console__success' : 'console__fault'} role="status">
          {config.draftTest.result === 'mock_passed' ? 'Mock passed' : 'Mock failed'} · source=simulator · {config.draftTest.reason}
        </p>
      ) : null}

      <div className="console__diff-grid">
        {([
          ['Publish', config?.publishDiff],
          ['Rollback', config?.rollbackDiff],
        ] as const).map(([label, diff]) => (
          <fieldset key={label}>
            <legend>{label}</legend>
            <strong>changed paths</strong>
            <ul className="console__path-list">
              {(diff?.changed ?? []).map((entry) => (
                <li key={`${label}-${entry.path}`}>{entry.path} · {entry.kind} · {entry.change}</li>
              ))}
            </ul>
            <span>nonModelChanges: {diff?.nonModelChanges ? 'true' : 'false'}</span>
            <span>complete confirmation required</span>
            <button
              type="button"
              disabled={bridge === null || diff === undefined}
              onClick={() => bridge && diff && void run(() => label === 'Publish'
                ? bridge.publish(confirmationFromDiff(diff))
                : bridge.rollback(confirmationFromDiff(diff)))}
            >
              {label}
            </button>
          </fieldset>
        ))}
      </div>
    </section>
  )
}

interface ModelsPanelProps {
  readonly state: ModelsState
  readonly bridge: ConsoleBridge | null
  readonly bridgeAvailable: boolean
  readonly onChanged: () => void
}

export function ModelsPanel({
  state,
  bridge,
  bridgeAvailable,
  onChanged,
}: ModelsPanelProps): React.JSX.Element {
  const payload = state.status === 'success' ? state.value : null
  const [draft, setDraft] = useState<ConsoleModelDraftInput>({
    realtimeDialogue: '',
    inputTranscription: '',
    memoryExtractor: '',
  })

  useEffect(() => {
    if (payload === null) return
    const find = (role: string): string => {
      const card = payload.cards.find((candidate) => candidate.role === role)
      return card?.draft.modelId ?? ''
    }
    setDraft({
      realtimeDialogue: find('realtimeDialogue'),
      inputTranscription: find('inputTranscription'),
      memoryExtractor: find('memoryExtractor'),
    })
  }, [payload?.cards])

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    try {
      await action()
      onChanged()
    } catch {
      onChanged()
    }
  }

  const cards = payload?.cards ?? []
  const cardFor = (role: string) => cards.find((card) => card.role === role)
  const slotText = (role: string, section: 'draft' | 'publishedActive' | 'runtimeLoaded' | 'previous'): string => {
    const card = cardFor(role)
    return card === undefined ? '—' : card[section].modelId
  }

  return (
    <section className="console__panel" aria-labelledby="console-models">
      <div className="console__panel-heading">
        <div>
          <p className="console__eyebrow">Console-only configured roles</p>
          <h2 id="console-models">Models</h2>
        </div>
        <span className="console__status console__status--mock">Mock / simulator</span>
      </div>

      {state.status === 'loading' ? <p className="console__request-state">Loading Models…</p> : null}
      {state.status === 'failure' ? (
        <p className="console__fault" role="status">Models failed: {state.error}; {state.reason}</p>
      ) : null}

      <p className="console__muted">Draft values are bounded inputs; only an explicit next session/job action creates simulated runtime evidence.</p>
      <div className="console__model-draft-form">
        <label>
          <span>realtimeDialogue</span>
          <input type="text" value={draft.realtimeDialogue} disabled={!bridgeAvailable || bridge === null} onChange={(event) => setDraft((current) => ({ ...current, realtimeDialogue: event.currentTarget.value }))} />
        </label>
        <label>
          <span>inputTranscription</span>
          <input type="text" value={draft.inputTranscription} disabled={!bridgeAvailable || bridge === null} onChange={(event) => setDraft((current) => ({ ...current, inputTranscription: event.currentTarget.value }))} />
        </label>
        <label>
          <span>memoryExtractor</span>
          <input type="text" value={draft.memoryExtractor} disabled={!bridgeAvailable || bridge === null} onChange={(event) => setDraft((current) => ({ ...current, memoryExtractor: event.currentTarget.value }))} />
        </label>
        <button
          type="button"
          disabled={!bridgeAvailable || bridge === null}
          onClick={() => bridge && void run(() => bridge.saveModelDraft({
            realtimeDialogue: draft.realtimeDialogue,
            inputTranscription: draft.inputTranscription,
            memoryExtractor: draft.memoryExtractor,
          }))}
        >Save Model Draft</button>
      </div>

      <div className="console__model-cards">
        {CONSOLE_UI_CONTRACT.models.roles.map((role, index) => {
          const label = CONSOLE_UI_CONTRACT.models.cardLabels[index]
          const card = cardFor(role)
          const pending = card?.pending ?? (role === 'memoryExtractor' ? 'next_job' : 'next_session')
          return (
            <article className="console__model-card" key={role}>
              <h3>{label}</h3>
              <dl className="console__summary-fields">
                <MetadataEntry name="Draft" value={slotText(role, 'draft')} />
                <MetadataEntry name="Published Active" value={slotText(role, 'publishedActive')} />
                <MetadataEntry name="Runtime loaded" value={slotText(role, 'runtimeLoaded')} />
                <MetadataEntry name="Previous" value={slotText(role, 'previous')} />
                <MetadataEntry name="pending" value={pending} />
              </dl>
            </article>
          )
        })}
      </div>

      <div className="console__runtime-evidence">
        <strong>Runtime loaded</strong>
        <span>current: {payload?.runtime.current === null || payload === null ? '—' : 'simulator'}</span>
        <span>old: {payload?.runtime.old === null || payload === null ? '—' : 'simulator'}</span>
        <span>new: {payload?.runtime.new === null || payload === null ? '—' : 'simulator'}</span>
        <span>pending next session / next job</span>
        <button type="button" disabled={!bridgeAvailable || bridge === null} onClick={() => bridge && void run(() => bridge.createNextRuntimeSnapshots())}>Create next mock session/job</button>
      </div>

      {payload?.latestTest ? (
        <p
          className={payload.latestTest.result === 'mock_passed' ? 'console__success' : 'console__fault'}
          role="status"
        >
          {payload.latestTest.result === 'mock_passed' ? 'Mock passed' : 'Mock failed'} · source=simulator · {payload.latestTest.reason}
        </p>
      ) : (
        <p className="console__muted" role="status">No mock Test Draft result yet.</p>
      )}
    </section>
  )
}

export function App(): React.JSX.Element {
  const [activePage, setActivePage] = useState<(typeof PAGES)[number]>('Overview')
  const [bridgeAvailable, setBridgeAvailable] = useState(false)
  const [bridgeError, setBridgeError] = useState<ConsoleFailure | null>(null)
  const [overviewState, setOverviewState] = useState<OverviewState>({ status: 'loading' })
  const [eventsState, setEventsState] = useState<EventsState>({
    status: 'loading',
    events: [],
    nextBeforeSequence: null,
  })
  const [selectedPhase, setSelectedPhase] = useState<PhaseTestPhase>('1')
  const [phaseTestsState, setPhaseTestsState] = useState<PhaseTestsViewState>({ status: 'loading' })
  const [lifecycleActionState, setLifecycleActionState] = useState<LifecycleActionState>({ status: 'idle' })
  const [simulatorState, setSimulatorState] = useState<SimulatorState>({ status: 'idle' })
  const [configState, setConfigState] = useState<ConfigState>({ status: 'loading' })
  const [modelsState, setModelsState] = useState<ModelsState>({ status: 'loading' })
  const [moduleFilter, setModuleFilter] = useState<EventModuleFilter>('all')
  const [statusFilter, setStatusFilter] = useState<EventStatusFilter>('all')
  const [sourceFilter, setSourceFilter] = useState<EventSourceFilter>('all')
  const bridgeRef = useRef<ConsoleBridge | null>(null)
  const mountedRef = useRef(false)
  const didNotifyReadyRef = useRef(false)
  const didLoadOverviewRef = useRef(false)
  const eventsRequestIdRef = useRef(0)
  const phaseTestsRequestIdRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      bridgeRef.current = null
    }
  }, [])

  const requestOverview = async (bridge: ConsoleBridge): Promise<void> => {
    if (!mountedRef.current) return
    setOverviewState({ status: 'loading' })
    try {
      const overviewResponse = await bridge.getOverview()
      if (!mountedRef.current) return
      const failure = requestFailure(overviewResponse)
      if (failure) {
        setOverviewState({ status: 'failure', ...failure })
        return
      }
      if (overviewResponse.ok) {
        const overview = overviewResponse.value
        setOverviewState({
          status: 'success',
          value: {
            lifecycle: overview.lifecycle,
            appVersion: overview.appVersion,
            buildCommit: overview.buildCommit,
            configVersion: overview.configVersion,
            identityStatus: overview.identityStatus,
            realtimeSessionId: overview.realtimeSessionId,
            sessionGeneration: overview.sessionGeneration,
            uptimeSeconds: overview.uptimeSeconds,
            developerMode: overview.developerMode,
            developerModeSource: overview.developerModeSource,
            modules: overview.modules,
            audioTcc: overview.audioTcc,
            cameraTcc: overview.cameraTcc,
          },
        })
      }
    } catch {
      if (!mountedRef.current) return
      setOverviewState({ status: 'failure', ...BRIDGE_FAILURE })
    }
  }

  const requestEvents = async (
    bridge: ConsoleBridge,
    request: ConsoleEventsQuery,
    append: boolean,
  ): Promise<void> => {
    if (!mountedRef.current) return
    const requestId = eventsRequestIdRef.current + 1
    eventsRequestIdRef.current = requestId
    const query: ConsoleEventsQuery = {
      limit: request.limit ?? EVENT_PAGE_LIMIT,
      ...(request.beforeSequence === undefined ? {} : { beforeSequence: request.beforeSequence }),
      ...(request.module === undefined ? {} : { module: request.module }),
      ...(request.status === undefined ? {} : { status: request.status }),
      ...(request.source === undefined ? {} : { source: request.source }),
    }
    setEventsState((previous) => ({
      status: 'loading',
      events: append ? previous.events : [],
      nextBeforeSequence: append ? previous.nextBeforeSequence : null,
    }))
    try {
      // Load older events reuses nextBeforeSequence and appends metadata without duplicates.
      const eventsResponse = await bridge.getEvents(query)
      if (!mountedRef.current || eventsRequestIdRef.current !== requestId) return
      const failure = requestFailure(eventsResponse)
      if (failure) {
        setEventsState((previous) => ({
          status: 'failure',
          events: append ? previous.events : [],
          nextBeforeSequence: append ? previous.nextBeforeSequence : null,
          ...failure,
        }))
        return
      }
      if (eventsResponse.ok) {
        setEventsState((previous) => ({
          status: 'success',
          events: append
            ? appendUniqueEvents(previous.events, eventsResponse.value.events)
            : eventsResponse.value.events,
          nextBeforeSequence: eventsResponse.value.nextBeforeSequence,
        }))
      }
    } catch {
      if (!mountedRef.current || eventsRequestIdRef.current !== requestId) return
      setEventsState((previous) => ({
        status: 'failure',
        events: append ? previous.events : [],
        nextBeforeSequence: append ? previous.nextBeforeSequence : null,
        ...BRIDGE_FAILURE,
      }))
    }
  }

  const requestPhaseTests = async (bridge: ConsoleBridge, requestedPhase: PhaseTestPhase): Promise<void> => {
    if (!mountedRef.current) return
    const requestId = phaseTestsRequestIdRef.current + 1
    phaseTestsRequestIdRef.current = requestId
    setPhaseTestsState({ status: 'loading' })
    try {
      const response = await bridge.getPhaseTests(requestedPhase)
      const current = phaseTestsRequestIdRef.current
      if (!mountedRef.current || current !== requestId) return
      const failure = requestFailure(response)
      if (failure) {
        setPhaseTestsState({ status: 'failure', ...failure })
        return
      }
      if (response.ok) {
        if (response.value.phase !== requestedPhase) {
          setPhaseTestsState({
            status: 'failure',
            error: 'console_request_invalid',
            reason: 'cause=phase_payload_mismatch',
          })
          return
        }
        setPhaseTestsState({ status: 'success', value: response.value })
      }
    } catch {
      const current = phaseTestsRequestIdRef.current
      if (!mountedRef.current || current !== requestId) return
      setPhaseTestsState({ status: 'failure', ...BRIDGE_FAILURE })
    }
  }

  const requestConfig = async (bridge: ConsoleBridge): Promise<void> => {
    if (!mountedRef.current) return
    setConfigState({ status: 'loading' })
    try {
      const response = await bridge.getConfig()
      if (!mountedRef.current) return
      const failure = requestFailure(response)
      if (failure) {
        setConfigState({ status: 'failure', ...failure })
        return
      }
      if (response.ok) setConfigState({ status: 'success', value: response.value })
    } catch {
      if (mountedRef.current) setConfigState({ status: 'failure', ...BRIDGE_FAILURE })
    }
  }

  const requestModels = async (bridge: ConsoleBridge): Promise<void> => {
    if (!mountedRef.current) return
    setModelsState({ status: 'loading' })
    try {
      const response = await bridge.getModels()
      if (!mountedRef.current) return
      const failure = requestFailure(response)
      if (failure) {
        setModelsState({ status: 'failure', ...failure })
        return
      }
      if (response.ok) setModelsState({ status: 'success', value: response.value })
    } catch {
      if (mountedRef.current) setModelsState({ status: 'failure', ...BRIDGE_FAILURE })
    }
  }

  const refreshConfigAndModels = (): void => {
    const bridge = bridgeRef.current
    if (bridge === null || !bridgeAvailable) return
    void requestConfig(bridge)
    void requestModels(bridge)
  }

  useEffect(() => {
    const bridge = readConsoleBridge()
    if (bridge === null) {
      bridgeRef.current = null
      eventsRequestIdRef.current += 1
      phaseTestsRequestIdRef.current += 1
      setBridgeAvailable(false)
      setBridgeError(BRIDGE_FAILURE)
      setOverviewState({ status: 'failure', ...BRIDGE_FAILURE })
      setEventsState({ status: 'failure', events: [], nextBeforeSequence: null, ...BRIDGE_FAILURE })
      setPhaseTestsState({ status: 'failure', ...BRIDGE_FAILURE })
      setConfigState({ status: 'failure', ...BRIDGE_FAILURE })
      setModelsState({ status: 'failure', ...BRIDGE_FAILURE })
      return
    }

    bridgeRef.current = bridge
    setBridgeAvailable(true)
    setBridgeError(null)

    if (!didNotifyReadyRef.current) {
      didNotifyReadyRef.current = true
      try {
        bridge.notifyReady()
      } catch {
        setBridgeError(BRIDGE_FAILURE)
      }
    }

    if (!didLoadOverviewRef.current) {
      didLoadOverviewRef.current = true
      void requestOverview(bridge)
    }

    const query = buildEventsQuery(moduleFilter, statusFilter, sourceFilter)
    void requestEvents(bridge, query, false)
    void requestConfig(bridge)
    void requestModels(bridge)
  }, [moduleFilter, sourceFilter, statusFilter])

  useEffect(() => {
    const bridge = bridgeRef.current
    if (bridge === null || !bridgeAvailable) return
    void requestPhaseTests(bridge, selectedPhase)
  }, [bridgeAvailable, selectedPhase])

  const developerMode = overviewState.status === 'success' && overviewState.value.developerMode === true

  const runSimulation = (command: SimulatorCommand): void => {
    const bridge = bridgeRef.current
    const developerModeDisabled = !developerMode
    // Developer Mode is disabled until the Main Overview response authorizes the controls.
    if (developerModeDisabled || bridge === null || !bridgeAvailable) {
      setSimulatorState({
        status: 'failure',
        command: command.type,
        ...BRIDGE_FAILURE,
      })
      return
    }

    setSimulatorState({ status: 'loading', command: command.type })
    void (async () => {
      try {
        const result = await bridge.simulate(command)
        if (!mountedRef.current) return
        setSimulatorState({ status: 'success', command: command.type, result })
      } catch {
        if (!mountedRef.current) return
        setSimulatorState({
          status: 'failure',
          command: command.type,
          ...BRIDGE_FAILURE,
        })
      }
    })()
  }

  const runLifecycleAction = (
    action: LifecycleActionName,
    request: (bridge: ConsoleBridge) => Promise<ConsoleResponse<ConsoleLifecycleActionResult>>,
  ): void => {
    const bridge = bridgeRef.current
    if (bridge === null || !bridgeAvailable) {
      setLifecycleActionState({ status: 'failure', action, ...BRIDGE_FAILURE })
      return
    }

    setLifecycleActionState({ status: 'loading', action })
    void (async () => {
      try {
        const response = await request(bridge)
        if (!mountedRef.current) return
        const failure = requestFailure(response)
        if (failure) {
          setLifecycleActionState({ status: 'failure', action, ...failure })
          return
        }
        if (response.ok) {
          setLifecycleActionState({ status: 'success', action, result: response.value })
        }
      } catch {
        if (!mountedRef.current) return
        setLifecycleActionState({ status: 'failure', action, ...BRIDGE_FAILURE })
      }
    })()
  }

  const startConversation = (): void => {
    runLifecycleAction('startConversation', (bridge) => bridge.startConversation())
  }

  const disconnect = (): void => {
    runLifecycleAction('disconnect', (bridge) => bridge.disconnect())
  }

  const loadOlderEvents = (): void => {
    const bridge = bridgeRef.current
    const beforeSequence = eventsState.nextBeforeSequence
    if (bridge === null || !bridgeAvailable || beforeSequence === null) return
    const query = buildEventsQuery(moduleFilter, statusFilter, sourceFilter, beforeSequence)
    void requestEvents(bridge, query, true)
  }

  return (
    <main className="console">
      <header className="console__header">
        <div>
          <p className="console__eyebrow">Phase 0 · Main observation</p>
          <h1 className="console__title">Magic Mirror Console</h1>
          <p className="console__detail">A bounded, non-gating view of the mirror runtime.</p>
        </div>
        <span className="console__status console__status--mock">Mock / simulator</span>
      </header>

      {bridgeError ? (
        <p className="console__fault" role="status">Console bridge unavailable: {bridgeError.error}; {bridgeError.reason}</p>
      ) : null}

      <LifecycleControls
        bridgeAvailable={bridgeAvailable}
        state={lifecycleActionState}
        onStartConversation={startConversation}
        onDisconnect={disconnect}
      />

      <nav className="console__tabs" aria-label="Console pages">
        {CONSOLE_UI_CONTRACT.tabs.map((page) => (
          <button
            key={page}
            type="button"
            className={activePage === page ? 'console__tab console__tab--active' : 'console__tab'}
            aria-selected={activePage === page}
            onClick={() => setActivePage(page)}
          >
            {page}
          </button>
        ))}
      </nav>

      <div className="console__panels">
        <div hidden={activePage !== 'Overview'}><OverviewPanel state={overviewState} /></div>
        <div hidden={activePage !== 'Simulator'}>
          <SimulatorPanel
            developerMode={developerMode}
            bridgeAvailable={bridgeAvailable}
            state={simulatorState}
            onSimulate={runSimulation}
          />
        </div>
        <div hidden={activePage !== 'Events'}>
          <EventsPanel
            state={eventsState}
            moduleFilter={moduleFilter}
            statusFilter={statusFilter}
            sourceFilter={sourceFilter}
            onModuleFilterChange={setModuleFilter}
            onStatusFilterChange={setStatusFilter}
            onSourceFilterChange={setSourceFilter}
            onLoadOlder={loadOlderEvents}
            bridgeAvailable={bridgeAvailable}
          />
        </div>
        <div hidden={activePage !== 'Phase Tests'}>
          <label htmlFor="console-phase-selector">Phase
            <select
              id="console-phase-selector"
              value={selectedPhase}
              onChange={(event) => {
                const nextPhase = event.currentTarget.value
                if (nextPhase === '0' || nextPhase === '1') setSelectedPhase(nextPhase)
              }}
            >
              <option value="1">Phase 1</option>
              <option value="0">Phase 0</option>
            </select>
          </label>
          <PhaseTestsPanel
            state={phaseTestsState}
            selectedPhase={selectedPhase}
          />
        </div>
        <div hidden={activePage !== 'Config'}>
          <ConfigPanel
            state={configState}
            bridge={bridgeRef.current}
            bridgeAvailable={bridgeAvailable}
            onChanged={refreshConfigAndModels}
          />
        </div>
        <div hidden={activePage !== 'Models'}>
          <ModelsPanel
            state={modelsState}
            bridge={bridgeRef.current}
            bridgeAvailable={bridgeAvailable}
            onChanged={refreshConfigAndModels}
          />
        </div>
      </div>
    </main>
  )
}

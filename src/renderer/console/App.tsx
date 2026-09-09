import * as React from 'react'
import { useEffect, useRef, useState } from 'react'

import {
  AVATAR_RUNTIME_STATES,
  type AvatarControlCommand,
  type AvatarRuntimeSnapshot,
  type ConsoleBridge,
} from '../../shared/bridge'
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
  SceneActionDefinition,
  SimulatorCommand,
  SimulatorResult,
} from '../../shared/types'
import { REN_EXPRESSION_NAMES } from '../../shared/types'
import type { ManagedVisualAsset } from '../../shared/types'
import { importMediaBatch } from './media-import'
import { MediaLibrary } from './MediaLibrary'
import type { ImportedMedia, MediaImportRequest } from '../../shared/media-import'
import { probeDraftVisualAsset } from './visual-asset-probe'
import { SceneComposer } from './SceneComposer'
import { buildSceneDraftSave, draftFingerprint, isSceneDraftSaved } from './scene-editor-model'
import { HelpButton } from './HelpButton'
import { SceneActionFields } from './SceneActionFields'
import { PresentationEditor } from './PresentationEditor'
import { DEFAULT_AUDIO_PREFERENCES } from '../../shared/audio-devices'
import { DEFAULT_PRESENTATION } from '../../shared/presentation'
import { AvatarCharacterEditor } from './AvatarCharacterEditor'
import { projectAvatarDraft, mergeAvatarDraft } from './avatar-editor'
import { canUseAvatarAction, canUseAvatarResource, type AvatarCatalog, type AvatarProfile } from '../../shared/avatar-profiles'
import { ResourceAccess } from './ResourceAccess'
import { CubismStudio } from './CubismStudio'
import { VoiceStudio } from './VoiceStudio'
import { PROFILE_SECTIONS, LIBRARY_SECTIONS, newAvatar, workspaceChanges, avatarActivationReason, draftRefreshDecision, type ProfileSection } from './profile-workspace'

const PAGES = ['Mirror', 'Avatars', 'System'] as const
const SYSTEM_PAGES = ['Devices', 'Models', 'Config', 'Events', 'Simulator', 'Phase Tests'] as const
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
    controls: ['Start Conversation', 'Interrupt', 'Disconnect'] as const,
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

type LifecycleActionName = 'startConversation' | 'interrupt' | 'disconnect'

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

type AvatarRuntimeState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly value: AvatarRuntimeSnapshot }
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
    && typeof value.runScene === 'function'
    && typeof value.stopScenes === 'function'
    && typeof value.uploadMusic === 'function'
    && typeof value.getModels === 'function'
    && typeof value.saveModelDraft === 'function'
    && typeof value.saveDraft === 'function'
    && typeof value.testDraft === 'function'
    && typeof value.publish === 'function'
    && typeof value.rollback === 'function'
    && typeof value.createNextRuntimeSnapshots === 'function'
    && typeof value.getPhaseTests === 'function'
    && typeof value.getAvatarRuntime === 'function'
    && typeof value.controlAvatar === 'function'
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

function OverviewPanel({
  state,
  configState,
}: {
  readonly state: OverviewState
  readonly configState: ConfigState
}): React.JSX.Element {
  const overview = state.status === 'success' ? state.value : null
  const activeConfig = configState.status === 'success' ? configState.value.active : null
  const audioTcc = overview?.audioTcc ?? 'not_checked'
  const cameraTcc = overview?.cameraTcc ?? 'not_checked'

  return (
    <section className="console__panel" aria-labelledby="console-overview">
      <div className="console__panel-heading">
        <div>
          <p className="console__eyebrow">Observation</p>
          <h2 id="console-overview">Overview</h2>
        </div>
      </div>

      <div className="console__overview-grid console__overview-primary">
        <OverviewField label="Mirror" value={displayValue(overview?.lifecycle)} />
        <OverviewField label="Wake phrase" value={displayValue(activeConfig?.wake.phrase)} />
        <OverviewField label="Published configuration" value={activeConfig ? `Version ${activeConfig.configVersion}` : 'Loading'} />
      </div>
      {state.status === 'failure' ? <p className="console__fault" role="alert">{state.error}: {state.reason}</p> : null}
      <ul className="console__modules" aria-label="Needs attention">
        {MODULES.filter(module => overview && ['failed', 'degraded'].includes(overview.modules[module].status)).map(module =>
          <li key={module} className="console__module-card">
            <div className="console__module-heading"><strong>{module}</strong><span className={statusClass(overview!.modules[module].status)}>{overview!.modules[module].status}</span></div>
            <ModuleSummary label="Reason" summary={overview!.modules[module].lastError ?? overview!.modules[module].lastFallback} />
          </li>)}
      </ul>
      <details className="console__technical"><summary>Technical health and runtime details</summary>
      <article className="console__module-card" aria-label="Wake lifecycle">
        <div className="console__module-heading">
          <strong>Wake lifecycle</strong>
          <span className={statusClass(overview?.modules.wake.status ?? 'not_implemented')}>
            {overview?.modules.wake.status ?? 'not_implemented'}
          </span>
        </div>
        <dl className="console__summary-fields">
          <MetadataEntry name="phrase" value={activeConfig?.wake.phrase} />
          <MetadataEntry name="package" value={activeConfig?.wake.packageId} />
          <MetadataEntry name="model version" value={activeConfig?.wake.modelVersion} />
          <MetadataEntry
            name="mic owner"
            value={overview === null ? undefined : overview.lifecycle === 'active' ? 'realtime' : overview.lifecycle === 'dormant' || overview.lifecycle === 'offlineLoop' ? 'wake' : 'handoff'}
          />
          <MetadataEntry name="idle policy" value="Resets after user input and avatar playback; paused during speech" />
          <MetadataEntry name="idle seconds" value={activeConfig?.idleSeconds} />
        </dl>
      </article>

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
      </details>
    </section>
  )
}

function LifecycleControls({
  lifecycle,
  bridgeAvailable,
  state,
  onStartConversation,
  onInterrupt,
  onDisconnect,
}: {
  readonly lifecycle?: string
  readonly bridgeAvailable: boolean
  readonly state: LifecycleActionState
  readonly onStartConversation: () => void
  readonly onInterrupt: () => void
  readonly onDisconnect: () => void
}): React.JSX.Element {
  const controlsDisabled = !bridgeAvailable || state.status === 'loading'

  return (
    <section className="console__panel console__lifecycle" aria-labelledby="console-lifecycle">
      <div className="console__panel-heading">
        <div>
          <h2 id="console-lifecycle">Conversation Controls</h2>
        </div>
        <span className={bridgeAvailable ? 'console__status console__status--success' : 'console__status console__status--disabled'}>
          {bridgeAvailable ? 'Ready' : 'Unavailable'}
        </span>
      </div>

      <div className="console__command-list" aria-label="Conversation lifecycle controls">
        <button type="button" disabled={controlsDisabled || lifecycle === 'active' || lifecycle === 'activating' || lifecycle === 'suspending'} onClick={onStartConversation}>
          Start Conversation
        </button>
        <button type="button" disabled={controlsDisabled || lifecycle !== 'active'} onClick={onInterrupt}>
          Interrupt
        </button>
        <button type="button" disabled={controlsDisabled || lifecycle === 'dormant' || lifecycle === 'starting'} onClick={onDisconnect}>
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

function AvatarAudioPanel({
  state,
  disabled,
  onCommand,
}: {
  readonly state: AvatarRuntimeState
  readonly disabled: boolean
  readonly onCommand: (command: AvatarControlCommand) => void
}): React.JSX.Element {
  const value = state.status === 'success' ? state.value : null
  const audioDevices = value?.audioDevices
  const preferences = audioDevices?.preferences ?? DEFAULT_AUDIO_PREFERENCES
  return (
    <section className="console__panel" aria-labelledby="console-avatar-audio">
      <div className="console__panel-heading">
        <div>
          <p className="console__eyebrow">Actual renderer and output graph</p>
          <h2 id="console-avatar-audio">Devices & runtime</h2>
        </div>
        <span className={statusClass(value?.status ?? state.status)}>{value?.status ?? state.status}</span>
      </div>

      {state.status === 'failure' ? <p className="console__fault">{state.error}; {state.reason}</p> : null}
      <details><summary>Renderer measurements</summary>
      <div className="console__overview-grid">
        <OverviewField label="state" value={displayValue(value?.state)} />
        <OverviewField label="FPS" value={value ? value.fps.toFixed(1) : '—'} />
        <OverviewField label="mouth" value={value ? value.mouthOpen.toFixed(3) : '—'} />
        <OverviewField label="underruns" value={displayValue(value?.audioUnderruns)} />
        <OverviewField label="voice gain" value={value ? value.voiceGain.toFixed(2) : '—'} />
        <OverviewField label="music gain" value={value ? value.musicGain.toFixed(2) : '—'} />
        <OverviewField label="reason" value={displayValue(value?.reason)} />
        <label className="console__overview-field">
          <small>waveform</small>
          <meter min="0" max="1" value={value?.waveform ?? 0} />
        </label>
      </div>

      </details>
      <p className="console__label">Sound devices</p>
      <div className="console__gain-controls">
        {(['audioinput', 'audiooutput'] as const).map((kind) => {
          const devices = audioDevices?.devices.filter((device) => device.kind === kind) ?? []
          const input = kind === 'audioinput'
          const selected = input ? preferences.inputId : preferences.outputId
          const systemDefault = devices.find((device) => device.deviceId === 'default')?.label.replace(/^(Default|預設)\s*-\s*/i, '')
          return <label key={kind}>{input ? 'Microphone' : 'Speakers'}
            <select aria-label={input ? 'Microphone device' : 'Speaker device'} value={selected} disabled={disabled || !audioDevices}
              onChange={(event) => {
                const id = event.currentTarget.value
                const device = devices.find((entry) => entry.deviceId === id)
                onCommand({ type: 'audio_devices', preferences: input
                  ? { ...preferences, inputId: id, inputLabel: id ? device?.label ?? '' : '' }
                  : { ...preferences, outputId: id } })
              }}>
              <option value="">Windows default{systemDefault ? ` — ${systemDefault}` : ''}</option>
              {selected && !devices.some((device) => device.deviceId === selected) ? <option value={selected}>Selected device unavailable</option> : null}
              {devices.filter((device) => device.deviceId && device.deviceId !== 'default' && device.deviceId !== 'communications').map((device) => (
                <option key={device.deviceId} value={device.deviceId} disabled={input && !device.label}>{device.label || 'Unnamed device'}</option>
              ))}
            </select>
          </label>
        })}
      </div>
      <p className="console__detail">Speakers apply to voice, music, and video. Microphone changes apply at the next conversation and next wake-listener start; use Start Conversation, then Disconnect to update both. Windows default follows the system selection on acquisition.</p>
      <p className="console__detail" role="status">{audioDevices?.reason === 'audio_devices_ready' ? 'Audio devices ready.' : audioDevices?.reason?.replaceAll('_', ' ') ?? 'Loading sound devices…'}</p>
      <section aria-label="Wake microphone diagnostics">
        <h3>Wake microphone — live input</h3>
        <p role="status">{value?.wakeInput ? ({
          inactive: 'Wake listener inactive — microphone released or unavailable.',
          waiting: 'Waiting for the first audio blocks…',
          stalled: 'No audio blocks for over 3 seconds — microphone stream may be stalled.',
          silent: 'Audio blocks arriving, but the signal is silent or very quiet.',
          signal: 'Sound is reaching the wake detector. Sound activity is not a wake-word match.',
        } as const)[value.wakeInput.state] : 'Wake input diagnostics unavailable.'}</p>
        <label className="console__input-level">Input level
          <meter aria-label="Wake microphone level" min="0" max="100"
            value={value?.wakeInput?.peak ? Math.max(0, 100 + 100 * 20 * Math.log10(value.wakeInput.peak) / 60) : 0} />
        </label>
        <p className="console__detail">{value?.wakeInput ? `Peak ${value.wakeInput.peak > 0 ? (20 * Math.log10(value.wakeInput.peak)).toFixed(1) : '−∞'} dBFS · Blocks ${value.wakeInput.blocks} · Last block ${value.wakeInput.lastBlockAgeMs === null ? 'not received' : `${value.wakeInput.lastBlockAgeMs} ms ago`} · Wake detections ${value.wakeInput.detections}` : 'Waiting for wake worker…'}</p>
        <p className="console__detail">Measures the existing wake stream only; no recording or transcription. Updates twice per second.</p>
      </section>
      <button type="button" disabled={disabled} onClick={() => onCommand({ type: 'refresh_audio_devices' })}>Refresh sound devices</button>

      <details className="console__technical"><summary>Avatar motions, expressions and test tools</summary>
      <p className="console__label">States / motions</p>
      <div className="console__command-list">
        {AVATAR_RUNTIME_STATES.filter((stateName) => stateName !== 'OfflineLoop').map((stateName) => (
          <button key={stateName} type="button" disabled={disabled} onClick={() => onCommand({ type: 'state', state: stateName })}>
            {stateName}
          </button>
        ))}
      </div>
      <p className="console__label">Expressions</p>
      <div className="console__command-list">
        {REN_EXPRESSION_NAMES.map((name) => (
          <button key={name} type="button" disabled={disabled} onClick={() => onCommand({ type: 'expression', name })}>{name}</button>
        ))}
      </div>
      <p className="console__label">Fallback check</p>
      <div className="console__command-list">
        <button type="button" disabled={disabled} onClick={() => onCommand({ type: 'asset_failure', action: 'inject' })}>Inject avatar asset failure</button>
        <button type="button" disabled={disabled} onClick={() => onCommand({ type: 'asset_failure', action: 'clear' })}>Clear avatar asset failure</button>
      </div>
      <p className="console__label">Audio checks</p>
      <div className="console__command-list">
        <button type="button" disabled={disabled} onClick={() => onCommand({ type: 'recorded_audio', action: 'play' })}>Play recorded AI</button>
        <button type="button" disabled={disabled} onClick={() => onCommand({ type: 'recorded_audio', action: 'stop' })}>Stop recorded AI</button>
        <button type="button" disabled={disabled} onClick={() => onCommand({ type: 'music', action: 'play' })}>Play music</button>
        <button type="button" disabled={disabled} onClick={() => onCommand({ type: 'music', action: 'stop' })}>Stop music</button>
      </div>
      </details>
      <div className="console__gain-controls">
        <label>Voice gain
          <input type="range" min="0" max="1" step="0.05" value={value?.voiceGain ?? 1} disabled={disabled} onChange={(event) => onCommand({ type: 'voice_gain', value: Number(event.currentTarget.value) })} />
        </label>
        <label>Music gain
          <input type="range" min="0" max="1" step="0.05" value={value?.musicGain ?? 1} disabled={disabled} onChange={(event) => onCommand({ type: 'music_gain', value: Number(event.currentTarget.value) })} />
        </label>
      </div>
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

function safeDraftFromConfig(value: ConsoleConfigDraftInput): ConsoleConfigDraftInput {
  return {
    ...(value.avatarCatalog ? { avatarCatalog: structuredClone(value.avatarCatalog) } : {}),
    ...(value.presentation ? { presentation: structuredClone(value.presentation) } : {}),
    personaName: value.personaName,
    voice: value.voice,
    idleSeconds: value.idleSeconds,
    wake: { ...value.wake },
    faceModel: { ...value.faceModel },
    assets: { ...value.assets },
    adapters: { ...value.adapters },
    visualAssets: structuredClone(value.visualAssets),
    musicAssets: structuredClone(value.musicAssets),
    sceneActions: structuredClone(value.sceneActions),
    spells: structuredClone(value.spells),
    scenes: structuredClone(value.scenes),
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
  readonly onEditingChange?: (editing: boolean) => void
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
  onEditingChange,
}: ConfigPanelProps): React.JSX.Element {
  const config = state.status === 'success' ? state.value : null
  const [draft, setDraft] = useState<ConsoleConfigDraftInput | null>(
    config === null ? null : safeDraftFromConfig(config.draft),
  )
  const [result, setResult] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (config !== null) setDraft(safeDraftFromConfig(config.draft))
  }, [config])

  const disabled = !bridgeAvailable || bridge === null || draft === null || config === null || busy
  const dirty = draft !== null && config !== null
    && JSON.stringify(safeDraftFromConfig(draft)) !== JSON.stringify(safeDraftFromConfig(config.draft))
  useEffect(() => onEditingChange?.(dirty || busy), [dirty, busy, onEditingChange])
  const updateDraft = (update: (current: ConsoleConfigDraftInput) => ConsoleConfigDraftInput): void => {
    // Read event-backed values while the change handler still owns currentTarget.
    if (draft !== null) setDraft(mergeAvatarDraft(draft, update(draft), draft.avatarCatalog?.activeAvatarId ?? ''))
  }
  const run = async (action: () => Promise<ConsoleResponse<unknown>>): Promise<void> => {
    setBusy(true)
    try {
      const response = await action()
      setResult(response.ok ? 'Operation completed.' : `${response.error}: ${response.reason}${response.fields?.length
        ? ` · ${response.fields.map(field => `${field.path}: ${field.message}`).join(' · ')}` : ''}`)
      if (response.ok) onChanged()
    } catch {
      setResult('Console operation failed.')
    } finally {
      setBusy(false)
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
            <span>wake.packageId</span>
            <input
              type="text"
              value={draft?.wake.packageId ?? ''}
              disabled={disabled}
              onChange={(event) => updateDraft((current) => ({
                ...current,
                wake: { ...current.wake, packageId: event.currentTarget.value },
              }))}
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
        <button type="button" disabled={disabled || dirty} onClick={() => bridge && void run(() => bridge.testDraft())}>Test Draft</button>
      </div>
      <p role="status">{result}{dirty ? ' · Unsaved edits — Save Draft first.' : ''}</p>

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
              disabled={disabled || dirty || diff === undefined || label === 'Publish' && config?.draftTest?.result !== 'mock_passed'}
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
  readonly onEditingChange?: (editing: boolean) => void
  readonly state: ModelsState
  readonly bridge: ConsoleBridge | null
  readonly bridgeAvailable: boolean
  readonly onChanged: () => void
}


interface ScenesPanelProps {
  readonly lifecycle?: string
  readonly onEditingChange?: (editing: boolean) => void
  readonly voiceOnly?: boolean
  readonly visible?: boolean
  readonly dialogueOnly?: boolean
  readonly state: ConfigState
  readonly bridge: ConsoleBridge | null
  readonly bridgeAvailable: boolean
  readonly onChanged: () => void
}

export function ScenesPanel({
  state,
  bridge,
  bridgeAvailable,
  onChanged,
  visible = true,
  lifecycle,
  onEditingChange,
}: ScenesPanelProps): React.JSX.Element {
  // Keep the editor mounted while Save/Test/Publish refresh their read model.
  const lastPayload = useRef<ConsoleConfigPayload | null>(null)
  if (state.status === 'success') lastPayload.current = state.value
  const payload = lastPayload.current
  const [rawDraft, setRawDraft] = useState<ConsoleConfigDraftInput | null>(null)
  const retainLocalDraft = useRef(false)
  const acceptRefresh = useRef(false)
  const baseline = useRef<ConsoleConfigDraftInput | null>(null)
  const [conflict, setConflict] = useState(false)
  const [publishReview, setPublishReview] = useState(false)
  const [previewRevision, setPreviewRevision] = useState(0)
  const sceneTestGeneration = useRef(0)
  const latestSceneDraft = useRef(rawDraft)
  latestSceneDraft.current = rawDraft
  const [editingAvatarId, setEditingAvatarId] = useState('')
  const editingId = rawDraft?.avatarCatalog?.avatars.some(a => a.id === editingAvatarId)
    ? editingAvatarId : rawDraft?.avatarCatalog?.activeAvatarId ?? ''
  const draft = rawDraft ? projectAvatarDraft(rawDraft, editingId) : null
  const editingAvatar = rawDraft?.avatarCatalog?.avatars.find(a => a.id === editingId)
  const [libraryModels, setLibraryModels] = useState<import('../../shared/avatar-profiles').AvatarModel[]>([])
  const editingModel = libraryModels.find(m => m.id === editingAvatar?.modelId) ?? rawDraft?.avatarCatalog?.models.find(m => m.id === editingAvatar?.modelId)
  const setDraft = (update: React.SetStateAction<ConsoleConfigDraftInput | null>): void => {
    setRawDraft(current => {
      const projected = current ? projectAvatarDraft(current, editingId) : null
      const next = typeof update === 'function' ? update(projected) : update
      return current && next ? mergeAvatarDraft(current, next, editingId) : next
    })
  }
  const updateAvatar = (avatar: AvatarProfile): void => setRawDraft(current => current?.avatarCatalog
    ? projectAvatarDraft({ ...current, avatarCatalog: { ...current.avatarCatalog,
      avatars: current.avatarCatalog.avatars.map(a => a.id === avatar.id ? avatar : a) } }) : current)
  const updateCatalog = (catalog: AvatarCatalog): void => setRawDraft(current => current ? projectAvatarDraft({ ...current, avatarCatalog: catalog }) : current)
  const resourceDraft = draft ? { ...draft,
    visualAssets: draft.visualAssets.filter(a => !draft.avatarCatalog || canUseAvatarResource(draft.avatarCatalog, editingId, 'visual', a.id)),
    musicAssets: draft.musicAssets.filter(a => !draft.avatarCatalog || canUseAvatarResource(draft.avatarCatalog, editingId, 'music', a.id)),
    sceneActions: draft.sceneActions.filter(a => canUseAvatarAction(draft.avatarCatalog, editingId, a)),
  } : null
  const mergeResourceDraft = (next: ConsoleConfigDraftInput): void => setDraft(current => current ? { ...next,
    visualAssets: [...current.visualAssets.filter(a => !resourceDraft?.visualAssets.some(b => a.id === b.id)), ...next.visualAssets],
    musicAssets: [...current.musicAssets.filter(a => !resourceDraft?.musicAssets.some(b => a.id === b.id)), ...next.musicAssets],
    sceneActions: [...current.sceneActions.filter(a => !resourceDraft?.sceneActions.some(b => a.id === b.id)), ...next.sceneActions],
  } : next)
  const [result, setResult] = useState('Edits stay in draft until you publish.')
  const [busy, setBusy] = useState(false)
  const [mediaTestFailed, setMediaTestFailed] = useState(false)
  const [section, setSection] = useState<ProfileSection>('Persona')
  const voiceOnly = section === 'Voice'
  const dialogueOnly = PROFILE_SECTIONS.includes(section as typeof PROFILE_SECTIONS[number]) && section !== 'Spells & scenes'
  const avatarView = section === 'Appearance' ? 'appearance' : 'character'
  const editorView = section === 'Media library' ? 'media' : section === 'Action library' ? 'library' : section === 'Rig library' ? 'rigs' : 'scenes'
  const availableModels = [...new Map([...(rawDraft?.avatarCatalog?.models ?? []), ...libraryModels].map(model => [model.id, model])).values()]
  useEffect(() => {
    if (!visible || !bridge?.listAvatarModels) return
    let current = true
    void bridge.listAvatarModels().then(response => {
      if (!current) return
      if (response.ok) setLibraryModels(response.value.models)
      else setResult(`Cubism library unavailable: ${response.reason}`)
    }).catch(() => { if (current) setResult('Cubism library unavailable.') })
    return () => { current = false }
  }, [visible, section, bridge])
  const [importFailures, setImportFailures] = useState<{ name: string; reason: string }[]>([])
  const importMedia = async (request: MediaImportRequest, actionId?: string): Promise<void> => {
    if (!bridge || busy) return
    setBusy(true); setImportFailures([]); setResult('Importing media…')
    try {
      const response = await importMediaBatch(bridge, request)
      setImportFailures(response.failures)
      setDraft(current => {
        if (!current) return current
        const visuals = response.assets.filter((a): a is ManagedVisualAsset => 'kind' in a)
        const music = response.assets.filter((a): a is Exclude<ImportedMedia, ManagedVisualAsset> => !('kind' in a))
        const first = response.assets[0]
        return { ...current,
          visualAssets: [...current.visualAssets, ...visuals.filter(a => !current.visualAssets.some(old => old.id === a.id))].filter((a, i, all) => all.findIndex(b => b.id === a.id) === i),
          musicAssets: [...current.musicAssets, ...music.filter(a => !current.musicAssets.some(old => old.id === a.id))].filter((a, i, all) => all.findIndex(b => b.id === a.id) === i),
          sceneActions: current.sceneActions.map(a => {
            if (!first || a.id !== actionId) return a
            if (a.kind === 'visual' && 'kind' in first) return { ...a, assetId: first.id, playback: first.kind === 'video' ? 'once' as const : 'still' as const, audio: 'muted' as const, gain: 0 }
            if (a.kind === 'music' && !('kind' in first)) return { id: a.id, name: a.name, enabled: a.enabled, kind: 'music' as const, command: 'play' as const, assetId: first.id, gain: 0.5, loop: false }
            return a
          }),
        }
      })
      setResult(response.cancelled ? 'Media import cancelled.' : `Imported ${response.assets.length} file(s)${response.failures.length ? `; ${response.failures.length} failed` : ''}. ${actionId && response.assets.length ? 'Selected in this action. ' : ''}Save Draft to keep the links.`)
    } finally { setBusy(false) }
  }

  useEffect(() => {
    if (!payload) return
    const next = safeDraftFromConfig(payload.draft)
    const previous = baseline.current
    baseline.current = next
    setPublishReview(false)
    if (retainLocalDraft.current) { retainLocalDraft.current = false; return }
    const decision = draftRefreshDecision(previous, next, latestSceneDraft.current, acceptRefresh.current)
    if (decision !== 'accept') {
      if (decision === 'conflict') setConflict(true)
      return
    }
    acceptRefresh.current = false
    setRawDraft(next)
    setConflict(false)
  }, [payload])

  useEffect(() => bridge?.onSceneStatus((event) => {
    const sceneId = event.type === 'finished' ? event.result.sceneId : event.sceneId
    const config = latestSceneDraft.current
    const scene = (config?.avatarCatalog?.avatars.flatMap(a => a.scenes) ?? config?.scenes)?.find(s => s.id === sceneId)
    const name = scene?.name ?? 'Playback'
    if (event.type === 'finished') {
      const reasons = [...new Set(event.result.actions.flatMap(a => a.errorCode ? [a.errorCode] : []))]
      setResult(`${name}: ${event.result.status}.${reasons.length ? ` Reason: ${reasons.join(', ')}.` : ''}`)
    } else {
      const step = scene?.stages.find(s => s.id === event.stageId)
      setResult(`${name}: ${event.type === 'started' ? 'started' : `${step?.name ?? 'Step'} started`}.`)
    }
  }), [bridge])

  const disabled = !bridgeAvailable || bridge === null || draft === null || payload === null || busy || conflict || state.status !== 'success'
  const dirty = rawDraft !== null && payload !== null
    && draftFingerprint(safeDraftFromConfig(rawDraft)) !== draftFingerprint(safeDraftFromConfig(payload.draft))
  useEffect(() => onEditingChange?.(dirty || busy || conflict), [dirty, busy, conflict, onEditingChange])
  useEffect(() => { setPublishReview(false) }, [dirty, editingId, section])
  const activeAvatar = payload?.active.avatarCatalog?.avatars.find(a => a.id === payload.active.avatarCatalog?.activeAvatarId)
  const changes = payload ? workspaceChanges(safeDraftFromConfig(payload.active), safeDraftFromConfig(payload.draft)) : []
  const unsavedChanges = payload && rawDraft ? workspaceChanges(safeDraftFromConfig(payload.draft), rawDraft) : []
  const activationReason = avatarActivationReason(payload, editingId, dirty || conflict, lifecycle)
  const replaceAction = (actionId: string, next: SceneActionDefinition): void => {
    setDraft((current) => current === null ? current : {
      ...current,
      sceneActions: current.sceneActions.map((action) => action.id === actionId ? next : action),
    })
  }
  const runResponse = async (
    operation: () => Promise<ConsoleResponse<unknown>>,
    message = 'Operation completed.',
    refresh = true,
  ): Promise<void> => {
    if (refresh) setBusy(true)
    try {
      const response = await operation()
      const testFailed = response.ok && typeof response.value === 'object' && response.value !== null
        && 'result' in response.value && response.value.result === 'failed'
      setResult(response.ok ? testFailed ? 'Draft test failed; check saved media and configuration.' : message : `${response.error}: ${response.reason}${response.fields?.length
        ? ` · ${response.fields.map(field => `${field.path}: ${field.message}`).join(' · ')}` : ''}`)
      if (response.ok && refresh) { acceptRefresh.current = true; onChanged() }
    } catch {
      setResult('Console operation failed.')
    } finally {
      if (refresh) setBusy(false)
    }
  }

  const testSceneDraft = async (): Promise<void> => {
    if (bridge === null || payload === null) return
    setBusy(true)
    setMediaTestFailed(false)
    try {
      for (const asset of payload.draft.visualAssets) {
        const probe = await probeDraftVisualAsset(asset)
        if (probe.width !== asset.width || probe.height !== asset.height
          || asset.kind === 'video' && (!('durationMs' in probe)
            || Math.abs(probe.durationMs - (asset.durationMs ?? 0)) > Math.max(1000, (asset.durationMs ?? 0) * 0.02))) {
          throw new Error('visual_asset_probe_mismatch')
        }
      }
      await runResponse(() => bridge.testDraft(), 'Saved Draft media decoded; configuration test completed.')
    } catch {
      setMediaTestFailed(true)
      setResult('Draft media test failed: decode unavailable or metadata mismatch. Active is unchanged.')
    } finally {
      setBusy(false)
    }
  }

  const saveUnavailableReason = payload?.draft.avatarCatalog && !payload.draft.avatarCatalog.avatars.some(a => a.id === editingId)
    ? 'Save Draft first to create this avatar, then save individual steps.' : ''
  const testUnavailableReason = saveUnavailableReason || (payload?.active.avatarCatalog && editingId !== payload.active.avatarCatalog.activeAvatarId
    ? 'Load this avatar before testing its scenes. You can still edit and save its draft.' : '')
  const isSceneSaved = (sceneId: string, stepId?: string): boolean => {
    if (!rawDraft || !payload || saveUnavailableReason) return false
    const saved = safeDraftFromConfig(payload.draft)
    return isSceneDraftSaved(saved, rawDraft, editingId, sceneId, stepId)
  }
  const saveScene = async (sceneId: string, stepId?: string, test?: import('../../shared/scene-test-scope').SceneTestScope | 'scene'): Promise<void> => {
    if (!bridge || !payload || !rawDraft || busy) return
    const generation = ++sceneTestGeneration.current
    setBusy(true)
    setResult(`Saving ${stepId ? 'step' : 'scene'}${test ? ' for playback' : ''}…`)
    try {
      const next = buildSceneDraftSave(safeDraftFromConfig(payload.draft), rawDraft, editingId, sceneId, stepId)
      const saved = await bridge.saveDraft(next)
      if (!saved.ok) {
        setResult(`Cannot save: ${saved.fields?.map(f => `${f.path}: ${f.message}`).join('; ') || saved.reason}`)
        return
      }
      retainLocalDraft.current = true
      onChanged()
      if (generation !== sceneTestGeneration.current) return
      const label = stepId ? 'Step' : 'Scene'
      setResult(`${label} saved to draft. Nothing published; other unfinished edits remain in the editor.`)
      if (test) {
        const response = await bridge.runScene(sceneId, test === 'scene' ? undefined : test, 'draft')
        if (generation !== sceneTestGeneration.current) return
        setResult(!response.ok ? `Test unavailable: ${response.reason}` : response.value.status === 'skipped'
          ? `Test did not start: ${response.value.skipReason}. Check that the scene and its actions are enabled and complete.`
          : `${label} draft test started on the Mirror. Use Stop test to end playback.`)
      }
    } catch { setResult('Could not save or test this draft. Check the Console connection and try again.') }
    finally { setBusy(false) }
  }
  const stopSceneTests = (message: string): void => {
    ++sceneTestGeneration.current
    if (bridge) void runResponse(() => bridge.stopScenes(), message, false)
  }

  return (
    <section className="console__panel console__scenes" aria-labelledby="console-scenes">
      <div className="console__panel-heading profile-workspace-heading">
        <div>
          <p className="console__eyebrow">Avatar workspace</p>
          <h2 id="console-scenes">{LIBRARY_SECTIONS.includes(section as typeof LIBRARY_SECTIONS[number]) ? 'Shared library' : 'Avatars'}</h2>
        </div>
      </div>

      {state.status === 'failure' ? <p className="console__fault">{state.error}: {state.reason} <button disabled={!bridgeAvailable} onClick={onChanged}>Retry loading saved configuration</button></p> : null}
      <p className="console__sr-only" aria-live="polite">{result}</p>

      {conflict ? <div className="console__fault" role="alert">The saved configuration changed while you were editing. Your edits are retained; saving is blocked to prevent overwriting newer changes.
        <button onClick={() => { if (payload) setRawDraft(safeDraftFromConfig(payload.draft)); setConflict(false) }}>Discard my edits and reload saved changes</button>
      </div> : null}
      <div className="profile-workspace">
      {rawDraft?.avatarCatalog && editingAvatar ? <aside className="avatar-selector profile-rail" aria-label="Avatar profiles">
        <label>Editing avatar<select aria-label="Editing avatar" title={`${editingAvatar.name} · ${editingId}`} disabled={busy} value={editingId} onChange={e => setEditingAvatarId(e.currentTarget.value)}>
          {rawDraft.avatarCatalog.avatars.map(a => <option key={a.id} value={a.id}>{a.name} · {a.id.slice(-8)}{a.id === payload?.active.avatarCatalog?.activeAvatarId ? ' · On Mirror' : ''}</option>)}
        </select></label>
        <p className="profile-rail__context"><strong>{editingAvatar.name}</strong><span>{editingId.slice(-8)}</span></p>
        <p className="profile-rail__context"><small>ON MIRROR</small>{activeAvatar?.id === editingId ? <span>This avatar</span> : <strong>{activeAvatar?.name ?? 'Connecting…'}</strong>}</p>
        <div className="console__action-row">
        <button type="button" disabled={disabled || rawDraft.avatarCatalog.avatars.length >= 32} onClick={() => {
          const next = newAvatar(crypto.randomUUID())
          setRawDraft({ ...rawDraft, avatarCatalog: { ...rawDraft.avatarCatalog!, avatars: [...rawDraft.avatarCatalog!.avatars, next] } }); setEditingAvatarId(next.id)
          setSection('Persona'); setResult('New avatar created with neutral defaults. Configure its persona, appearance, voice and spells.')
        }}>New avatar</button>
        <button type="button" disabled={disabled || rawDraft.avatarCatalog.avatars.length >= 32} onClick={() => {
          const next = { ...structuredClone(editingAvatar), id: crypto.randomUUID(), name: `${editingAvatar.name.slice(0, 70)} copy` }
          next.scenes = next.scenes.filter(s => s.stages.every(st => st.actionIds.every(id => {
            const action = rawDraft.sceneActions.find(a => a.id === id)
            return !!action && canUseAvatarAction(rawDraft.avatarCatalog, next.id, action)
          })))
          next.spells = next.spells.filter(s => next.scenes.some(scene => scene.id === s.sceneId))
          if (next.presentation.backgroundId && !canUseAvatarResource(rawDraft.avatarCatalog!, next.id, 'visual', next.presentation.backgroundId)) next.presentation.backgroundId = ''
          if (next.presentation.ambienceId && !canUseAvatarResource(rawDraft.avatarCatalog!, next.id, 'music', next.presentation.ambienceId)) next.presentation.ambienceId = ''
          setRawDraft({ ...rawDraft, avatarCatalog: { ...rawDraft.avatarCatalog!, avatars: [...rawDraft.avatarCatalog!.avatars, next] } }); setEditingAvatarId(next.id)
          setResult('Avatar duplicated. Shared links retained; owner-locked scenes/media were not copied.')
        }}>Duplicate</button>
        </div>
        <button type="button" disabled={disabled || !!activationReason} aria-describedby="avatar-activation-reason"
          onClick={() => { setPreviewRevision(v => v + 1); if (bridge) void runResponse(() => bridge.loadAvatar(editingId), 'Avatar loaded. The next wake starts a fresh conversation.') }}>Use on Mirror</button>
        <p id="avatar-activation-reason" className="console__muted">{activationReason || 'Switch the published character. Editing alone does not switch the Mirror.'}</p>
        <nav aria-label="Shared library" className="profile-rail__library"><h3>Shared library</h3><p>Reusable across avatars</p>
          {LIBRARY_SECTIONS.map(label => <button key={label} aria-pressed={section === label} onClick={() => setSection(label)}>{label}</button>)}
        </nav>
      </aside> : null}
      <div className="profile-workspace__editor">
      <nav className="console__subnav profile-sections" aria-label="Avatar settings">
        {PROFILE_SECTIONS.map(label => <button key={label} type="button" aria-pressed={section === label} onClick={() => setSection(label)}>{label}</button>)}
      </nav>
      <div className="profile-section-heading"><p hidden={!LIBRARY_SECTIONS.includes(section as typeof LIBRARY_SECTIONS[number]) && editingId === activeAvatar?.id} className="console__eyebrow">{LIBRARY_SECTIONS.includes(section as typeof LIBRARY_SECTIONS[number]) ? 'Shared resource' : `Editing ${editingAvatar?.name ?? 'avatar'}`}</p><h3>{section}</h3>
        <p>{section === 'Persona' ? 'Who this character is, and how it greets visitors.' : section === 'Appearance' ? 'Its Cubism avatar, background and entrance.' : section === 'Voice' ? 'How this character sounds. Preview before publishing.' : section === 'Spells & scenes' ? 'Phrases that trigger this avatar’s scenes and actions.' : 'Changes here can affect every avatar using the resource.'}</p>
      </div>

      {visible && voiceOnly && editingAvatar ? <VoiceStudio key={`${editingId}-${previewRevision}`} avatar={editingAvatar} model={editingModel} bridge={bridge} disabled={disabled} onChange={updateAvatar} /> : null}
      {editorView === 'rigs' ? <CubismStudio bridge={bridge} visible={visible} /> : null}
      {dialogueOnly && !voiceOnly && avatarView === 'character' && editingAvatar ? <AvatarCharacterEditor avatar={editingAvatar} disabled={disabled} onChange={updateAvatar} /> : null}
      {dialogueOnly && !voiceOnly && avatarView === 'appearance' && editingAvatar && rawDraft?.avatarCatalog ? <fieldset disabled={disabled}><legend>Cubism model</legend>
        <div className="console__action-row"><label>Model bundle<select disabled={disabled} value={editingAvatar.modelId} onChange={e => {
          const modelId = e.currentTarget.value
          const model = availableModels.find(item => item.id === modelId)
          const catalog = rawDraft.avatarCatalog!
          if (model && !catalog.models.some(item => item.id === model.id) && catalog.models.length >= 32) { setResult('Avatar catalog is full (32 models).'); return }
          updateCatalog({ ...catalog, models: model && !catalog.models.some(item => item.id === model.id) ? [...catalog.models, model] : catalog.models,
            avatars: catalog.avatars.map(avatar => avatar.id === editingAvatar.id ? { ...avatar, modelId } : avatar) })
        }}>
          <option value="builtin-ren">Built-in Ren</option>{availableModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select></label><button type="button" disabled={disabled || rawDraft.avatarCatalog.models.length >= 32} onClick={() => {
          if (!bridge) return
          setBusy(true)
          void bridge.importAvatarModel().then(response => {
            if (!response.ok) { setResult(`Model import failed: ${response.fields?.[0]?.message ?? response.reason}`); return }
            const model = response.value
            if (!model) { setResult('Model import cancelled.'); return }
            updateCatalog({ ...rawDraft.avatarCatalog!, models: [...rawDraft.avatarCatalog!.models, model],
              avatars: rawDraft.avatarCatalog!.avatars.map(a => a.id === editingId ? { ...a, modelId: model.id } : a) })
            setResult('Cubism bundle imported. Open Appearance to preview, then Save / Test / Publish.')
          }).catch(() => setResult('Model import failed.')).finally(() => setBusy(false))
        }}>Browse & import Cubism…</button></div>
        <details><summary>Bundle requirements</summary><p>Select a model3.json beside its assets. Requires EyeBlink/LipSync, expressions, physics and Dormant / Waking / Listening / Thinking / Speaking / Scene / Suspending motion groups. Files are copied locally; originals stay unchanged.</p></details>
        <p className="console__muted">Import adds a shared library rig and assigns it to this avatar’s draft. Save and publish to apply.</p>
      </fieldset> : null}
      {visible && section === 'Appearance' ? <details key={`rig-${editingId}`}><summary>Advanced rig preview · local only</summary><CubismStudio key={editingAvatar?.modelId} bridge={bridge} visible={visible} assignedModel={editingModel ?? null} /></details> : null}

      {dialogueOnly && !voiceOnly && avatarView === 'character' && draft ? <fieldset disabled={disabled} className="avatar-spoken-lines"><legend>Spoken lines</legend><div className="console__form-grid">
        <label>Wake greeting<textarea maxLength={500} value={draft.presentation?.wakeGreeting ?? DEFAULT_PRESENTATION.wakeGreeting} onChange={e => setDraft({ ...draft, presentation: { ...DEFAULT_PRESENTATION, ...draft.presentation, wakeGreeting: e.currentTarget.value } })} /></label>
        <label>Sleep farewell (verbatim)<textarea maxLength={500} value={draft.presentation?.sleepFarewell ?? DEFAULT_PRESENTATION.sleepFarewell} onChange={e => setDraft({ ...draft, presentation: { ...DEFAULT_PRESENTATION, ...draft.presentation, sleepFarewell: e.currentTarget.value } })} /></label>
        <p className="console__muted">Leave the greeting empty for silent wake. The sleep farewell must contain text; the mirror waits for its playback to end before sleeping. Scene and dialogue edits share the same draft.</p>
      </div></fieldset> : null}
      {!dialogueOnly && importFailures.length ? <div className="media-import-results" role="alert"><strong>Some files were not imported</strong><ul>{importFailures.map((f, i) => <li key={i}>{f.name}: {f.reason}</li>)}</ul></div> : null}
      {visible && !dialogueOnly && draft && bridge && editorView === 'media' ? <MediaLibrary draft={draft} bridge={bridge} disabled={disabled} avatarId={editingId} onCatalogChange={updateCatalog} onImport={() => void importMedia({ kind: 'all', multiple: true })} /> : null}
      {!dialogueOnly && resourceDraft && payload && editorView === 'scenes' ? <SceneComposer key={editingId} draft={resourceDraft} active={editingId === payload.active.avatarCatalog?.activeAvatarId ? payload.active : { ...payload.active, scenes: [] }} disabled={disabled} onChange={mergeResourceDraft}
        onSave={(id, stepId) => void saveScene(id, stepId)} isSaved={isSceneSaved}
        onTest={(id, scope) => void saveScene(id, scope?.stageId, scope ?? 'scene')}
        onStop={() => stopSceneTests('Test stopped.')}
        saveUnavailableReason={saveUnavailableReason} testUnavailableReason={testUnavailableReason} result={result}
        onImport={(kind, actionId) => void importMedia({ kind, multiple: false }, actionId)}
        onRun={(id, scope) => bridge && void runResponse(() => bridge.runScene(id, scope), 'Published playback requested.', false)} /> : null}
      {visible && resourceDraft && section === 'Appearance' ? <PresentationEditor key={editingId} draft={resourceDraft} model={editingModel ? { id: editingModel.id, manifestFileName: editingModel.manifestFileName } : undefined} disabled={disabled} onChange={mergeResourceDraft} /> : null}
      {!dialogueOnly && draft && editorView === 'library' ? <fieldset disabled={disabled}><legend>Reusable actions</legend>
        <p className="console__muted">Actions are created inside steps. Editing a shared action affects every linked step.</p>
        {draft.sceneActions.map(action => <details key={action.id}><summary>{action.name} · {action.kind}</summary>
          <p>Used by: {draft.avatarCatalog?.avatars.filter(a => a.scenes.some(s => s.stages.some(st => st.actionIds.includes(action.id)))).map(a => `${a.name} · ${a.id.slice(-8)}`).join(', ') || 'No avatars yet'}</p>
          <ResourceAccess catalog={draft.avatarCatalog} avatarId={editingId} kind="action" resourceId={action.id} disabled={disabled} onChange={updateCatalog} />
          <fieldset disabled={!canUseAvatarAction(draft.avatarCatalog, editingId, action)}>
          <SceneActionFields action={action} draft={resourceDraft ?? draft} onChange={next => replaceAction(action.id, next)} onImport={kind => void importMedia({ kind, multiple: false }, action.id)} />
          <button type="button" disabled={(draft.avatarCatalog?.avatars.flatMap(a => a.scenes) ?? draft.scenes).some(s => s.stages.some(st => st.actionIds.includes(action.id))) || !!draft.avatarCatalog?.locks.some(l => l.kind === 'action' && l.resourceId === action.id)}
            onClick={() => setDraft({ ...draft, sceneActions: draft.sceneActions.filter(a => a.id !== action.id) })}>Delete unused action</button>
          </fieldset>
        </details>)}
      </fieldset> : null}
      <div className="console__action-row console__publish-bar">
        <div className="profile-publish-status"><span>Published v{payload?.active.configVersion ?? '—'} · {dirty ? 'Unsaved changes' : payload?.publishDiff.changed.length ? 'Awaiting publish' : 'Up to date'}</span>
        {section === 'Spells & scenes' && <span className="console__status console__status--mock">Lighting / Fog: {draft?.adapters.lighting === 'physical' || draft?.adapters.fog === 'physical' ? 'Physical not connected' : 'Mock'}</span>}
        <details className="profile-scope-details"><summary>Change scope</summary><p className="profile-change-scope">{dirty ? `Unsaved: ${unsavedChanges.join(', ') || 'Configuration'}` : `Publish scope: ${changes.join(', ') || 'No changes'}`}</p></details></div>
        <div className="profile-publish-actions">
        <HelpButton help="Save all unfinished workspace edits, including other scenes and avatar settings. Nothing is published." disabled={disabled} onClick={() => bridge && rawDraft && void runResponse(() => bridge.saveDraft(projectAvatarDraft(rawDraft)), 'Draft saved.')}>Save all changes</HelpButton>
        <HelpButton help={dirty ? 'Save all changes first: checking uses the saved draft.' : 'Check saved configuration and decode media before publishing. Use Test step or Test scene for playback.'} disabled={disabled || dirty} onClick={() => void testSceneDraft()}>Check saved changes</HelpButton>
        <HelpButton help={dirty ? 'Save and check changes before publishing.' : mediaTestFailed || payload?.draftTest?.result !== 'mock_passed' ? 'Check saved changes successfully before publishing.' : 'Review every affected avatar and shared setting before publishing.'} disabled={disabled || dirty || mediaTestFailed || payload?.draftTest?.result !== 'mock_passed' || payload === null || !payload.publishDiff.changed.length} onClick={() => setPublishReview(true)}>Publish all changes</HelpButton>
        <button type="button" disabled={!bridgeAvailable || bridge === null} onClick={() => stopSceneTests('All Scenes stopped.')}>Stop All</button>
        </div>
        {publishReview && <div className="profile-publish-confirmation" role="group" aria-label="Confirm publication"><strong>Publish this entire saved draft?</strong><p>{changes.join(', ') || 'Saved configuration'}. Changes apply to the next conversation. This does not switch the selected avatar.</p>
          <button disabled={disabled || dirty || payload?.draftTest?.result !== 'mock_passed'} onClick={() => { setPublishReview(false); setPreviewRevision(v => v + 1); if (bridge && payload) void runResponse(() => bridge.publish(confirmationFromDiff(payload.publishDiff)), 'Draft published.') }}>Confirm publish</button>
          <button onClick={() => setPublishReview(false)}>Keep editing</button>
        </div>}
        <p className="console__scene-result" role="status">{result}</p>
      </div>
      </div></div>
    </section>
  )
}

export function ModelsPanel({
  state,
  bridge,
  bridgeAvailable,
  onChanged,
  onEditingChange,
}: ModelsPanelProps): React.JSX.Element {
  const payload = state.status === 'success' ? state.value : null
  const [draft, setDraft] = useState<ConsoleModelDraftInput>({
    realtimeDialogue: '',
    inputTranscription: '',
    memoryExtractor: '',
  })
  const [busy, setBusy] = useState(false)
  const dirty = payload !== null && Object.entries(draft).some(([role, value]) => value !== (payload.cards.find(c => c.role === role)?.draft.modelId ?? ''))
  useEffect(() => onEditingChange?.(dirty || busy), [dirty, busy, onEditingChange])

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
    setBusy(true)
    try {
      await action()
      onChanged()
    } catch {
      onChanged()
    } finally { setBusy(false) }
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
  const [activePage, setActivePage] = useState<(typeof PAGES)[number]>('Mirror')
  const [systemPage, setSystemPage] = useState<(typeof SYSTEM_PAGES)[number]>('Devices')
  const [avatarEditing, setAvatarEditing] = useState(false)
  const [configEditing, setConfigEditing] = useState(false)
  const [modelsEditing, setModelsEditing] = useState(false)
  const [navigationMessage, setNavigationMessage] = useState('')
  const navigate = (page: typeof PAGES[number], subpage = systemPage): void => {
    const owner = page === 'Avatars' ? 'Avatars' : page === 'System' && ['Config', 'Models'].includes(subpage) ? subpage : null
    const locked = avatarEditing ? 'Avatars' : configEditing ? 'Config' : modelsEditing ? 'Models' : null
    if (locked && owner && locked !== owner) { setNavigationMessage(`Save the unfinished changes in ${locked} before opening ${owner}. Your edits are retained.`); return }
    setNavigationMessage(''); setActivePage(page); setSystemPage(subpage)
  }
  useEffect(() => {
    if (!avatarEditing && !configEditing && !modelsEditing) return
    const guard = (event: BeforeUnloadEvent): void => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [avatarEditing, configEditing, modelsEditing])
  const [bridgeAvailable, setBridgeAvailable] = useState(false)
  const [bridgeError, setBridgeError] = useState<ConsoleFailure | null>(null)
  const [overviewState, setOverviewState] = useState<OverviewState>({ status: 'loading' })
  const [eventsState, setEventsState] = useState<EventsState>({
    status: 'loading',
    events: [],
    nextBeforeSequence: null,
  })
  const [selectedPhase, setSelectedPhase] = useState<PhaseTestPhase>('4')
  const [phaseTestsState, setPhaseTestsState] = useState<PhaseTestsViewState>({ status: 'loading' })
  const [lifecycleActionState, setLifecycleActionState] = useState<LifecycleActionState>({ status: 'idle' })
  const [simulatorState, setSimulatorState] = useState<SimulatorState>({ status: 'idle' })
  const [configState, setConfigState] = useState<ConfigState>({ status: 'loading' })
  const [modelsState, setModelsState] = useState<ModelsState>({ status: 'loading' })
  const [avatarRuntimeState, setAvatarRuntimeState] = useState<AvatarRuntimeState>({ status: 'loading' })
  const [moduleFilter, setModuleFilter] = useState<EventModuleFilter>('all')
  const [statusFilter, setStatusFilter] = useState<EventStatusFilter>('all')
  const [sourceFilter, setSourceFilter] = useState<EventSourceFilter>('all')
  const bridgeRef = useRef<ConsoleBridge | null>(null)
  const mountedRef = useRef(false)
  const didNotifyReadyRef = useRef(false)
  const didLoadOverviewRef = useRef(false)
  const overviewRequestIdRef = useRef(0)
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
    const requestId = ++overviewRequestIdRef.current
    try {
      const overviewResponse = await bridge.getOverview()
      if (!mountedRef.current || requestId !== overviewRequestIdRef.current) return
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
      if (!mountedRef.current || requestId !== overviewRequestIdRef.current) return
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
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = bridge.onSnapshot(() => {
      if (timer !== undefined) return
      timer = setTimeout(() => { timer = undefined; void requestOverview(bridge) }, 50)
    })
    return () => { unsubscribe(); clearTimeout(timer); overviewRequestIdRef.current += 1 }
  }, [bridgeAvailable])

  useEffect(() => {
    const bridge = bridgeRef.current
    if (bridge === null || !bridgeAvailable) return
    void requestPhaseTests(bridge, selectedPhase)
  }, [bridgeAvailable, selectedPhase])

  useEffect(() => {
    if (activePage !== 'System' || systemPage !== 'Devices' || !bridgeAvailable) return
    const bridge = bridgeRef.current
    if (bridge === null) return
    let stopped = false
    const refresh = async (): Promise<void> => {
      try {
        const response = await bridge.getAvatarRuntime()
        if (stopped || !mountedRef.current) return
        const failure = requestFailure(response)
        if (failure !== null) setAvatarRuntimeState({ status: 'failure', ...failure })
        else if (response.ok) setAvatarRuntimeState({ status: 'success', value: response.value })
      } catch {
        if (!stopped && mountedRef.current) setAvatarRuntimeState({ status: 'failure', ...BRIDGE_FAILURE })
      }
    }
    void refresh()
    const interval = window.setInterval(() => void refresh(), 500)
    return () => {
      stopped = true
      window.clearInterval(interval)
    }
  }, [activePage, systemPage, bridgeAvailable])

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

  const interrupt = (): void => {
    runLifecycleAction('interrupt', (bridge) => bridge.interrupt())
  }

  const disconnect = (): void => {
    runLifecycleAction('disconnect', (bridge) => bridge.disconnect())
  }

  const controlAvatar = (command: AvatarControlCommand): void => {
    const bridge = bridgeRef.current
    if (bridge === null || !bridgeAvailable || !developerMode) return
    void bridge.controlAvatar(command).then(
      (response) => {
        if (mountedRef.current && response.ok) setAvatarRuntimeState({ status: 'success', value: response.value })
        else if (mountedRef.current && !response.ok) setAvatarRuntimeState({ status: 'failure', error: response.error, reason: response.reason })
      },
      () => {
        if (mountedRef.current) setAvatarRuntimeState({ status: 'failure', ...BRIDGE_FAILURE })
      },
    )
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
          <h1 className="console__title">Magic Mirror Console</h1>
        </div>
        <span className="console__status">{overviewState.status === 'success' ? overviewState.value.lifecycle : 'Connecting'}</span>
      </header>

      {bridgeError ? (
        <p className="console__fault" role="status">Console bridge unavailable: {bridgeError.error}; {bridgeError.reason}</p>
      ) : null}

      <div hidden={activePage !== 'Mirror'}><LifecycleControls
        lifecycle={overviewState.status === 'success' ? overviewState.value.lifecycle : undefined}
        bridgeAvailable={bridgeAvailable}
        state={lifecycleActionState}
        onStartConversation={startConversation}
        onInterrupt={interrupt}
        onDisconnect={disconnect}
      /></div>

      <nav className="console__tabs" aria-label="Console pages">
        {PAGES.map(page => <button key={page} type="button" className={activePage === page ? 'console__tab console__tab--active' : 'console__tab'}
          aria-current={activePage === page ? 'page' : undefined} onClick={() => navigate(page, page === 'System' ? 'Devices' : systemPage)}>{page}</button>)}
      </nav>
      {navigationMessage && <div className="console__fault" role="alert">{navigationMessage}<button onClick={() => {
        setActivePage(avatarEditing ? 'Avatars' : 'System'); setSystemPage(configEditing ? 'Config' : 'Models'); setNavigationMessage('')
      }}>Return to unfinished changes</button></div>}
      {activePage === 'System' && <nav className="console__subnav profile-sections" aria-label="System settings">
        {SYSTEM_PAGES.map(page => <button key={page} aria-pressed={systemPage === page} onClick={() => navigate('System', page)}>{page === 'Config' ? 'Advanced config' : page}</button>)}
      </nav>}

      <div className="console__panels">
        <div hidden={activePage !== 'Mirror'}>
          <OverviewPanel state={overviewState} configState={configState} />
        </div>
        <div hidden={activePage !== 'Avatars'}>
          <ScenesPanel
            visible={activePage === 'Avatars'}
            lifecycle={overviewState.status === 'success' ? overviewState.value.lifecycle : undefined}
            onEditingChange={setAvatarEditing}
            state={configState}
            bridge={bridgeRef.current}
            bridgeAvailable={bridgeAvailable}
            onChanged={refreshConfigAndModels}
          />
        </div>
        <div hidden={activePage !== 'System' || systemPage !== 'Devices'}>
          <AvatarAudioPanel
            state={avatarRuntimeState}
            disabled={!bridgeAvailable || !developerMode}
            onCommand={controlAvatar}
          />
        </div>
        <div hidden={activePage !== 'System' || systemPage !== 'Simulator'}>
          <SimulatorPanel
            developerMode={developerMode}
            bridgeAvailable={bridgeAvailable}
            state={simulatorState}
            onSimulate={runSimulation}
          />
        </div>
        <div hidden={activePage !== 'System' || systemPage !== 'Events'}>
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
        <div hidden={activePage !== 'System' || systemPage !== 'Phase Tests'}>
          <label htmlFor="console-phase-selector">Phase
            <select
              id="console-phase-selector"
              value={selectedPhase}
              onChange={(event) => {
                const nextPhase = event.currentTarget.value
                if (
                  nextPhase === '0'
                  || nextPhase === '1'
                  || nextPhase === '2'
                  || nextPhase === '3'
                  || nextPhase === '4'
                ) setSelectedPhase(nextPhase)
              }}
            >
              <option value="4">Phase 4</option>
              <option value="3">Phase 3</option>
              <option value="2">Phase 2</option>
              <option value="1">Phase 1</option>
              <option value="0">Phase 0</option>
            </select>
          </label>
          <PhaseTestsPanel
            state={phaseTestsState}
            selectedPhase={selectedPhase}
          />
        </div>
        <div hidden={activePage !== 'System' || systemPage !== 'Config'}>
          <ConfigPanel
            onEditingChange={setConfigEditing}
            state={configState}
            bridge={bridgeRef.current}
            bridgeAvailable={bridgeAvailable}
            onChanged={refreshConfigAndModels}
          />
        </div>
        <div hidden={activePage !== 'System' || systemPage !== 'Models'}>
          <ModelsPanel
            onEditingChange={setModelsEditing}
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

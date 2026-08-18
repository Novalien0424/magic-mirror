import { appendFile, mkdir, rename, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'

import type { MirrorEvent, ModuleId } from '../shared/types'

export type TelemetryEventInput = Omit<MirrorEvent, 'time'>
export type TelemetrySource = NonNullable<MirrorEvent['source']>

export interface TelemetryFileOperations {
  ensureDirectory(directoryPath: string): Promise<void>
  size(filePath: string): Promise<number | null>
  append(filePath: string, data: string): Promise<void>
  rename(fromPath: string, toPath: string): Promise<void>
  remove(filePath: string): Promise<void>
}

export type TelemetryClock = () => string

export interface TelemetryDrainScheduler {
  schedule(drain: () => Promise<void>): void
}

export interface TelemetryOptions {
  directory: string
  filePrefix?: string
  clock?: TelemetryClock
  files?: TelemetryFileOperations
  scheduler?: TelemetryDrainScheduler
}

export interface TelemetryPageRequest {
  limit?: number
  beforeSequence?: number
  module?: ModuleId
  status?: MirrorEvent['status']
  source?: TelemetrySource
}

export interface TelemetryPage {
  events: ReadonlyArray<MirrorEvent>
  nextBeforeSequence: number | null
}

export interface TelemetryCounters {
  telemetryDroppedCount: number
  ramEvictedCount: number
  rejectedEventCount: number
  extraFieldStrippedCount: number
  writerFailureCount: number
  rotationFailureCount: number
  schedulerFailureCount: number
}

export interface TelemetryStats extends TelemetryCounters {
  ramEventCount: number
  queueDepth: number
  closed: boolean
}

export interface Telemetry {
  emit(event: TelemetryEventInput): void
  readPage(request?: TelemetryPageRequest): TelemetryPage
  getStats(): TelemetryStats
  flush(): Promise<void>
  close(): Promise<void>
}

export interface WakeTelemetryMetadata {
  keyword: string
  configured_threshold: number
  boost: number
  num_trailing_blanks: number
}

export const TELEMETRY_DEFAULTS = Object.freeze({
  ramLimit: 2000,
  queueLimit: 1000,
  maxFileBytes: 5242880,
  maxFiles: 5,
  pageSize: 50,
  maxPageSize: 200,
  filePrefix: 'telemetry',
} as const)

export type TelemetryInternalErrorCode =
  | 'telemetry_event_invalid'
  | 'telemetry_queue_full'
  | 'telemetry_writer_failed'
  | 'telemetry_rotation_failed'
  | 'telemetry_scheduler_failed'
  | 'telemetry_closed'

const MODULE_IDS: ReadonlySet<ModuleId> = new Set([
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
])

const STATUS_VALUES: ReadonlySet<MirrorEvent['status']> = new Set([
  'success',
  'degraded',
  'failed',
  'info',
])

const SOURCE_VALUES: ReadonlySet<TelemetrySource> = new Set([
  'runtime',
  'simulator',
  'contract_test',
])

const ALLOWED_FIELDS = new Set([
  'module',
  'event',
  'status',
  'duration_ms',
  'error_code',
  'session_id',
  'scene_id',
  'reason',
  'source',
])

const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/
const ERROR_CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/
const REASON_PATTERN = /^[A-Za-z0-9_=;.%:+,/?-]+$/
const CANONICAL_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const FILE_PREFIX_PATTERN = /^[A-Za-z0-9_-]+$/

const READ_FAILED = Symbol('telemetry_field_read_failed')

type InternalEventName =
  | 'telemetry_event_rejected'
  | 'telemetry_extra_fields_stripped'
  | 'telemetry_queue_drop'
  | 'telemetry_writer_degraded'
  | 'telemetry_scheduler_degraded'
  | 'telemetry_emit_ignored'

interface StoredEvent {
  sequence: number
  event: MirrorEvent
}

type NormalizationResult =
  | { accepted: true; event: TelemetryEventInput; extraFieldCount: number }
  | { accepted: false; field: string }

type WriteResult = 'written' | 'writer_failure' | 'rotation_failure'

function matchesWhole(pattern: RegExp, value: string): boolean {
  const match = pattern.exec(value)
  return match !== null && match[0] === value
}

function isMissingError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false

  try {
    return (error as { code?: unknown }).code === 'ENOENT'
  } catch {
    return false
  }
}

const defaultFileOperations: TelemetryFileOperations = {
  async ensureDirectory(directoryPath) {
    await mkdir(directoryPath, { recursive: true })
  },

  async size(filePath) {
    try {
      const fileStats = await stat(filePath)
      return fileStats.size
    } catch (error) {
      if (isMissingError(error)) return null
      throw error
    }
  },

  async append(filePath, data) {
    await appendFile(filePath, data, 'utf8')
  },

  async rename(fromPath, toPath) {
    try {
      await rename(fromPath, toPath)
    } catch (error) {
      if (isMissingError(error)) return
      throw error
    }
  },

  async remove(filePath) {
    try {
      await unlink(filePath)
    } catch (error) {
      if (isMissingError(error)) return
      throw error
    }
  },
}

const defaultScheduler: TelemetryDrainScheduler = {
  schedule(drain) {
    setImmediate(() => {
      void drain()
    })
  },
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== 24 || !CANONICAL_TIME_PATTERN.test(value)) {
    return false
  }

  try {
    return new Date(value).toISOString() === value
  } catch {
    return false
  }
}

function fallbackTimestamp(): string {
  return new Date().toISOString()
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isModuleId(value: unknown): value is ModuleId {
  return typeof value === 'string' && MODULE_IDS.has(value as ModuleId)
}

function isStatus(value: unknown): value is MirrorEvent['status'] {
  return typeof value === 'string' && STATUS_VALUES.has(value as MirrorEvent['status'])
}

function isSource(value: unknown): value is TelemetrySource {
  return typeof value === 'string' && SOURCE_VALUES.has(value as TelemetrySource)
}

function countUnknownEnumerableFields(record: Record<string, unknown>): number | null {
  try {
    let count = 0
    for (const key of Object.keys(record)) {
      if (!ALLOWED_FIELDS.has(key)) count += 1
    }

    for (const symbol of Object.getOwnPropertySymbols(record)) {
      if (Object.prototype.propertyIsEnumerable.call(record, symbol)) count += 1
    }

    return count
  } catch {
    return null
  }
}

function readField(record: Record<string, unknown>, field: string): unknown {
  try {
    return record[field]
  } catch {
    return READ_FAILED
  }
}

function normalizeInput(value: unknown): NormalizationResult {
  if (!isRecordObject(value)) return { accepted: false, field: 'input' }

  const extraFieldCount = countUnknownEnumerableFields(value)
  if (extraFieldCount === null) return { accepted: false, field: 'input' }

  const moduleValue = readField(value, 'module')
  if (moduleValue === READ_FAILED || !isModuleId(moduleValue)) {
    return { accepted: false, field: 'module' }
  }

  const eventValue = readField(value, 'event')
  if (eventValue === READ_FAILED || typeof eventValue !== 'string' || !matchesWhole(EVENT_NAME_PATTERN, eventValue)) {
    return { accepted: false, field: 'event' }
  }

  const statusValue = readField(value, 'status')
  if (statusValue === READ_FAILED || !isStatus(statusValue)) {
    return { accepted: false, field: 'status' }
  }

  const durationValue = readField(value, 'duration_ms')
  if (durationValue === READ_FAILED) return { accepted: false, field: 'duration_ms' }
  if (
    durationValue !== undefined
    && (typeof durationValue !== 'number'
      || !Number.isFinite(durationValue)
      || durationValue < 0
      || durationValue > 86400000)
  ) {
    return { accepted: false, field: 'duration_ms' }
  }

  const errorCodeValue = readField(value, 'error_code')
  if (errorCodeValue === READ_FAILED) return { accepted: false, field: 'error_code' }
  if (
    errorCodeValue !== undefined
    && (typeof errorCodeValue !== 'string' || !matchesWhole(ERROR_CODE_PATTERN, errorCodeValue))
  ) {
    return { accepted: false, field: 'error_code' }
  }

  const sessionIdValue = readField(value, 'session_id')
  if (sessionIdValue === READ_FAILED) return { accepted: false, field: 'session_id' }
  if (
    sessionIdValue !== undefined
    && (typeof sessionIdValue !== 'string' || !matchesWhole(SAFE_IDENTIFIER_PATTERN, sessionIdValue))
  ) {
    return { accepted: false, field: 'session_id' }
  }

  const sceneIdValue = readField(value, 'scene_id')
  if (sceneIdValue === READ_FAILED) return { accepted: false, field: 'scene_id' }
  if (
    sceneIdValue !== undefined
    && (typeof sceneIdValue !== 'string' || !matchesWhole(SAFE_IDENTIFIER_PATTERN, sceneIdValue))
  ) {
    return { accepted: false, field: 'scene_id' }
  }

  const reasonValue = readField(value, 'reason')
  if (reasonValue === READ_FAILED) return { accepted: false, field: 'reason' }
  if (
    reasonValue !== undefined
    && (typeof reasonValue !== 'string'
      || reasonValue.length > 1024
      || !matchesWhole(REASON_PATTERN, reasonValue))
  ) {
    return { accepted: false, field: 'reason' }
  }

  const sourceValue = readField(value, 'source')
  if (sourceValue === READ_FAILED) return { accepted: false, field: 'source' }
  if (sourceValue !== undefined && !isSource(sourceValue)) {
    return { accepted: false, field: 'source' }
  }

  const duration: number | undefined = durationValue === undefined ? undefined : (durationValue as number)
  const errorCode: string | undefined = errorCodeValue === undefined ? undefined : (errorCodeValue as string)
  const sessionId: string | undefined = sessionIdValue === undefined ? undefined : (sessionIdValue as string)
  const sceneId: string | undefined = sceneIdValue === undefined ? undefined : (sceneIdValue as string)
  const reason: string | undefined = reasonValue === undefined ? undefined : (reasonValue as string)
  const source: TelemetrySource = sourceValue === undefined ? 'runtime' : (sourceValue as TelemetrySource)
  const normalized: TelemetryEventInput = {
    module: moduleValue,
    event: eventValue,
    status: statusValue,
  }
  if (duration !== undefined) normalized.duration_ms = duration
  if (errorCode !== undefined) normalized.error_code = errorCode
  if (sessionId !== undefined) normalized.session_id = sessionId
  if (sceneId !== undefined) normalized.scene_id = sceneId
  if (reason !== undefined) normalized.reason = reason
  normalized.source = source

  return { accepted: true, event: normalized, extraFieldCount }
}

function serializeEvent(event: MirrorEvent): string {
  const normalized: MirrorEvent = {
    time: event.time,
    module: event.module,
    event: event.event,
    status: event.status,
  }
  if (event.duration_ms !== undefined) normalized.duration_ms = event.duration_ms
  if (event.error_code !== undefined) normalized.error_code = event.error_code
  if (event.session_id !== undefined) normalized.session_id = event.session_id
  if (event.scene_id !== undefined) normalized.scene_id = event.scene_id
  if (event.reason !== undefined) normalized.reason = event.reason
  if (event.source !== undefined) normalized.source = event.source
  return `${JSON.stringify(normalized)}\n`
}

function validateOptions(options: TelemetryOptions): void {
  if (typeof options !== 'object' || options === null) {
    throw new TypeError('invalid telemetry options')
  }
  if (
    typeof options.directory !== 'string'
    || options.directory.trim().length === 0
    || options.directory.includes('\0')
  ) {
    throw new TypeError('invalid telemetry options')
  }

  const filePrefix = options.filePrefix ?? TELEMETRY_DEFAULTS.filePrefix
  if (typeof filePrefix !== 'string' || !matchesWhole(FILE_PREFIX_PATTERN, filePrefix)) {
    throw new TypeError('invalid telemetry options')
  }
}

export function createTelemetry(options: TelemetryOptions): Telemetry {
  validateOptions(options)

  const directory = options.directory
  const filePrefix = options.filePrefix ?? TELEMETRY_DEFAULTS.filePrefix
  const clock = options.clock ?? fallbackTimestamp
  const files = options.files ?? defaultFileOperations
  const scheduler = options.scheduler ?? defaultScheduler

  let sequence = 0
  const ring: StoredEvent[] = []
  const queue: string[] = []
  const counters: TelemetryCounters = {
    telemetryDroppedCount: 0,
    ramEvictedCount: 0,
    rejectedEventCount: 0,
    extraFieldStrippedCount: 0,
    writerFailureCount: 0,
    rotationFailureCount: 0,
    schedulerFailureCount: 0,
  }
  let closed = false
  let scheduledDrainPending = false
  let activeDrain: Promise<void> | null = null
  let closePromise: Promise<void> | null = null

  const filePath = (suffix: number): string => join(directory, `${filePrefix}-${suffix}.jsonl`)

  function appendToRing(event: MirrorEvent): void {
    ring.push({ sequence: ++sequence, event })
    if (ring.length > TELEMETRY_DEFAULTS.ramLimit) {
      ring.shift()
      counters.ramEvictedCount += 1
    }
  }

  function internalTime(): string {
    try {
      const candidate = clock()
      if (isCanonicalTimestamp(candidate)) return candidate
    } catch {
      // The diagnostic must remain safe even when the producer clock fails.
    }
    return fallbackTimestamp()
  }

  function recordInternal(
    event: InternalEventName,
    status: MirrorEvent['status'],
    reason: string,
    errorCode?: TelemetryInternalErrorCode,
    timeOverride?: string,
  ): void {
    const diagnostic: MirrorEvent = {
      time: timeOverride ?? internalTime(),
      module: 'telemetry',
      event,
      status,
    }
    if (errorCode !== undefined) diagnostic.error_code = errorCode
    diagnostic.reason = reason
    diagnostic.source = 'runtime'
    appendToRing(diagnostic)
  }

  function recordWriterFailure(kind: 'writer_failure' | 'rotation_failure', droppedCount: number): void {
    queue.length = 0
    counters.telemetryDroppedCount += droppedCount

    if (kind === 'writer_failure') {
      counters.writerFailureCount += 1
    } else {
      counters.rotationFailureCount += 1
    }

    recordInternal(
      'telemetry_writer_degraded',
      'degraded',
      `cause=${kind};dropped_count=${droppedCount}`,
      kind === 'writer_failure' ? 'telemetry_writer_failed' : 'telemetry_rotation_failed',
    )
  }

  function recordSchedulerFailure(droppedCount: number): void {
    queue.length = 0
    counters.telemetryDroppedCount += droppedCount
    counters.schedulerFailureCount += 1
    recordInternal(
      'telemetry_scheduler_degraded',
      'degraded',
      `cause=scheduler_failure;dropped_count=${droppedCount}`,
      'telemetry_scheduler_failed',
    )
  }

  async function rotateFiles(): Promise<void> {
    try {
      await files.remove(filePath(TELEMETRY_DEFAULTS.maxFiles - 1))
    } catch (error) {
      if (!isMissingError(error)) throw error
    }

    for (let suffix = TELEMETRY_DEFAULTS.maxFiles - 2; suffix >= 0; suffix -= 1) {
      try {
        await files.rename(filePath(suffix), filePath(suffix + 1))
      } catch (error) {
        if (!isMissingError(error)) throw error
      }
    }
  }

  async function writeLine(line: string): Promise<WriteResult> {
    let currentSize: number | null
    try {
      currentSize = await files.size(filePath(0))
    } catch (error) {
      if (isMissingError(error)) currentSize = null
      else return 'writer_failure'
    }

    const lineBytes = Buffer.byteLength(line, 'utf8')
    if (currentSize !== null && currentSize + lineBytes > TELEMETRY_DEFAULTS.maxFileBytes) {
      try {
        await rotateFiles()
      } catch {
        return 'rotation_failure'
      }
    }

    try {
      await files.append(filePath(0), line)
      return 'written'
    } catch {
      return 'writer_failure'
    }
  }

  async function drainQueue(): Promise<void> {
    if (queue.length === 0) return

    let currentItemPending = false
    try {
      await files.ensureDirectory(directory)

      while (queue.length > 0) {
        currentItemPending = true
        const line = queue.shift()!
        const result = await writeLine(line)
        currentItemPending = false

        if (result !== 'written') {
          recordWriterFailure(result, 1 + queue.length)
          return
        }
      }
    } catch {
      const droppedCount = queue.length + (currentItemPending ? 1 : 0)
      recordWriterFailure('writer_failure', droppedCount)
    }
  }

  function runDrain(): Promise<void> {
    if (activeDrain !== null) return activeDrain
    if (queue.length === 0) return Promise.resolve()

    let trackedDrain: Promise<void>
    trackedDrain = drainQueue()
      .catch(() => {
        const droppedCount = queue.length
        recordWriterFailure('writer_failure', droppedCount)
      })
      .finally(() => {
        if (activeDrain === trackedDrain) activeDrain = null
        if (queue.length > 0 && !closed && !scheduledDrainPending) requestDrain()
      })
    activeDrain = trackedDrain
    return trackedDrain
  }

  function requestDrain(): void {
    if (closed || queue.length === 0 || scheduledDrainPending || activeDrain !== null) return

    scheduledDrainPending = true
    try {
      scheduler.schedule(() => {
        scheduledDrainPending = false
        return runDrain()
      })
    } catch {
      scheduledDrainPending = false
      recordSchedulerFailure(queue.length)
    }
  }

  function timestampForAcceptedEvent(): { time: string; usedFallback: boolean } {
    try {
      const candidate = clock()
      if (isCanonicalTimestamp(candidate)) return { time: candidate, usedFallback: false }
    } catch {
      // The raw clock error is intentionally never inspected or serialized.
    }
    return { time: fallbackTimestamp(), usedFallback: true }
  }

  function emit(event: TelemetryEventInput): void {
    if (closed) {
      counters.telemetryDroppedCount += 1
      recordInternal('telemetry_emit_ignored', 'info', 'cause=closed', 'telemetry_closed')
      return
    }

    try {
      const normalizedResult = normalizeInput(event)
      if (!normalizedResult.accepted) {
        counters.rejectedEventCount += 1
        recordInternal(
          'telemetry_event_rejected',
          'failed',
          `cause=validation_failed;field=${normalizedResult.field}`,
          'telemetry_event_invalid',
        )
        return
      }

      const timestamp = timestampForAcceptedEvent()
      const normalizedEvent: MirrorEvent = {
        time: timestamp.time,
        ...normalizedResult.event,
      }
      appendToRing(normalizedEvent)

      if (timestamp.usedFallback) {
        recordInternal(
          'telemetry_event_rejected',
          'failed',
          'cause=clock_fallback',
          'telemetry_event_invalid',
          fallbackTimestamp(),
        )
      }
      if (normalizedResult.extraFieldCount > 0) {
        counters.extraFieldStrippedCount += normalizedResult.extraFieldCount
        recordInternal(
          'telemetry_extra_fields_stripped',
          'info',
          `field_count=${normalizedResult.extraFieldCount}`,
        )
      }

      enqueueLine(serializeEvent(normalizedEvent))
    } catch {
      counters.rejectedEventCount += 1
      recordInternal(
        'telemetry_event_rejected',
        'failed',
        'cause=validation_failed;field=input',
        'telemetry_event_invalid',
      )
    }
  }

  function enqueueLine(line: string): void {
    queue.push(line)
    if (queue.length > TELEMETRY_DEFAULTS.queueLimit) {
      queue.shift()
      counters.telemetryDroppedCount += 1
      recordInternal(
        'telemetry_queue_drop',
        'degraded',
        'cause=queue_full;dropped=oldest;queue_limit=1000',
        'telemetry_queue_full',
      )
    }
    requestDrain()
  }

  function readPage(request?: TelemetryPageRequest): TelemetryPage {
    try {
      const requestObject = request !== null && typeof request === 'object' ? request : undefined
      const requestedLimit = requestObject?.limit
      const limit = typeof requestedLimit === 'number'
        && Number.isFinite(requestedLimit)
        && Number.isInteger(requestedLimit)
        ? Math.min(Math.max(requestedLimit, 1), TELEMETRY_DEFAULTS.maxPageSize)
        : TELEMETRY_DEFAULTS.pageSize
      const beforeSequence = typeof requestObject?.beforeSequence === 'number'
        && Number.isFinite(requestObject.beforeSequence)
        ? requestObject.beforeSequence
        : undefined
      const moduleFilter = requestObject?.module
      const statusFilter = requestObject?.status
      const sourceFilter = requestObject?.source

      const matching = ring.filter((stored) => {
        if (beforeSequence !== undefined && stored.sequence >= beforeSequence) return false
        if (moduleFilter !== undefined && stored.event.module !== moduleFilter) return false
        if (statusFilter !== undefined && stored.event.status !== statusFilter) return false
        if (sourceFilter !== undefined && stored.event.source !== sourceFilter) return false
        return true
      })

      const selected = matching.slice(Math.max(0, matching.length - limit)).reverse()
      const oldestSelected = selected.at(-1)
      const olderMatchRemains = matching.length > selected.length

      return {
        events: selected.map((stored) => ({ ...stored.event })),
        nextBeforeSequence: olderMatchRemains && oldestSelected !== undefined
          ? oldestSelected.sequence
          : null,
      }
    } catch {
      return { events: [], nextBeforeSequence: null }
    }
  }

  function getStats(): TelemetryStats {
    return {
      ...counters,
      ramEventCount: ring.length,
      queueDepth: queue.length,
      closed,
    }
  }

  async function flush(): Promise<void> {
    for (;;) {
      if (activeDrain !== null) {
        await activeDrain
        continue
      }
      if (queue.length === 0) return
      await runDrain()
    }
  }

  function close(): Promise<void> {
    if (!closed) closed = true
    if (closePromise === null) closePromise = flush()
    return closePromise
  }

  return {
    emit,
    readPage,
    getStats,
    flush,
    close,
  }
}

export function formatWakeMetadata(metadata: WakeTelemetryMetadata): string {
  if (typeof metadata !== 'object' || metadata === null) {
    throw new TypeError('invalid wake metadata')
  }
  if (typeof metadata.keyword !== 'string' || metadata.keyword.length === 0) {
    throw new TypeError('invalid wake metadata')
  }
  if (!Number.isFinite(metadata.configured_threshold) || !Number.isFinite(metadata.boost)) {
    throw new TypeError('invalid wake metadata')
  }
  if (!Number.isInteger(metadata.num_trailing_blanks) || metadata.num_trailing_blanks < 0) {
    throw new TypeError('invalid wake metadata')
  }

  let encodedKeyword: string
  try {
    encodedKeyword = encodeURIComponent(metadata.keyword)
  } catch {
    throw new TypeError('invalid wake metadata')
  }

  const reason = `keyword=${encodedKeyword};configured_threshold=${metadata.configured_threshold};boost=${metadata.boost};num_trailing_blanks=${metadata.num_trailing_blanks}`
  if (reason.length > 1024 || !matchesWhole(REASON_PATTERN, reason)) {
    throw new TypeError('invalid wake metadata')
  }
  return reason
}

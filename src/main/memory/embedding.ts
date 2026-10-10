import { spawn, type ChildProcess } from 'node:child_process'
import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import manifest from '../../../resources/config/memory-embedding.v1.json'
import type { MemoryEmbedder, MemoryEmbedding } from './contracts'
import { MemoryWorkerRecovery } from './recovery'

export type MemoryEmbeddingReason = 'runtime_ready' | 'runtime_missing' | 'runtime_invalid'
  | 'runtime_unsupported' | 'model_invalid' | 'startup_failed' | 'startup_timeout'
  | 'request_timeout' | 'worker_failed' | 'malformed_output' | 'output_too_large'
  | 'version_mismatch' | 'invalid_input' | 'input_too_long' | 'inference_failed'
  | 'queue_full' | 'cancelled' | 'closed' | 'shutdown_timeout' | 'invalid_options'
  | 'cold_start' | 'idle_stopped' | 'recovery_backoff' | 'recovery_budget_exhausted'

/** Metadata only. Never attach text, vectors, owner identifiers, or raw exceptions. */
export interface MemoryEmbeddingEvent {
  type: 'ready' | 'degraded' | 'dropped' | 'closed'
  reason: MemoryEmbeddingReason
  requestId?: string
}

export interface MemoryEmbedderOptions {
  /** Absolute private directory prepared explicitly by prepare-memory-embedding.mjs. */
  runtimeDirectory: string
  report: (event: MemoryEmbeddingEvent) => void
  /** Packaged resources may supply these; by default use the prepared runtime copies. */
  workerPath?: string
  manifestPath?: string
  startupTimeoutMs?: number
  requestTimeoutMs?: number
  /** Total accepted requests, including startup/active/cancellation-draining work. */
  maxQueue?: number
  /** Release model residency after this much time with no active or queued work. */
  idleTimeoutMs?: number
}

export class MemoryEmbeddingError extends Error {
  constructor(readonly code: MemoryEmbeddingReason) {
    super(code)
    this.name = 'MemoryEmbeddingError'
  }
}

interface Job {
  id: string
  text: string
  purpose: 'query' | 'document'
  resolve: (embedding: MemoryEmbedding) => void
  reject: (error: MemoryEmbeddingError) => void
  signal?: AbortSignal
  onAbort?: () => void
  settled: boolean
  cancelled: boolean
}

const version = `memory-embedding.v1:${createHash('sha256').update(JSON.stringify(manifest.identity)).digest('hex')}`
const MAX_FRAME_BYTES = 65_536
const workerReasons = new Set(['invalid_input', 'input_too_long', 'inference_failed'])
const startupReasons = new Set(['runtime_invalid', 'runtime_unsupported', 'model_invalid', 'startup_failed'])

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function keys(value: Record<string, unknown>, expected: string[]): boolean {
  return Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key))
}

function normalized(values: unknown): number[] | null {
  if (!Array.isArray(values) || values.length !== manifest.identity.dimensions) return null
  let scale = 0
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null
    scale = Math.max(scale, Math.abs(value))
  }
  if (scale === 0) return null
  // Scaling first avoids overflow and underflow in the L2 norm of finite outputs.
  let sum = 0
  for (const value of values as number[]) sum += (value / scale) ** 2
  const norm = Math.sqrt(sum)
  return (values as number[]).map((value) => (value / scale) / norm)
}

/**
 * Main owns one instance for the application lifetime. Lazy startup never installs
 * anything. Idle shutdown and bounded demand-driven recovery reuse the pinned
 * runtime. Failed jobs remain failed; this module never owns a mic or credentials.
 */
export function createMemoryEmbedder(options: MemoryEmbedderOptions): MemoryEmbedder {
  if (!options || typeof options.runtimeDirectory !== 'string' || !isAbsolute(options.runtimeDirectory)
    || typeof options.report !== 'function') throw new MemoryEmbeddingError('invalid_options')
  const startupTimeoutMs = options.startupTimeoutMs ?? 60_000
  const requestTimeoutMs = options.requestTimeoutMs ?? 30_000
  const maxQueue = options.maxQueue ?? 16
  const idleTimeoutMs = options.idleTimeoutMs ?? 300_000
  const workerPath = options.workerPath ?? join(options.runtimeDirectory, 'memory-embedding-worker.py')
  const manifestPath = options.manifestPath ?? join(options.runtimeDirectory, 'manifest.json')
  if (![options.runtimeDirectory, workerPath, manifestPath].every((path) => typeof path === 'string' && isAbsolute(path))
    || typeof options.report !== 'function'
    || !Number.isSafeInteger(maxQueue) || maxQueue < 1 || maxQueue > 128
    || ![startupTimeoutMs, requestTimeoutMs].every((ms) => Number.isSafeInteger(ms) && ms > 0 && ms <= 300_000)
    || !Number.isSafeInteger(idleTimeoutMs) || idleTimeoutMs < 1 || idleTimeoutMs > 3_600_000) {
    throw new MemoryEmbeddingError('invalid_options')
  }
  let state: 'idle' | 'starting' | 'ready' | 'stopping' | 'failed' | 'closed' = 'idle'
  let failure: MemoryEmbeddingReason = 'worker_failed'
  let child: ChildProcess | null = null
  let active: Job | null = null
  let queue: Job[] = []
  let sequence = 0n
  let startupTimer: ReturnType<typeof setTimeout> | undefined
  let requestTimer: ReturnType<typeof setTimeout> | undefined
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let fragments: Buffer[] = []
  let frameBytes = 0
  let stopPromise: Promise<void> | undefined
  let closePromise: Promise<void> | undefined
  let exited = false
  let exitResolve: (() => void) | undefined
  let exitPromise: Promise<void> | undefined
  let generation = 0
  let recoveryBlocked = false
  const recovery = new MemoryWorkerRecovery()

  function report(type: MemoryEmbeddingEvent['type'], reason: MemoryEmbeddingReason, requestId?: string) {
    try { options.report(requestId ? { type, reason, requestId } : { type, reason }) } catch {
      // Diagnostic consumers must not affect worker cleanup or conversation.
    }
  }

  function settle(job: Job, result: MemoryEmbedding | MemoryEmbeddingReason) {
    if (job.settled) return
    job.settled = true
    job.text = ''
    if (job.onAbort) job.signal?.removeEventListener('abort', job.onAbort)
    job.signal = undefined
    job.onAbort = undefined
    if (typeof result === 'string') {
      report(result === 'cancelled' || result === 'queue_full' || result === 'invalid_input' ? 'dropped' : 'degraded', result, job.id)
      job.reject(new MemoryEmbeddingError(result))
    } else job.resolve(result)
  }

  function clearTimers() {
    clearTimeout(startupTimer)
    clearTimeout(requestTimer)
    clearTimeout(idleTimer)
    startupTimer = undefined
    requestTimer = undefined
    idleTimer = undefined
  }

  function stopWorker(): Promise<void> {
    if (stopPromise) return stopPromise
    if (!child || exited) return Promise.resolve()
    const target = child
    const targetExit = exitPromise
    stopPromise = (async () => {
      const waitExit = (ms: number) => new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), ms)
        void targetExit?.then(() => { clearTimeout(timer); resolve(true) })
      })
      try { target.kill('SIGTERM') } catch { /* Never forward OS error content. */ }
      if (await waitExit(500)) return
      try { target.kill('SIGKILL') } catch { /* Content-free timeout below. */ }
      if (!await waitExit(500)) {
        report('degraded', 'shutdown_timeout')
        throw new MemoryEmbeddingError('shutdown_timeout')
      }
    })()
    return stopPromise
  }

  function fail(reason: MemoryEmbeddingReason) {
    if (state === 'closed' || state === 'failed') return
    state = 'failed'
    generation++
    recovery.failed()
    failure = reason
    clearTimers()
    fragments = []
    frameBytes = 0
    const jobs = active ? [active, ...queue] : queue
    active = null
    queue = []
    if (!jobs.some((job) => !job.settled)) report('degraded', reason)
    for (const job of jobs) settle(job, reason)
    void stopWorker().catch(() => { recoveryBlocked = true /* Never spawn beside an unconfirmed shutdown. */ })
  }

  function write(message: Record<string, unknown>) {
    const current = generation
    try {
      child!.stdin!.write(`${JSON.stringify(message)}\n`, (error) => { if (error && current === generation) fail('worker_failed') })
    } catch { fail('worker_failed') }
  }

  function pump() {
    if (state !== 'ready' || active) return
    if (queue.length === 0) { armIdleStop(); return }
    clearTimeout(idleTimer); idleTimer = undefined
    // Stable ordering within each purpose; recall precedes background indexing.
    const queryIndex = queue.findIndex((job) => job.purpose === 'query')
    active = queue.splice(queryIndex < 0 ? 0 : queryIndex, 1)[0]
    // The wire sequence follows dispatch order, which differs from enqueue order under query priority.
    active.id = String(++sequence)
    requestTimer = setTimeout(() => fail('request_timeout'), requestTimeoutMs)
    requestTimer.unref()
    write({ type: 'embed', id: active.id, purpose: active.purpose, text: active.text })
    // Active jobs retain only a cancellation tombstone, never another text copy.
    if (active) active.text = ''
  }

  function armIdleStop() {
    if (idleTimer || state !== 'ready' || active || queue.length) return
    idleTimer = setTimeout(() => {
      idleTimer = undefined
      if (state !== 'ready' || active || queue.length) return
      state = 'stopping'; generation++
      report('degraded', 'idle_stopped')
      void stopWorker().then(() => {
        if (state !== 'stopping') return
        child = null; stopPromise = undefined; exitPromise = undefined; exitResolve = undefined; exited = false
        state = 'idle'
        if (queue.length) void start()
      }, () => { recoveryBlocked = true; fail('shutdown_timeout') })
    }, idleTimeoutMs)
    idleTimer.unref()
  }

  function handleFrame(bytes: Buffer) {
    let value: unknown
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch {
      fail('malformed_output'); return
    }
    if (!object(value)) { fail('malformed_output'); return }
    if (state === 'starting') {
      if (value.type === 'fatal' && keys(value, ['type', 'reason']) && startupReasons.has(value.reason as string)) {
        fail(value.reason as MemoryEmbeddingReason); return
      }
      if (value.type !== 'ready' || !keys(value, ['type', 'version', 'dimensions'])) {
        fail('malformed_output'); return
      }
      if (value.version !== version || value.dimensions !== manifest.identity.dimensions) {
        fail('version_mismatch'); return
      }
      clearTimeout(startupTimer)
      state = 'ready'
      report('ready', 'runtime_ready')
      pump()
      return
    }
    if (state !== 'ready' || !active || value.id !== active.id) { fail('malformed_output'); return }
    const job = active
    let outcome: MemoryEmbedding | MemoryEmbeddingReason
    if (value.type === 'embedding' && keys(value, ['type', 'id', 'values'])) {
      const values = normalized(value.values)
      if (!values) { fail('malformed_output'); return }
      outcome = { version, values }
    } else if (value.type === 'error' && keys(value, ['type', 'id', 'reason']) && workerReasons.has(value.reason as string)) {
      outcome = value.reason as MemoryEmbeddingReason
    } else if (value.type === 'cancelled' && keys(value, ['type', 'id']) && job.cancelled) outcome = 'cancelled'
    else { fail('malformed_output'); return }
    clearTimeout(requestTimer)
    requestTimer = undefined
    active = null
    settle(job, outcome)
    pump()
  }

  function acceptingOutput() { return state === 'starting' || state === 'ready' }

  function stdout(chunk: Buffer) {
    if (!acceptingOutput()) return
    for (let offset = 0; offset < chunk.length;) {
      const newline = chunk.indexOf(10, offset)
      const end = newline < 0 ? chunk.length : newline
      if (frameBytes + end - offset > MAX_FRAME_BYTES) { fail('output_too_large'); return }
      fragments.push(chunk.subarray(offset, end))
      frameBytes += end - offset
      if (newline < 0) return
      const frame = Buffer.concat(fragments, frameBytes)
      fragments = []
      frameBytes = 0
      handleFrame(frame)
      if (!acceptingOutput()) return
      offset = newline + 1
    }
  }

  async function start() {
    state = 'starting'
    const current = ++generation
    report('degraded', 'cold_start')
    if (child) {
      try { await stopWorker() } catch { recoveryBlocked = true; fail('shutdown_timeout'); return }
      if (state !== 'starting' || current !== generation) return
      child = null; stopPromise = undefined; exitPromise = undefined; exitResolve = undefined; exited = false
    }
    startupTimer = setTimeout(() => fail('startup_timeout'), startupTimeoutMs)
    startupTimer.unref()
    const executable = join(options.runtimeDirectory, 'venv', 'bin', 'python')
    try {
      for (const [path, mode] of [[executable, constants.X_OK], [workerPath, constants.R_OK], [manifestPath, constants.R_OK]] as const) {
        await access(path, mode)
        if (state !== 'starting' || current !== generation) return
      }
    } catch { if (current === generation) fail('runtime_missing'); return }
    if (state !== 'starting' || current !== generation) return
    try {
      child = spawn(executable, ['-I', '-B', '-u', workerPath, '--runtime-directory', options.runtimeDirectory,
        '--manifest', manifestPath, '--version', version], {
        cwd: options.runtimeDirectory, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'],
        // Explicit allowlist: neither process.env nor the root .env enters IPC/the child.
        env: { LANG: 'en_US.UTF-8', PATH: '/usr/bin:/bin', HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1',
          HF_HUB_DISABLE_TELEMETRY: '1', HF_HOME: join(options.runtimeDirectory, 'cache'),
          TOKENIZERS_PARALLELISM: 'false', OMP_NUM_THREADS: '1' },
      })
      exitPromise = new Promise<void>((resolve) => { exitResolve = resolve })
      const resolveExit = exitResolve
      child.once('close', () => { resolveExit?.(); if (current === generation) { exited = true; fail('worker_failed') } })
      child.once('error', () => { if (current === generation) fail('worker_failed') })
      child.stdin?.on('error', () => { if (current === generation) fail('worker_failed') })
      child.stdout?.on('error', () => { if (current === generation) fail('worker_failed') })
      child.stdout?.on('data', (chunk: Buffer) => { if (current === generation) stdout(chunk) })
      if (!child.stdin || !child.stdout) fail('worker_failed')
    } catch { fail('worker_failed') }
  }

  return {
    version,
    embed(text, purpose, signal) {
      const reject = (reason: MemoryEmbeddingReason) => {
        report(reason === 'cancelled' || reason === 'queue_full' || reason === 'invalid_input' ? 'dropped' : 'degraded', reason)
        return Promise.reject<MemoryEmbedding>(new MemoryEmbeddingError(reason))
      }
      if (state === 'closed') return reject('closed')
      if (signal?.aborted) return reject('cancelled')
      if (typeof text !== 'string' || !text.trim() || !['query', 'document'].includes(purpose)
        || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(text)
        || Buffer.byteLength(text) > manifest.identity.maxTextBytes
        || Buffer.byteLength(JSON.stringify({ type: 'embed', id: '0'.repeat(32), purpose, text })) > MAX_FRAME_BYTES) {
        return reject('invalid_input')
      }
      if (state === 'failed') {
        if (recoveryBlocked) return reject(failure)
        const permission = recovery.take()
        if (permission !== 'allowed') {
          report('degraded', `recovery_${permission}`)
          return reject(failure)
        }
        state = 'idle'
      }
      clearTimeout(idleTimer); idleTimer = undefined
      if (queue.length + (active ? 1 : 0) >= maxQueue) return reject('queue_full')
      const promise = new Promise<MemoryEmbedding>((resolve, rejectJob) => {
        const job: Job = { id: '', text, purpose, resolve, reject: rejectJob, signal, settled: false, cancelled: false }
        job.onAbort = () => {
          job.cancelled = true
          settle(job, 'cancelled')
          if (active === job) write({ type: 'cancel', id: job.id })
          else { queue = queue.filter((queued) => queued !== job); armIdleStop() }
        }
        queue.push(job)
        signal?.addEventListener('abort', job.onAbort, { once: true })
      })
      if (state === 'idle') void start()
      else pump()
      return promise
    },
    close() {
      if (closePromise) return closePromise
      state = 'closed'
      generation++
      clearTimers()
      for (const job of active ? [active, ...queue] : queue) settle(job, 'closed')
      active = null
      queue = []
      fragments = []
      frameBytes = 0
      report('closed', 'closed')
      closePromise = stopWorker()
      return closePromise
    },
  }
}

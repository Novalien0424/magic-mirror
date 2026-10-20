import { join } from 'node:path'
import { Worker, type WorkerOptions } from 'node:worker_threads'
import type { MemoryRepository } from './contracts'
import { MemoryWorkerRecovery } from './recovery'

/** Injectable only inside Main/tests. This worker is a thread, never a utility/renderer process. */
export type MemoryStorageWorker = Pick<Worker, 'postMessage' | 'terminate'> & {
  on(event: 'message' | 'error' | 'exit', listener: (value: unknown) => void): unknown
  off(event: 'message' | 'error' | 'exit', listener: (value: unknown) => void): unknown
  stdout?: { resume(): unknown } | null
  stderr?: { resume(): unknown } | null
}
export interface MemoryRepositoryOptions {
  workerFactory?: (filename: string, options: WorkerOptions) => MemoryStorageWorker
  requestTimeoutMs?: number
  /** Metadata-only lifecycle reasons; no request arguments, identifiers or native errors. */
  report?(reason: string): void
}
const failureCodes = new Set(['memory_invalid_input', 'memory_schema_unsupported', 'memory_storage_failed'])
function sanitized(value?: unknown): Error {
  return new Error(typeof value === 'string' && failureCodes.has(value) ? value : 'memory_storage_failed')
}

/** An unavailable adapter lets unrelated conversation boot normally; it never creates fallback storage. */
export function unavailableMemoryRepository(): MemoryRepository {
  const failed = async (): Promise<never> => { throw sanitized() }
  return { names: failed, save: failed, list: failed, lookupTopics: failed, recall: failed, forget: failed,
    policy: failed, setPolicy: failed, brief: failed, commitLearning: failed,
    hybridRecall: failed, pendingIndex: failed, setEmbedding: failed, setCleanupRequired: failed,
    close: async () => {} }
}

export function createMemoryRepository(path: string, options: MemoryRepositoryOptions = {}): MemoryRepository {
  const timeoutMs = options.requestTimeoutMs ?? 10_000
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw sanitized('memory_invalid_input')
  type Run = { worker: MemoryStorageWorker; healthy: boolean; remove(): void; termination?: Promise<void> }
  let current: Run | undefined
  let status: 'open' | 'recovering' | 'closing' | 'failed' | 'closed' = 'failed'
  let sequence = 0
  let closing: Promise<void> | undefined
  let recovering: Promise<void> | undefined
  let recoveryBlocked = false
  const recovery = new MemoryWorkerRecovery()
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>()
  const report = (reason: string) => { try { options.report?.(reason) } catch { /* Diagnostics never gate memory cleanup. */ } }
  const rejectPending = () => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(sanitized()) }
    pending.clear()
  }
  const terminate = (run: Run): Promise<void> => run.termination ??= new Promise((resolve, reject) => {
    const failed = () => { recoveryBlocked = true; report('memory_storage_shutdown_timeout'); reject(sanitized()) }
    const timer = setTimeout(failed, 1000)
    timer.unref()
    void Promise.resolve().then(() => run.worker.terminate()).then(() => {
      clearTimeout(timer); run.remove(); resolve()
    }, () => { clearTimeout(timer); failed() })
  })
  const fail = (run: Run, reason = 'memory_storage_unavailable') => {
    if (current !== run || status === 'closed' || status === 'failed') return
    if (status !== 'closing') status = 'failed'
    recovery.failed(); report(reason)
    // The worker may already have committed a timed-out mutation. Never replay it.
    rejectPending()
    void terminate(run).catch(() => { /* close retains the sanitized rejection. */ })
  }
  const open = () => {
    try {
      const worker = (options.workerFactory ?? ((filename, workerOptions) => new Worker(filename, workerOptions)))(
        join(__dirname, 'memory-storage-worker.js'),
        { workerData: { path }, env: {}, execArgv: [], stdout: true, stderr: true }
      )
      const onMessage = (message: unknown) => {
        if (current !== run || !['open', 'closing'].includes(status) || !message || typeof message !== 'object') return
        const reply = message as { id?: unknown; ok?: unknown; value?: unknown; error?: unknown }
        if (typeof reply.id !== 'number' || !Number.isSafeInteger(reply.id)) return
        const request = pending.get(reply.id)
        if (!request) return
        if (reply.ok !== true && ['memory_storage_failed', 'memory_schema_unsupported'].includes(reply.error as string)) {
          if (reply.error === 'memory_schema_unsupported') recoveryBlocked = true
          fail(run, reply.error === 'memory_schema_unsupported' ? 'memory_schema_unsupported' : 'memory_storage_unavailable')
          return
        }
        clearTimeout(request.timer); pending.delete(reply.id)
        if (reply.ok === true) {
          if (!run.healthy && status === 'open') { run.healthy = true; report('memory_storage_ready') }
          request.resolve(reply.value)
        } else request.reject(sanitized(reply.error))
      }
      const onError = () => fail(run)
      const onExit = () => { if (status !== 'closing' || pending.size) fail(run) }
      const run: Run = { worker, healthy: false, remove: () => {
        worker.off('message', onMessage); worker.off('error', onError); worker.off('exit', onExit)
      } }
      current = run; status = 'open'
      worker.on('message', onMessage); worker.on('error', onError); worker.on('exit', onExit)
      // Native/provider output is never forwarded to diagnostics.
      worker.stdout?.resume(); worker.stderr?.resume()
      return true
    } catch {
      if (current && status === 'open') fail(current)
      else { status = 'failed'; recovery.failed(); report('memory_storage_unavailable') }
      return false
    }
  }
  const recover = (): Promise<void> => {
    if (recovering) return recovering
    if (recoveryBlocked) return Promise.reject(sanitized())
    const permission = recovery.take()
    if (permission !== 'allowed') { report(`memory_storage_recovery_${permission}`); return Promise.reject(sanitized()) }
    status = 'recovering'
    recovering = (async () => {
      if (current) await terminate(current)
      if (status !== 'recovering') throw sanitized()
      current = undefined
      if (!open()) throw sanitized()
    })().finally(() => { recovering = undefined })
    return recovering
  }
  open()
  const call = <T>(method: string, args: unknown[], duringClose = false): Promise<T> => {
    if (!duringClose && (recovering || status === 'failed')) return (recovering ?? recover()).then(() => call<T>(method, args))
    if (status !== 'open' && !(duringClose && status === 'closing')) return Promise.reject(sanitized())
    return new Promise<T>((resolve, reject) => {
      const id = ++sequence
      const run = current!
      const timer = setTimeout(() => fail(run), timeoutMs)
      pending.set(id, { resolve: value => resolve(value as T), reject, timer })
      try { run.worker.postMessage({ id, method, args }) } catch { fail(run) }
    })
  }
  const close = (): Promise<void> => {
    if (closing) return closing
    const wasOpen = status === 'open'
    status = 'closing'
    closing = (async () => {
      try {
        if (wasOpen) await call<void>('close', [], true)
      } catch { /* An unavailable worker is still terminated below. */ }
      finally {
        rejectPending()
        try { if (current) await terminate(current) } finally {
          status = 'closed'
          current?.remove(); current = undefined
        }
      }
    })()
    return closing
  }
  return {
    names: avatarId => call('names', [avatarId]),
    save: (avatarId, name, topic, text) => call('save', [avatarId, name, topic, text]),
    list: (avatarId, name, query) => call('list', query === undefined ? [avatarId, name] : [avatarId, name, query]),
    lookupTopics: (avatarId, name, topics) => call('lookupTopics', [avatarId, name, topics]),
    recall: (avatarId, name, query) => call('recall', [avatarId, name, query]),
    forget: (avatarId, name, topic) => call('forget', [avatarId, name, topic]),
    policy: (avatarId, name) => call('policy', [avatarId, name]),
    setPolicy: (avatarId, name, mode) => call('setPolicy', [avatarId, name, mode]),
    brief: (avatarId, name) => call('brief', [avatarId, name]),
    commitLearning: (avatarId, name, commit) => call('commitLearning', [avatarId, name, commit]),
    hybridRecall: (avatarId, name, query, embedding) => call('hybridRecall', embedding === undefined ? [avatarId, name, query] : [avatarId, name, query, embedding]),
    pendingIndex: (version, limit) => call('pendingIndex', [version, limit]),
    setEmbedding: (avatarId, name, id, revision, embedding) => call('setEmbedding', [avatarId, name, id, revision, embedding]),
    setCleanupRequired: (avatarId, name, required) => call('setCleanupRequired', [avatarId, name, required]),
    close
  }
}

import { join } from 'node:path'
import { Worker, type WorkerOptions } from 'node:worker_threads'
import type { MemoryRepository } from './contracts'

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
  let worker: MemoryStorageWorker
  try {
    worker = (options.workerFactory ?? ((filename, workerOptions) => new Worker(filename, workerOptions)))(
      join(__dirname, 'memory-storage-worker.js'),
      { workerData: { path }, env: {}, execArgv: [], stdout: true, stderr: true }
    )
    // Native/provider output is never forwarded to diagnostics.
    worker.stdout?.resume()
    worker.stderr?.resume()
  } catch { throw sanitized() }
  let status: 'open' | 'closing' | 'failed' | 'closed' = 'open'
  let sequence = 0
  let termination: Promise<void> | undefined
  let closing: Promise<void> | undefined
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>()
  const terminate = () => termination ??= Promise.resolve().then(() => worker.terminate()).then(() => undefined, () => { throw sanitized() })
  const fail = () => {
    if (status === 'closed') return
    status = 'failed'
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(sanitized()) }
    pending.clear()
    void terminate().catch(() => { /* close reports sanitized termination failures. */ })
  }
  const onMessage = (message: unknown) => {
    if (!message || typeof message !== 'object') return
    const reply = message as { id?: unknown; ok?: unknown; value?: unknown; error?: unknown }
    if (typeof reply.id !== 'number' || !Number.isSafeInteger(reply.id)) return
    const request = pending.get(reply.id)
    if (!request) return
    clearTimeout(request.timer); pending.delete(reply.id)
    if (reply.ok === true) request.resolve(reply.value)
    else request.reject(sanitized(reply.error))
  }
  const onError = () => fail()
  const onExit = () => { if (status !== 'closed') fail() }
  worker.on('message', onMessage)
  worker.on('error', onError)
  worker.on('exit', onExit)
  const call = <T>(method: string, args: unknown[], duringClose = false): Promise<T> => {
    if (status !== 'open' && !(duringClose && status === 'closing')) return Promise.reject(sanitized())
    return new Promise<T>((resolve, reject) => {
      const id = ++sequence
      const timer = setTimeout(fail, timeoutMs)
      pending.set(id, { resolve: value => resolve(value as T), reject, timer })
      try { worker.postMessage({ id, method, args }) } catch { fail() }
    })
  }
  const close = (): Promise<void> => {
    if (closing) return closing
    const wasOpen = status === 'open'
    if (wasOpen) status = 'closing'
    closing = (async () => {
      try {
        if (wasOpen) await call<void>('close', [], true)
      } catch { /* An unavailable worker is still terminated below. */ }
      finally {
        for (const request of pending.values()) { clearTimeout(request.timer); request.reject(sanitized()) }
        pending.clear()
        try { await terminate() } finally {
          status = 'closed'
          worker.off('message', onMessage); worker.off('error', onError); worker.off('exit', onExit)
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

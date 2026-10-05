import { isMainThread, parentPort, workerData } from 'node:worker_threads'
import type { LearningCommit, MemoryEmbedding } from './contracts'
import type { MemoryMode } from '../../shared/memory'
import { MemoryStore } from './store'

const failureCodes = new Set(['memory_invalid_input', 'memory_schema_unsupported', 'memory_storage_failed'])
function failure(error: unknown): string {
  return error instanceof Error && failureCodes.has(error.message) ? error.message : 'memory_storage_failed'
}

if (!isMainThread && parentPort) {
  const port = parentPort
  let store: MemoryStore | undefined
  let startupFailure: string | undefined
  try { store = new MemoryStore(workerData?.path) } catch (error) { startupFailure = failure(error) }
  const methods: Record<string, { arity: number[]; run(args: unknown[]): unknown }> = {
    names: { arity: [1], run: ([avatar]) => store!.names(avatar as string) },
    save: { arity: [4], run: ([avatar, name, topic, text]) => store!.save(avatar as string, name as string, topic as string, text as string) },
    list: { arity: [2, 3], run: ([avatar, name, query]) => store!.list(avatar as string, name as string, query as string | undefined) },
    recall: { arity: [3], run: ([avatar, name, query]) => store!.recall(avatar as string, name as string, query as string) },
    forget: { arity: [3], run: ([avatar, name, topic]) => store!.forget(avatar as string, name as string, topic as string) },
    policy: { arity: [2], run: ([avatar, name]) => store!.policy(avatar as string, name as string) },
    setPolicy: { arity: [3], run: ([avatar, name, mode]) => store!.setPolicy(avatar as string, name as string, mode as MemoryMode) },
    brief: { arity: [2], run: ([avatar, name]) => store!.brief(avatar as string, name as string) },
    commitLearning: { arity: [3], run: ([avatar, name, commit]) => store!.commitLearning(avatar as string, name as string, commit as LearningCommit) },
    hybridRecall: { arity: [3, 4], run: ([avatar, name, query, embedding]) => store!.hybridRecall(avatar as string, name as string, query as string, embedding as MemoryEmbedding | undefined) },
    pendingIndex: { arity: [2], run: ([version, limit]) => store!.pendingIndex(version as string, limit as number) },
    setEmbedding: { arity: [5], run: ([avatar, name, id, revision, embedding]) => store!.setEmbedding(avatar as string, name as string, id as string, revision as number, embedding as MemoryEmbedding) },
    setCleanupRequired: { arity: [3], run: ([avatar, name, required]) => store!.setCleanupRequired(avatar as string, name as string, required as boolean) },
    close: { arity: [0], run: () => store?.close() }
  }
  // Each handler completes synchronously before the next message: mutations and reads serialize.
  port.on('message', (message: unknown) => {
    if (!message || typeof message !== 'object') return
    const request = message as { id?: unknown; method?: unknown; args?: unknown }
    if (typeof request.id !== 'number' || !Number.isSafeInteger(request.id) || request.id < 1) return
    const id = request.id
    try {
      if (typeof request.method !== 'string' || !Object.hasOwn(methods, request.method)
        || !Array.isArray(request.args) || !methods[request.method].arity.includes(request.args.length)) throw new Error('memory_invalid_input')
      if (startupFailure && request.method !== 'close') throw new Error(startupFailure)
      const value = methods[request.method].run(request.args)
      port.postMessage({ id, ok: true, value })
      if (request.method === 'close') port.close()
    } catch (error) { port.postMessage({ id, ok: false, error: failure(error) }) }
  })
}

import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MemoryRepository } from '../../src/main/memory/contracts'
import { createMemoryRepository, unavailableMemoryRepository } from '../../src/main/memory/repository'
import { compileStorageWorker } from './memory-storage-fixtures'

it('keeps unavailable storage as a nonthrowing startup adapter with content-free request failures', async () => {
  const repository = unavailableMemoryRepository()
  await expect(repository.policy('fixture-avatar', 'Synthetic Guest')).rejects.toThrow(/^memory_storage_failed$/)
  await expect(repository.close()).resolves.toBeUndefined()
})

class FakeWorker extends EventEmitter {
  postMessage = vi.fn()
  terminate = vi.fn(async () => 0)
}

describe('Main memory repository worker facade', () => {
  let directory: string | undefined
  let repository: MemoryRepository | undefined
  afterEach(async () => {
    await repository?.close(); repository = undefined
    if (directory) rmSync(directory, { recursive: true, force: true })
  })

  it('uses the named Main worker path and resolves all methods through private IPC', async () => {
    directory = mkdtempSync(join(tmpdir(), 'memory-repository-test-'))
    const script = compileStorageWorker(directory)
    const factory = vi.fn((path, options) => {
      expect(path).toMatch(/memory-storage-worker\.js$/)
      expect(options.workerData).toEqual({ path: join(directory!, 'private', 'memory.sqlite') })
      return new Worker(script, options)
    })
    repository = createMemoryRepository(join(directory, 'private', 'memory.sqlite'), { workerFactory: factory })
    expect(await repository.policy('raven', 'Alice')).toEqual({ mode: 'automatic', epoch: 0, cleanupRequired: false })
    const saved = await repository.save('raven', 'Alice', 'Tea', 'Synthetic worker fixture.')
    expect(await repository.names('raven')).toEqual(['alice'])
    expect(await repository.list('raven', 'Alice')).toEqual([saved])
    expect(await repository.recall('raven', 'Alice', 'worker')).toEqual([saved])
    expect(await repository.brief('raven', 'Alice')).toEqual([saved])
    const pending = await repository.pendingIndex('synthetic-v1', 1)
    expect(pending[0]?.entry).toEqual(saved)
    expect(await repository.setEmbedding('raven', 'Alice', saved.id, 1, { version: 'synthetic-v1', values: [1, 0] })).toBe(true)
    expect((await repository.hybridRecall('raven', 'Alice', 'paraphrase', { version: 'synthetic-v1', values: [1, 0] })).entries).toEqual([saved])
    const policy = await repository.setPolicy('raven', 'Alice', 'automatic')
    expect(await repository.commitLearning('raven', 'Alice', { operationId: 'worker-learning', epoch: policy.epoch, records: [{
      topic: 'Encounter', text: 'Synthetic encounter summary.', kind: 'episode', state: 'active',
      eventAt: '2026-10-05T00:00:00.000Z', sources: [], expectedRevision: null, keepInMind: false
    }] })).toBe('committed')
    expect(await repository.forget('raven', 'Alice', 'Tea')).toBe(true)
    await repository.setCleanupRequired('raven', 'Alice', false)
    await expect(repository.save('raven', 'Alice', '', 'Synthetic invalid fixture.')).rejects.toThrow(/^memory_invalid_input$/)
    expect(factory).toHaveBeenCalledTimes(1)
    await repository.close(); await repository.close()
    await expect(repository.list('raven', 'Alice')).rejects.toThrow(/^memory_storage_failed$/)
  })

  it('preserves ordering for concurrent writes and closes only after queued work', async () => {
    directory = mkdtempSync(join(tmpdir(), 'memory-repository-order-test-'))
    const script = compileStorageWorker(directory)
    const worker = new Worker(script, { workerData: { path: join(directory, 'memory.sqlite') } })
    repository = createMemoryRepository(join(directory, 'memory.sqlite'), { workerFactory: () => worker })
    const first = repository.save('raven', 'Alice', 'Tea', 'Synthetic first choice.')
    const second = repository.save('raven', 'Alice', 'Tea', 'Synthetic second choice.')
    const list = repository.list('raven', 'Alice')
    const close = repository.close()
    const [a, b, rows] = await Promise.all([first, second, list])
    expect(a.id).toBe(b.id); expect(b.revision).toBe(2); expect(rows).toEqual([b])
    await close
  })

  it('sanitizes worker replies, exceptions, startup errors and pending exits', async () => {
    const worker = new FakeWorker()
    repository = createMemoryRepository('/synthetic/private.sqlite', { workerFactory: () => worker })
    const failed = repository.names('raven')
    const request = worker.postMessage.mock.calls[0][0]
    worker.emit('message', { id: request.id, ok: false, error: 'synthetic_private_provider_detail' })
    await expect(failed).rejects.toThrow(/^memory_storage_failed$/)
    const pending = repository.names('raven')
    worker.emit('error', new Error('synthetic_private_worker_detail'))
    await expect(pending).rejects.toThrow(/^memory_storage_failed$/)
    await repository.close()
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    repository = undefined
    expect(() => createMemoryRepository('/synthetic/private.sqlite', { workerFactory: () => { throw new Error('synthetic_private_startup_detail') } }))
      .toThrow(/^memory_storage_failed$/)
  })

  it('terminates an unresponsive worker when close times out and rejects pending calls', async () => {
    const worker = new FakeWorker()
    repository = createMemoryRepository('/synthetic/private.sqlite', { workerFactory: () => worker, requestTimeoutMs: 25 })
    const pending = repository.names('raven')
    const rejected = expect(pending).rejects.toThrow(/^memory_storage_failed$/)
    await expect(repository.close()).resolves.toBeUndefined()
    await rejected
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })
})

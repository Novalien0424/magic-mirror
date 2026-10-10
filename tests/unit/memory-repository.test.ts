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
  await expect(repository.lookupTopics('fixture-avatar', 'Synthetic Guest', ['Tea'])).rejects.toThrow(/^memory_storage_failed$/)
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
    vi.useRealTimers()
  })

  it('uses the named Main worker path and resolves all methods through private IPC', async () => {
    directory = mkdtempSync(join(tmpdir(), 'memory-repository-test-'))
    const script = compileStorageWorker(directory)
    const factory = vi.fn((path, options) => {
      expect(path).toMatch(/memory-storage-worker\.js$/)
      expect(options.workerData).toEqual({ path: join(directory!, 'private', 'memory.sqlite') })
      return new Worker(script, options)
    })
    const report = vi.fn()
    repository = createMemoryRepository(join(directory, 'private', 'memory.sqlite'), { workerFactory: factory, report })
    expect(await repository.policy('raven', 'Alice')).toEqual({ mode: 'automatic', epoch: 0, cleanupRequired: false })
    const saved = await repository.save('raven', 'Alice', 'Tea', 'Synthetic worker fixture.')
    expect(await repository.names('raven')).toEqual(['alice'])
    expect(await repository.list('raven', 'Alice')).toEqual([saved])
    expect(await repository.lookupTopics('raven', 'ＡＬＩＣＥ', [' ｔｅａ ', 'Tea', 'Absent'])).toEqual([saved])
    expect(await repository.lookupTopics('owl', 'Alice', ['Tea'])).toEqual([])
    expect(await repository.lookupTopics('raven', 'Bob', ['Tea'])).toEqual([])
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
    expect(report).toHaveBeenCalledWith('memory_storage_ready')
    expect(report).not.toHaveBeenCalledWith('memory_storage_unavailable')
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
    repository = createMemoryRepository('/synthetic/private.sqlite', { workerFactory: () => { throw new Error('synthetic_private_startup_detail') } })
    await expect(repository.names('raven')).rejects.toThrow(/^memory_storage_failed$/)
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

  it('reopens for independent calls without replaying an uncertain committed mutation', async () => {
    vi.useFakeTimers()
    const first = new FakeWorker(), second = new FakeWorker(), report = vi.fn()
    let committed = 0
    first.postMessage.mockImplementation(request => { if (request.method === 'save') committed++ })
    second.postMessage.mockImplementation(request => queueMicrotask(() => second.emit('message', {
      id: request.id, ok: true, value: request.method === 'names' ? ['synthetic'] : undefined
    })))
    const factory = vi.fn().mockReturnValueOnce(first).mockReturnValue(second)
    repository = createMemoryRepository('/synthetic/private.sqlite', { workerFactory: factory, requestTimeoutMs: 25, report })
    const mutation = repository.save('raven', 'Synthetic', 'Fixture', 'Synthetic value')
    const rejected = expect(mutation).rejects.toThrow(/^memory_storage_failed$/)
    await vi.advanceTimersByTimeAsync(26); await rejected
    expect(committed).toBe(1)
    await expect(repository.names('raven')).rejects.toThrow(/^memory_storage_failed$/)
    await vi.advanceTimersByTimeAsync(1000)
    expect(factory).toHaveBeenCalledOnce()
    expect(await repository.names('raven')).toEqual(['synthetic'])
    first.emit('message', { id: 1, ok: true, value: 'late uncertain success' })
    await rejected
    expect(committed).toBe(1)
    expect(second.postMessage.mock.calls.map(([request]) => request.method)).toEqual(['names'])
    expect(report).toHaveBeenCalledWith('memory_storage_unavailable')
    expect(report).toHaveBeenCalledWith('memory_storage_ready')
    expect(JSON.stringify(report.mock.calls)).not.toMatch(/Synthetic|Fixture|value|raven/)
  })

  it('recovers a transient constructor failure and serializes simultaneous independent calls', async () => {
    vi.useFakeTimers()
    const worker = new FakeWorker(), report = vi.fn()
    worker.postMessage.mockImplementation(request => queueMicrotask(() => worker.emit('message', { id: request.id, ok: true, value: [] })))
    const factory = vi.fn().mockImplementationOnce(() => { throw Error('Synthetic private detail') }).mockReturnValue(worker)
    repository = createMemoryRepository('/synthetic/private.sqlite', { workerFactory: factory, report })
    await expect(repository.names('raven')).rejects.toThrow(/^memory_storage_failed$/)
    await vi.advanceTimersByTimeAsync(1000)
    expect(await Promise.all([repository.names('raven'), repository.list('raven', 'Synthetic')])).toEqual([[], []])
    expect(worker.postMessage.mock.calls.slice(0, 2).map(([request]) => request.method)).toEqual(['names', 'list'])
    expect(factory).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(report.mock.calls)).not.toContain('Synthetic')
  })

  it('bounds repeated worker exits and resumes the budget only for later demand', async () => {
    vi.useFakeTimers()
    const workers: FakeWorker[] = [], report = vi.fn()
    const factory = vi.fn(() => { const worker = new FakeWorker(); workers.push(worker); return worker })
    repository = createMemoryRepository('/synthetic/private.sqlite', { workerFactory: factory, report })
    for (let attempt = 0; attempt < 4; attempt++) {
      const pending = repository.names('raven')
      const rejected = expect(pending).rejects.toThrow(/^memory_storage_failed$/)
      await vi.advanceTimersByTimeAsync(0)
      workers.at(-1)!.emit('exit', 1)
      await rejected
      await vi.advanceTimersByTimeAsync(8000)
    }
    await expect(repository.names('raven')).rejects.toThrow(/^memory_storage_failed$/)
    expect(factory).toHaveBeenCalledTimes(4)
    expect(report).toHaveBeenCalledWith('memory_storage_recovery_budget_exhausted')
    await vi.advanceTimersByTimeAsync(3_600_000)
    expect(factory).toHaveBeenCalledTimes(4)
    const pending = repository.names('raven')
    await vi.advanceTimersByTimeAsync(0)
    const worker = workers.at(-1)!, request = worker.postMessage.mock.calls[0][0]
    worker.emit('message', { id: request.id, ok: true, value: [] })
    expect(await pending).toEqual([])
    expect(factory).toHaveBeenCalledTimes(5)
    worker.postMessage.mockImplementation(request => queueMicrotask(() => worker.emit('message', { id: request.id, ok: true })))
  })

  it('never overlaps a replacement with a worker whose termination is unconfirmed', async () => {
    vi.useFakeTimers()
    const worker = new FakeWorker(), report = vi.fn(), factory = vi.fn(() => worker)
    worker.terminate.mockImplementation(() => new Promise(() => {}))
    repository = createMemoryRepository('/synthetic/private.sqlite', { workerFactory: factory, report })
    const pending = repository.names('raven')
    const rejected = expect(pending).rejects.toThrow(/^memory_storage_failed$/)
    worker.emit('error', Error('Synthetic private detail')); await rejected
    await vi.advanceTimersByTimeAsync(1001)
    await expect(repository.names('raven')).rejects.toThrow(/^memory_storage_failed$/)
    expect(factory).toHaveBeenCalledOnce()
    expect(report).toHaveBeenCalledWith('memory_storage_shutdown_timeout')
    await expect(repository.close()).rejects.toThrow(/^memory_storage_failed$/)
    repository = undefined
  })

  it('does not reopen if close races a recovery awaiting old-worker termination', async () => {
    vi.useFakeTimers()
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0)
    const worker = new FakeWorker(), factory = vi.fn(() => worker)
    let terminated!: (code: number) => void
    worker.terminate.mockImplementation(() => new Promise(resolve => { terminated = resolve }))
    repository = createMemoryRepository('/synthetic/private.sqlite', { workerFactory: factory })
    try {
      worker.emit('error', Error('Synthetic private detail'))
      await vi.advanceTimersByTimeAsync(0)
      clock.mockReturnValue(1000)
      const independent = repository.names('raven')
      const rejected = expect(independent).rejects.toThrow(/^memory_storage_failed$/)
      const closed = repository.close()
      terminated(0); await closed; await rejected
      expect(factory).toHaveBeenCalledOnce()
    } finally { clock.mockRestore() }
  })
})

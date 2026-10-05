import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { afterEach, describe, expect, it } from 'vitest'
import { compileStorageWorker } from './memory-storage-fixtures'

describe('storage worker dispatch boundary', () => {
  let directory: string | undefined
  let worker: Worker | undefined
  afterEach(async () => {
    await worker?.terminate()
    if (directory) rmSync(directory, { recursive: true, force: true })
  })

  it('dispatches serially, rejects non-allowlisted methods and never returns native error details', async () => {
    directory = mkdtempSync(join(tmpdir(), 'memory-worker-dispatch-test-'))
    worker = new Worker(compileStorageWorker(directory), { workerData: { path: join(directory, 'memory.sqlite') } })
    const responses: unknown[] = []
    const completed = new Promise<void>((resolve, reject) => {
      worker!.on('error', reject)
      worker!.on('message', message => { responses.push(message); if (responses.length === 6) resolve() })
    })
    worker.postMessage({ id: 1, method: 'constructor', args: [] })
    worker.postMessage({ id: 2, method: 'useDatabase', args: [] })
    worker.postMessage({ id: 3, method: 'save', args: ['raven', 'Alice', 'Tea', 'Synthetic first memory.'] })
    worker.postMessage({ id: 4, method: 'save', args: ['raven', 'Alice', 'Tea', 'Synthetic second memory.'] })
    worker.postMessage({ id: 5, method: 'list', args: ['raven', 'Alice'] })
    worker.postMessage({ id: 6, method: 'names', args: [null] })
    await completed
    expect(responses.slice(0, 2)).toEqual([
      { id: 1, ok: false, error: 'memory_invalid_input' }, { id: 2, ok: false, error: 'memory_invalid_input' }
    ])
    expect(responses[4]).toMatchObject({ id: 5, ok: true, value: [{ text: 'Synthetic second memory.', revision: 2 }] })
    expect(responses[5]).toEqual({ id: 6, ok: false, error: 'memory_invalid_input' })
  })
})

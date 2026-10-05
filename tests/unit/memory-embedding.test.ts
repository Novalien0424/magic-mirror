import { EventEmitter } from 'node:events'
import { spawn, type ChildProcess } from 'node:child_process'
import { access } from 'node:fs/promises'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryEmbedder, type MemoryEmbeddingEvent } from '../../src/main/memory/embedding'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))
vi.mock('node:fs/promises', () => ({ access: vi.fn() }))

const DIMENSIONS = 1024
const syntheticVector = () => [3, 4, ...Array<number>(DIMENSIONS - 2).fill(0)]

class FakeWorker extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  requests: Array<Record<string, unknown>> = []
  kill = vi.fn((_signal?: NodeJS.Signals) => {
    queueMicrotask(() => this.emit('close', null, 'SIGTERM'))
    return true
  })
  constructor() {
    super()
    this.stdin.on('data', (data: Buffer) => {
      this.requests.push(JSON.parse(data.toString()) as Record<string, unknown>)
    })
  }
  message(message: unknown) { this.stdout.write(`${JSON.stringify(message)}\n`) }
}

function fixture(options: { maxQueue?: number; startupTimeoutMs?: number; requestTimeoutMs?: number } = {}) {
  const worker = new FakeWorker()
  vi.mocked(spawn).mockReturnValue(worker as unknown as ChildProcess)
  const events: MemoryEmbeddingEvent[] = []
  const embedder = createMemoryEmbedder({
    runtimeDirectory: '/synthetic/runtime', report: (event) => events.push(event), ...options,
  })
  return { worker, events, embedder }
}

async function start(f: ReturnType<typeof fixture>) {
  await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(1))
  f.worker.message({ type: 'ready', version: f.embedder.version, dimensions: DIMENSIONS })
}

function result(f: ReturnType<typeof fixture>, id = f.worker.requests.at(-1)?.id, values = syntheticVector()) {
  f.worker.message({ type: 'embedding', id, values })
}

function rejects(promise: Promise<unknown>, code: string) {
  return expect(promise).rejects.toMatchObject({ name: 'MemoryEmbeddingError', code, message: code })
}

beforeEach(() => { vi.clearAllMocks(); vi.mocked(access).mockResolvedValue(undefined) })
afterEach(() => { vi.useRealTimers() })

describe('Main local memory embedder (invariants 1, 3, 8–12)', () => {
  it('rejects invalid runtime options using only a content-free error', () => {
    for (const runtimeDirectory of ['', 'relative/runtime', undefined]) {
      expect(() => createMemoryEmbedder({ runtimeDirectory: runtimeDirectory as string, report: vi.fn() }))
        .toThrowError('invalid_options')
    }
    for (const maxQueue of [0, 129, Infinity, 1.5]) {
      expect(() => createMemoryEmbedder({ runtimeDirectory: '/synthetic/runtime', report: vi.fn(), maxQueue }))
        .toThrowError('invalid_options')
    }
  })

  it('starts lazily, keeps one warm child, sends only text/purpose/request ID, and normalizes vectors', async () => {
    const f = fixture()
    expect(spawn).not.toHaveBeenCalled()
    expect(f.embedder.version).toMatch(/^memory-embedding\.v1:[a-f0-9]{64}$/)
    const first = f.embedder.embed('Synthetic document', 'document')
    await start(f)
    expect(Object.keys(f.worker.requests[0]).sort()).toEqual(['id', 'purpose', 'text', 'type'])
    expect(f.worker.requests[0].purpose).toBe('document')
    expect(f.worker.requests[0].id).toMatch(/^[0-9]+$/)
    result(f)
    const embedding = await first
    expect(embedding.version).toBe(f.embedder.version)
    expect(embedding.values.length).toBe(DIMENSIONS)
    expect(Math.hypot(...embedding.values)).toBeCloseTo(1, 10)
    const second = f.embedder.embed('Synthetic query', 'query')
    expect(f.worker.requests.at(-1)?.purpose).toBe('query')
    result(f)
    await second
    expect(spawn).toHaveBeenCalledTimes(1)
    await f.embedder.close()
  })

  it('uses explicit package paths, suppresses stderr, and passes no inherited secrets or guest IDs', async () => {
    const worker = new FakeWorker()
    vi.mocked(spawn).mockReturnValue(worker as unknown as ChildProcess)
    const embedder = createMemoryEmbedder({ runtimeDirectory: '/synthetic/runtime',
      workerPath: '/synthetic/package/worker.py', manifestPath: '/synthetic/package/manifest.json', report: vi.fn() })
    const pending = embedder.embed('Synthetic query', 'query')
    const rejection = rejects(pending, 'closed')
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(1))
    const [executable, args, options] = vi.mocked(spawn).mock.calls[0]
    expect(executable).toBe('/synthetic/runtime/venv/bin/python')
    expect(args).toContain('/synthetic/package/worker.py')
    expect(args).toContain('/synthetic/package/manifest.json')
    expect(options).toMatchObject({ stdio: ['pipe', 'pipe', 'ignore'], shell: false })
    expect(Object.keys(options?.env ?? {}).some((key) => /KEY|TOKEN$|SECRET|GUEST|PROFILE/i.test(key))).toBe(false)
    expect(options?.env?.HF_HUB_OFFLINE).toBe('1')
    await embedder.close()
    await rejection
  })

  it('reports missing runtime without installing, downloading, or substituting a model', async () => {
    vi.mocked(access).mockRejectedValue(new Error('synthetic untrusted content'))
    const f = fixture()
    await rejects(f.embedder.embed('Synthetic query', 'query'), 'runtime_missing')
    await rejects(f.embedder.embed('Synthetic query', 'query'), 'runtime_missing')
    expect(spawn).not.toHaveBeenCalled()
    expect(JSON.stringify(f.events)).not.toContain('synthetic untrusted content')
    expect(f.events.some((event) => event.reason === 'runtime_missing')).toBe(true)
    await f.embedder.close()
  })

  it('bounds total outstanding jobs and lets queued queries precede indexing', async () => {
    const f = fixture({ maxQueue: 3 })
    const active = f.embedder.embed('Synthetic first', 'document')
    await start(f)
    const document = f.embedder.embed('Synthetic second', 'document')
    const query = f.embedder.embed('Synthetic query', 'query')
    await rejects(f.embedder.embed('Synthetic overflow', 'query'), 'queue_full')
    result(f)
    await active
    expect(f.worker.requests.at(-1)?.purpose).toBe('query')
    result(f)
    await query
    expect(f.worker.requests.at(-1)?.purpose).toBe('document')
    result(f)
    await document
    expect(f.worker.requests.map(request => Number(request.id))).toEqual([1, 2, 3])
    expect(f.events.some((event) => event.reason === 'queue_full')).toBe(true)
    await f.embedder.close()
  })

  it('rejects already cancelled and invalid input without starting the worker', async () => {
    const f = fixture()
    const abort = new AbortController()
    abort.abort('synthetic untrusted reason')
    await rejects(f.embedder.embed('Synthetic query', 'query', abort.signal), 'cancelled')
    for (const text of ['', ' ', 'x'.repeat(32_769), '\0', '\ud800']) {
      await rejects(f.embedder.embed(text, 'query'), 'invalid_input')
    }
    await rejects(f.embedder.embed('Synthetic query', 'invalid' as 'query'), 'invalid_input')
    expect(spawn).not.toHaveBeenCalled()
    expect(JSON.stringify(f.events)).not.toContain('synthetic untrusted reason')
    await f.embedder.close()
  })

  it('removes queued cancellation without sending its text to the child', async () => {
    const f = fixture()
    const active = f.embedder.embed('Synthetic active', 'document')
    await start(f)
    const abort = new AbortController()
    const queued = f.embedder.embed('Synthetic cancelled', 'query', abort.signal)
    const rejection = rejects(queued, 'cancelled')
    abort.abort()
    await rejection
    result(f)
    await active
    expect(f.worker.requests.length).toBe(1)
    await f.embedder.close()
  })

  it('rejects active cancellation promptly and drains the reply before dispatching another job', async () => {
    const f = fixture()
    const abort = new AbortController()
    const active = f.embedder.embed('Synthetic active', 'query', abort.signal)
    await start(f)
    const id = f.worker.requests[0].id
    const next = f.embedder.embed('Synthetic next', 'query')
    const rejection = rejects(active, 'cancelled')
    abort.abort()
    await rejection
    expect(f.worker.requests.at(-1)).toEqual({ type: 'cancel', id })
    result(f, id)
    expect(f.worker.requests.at(-1)?.type).toBe('embed')
    result(f)
    await next
    expect(f.worker.kill).not.toHaveBeenCalled()
    await f.embedder.close()
  })

  it('accepts a content-free cancellation acknowledgment', async () => {
    const f = fixture()
    const abort = new AbortController()
    const pending = f.embedder.embed('Synthetic query', 'query', abort.signal)
    await start(f)
    const id = f.worker.requests[0].id
    const rejection = rejects(pending, 'cancelled')
    abort.abort()
    f.worker.message({ type: 'cancelled', id })
    await rejection
    const next = f.embedder.embed('Synthetic next', 'query')
    result(f)
    await next
    await f.embedder.close()
  })

  it('handles split and coalesced stdout frames', async () => {
    const f = fixture()
    const pending = f.embedder.embed('Synthetic query', 'query')
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(1))
    const ready = JSON.stringify({ type: 'ready', version: f.embedder.version, dimensions: DIMENSIONS })
    f.worker.stdout.write(ready.slice(0, 15))
    expect(f.worker.requests.length).toBe(0)
    f.worker.stdout.write(`${ready.slice(15)}\n`)
    result(f)
    await pending
    await f.embedder.close()
  })

  it('bounds each stdout line while accepting a large chunk containing multiple valid replies', async () => {
    const f = fixture()
    const pending = f.embedder.embed('Synthetic first', 'document')
    await start(f)
    const second = f.embedder.embed('Synthetic second', 'document')
    const third = f.embedder.embed('Synthetic third', 'document')
    const values = Array(DIMENSIONS).fill(1.2345678901234568e300)
    const frames = [1, 2, 3].map((id) => JSON.stringify({ type: 'embedding', id: String(id), values })).join('\n') + '\n'
    expect(Buffer.byteLength(frames)).toBeGreaterThan(65_536)
    f.worker.stdout.write(frames)
    for (const embedding of await Promise.all([pending, second, third])) {
      expect(Math.hypot(...embedding.values)).toBeCloseTo(1, 10)
    }
    await f.embedder.close()
  })

  it.each([
    ['not JSON', 'malformed_output'],
    ['{"type":"embedding","id":"1","values":[NaN]}', 'malformed_output'],
    [JSON.stringify({ type: 'ready', version: 'different-model', dimensions: DIMENSIONS }), 'version_mismatch'],
    [JSON.stringify({ type: 'ready', version: 'unused', dimensions: 7 }), 'version_mismatch'],
    ['x'.repeat(65_537), 'output_too_large'],
  ])('fails closed on invalid startup protocol (%#)', async (frame, code) => {
    const f = fixture()
    const pending = f.embedder.embed('Synthetic query', 'query')
    const rejection = rejects(pending, code)
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(1))
    f.worker.stdout.write(`${frame}\n`)
    await rejection
    expect(f.worker.kill).toHaveBeenCalled()
    await f.embedder.close()
  })

  it.each([
    { type: 'embedding', id: 'unknown', values: syntheticVector() },
    { type: 'embedding', id: '1', values: [1, 2] },
    { type: 'embedding', id: '1', values: Array(DIMENSIONS).fill(0) },
    { type: 'embedding', id: '1', values: [null, ...syntheticVector().slice(1)] },
    { type: 'embedding', id: '1', values: ['1', ...syntheticVector().slice(1)] },
    { type: 'embedding', id: '1', values: syntheticVector(), text: 'Synthetic forbidden echo' },
    { type: 'error', id: '1', reason: 'Synthetic forbidden raw error' },
    { type: 'cancelled', id: '1' },
  ])('rejects invalid vector/ID/extra fields or untrusted errors without logging payloads (%#)', async (frame) => {
    const f = fixture()
    const pending = f.embedder.embed('Synthetic query', 'query')
    const rejection = rejects(pending, 'malformed_output')
    await start(f)
    f.worker.message(frame)
    await rejection
    expect(JSON.stringify(f.events)).not.toMatch(/Synthetic|values|text/)
    await f.embedder.close()
  })

  it('rejects non-finite JSON numbers and safely normalizes large finite vectors', async () => {
    const f = fixture()
    const pending = f.embedder.embed('Synthetic query', 'query')
    await start(f)
    result(f, undefined, Array(DIMENSIONS).fill(1e308))
    const embedding = await pending
    expect(Math.hypot(...embedding.values)).toBeCloseTo(1, 10)
    const invalid = f.embedder.embed('Synthetic query', 'query')
    const rejection = rejects(invalid, 'malformed_output')
    f.worker.stdout.write(`{"type":"embedding","id":"2","values":[1e999,${Array(DIMENSIONS - 1).fill(0).join(',')}]}\n`)
    await rejection
    await f.embedder.close()
  })

  it('maps a bounded worker error to a content-free failure and can continue using the same model', async () => {
    const f = fixture()
    const pending = f.embedder.embed('Synthetic query', 'query')
    const rejection = rejects(pending, 'input_too_long')
    await start(f)
    f.worker.message({ type: 'error', id: f.worker.requests[0].id, reason: 'input_too_long' })
    await rejection
    const next = f.embedder.embed('Synthetic next', 'query')
    result(f)
    await next
    expect(spawn).toHaveBeenCalledTimes(1)
    await f.embedder.close()
  })

  it.each(['startup', 'request'] as const)('enforces the %s deadline, rejects all work, and never respawns', async (stage) => {
    const f = fixture({ startupTimeoutMs: 30, requestTimeoutMs: 30 })
    const pending = f.embedder.embed('Synthetic query', 'query')
    const reason = stage === 'startup' ? 'startup_timeout' : 'request_timeout'
    const rejection = rejects(pending, reason)
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(1), { interval: 1 })
    if (stage === 'request') f.worker.message({ type: 'ready', version: f.embedder.version, dimensions: DIMENSIONS })
    await rejection
    await rejects(f.embedder.embed('Synthetic query', 'query'), reason)
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(f.worker.kill).toHaveBeenCalled()
    await f.embedder.close()
  })

  it.each(['error', 'close', 'stdin_error'] as const)('sanitizes child %s and rejects active plus queued work', async (kind) => {
    const f = fixture()
    const pending = f.embedder.embed('Synthetic query', 'query')
    await start(f)
    const queued = f.embedder.embed('Synthetic queued', 'document')
    const firstRejection = rejects(pending, 'worker_failed')
    const secondRejection = rejects(queued, 'worker_failed')
    if (kind === 'stdin_error') f.worker.stdin.emit('error', new Error('Synthetic private error'))
    else f.worker.emit(kind, kind === 'error' ? new Error('Synthetic private error') : 1)
    await firstRejection
    await secondRejection
    expect(JSON.stringify(f.events)).not.toContain('Synthetic')
    await f.embedder.close()
  })

  it('closes idempotently, clears pending work, and rejects subsequent calls', async () => {
    const f = fixture()
    const pending = f.embedder.embed('Synthetic query', 'query')
    await start(f)
    const queued = f.embedder.embed('Synthetic queued', 'document')
    const firstRejection = rejects(pending, 'closed')
    const secondRejection = rejects(queued, 'closed')
    await Promise.all([f.embedder.close(), f.embedder.close()])
    await firstRejection
    await secondRejection
    await rejects(f.embedder.embed('Synthetic query', 'query'), 'closed')
    expect(f.worker.kill).toHaveBeenCalledTimes(1)
  })

  it('escalates a stuck shutdown to SIGKILL without spawning a replacement', async () => {
    const f = fixture()
    f.worker.kill.mockImplementation((signal) => {
      if (signal === 'SIGKILL') queueMicrotask(() => f.worker.emit('close', null, signal))
      return true
    })
    const pending = f.embedder.embed('Synthetic query', 'query')
    await start(f)
    const rejection = rejects(pending, 'closed')
    await f.embedder.close()
    await rejection
    expect(f.worker.kill.mock.calls.map(([signal]) => signal)).toEqual(['SIGTERM', 'SIGKILL'])
    expect(spawn).toHaveBeenCalledTimes(1)
  })

  it('reports a bounded shutdown failure when the child never exits', async () => {
    const f = fixture()
    f.worker.kill.mockReturnValue(false)
    const pending = f.embedder.embed('Synthetic query', 'query')
    await start(f)
    const rejection = rejects(pending, 'closed')
    await rejects(f.embedder.close(), 'shutdown_timeout')
    await rejection
    expect(f.events.some((event) => event.reason === 'shutdown_timeout')).toBe(true)
    expect(spawn).toHaveBeenCalledTimes(1)
  })

  it('can close while runtime checks are pending without leaking a child', async () => {
    let finish!: () => void
    vi.mocked(access).mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
    const f = fixture()
    const pending = f.embedder.embed('Synthetic query', 'query')
    const rejection = rejects(pending, 'closed')
    await f.embedder.close()
    finish()
    await rejection
    await Promise.resolve()
    expect(spawn).not.toHaveBeenCalled()
  })

  it('contains a throwing report callback so diagnostics cannot block recall cleanup', async () => {
    const worker = new FakeWorker()
    vi.mocked(spawn).mockReturnValue(worker as unknown as ChildProcess)
    const embedder = createMemoryEmbedder({ runtimeDirectory: '/synthetic/runtime', report: () => { throw Error('Synthetic reporter') } })
    const pending = embedder.embed('Synthetic query', 'query')
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(1))
    worker.message({ type: 'ready', version: embedder.version, dimensions: DIMENSIONS })
    worker.message({ type: 'embedding', id: worker.requests[0].id, values: syntheticVector() })
    await pending
    await embedder.close()
  })
})

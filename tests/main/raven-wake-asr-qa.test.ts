import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ credential: vi.fn(), convert: vi.fn(), comparison: vi.fn() }))
vi.mock('../../src/main/environment-credential-source', () => ({ createEnvironmentCredentialSource: () => ({ get: mocks.credential }) }))
vi.mock('decibri', () => ({ File: { buffer: mocks.convert } }))
vi.mock('node:child_process', () => ({ spawnSync: mocks.comparison }))
import { compareWakeQaAsr } from '../../src/main/raven-wake-asr-qa'

describe('physical wake QA cloud boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('MIRROR_RAVEN_CONVERSATION_QA', '1')
    vi.stubEnv('MIRROR_RAVEN_CONVERSATION_QA_SCENARIO', 'wake_capture')
    mocks.credential.mockResolvedValue('synthetic-master')
    mocks.convert.mockImplementation(async function* () { yield Buffer.alloc(48000) })
    mocks.comparison.mockReturnValue({ status: 0, stdout: '[{"traditionalScriptEquivalent":true}]' })
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

  const run = (pcm = new Int16Array(16000)) => compareWakeQaAsr(pcm, 16000, 'configured-model', 'hello', { tokens: '' })

  it.each(['wake_replay', 'wake_control', ''])('never obtains credentials or converts audio in scenario %s', async scenario => {
    vi.stubEnv('MIRROR_RAVEN_CONVERSATION_QA_SCENARIO', scenario)
    await expect(run()).rejects.toThrow('raven_qa_asr_scope_invalid')
    expect(mocks.credential).not.toHaveBeenCalled()
    expect(mocks.convert).not.toHaveBeenCalled()
  })

  it('rejects a capture beyond the bounded duration before accessing credentials', async () => {
    await expect(run(new Int16Array(16000 * 15 + 1))).rejects.toThrow('raven_qa_asr_scope_invalid')
    expect(mocks.credential).not.toHaveBeenCalled()
  })

  function socket(acknowledgedModel: string, event: object) {
    const sent: Record<string, unknown>[] = [], closed = vi.fn()
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ value: 'ek_synthetic' }) })
    vi.stubGlobal('fetch', fetch)
    class Socket extends EventTarget {
      constructor() {
        super()
        queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'session.created',
          session: { audio: { input: { transcription: { model: acknowledgedModel } } } } }) })))
      }
      send(value: string) {
        const message = JSON.parse(value); sent.push(message)
        if (message.type === 'input_audio_buffer.commit') queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(event) })))
      }
      close() { closed() }
    }
    vi.stubGlobal('WebSocket', Socket)
    return { sent, closed, fetch }
  }

  it('sends no captured audio when the acknowledged model differs', async () => {
    const connection = socket('unexpected-model', {})
    await expect(run()).resolves.toEqual({ status: 'unavailable', stage: 'session_model_mismatch' })
    expect(connection.sent).toEqual([])
    expect(connection.closed).toHaveBeenCalledOnce()
  })

  it('returns comparison metadata without the transcript or credentials and supplies no phrase hint', async () => {
    const connection = socket('configured-model', { type: 'conversation.item.input_audio_transcription.completed', transcript: 'hello' })
    const result = await run()
    expect(result).toMatchObject({ status: 'completed', exact: true, model: 'configured-model', hints: 'none', acknowledgedModelMatches: true })
    expect(JSON.stringify(result)).not.toMatch(/hello|synthetic-master|ek_synthetic/)
    const request = JSON.parse(connection.fetch.mock.calls[0]![1].body)
    expect(request.session.audio.input.transcription).toEqual({ model: 'configured-model', languages: ['zh-tw'], delay: 'medium' })
    expect(connection.sent.at(-1)?.type).toBe('input_audio_buffer.commit')
    expect(connection.closed).toHaveBeenCalledOnce()
  })

  it('does not retain arbitrary provider error content', async () => {
    socket('configured-model', { type: 'error', error: { message: 'private provider detail' } })
    await expect(run()).resolves.toEqual({ status: 'unavailable', stage: 'provider_error' })
  })
})

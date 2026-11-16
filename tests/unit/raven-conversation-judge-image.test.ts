import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEnvironmentCredentialSource } from '../../src/main/environment-credential-source'
import { judgeRavenConversation } from '../../src/main/raven-conversation-judge'
vi.mock('../../src/main/environment-credential-source', () => ({ createEnvironmentCredentialSource: vi.fn() }))
const base = { model: 'configured-model', instructions: 'synthetic instructions', schema: {}, evidence: {} }
beforeEach(() => {
  vi.mocked(createEnvironmentCredentialSource).mockReturnValue({ get: async () => 'synthetic-test-token' })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"passed":true}' }] }] }))))
})
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })
describe('image judge bounded image input', () => {
  it.each(['png', 'jpeg'])('accepts a RAM %s image with storage disabled', async format => {
    const image = `data:image/${format};base64,aGVsbG8=`
    expect(await judgeRavenConversation({ ...base, image })).toEqual({ passed: true })
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string)
    expect(body.store).toBe(false)
    expect(body.input[0].content[1]).toEqual({ type: 'input_image', image_url: image, detail: 'auto' })
  })
  it.each(['https://example.com/image.png', 'data:image/svg+xml;base64,aGVsbG8=', 'data:image/png;base64,not base64'])('rejects unsupported or remote inputs before credentials/fetch', async image => {
    await expect(judgeRavenConversation({ ...base, image })).rejects.toThrow('raven_qa_judge_unavailable')
    expect(createEnvironmentCredentialSource).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([['jpeg', 3_000_000], ['png', 12_000_000]])('rejects oversized %s input before credentials/fetch', async (format, length) => {
    await expect(judgeRavenConversation({ ...base, image: `data:image/${format};base64,${'a'.repeat(length as number)}` })).rejects.toThrow('raven_qa_judge_unavailable')
    expect(createEnvironmentCredentialSource).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
})

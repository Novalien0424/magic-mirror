import { describe, expect, it, vi } from 'vitest'
import { createStudioConceptProvider, STUDIO_CONCEPT_CONFIG } from '../../src/main/studio/concept-provider'
import { parseStudioConcept, SAMPLE_STUDIO_CONCEPT } from '../../src/shared/studio-concept'
const credentials = { get: async () => 'synthetic-test-key' }
const payload = (value: unknown = SAMPLE_STUDIO_CONCEPT) => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }))
describe('Studio concept provider', () => {
  it('selects a bounded brief with dedicated versioned instructions, store false and no image call', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => payload())
    const provider = createStudioConceptProvider({ credentials, fetchImpl })
    expect(await provider.select({ operation: 'initial', answers: [{ question: 'A moment?', answer: 'visitor-private-answer' }] })).toMatchObject({ ok: true, concept: SAMPLE_STUDIO_CONCEPT })
    const request = JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string)
    expect(request).toMatchObject({ model: STUDIO_CONCEPT_CONFIG.modelId, store: false, instructions: STUDIO_CONCEPT_CONFIG.instructions })
    expect(JSON.parse(request.input)).toEqual({ operation: 'initial', answers: [{ question: 'A moment?', answer: 'visitor-private-answer' }] })
    expect(request).not.toHaveProperty('tools')
  })
  it('does not send answers on refine and supplies them on explicit reimagine', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => payload())
    const provider = createStudioConceptProvider({ credentials, fetchImpl })
    await provider.select({ operation: 'refine', answers: [{ question: 'private', answer: 'private' }], previous: SAMPLE_STUDIO_CONCEPT, change: 'green wings' })
    expect(JSON.parse(JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string).input)).toEqual({ operation: 'refine', previous: SAMPLE_STUDIO_CONCEPT, change: 'green wings' })
    await provider.select({ operation: 'reimagine', answers: [{ question: 'moment', answer: 'moving' }], previous: SAMPLE_STUDIO_CONCEPT, change: 'a plant instead' })
    expect(JSON.parse(JSON.parse(fetchImpl.mock.calls[1]![1]!.body as string).input)).toHaveProperty('answers')
  })
  it.each([{ ...SAMPLE_STUDIO_CONCEPT, extra: 'private' }, { ...SAMPLE_STUDIO_CONCEPT, mood: '' }, { ...SAMPLE_STUDIO_CONCEPT, mood: 'x'.repeat(601) }])('rejects malformed briefs without echoing content', async invalid => {
    expect(parseStudioConcept(invalid)).toBeNull()
    expect(await createStudioConceptProvider({ credentials, fetchImpl: async () => payload(invalid) }).select({ operation: 'initial' })).toMatchObject({ ok: false, code: 'studio_provider_contract' })
  })
  it('cancels before credential/fetch access', async () => {
    const get = vi.fn(), fetchImpl = vi.fn(); const controller = new AbortController(); controller.abort()
    expect(await createStudioConceptProvider({ credentials: { get }, fetchImpl }).select({ operation: 'initial', signal: controller.signal })).toMatchObject({ ok: false, code: 'studio_cancelled' })
    expect(get).not.toHaveBeenCalled(); expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('bounds response bytes and converts HTTP/network failures into metadata codes', async () => {
    const oversized = await createStudioConceptProvider({ credentials, fetchImpl: async () => new Response('x'.repeat(65537)) }).select({ operation: 'initial' })
    expect(oversized).toMatchObject({ ok: false, code: 'studio_provider_contract' })
    for (const fetchImpl of [async () => new Response('private-provider-error', { status: 500 }), async () => { throw Error('private-network-error') }]) {
      const result = await createStudioConceptProvider({ credentials, fetchImpl }).select({ operation: 'initial' })
      expect(result).toMatchObject({ ok: false, code: 'studio_image_unavailable' }); expect(JSON.stringify(result)).not.toContain('private')
    }
  })
})

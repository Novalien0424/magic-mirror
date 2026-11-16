import source from '../../../resources/config/studio-concept.v1.json' with { type: 'json' }
import { createEnvironmentCredentialSource, type EnvironmentCredentialSource } from '../environment-credential-source'
import { parseStudioConcept, studioConceptDirection, studioConceptDirectionIssue, STUDIO_CONCEPT_KEYS, type StudioConcept } from '../../shared/studio-concept'

export const STUDIO_CONCEPT_CONFIG = Object.freeze(source)
export type StudioConceptResult = { ok: true; concept: StudioConcept; elapsedMs: number } | { ok: false; code: 'studio_cancelled' | 'studio_image_timeout' | 'studio_image_unavailable' | 'studio_provider_contract'; elapsedMs: number }
export interface StudioConceptInput {
  operation: 'initial' | 'refine' | 'reimagine'
  direction?: string
  answers?: readonly { question: string; answer: string; context?: string }[]
  previous?: StudioConcept
  change?: string
  signal?: AbortSignal
}
export interface StudioConceptProvider { select(input: StudioConceptInput): Promise<StudioConceptResult> }
const schema = { type: 'object', properties: Object.fromEntries(STUDIO_CONCEPT_KEYS.map(key => [key, { type: 'string', minLength: 1, maxLength: 600 }])), required: [...STUDIO_CONCEPT_KEYS], additionalProperties: false }

/** Main-only Responses call. Inputs, briefs and credentials never enter diagnostics. */
export function createStudioConceptProvider(deps: { credentials?: EnvironmentCredentialSource; fetchImpl?: typeof fetch; now?: () => number } = {}): StudioConceptProvider {
  const credentials = deps.credentials ?? createEnvironmentCredentialSource(), now = deps.now ?? Date.now
  return { async select(input) {
    const started = now()
    const failure = (code: Extract<StudioConceptResult, { ok: false }>['code']): StudioConceptResult => ({ ok: false, code, elapsedMs: now() - started })
    const deadline = AbortSignal.timeout(source.timeoutMs), signal = input.signal ? AbortSignal.any([input.signal, deadline]) : deadline
    try {
      if (input.signal?.aborted) return failure('studio_cancelled')
      if (input.direction !== undefined && studioConceptDirectionIssue(input.direction)) return failure('studio_provider_contract')
      const credential = await credentials.get()
      if (!credential) return failure('studio_image_unavailable')
      if (signal.aborted) return failure(input.signal?.aborted ? 'studio_cancelled' : 'studio_image_timeout')
      const response = await (deps.fetchImpl ?? fetch)('https://api.openai.com/v1/responses', {
        method: 'POST', signal, headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: source.modelId, store: false, reasoning: { effort: source.reasoningEffort }, max_output_tokens: source.maxOutputTokens,
          instructions: source.instructions,
          input: JSON.stringify({ operation: input.operation, operatorCreativeDirection: studioConceptDirection({ conceptDirection: input.direction }), ...(input.operation !== 'refine' ? { answers: input.answers ?? [] } : {}), ...(input.previous ? { previous: input.previous } : {}), ...(input.change ? { change: input.change } : {}) }),
          text: { format: { type: 'json_schema', name: 'studio_concept', strict: true, schema } } }),
      })
      if (!response.ok || !response.body) { await response.body?.cancel().catch(() => undefined); return failure('studio_image_unavailable') }
      const reader = response.body.getReader(), chunks: Uint8Array[] = []
      let bytes = 0
      try { while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; if (bytes > 64 * 1024) { await reader.cancel(); return failure('studio_provider_contract') }; chunks.push(part.value) } }
      finally { reader.releaseLock() }
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (result.status !== 'completed' || !Array.isArray(result.output)) return failure('studio_provider_contract')
      const text = result.output.filter((item: { type: string; phase?: unknown }) => item.type === 'message' && (item.phase == null || item.phase === 'final_answer')).flatMap((item: { content?: { type: string; text?: string }[] }) => item.content ?? [])
      if (text.length !== 1 || text[0].type !== 'output_text' || typeof text[0].text !== 'string') return failure('studio_provider_contract')
      const concept = parseStudioConcept(JSON.parse(text[0].text))
      if (!concept) return failure('studio_provider_contract')
      if (input.signal?.aborted) return failure('studio_cancelled')
      return { ok: true, concept, elapsedMs: now() - started }
    } catch { return failure(input.signal?.aborted ? 'studio_cancelled' : deadline.aborted ? 'studio_image_timeout' : 'studio_image_unavailable') }
  } }
}

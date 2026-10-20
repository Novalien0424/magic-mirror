import { z } from 'zod'
import type { MemoryRequest, MemoryLanguage } from '../../shared/memory'
import { MEMORY_PROMPTS } from '../../shared/memory-prompts'

export interface MemoryIntentInput {
  task: 'confirmation' | 'request' | 'introduction'
  text: string
  question?: string
  request?: MemoryRequest
}
export interface MemoryIntentResult {
  confirmation: 'yes' | 'no' | 'unclear'
  authorized: boolean
  name: string
  language: MemoryLanguage
}
export type MemoryInterpreter = (input: MemoryIntentInput, signal: AbortSignal) => Promise<MemoryIntentResult>
const failureCodes = new Set(['memory_interpretation_unavailable', 'memory_interpretation_timeout',
  'memory_interpretation_http', 'memory_interpretation_schema', 'memory_interpretation_cancelled'])
const responseStatuses = new Set(['completed', 'incomplete', 'failed', 'in_progress', 'queued', 'cancelled'])
export function memoryInterpretationFailure(error: unknown): string {
  return error instanceof Error && failureCodes.has(error.message) ? error.message : 'memory_interpretation_unavailable'
}
const output = z.object({ confirmation: z.enum(['yes', 'no', 'unclear']), authorized: z.boolean(),
  name: z.string().max(80).refine(s => !/[\u0000-\u001f\u007f]/u.test(s)), language: z.enum(['en', 'zh-TW']) }).strict()
const schema = { type: 'object', properties: { confirmation: { type: 'string', enum: ['yes', 'no', 'unclear'] },
  authorized: { type: 'boolean' }, name: { type: 'string' }, language: { type: 'string', enum: ['en', 'zh-TW'] } },
required: ['confirmation', 'authorized', 'name', 'language'], additionalProperties: false }
const instructions = MEMORY_PROMPTS.intent.instructions
const taskInstructions: Readonly<Record<MemoryIntentInput['task'], string>> = MEMORY_PROMPTS.intent.tasks

/** Runs only for a pending confirmation or an explicit memory tool, never ordinary speech. */
export function createMemoryInterpreter(options: { credentialSource: { get(): Promise<string | null> }; model(): Promise<string>; fetchImpl?: typeof fetch; report?(code: string): void }): MemoryInterpreter {
  return async (input, signal) => {
    let deadline: AbortSignal | undefined
    let stage: 'input' | 'setup' | 'dispatch' | 'body' | 'envelope' | 'completion' | 'final_output' | 'payload' = 'input'
    let size = 0, httpStatus = 0, completionStatus = 'none'
    const started = performance.now()
    try {
      if (signal.aborted) throw Error('memory_interpretation_cancelled')
      if (!input.text.trim() || input.text.length > 4000) throw Error('memory_interpretation_unavailable')
      stage = 'setup'
      const [key, model] = await Promise.all([options.credentialSource.get(), options.model()])
      if (!key || !model || signal.aborted) throw Error()
      deadline = AbortSignal.timeout(8000)
      const requestSignal = AbortSignal.any([signal, deadline])
      stage = 'dispatch'
      const response = await (options.fetchImpl ?? fetch)('https://api.openai.com/v1/responses', {
        method: 'POST', signal: requestSignal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, store: false, instructions: `${instructions}\n${taskInstructions[input.task]}`, input: JSON.stringify(input),
          text: { format: { type: 'json_schema', name: 'memory_intent', strict: true, schema } } }),
      })
      httpStatus = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? response.status : 0
      requestSignal.throwIfAborted()
      if (!response.ok) throw Error('memory_interpretation_http')
      stage = 'body'
      if (!response.body) { options.report?.('memory_interpretation_body_missing'); throw Error('memory_interpretation_schema') }
      const reader = response.body.getReader(), chunks: Uint8Array[] = []
      try {
        while (true) {
          const part = await reader.read()
          if (part.done) break
          size += part.value.byteLength
          // The Responses envelope can contain reasoning/provider metadata far
          // larger than this tiny assessment. Bound it separately from payload.
          if (size > 64 * 1024) {
            await reader.cancel().catch(() => {}); options.report?.('memory_interpretation_body_oversized')
            throw Error('memory_interpretation_schema')
          }
          chunks.push(part.value)
        }
      } finally { reader.releaseLock() }
      requestSignal.throwIfAborted()
      stage = 'envelope'
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        stage = 'completion'
        completionStatus = responseStatuses.has(body?.status) ? body.status : 'unknown'
        if (body.status !== 'completed' || !Array.isArray(body.output)) throw Error()
        stage = 'final_output'
        const parts = body.output.filter((p: { type: string; phase?: unknown }) => p.type === 'message' && (p.phase == null || p.phase === 'final_answer')).flatMap((p: { content?: unknown[] }) => p.content ?? [])
        if (parts.length !== 1 || parts[0]?.type !== 'output_text') throw Error()
        stage = 'payload'
        if (typeof parts[0].text !== 'string' || Buffer.byteLength(parts[0].text, 'utf8') > 2048) throw Error()
        return output.parse(JSON.parse(parts[0].text))
      } catch { options.report?.(`memory_interpretation_${stage}_invalid`); throw Error('memory_interpretation_schema') }
    } catch (error) {
      // Failure-only metadata: fixed stages/statuses and capped numeric values.
      // Never include response text, provider errors, input or signal reasons.
      const elapsed = Math.min(8000, Math.max(0, Math.ceil((performance.now() - started) / 100) * 100))
      options.report?.(`memory_interpretation_failed_${stage}_http_${httpStatus}_status_${completionStatus}_bytes_${Math.min(size, 65537)}_ms_${elapsed}`)
      throw Error(signal.aborted ? 'memory_interpretation_cancelled' : deadline?.aborted ? 'memory_interpretation_timeout' : memoryInterpretationFailure(error))
    }
  }
}

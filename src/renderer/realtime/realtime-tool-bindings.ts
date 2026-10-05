import { backgroundResult } from '@openai/agents/realtime'
import type { FunctionTool } from '@openai/agents'
import { z } from 'zod'
import { realtimeToolDefinition, type RealtimeToolSpec, type ToolOutcome } from '../../shared/realtime-tools'
import { memoryNeedsReset } from '../../shared/memory'

export type RealtimeToolHandler = (arguments_: Readonly<Record<string, unknown>>) => Promise<ToolOutcome | { outcome: ToolOutcome; memory: import('../../shared/memory').MemoryReply }>
export type ToolFailureReason = 'tool_arguments_rejected' | 'tool_execution_failed'

/** Bind only code-authorized handlers. Raw JSON schemas alone do not validate SDK input. */
export function bindRealtimeTools(specs: readonly RealtimeToolSpec[], handlers: Readonly<Record<string, RealtimeToolHandler>>,
  onFailure: (reason: ToolFailureReason) => void): FunctionTool<unknown, undefined, unknown>[] {
  return specs.map(spec => {
    if (!Object.hasOwn(handlers, spec.handler)) throw new Error('realtime_tool_handler_unavailable')
    const handler = handlers[spec.handler]!
    const validator = z.fromJSONSchema(spec.parameters)
    const result = (outcome: ToolOutcome, memory?: import('../../shared/memory').MemoryReply) => {
      const payload = { ...spec.results[outcome], ...(memory ? { memory } : {}) }
      const responds = memory?.code !== 'memory_result_stale' && (spec.completion === 'response'
        || spec.completion === 'background_on_success' && (outcome === 'failed' || outcome === 'rejected')
        || spec.completion === 'background_on_reset' && !memoryNeedsReset(memory?.code ?? ''))
      return responds ? payload : backgroundResult(payload)
    }
    return {
      ...realtimeToolDefinition(spec),
      strict: true,
      needsApproval: async () => false,
      isEnabled: async () => true,
      invoke: async (_context, rawInput) => {
        let arguments_: Record<string, unknown>
        try { arguments_ = validator.parse(JSON.parse(rawInput)) as Record<string, unknown> }
        catch { onFailure('tool_arguments_rejected'); return result('rejected') }
        try {
          const value = await handler(Object.freeze(arguments_))
          const outcome = typeof value === 'string' ? value : value.outcome
          if (!Object.hasOwn(spec.results, outcome)) throw new Error('invalid_tool_outcome')
          return result(outcome, typeof value === 'string' ? undefined : value.memory)
        } catch { onFailure('tool_execution_failed'); return result('failed') }
      },
    }
  })
}

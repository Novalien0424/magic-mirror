import { backgroundResult } from '@openai/agents/realtime'
import type { FunctionTool } from '@openai/agents'
import { z } from 'zod'
import { realtimeToolDefinition, type RealtimeToolSpec, type ToolOutcome } from '../../shared/realtime-tools'

export type RealtimeToolHandler = (arguments_: Readonly<Record<string, unknown>>) => Promise<ToolOutcome>
export type ToolFailureReason = 'tool_arguments_rejected' | 'tool_execution_failed'

/** Bind only code-authorized handlers. Raw JSON schemas alone do not validate SDK input. */
export function bindRealtimeTools(specs: readonly RealtimeToolSpec[], handlers: Readonly<Record<string, RealtimeToolHandler>>,
  onFailure: (reason: ToolFailureReason) => void): FunctionTool<unknown, undefined, unknown>[] {
  return specs.map(spec => {
    if (!Object.hasOwn(handlers, spec.handler)) throw new Error('realtime_tool_handler_unavailable')
    const handler = handlers[spec.handler]!
    const validator = z.fromJSONSchema(spec.parameters)
    return {
      ...realtimeToolDefinition(spec),
      strict: true,
      needsApproval: async () => false,
      isEnabled: async () => true,
      invoke: async (_context, rawInput) => {
        let arguments_: Record<string, unknown>
        try { arguments_ = validator.parse(JSON.parse(rawInput)) as Record<string, unknown> }
        catch { onFailure('tool_arguments_rejected'); return backgroundResult(spec.results.rejected) }
        try {
          const outcome = await handler(Object.freeze(arguments_))
          if (!Object.hasOwn(spec.results, outcome)) throw new Error('invalid_tool_outcome')
          return backgroundResult(spec.results[outcome])
        } catch { onFailure('tool_execution_failed'); return backgroundResult(spec.results.failed) }
      },
    }
  })
}

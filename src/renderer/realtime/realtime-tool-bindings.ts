import { backgroundResult } from '@openai/agents/realtime'
import type { FunctionTool } from '@openai/agents'
import { z } from 'zod'
import { realtimeToolDefinition, type RealtimeToolSpec, type ToolOutcome } from '../../shared/realtime-tools'
import { memoryNeedsReset } from '../../shared/memory'
import { REALTIME_PROMPTS } from '../../shared/realtime-prompts'

type ToolResultCode = import('../../shared/media-skill').MediaFailureCode | 'media_discovery_results' | 'media_discovery_unavailable'
export type RealtimeToolHandler = (arguments_: Readonly<Record<string, unknown>>) => Promise<ToolOutcome | { outcome: ToolOutcome;
  code?: ToolResultCode;
  next?: 'ask' | 'explain' | 'find_media' | 'play_media' | 'search_youtube'; playback?: import('../../shared/media-skill').MediaSkillRequest;
  memory?: import('../../shared/memory').MemoryReply; media?: import('../../shared/media-discovery').MediaDiscoveryReply;
  youtube?: import('../../shared/youtube-search').YoutubeSearchReply; studio?: import('../../shared/portrait-studio').StudioReply
  image?: import('../../shared/image-skill').ImageSkillReply
  /** The visitor already heard this call's line, so the result needs no reply. */
  spoken?: boolean }>
export type ToolFailureReason = 'tool_arguments_rejected' | 'tool_execution_failed'

/** Bind only code-authorized handlers. Raw JSON schemas alone do not validate SDK input. */
export function bindRealtimeTools(specs: readonly RealtimeToolSpec[], handlers: Readonly<Record<string, RealtimeToolHandler>>,
  onFailure: (reason: ToolFailureReason) => void,
  onInvocation?: (name: string) => (outcome: ToolOutcome) => void): FunctionTool<unknown, undefined, unknown>[] {
  return specs.map(spec => {
    if (!Object.hasOwn(handlers, spec.handler)) throw new Error('realtime_tool_handler_unavailable')
    const handler = handlers[spec.handler]!
    const validator = z.fromJSONSchema(spec.parameters)
    const result = (outcome: ToolOutcome, memory?: import('../../shared/memory').MemoryReply,
      media?: import('../../shared/media-discovery').MediaDiscoveryReply, youtube?: import('../../shared/youtube-search').YoutubeSearchReply,
      failureCode?: ToolResultCode, next?: 'ask' | 'explain' | 'find_media' | 'play_media' | 'search_youtube', playback?: import('../../shared/media-skill').MediaSkillRequest,
      studio?: import('../../shared/portrait-studio').StudioReply, spoken = false, image?: import('../../shared/image-skill').ImageSkillReply) => {
      // Speech routing stays in application code, not in model-visible results.
      // The confirmation receipt belongs to the application-owned dialogue.
      const { confirmation: _confirmation, ...modelMemory } = memory ?? {}
      const { status, code } = spec.results[outcome]
      const payload = { status, code: image?.code ?? failureCode ?? code, ...(memory ? { memory: modelMemory } : {}), ...(media ? { media } : {}), ...(youtube ? { youtube } : {}), ...(next ? { next } : {}), ...(playback ? { playback } : {}),
        ...(image?.next ? { next: image.next } : {}),
        // Studio guidance is application/operator text; the guest list only ever appears as ≤3 matched candidates.
        ...(studio ? { studio: { code: studio.code, ...(studio.candidates ? { candidates: studio.candidates } : {}) }, ...(studio.next ? { next: studio.next } : {}) } : {}),
        ...(spec.handler === 'find_media' && media?.code === 'media_discovery_no_match'
          ? { next: next === 'search_youtube' ? REALTIME_PROMPTS.mediaOnlineSearch : REALTIME_PROMPTS.mediaNoMatch } : {}),
        ...(failureCode === 'media_source_restricted' || failureCode === 'media_source_unconfirmed' ? { next: REALTIME_PROMPTS.mediaNoMatch } : {}),
        ...(memory?.code === 'memory_action_not_requested' ? { next: REALTIME_PROMPTS.memoryActionNotRequested } : {}),
        ...(memory?.code === 'memory_identity_required' ? { next: REALTIME_PROMPTS.memoryLocked } : {}) }
      // A pending identity question speaks next; a model reply would cancel it.
      // Duplicate or stale studio replies stay silent.
      const responds = !spoken && image?.code !== 'image_consent_pending' && !image?.code.endsWith('_stale') && !media?.code.endsWith('_stale') && !youtube?.code.endsWith('_stale') && memory?.code !== 'memory_result_stale'
        && memory?.code !== 'memory_confirmation_required' && memory?.code !== 'memory_confirmation_pending'
        && !(studio && /_(?:duplicate|stale)$/.test(studio.code)) && (spec.completion === 'response'
        || spec.completion === 'background_on_success' && (next || outcome === 'failed' || outcome === 'rejected'
          || outcome === 'ignored' && spec.results.ignored.speech === 'model')
        || spec.completion === 'background_on_reset' && !memoryNeedsReset(memory?.code ?? ''))
      return responds ? payload : backgroundResult(payload)
    }
    return {
      ...realtimeToolDefinition(spec),
      strict: true,
      needsApproval: async () => false,
      isEnabled: async () => true,
      invoke: async (_context, rawInput) => {
        const observed = onInvocation?.(spec.name)
        const finish = (outcome: ToolOutcome) => { try { observed?.(outcome) } catch { /* diagnostics cannot gate tools */ } }
        let arguments_: Record<string, unknown>
        try {
          let parsed = JSON.parse(rawInput)
          // Older saved QA/operator callers used the two-field search schema.
          // The current model schema explicitly requires new/refine context.
          if (spec.handler === 'find_media' && Object.hasOwn(spec.parameters.properties ?? {}, 'context')
            && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            parsed = { context: 'new', ...parsed }
          }
          if (spec.handler === 'memory' && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            parsed = { name: '', topic: '', text: '', query: '', ...parsed }
          }
          arguments_ = validator.parse(parsed) as Record<string, unknown>
        }
        catch {
          onFailure('tool_arguments_rejected')
          finish('rejected')
          return result('rejected', spec.handler === 'memory' ? { status: 'rejected', code: 'memory_tool_arguments_rejected' } : undefined)
        }
        try {
          const value = await handler(Object.freeze(arguments_))
          const outcome = typeof value === 'string' ? value : value.outcome
          if (!Object.hasOwn(spec.results, outcome)) throw new Error('invalid_tool_outcome')
          finish(outcome)
          return typeof value === 'string' ? result(outcome) : result(outcome, value.memory, value.media, value.youtube, value.code, value.next, value.playback, value.studio, value.spoken, value.image)
        } catch { onFailure('tool_execution_failed'); finish('failed'); return result('failed') }
      },
    }
  })
}

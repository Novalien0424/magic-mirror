import { createSpellTriggerGuard, normalizeTranscript, type SpellTriggerGuard } from '../../main/scenes/spell-trigger'
import type { ScenePublicCatalog, SceneStartResult, SceneStatusEvent } from '../../shared/types'

interface SceneTranscriptBridge {
  getSceneCatalog(): Promise<ScenePublicCatalog>
  triggerScene(request: Readonly<{ spellId: string; turnId: string }>): Promise<SceneStartResult>
  stopScene(request: Readonly<{ runId: string; turnId: string }>): Promise<'stopped' | 'stale'>
}

export type SceneTranscriptDecision =
  | Readonly<{ decision: 'triggered'; result: SceneStartResult }>
  | Readonly<{ decision: 'stopped'; result: 'stopped' | 'stale' }>
  | Readonly<{ decision: 'ignored' | 'failed'; reason: string }>

export interface SceneTranscriptController {
  handleStatus(event: SceneStatusEvent): void
  handleInputItemCreated(itemId: string, turnId?: string): void
  handleCompletedTranscript(input: Readonly<{
    itemId: string
    transcript: string
    realtimeSessionId: string
  }>): Promise<SceneTranscriptDecision>
}

const TURN_LIMIT = 2048

export function createSceneTranscriptController(input: Readonly<{
  bridge: SceneTranscriptBridge
  interrupt: () => Promise<unknown>
  metadataSink?: (reason: string, realtimeSessionId: string) => void
}>): SceneTranscriptController {
  const boundaries = new Map<string, { runId: string | null; turnId: string }>()
  const turnOrder: string[] = []
  const consumed = new Set<string>()
  let activeRunId: string | null = null
  let sequence = 0
  let catalogVersion = -1
  let stopPhrase = ''
  let spellGuard: SpellTriggerGuard | null = null

  const report = (reason: string, sessionId: string): void => {
    try { input.metadataSink?.(reason, sessionId) } catch { /* metadata is non-gating */ }
  }

  const refreshCatalog = async (): Promise<void> => {
    const catalog = await input.bridge.getSceneCatalog()
    if (catalog.configVersion === catalogVersion) return
    catalogVersion = catalog.configVersion
    stopPhrase = normalizeTranscript(catalog.stopPhrase)
    spellGuard = createSpellTriggerGuard(catalog.spells.map((spell) => ({
      spellId: spell.id,
      phrase: spell.phrase,
    })))
  }

  return Object.freeze({
    handleStatus(event: SceneStatusEvent): void {
      if (event.type === 'finished') {
        if (event.result.runId === activeRunId) activeRunId = null
      } else {
        activeRunId = event.runId
      }
    },

    handleInputItemCreated(itemId: string, turnId?: string): void {
      if (boundaries.has(itemId) || consumed.has(itemId)) return
      boundaries.set(itemId, {
        runId: activeRunId,
        turnId: turnId ?? `scene-turn-${String(++sequence)}`,
      })
      turnOrder.push(itemId)
      if (turnOrder.length > TURN_LIMIT) {
        const expired = turnOrder.shift()
        if (expired !== undefined) {
          boundaries.delete(expired)
          consumed.delete(expired)
        }
      }
    },

    async handleCompletedTranscript(completed: Readonly<{
      itemId: string; transcript: string; realtimeSessionId: string
    }>): Promise<SceneTranscriptDecision> {
      if (consumed.has(completed.itemId)) return { decision: 'ignored', reason: 'duplicate_turn' }
      const boundary = boundaries.get(completed.itemId)
      if (boundary === undefined || completed.transcript.trim() === '') {
        report('transcript_unavailable', completed.realtimeSessionId)
        return { decision: 'ignored', reason: 'transcript_unavailable' }
      }
      boundaries.delete(completed.itemId)
      consumed.add(completed.itemId)
      try {
        await refreshCatalog()
        const normalized = normalizeTranscript(completed.transcript)
        if (stopPhrase !== '' && normalized === stopPhrase) {
          if (boundary.runId === null) {
            report('stale_scene_stop', completed.realtimeSessionId)
            return { decision: 'ignored', reason: 'stale_scene_stop' }
          }
          await input.interrupt()
          const result = await input.bridge.stopScene({ runId: boundary.runId, turnId: boundary.turnId })
          if (result === 'stale') report('stale_scene_stop', completed.realtimeSessionId)
          return { decision: 'stopped', result }
        }
        const decision = spellGuard?.evaluate({
          turnId: boundary.turnId,
          status: 'final',
          transcript: completed.transcript,
        })
        if (decision === undefined || decision.decision === 'ignore') {
          const reason = decision?.reason ?? 'invalid_config'
          report(reason, completed.realtimeSessionId)
          return { decision: 'ignored', reason }
        }
        await input.interrupt()
        return {
          decision: 'triggered',
          result: await input.bridge.triggerScene({ spellId: decision.spellId, turnId: decision.turnId }),
        }
      } catch {
        report('scene_trigger_failed', completed.realtimeSessionId)
        return { decision: 'failed', reason: 'scene_trigger_failed' }
      }
    },
  })
}

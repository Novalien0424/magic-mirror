import { randomUUID } from 'node:crypto'
import { voicePreviewRequestSchema, type VoicePreviewResult } from '../../shared/voice-preview'
import type { SessionModelSnapshot } from '../../shared/types'
import type { ClientSecretBroker } from './client-secret-broker'
export function createVoicePreviewLease(options: {
  isDormant(): boolean
  snapshot(): Promise<Readonly<SessionModelSnapshot>>
  broker: Pick<ClientSecretBroker, 'issue'>
  suppressOutput(): void
  enableOutput(): void
  notify(reason: string): void
}) {
  let token: string | null = null, timer: ReturnType<typeof setTimeout> | undefined
  let suppressedToken: string | null = null
  let delivered = false
  let cancelPreparation: (() => void) | undefined
  const preempt = (reason = 'voice_preview_preempted'): void => {
    if (!token) return
    if (delivered) { suppressedToken = token; options.suppressOutput() }
    token = null; clearTimeout(timer); cancelPreparation?.(); cancelPreparation = undefined; options.notify(reason)
  }
  return {
    preempt,
    cancelPending(): boolean {
      if (!token || delivered) return false
      token = null; clearTimeout(timer); cancelPreparation?.(); cancelPreparation = undefined
      return true
    },
    release(value: unknown): boolean {
      if (typeof value === 'string' && suppressedToken === value) {
        // Renderer acknowledges only after muting/disposing every preview resource.
        // Restore ordinary Console audio and allow the next preview reservation.
        suppressedToken = null; options.enableOutput(); return true
      }
      if (typeof value !== 'string' || token !== value) return false
      token = null; clearTimeout(timer); return true
    },
    async acquire(value: unknown): Promise<VoicePreviewResult> {
      const parsed = voicePreviewRequestSchema.safeParse(value)
      if (!parsed.success) return { ok: false, reason: 'voice_preview_invalid' }
      if (token || suppressedToken || !options.isDormant()) return { ok: false, reason: 'voice_preview_output_busy' }
      const current = randomUUID(); token = current; delivered = false
      timer = setTimeout(() => preempt('voice_preview_timeout'), parsed.data.kind === 'generated' ? 20000 : 300000)
      try {
        if (parsed.data.kind === 'local') { options.enableOutput(); delivered = true; return { ok: true, token: current } }
        const abort = new AbortController()
        const cancelled = new Promise<undefined>(resolve => {
          cancelPreparation = () => { abort.abort(); resolve(undefined) }
        })
        const base = await Promise.race([options.snapshot(), cancelled])
        if (!base || token !== current) return { ok: false, reason: 'voice_preview_preempted' }
        const snapshot = Object.freeze({ ...base, voice: parsed.data.voice, voiceSpeed: parsed.data.voiceSpeed,
          voiceEffects: Object.freeze({ ...parsed.data.voiceEffects }) })
        const issued = await Promise.race([options.broker.issue({ modelId: snapshot.realtimeDialogue, signal: abort.signal }), cancelled])
        if (!issued || token !== current || !options.isDormant()) {
          if (token === current) preempt()
          return { ok: false, reason: 'voice_preview_preempted' }
        }
        options.enableOutput()
        cancelPreparation = undefined
        delivered = true
        return { ok: true, token: current, snapshot, clientSecret: issued.value }
      } catch {
        if (token !== current) return { ok: false, reason: 'voice_preview_preempted' }
        if (token === current) preempt('voice_preview_connection_failed')
        return { ok: false, reason: 'voice_preview_connection_failed' }
      }
    },
  }
}
export type VoicePreviewLease = ReturnType<typeof createVoicePreviewLease>

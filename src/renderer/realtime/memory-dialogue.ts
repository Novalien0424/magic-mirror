import type { MemoryInputPhase, MemoryReply } from '../../shared/memory'
import { buildMemoryAcknowledgment, buildMemoryState, buildSpeechResponse, REALTIME_PROMPTS, sameSpokenQuestion } from '../../shared/realtime-prompts'

interface Options {
  send(event: any): void
  baseInstructions: string
  turnDetection: Record<string, unknown>
  speakingStyle: string
  input(phase: MemoryInputPhase, token: string, text: string): Promise<MemoryReply>
  tail(): Promise<void>
  interrupt(): Promise<void>
  failed(): void
  report(reason: 'memory_question_delivered' | 'memory_dialogue_failed' | 'memory_brief_installed'): void
}
interface Question { token: string; text: string; responseId?: string; started: boolean; done: boolean; stopped: boolean; transcript: string }
/** Owns only the bounded identity exchange. Ordinary voice never waits on this coordinator. */
export class MemoryDialogue {
  private phase: 'idle' | 'preparing' | 'speaking' | 'verifying' | 'awaiting' | 'answering' | 'applying' | 'closed' = 'idle'
  private question?: Question
  private revision = 0
  private timer?: ReturnType<typeof setTimeout>
  private update?: { instructions: string; automatic: boolean; resolve(): void; reject(): void; timer: ReturnType<typeof setTimeout> }
  constructor(private readonly options: Options) {}
  get active(): boolean { return this.phase !== 'idle' && this.phase !== 'closed' }
  private configure(automatic: boolean, state = ''): Promise<void> {
    const instructions = `${this.options.baseInstructions}\n\n${state}\n\n${REALTIME_PROMPTS.memoryRevision} ${++this.revision}`
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.update = undefined; reject(new Error('memory_state_unacknowledged')) }, 3000)
      this.update = { instructions, automatic, resolve, reject: () => reject(new Error('memory_state_cancelled')), timer }
      this.options.send({ type: 'session.update', session: { type: 'realtime', instructions,
        audio: { input: { turn_detection: { ...this.options.turnDetection, create_response: automatic } } } } })
    })
  }
  async ask(q: { token: string; text: string }): Promise<void> {
    if (this.phase !== 'idle') { this.fail(); return }
    this.phase = 'preparing'; this.question = { ...q, started: false, done: false, stopped: false, transcript: '' }
    try {
      await this.configure(false)
      if (this.phase !== 'preparing') return
      this.phase = 'speaking'
      this.timer = setTimeout(() => this.fail(), 20000)
      this.options.send({ type: 'response.create', response: { ...buildSpeechResponse(q.text, this.options.speakingStyle), metadata: { mirror_memory_question: q.token } } })
    } catch { this.fail() }
  }
  speech(): void {
    if (this.phase === 'awaiting') { clearTimeout(this.timer); this.phase = 'answering'; this.timer = setTimeout(() => this.fail(), 10000) }
    else if (this.active) this.fail()
  }
  cancel(): void { if (this.active) this.fail() }
  async answer(reply: MemoryReply): Promise<void> {
    if (this.phase !== 'answering') return
    this.phase = 'applying'
    try {
      const confirmed = reply.code === 'memory_identity_confirmed'
      const state = confirmed ? buildMemoryState(reply) : REALTIME_PROMPTS.memoryUnconfirmed
      if (new TextEncoder().encode(state).length > 6000) throw new Error('memory_state_oversized')
      await this.configure(true, state)
      if (this.phase !== 'applying') return
      clearTimeout(this.timer); this.phase = 'idle'; this.question = undefined
      if (confirmed) this.options.report('memory_brief_installed')
      this.options.send({ type: 'response.create', response: confirmed ? buildMemoryAcknowledgment(reply, this.options.speakingStyle)
        : { tool_choice: 'none', instructions: `${this.options.baseInstructions}\n\n${state}` } })
    } catch { this.fail() }
  }
  event(event: any): void {
    if (this.phase === 'closed') return
    if (event.type === 'session.updated' && this.update) {
      const update = this.update
      if (event.session?.instructions === update.instructions && event.session?.audio?.input?.turn_detection?.create_response === update.automatic) {
        clearTimeout(update.timer); this.update = undefined; update.resolve()
      }
    }
    const q = this.question
    if (!q || !this.active) return
    if (event.type === 'response.created') {
      if (event.response?.metadata?.mirror_memory_question === q.token && this.phase === 'speaking') q.responseId = event.response.id
      else this.fail()
    }
    if (!q.responseId) return
    if (event.type === 'response.done' && event.response?.id === q.responseId) {
      if (event.response.status !== 'completed') { this.fail(); return }
      q.done = true
      q.transcript = (event.response.output ?? []).flatMap((item: any) => item.content ?? []).map((part: any) => part.transcript ?? part.text ?? '').join('')
    }
    if (event.response_id === q.responseId) {
      if (event.type === 'output_audio_buffer.started') q.started = true
      if (event.type === 'output_audio_buffer.stopped') q.stopped = true
      if (event.type === 'output_audio_buffer.cleared') { this.fail(); return }
    }
    if (this.phase === 'speaking' && q.done && q.stopped && q.started) {
      if (!sameSpokenQuestion(q.text, q.transcript)) { this.fail(); return }
      this.phase = 'verifying'
      void this.delivered(q)
    }
  }
  private async delivered(q: Question): Promise<void> {
    try {
      // Existing processed output owns its tail. The question timeout also bounds this wait.
      await this.options.tail()
      if (this.phase !== 'verifying' || this.question !== q) return
      const receipt = await this.options.input('question_played', q.token, q.transcript)
      if (this.phase !== 'verifying' || this.question !== q) return
      if (receipt.code !== 'memory_question_delivered') { this.fail(); return }
      clearTimeout(this.timer); this.phase = 'awaiting'
      this.timer = setTimeout(() => this.fail(), 60000)
      this.options.report('memory_question_delivered')
    } catch { this.fail() }
  }
  private fail(): void {
    if (this.phase === 'closed') return
    const q = this.question
    this.close()
    this.options.report('memory_dialogue_failed')
    // A clean replacement prevents an uncertain update from leaving private context behind.
    void this.options.interrupt().catch(() => {})
    if (q) void this.options.input('question_cancelled', q.token, '').catch(() => {})
    this.options.failed()
  }
  close(): void {
    this.phase = 'closed'; this.question = undefined; clearTimeout(this.timer)
    if (this.update) { clearTimeout(this.update.timer); this.update.reject(); this.update = undefined }
  }
}

import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { ravenConversationProbe } from '../../src/main/raven-conversation-probe'

function probe(globals: Record<string, unknown> = {}) {
  const channel = new EventTarget() as EventTarget & { send(value: string): void }
  channel.send = () => {}
  class Peer extends EventTarget { connectionState = 'connected'; createDataChannel() { return channel }; close() { this.connectionState = 'closed' } }
  class Media { play() {} }
  const window = { RTCPeerConnection: Peer, magicMirror: { onAvatarControl: () => () => {}, onSceneStatus: () => () => {} } } as Record<string, any>
  runInNewContext(ravenConversationProbe([]), { window, navigator: { mediaDevices: {} }, HTMLMediaElement: Media, HTMLAudioElement: Media, setTimeout, clearTimeout, ...globals })
  new window.RTCPeerConnection().createDataChannel()
  const emit = (event: object) => channel.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(event) }))
  return { q: window.__ravenQa, emit, send: (event: object) => channel.send(JSON.stringify(event)) }
}

describe('Raven real protocol observation', () => {
  it('clears response and tool bookkeeping when a local close emits no state event', () => {
    const { q, emit, send } = probe()
    emit({ type: 'response.created', response: { id: 'old' } })
    emit({ type: 'response.function_call_arguments.done', call_id: 'unfinished', name: 'play_media', arguments: '{}' })
    emit({ type: 'output_audio_buffer.started', response_id: 'old' })
    send({ type: 'response.create' })
    q.connections[0].close()
    expect(q.active).toBe(0)
    expect(q.pendingResponses).toBe(0)
    expect(q.openCalls.size).toBe(0)
    expect(q.audio).toBe(false)
  })

  it('resolves a function name from its item and keeps late results on the originating turn', () => {
    const { q, emit, send } = probe()
    q.stage = 'request'
    emit({ type: 'response.created', response: { id: 'r1' } })
    emit({ type: 'response.output_item.added', response_id: 'r1', item: { type: 'function_call', call_id: 'c1', name: 'find_media' } })
    q.stage = 'next_turn'
    // The pinned transport schema does not require name on this done event.
    emit({ type: 'response.function_call_arguments.done', response_id: 'r1', call_id: 'c1', arguments: '{"query":"Rain","kind":"music"}' })
    send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: 'c1', output: '{"status":"accepted"}' } })
    expect(q.tools.map((t: { stage: string }) => t.stage)).toEqual(['request', 'request'])
    expect(q.tools[0].name).toBe('find_media')
    expect(q.tools[0].args.query).toBe('Rain')
  })

  it('does not assign delayed ASR or interrupted output to a newer visitor turn', () => {
    const { q, emit } = probe()
    q.stage = 'first'
    emit({ type: 'input_audio_buffer.speech_started', item_id: 'i1' })
    emit({ type: 'response.created', response: { id: 'r1' } })
    emit({ type: 'output_audio_buffer.started', response_id: 'r1' })
    q.stage = 'interruption'
    emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'i1', transcript: 'Synthetic visitor.' })
    emit({ type: 'response.output_audio_transcript.done', response_id: 'r1', transcript: 'Synthetic response.' })
    emit({ type: 'output_audio_buffer.cleared', response_id: 'r1' })
    expect(q.records.map((r: { stage: string }) => r.stage)).toEqual(['first', 'first'])
    expect(q.audibleResponses.has('r1')).toBe(true)
    expect(q.interrupts).toBe(1)
  })

  it('keeps a turn busy between tool generation, its result, and the requested answer', () => {
    const { q, emit, send } = probe({ document: { querySelector: () => null } })
    emit({ type: 'response.created', response: { id: 'r1' } })
    emit({ type: 'response.function_call_arguments.done', call_id: 'c1', name: 'memory', arguments: '{}' })
    emit({ type: 'response.done', response: { id: 'r1' } })
    expect(q.state().active).toBe(1)
    send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: 'c1', output: '{}' } })
    send({ type: 'response.create', response: {} })
    expect(q.state().active).toBe(1)
    emit({ type: 'response.created', response: { id: 'r2' } })
    expect(q.state().active).toBe(1)
    emit({ type: 'response.done', response: { id: 'r2' } })
    expect(q.state().active).toBe(0)
  })

  it('does not count camera images as text injection or suppressed media speech as audible', () => {
    const { q, emit, send } = probe()
    send({ type: 'conversation.item.create', item: { role: 'user', content: [{ type: 'input_image', image_url: 'synthetic' }] } })
    expect(q.inputText).toBe(0)
    send({ type: 'conversation.item.create', item: { role: 'user', content: [{ type: 'input_text', text: 'synthetic' }] } })
    expect(q.inputText).toBe(1)
    q.media = true
    emit({ type: 'output_audio_buffer.started', response_id: 'suppressed' })
    expect(q.audibleResponses.has('suppressed')).toBe(false)
  })

  it('routes acoustic speech to the requested sink and closes its separate output context', async () => {
    const calls: string[] = []
    class Context {
      destination = {}
      async setSinkId(id: string) { calls.push(id) }
      async resume() { calls.push('resume') }
      async decodeAudioData() { return { duration: .1 } }
      createBufferSource() {
        return { buffer: null, onended: () => {}, connect: (sink: unknown) => { expect(sink).toBe(this.destination) },
          start() { this.onended() }, disconnect() { calls.push('disconnect') } }
      }
      async close() { calls.push('close') }
    }
    const { q } = probe({ AudioContext: Context, atob: () => 'synthetic' })
    q.speech = ['synthetic']; q.wakeOutputId = 'fixture-output'
    await expect(q.speak(0, true)).resolves.toBe(.1)
    expect(calls).toEqual(['fixture-output', 'resume', 'disconnect', 'close'])
    expect(q.tracks).toHaveLength(0)
  })
})

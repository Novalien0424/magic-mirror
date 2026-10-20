import { runInNewContext } from 'node:vm'
import { createHash, webcrypto } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ravenConversationProbe } from '../../src/main/raven-conversation-probe'
import { ravenMemoryQuestionProbe } from '../../src/main/raven-conversation-fixture'

function probe(globals: Record<string, unknown> = {}, physical = false, memory = false) {
  const channel = new EventTarget() as EventTarget & { send(value: string): void }
  const sent: string[] = []
  channel.send = value => { sent.push(value) }
  class Peer extends EventTarget { connectionState = 'connected'; createDataChannel() { return channel }; close() { this.connectionState = 'closed' } }
  class Media { play() {} }
  const window = { RTCPeerConnection: Peer, magicMirror: { onAvatarControl: () => () => {}, onSceneStatus: () => () => {} } } as Record<string, any>
  runInNewContext(ravenConversationProbe([], physical) + (memory ? ravenMemoryQuestionProbe() : ''), { window, navigator: { mediaDevices: {} }, HTMLMediaElement: Media, HTMLAudioElement: Media, setTimeout, clearTimeout, crypto: webcrypto, TextEncoder, ...globals })
  new window.RTCPeerConnection().createDataChannel()
  const emit = (event: object) => channel.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(event) }))
  return { q: window.__ravenQa, emit, sent, send: (event: object) => channel.send(JSON.stringify(event)) }
}

describe('Raven real protocol observation', () => {
  it('observes application identity question tokens in RAM without changing requests or relying on model results', () => {
    const { q, send, sent } = probe({}, false, true)
    q.visit = 1; q.stage = 'identify'
    const event = { type: 'response.create', response: { metadata: { mirror_memory_question: 'question-1' } } }
    send(event)
    expect(sent).toEqual([JSON.stringify(event)])
    expect(q.memoryQuestions).toHaveLength(1)
    expect(q.memoryQuestions[0].stage).toBe('identify')
    expect(q.memoryQuestions[0].visit).toBe(1)
    expect(q.memoryQuestions[0].token === event.response.metadata.mirror_memory_question).toBe(true)
    send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: 'memory',
      output: JSON.stringify({ memory: { code: 'memory_confirmation_required' } }) } })
    send({ type: 'response.create', response: { metadata: { mirror_scene_cue: 'synthetic' } } })
    expect(q.memoryQuestions).toHaveLength(1)
    q.stage = 'correction'; send({ ...event, response: { metadata: { mirror_memory_question: 'question-2' } } })
    expect(q.memoryQuestions).toHaveLength(2)
    expect(q.memoryQuestions[1].stage).toBe('correction')
    expect(q.memoryQuestions[1].token !== q.memoryQuestions[0].token).toBe(true)
    q.dispose()
    expect(q.memoryQuestions).toEqual([])
  })

  it('uses the selected real Jabra stream and releases it; rejects an accidental route substitution', async () => {
    let stopped = 0
    const track = { label: 'Jabra Speak2 75', stop() { stopped++ } }
    const stream = { getAudioTracks: () => [track], getTracks: () => [track] }
    let requested: unknown
    const navigator = { mediaDevices: { getUserMedia: async (constraints: unknown) => { requested = constraints; return stream } } }
    const { q } = probe({ navigator }, true)
    const constraints = { audio: { deviceId: { exact: 'selected' } } }
    expect(await navigator.mediaDevices.getUserMedia(constraints)).toBe(stream)
    expect(requested).toBe(constraints)
    expect(q.mic[0].route).toBe('jabra')
    q.tracks[0].stop()
    expect(stopped).toBe(1)
    expect(q.mic[1].type).toBe('released')
    track.label = 'Unselected microphone'
    await expect(navigator.mediaDevices.getUserMedia(constraints)).rejects.toThrow('physical_input_mismatch')
    expect(stopped).toBe(2)
  })
  it('hashes the actual initial wire prompt and excludes later private context', async () => {
    const { q, send } = probe()
    send({ type: 'session.update', session: { instructions: 'Public prompt with indexed folder resources.' } })
    send({ type: 'session.update', session: { instructions: 'Identity: verbally confirmed. Private synthetic fact.' } })
    await Promise.all(q.promptHashJobs)
    expect(q.promptHashes).toEqual([createHash('sha256').update('Public prompt with indexed folder resources.').digest('hex')])
  })
  it('counts a cancelled provider audio start even when no transcript completes, separately from owned cues', () => {
    const { q, emit } = probe()
    emit({ type: 'response.created', response: { id: 'cancelled' } })
    emit({ type: 'output_audio_buffer.started', response_id: 'cancelled' })
    emit({ type: 'output_audio_buffer.cleared', response_id: 'cancelled' })
    emit({ type: 'response.created', response: { id: 'cue', metadata: { mirror_scene_cue: 'fixture' } } })
    emit({ type: 'output_audio_buffer.started', response_id: 'cue' })
    expect(q.records).toEqual([])
    expect(q.audioTiming.map((e: { applicationOwned: boolean }) => e.applicationOwned)).toEqual([false, true])
  })
  it('records partial ASR timing without retaining its text and attributes it to the originating turn', () => {
    const { q, emit } = probe()
    q.stage = 'first'
    emit({ type: 'input_audio_buffer.speech_started', item_id: 'i1' })
    q.stage = 'next'
    emit({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'i1', delta: 'Synthetic private partial' })
    expect(q.inputTiming).toEqual([{ stage: 'first', kind: 'delta', at: expect.any(Number) }])
    expect(q.records).toEqual([])
  })
  it('counts one transcript per response content item across provider event aliases', () => {
    const { q, emit } = probe()
    const event = { response_id: 'r1', item_id: 'speech1', content_index: 0, transcript: 'Synthetic cue.' }
    emit({ type: 'response.output_audio_transcript.done', ...event })
    emit({ type: 'response.audio_transcript.done', ...event })
    emit({ type: 'response.output_audio_transcript.done', ...event, item_id: 'speech2' })
    expect(q.records).toHaveLength(2)
    expect(q.duplicateTranscriptEvents).toBe(1)
  })
  it('attributes quick-tool preambles to the same response, excluding allowed search and memory bridges', () => {
    const { q, emit } = probe()
    q.stage = 'media-request'
    const response = (id: string, owned = false) => emit({ type: 'response.created', response: { id, ...(owned ? { metadata: { mirror_scene_cue: 'fixture' } } : {}) } })
    const audio = (id: string) => emit({ type: 'output_audio_buffer.started', response_id: id })
    const call = (id: string, name: string, callId: string, args = {}) => emit({ type: 'response.function_call_arguments.done', response_id: id, call_id: callId, name, arguments: JSON.stringify(args) })
    response('search'); audio('search'); call('search', 'search_youtube', 'c1')
    response('play'); call('play', 'play_youtube', 'c2')
    expect(q.toolTiming(['media-request'])[0]).toEqual({ stage: 'media-request', quickToolCalls: 1, quickToolPreambles: 0, unattributedQuickToolCalls: 0 })
    response('local'); audio('local'); call('local', 'find_media', 'c3'); call('local', 'play_media', 'c4')
    response('recall'); audio('recall'); call('recall', 'memory', 'c5', { action: 'recall' })
    response('identify'); audio('identify'); call('identify', 'memory', 'c6', { action: 'identify', name: 'Fixture' })
    response('cue', true); audio('cue'); call('cue', 'capture_camera', 'c7')
    response('late-audio'); call('late-audio', 'capture_camera', 'c8'); audio('late-audio')
    expect(q.toolTiming(['media-request'])[0]).toEqual({ stage: 'media-request', quickToolCalls: 5, quickToolPreambles: 1, unattributedQuickToolCalls: 0 })
    emit({ type: 'response.function_call_arguments.done', call_id: 'unknown', name: 'capture_camera', arguments: '{}' })
    expect(q.toolTiming(['media-request'])[0].unattributedQuickToolCalls).toBe(1)
  })
  it('retains a post-tool answer while the existing output buffer continues without a second start', () => {
    const { q, emit } = probe()
    emit({ type: 'response.created', response: { id: 'before-tool' } })
    emit({ type: 'output_audio_buffer.started', response_id: 'before-tool' })
    emit({ type: 'response.done', response: { id: 'before-tool' } })
    emit({ type: 'response.created', response: { id: 'after-tool' } })
    emit({ type: 'response.output_audio_transcript.done', response_id: 'after-tool', transcript: 'Synthetic answer.' })
    expect(q.audibleResponses.has('after-tool')).toBe(false)
    expect(q.continuedAudioResponses.has('after-tool')).toBe(true)
    emit({ type: 'output_audio_buffer.stopped', response_id: 'before-tool' })
    emit({ type: 'response.output_audio_transcript.done', response_id: 'unplayed', transcript: 'Synthetic unplayed output.' })
    expect(q.continuedAudioResponses.has('unplayed')).toBe(false)
  })
  it('does not infer continued delivery after cancellation or while media suppresses conversation', () => {
    const { q, emit } = probe()
    emit({ type: 'output_audio_buffer.started', response_id: 'cancelled' })
    emit({ type: 'output_audio_buffer.cleared', response_id: 'cancelled' })
    emit({ type: 'response.output_audio_transcript.done', response_id: 'cancelled', transcript: 'Synthetic cancelled output.' })
    expect(q.continuedAudioResponses.has('cancelled')).toBe(false)
    q.media = true
    emit({ type: 'output_audio_buffer.started', response_id: 'media-suppressed' })
    emit({ type: 'response.output_audio_transcript.done', response_id: 'media-suppressed', transcript: 'Synthetic suppressed output.' })
    expect(q.continuedAudioResponses.has('media-suppressed')).toBe(false)
  })
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
    expect(q.tools[0].responseId).toBe('r1')
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

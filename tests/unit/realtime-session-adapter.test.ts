import { describe, expect, it, vi } from "vitest";
import { buildAvatarPrompt, SLEEP_TOOL_DESCRIPTION } from '../../src/shared/avatar-prompt';
import { isBackgroundResult } from '@openai/agents/realtime';
import { buildSpeechResponse } from '../../src/shared/realtime-prompts';

import {
  createRealtimeSession,
  type CreateRealtimeSessionInput,
  type RealtimeSessionDependencies,
} from "../../src/renderer/realtime/realtime-session-adapter";
import { createDeterministicRealtimeTransport } from "../../src/renderer/realtime/realtime-transport";
import type { RealtimeMetadataEvent } from "../../src/shared/realtime-events";
import type { SessionModelSnapshot } from "../../src/shared/types";

type SessionEventListener = (...events: unknown[]) => void;

type AdapterProbe = {
  agentConstructorCalls: unknown[][];
  constructorCalls: unknown[][];
  connect: ReturnType<typeof vi.fn>;
  interrupt: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
  addImage: ReturnType<typeof vi.fn>;
  sendEvent: ReturnType<typeof vi.fn>;
  emit: (eventName: string, ...events: unknown[]) => void;
  dependencies: RealtimeSessionDependencies;
};

function makeAdapterProbe(): AdapterProbe {
  const listeners = new Map<string, SessionEventListener[]>();
  const agentConstructorCalls: unknown[][] = [];
  const constructorCalls: unknown[][] = [];
  const connect = vi.fn(async (..._args: unknown[]) => undefined);
  const interrupt = vi.fn(async (..._args: unknown[]) => undefined);
  const close = vi.fn(async (..._args: unknown[]) => undefined);
  const sendMessage = vi.fn((..._args: unknown[]) => undefined);
  const addImage = vi.fn();
  const transport = createDeterministicRealtimeTransport();
  vi.spyOn(transport, 'sendMessage').mockImplementation(sendMessage);
  const sendEvent = vi.spyOn(transport, 'sendEvent').mockImplementation(() => {});
  vi.spyOn(transport, 'requestResponse').mockImplementation(response => transport.sendEvent({ type: 'response.create', response }));
  const fakeSession = {
    addImage,
    connect,
    interrupt,
    close,
    sendMessage,
    on: vi.fn((eventName: string, listener: SessionEventListener) => {
      const eventListeners = listeners.get(eventName) ?? [];
      eventListeners.push(listener);
      listeners.set(eventName, eventListeners);
    }),
  };
  const RealtimeSession = vi.fn(function (...args: unknown[]) {
    constructorCalls.push(args);
    return fakeSession;
  });
  const RealtimeAgent = vi.fn(function (...args: unknown[]) {
    agentConstructorCalls.push(args);
    return { name: "magic-mirror-realtime" };
  });

  return {
    addImage,
    agentConstructorCalls,
    constructorCalls,
    connect,
    interrupt,
    close,
    sendMessage,
    emit: (eventName, ...events) => {
      for (const listener of listeners.get(eventName) ?? []) listener(...events);
    },
    sendEvent,
    dependencies: {
      RealtimeAgent: RealtimeAgent as unknown as RealtimeSessionDependencies["RealtimeAgent"],
      RealtimeSession: RealtimeSession as unknown as RealtimeSessionDependencies["RealtimeSession"],
      createTransport: () => transport,
    },
  };
}

function makeSnapshot(): SessionModelSnapshot {
  return Object.freeze({
    configVersion: 1,
    fingerprint: "snapshot-fingerprint",
    sdkVersion: "0.16.1",
    realtimeDialogue: "configured-realtime-model",
    inputTranscription: "configured-transcription-model",
    memoryExtractor: "configured-memory-model",
    voice: "configured-voice",
    turnDetectionProfile: "semantic-vad-interruptible",
    reasoningEffort: "medium",
    takenAt: "2026-08-21T00:00:00.000Z",
  });
}

function makeSessionInput(
  snapshot: SessionModelSnapshot,
  eventSink: (event: RealtimeMetadataEvent) => void,
  probe: AdapterProbe,
): CreateRealtimeSessionInput {
  return {
    snapshot,
    clientSecret: "opaque-transient-input",
    mediaStream: {} as MediaStream,
    audioElement: {} as HTMLAudioElement,
    sessionId: "session-a",
    eventSink,
    dependencies: probe.dependencies,
  };
}

describe("RealtimeSession adapter", () => {
  it('does not carry a regex folder restriction into a new model-directed YouTube fallback or wait for final ASR', async () => {
    const probe = makeAdapterProbe(), sink = vi.fn();
    const onSearchYoutube = vi.fn(async () => ({ status: 'accepted' as const, code: 'youtube_search_results' as const, videos: [] }));
    const onMediaRequest = vi.fn(async () => 'accepted' as const);
    const handle = createRealtimeSession({ ...makeSessionInput(makeSnapshot(), sink, probe), onSearchYoutube, onMediaRequest });
    const tools = (probe.agentConstructorCalls[0][0] as { tools: any[] }).tools;
    probe.emit('transport_event', { type: 'input_audio_buffer.speech_started', item_id: 'local' });
    probe.emit('transport_event', { type: 'conversation.item.input_audio_transcription.completed', item_id: 'local', transcript: 'Play Moonlit Lake from our vault.' });
    probe.emit('transport_event', { type: 'input_audio_buffer.speech_started', item_id: 'new-request' });
    expect(await tools.find(t => t.name === 'search_youtube').invoke({}, '{"query":"Moonlit Lake"}')).toMatchObject({ youtube: { code: 'youtube_search_results' } });
    await tools.find(t => t.name === 'play_youtube').invoke({}, '{"url":"https://youtu.be/abcdefghijk","kind":"music","mode":"once"}');
    expect(onSearchYoutube).toHaveBeenCalledOnce();
    expect(onMediaRequest).toHaveBeenCalledOnce();
    expect(sink).not.toHaveBeenCalledWith(expect.objectContaining({ reason: 'media_source_restricted' }));
    expect(JSON.stringify(sink.mock.calls)).not.toContain('Moonlit');
    await handle.close('user_requested');
  });
  it('returns fresh media choices, drops interrupted searches, and marks media tool turns as controls', async () => {
    const probe = makeAdapterProbe(), onMemoryInput = vi.fn(async () => ({ status: 'accepted' as const, code: 'memory_input_recorded' as const }));
    let finish!: (value: import('../../src/shared/youtube-search').YoutubeSearchReply) => void;
    const onSearchYoutube = vi.fn(() => new Promise<import('../../src/shared/youtube-search').YoutubeSearchReply>(resolve => { finish = resolve }));
    const onFindMedia = vi.fn(async () => ({ status: 'accepted' as const, code: 'media_discovery_matches', total: 1,
      resources: [{ kind: 'music' as const, assetId: 'rain', name: 'Rain', aliases: [] }] }));
    const handle = createRealtimeSession({ ...makeSessionInput(makeSnapshot(), vi.fn(), probe), onSearchYoutube, onFindMedia, onMemoryInput });
    const tools = (probe.agentConstructorCalls[0][0] as { tools: any[] }).tools;
    expect(await tools.find(t => t.name === 'find_media').invoke({}, '{"query":"rain","kind":"music"}')).toMatchObject({ media: { total: 1 } });
    const pending = tools.find(t => t.name === 'search_youtube').invoke({}, '{"query":"rain"}');
    await Promise.resolve();
    probe.emit('transport_event', { type: 'input_audio_buffer.speech_started', item_id: 'new-clue' });
    finish({ status: 'accepted', code: 'youtube_search_results', videos: [] });
    expect(isBackgroundResult(await pending)).toBe(true);
    probe.emit('transport_event', { type: 'response.created', response: { id: 'media-response' } });
    probe.emit('transport_event', { type: 'response.done', response: { id: 'media-response', status: 'completed', output: [{ type: 'function_call', name: 'find_media' }] } });
    await vi.waitFor(() => expect(onMemoryInput).toHaveBeenCalledWith('control', 'new-clue', '', expect.any(Object)));
    await handle.close('manual_stop');
  });
  it('explains an unrequested save without describing a storage failure', async () => {
    const probe = makeAdapterProbe();
    const handle = createRealtimeSession({ ...makeSessionInput(makeSnapshot(), vi.fn(), probe),
      onMemory: async () => ({ status: 'ignored', code: 'memory_action_not_requested', mode: 'automatic' }) });
    const tools = (probe.agentConstructorCalls[0][0] as { tools: any[] }).tools;
    const result = await tools.find(t => t.name === 'memory').invoke({}, JSON.stringify({ action: 'remember', name: '', topic: 'Work', text: 'Designs exhibits', query: '' }));
    expect(result).toMatchObject({ status: 'ignored', memory: { mode: 'automatic' }, guidance: expect.stringContaining('not a storage failure') });
    await handle.close('manual_stop');
  });
  it('distinguishes invalid memory arguments from a completed empty lookup', async () => {
    const probe = makeAdapterProbe(), onMemory = vi.fn();
    const handle = createRealtimeSession({ ...makeSessionInput(makeSnapshot(), vi.fn(), probe), onMemory });
    const tools = (probe.agentConstructorCalls[0][0] as { tools: any[] }).tools;
    const result = await tools.find(t => t.name === 'memory').invoke({}, JSON.stringify({ action: 'recall', query: 'project' }));
    expect(result).toMatchObject({ memory: { status: 'rejected', code: 'memory_tool_arguments_rejected' } });
    expect(onMemory).not.toHaveBeenCalled();
    await handle.close('manual_stop');
  });
  it('waits for pre-tool speech playback before dispatching the identity question', async () => {
    const probe = makeAdapterProbe();
    const handle = createRealtimeSession({ ...makeSessionInput(makeSnapshot(), vi.fn(), probe), waitForOutputTail: async () => {},
      onMemory: async () => ({ status: 'accepted', code: 'memory_confirmation_required', confirmation: { token: 'q', text: 'Are you Alex?' } }) });
    probe.emit('transport_event', { type: 'response.created', response: { id: 'preamble' } });
    probe.emit('transport_event', { type: 'output_audio_buffer.started', response_id: 'preamble' });
    probe.emit('transport_event', { type: 'response.done', response: { id: 'preamble', status: 'completed', output: [{ content: [{ type: 'audio', transcript: 'Let me check.' }] }] } });
    const tools = (probe.agentConstructorCalls[0][0] as { tools: any[] }).tools;
    await tools.find(t => t.name === 'memory').invoke({}, JSON.stringify({ action: 'identify', name: 'Alex', topic: '', text: '', query: '' }));
    probe.emit('agent_tool_end', {}, {}, { name: 'memory' });
    expect(probe.sendEvent.mock.calls.some(([e]) => e.type === 'session.update')).toBe(false);
    probe.emit('transport_event', { type: 'output_audio_buffer.stopped', response_id: 'preamble' });
    await vi.waitFor(() => expect(probe.sendEvent.mock.calls.some(([e]) => e.type === 'session.update')).toBe(true));
    const update = probe.sendEvent.mock.calls.find(([e]) => e.type === 'session.update')![0];
    probe.emit('transport_event', { type: 'session.updated', session: update.session });
    await vi.waitFor(() => expect(probe.sendEvent.mock.calls.some(([e]) => e.type === 'response.create')).toBe(true));
    await handle.close('manual_stop');
  });
  it.each(['stopped', 'cleared'])('does not re-arm finished audio on a late response.done after output %s', async end => {
    const probe = makeAdapterProbe();
    const handle = createRealtimeSession({ ...makeSessionInput(makeSnapshot(), vi.fn(), probe), waitForOutputTail: async () => {},
      onMemory: async () => ({ status: 'accepted', code: 'memory_confirmation_required', confirmation: { token: 'q', text: 'Are you Alex?' } }) });
    probe.emit('transport_event', { type: 'response.created', response: { id: 'greeting' } });
    probe.emit('transport_event', { type: 'output_audio_buffer.started', response_id: 'greeting' });
    probe.emit('transport_event', { type: 'output_audio_buffer.' + end, response_id: 'greeting' });
    probe.emit('transport_event', { type: 'response.done', response: { id: 'greeting', status: end === 'cleared' ? 'cancelled' : 'completed', output: [{ content: [{ type: 'audio', transcript: 'Hello.' }] }] } });
    const tools = (probe.agentConstructorCalls[0][0] as { tools: any[] }).tools;
    await tools.find(t => t.name === 'memory').invoke({}, JSON.stringify({ action: 'identify', name: 'Alex', topic: '', text: '', query: '' }));
    probe.emit('agent_tool_end', {}, {}, { name: 'memory' });
    expect(probe.sendEvent.mock.calls.some(([e]) => e.type === 'session.update')).toBe(true);
    await handle.close('manual_stop');
  });
  it('keeps ordinary speech eligible when the model attempts an unsolicited memory save', async () => {
    const probe = makeAdapterProbe();
    const memoryInput = vi.fn(async (_phase: string) => ({ status: 'accepted' as const, code: 'memory_turn_observed' }));
    const handle = createRealtimeSession({ ...makeSessionInput(makeSnapshot(), vi.fn(), probe), onMemoryInput: memoryInput });
    probe.emit('transport_event', { type: 'input_audio_buffer.speech_started', item_id: 'ordinary-story' });
    probe.emit('transport_event', { type: 'input_audio_buffer.committed', item_id: 'ordinary-story' });
    probe.emit('transport_event', { type: 'response.created', response: { id: 'response-story' } });
    probe.emit('transport_event', { type: 'conversation.item.input_audio_transcription.completed', item_id: 'ordinary-story', transcript: 'I chose cork because it reduces glare.' });
    probe.emit('transport_event', { type: 'response.done', response: { id: 'response-story', status: 'completed', output: [{ type: 'function_call', name: 'memory', arguments: JSON.stringify({ action: 'remember' }) }] } });
    await vi.waitFor(() => expect(memoryInput.mock.calls.map(c => c[0])).toContain('settled'));
    expect(memoryInput.mock.calls.map(c => c[0])).not.toContain('control');
    await handle.close('manual_stop');
  });
  it('silences a recall that finishes after a new spoken turn', async () => {
    const probe = makeAdapterProbe();
    let deliver!: (value: any) => void;
    const memory = vi.fn(() => new Promise<any>(resolve => { deliver = resolve }));
    const handle = createRealtimeSession({ ...makeSessionInput(makeSnapshot(), vi.fn(), probe), onMemory: memory });
    const agent = probe.agentConstructorCalls[0][0] as { tools: any[] };
    const pending = agent.tools.find(t => t.name === 'memory').invoke({}, JSON.stringify({ action: 'recall', name: '', topic: '', text: '', query: 'travel' }));
    await vi.waitFor(() => expect(memory).toHaveBeenCalledOnce());
    probe.emit('transport_event', { type: 'input_audio_buffer.speech_started', item_id: 'next-turn' });
    deliver({ status: 'accepted', code: 'memory_recalled', entries: [{ text: 'private-old-result' }] });
    const result = await pending;
    expect(isBackgroundResult(result)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('private-old-result');
    await handle.close('manual_stop');
  });
  it('delivers an application question then synchronizes the confirmed policy and brief before replying', async () => {
    const probe = makeAdapterProbe(), sink = vi.fn();
    const memoryInput = vi.fn(async (phase: string, itemId?: string) => phase === 'complete' && itemId === 'confirm'
      ? { status: 'accepted' as const, code: 'memory_identity_confirmed', mode: 'automatic' as const, entries: [{ id: 'private-row', topic: 'tea', text: 'Prefers green tea', updatedAt: '' }] }
      : { status: 'accepted' as const, code: phase === 'question_played' ? 'memory_question_delivered' : phase === 'complete' ? 'memory_confirmation_stale' : 'memory_turn_observed' });
    const onMemory = vi.fn(async () => ({ status: 'accepted' as const, code: 'memory_confirmation_required', confirmation: { token: 'question', text: 'Are you Alex?' } }));
    const handle = createRealtimeSession({ ...makeSessionInput(makeSnapshot(), sink, probe), onMemoryInput: memoryInput, onMemory, waitForOutputTail: async () => {} });
    const tools = (probe.agentConstructorCalls[0][0] as { tools: any[] }).tools;
    const result = await tools.find(t => t.name === 'memory').invoke({}, JSON.stringify({ action: 'identify', name: 'Alex', topic: '', text: '', query: '' }));
    expect(isBackgroundResult(result)).toBe(true);
    probe.emit('agent_tool_end', {}, {}, { name: 'memory' });
    const update = () => probe.sendEvent.mock.calls.filter(([e]) => e.type === 'session.update').at(-1)![0];
    probe.emit('transport_event', { type: 'session.updated', session: update().session });
    await vi.waitFor(() => expect(probe.sendEvent.mock.calls.some(([e]) => e.type === 'response.create')).toBe(true));
    probe.emit('transport_event', { type: 'response.created', response: { id: 'question-response', metadata: { mirror_memory_question: 'question' } } });
    probe.emit('transport_event', { type: 'output_audio_buffer.started', response_id: 'question-response' });
    probe.emit('transport_event', { type: 'response.done', response: { id: 'question-response', status: 'completed', output: [{ content: [{ transcript: 'Are you Alex?' }] }] } });
    probe.emit('transport_event', { type: 'output_audio_buffer.stopped', response_id: 'question-response' });
    await vi.waitFor(() => expect(memoryInput.mock.calls.map(c => c[0])).toContain('question_played'));
    await vi.waitFor(() => expect(JSON.stringify(sink.mock.calls)).toContain('memory_question_delivered'));
    probe.emit('transport_event', { type: 'input_audio_buffer.speech_started', item_id: 'confirm' });
    probe.emit('transport_event', { type: 'conversation.item.input_audio_transcription.completed', item_id: 'earlier', transcript: 'Synthetic earlier utterance.' });
    await vi.waitFor(() => expect(memoryInput).toHaveBeenCalledWith('complete', 'earlier', 'Synthetic earlier utterance.', expect.any(Object)));
    expect(probe.sendEvent.mock.calls.filter(([e]) => e.type === 'session.update')).toHaveLength(1);
    probe.emit('transport_event', { type: 'input_audio_buffer.committed', item_id: 'confirm' });
    probe.emit('transport_event', { type: 'conversation.item.input_audio_transcription.completed', item_id: 'confirm', transcript: 'yes' });
    await vi.waitFor(() => expect(update().session.instructions).toContain('Prefers green tea'));
    expect(update().session.instructions).toContain('Automatic:');
    expect(update().session.instructions).not.toContain('private-row');
    expect(probe.sendEvent.mock.calls.filter(([e]) => e.type === 'response.create')).toHaveLength(1);
    probe.emit('transport_event', { type: 'session.updated', session: update().session });
    await vi.waitFor(() => expect(probe.sendEvent.mock.calls.filter(([e]) => e.type === 'response.create')).toHaveLength(2));
    expect(JSON.stringify(sink.mock.calls)).toContain('memory_brief_installed');
    expect(JSON.stringify(sink.mock.calls)).toContain('memory_input_unavailable');
    expect(JSON.stringify(sink.mock.calls)).not.toContain('Synthetic earlier utterance.');
    await handle.close('manual_stop');
  });
  it('waits for a late spoken identity confirmation before retrying recall', async () => {
    const probe = makeAdapterProbe(), sink = vi.fn();
    const memory = vi.fn().mockResolvedValueOnce({ status: 'rejected', code: 'memory_confirmation_pending' })
      .mockResolvedValueOnce({ status: 'accepted', code: 'memory_recalled', entries: [] });
    const memoryInput = vi.fn(async () => ({ status: 'accepted' as const, code: 'memory_identity_confirmed' }));
    const handle = createRealtimeSession({ ...makeSessionInput(makeSnapshot(), sink, probe), onMemory: memory, onMemoryInput: memoryInput });
    const agent = probe.agentConstructorCalls[0][0] as { tools: { name: string; invoke(context: unknown, input: string): Promise<unknown> }[] };
    const result = agent.tools.find(t => t.name === 'memory')!.invoke({}, JSON.stringify({ action: 'recall', name: '', topic: '', text: '', query: '' }));
    await vi.waitFor(() => expect(memory).toHaveBeenCalledOnce());
    probe.emit('transport_event', { type: 'input_audio_buffer.committed', item_id: 'late-confirmation' });
    probe.emit('transport_event', { type: 'conversation.item.input_audio_transcription.completed', item_id: 'late-confirmation', transcript: 'yes' });
    expect(await result).toMatchObject({ memory: { code: 'memory_recalled' } });
    expect(memory).toHaveBeenCalledTimes(2);
    await handle.close('manual_stop');
  });
  it('orders memory input observation before tools, drops late recall and resets only after tool output', async () => {
    const probe = makeAdapterProbe(), sink = vi.fn(), order: string[] = [];
    const memoryInput = vi.fn(async (phase: string) => { order.push(phase); return { status: 'accepted' as const, code: 'memory_turn_observed' } });
    const memory = vi.fn(async () => { order.push('tool'); return { status: 'accepted' as const, code: 'memory_forgotten' } });
    const reset = vi.fn(async () => ({ status: 'accepted' as const, code: 'memory_session_replaced' }));
    const handle = createRealtimeSession({ ...makeSessionInput(makeSnapshot(), sink, probe), onMemory: memory, onMemoryInput: memoryInput, onMemoryReset: reset });
    const agent = probe.agentConstructorCalls[0][0] as { tools: { name: string; invoke(context: unknown, input: string): Promise<unknown> }[] };
    probe.emit('transport_event', { type: 'input_audio_buffer.committed', item_id: 'fixture-input' });
    probe.emit('transport_event', { type: 'conversation.item.input_audio_transcription.completed', item_id: 'fixture-input', transcript: 'Synthetic confirmation' });
    const tool = agent.tools.find(t => t.name === 'memory')!;
    expect(isBackgroundResult(await tool.invoke({}, JSON.stringify({ action: 'forget', name: '', topic: 'Fixture', text: '', query: '' })))).toBe(true);
    expect(order).toEqual(['start', 'complete', 'tool']);
    expect(reset).not.toHaveBeenCalled();
    probe.emit('agent_tool_end', {}, {}, { name: 'memory' });
    await vi.waitFor(() => expect(reset).toHaveBeenCalledOnce());
    expect(probe.interrupt).toHaveBeenCalledOnce();
    expect(JSON.stringify(sink.mock.calls)).not.toContain('Synthetic confirmation');
    await handle.close('manual_stop');
    expect(await tool.invoke({}, JSON.stringify({ action: 'recall', name: '', topic: '', text: '', query: '' }))).toMatchObject({ status: 'failed' });
    expect(memory).toHaveBeenCalledOnce();
  });
  it('keeps cleanup unacknowledged and reports a failed transport close to the runtime owner', async () => {
    const probe = makeAdapterProbe(), failed = vi.fn(), reset = vi.fn();
    probe.close.mockRejectedValueOnce(new Error('synthetic close failure'));
    const handle = createRealtimeSession({ ...makeSessionInput(makeSnapshot(), vi.fn(), probe), onFailure: failed,
      onMemory: async () => ({ status: 'accepted', code: 'memory_forgotten' }), onMemoryReset: reset });
    const agent = probe.agentConstructorCalls[0][0] as { tools: any[] };
    await agent.tools.find(t => t.name === 'memory').invoke({}, JSON.stringify({ action: 'forget', name: '', topic: 'Fixture', text: '', query: '' }));
    probe.emit('agent_tool_end', {}, {}, { name: 'memory' });
    await vi.waitFor(() => expect(failed).toHaveBeenCalledOnce());
    expect(reset).not.toHaveBeenCalled();
    await handle.close('manual_stop');
  });
  it('resets after a committed correction even when a new utterance makes its tool result stale', async () => {
    const probe = makeAdapterProbe(), sink = vi.fn(), order: string[] = [];
    let finish!: (value: any) => void;
    const onMemory = vi.fn(() => new Promise<any>(resolve => { finish = resolve }));
    probe.close.mockImplementation(async () => { order.push('close') });
    const reset = vi.fn(async () => { order.push('reset'); return { status: 'accepted' as const, code: 'memory_session_replaced' } });
    const handle = createRealtimeSession({ ...makeSessionInput(makeSnapshot(), sink, probe), onMemory, onMemoryReset: reset });
    const tools = (probe.agentConstructorCalls[0][0] as { tools: any[] }).tools;
    const pending = tools.find(t => t.name === 'memory').invoke({}, JSON.stringify({ action: 'remember', name: '', topic: 'Tea', text: 'Synthetic corrected preference', query: '' }));
    try {
      await vi.waitFor(() => expect(onMemory).toHaveBeenCalledOnce());
      probe.emit('transport_event', { type: 'input_audio_buffer.speech_started', item_id: 'replacement' });
      finish({ status: 'accepted', code: 'memory_corrected' });
      expect(isBackgroundResult(await pending)).toBe(true);
      expect(reset).not.toHaveBeenCalled();
      probe.emit('agent_tool_end', {}, {}, { name: 'memory' });
      await vi.waitFor(() => expect(reset).toHaveBeenCalledOnce());
      expect(probe.interrupt).toHaveBeenCalledOnce();
      expect(order).toEqual(['close', 'reset']);
      expect(JSON.stringify(sink.mock.calls)).not.toContain('Synthetic corrected preference');
    } finally { finish?.({ status: 'rejected', code: 'memory_result_stale' }); await pending; await handle.close('manual_stop') }
  });
  it('disables conversation during media, drops background turns, and still accepts the exact wake phrase', async () => {
    const probe = makeAdapterProbe(), sink = vi.fn(), onMediaRequest = vi.fn(async () => 'accepted' as const);
    const handle = createRealtimeSession({ ...makeSessionInput(makeSnapshot(), sink, probe), onMediaRequest,
      avatar: { name: 'QA', personality: '', speakingStyle: '', wakeGreeting: '', sleepFarewell: '', wakePhrase: 'Mirror wake' } });
    const turns = vi.fn(), transcripts = vi.fn();
    handle.onInputItemCreated!(turns); handle.onInputTranscriptCompleted!(transcripts);
    handle.setMediaPlayback!(true);
    expect(probe.sendEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'session.update', session: expect.objectContaining({ audio: expect.objectContaining({ input: expect.objectContaining({ turn_detection: expect.objectContaining({ create_response: false }) }) }) }) }));
    probe.emit('transport_event', { type: 'input_audio_buffer.committed', item_id: 'background' });
    probe.emit('transport_event', { type: 'conversation.item.input_audio_transcription.completed', item_id: 'background', transcript: 'Synthetic background speech' });
    expect(turns).not.toHaveBeenCalled(); expect(transcripts).not.toHaveBeenCalled(); expect(onMediaRequest).not.toHaveBeenCalled();
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ reason: 'media_wake_not_matched', status: 'info' }));
    expect(probe.sendEvent).not.toHaveBeenCalledWith({ type: 'conversation.item.delete', item_id: 'background' });
    // The SDK retrieves completed input before updating its RAM-only history.
    probe.emit('transport_event', { type: 'conversation.item.retrieved', item: { id: 'background', role: 'user' } });
    expect(probe.sendEvent).toHaveBeenCalledWith({ type: 'conversation.item.delete', item_id: 'background' });
    probe.emit('transport_event', { type: 'conversation.item.input_audio_transcription.completed', item_id: 'wake', transcript: 'Mirror wake' });
    await Promise.resolve(); expect(onMediaRequest).toHaveBeenCalledOnce();
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ reason: 'media_wake_matched', status: 'info' }));
    probe.emit('transport_event', { type: 'input_audio_buffer.committed', item_id: 'late-background' });
    handle.setMediaPlayback!(false);
    expect(probe.sendEvent).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'session.update', session: expect.objectContaining({ audio: expect.objectContaining({ input: expect.objectContaining({ turn_detection: expect.objectContaining({ create_response: true }) }) }) }) }));
    probe.emit('transport_event', { type: 'conversation.item.created', item: { role: 'user', id: 'late-background' } });
    probe.emit('transport_event', { type: 'conversation.item.input_audio_transcription.completed', item_id: 'late-background', transcript: 'Synthetic delayed background speech' });
    expect(turns).not.toHaveBeenCalled(); expect(transcripts).not.toHaveBeenCalled();
    probe.emit('transport_event', { type: 'conversation.item.retrieved', item: { id: 'late-background', role: 'user' } });
    expect(probe.sendEvent).toHaveBeenCalledWith({ type: 'conversation.item.delete', item_id: 'late-background' });
  });
  it('adds a requested camera frame before returning a response result and drops late captures', async () => {
    const probe = makeAdapterProbe(), sink = vi.fn();
    let deliver!: (frame: { dataUrl: string; width: number; height: number } | null) => void;
    const capture = vi.fn(() => new Promise<{ dataUrl: string; width: number; height: number } | null>(resolve => { deliver = resolve }));
    const handle = createRealtimeSession({ ...makeSessionInput(makeSnapshot(), sink, probe), onCameraCapture: capture });
    const agent = probe.agentConstructorCalls[0][0] as { tools: { name: string; invoke(context: unknown, input: string): Promise<unknown> }[] };
    const tool = agent.tools.find(t => t.name === 'capture_camera')!;
    const result = tool.invoke({}, '{}');
    deliver({ dataUrl: 'data:image/jpeg;base64,/9j/2Q==', width: 640, height: 480 });
    expect(await result).toMatchObject({ status: 'accepted', code: 'camera_image_added' });
    expect(probe.addImage).toHaveBeenCalledExactlyOnceWith('data:image/jpeg;base64,/9j/2Q==', { triggerResponse: false });
    const late = tool.invoke({}, '{}');
    await handle.close('manual_stop');
    deliver({ dataUrl: 'data:image/jpeg;base64,/9j/2Q==', width: 640, height: 480 });
    expect(await late).toMatchObject({ status: 'ignored' });
    expect(probe.addImage).toHaveBeenCalledOnce();
    expect(JSON.stringify(sink.mock.calls)).not.toContain('data:image');
  });
  it('makes concurrent close callers wait for the same release', async () => {
    const probe = makeAdapterProbe();
    let release!: () => void;
    probe.close.mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
    const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), vi.fn(), probe));
    const first = handle.close('manual_stop');
    let secondDone = false;
    const second = handle.close('manual_stop').then(() => { secondDone = true; });
    await Promise.resolve();
    expect(secondDone).toBe(false);
    release();
    await Promise.all([first, second]);
    expect(probe.close).toHaveBeenCalledOnce();
  });
  it('rejects invalid sleep arguments without a farewell or leaving conversation suppressed', async () => {
    const probe=makeAdapterProbe(), sink=vi.fn(), onAudioActivity=vi.fn();
    const handle=createRealtimeSession({...makeSessionInput(makeSnapshot(),sink,probe),onAudioActivity});
    const agent=probe.agentConstructorCalls[0][0] as {tools:{name:string;invoke(context:unknown,input:string):Promise<unknown>}[]};
    probe.emit('transport_event',{type:'response.output_item.added',item:{type:'function_call',name:'return_to_dormant'}});
    const result=await agent.tools[0].invoke({},'{"unexpected":true}');
    expect(result).toMatchObject({content:{status:'rejected',code:'tool_arguments_rejected'}});
    probe.emit('agent_tool_end',{},agent,agent.tools[0],result);
    expect(probe.sendEvent).not.toHaveBeenCalled();
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({reason:'tool_arguments_rejected'}));
    probe.emit('transport_event',{type:'output_audio_buffer.started',response_id:'next-conversation'});
    expect(onAudioActivity).toHaveBeenCalledWith('output_started');
    await handle.close('manual_stop');
  });
  it('makes sleep intent silent and requests only the configured farewell after tool completion', async () => {
    const probe = makeAdapterProbe(), sink = vi.fn(), onReturnToDormant = vi.fn();
    const handle = createRealtimeSession({ ...makeSessionInput(makeSnapshot(), sink, probe),
      sleepFarewell: '如你所願，再會', onReturnToDormant });
    const agent = probe.agentConstructorCalls[0][0] as { tools: { name: string; invoke(context: unknown, input: string): Promise<unknown> }[] };
    const result = await agent.tools[0].invoke({}, '{}');
    expect(isBackgroundResult(result)).toBe(true);
    expect(result).toMatchObject({ content: { status: 'accepted', code: 'sleep_requested', speech: 'application' } });
    expect(probe.sendEvent).not.toHaveBeenCalled();
    // The SDK event arguments include context, agent, tool, result and details.
    const emitEnd = () => probe.emit('agent_tool_end', {}, agent, agent.tools[0], 'sleep_requested', {});
    emitEnd();
    expect(probe.sendEvent).toHaveBeenCalledTimes(1);
    const request = probe.sendEvent.mock.calls[0][0];
    expect(request).toMatchObject({ type: 'response.create', response: {
      tool_choice: 'none', input: [], instructions: expect.stringContaining('\n如你所願，再會'),
      metadata: { mirror_sleep_cue: expect.any(String) },
    } });
    emitEnd();
    expect(probe.sendEvent).toHaveBeenCalledTimes(1);
    probe.emit('transport_event', { type: 'response.created', response: { id: 'farewell', metadata: request.response.metadata } });
    for (const response_id of ['old-response', 'farewell']) {
      probe.emit('transport_event', { type: 'output_audio_buffer.started', response_id });
      if (response_id === 'farewell') {
        probe.emit('transport_event', { type: 'output_audio_buffer.stopped', response_id: 'old-response' });
        expect(onReturnToDormant).not.toHaveBeenCalled();
      }
      probe.emit('transport_event', { type: 'output_audio_buffer.stopped', response_id });
    }
    await Promise.resolve();
    expect(onReturnToDormant).toHaveBeenCalledOnce();
    await handle.close('manual_stop');
  });
  it.each(['finish', 'interrupt', 'close'] as const)('waits for farewell output tail and handles %s during that wait', async action => {
    const probe = makeAdapterProbe(), onReturnToDormant = vi.fn(), eventSink = vi.fn();
    let finishTail!: () => void;
    const waitForOutputTail = vi.fn(() => new Promise<void>(resolve => { finishTail = resolve }));
    const handle = createRealtimeSession({ ...makeSessionInput(makeSnapshot(), eventSink, probe), onReturnToDormant, waitForOutputTail });
    const agent = probe.agentConstructorCalls[0][0] as { tools: { invoke(context: unknown, input: string): Promise<unknown> }[] };
    await agent.tools[0].invoke({}, '{}');
    probe.emit('agent_tool_end', {}, agent, agent.tools[0]);
    const request = probe.sendEvent.mock.calls[0][0];
    probe.emit('transport_event', { type: 'response.created', response: { id: 'farewell', metadata: request.response.metadata } });
    probe.emit('transport_event', { type: 'output_audio_buffer.started', response_id: 'farewell' });
    probe.emit('transport_event', { type: 'output_audio_buffer.stopped', response_id: 'farewell' });
    expect(waitForOutputTail).toHaveBeenCalledOnce();
    expect(onReturnToDormant).not.toHaveBeenCalled();
    expect(eventSink.mock.calls.some(([event]) => event.reason === 'sleep_farewell_completed')).toBe(false);
    if (action === 'interrupt') probe.emit('audio_interrupted', {});
    if (action === 'close') await handle.close('manual_stop');
    finishTail(); await Promise.resolve();
    expect(onReturnToDormant).toHaveBeenCalledTimes(action === 'finish' ? 1 : 0);
    expect(eventSink.mock.calls.some(([event]) => event.reason === 'sleep_farewell_completed')).toBe(action === 'finish');
    await handle.close('manual_stop');
  });
  it('clears local processed speech on sleep intent and only opens output for its farewell', async () => {
    const probe = makeAdapterProbe(), onAudioActivity = vi.fn();
    const handle = createRealtimeSession({ ...makeSessionInput(makeSnapshot(), vi.fn(), probe), onAudioActivity });
    const agent = probe.agentConstructorCalls[0][0] as { tools: { invoke(context: unknown, input: string): Promise<unknown> }[] };
    probe.emit('transport_event', { type: 'response.output_item.added', item: { type: 'function_call', name: 'return_to_dormant' } });
    expect(onAudioActivity).toHaveBeenCalledWith('interrupted');
    onAudioActivity.mockClear();
    probe.emit('transport_event', { type: 'output_audio_buffer.started', response_id: 'unsolicited-reply' });
    expect(onAudioActivity).not.toHaveBeenCalledWith('output_started');
    await agent.tools[0].invoke({}, '{}');
    probe.emit('agent_tool_end', {}, agent, agent.tools[0]);
    const request = probe.sendEvent.mock.calls[0][0];
    probe.emit('transport_event', { type: 'response.created', response: { id: 'farewell', metadata: request.response.metadata } });
    probe.emit('transport_event', { type: 'output_audio_buffer.started', response_id: 'farewell' });
    expect(onAudioActivity).toHaveBeenCalledWith('output_started');
    await handle.close('manual_stop');
  });
  it('uses selected avatar commands in tool instructions and transcription hints', async () => {
    const probe = makeAdapterProbe(), sink = vi.fn();
    const avatar = { name: 'Ren', personality: 'Friendly guide.', speakingStyle: '', wakeGreeting: '',
      sleepFarewell: '晚安。', wakePhrase: '你好小蓮', sleepPhrase: '小蓮休息吧', spellPhrases: ['天氣熱，能不能下雨呢?'] };
    const handle = createRealtimeSession({ ...makeSessionInput(makeSnapshot(), sink, probe), avatar });
    const agent = probe.agentConstructorCalls[0]?.[0] as { instructions: string; tools: { description: string }[] };
    expect(agent.tools[0].description).toContain(avatar.sleepPhrase);
    expect(agent.tools[0].description).not.toContain('恭送渡鴨大人');
    expect(probe.constructorCalls[0]?.[1]).toMatchObject({ config: { audio: { input: { transcription: {
      keywords: [avatar.wakePhrase, avatar.sleepPhrase, ...avatar.spellPhrases],
    } } } } });
    await handle.close('user_requested');
  });
  it('closes a transport that completes connecting after cancellation', async () => {
    const probe = makeAdapterProbe(), sink = vi.fn();
    let complete!: () => void;
    probe.connect.mockImplementation(() => new Promise<void>(resolve => { complete = resolve }));
    const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), sink, probe));
    const pending = handle.connect();
    await handle.close('user_requested'); complete();
    await expect(pending).rejects.toThrow();
    expect(probe.close).toHaveBeenCalledTimes(2);
    expect(sink.mock.calls.some(([event]) => event.reason === 'cause=connect_succeeded')).toBe(false);
  });
  it.each([0.75, 1, 1.25])('isolates generated auditions and transmits speed %s', async speed => {
    const probe = makeAdapterProbe(), sink = vi.fn();
    const handle = createRealtimeSession({ ...makeSessionInput({ ...makeSnapshot(), voiceSpeed: speed }, sink, probe), preview: true });
    expect(probe.agentConstructorCalls[0]?.[0]).toMatchObject({ tools: [] });
    expect(probe.constructorCalls[0]?.[1]).toMatchObject({ config: { audio: {
      input: { turnDetection: null, transcription: null }, output: { speed },
    } } });
    await handle.close('user_requested');
  });
  it('transmits the same public character prompt shown by the Console with the captured voice', async () => {
    const probe = makeAdapterProbe(); const sink = vi.fn();
    const avatar = { name: 'Guide', personality: 'Patient museum guide.', speakingStyle: 'Calm and concise.', wakeGreeting: 'Ready.', sleepFarewell: 'Goodbye.' };
    const snapshot = { ...makeSnapshot(), voice: 'cedar' };
    const handle = createRealtimeSession({ ...makeSessionInput(snapshot, sink, probe), avatar });
    const agent = probe.agentConstructorCalls[0]?.[0] as { instructions: string; tools: { description: string; invoke(context: unknown, input: string): Promise<unknown> }[] };
    expect(agent.instructions).toBe(buildAvatarPrompt(avatar));
    expect(agent.tools[0].description).toBe(SLEEP_TOOL_DESCRIPTION);
    expect(isBackgroundResult(await agent.tools[0].invoke({}, '{}'))).toBe(true);
    await handle.connect();
    expect(probe.constructorCalls[0]?.[1]).toMatchObject({ config: { audio: { output: { voice: 'cedar' } } } });
    expect(JSON.stringify(sink.mock.calls)).not.toContain(avatar.personality);
  });
  it('keeps a ready session alive after a rejected request, without leaking provider text', async () => {
    const probe = makeAdapterProbe();
    const sink = vi.fn(); const onFailure = vi.fn();
    const handle = createRealtimeSession({ ...makeSessionInput(makeSnapshot(), sink, probe), onFailure });
    await handle.connect();
    for (const channel of ['transport_event', 'error']) probe.emit(channel, {
      type: 'error', error: { type: 'invalid_request_error', code: 'response_cancel_not_active', message: 'private provider text' },
    });
    expect(onFailure).not.toHaveBeenCalled();
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ reason: 'realtime_request_rejected', status: 'degraded' }));
    expect(JSON.stringify(sink.mock.calls)).not.toContain('private provider text');
    handle.speakVerbatim('Synthetic follow-up.');
    expect(probe.sendEvent).toHaveBeenCalled();
  });

  it('reports actual playback boundaries and interruption for idle tracking, never generation completion', async () => {
    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));
    eventSink.mockClear();
    probe.emit('transport_event', { type: 'output_audio_buffer.started', realtimeSessionId: 'session-a' });
    probe.emit('audio_stopped', {});
    expect(eventSink.mock.calls.map(([event]) => event.reason)).toEqual(['cause=output_started']);
    probe.emit('transport_event', { type: 'output_audio_buffer.stopped', realtimeSessionId: 'session-a' });
    probe.emit('audio_interrupted', {});
    expect(eventSink.mock.calls.map(([event]) => [event.realtimeSessionId, event.reason])).toEqual([
      ['session-a', 'cause=output_started'], ['session-a', 'cause=output_stopped'], ['session-a', 'cause=output_interrupted'],
    ]);
    await handle.close('manual_stop');
    eventSink.mockClear();
    probe.emit('audio_interrupted', {});
    expect(eventSink.mock.calls.some(([event]) => event.reason === 'cause=output_interrupted')).toBe(false);
  });

  it("sends operator-authored scene dialogue as one best-effort verbatim Realtime message", () => {
    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));

    handle.speakVerbatim("The mirror awakens.");

    expect(probe.sendMessage).not.toHaveBeenCalled();
    expect(probe.sendEvent).toHaveBeenCalledWith({ type: 'response.create', response: {
      tool_choice: 'none', input: [], instructions: expect.stringContaining('\nThe mirror awakens.'),
    } });
  });

  it.each([false, true])('cancels its own scene cue across unrelated output and generation completion (done=%s)', (done) => {
    const probe = makeAdapterProbe();
    const transport = createDeterministicRealtimeTransport();
    const sendEvent = vi.spyOn(transport, 'sendEvent').mockImplementation(() => {});
    vi.spyOn(transport, 'sendMessage').mockImplementation(() => {});
    const audio = { muted: false } as HTMLAudioElement;
    const onAudioActivity = vi.fn();
    const handle = createRealtimeSession({ ...makeSessionInput(makeSnapshot(), vi.fn(), probe), audioElement: audio,
      onAudioActivity,
      dependencies: { ...probe.dependencies, createTransport: () => transport } });
    const abort = new AbortController();
    const finished = vi.fn();
    handle.speakVerbatim('Synthetic scene cue.', abort.signal, finished);
    expect(sendEvent).toHaveBeenCalledWith(expect.objectContaining({ response: expect.objectContaining({ tool_choice: 'none' }) }));
    const request = sendEvent.mock.calls[0][0] as unknown as { response: { metadata: { mirror_scene_cue: string } } };
    const response = { id: 'cue-response', metadata: request.response.metadata };
    probe.emit('transport_event', { type: 'output_audio_buffer.stopped', response_id: 'previous' });
    if (done) {
      probe.emit('transport_event', { type: 'response.created', response });
      probe.emit('transport_event', { type: 'response.done', response });
    }
    abort.abort();
    expect(audio.muted).toBe(true);
    probe.emit('transport_event', { type: 'output_audio_buffer.started', response_id: 'cue-response' });
    expect(onAudioActivity).toHaveBeenCalledWith('interrupted');
    expect(onAudioActivity).not.toHaveBeenCalledWith('output_started');
    if (!done) {
      probe.emit('transport_event', { type: 'response.created', response });
      expect(sendEvent).toHaveBeenCalledWith({ type: 'response.cancel', response_id: 'cue-response' });
      probe.emit('transport_event', { type: 'response.done', response });
    }
    expect(sendEvent).toHaveBeenCalledWith({ type: 'output_audio_buffer.clear' });
    expect(audio.muted).toBe(true);
    probe.emit('transport_event', { type: 'output_audio_buffer.cleared', response_id: 'unrelated' });
    expect(audio.muted).toBe(true);
    probe.emit('transport_event', { type: 'output_audio_buffer.cleared', response_id: 'cue-response' });
    expect(audio.muted).toBe(false);
    expect(finished).toHaveBeenCalledTimes(1);
    handle.speakVerbatim('Next synthetic cue.', new AbortController().signal);
    expect(sendEvent.mock.calls.filter(([event]) => event.type === 'response.create')).toHaveLength(2);
  });

  it.each([false, true])('recovers visibly from missing cancellation acknowledgements or transport failure (throws=%s)', async (throws) => {
    vi.useFakeTimers();
    try {
      const probe = makeAdapterProbe();
      const transport = createDeterministicRealtimeTransport();
      const sendEvent = vi.spyOn(transport, 'sendEvent').mockImplementation(event => { if (throws && event.type === 'response.cancel') throw Error('transport_closed'); });
      vi.spyOn(transport, 'sendMessage').mockImplementation(() => {});
      const onFailure = vi.fn();
      const handle = createRealtimeSession({ ...makeSessionInput(makeSnapshot(), vi.fn(), probe), onFailure,
        dependencies: { ...probe.dependencies, createTransport: () => transport } });
      const abort = new AbortController();
      handle.speakVerbatim('Synthetic cue.', abort.signal);
      if (throws) {
        const request = sendEvent.mock.calls[0][0] as unknown as { response: { metadata: { mirror_scene_cue: string } } };
        probe.emit('transport_event', { type: 'response.created', response: { id: 'cue-response', metadata: request.response.metadata } });
      }
      abort.abort();
      await vi.advanceTimersByTimeAsync(8000);
      expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ reason: 'scene_dialogue_cancel_failed' }));
      expect(probe.close).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it("projects raw actual-output and VAD activity for the avatar without transcript timing", () => {
    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const onAudioActivity = vi.fn();

    createRealtimeSession({
      ...makeSessionInput(makeSnapshot(), eventSink, probe),
      onAudioActivity,
    });

    probe.emit("transport_event", {
      type: "input_audio_buffer.speech_started",
      realtimeSessionId: "session-a",
    });
    probe.emit("transport_event", {
      type: "input_audio_buffer.speech_stopped",
      realtimeSessionId: "session-a",
    });
    probe.emit("transport_event", {
      type: "output_audio_buffer.started",
      realtimeSessionId: "session-a",
    });
    probe.emit("audio_interrupted", {});
    probe.emit("transport_event", {
      type: "output_audio_buffer.stopped",
      realtimeSessionId: "session-a",
    });

    expect(onAudioActivity.mock.calls).toEqual([
      ["speech_started"],
      ["speech_stopped"],
      ["output_started"],
      ["interrupted"],
      ["output_stopped"],
    ]);
  });

  it("requests dormant once after the model invokes the payload-free sleep tool and goodbye audio stops", async () => {
    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const onReturnToDormant = vi.fn(async () => undefined);

    createRealtimeSession({
      ...makeSessionInput(makeSnapshot(), eventSink, probe),
      onReturnToDormant,
    });

    const agentOptions = probe.agentConstructorCalls[0]?.[0] as {
      readonly tools: readonly {
        readonly name: string;
        readonly parameters: Record<string, unknown>;
        invoke(context: unknown, input: string): Promise<unknown>;
      }[];
    };
    const sleepTool = agentOptions.tools[0];
    expect(sleepTool).toMatchObject({
      name: "return_to_dormant",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    });

    await sleepTool?.invoke({}, "{}");
    probe.emit('agent_tool_end', {}, agentOptions, sleepTool, 'sleep_requested', {});
    const request = probe.sendEvent.mock.calls[0][0];
    probe.emit('transport_event', { type: 'response.created', response: { id: 'farewell', metadata: request.response.metadata } });
    expect(onReturnToDormant).not.toHaveBeenCalled();

    probe.emit("transport_event", {
      type: "output_audio_buffer.stopped",
      realtimeSessionId: "session-a",
    });
    await Promise.resolve();
    expect(onReturnToDormant).not.toHaveBeenCalled();

    probe.emit("transport_event", {
      type: "output_audio_buffer.started",
      response_id: 'farewell',
      realtimeSessionId: "session-a",
    });
    probe.emit("transport_event", {
      type: "output_audio_buffer.stopped",
      response_id: 'farewell',
      realtimeSessionId: "session-a",
    });
    await Promise.resolve();
    expect(onReturnToDormant).toHaveBeenCalledTimes(1);

    probe.emit("transport_event", {
      type: "output_audio_buffer.stopped",
      realtimeSessionId: "session-a",
    });
    await Promise.resolve();
    expect(onReturnToDormant).toHaveBeenCalledTimes(1);
  });

  it("does not count pre-tool acknowledgement audio as the configured farewell", async () => {
    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const onReturnToDormant = vi.fn(async () => undefined);

    createRealtimeSession({
      ...makeSessionInput(makeSnapshot(), eventSink, probe),
      onReturnToDormant,
    });

    const agentOptions = probe.agentConstructorCalls[0]?.[0] as {
      readonly tools: readonly {
        invoke(context: unknown, input: string): Promise<unknown>;
      }[];
    };
    const sleepTool = agentOptions.tools[0];

    probe.emit("transport_event", {
      type: "output_audio_buffer.started",
      realtimeSessionId: "session-a",
    });
    await sleepTool?.invoke({}, "{}");
    probe.emit('agent_tool_end', {}, agentOptions, sleepTool, 'sleep_requested', {});
    const request = probe.sendEvent.mock.calls[0][0];
    probe.emit('transport_event', { type: 'response.created', response: { id: 'farewell', metadata: request.response.metadata } });
    probe.emit("transport_event", {
      type: "output_audio_buffer.stopped",
      realtimeSessionId: "session-a",
    });
    await Promise.resolve();

    expect(onReturnToDormant).not.toHaveBeenCalled();
    probe.emit("transport_event", { type: "output_audio_buffer.started", response_id: 'farewell', realtimeSessionId: "session-a" });
    probe.emit("transport_event", { type: "output_audio_buffer.stopped", response_id: 'farewell', realtimeSessionId: "session-a" });
    await Promise.resolve();
    expect(onReturnToDormant).toHaveBeenCalledTimes(1);
  });

  it("greets once after successful connection using only the configured text", async () => {
    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const handle = createRealtimeSession({ ...makeSessionInput(makeSnapshot(), eventSink, probe), wakeGreeting: "Welcome." });
    expect(probe.sendMessage).not.toHaveBeenCalled();
    await handle.connect(); await handle.connect();
    expect(probe.sendMessage).not.toHaveBeenCalled();
    expect(probe.sendEvent).toHaveBeenCalledExactlyOnceWith({ type: 'response.create', response: buildSpeechResponse('Welcome.', '') });
    // Only the greeting response forbids tools; visitor sleep commands remain available.
    expect(probe.agentConstructorCalls[0]?.[0]).toMatchObject({ tools: expect.arrayContaining([
      expect.objectContaining({ name: 'return_to_dormant' }), expect.objectContaining({ name: 'play_media' }), expect.objectContaining({ name: 'stop_media' })]) });
    expect(JSON.stringify(eventSink.mock.calls)).not.toContain("Welcome.");
  });
  it('connects and processes visitor audio while only the greeting waits for presentation', async () => {
    const probe = makeAdapterProbe(), sink = vi.fn(), onAudioActivity = vi.fn();
    let reveal!: () => void;
    const waiting = new Promise<void>(resolve => { reveal = resolve; });
    const waitForWakePresentation = vi.fn(() => waiting);
    const handle = createRealtimeSession({ ...makeSessionInput(makeSnapshot(), sink, probe),
      wakeGreeting: 'Synthetic greeting.', waitForWakePresentation, onAudioActivity });
    await handle.connect(); await handle.connect();
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ event: 'realtime_ready' }));
    expect(waitForWakePresentation).toHaveBeenCalledOnce();
    expect(probe.sendEvent).not.toHaveBeenCalled();
    probe.emit('transport_event', { type: 'input_audio_buffer.speech_stopped' });
    expect(onAudioActivity).toHaveBeenCalledWith('speech_stopped');
    reveal(); for (let i = 0; i < 4; i++) await Promise.resolve();
    expect(probe.sendEvent).toHaveBeenCalledExactlyOnceWith({ type: 'response.create', response: buildSpeechResponse('Synthetic greeting.', '') });
    await handle.connect();
    expect(probe.sendEvent).toHaveBeenCalledOnce();
    expect(JSON.stringify(sink.mock.calls)).not.toContain('Synthetic greeting.');
    await handle.close('user_requested');
  });

  it.each(['visitor', 'close', 'interrupt', 'sdk_interrupt'] as const)('suppresses a late greeting after %s and aborts the visual wait', async action => {
    const probe = makeAdapterProbe(), sink = vi.fn();
    let reveal!: () => void;
    let signal!: AbortSignal;
    const handle = createRealtimeSession({ ...makeSessionInput(makeSnapshot(), sink, probe), wakeGreeting: 'Synthetic greeting.',
      waitForWakePresentation: abort => { signal = abort; return new Promise<void>(resolve => { reveal = resolve; }); } });
    await handle.connect();
    if (action === 'visitor') probe.emit('transport_event', { type: 'input_audio_buffer.speech_started' });
    if (action === 'close') await handle.close('user_requested');
    if (action === 'interrupt') await handle.interrupt();
    if (action === 'sdk_interrupt') probe.emit('audio_interrupted', {});
    expect(signal.aborted).toBe(true);
    reveal(); for (let i = 0; i < 4; i++) await Promise.resolve();
    expect(probe.sendEvent).not.toHaveBeenCalled();
    const reason = action === 'visitor' ? 'wake_greeting_cancelled_visitor_speech'
      : action === 'close' ? 'wake_greeting_cancelled_close' : 'wake_greeting_cancelled_interrupt';
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ reason }));
    await handle.close('user_requested');
  });

  it('suppresses the greeting when visitor speech begins before connection completes', async () => {
    const probe = makeAdapterProbe(), sink = vi.fn(), waitForWakePresentation = vi.fn(async () => undefined);
    let connected!: () => void;
    probe.connect.mockImplementationOnce(() => new Promise<void>(resolve => { connected = resolve; }));
    const handle = createRealtimeSession({ ...makeSessionInput(makeSnapshot(), sink, probe),
      wakeGreeting: 'Synthetic greeting.', waitForWakePresentation });
    const connecting = handle.connect();
    probe.emit('transport_event', { type: 'input_audio_buffer.speech_started' });
    connected(); await connecting;
    expect(waitForWakePresentation).not.toHaveBeenCalled(); expect(probe.sendEvent).not.toHaveBeenCalled();
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ event: 'realtime_ready' }));
    await handle.close('user_requested');
  });

  it.each(['cancel', 'failure'] as const)('keeps the connection ready after presentation gate %s', async outcome => {
    const probe = makeAdapterProbe(), sink = vi.fn();
    const error = new Error('synthetic gate failure');
    if (outcome === 'cancel') error.name = 'AbortError';
    const handle = createRealtimeSession({ ...makeSessionInput(makeSnapshot(), sink, probe), wakeGreeting: 'Synthetic greeting.',
      waitForWakePresentation: async () => { throw error; } });
    await expect(handle.connect()).resolves.toBeUndefined();
    for (let i = 0; i < 4; i++) await Promise.resolve();
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ event: 'realtime_ready' }));
    expect(sink.mock.calls.some(([event]) => event.event === 'realtime_connect_failed')).toBe(false);
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ reason: outcome === 'cancel' ? 'wake_greeting_gate_cancelled' : 'wake_greeting_gate_failed' }));
    expect(probe.sendEvent).toHaveBeenCalledTimes(outcome === 'cancel' ? 0 : 1);
    expect(JSON.stringify(sink.mock.calls)).not.toContain('synthetic gate failure');
    await handle.close('user_requested');
  });

  it('bounds an unresponsive greeting dependency without blocking readiness', async () => {
    vi.useFakeTimers();
    const probe = makeAdapterProbe(), sink = vi.fn();
    let signal!: AbortSignal;
    const handle = createRealtimeSession({ ...makeSessionInput(makeSnapshot(), sink, probe), wakeGreeting: 'Synthetic greeting.',
      waitForWakePresentation: abort => { signal = abort; return new Promise<void>(() => {}); } });
    try {
      await handle.connect();
      expect(probe.sendEvent).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(10250);
      expect(probe.sendEvent).toHaveBeenCalledOnce();
      expect(sink).toHaveBeenCalledWith(expect.objectContaining({ reason: 'wake_greeting_gate_timeout' }));
      expect(vi.getTimerCount()).toBe(0);
      expect(signal.aborted).toBe(true);
    } finally { await handle.close('user_requested'); vi.useRealTimers(); }
  });

  it("uses the configured farewell rather than a hardcoded response", async () => {
    const probe = makeAdapterProbe();
    createRealtimeSession({ ...makeSessionInput(makeSnapshot(), vi.fn(), probe), sleepFarewell: "Rest now." });
    const options = probe.agentConstructorCalls[0]?.[0] as { tools: { invoke(context: unknown, input: string): Promise<unknown> }[] };
    expect(isBackgroundResult(await options.tools[0]!.invoke({}, "{}"))).toBe(true);
    probe.emit('agent_tool_end', {}, options, options.tools[0], 'sleep_requested', {});
    expect(probe.sendEvent.mock.calls[0][0].response.instructions).toContain('\nRest now.');
    expect(probe.interrupt).not.toHaveBeenCalled();
  });

  it("instructs the sleep tool path to say only the Persona goodbye", async () => {
    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();

    createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));

    const agentOptions = probe.agentConstructorCalls[0]?.[0] as {
      readonly instructions: string;
      readonly tools: readonly {
        invoke(context: unknown, input: string): Promise<unknown>;
      }[];
    };
    expect(agentOptions.instructions).toContain(
      'Do not acknowledge, say goodbye or invite more conversation; the application supplies farewell audio.',
    );
    expect(agentOptions.instructions).toContain(
      'call return_to_dormant silently',
    );
    expect(isBackgroundResult(await agentOptions.tools[0]?.invoke({}, "{}"))).toBe(true);
  });

  it("configures the wake-gated noisy-room profile for far-field Mandarin conversation", () => {
    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const snapshot = Object.freeze({
      ...makeSnapshot(),
      turnDetectionProfile: "server-vad-noisy",
    });

    createRealtimeSession(makeSessionInput(snapshot, eventSink, probe));

    const options = probe.constructorCalls[0]?.[1] as Record<string, unknown>;
    expect(options).toMatchObject({
      config: {
        audio: {
          input: {
            noiseReduction: { type: "far_field" },
            transcription: {
              model: "configured-transcription-model",
              languages: ["zh-tw", "en"],
              keywords: ["魔鏡阿魔鏡", "恭送渡鴨大人"],
              delay: "medium",
            },
            turnDetection: {
              type: "server_vad",
              threshold: 0.7,
              prefixPaddingMs: 300,
              silenceDurationMs: 900,
              createResponse: true,
              interruptResponse: true,
            },
          },
        },
      },
    });
  });

  it("honors the already-versioned strict semantic profile instead of rejecting it at runtime", () => {
    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const snapshot = Object.freeze({
      ...makeSnapshot(),
      turnDetectionProfile: "semantic-vad-strict",
    });

    createRealtimeSession(makeSessionInput(snapshot, eventSink, probe));

    const options = probe.constructorCalls[0]?.[1] as Record<string, unknown>;
    expect(options).toMatchObject({
      config: {
        audio: {
          input: {
            turnDetection: {
              type: "semantic_vad",
              eagerness: "low",
              createResponse: true,
              interruptResponse: true,
            },
          },
        },
      },
    });
  });

  it("passes the frozen config snapshot to the official session and connects once", async () => {
    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const snapshot = makeSnapshot();
    const handle = createRealtimeSession(makeSessionInput(snapshot, eventSink, probe));

    await handle.connect();
    await handle.connect();

    expect(probe.connect).toHaveBeenCalledTimes(1);
    expect(probe.connect).toHaveBeenCalledWith({ apiKey: "opaque-transient-input" });
    const options = probe.constructorCalls[0]?.[1] as Record<string, unknown>;
    expect(options).toMatchObject({
      model: snapshot.realtimeDialogue,
      historyStoreAudio: false,
      tracingDisabled: true,
      config: {
        tracing: null,
        audio: {
          input: {
            transcription: { model: snapshot.inputTranscription },
            turnDetection: { type: "semantic_vad", interruptResponse: true },
          },
          output: { voice: snapshot.voice },
        },
        reasoning: { effort: snapshot.reasoningEffort },
      },
    });
    expect(eventSink).toHaveBeenCalledWith(expect.objectContaining({
      event: "realtime_ready",
      status: "success",
    }));
  });

  it.each([
    ["bad request", new Error('Realtime call request failed with status 400 :: Model "mock-realtime-dialogue-v1" is not supported'), "start_connect_bad_request"],
    ["authentication", { status: 401 }, "start_connect_auth_failed"],
    ["permission", { response: { status: 403 } }, "start_connect_permission_failed"],
    ["not found", { statusCode: 404 }, "start_connect_not_found"],
    ["rate limit", { status: 429 }, "start_connect_rate_limited"],
    ["service", { status: 503 }, "start_connect_service_unavailable"],
    ["network", { code: "ECONNRESET" }, "start_connect_network_failed"],
    ["unknown", new Error("opaque-provider-detail"), "start_connect_transport_failed"],
  ] as const)("classifies %s failures without parsing provider model names", async (_name, failure, expectedToken) => {
    const probe = makeAdapterProbe();
    probe.connect.mockRejectedValueOnce(failure);
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));

    await expect(handle.connect()).rejects.toMatchObject({ reason: "connect_failed" });

    expect(handle.getLastConnectFailureToken?.()).toBe(expectedToken);
    expect(JSON.stringify(eventSink.mock.calls)).not.toContain("mock-realtime-dialogue-v1");
  });

  it("preserves a classified transport-event failure and reports a valid runtime reason", async () => {
    const probe = makeAdapterProbe();
    let rejectConnect!: (reason: unknown) => void;
    probe.connect.mockReturnValueOnce(new Promise<void>((_resolve, reject) => {
      rejectConnect = reject;
    }));
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const onFailure = vi.fn();
    const handle = createRealtimeSession({
      ...makeSessionInput(makeSnapshot(), eventSink, probe),
      onFailure,
    });

    const connecting = handle.connect();
    probe.emit("transport_event", {
      type: "error",
      error: {
        type: "invalid_request_error",
        code: "invalid_value",
        param: "session.reasoning.effort",
      },
      realtimeSessionId: handle.realtimeSessionId,
    });
    rejectConnect(new Error("opaque-provider-detail"));

    await expect(connecting).rejects.toMatchObject({ reason: "connect_failed" });
    expect(handle.getLastConnectFailureToken?.()).toBe(
      "start_connect_bad_request_session_reasoning_effort",
    );
    expect(onFailure).toHaveBeenCalledWith({
      kind: "connect",
      realtimeSessionId: "session-a",
      reason: "start_connect_bad_request_session_reasoning_effort",
    });
  });

  it("keeps runtime model catalogs out of source diagnostics", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("../../src/renderer/realtime/realtime-session-adapter.ts", import.meta.url),
      "utf8",
    );

    expect(source).not.toMatch(/gpt-(?:realtime|4o)/);
    expect(source).not.toContain("supported_");
    expect(source).not.toContain("model_unsupported_mentions_");
  });

  it("uses realtimeSessionId as the stale-event authority and emits metadata only", () => {
    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));
    eventSink.mockClear();

    probe.emit("transport_event", {
      type: "ready",
      realtimeSessionId: handle.realtimeSessionId,
      content: "opaque-current-content",
    });
    probe.emit("transport_event", {
      type: "ready",
      realtimeSessionId: "old-session",
      content: "opaque-stale-content",
    });

    expect(eventSink.mock.calls.map(([event]) => event.event)).toEqual([
      "realtime_ready",
      "realtime_stale_event",
    ]);
    expect(JSON.stringify(eventSink.mock.calls)).not.toContain("opaque-current-content");
    expect(JSON.stringify(eventSink.mock.calls)).not.toContain("opaque-stale-content");
  });

  it("delivers only actual output-audio stop events and disposes listeners", () => {
    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));
    const listener = vi.fn<() => void>();
    const dispose = handle.onOutputAudioBufferStopped(listener);

    probe.emit("transport_event", { type: "audio_stopped", realtimeSessionId: handle.realtimeSessionId });
    probe.emit("transport_event", { type: "output_audio_buffer.stopped", realtimeSessionId: handle.realtimeSessionId });
    dispose();
    probe.emit("transport_event", { type: "output_audio_buffer.stopped", realtimeSessionId: handle.realtimeSessionId });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('pairs input-item creation with its completed transcript only inside renderer RAM', () => {
    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));
    const created = vi.fn<(itemId: string) => void>();
    const listener = vi.fn<(input: { itemId: string; transcript: string }) => void>();
    const disposeCreated = handle.onInputItemCreated?.(created);
    const dispose = handle.onInputTranscriptCompleted?.(listener);

    probe.emit('transport_event', {
      type: 'input_audio_buffer.committed',
      realtimeSessionId: handle.realtimeSessionId,
      item_id: 'item-private-turn',
    });

    probe.emit('transport_event', {
      type: 'conversation.item.input_audio_transcription.completed',
      realtimeSessionId: handle.realtimeSessionId,
      item_id: 'item-private-turn',
      transcript: 'private completed turn',
    });
    disposeCreated?.();
    dispose?.();
    probe.emit('transport_event', {
      type: 'conversation.item.input_audio_transcription.completed',
      realtimeSessionId: handle.realtimeSessionId,
      item_id: 'item-second-turn',
      transcript: 'second private turn',
    });

    expect(created).toHaveBeenCalledWith('item-private-turn');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ itemId: 'item-private-turn', transcript: 'private completed turn' });
    expect(JSON.stringify(eventSink.mock.calls)).not.toContain('private completed turn');
  });

  it('interrupts media on the exact configured wake phrase, once per input, without a second microphone', async () => {
    const probe = makeAdapterProbe(), sink = vi.fn(), onMediaRequest = vi.fn(async () => 'accepted' as const);
    const handle = createRealtimeSession({ ...makeSessionInput(makeSnapshot(), sink, probe), onMediaRequest,
      avatar: { name: 'QA', personality: '', speakingStyle: '', wakeGreeting: '', sleepFarewell: '', wakePhrase: 'Mirror wake' } });
    const event = { type: 'conversation.item.input_audio_transcription.completed', realtimeSessionId: handle.realtimeSessionId, item_id: 'wake-media', transcript: 'Mirror wake!' };
    probe.emit('transport_event', { ...event, item_id: 'not-wake', transcript: 'Do not say Mirror wake' });
    expect(onMediaRequest).not.toHaveBeenCalled();
    probe.emit('transport_event', event); probe.emit('transport_event', event);
    await Promise.resolve(); await Promise.resolve();
    expect(onMediaRequest).toHaveBeenCalledExactlyOnceWith({ action: 'stop' }, expect.objectContaining({ realtimeSessionId: handle.realtimeSessionId }));
    expect(probe.interrupt).toHaveBeenCalledOnce();
    expect(JSON.stringify(sink.mock.calls)).not.toContain('Mirror wake');
  });

  it('reports transcript_unavailable without exposing an incomplete input item', () => {
    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));
    const listener = vi.fn();
    handle.onInputTranscriptCompleted?.(listener);
    eventSink.mockClear();

    probe.emit('transport_event', {
      type: 'conversation.item.input_audio_transcription.completed',
      realtimeSessionId: handle.realtimeSessionId,
      item_id: 'item-missing-transcript',
    });

    expect(listener).not.toHaveBeenCalled();
    expect(eventSink).toHaveBeenCalledWith(expect.objectContaining({
      event: 'realtime_observer_event', status: 'degraded', reason: 'transcript_unavailable',
    }));
  });

  it("reports observer failures without failing the session", () => {
    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const onFailure = vi.fn();
    const handle = createRealtimeSession({
      ...makeSessionInput(makeSnapshot(), eventSink, probe),
      onFailure,
    });
    handle.onOutputAudioBufferStopped(() => {
      throw new Error("opaque-listener-detail");
    });
    eventSink.mockClear();

    probe.emit("transport_event", {
      type: "output_audio_buffer.stopped",
      realtimeSessionId: handle.realtimeSessionId,
    });

    expect(eventSink).toHaveBeenCalledWith(expect.objectContaining({
      event: "realtime_observer_event",
      status: "degraded",
      reason: "output_playback_listener_failed",
    }));
    expect(onFailure).not.toHaveBeenCalled();
    expect(JSON.stringify(eventSink.mock.calls)).not.toContain("opaque-listener-detail");
  });

  it("closes idempotently and makes late playback subscriptions no-ops", async () => {
    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));

    await handle.close("user_requested");
    await handle.close("user_requested");
    const listener = vi.fn();
    handle.onOutputAudioBufferStopped(listener)();

    expect(probe.close).toHaveBeenCalledTimes(1);
    expect(listener).not.toHaveBeenCalled();
    expect(eventSink).toHaveBeenCalledWith(expect.objectContaining({
      event: "realtime_observer_event",
      reason: "output_playback_subscription_closed",
    }));
  });
});

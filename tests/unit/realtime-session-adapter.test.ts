import { describe, expect, it, vi } from "vitest";

import {
  createRealtimeSession,
  type CreateRealtimeSessionInput,
  type RealtimeSessionDependencies,
} from "../../src/renderer/realtime/realtime-session-adapter";
import { createDeterministicRealtimeTransport } from "../../src/renderer/realtime/realtime-transport";
import type { RealtimeMetadataEvent } from "../../src/shared/realtime-events";
import type { SessionModelSnapshot } from "../../src/shared/types";

type SessionEventListener = (event: unknown) => void;

type AdapterProbe = {
  agentConstructorCalls: unknown[][];
  constructorCalls: unknown[][];
  connect: ReturnType<typeof vi.fn>;
  interrupt: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
  emit: (eventName: string, event: unknown) => void;
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
  const fakeSession = {
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
    agentConstructorCalls,
    constructorCalls,
    connect,
    interrupt,
    close,
    sendMessage,
    emit: (eventName, event) => {
      for (const listener of listeners.get(eventName) ?? []) listener(event);
    },
    dependencies: {
      RealtimeAgent: RealtimeAgent as unknown as RealtimeSessionDependencies["RealtimeAgent"],
      RealtimeSession: RealtimeSession as unknown as RealtimeSessionDependencies["RealtimeSession"],
      createTransport: () => createDeterministicRealtimeTransport(),
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
    expect(probe.sendMessage).toHaveBeenCalled();
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

    expect(probe.sendMessage).toHaveBeenCalledTimes(1);
    expect(probe.sendMessage).toHaveBeenCalledWith(
      "The entire audible response must be exactly the following operator-authored text. "
        + "Do not add, omit, translate, paraphrase, or acknowledge it:\nThe mirror awakens.",
    );
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
    expect(onReturnToDormant).not.toHaveBeenCalled();

    probe.emit("transport_event", {
      type: "output_audio_buffer.stopped",
      realtimeSessionId: "session-a",
    });
    await Promise.resolve();
    expect(onReturnToDormant).not.toHaveBeenCalled();

    probe.emit("transport_event", {
      type: "output_audio_buffer.started",
      realtimeSessionId: "session-a",
    });
    probe.emit("transport_event", {
      type: "output_audio_buffer.stopped",
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
    probe.emit("transport_event", {
      type: "output_audio_buffer.stopped",
      realtimeSessionId: "session-a",
    });
    await Promise.resolve();

    expect(onReturnToDormant).not.toHaveBeenCalled();
    probe.emit("transport_event", { type: "output_audio_buffer.started", realtimeSessionId: "session-a" });
    probe.emit("transport_event", { type: "output_audio_buffer.stopped", realtimeSessionId: "session-a" });
    await Promise.resolve();
    expect(onReturnToDormant).toHaveBeenCalledTimes(1);
  });

  it("greets once after successful connection using only the configured text", async () => {
    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const handle = createRealtimeSession({ ...makeSessionInput(makeSnapshot(), eventSink, probe), wakeGreeting: "Welcome." });
    expect(probe.sendMessage).not.toHaveBeenCalled();
    await handle.connect(); await handle.connect();
    expect(probe.sendMessage).toHaveBeenCalledTimes(1);
    expect(probe.sendMessage.mock.calls[0]?.[0]).toContain("\nWelcome.");
    expect(JSON.stringify(eventSink.mock.calls)).not.toContain("Welcome.");
  });

  it("uses the configured farewell rather than a hardcoded response", async () => {
    const probe = makeAdapterProbe();
    createRealtimeSession({ ...makeSessionInput(makeSnapshot(), vi.fn(), probe), sleepFarewell: "Rest now." });
    const options = probe.agentConstructorCalls[0]?.[0] as { tools: { invoke(context: unknown, input: string): Promise<unknown> }[] };
    expect(await options.tools[0]!.invoke({}, "{}")).toBe("Say exactly Rest now. now and no other words.");
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
      "The entire audible response for this command must be exactly 如你所願，再會.",
    );
    expect(agentOptions.instructions).toContain(
      "Never say 我來處理你的指令 or any other acknowledgement before the tool call.",
    );
    await expect(agentOptions.tools[0]?.invoke({}, "{}")).resolves.toBe(
      "Say exactly 如你所願，再會 now and no other words.",
    );
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
              keywords: ["恭送渡鴨大人"],
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

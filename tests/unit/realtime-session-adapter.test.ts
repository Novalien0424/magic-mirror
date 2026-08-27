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
  constructorCalls: unknown[][];
  connect: ReturnType<typeof vi.fn>;
  interrupt: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  emit: (eventName: string, event: unknown) => void;
  dependencies: RealtimeSessionDependencies;
};

function makeAdapterProbe(): AdapterProbe {
  const listeners = new Map<string, SessionEventListener[]>();
  const constructorCalls: unknown[][] = [];
  const connect = vi.fn(async (..._args: unknown[]) => undefined);
  const interrupt = vi.fn(async (..._args: unknown[]) => undefined);
  const close = vi.fn(async (..._args: unknown[]) => undefined);
  const fakeSession = {
    connect,
    interrupt,
    close,
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

  return {
    constructorCalls,
    connect,
    interrupt,
    close,
    emit: (eventName, event) => {
      for (const listener of listeners.get(eventName) ?? []) listener(event);
    },
    dependencies: {
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

  it('delivers completed input transcripts only inside the renderer session', () => {
    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));
    const listener = vi.fn<(transcript: string) => void>();
    const dispose = handle.onInputTranscriptCompleted?.(listener);

    probe.emit('transport_event', {
      type: 'conversation.item.input_audio_transcription.completed',
      realtimeSessionId: handle.realtimeSessionId,
      transcript: '睡吧',
    });
    dispose?.();
    probe.emit('transport_event', {
      type: 'conversation.item.input_audio_transcription.completed',
      realtimeSessionId: handle.realtimeSessionId,
      transcript: 'second private turn',
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('睡吧');
    expect(JSON.stringify(eventSink.mock.calls)).not.toContain('睡吧');
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

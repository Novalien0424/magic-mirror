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
    on: vi.fn((_eventName: string, listener: SessionEventListener) => {
      const eventListeners = listeners.get(_eventName) ?? [];
      eventListeners.push(listener);
      listeners.set(_eventName, eventListeners);
    }),
  };

  const RealtimeSession = vi.fn(function (...args: unknown[]) {
    constructorCalls.push(args);
    return fakeSession;
  });

  const dependencies: RealtimeSessionDependencies = {
    RealtimeSession: RealtimeSession as unknown as RealtimeSessionDependencies["RealtimeSession"],
    createTransport: () => createDeterministicRealtimeTransport(),
  };

  return {
    constructorCalls,
    connect,
    interrupt,
    close,
    emit: (eventName: string, event: unknown) => {
      for (const listener of listeners.get(eventName) ?? []) {
        listener(event);
      }
    },
    dependencies,
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
  snapshot: ReturnType<typeof makeSnapshot>,
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

describe("realtime session adapter", () => {
  it("exposes the session factory and a handle with stable controls", async () => {
    expect(createRealtimeSession).toBeTypeOf("function");

    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));

    expect(handle.realtimeSessionId).toEqual(expect.any(String));
    expect(handle.sessionGeneration).toEqual(expect.any(Number));

    await handle.interrupt();
    await handle.close("user_requested");

    expect(probe.interrupt).toHaveBeenCalledTimes(1);
    expect(probe.close).toHaveBeenCalledTimes(1);
    expect(probe.close).toHaveBeenCalledWith();
    expect(eventSink).toHaveBeenCalledWith(
      expect.objectContaining({
        realtimeSessionId: handle.realtimeSessionId,
        sessionGeneration: handle.sessionGeneration,
        reason: "user_requested",
      }),
    );
  });

  it("forwards only the configured constructor values and the exact transient connect input", async () => {
    const snapshot = makeSnapshot();
    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const clientSecret = "opaque-transient-input";
    const handle = createRealtimeSession({
      ...makeSessionInput(snapshot, eventSink, probe),
      clientSecret,
    });

    await handle.connect();

    const constructorConfig = probe.constructorCalls[0]?.at(-1) as Record<string, unknown>;
    expect(constructorConfig).toEqual(
      expect.objectContaining({
        model: snapshot.realtimeDialogue,
        historyStoreAudio: false,
        tracingDisabled: true,
        config: expect.objectContaining({
          audio: expect.objectContaining({
            input: expect.objectContaining({
              transcription: expect.objectContaining({ model: snapshot.inputTranscription }),
              turnDetection: {
                type: "semantic_vad",
                interruptResponse: true,
              },
            }),
            output: expect.objectContaining({ voice: snapshot.voice }),
          }),
          reasoning: { effort: snapshot.reasoningEffort },
          tracing: null,
        }),
      }),
    );
    expect(constructorConfig).not.toHaveProperty("fallbackModel");
    expect(constructorConfig).not.toHaveProperty("fallbackConfig");
    expect(probe.connect).toHaveBeenCalledTimes(1);
    expect(probe.connect.mock.calls[0]).toHaveLength(1);
    expect(probe.connect).toHaveBeenCalledWith({ apiKey: clientSecret });
  });

  it("emits metadata only and rejects an old realtime ID even when its generation matches", () => {
    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const clientSecret = "opaque-transient-input";
    const rawContent = "opaque-response-content";
    const rawError = "opaque-provider-error";
    const handle = createRealtimeSession({
      ...makeSessionInput(makeSnapshot(), eventSink, probe),
      clientSecret,
    });
    eventSink.mockClear();

    probe.emit("transport_event", {
      type: "ready",
      realtimeSessionId: handle.realtimeSessionId,
      sessionGeneration: handle.sessionGeneration,
      content: rawContent,
      error: rawError,
      clientSecret,
    });
    probe.emit("transport_event", {
      type: "ready",
      realtimeSessionId: "old-realtime-session",
      sessionGeneration: handle.sessionGeneration,
      content: rawContent,
      error: rawError,
      clientSecret,
    });

    expect(eventSink).toHaveBeenCalledTimes(2);
    const currentEmitted = eventSink.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
    const staleEmitted = eventSink.mock.calls[1]?.[0] as unknown as Record<string, unknown>;
    expect(currentEmitted).toEqual(
      expect.objectContaining({
        event: "realtime_ready",
        realtimeSessionId: handle.realtimeSessionId,
        sessionGeneration: handle.sessionGeneration,
      }),
    );
    expect(staleEmitted).toEqual(
      expect.objectContaining({
        event: "realtime_stale_event",
        reason: "stale_realtime_session",
      }),
    );
    for (const emitted of [currentEmitted, staleEmitted]) {
      const serialized = JSON.stringify(emitted);
      expect(emitted).not.toHaveProperty("content");
      expect(emitted).not.toHaveProperty("error");
      expect(emitted).not.toHaveProperty("clientSecret");
      expect(serialized).not.toContain(rawContent);
      expect(serialized).not.toContain(rawError);
      expect(serialized).not.toContain(clientSecret);
    }
  });

  it("delivers only exact playback-stop events and disposes only its own listener", () => {
    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));
    const firstListener = vi.fn<() => void>();
    const secondListener = vi.fn<() => void>();
    const disposeFirst = handle.onOutputAudioBufferStopped(firstListener);
    const disposeSecond = handle.onOutputAudioBufferStopped(secondListener);
    const rawProviderPayload = "opaque-output-audio-provider-payload";

    probe.emit("transport_event", {
      type: "audio_stopped",
      realtimeSessionId: handle.realtimeSessionId,
      content: rawProviderPayload,
    });
    expect(firstListener).not.toHaveBeenCalled();
    expect(secondListener).not.toHaveBeenCalled();

    probe.emit("transport_event", {
      type: "output_audio_buffer.stopped",
      realtimeSessionId: handle.realtimeSessionId,
      content: rawProviderPayload,
    });
    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).toHaveBeenCalledTimes(1);
    expect(firstListener.mock.calls[0]).toHaveLength(0);
    expect(secondListener.mock.calls[0]).toHaveLength(0);

    disposeFirst();
    disposeFirst();
    probe.emit("transport_event", {
      type: "output_audio_buffer.stopped",
      realtimeSessionId: handle.realtimeSessionId,
      content: rawProviderPayload,
    });

    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(eventSink.mock.calls)).not.toContain(rawProviderPayload);

    disposeSecond();
  });

  it("suppresses stale playback-stop events while retaining the stale metadata reason", () => {
    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));
    const listener = vi.fn<() => void>();
    handle.onOutputAudioBufferStopped(listener);
    eventSink.mockClear();
    const rawProviderPayload = "opaque-stale-output-audio-provider-payload";

    probe.emit("transport_event", {
      type: "output_audio_buffer.stopped",
      realtimeSessionId: "old-realtime-session",
      content: rawProviderPayload,
    });

    expect(listener).not.toHaveBeenCalled();
    expect(eventSink).toHaveBeenCalledTimes(1);
    expect(eventSink.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        event: "realtime_stale_event",
        reason: "stale_realtime_session",
      }),
    );
    expect(JSON.stringify(eventSink.mock.calls[0]?.[0])).not.toContain(rawProviderPayload);
  });

  it("reports playback listener failures as observer degradation without failing the session", () => {
    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const onFailure = vi.fn();
    const handle = createRealtimeSession({
      ...makeSessionInput(makeSnapshot(), eventSink, probe),
      onFailure,
    });
    const thrownValue = "opaque-listener-error";
    const failingListener = vi.fn<() => void>(() => {
      throw new Error(thrownValue);
    });
    const siblingListener = vi.fn<() => void>();
    handle.onOutputAudioBufferStopped(failingListener);
    handle.onOutputAudioBufferStopped(siblingListener);
    eventSink.mockClear();

    probe.emit("transport_event", {
      type: "output_audio_buffer.stopped",
      realtimeSessionId: handle.realtimeSessionId,
      content: "opaque-output-audio-provider-payload",
    });

    expect(failingListener).toHaveBeenCalledTimes(1);
    expect(siblingListener).toHaveBeenCalledTimes(1);
    expect(eventSink).toHaveBeenCalledTimes(1);
    const failureMetadata = eventSink.mock.calls[0]?.[0];
    expect(failureMetadata).toEqual(
      expect.objectContaining({
        event: "realtime_observer_event",
        status: "degraded",
        reason: "output_playback_listener_failed",
      }),
    );
    expect(eventSink.mock.calls.map(([event]) => event.event)).not.toContain(
      "realtime_connect_failed",
    );
    expect(onFailure).not.toHaveBeenCalled();
    expect(probe.close).not.toHaveBeenCalled();
    expect(JSON.stringify(failureMetadata)).not.toContain(thrownValue);
    expect(JSON.stringify(failureMetadata)).not.toContain(
      "opaque-output-audio-provider-payload",
    );
  });

  it("reports late playback-stop subscriptions as closed no-ops", async () => {
    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));
    await handle.close("user_requested");
    eventSink.mockClear();

    const lateListener = vi.fn<() => void>();
    const disposeLate = handle.onOutputAudioBufferStopped(lateListener);

    expect(eventSink).toHaveBeenCalledTimes(1);
    expect(eventSink.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        event: "realtime_observer_event",
        status: "info",
        reason: "output_playback_subscription_closed",
      }),
    );
    disposeLate();
    disposeLate();
    probe.emit("transport_event", {
      type: "output_audio_buffer.stopped",
      realtimeSessionId: handle.realtimeSessionId,
      content: "opaque-late-output-audio-provider-payload",
    });

    expect(lateListener).not.toHaveBeenCalled();
    expect(eventSink).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(eventSink.mock.calls)).not.toContain(
      "opaque-late-output-audio-provider-payload",
    );
  });
});

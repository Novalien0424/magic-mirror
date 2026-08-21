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
});

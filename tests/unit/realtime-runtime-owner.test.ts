import { describe, expect, it, vi } from "vitest";
import type { RealtimeSessionStartBundleValue } from "../../src/shared/bridge";
import {
  createRealtimeRuntimeOwner,
  type RealtimeRuntimeAudioOutput,
  type RealtimeRuntimeCleanup,
  type RealtimeRuntimeMicOwner,
  type RealtimeRuntimeOwnerDependencies,
  type RealtimeRuntimePlaybackTransport,
  type RealtimeRuntimeSession,
} from "../../src/renderer/realtime/realtime-runtime-owner";

function bundle(id = "session-1", generation = 1): Readonly<RealtimeSessionStartBundleValue> {
  return Object.freeze({
    snapshot: Object.freeze({}) as RealtimeSessionStartBundleValue["snapshot"],
    identity: Object.freeze({ realtimeSessionId: id, sessionGeneration: generation }),
    clientSecret:
      "opaque-client-secret" as RealtimeSessionStartBundleValue["clientSecret"],
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function fixture() {
  const order: string[] = [];
  const stream = { getTracks: vi.fn(() => [{ stop: vi.fn() }]) } as unknown as MediaStream;
  const makeAudio = (label: string): RealtimeRuntimeAudioOutput => ({
    audioElement: {} as HTMLAudioElement,
    analyser: {},
    dispose: vi.fn(async () => {
      order.push(`${label}:audio.dispose`);
    }),
  });
  const makeSession = (label: string, generation: number): RealtimeRuntimeSession => ({
    realtimeSessionId: `session-${generation}`,
    sessionGeneration: generation,
    connect: vi.fn(async () => {
      order.push(`${label}:session.connect`);
    }),
    interrupt: vi.fn(async () => {
      order.push(`${label}:session.interrupt`);
    }),
    close: vi.fn(async () => {
      order.push(`${label}:session.close`);
    }),
    speakVerbatim: vi.fn((text: string) => {
      order.push(`${label}:session.speak:${text}`);
    }),
    getLastConnectFailureToken: vi.fn(() => undefined),
    onOutputAudioBufferStopped: vi.fn(() => () => {}),
  });
  const makePlayback = (label: string): RealtimeRuntimePlaybackTransport => ({
    dispose: vi.fn(async () => {
      order.push(`${label}:playback.dispose`);
    }),
  });
  const makeCleanup = (label: string): RealtimeRuntimeCleanup => ({
    run: vi.fn(async (boundary) => {
      order.push(`${label}:cleanup.${boundary}`);
    }),
  });

  const oldAudio = makeAudio("old");
  const nextAudio = makeAudio("next");
  const oldSession = makeSession("old", 1);
  const nextSession = makeSession("next", 2);
  const oldPlayback = makePlayback("old");
  const nextPlayback = makePlayback("next");
  const oldCleanup = makeCleanup("old");
  const nextCleanup = makeCleanup("next");
  const mic: RealtimeRuntimeMicOwner = {
    acquire: vi.fn(async () => {
      order.push("mic.acquire");
    }),
    release: vi.fn(async () => {
      order.push("mic.release");
    }),
    rollover: vi.fn(async () => {
      order.push("mic.rollover");
      return stream;
    }),
  };
  const completion = deferred<{ source: "output_audio_buffer.stopped" }>();
  const outcomes: unknown[] = [];
  const audios = [oldAudio, nextAudio];
  const sessions = [oldSession, nextSession];
  const playbacks = [oldPlayback, nextPlayback];
  const cleanups = [oldCleanup, nextCleanup];
  let audioIndex = 0;
  let sessionIndex = 0;
  let playbackIndex = 0;
  let cleanupIndex = 0;

  const dependencies: RealtimeRuntimeOwnerDependencies = {
    acquireMediaStream: vi.fn(async () => {
      order.push("stream.acquire");
      return stream;
    }),
    createAudioOutput: vi.fn(async () => audios[audioIndex++]!),
    createSession: vi.fn(async () => sessions[sessionIndex++]!),
    createMicOwner: vi.fn(async () => mic),
    createPlaybackTransport: vi.fn(async () => playbacks[playbackIndex++]!),
    createCleanup: vi.fn(async () => cleanups[cleanupIndex++]!),
    createPlaybackCompletion: vi.fn(() => ({
      waitForActualEnd: vi.fn((signal: AbortSignal) => new Promise<{
        source: "output_audio_buffer.stopped";
      }>((resolve, reject) => {
        const onAbort = () => {
          const error = new Error();
          error.name = "AbortError";
          reject(error);
        };
        signal.addEventListener("abort", onAbort, { once: true });
        void completion.promise.then(resolve, reject).finally(() => {
          signal.removeEventListener("abort", onAbort);
        });
      })),
    })),
    eventSink: vi.fn((outcome) => {
      outcomes.push(outcome);
    }),
  };

  return {
    dependencies,
    owner: createRealtimeRuntimeOwner(dependencies),
    order,
    stream,
    oldAudio,
    nextAudio,
    oldSession,
    nextSession,
    oldPlayback,
    nextPlayback,
    oldCleanup,
    nextCleanup,
    mic,
    completion,
    outcomes,
  };
}

describe("Realtime runtime owner", () => {
  it("stays small enough to remain one understandable owner", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("../../src/renderer/realtime/realtime-runtime-owner.ts", import.meta.url),
      "utf8",
    );
    expect(source.split(/\r?\n/).length).toBeLessThan(800);
    expect(source).not.toContain("PendingPreHandoffCleanup");
    expect(source).not.toContain("PendingPostHandoffCleanup");
  });

  it("starts one configured session and owns all resources", async () => {
    const f = fixture();

    const result = await f.owner.start(bundle());

    expect(result).toMatchObject({ status: "success", operation: "start", reason: "started" });
    expect(f.owner.getSnapshot()).toEqual({
      state: "active",
      currentIdentity: bundle().identity,
    });
    expect(f.oldSession.connect).toHaveBeenCalledTimes(1);
    expect(f.mic.acquire).toHaveBeenCalledWith(f.stream);
  });

  it('forwards the same RAM-only input item boundary into completed transcript handling', async () => {
    const f = fixture();
    let createdListener: ((itemId: string) => void) | undefined;
    let completedListener: ((input: { itemId: string; transcript: string }) => void) | undefined;
    Object.assign(f.oldSession, {
      onInputItemCreated: (listener: typeof createdListener) => {
        createdListener = listener;
        return () => {};
      },
      onInputTranscriptCompleted: (listener: typeof completedListener) => {
        completedListener = listener;
        return () => {};
      },
    });
    const onInputItemCreated = vi.fn();
    const onCompletedInputTranscript = vi.fn();
    Object.assign(f.dependencies, { onInputItemCreated, onCompletedInputTranscript });
    await f.owner.start(bundle());

    createdListener?.('item-one');
    completedListener?.({ itemId: 'item-one', transcript: 'private completed turn' });

    expect(onInputItemCreated).toHaveBeenCalledWith({
      itemId: 'item-one', realtimeSessionId: 'session-1',
    });
    expect(onCompletedInputTranscript).toHaveBeenCalledWith(expect.objectContaining({
      itemId: 'item-one', transcript: 'private completed turn', realtimeSessionId: 'session-1',
    }));
    expect(JSON.stringify(f.outcomes)).not.toContain('private completed turn');
  });

  it("uses a bounded adapter token and cleans partial resources on connect failure", async () => {
    const f = fixture();
    vi.mocked(f.oldSession.getLastConnectFailureToken!).mockReturnValue("start_connect_auth_failed");
    vi.mocked(f.oldSession.connect).mockRejectedValueOnce(new Error("opaque-provider-detail"));

    const result = await f.owner.start(bundle());

    expect(result).toMatchObject({
      status: "failed",
      operation: "start",
      reason: "start_connect_auth_failed",
      cleanup: "attempted",
    });
    expect(f.mic.release).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("opaque-provider-detail");
    expect(f.owner.getSnapshot().state).toBe("idle");
  });

  it("stops in a single best-effort cleanup pass", async () => {
    const f = fixture();
    await f.owner.start(bundle());
    f.order.splice(0);

    const result = await f.owner.stop();

    expect(result).toMatchObject({ status: "success", operation: "stop", reason: "stopped" });
    expect(f.order).toEqual([
      "old:playback.dispose",
      "old:audio.dispose",
      "mic.release",
      "old:cleanup.stop",
    ]);
    expect(f.owner.getSnapshot().state).toBe("idle");
  });

  it("interrupts only the active session", async () => {
    const f = fixture();
    expect(await f.owner.interrupt()).toMatchObject({ status: "ignored" });
    await f.owner.start(bundle());

    const result = await f.owner.interrupt();

    expect(result).toMatchObject({ status: "success", reason: "interrupted" });
    expect(f.oldSession.interrupt).toHaveBeenCalledTimes(1);
  });

  it("dispatches verbatim scene dialogue only to the active session", async () => {
    const f = fixture();

    expect(f.owner.speakVerbatim("Before start")).toEqual({
      status: "ignored",
      reason: "no_active_realtime_session",
    });
    await f.owner.start(bundle());

    expect(f.owner.speakVerbatim("The mirror awakens.")).toEqual({
      status: "dispatched",
      reason: "scene_dialogue_dispatched",
    });
    expect(f.oldSession.speakVerbatim).toHaveBeenCalledWith("The mirror awakens.");
  });

  it("rolls over after actual playback completion on the same mic stream", async () => {
    const f = fixture();
    await f.owner.start(bundle());

    const rollover = f.owner.rollover(bundle("session-2", 2));
    expect(f.owner.getSnapshot().state).toBe("rolling_over");
    f.completion.resolve({ source: "output_audio_buffer.stopped" });

    const result = await rollover;

    expect(result).toMatchObject({
      status: "success",
      operation: "rollover",
      reason: "rolled_over",
      playbackSource: "output_audio_buffer.stopped",
    });
    expect(f.mic.rollover).toHaveBeenCalledWith(f.nextSession, "generation_rollover");
    expect(f.nextSession.connect).toHaveBeenCalledTimes(1);
    expect(f.owner.getSnapshot()).toEqual({
      state: "active",
      currentIdentity: bundle("session-2", 2).identity,
    });
  });

  it("aborts a pending rollover before stop cleans the active owner", async () => {
    const f = fixture();
    await f.owner.start(bundle());

    const rollover = f.owner.rollover(bundle("session-2", 2));
    const stop = f.owner.stop();

    await expect(rollover).resolves.toMatchObject({
      status: "ignored",
      reason: "rollover_aborted",
    });
    await expect(stop).resolves.toMatchObject({ status: "success", reason: "stopped" });
    expect(f.owner.getSnapshot().state).toBe("idle");
  });

  it("keeps the old session active when pre-handoff rollover setup fails", async () => {
    const f = fixture();
    await f.owner.start(bundle());
    vi.mocked(f.dependencies.createAudioOutput).mockRejectedValueOnce(new Error("opaque"));
    f.completion.resolve({ source: "output_audio_buffer.stopped" });

    const result = await f.owner.rollover(bundle("session-2", 2));

    expect(result).toMatchObject({ status: "failed", reason: "rollover_setup_failed" });
    expect(f.owner.getSnapshot()).toEqual({
      state: "active",
      currentIdentity: bundle().identity,
    });
  });

  it("releases the transferred mic if the next session cannot connect", async () => {
    const f = fixture();
    await f.owner.start(bundle());
    vi.mocked(f.nextSession.connect).mockRejectedValueOnce(new Error("opaque"));
    f.completion.resolve({ source: "output_audio_buffer.stopped" });

    const result = await f.owner.rollover(bundle("session-2", 2));

    expect(result).toMatchObject({ status: "failed", reason: "rollover_connect_failed" });
    expect(f.mic.release).toHaveBeenCalledTimes(1);
    expect(f.owner.getSnapshot().state).toBe("idle");
  });

  it("disposes idempotently", async () => {
    const f = fixture();
    await f.owner.start(bundle());

    const first = await f.owner.dispose();
    const second = await f.owner.dispose();

    expect(first).toMatchObject({ operation: "dispose", status: "success" });
    expect(second).toMatchObject({ operation: "dispose", status: "ignored" });
    expect(f.owner.getSnapshot().state).toBe("disposed");
  });
});

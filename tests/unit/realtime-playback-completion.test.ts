import { describe, expect, it, vi } from "vitest";

import {
  PlaybackCompletion,
  type PlaybackCompletionAnalyser,
  type PlaybackCompletionMetadataEventSink,
  type PlaybackCompletionScheduler,
  type PlaybackCompletionTransport,
} from "../../src/renderer/realtime/playback-completion";
import {
  createPlaybackCompletionTransport,
  PlaybackCompletionTransportDisposeError,
} from "../../src/renderer/realtime/playback-transport-adapter";
import type { RealtimeSessionHandle } from "../../src/renderer/realtime/realtime-session-adapter";

type RawListener = Parameters<PlaybackCompletionTransport["on"]>[1];
type SessionOutputListener = Parameters<
  Pick<RealtimeSessionHandle, "onOutputAudioBufferStopped">["onOutputAudioBufferStopped"]
>[0];

type PlaybackCompletionConfig = Readonly<{
  readonly fallbackAfterMs: number;
  readonly sampleIntervalMs: number;
  readonly maxFallbackMs: number;
  readonly silenceThreshold: number;
  readonly silentSamplesRequired: number;
}>;

type PlaybackCompletionConstructorInput =
  ConstructorParameters<typeof PlaybackCompletion>[0] & {
    readonly sampleIntervalMs: number;
    readonly maxFallbackMs: number;
    readonly silenceThreshold: number;
    readonly silentSamplesRequired: number;
  };

const DEFAULT_COMPLETION_CONFIG: PlaybackCompletionConfig = Object.freeze({
  fallbackAfterMs: 80,
  sampleIntervalMs: 10,
  maxFallbackMs: 50,
  silenceThreshold: 0.1,
  silentSamplesRequired: 2,
});

const HARD_BOUND_COMPLETION_CONFIG: PlaybackCompletionConfig = Object.freeze({
  fallbackAfterMs: 80,
  sampleIntervalMs: 10,
  maxFallbackMs: 30,
  silenceThreshold: 0.1,
  silentSamplesRequired: 2,
});

function makeTransportProbe() {
  const listeners = new Set<RawListener>();
  const on = vi.fn<PlaybackCompletionTransport["on"]>(
    (eventName: string, listener: RawListener): void => {
      if (eventName === "output_audio_buffer.stopped") {
        listeners.add(listener);
      }
    },
  );
  const off = vi.fn<PlaybackCompletionTransport["off"]>(
    (eventName: string, listener: RawListener): void => {
      if (eventName === "output_audio_buffer.stopped") {
        listeners.delete(listener);
      }
    },
  );
  const transport = { on, off } satisfies PlaybackCompletionTransport;

  return {
    transport,
    emitStopped: () => {
      for (const listener of [...listeners]) {
        listener({ type: "output_audio_buffer.stopped" });
      }
    },
    listenerCount: () => listeners.size,
  };
}

function makeSessionProbe(
  createDisposer: (index: number, remove: () => void) => () => void = (
    _index,
    remove,
  ) => vi.fn(remove),
) {
  const listeners = new Set<SessionOutputListener>();
  const disposers: Array<() => void> = [];
  const onOutputAudioBufferStopped = vi.fn(
    (listener: SessionOutputListener): (() => void) => {
      const index = disposers.length;
      listeners.add(listener);
      const disposer = createDisposer(index, () => {
        listeners.delete(listener);
      });
      disposers.push(disposer);
      return disposer;
    },
  );
  const session = {
    onOutputAudioBufferStopped,
  } satisfies Pick<RealtimeSessionHandle, "onOutputAudioBufferStopped">;

  return {
    session,
    onOutputAudioBufferStopped,
    disposers,
    emitStopped: (...args: unknown[]) => {
      for (const listener of [...listeners]) {
        (listener as (...listenerArgs: unknown[]) => void)(...args);
      }
    },
    listenerCount: () => listeners.size,
  };
}

function makeSchedulerProbe() {
  let currentTime = 1_000;
  let nextHandle = 0;
  const pending = new Map<number, { dueAt: number; callback: () => void }>();
  const now = vi.fn<PlaybackCompletionScheduler["now"]>(() => currentTime);
  const setTimeout = vi.fn<PlaybackCompletionScheduler["setTimeout"]>(
    (callback: () => void, delayMs: number): number => {
      const handle = ++nextHandle;
      pending.set(handle, { dueAt: currentTime + delayMs, callback });
      return handle;
    },
  );
  const clearTimeout = vi.fn<PlaybackCompletionScheduler["clearTimeout"]>(
    (handle: number): void => {
      pending.delete(handle);
    },
  );
  const scheduler = {
    now,
    setTimeout,
    clearTimeout,
  } satisfies PlaybackCompletionScheduler;

  return {
    scheduler,
    clearTimeout,
    tick: (elapsedMs: number) => {
      currentTime += elapsedMs;
      const due = [...pending.entries()]
        .filter(([, task]) => task.dueAt <= currentTime)
        .sort(([, first], [, second]) => first.dueAt - second.dueAt);
      for (const [handle, task] of due) {
        pending.delete(handle);
        task.callback();
      }
    },
    pendingCount: () => pending.size,
  };
}

function makeAbortProbe() {
  let aborted = false;
  const listeners = new Set<() => void>();
  const removeEventListener = vi.fn((_eventName: string, listener: () => void) => {
    listeners.delete(listener);
  });
  const signal = {
    get aborted() {
      return aborted;
    },
    addEventListener: vi.fn((_eventName: string, listener: () => void) => {
      listeners.add(listener);
    }),
    removeEventListener,
  } as unknown as AbortSignal;

  return {
    signal,
    abort: () => {
      aborted = true;
      for (const listener of [...listeners]) {
        listener();
      }
    },
    removeEventListener,
  };
}

function expectMetadataEvent(
  event: unknown,
  expected: {
    readonly event: "playback_completed" | "playback_completion_fallback";
    readonly source: "output_audio_buffer.stopped" | "bounded_analyser_fallback";
    readonly duration_ms: number;
    readonly status: "success" | "degraded";
    readonly reason:
      | "primary_event_received"
      | "tail_silence_detected"
      | "fallback_bound_reached";
  },
): void {
  expect(event).toEqual({
    ...expected,
    count: 1,
  });
}

function createCompletion(
  transport: PlaybackCompletionTransport,
  schedulerProbe: ReturnType<typeof makeSchedulerProbe>,
  eventSink: PlaybackCompletionMetadataEventSink,
  analyser: PlaybackCompletionAnalyser,
  config: PlaybackCompletionConfig,
): PlaybackCompletion {
  const input: PlaybackCompletionConstructorInput = {
    transport,
    analyser,
    scheduler: schedulerProbe.scheduler,
    eventSink,
    fallbackAfterMs: config.fallbackAfterMs,
    sampleIntervalMs: config.sampleIntervalMs,
    maxFallbackMs: config.maxFallbackMs,
    silenceThreshold: config.silenceThreshold,
    silentSamplesRequired: config.silentSamplesRequired,
  };
  return new PlaybackCompletion(input);
}

async function expectPending(promise: Promise<unknown>): Promise<void> {
  let settled = false;
  void promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await Promise.resolve();
  expect(settled).toBe(false);
}

describe("realtime playback completion", () => {
  it("adapts the exact stopped event with zero listener arguments and exact disposer cleanup", () => {
    const sessionProbe = makeSessionProbe();
    const transport = createPlaybackCompletionTransport(sessionProbe.session);
    const originalListener = vi.fn<RawListener>(() => undefined);

    transport.on("output_audio_buffer.stopped", originalListener);
    expect(sessionProbe.onOutputAudioBufferStopped).toHaveBeenCalledTimes(1);
    const registeredListener = sessionProbe.onOutputAudioBufferStopped.mock.calls[0]?.[0];
    expect(registeredListener).not.toBe(originalListener);

    sessionProbe.emitStopped("provider-event");

    expect(originalListener).toHaveBeenCalledTimes(1);
    expect(originalListener.mock.calls[0]).toEqual([]);

    transport.off("output_audio_buffer.stopped", originalListener);
    transport.off("output_audio_buffer.stopped", originalListener);

    expect(sessionProbe.disposers[0]).toHaveBeenCalledTimes(1);
    expect(sessionProbe.listenerCount()).toBe(0);
  });

  it("retains an exact-off mapping when its disposer fails so dispose can retry it", () => {
    let attempts = 0;
    const sessionProbe = makeSessionProbe((_index, remove) =>
      vi.fn(() => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("raw disposer failure");
        }
        remove();
      }),
    );
    const transport = createPlaybackCompletionTransport(sessionProbe.session);
    const listener = vi.fn<RawListener>(() => undefined);

    transport.on("output_audio_buffer.stopped", listener);

    let offError: unknown;
    try {
      transport.off("output_audio_buffer.stopped", listener);
    } catch (error) {
      offError = error;
    }

    expect(offError).toBeUndefined();
    expect(sessionProbe.disposers[0]).toHaveBeenCalledTimes(1);
    expect(sessionProbe.listenerCount()).toBe(1);

    expect(() => transport.dispose()).not.toThrow();
    expect(sessionProbe.disposers[0]).toHaveBeenCalledTimes(2);
    expect(sessionProbe.listenerCount()).toBe(0);

    expect(() => transport.dispose()).not.toThrow();
    expect(sessionProbe.disposers[0]).toHaveBeenCalledTimes(2);
  });

  it("does not subscribe or throw for unsupported events and unmapped listeners", () => {
    const sessionProbe = makeSessionProbe();
    const transport = createPlaybackCompletionTransport(sessionProbe.session);
    const listener = vi.fn<RawListener>(() => undefined);

    transport.on("unsupported", listener);
    transport.off("unsupported", listener);
    transport.off("output_audio_buffer.stopped", listener);

    expect(sessionProbe.onOutputAudioBufferStopped).not.toHaveBeenCalled();
    expect(sessionProbe.listenerCount()).toBe(0);
  });

  it("does not duplicate a session subscription for the same event and listener", () => {
    const sessionProbe = makeSessionProbe();
    const transport = createPlaybackCompletionTransport(sessionProbe.session);
    const listener = vi.fn<RawListener>(() => undefined);

    transport.on("output_audio_buffer.stopped", listener);
    transport.on("output_audio_buffer.stopped", listener);
    sessionProbe.emitStopped();

    expect(sessionProbe.onOutputAudioBufferStopped).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(sessionProbe.disposers[0]).not.toHaveBeenCalled();
  });

  it("disposes every remaining subscription once and stays inert afterward", () => {
    const sessionProbe = makeSessionProbe();
    const transport = createPlaybackCompletionTransport(sessionProbe.session);
    const firstListener = vi.fn<RawListener>(() => undefined);
    const secondListener = vi.fn<RawListener>(() => undefined);

    transport.on("output_audio_buffer.stopped", firstListener);
    transport.on("output_audio_buffer.stopped", secondListener);
    transport.dispose();
    transport.dispose();
    transport.on("output_audio_buffer.stopped", firstListener);
    transport.off("output_audio_buffer.stopped", secondListener);

    expect(sessionProbe.disposers[0]).toHaveBeenCalledTimes(1);
    expect(sessionProbe.disposers[1]).toHaveBeenCalledTimes(1);
    expect(sessionProbe.onOutputAudioBufferStopped).toHaveBeenCalledTimes(2);
    expect(sessionProbe.listenerCount()).toBe(0);
  });

  it("isolates disposer failures and retries only failed disposers without raw errors", () => {
    const attempts = [0, 0, 0];
    const sessionProbe = makeSessionProbe((index, remove) =>
      vi.fn(() => {
        attempts[index] += 1;
        if (index !== 1 && attempts[index] === 1) {
          throw new Error("raw disposer failure");
        }
        remove();
      }),
    );
    const transport = createPlaybackCompletionTransport(sessionProbe.session);

    transport.on("output_audio_buffer.stopped", vi.fn<RawListener>(() => undefined));
    transport.on("output_audio_buffer.stopped", vi.fn<RawListener>(() => undefined));
    transport.on("output_audio_buffer.stopped", vi.fn<RawListener>(() => undefined));

    let disposalError: unknown;
    try {
      transport.dispose();
    } catch (error) {
      disposalError = error;
    }

    expect(disposalError).toBeInstanceOf(PlaybackCompletionTransportDisposeError);
    expect(disposalError).toMatchObject({
      reason: "listener_dispose_failed",
      count: 2,
    });
    expect(disposalError).not.toHaveProperty("cause");
    expect(disposalError).not.toHaveProperty("errors");
    expect(sessionProbe.disposers[0]).toHaveBeenCalledTimes(1);
    expect(sessionProbe.disposers[1]).toHaveBeenCalledTimes(1);
    expect(sessionProbe.disposers[2]).toHaveBeenCalledTimes(1);

    expect(() => transport.dispose()).not.toThrow();
    expect(sessionProbe.disposers[0]).toHaveBeenCalledTimes(2);
    expect(sessionProbe.disposers[1]).toHaveBeenCalledTimes(1);
    expect(sessionProbe.disposers[2]).toHaveBeenCalledTimes(2);
    expect(sessionProbe.listenerCount()).toBe(0);
  });

  it("cleans primary PlaybackCompletion through the session facade", async () => {
    const sessionProbe = makeSessionProbe();
    const schedulerProbe = makeSchedulerProbe();
    const abortProbe = makeAbortProbe();
    const eventSink = vi.fn<PlaybackCompletionMetadataEventSink>(() => undefined);
    const analyser = {
      readPeakLevel: vi.fn<PlaybackCompletionAnalyser["readPeakLevel"]>(() => 0.8),
    } satisfies PlaybackCompletionAnalyser;
    const completion = createCompletion(
      createPlaybackCompletionTransport(sessionProbe.session),
      schedulerProbe,
      eventSink,
      analyser,
      DEFAULT_COMPLETION_CONFIG,
    );

    const resultPromise = completion.waitForActualEnd(abortProbe.signal);
    sessionProbe.emitStopped("provider-event");

    await expect(resultPromise).resolves.toEqual({
      source: "output_audio_buffer.stopped",
    });
    expect(sessionProbe.onOutputAudioBufferStopped).toHaveBeenCalledTimes(1);
    expect(sessionProbe.disposers[0]).toHaveBeenCalledTimes(1);
    expect(sessionProbe.listenerCount()).toBe(0);
  });

  it("cleans abort PlaybackCompletion through the session facade", async () => {
    const sessionProbe = makeSessionProbe();
    const schedulerProbe = makeSchedulerProbe();
    const abortProbe = makeAbortProbe();
    const eventSink = vi.fn<PlaybackCompletionMetadataEventSink>(() => undefined);
    const analyser = {
      readPeakLevel: vi.fn<PlaybackCompletionAnalyser["readPeakLevel"]>(() => 0.8),
    } satisfies PlaybackCompletionAnalyser;
    const completion = createCompletion(
      createPlaybackCompletionTransport(sessionProbe.session),
      schedulerProbe,
      eventSink,
      analyser,
      DEFAULT_COMPLETION_CONFIG,
    );

    const resultPromise = completion.waitForActualEnd(abortProbe.signal);
    abortProbe.abort();
    sessionProbe.emitStopped("late-provider-event");

    await expect(resultPromise).rejects.toMatchObject({ name: "AbortError" });
    expect(sessionProbe.onOutputAudioBufferStopped).toHaveBeenCalledTimes(1);
    expect(sessionProbe.disposers[0]).toHaveBeenCalledTimes(1);
    expect(sessionProbe.listenerCount()).toBe(0);
    expect(eventSink).not.toHaveBeenCalled();
  });

  it("settles once from the primary raw event and cleans every listener and timer", async () => {
    const transportProbe = makeTransportProbe();
    const schedulerProbe = makeSchedulerProbe();
    const abortProbe = makeAbortProbe();
    const eventSink = vi.fn<PlaybackCompletionMetadataEventSink>(() => undefined);
    const analyser = {
      readPeakLevel: vi.fn<PlaybackCompletionAnalyser["readPeakLevel"]>(() => 0.8),
    } satisfies PlaybackCompletionAnalyser;
    const completion = createCompletion(
      transportProbe.transport,
      schedulerProbe,
      eventSink,
      analyser,
      DEFAULT_COMPLETION_CONFIG,
    );

    const resultPromise = completion.waitForActualEnd(abortProbe.signal);
    schedulerProbe.tick(DEFAULT_COMPLETION_CONFIG.fallbackAfterMs);
    await expectPending(resultPromise);
    schedulerProbe.tick(DEFAULT_COMPLETION_CONFIG.sampleIntervalMs);
    await expectPending(resultPromise);
    transportProbe.emitStopped();
    const result = await resultPromise;

    transportProbe.emitStopped();
    schedulerProbe.tick(DEFAULT_COMPLETION_CONFIG.fallbackAfterMs);

    expect(result).toEqual({ source: "output_audio_buffer.stopped" });
    expect(eventSink).toHaveBeenCalledTimes(1);
    expect(transportProbe.transport.on).toHaveBeenCalledWith(
      "output_audio_buffer.stopped",
      expect.any(Function),
    );
    expect(transportProbe.transport.off).toHaveBeenCalledWith(
      "output_audio_buffer.stopped",
      expect.any(Function),
    );
    expectMetadataEvent(eventSink.mock.calls[0]?.[0], {
      event: "playback_completed",
      source: "output_audio_buffer.stopped",
      duration_ms:
        DEFAULT_COMPLETION_CONFIG.fallbackAfterMs +
        DEFAULT_COMPLETION_CONFIG.sampleIntervalMs,
      status: "success",
      reason: "primary_event_received",
    });
    expect(transportProbe.listenerCount()).toBe(0);
    expect(schedulerProbe.pendingCount()).toBe(0);
    expect(schedulerProbe.clearTimeout).toHaveBeenCalledTimes(1);
    expect(abortProbe.removeEventListener).toHaveBeenCalledTimes(1);
    expect(analyser.readPeakLevel).toHaveBeenCalled();
  });

  it("uses the bounded analyser fallback when the primary event is delayed", async () => {
    const transportProbe = makeTransportProbe();
    const schedulerProbe = makeSchedulerProbe();
    const abortProbe = makeAbortProbe();
    const eventSink = vi.fn<PlaybackCompletionMetadataEventSink>(() => undefined);
    const analyser = {
      readPeakLevel: vi
        .fn<PlaybackCompletionAnalyser["readPeakLevel"]>(() => 0)
        .mockReturnValueOnce(0.8)
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(0),
    } satisfies PlaybackCompletionAnalyser;
    const completion = createCompletion(
      transportProbe.transport,
      schedulerProbe,
      eventSink,
      analyser,
      DEFAULT_COMPLETION_CONFIG,
    );

    const resultPromise = completion.waitForActualEnd(abortProbe.signal);
    schedulerProbe.tick(DEFAULT_COMPLETION_CONFIG.fallbackAfterMs - 1);
    expect(schedulerProbe.pendingCount()).toBe(1);
    expect(eventSink).not.toHaveBeenCalled();
    await expectPending(resultPromise);

    schedulerProbe.tick(1);
    expect(analyser.readPeakLevel).toHaveBeenCalledTimes(1);
    expect(eventSink).not.toHaveBeenCalled();
    await expectPending(resultPromise);

    schedulerProbe.tick(DEFAULT_COMPLETION_CONFIG.sampleIntervalMs);
    expect(analyser.readPeakLevel).toHaveBeenCalledTimes(2);
    expect(eventSink).not.toHaveBeenCalled();
    await expectPending(resultPromise);

    schedulerProbe.tick(DEFAULT_COMPLETION_CONFIG.sampleIntervalMs);
    const result = await resultPromise;

    transportProbe.emitStopped();
    schedulerProbe.tick(1_000);

    expect(result).toEqual({
      source: "bounded_analyser_fallback",
      reason: "tail_silence_detected",
    });
    expect(analyser.readPeakLevel).toHaveBeenCalledTimes(3);
    expect(eventSink).toHaveBeenCalledTimes(1);
    expectMetadataEvent(eventSink.mock.calls[0]?.[0], {
      event: "playback_completion_fallback",
      source: "bounded_analyser_fallback",
      duration_ms:
        DEFAULT_COMPLETION_CONFIG.fallbackAfterMs +
        DEFAULT_COMPLETION_CONFIG.sampleIntervalMs * 2,
      status: "degraded",
      reason: "tail_silence_detected",
    });
    expect(transportProbe.listenerCount()).toBe(0);
    expect(schedulerProbe.pendingCount()).toBe(0);
    expect(schedulerProbe.clearTimeout).toHaveBeenCalled();
    expect(abortProbe.removeEventListener).toHaveBeenCalledTimes(1);
  });

  it("resolves at the injected analyser bound when the tail never becomes silent", async () => {
    const transportProbe = makeTransportProbe();
    const schedulerProbe = makeSchedulerProbe();
    const abortProbe = makeAbortProbe();
    const eventSink = vi.fn<PlaybackCompletionMetadataEventSink>(() => undefined);
    const analyser = {
      readPeakLevel: vi.fn<PlaybackCompletionAnalyser["readPeakLevel"]>(() => 0.8),
    } satisfies PlaybackCompletionAnalyser;
    const completion = createCompletion(
      transportProbe.transport,
      schedulerProbe,
      eventSink,
      analyser,
      HARD_BOUND_COMPLETION_CONFIG,
    );

    const resultPromise = completion.waitForActualEnd(abortProbe.signal);
    schedulerProbe.tick(HARD_BOUND_COMPLETION_CONFIG.fallbackAfterMs);
    await expectPending(resultPromise);
    schedulerProbe.tick(HARD_BOUND_COMPLETION_CONFIG.sampleIntervalMs);
    await expectPending(resultPromise);
    schedulerProbe.tick(HARD_BOUND_COMPLETION_CONFIG.sampleIntervalMs);
    await expectPending(resultPromise);
    expect(eventSink).not.toHaveBeenCalled();

    schedulerProbe.tick(HARD_BOUND_COMPLETION_CONFIG.sampleIntervalMs);
    const result = await resultPromise;

    transportProbe.emitStopped();
    schedulerProbe.tick(1_000);

    expect(result).toEqual({
      source: "bounded_analyser_fallback",
      reason: "fallback_bound_reached",
    });
    expect(analyser.readPeakLevel).toHaveBeenCalled();
    expect(eventSink).toHaveBeenCalledTimes(1);
    expectMetadataEvent(eventSink.mock.calls[0]?.[0], {
      event: "playback_completion_fallback",
      source: "bounded_analyser_fallback",
      duration_ms:
        HARD_BOUND_COMPLETION_CONFIG.fallbackAfterMs +
        HARD_BOUND_COMPLETION_CONFIG.maxFallbackMs,
      status: "degraded",
      reason: "fallback_bound_reached",
    });
    expect(transportProbe.listenerCount()).toBe(0);
    expect(schedulerProbe.pendingCount()).toBe(0);
    expect(schedulerProbe.clearTimeout).toHaveBeenCalled();
    expect(abortProbe.removeEventListener).toHaveBeenCalledTimes(1);
  });

  it("settles exactly once on AbortSignal and ignores late primary and fallback signals", async () => {
    const transportProbe = makeTransportProbe();
    const schedulerProbe = makeSchedulerProbe();
    const abortProbe = makeAbortProbe();
    const eventSink = vi.fn<PlaybackCompletionMetadataEventSink>(() => undefined);
    const analyser = {
      readPeakLevel: vi.fn<PlaybackCompletionAnalyser["readPeakLevel"]>(() => 0),
    } satisfies PlaybackCompletionAnalyser;
    const completion = createCompletion(
      transportProbe.transport,
      schedulerProbe,
      eventSink,
      analyser,
      DEFAULT_COMPLETION_CONFIG,
    );

    const resultPromise = completion.waitForActualEnd(abortProbe.signal);
    abortProbe.abort();
    await expect(resultPromise).rejects.toMatchObject({ name: "AbortError" });

    transportProbe.emitStopped();
    schedulerProbe.tick(DEFAULT_COMPLETION_CONFIG.fallbackAfterMs);

    expect(eventSink).not.toHaveBeenCalled();
    expect(transportProbe.listenerCount()).toBe(0);
    expect(schedulerProbe.pendingCount()).toBe(0);
    expect(schedulerProbe.clearTimeout).toHaveBeenCalledTimes(1);
    expect(abortProbe.removeEventListener).toHaveBeenCalledTimes(1);
  });
});

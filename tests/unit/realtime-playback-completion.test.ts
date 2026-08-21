import { describe, expect, it, vi } from "vitest";

import {
  PlaybackCompletion,
  type PlaybackCompletionAnalyser,
  type PlaybackCompletionMetadataEventSink,
  type PlaybackCompletionScheduler,
  type PlaybackCompletionTransport,
} from "../../src/renderer/realtime/playback-completion";

type RawListener = Parameters<PlaybackCompletionTransport["on"]>[1];

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
  transportProbe: ReturnType<typeof makeTransportProbe>,
  schedulerProbe: ReturnType<typeof makeSchedulerProbe>,
  eventSink: PlaybackCompletionMetadataEventSink,
  analyser: PlaybackCompletionAnalyser,
  config: PlaybackCompletionConfig,
): PlaybackCompletion {
  const input: PlaybackCompletionConstructorInput = {
    transport: transportProbe.transport,
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
  it("settles once from the primary raw event and cleans every listener and timer", async () => {
    const transportProbe = makeTransportProbe();
    const schedulerProbe = makeSchedulerProbe();
    const abortProbe = makeAbortProbe();
    const eventSink = vi.fn<PlaybackCompletionMetadataEventSink>(() => undefined);
    const analyser = {
      readPeakLevel: vi.fn<PlaybackCompletionAnalyser["readPeakLevel"]>(() => 0.8),
    } satisfies PlaybackCompletionAnalyser;
    const completion = createCompletion(
      transportProbe,
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
      transportProbe,
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
      transportProbe,
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
      transportProbe,
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

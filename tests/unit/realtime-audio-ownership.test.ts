import { describe, expect, it, vi } from "vitest";

import {
  createMicOwner,
  type MicOwnerMetadataEvent,
  type MicOwnerMetadataEventSink,
} from "../../src/renderer/realtime/mic-owner";
import type { RealtimeSessionHandle } from "../../src/renderer/realtime/realtime-session-adapter";
import {
  createRealtimeAudioOutput,
  RealtimeAudioOutputStateError,
} from "../../src/renderer/realtime/realtime-audio-output";

type FakeTrack = {
  readonly kind: "audio";
  readonly stop: () => void;
};

type FakeStream = {
  readonly stream: MediaStream;
  readonly tracks: readonly FakeTrack[];
};

function makeStream(
  stopOverrides: readonly (() => void)[] = [],
): FakeStream {
  const tracks = stopOverrides.map((stop, index) => ({
    kind: "audio" as const,
    stop: vi.fn(stop),
    index,
  }));
  const stream = {
    getTracks: vi.fn(() => tracks),
  } as unknown as MediaStream;
  return { stream, tracks };
}

function makeSession(
  close: (reason: string) => void | Promise<void>,
): RealtimeSessionHandle {
  return {
    realtimeSessionId: "session-a",
    sessionGeneration: 1,
    connect: vi.fn<RealtimeSessionHandle["connect"]>(async () => undefined),
    interrupt: vi.fn<RealtimeSessionHandle["interrupt"]>(async () => undefined),
    close: vi.fn<RealtimeSessionHandle["close"]>(async (reason) => {
      await close(reason);
    }),
    onOutputAudioBufferStopped: vi.fn<RealtimeSessionHandle["onOutputAudioBufferStopped"]>(
      () => () => undefined,
    ),
  };
}

function makeEventSink() {
  return vi.fn<MicOwnerMetadataEventSink>(() => undefined);
}

function findEvent(
  eventSink: ReturnType<typeof makeEventSink>,
  eventName: string,
): MicOwnerMetadataEvent | undefined {
  return eventSink.mock.calls
    .map(([event]: [MicOwnerMetadataEvent]) => event)
    .find((event: MicOwnerMetadataEvent) => event.event === eventName);
}

type MicOwnerWithRollover = ReturnType<typeof createMicOwner> & {
  rollover(nextSession: RealtimeSessionHandle, reason: string): Promise<MediaStream>;
};

type RealtimeAudioOutputWithDispose = ReturnType<typeof createRealtimeAudioOutput> & {
  dispose(): Promise<void>;
};

describe("realtime microphone ownership", () => {
  it("acquires exactly one app-owned stream from none to realtime and rejects a second owner", async () => {
    const eventSink = makeEventSink();
    const session = makeSession(async () => undefined);
    const owner = createMicOwner({ session, eventSink });
    const first = makeStream([() => undefined]);
    const second = makeStream([() => undefined]);

    expect(owner.owner).toBe("none");

    await owner.acquire(first.stream);

    expect(owner.owner).toBe("realtime");
    expect(owner.mediaStream).toBe(first.stream);
    await expect(owner.acquire(second.stream)).rejects.toThrow();
    expect(owner.owner).toBe("realtime");
    expect(owner.mediaStream).toBe(first.stream);
  });

  it("closes the injected session before stopping every track, then returns owner to none", async () => {
    const sequence: string[] = [];
    const eventSink = makeEventSink();
    let owner: ReturnType<typeof createMicOwner>;
    const session = makeSession(async (reason) => {
      expect(owner.owner).toBe("realtime");
      sequence.push(`close:${reason}`);
    });
    const first = makeStream([
      () => {
        expect(owner.owner).toBe("realtime");
        sequence.push("stop:first");
      },
      () => {
        expect(owner.owner).toBe("realtime");
        sequence.push("stop:second");
      },
    ]);
    owner = createMicOwner({ session, eventSink });

    await owner.acquire(first.stream);
    await owner.release("handoff_to_wake");

    expect(session.close).toHaveBeenCalledTimes(1);
    expect(session.close).toHaveBeenCalledWith("handoff_to_wake");
    expect(first.stream.getTracks).toHaveBeenCalledTimes(1);
    expect(first.tracks[0]?.stop).toHaveBeenCalledTimes(1);
    expect(first.tracks[1]?.stop).toHaveBeenCalledTimes(1);
    expect(sequence).toEqual([
      "close:handoff_to_wake",
      "stop:first",
      "stop:second",
    ]);
    expect(owner.owner).toBe("none");
    expect(owner.mediaStream).toBeNull();
  });

  it("rolls over the session while retaining the exact stream without touching tracks or connecting the next session", async () => {
    const sequence: string[] = [];
    const eventSink = makeEventSink();
    const oldSession = makeSession(async (reason) => {
      sequence.push(`old:${reason}`);
    });
    const nextSession = makeSession(async () => {
      sequence.push("next:close");
    });
    const first = makeStream([() => sequence.push("stop")]);
    const owner = createMicOwner({ session: oldSession, eventSink }) as MicOwnerWithRollover;

    await owner.acquire(first.stream);
    const returnedStream = await owner.rollover(nextSession, "session_rollover");

    expect(returnedStream).toBe(first.stream);
    expect(owner.mediaStream).toBe(first.stream);
    expect(owner.owner).toBe("realtime");
    expect(oldSession.close).toHaveBeenCalledTimes(1);
    expect(oldSession.close).toHaveBeenCalledWith("session_rollover");
    expect(nextSession.close).not.toHaveBeenCalled();
    expect(nextSession.connect).not.toHaveBeenCalled();
    expect(first.stream.getTracks).not.toHaveBeenCalled();
    expect(first.tracks[0]?.stop).not.toHaveBeenCalled();
    expect(sequence).toEqual(["old:session_rollover"]);

    const success = findEvent(eventSink, "mic_rollover_succeeded");
    expect(success).toEqual({
      event: "mic_rollover_succeeded",
      owner: "realtime",
      status: "success",
      reason: "rollover_succeeded",
      count: 1,
    });
    expect(success).not.toHaveProperty("session");
    expect(success).not.toHaveProperty("stream");
    expect(success).not.toHaveProperty("track");
  });

  it("retries a failed rollover close and closes the old session before the new session on release", async () => {
    const sequence: string[] = [];
    const eventSink = makeEventSink();
    let failClose = true;
    const oldSession = makeSession(async () => {
      sequence.push("old:close");
      if (failClose) throw new Error();
    });
    const nextSession = makeSession(async () => {
      sequence.push("next:close");
    });
    const first = makeStream([() => sequence.push("stop")]);
    const owner = createMicOwner({ session: oldSession, eventSink }) as MicOwnerWithRollover;

    await owner.acquire(first.stream);
    await expect(owner.rollover(nextSession, "session_rollover")).rejects.toMatchObject({
      reason: "session_close_failed",
    });
    expect(owner.mediaStream).toBe(first.stream);
    expect(nextSession.connect).not.toHaveBeenCalled();

    failClose = false;
    await expect(owner.rollover(nextSession, "session_rollover")).resolves.toBe(first.stream);
    await owner.release("handoff_to_wake");

    expect(sequence).toEqual([
      "old:close",
      "old:close",
      "next:close",
      "stop",
    ]);
    expect(oldSession.close).toHaveBeenCalledTimes(2);
    expect(nextSession.close).toHaveBeenCalledTimes(1);
  });

  it("retries track enumeration after failure without closing the session twice", async () => {
    const eventSink = makeEventSink();
    const session = makeSession(async () => undefined);
    const track = {
      kind: "audio" as const,
      stop: vi.fn(),
    };
    const getTracks = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error();
      })
      .mockReturnValueOnce([track]);
    const stream = { getTracks } as unknown as MediaStream;
    const owner = createMicOwner({ session, eventSink });

    await owner.acquire(stream);
    await expect(owner.release("handoff_to_wake")).rejects.toMatchObject({
      reason: "track_enumeration_failed",
    });
    await owner.release("handoff_to_wake");

    expect(session.close).toHaveBeenCalledTimes(1);
    expect(getTracks).toHaveBeenCalledTimes(2);
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(owner.owner).toBe("none");
    expect(owner.mediaStream).toBeNull();
  });

  it("attempts every track and retries only the track whose stop failed", async () => {
    const eventSink = makeEventSink();
    const session = makeSession(async () => undefined);
    let failFirstStop = true;
    const firstStop = vi.fn(() => {
      if (failFirstStop) throw new Error();
    });
    const secondStop = vi.fn();
    const first = makeStream([firstStop, secondStop]);
    const owner = createMicOwner({ session, eventSink });

    await owner.acquire(first.stream);
    await expect(owner.release("handoff_to_wake")).rejects.toMatchObject({
      reason: "track_stop_failed",
    });
    failFirstStop = false;
    await owner.release("handoff_to_wake");

    expect(session.close).toHaveBeenCalledTimes(1);
    expect(first.stream.getTracks).toHaveBeenCalledTimes(1);
    expect(firstStop).toHaveBeenCalledTimes(2);
    expect(secondStop).toHaveBeenCalledTimes(1);
    expect(owner.owner).toBe("none");
  });

  it("shares concurrent release work and makes a completed release idempotent", async () => {
    const eventSink = makeEventSink();
    let allowClose!: () => void;
    const closePending = new Promise<void>((resolve) => {
      allowClose = resolve;
    });
    const session = makeSession(async () => closePending);
    const first = makeStream([() => undefined]);
    const owner = createMicOwner({ session, eventSink });

    await owner.acquire(first.stream);
    const firstRelease = owner.release("handoff_to_wake");
    const secondRelease = owner.release("handoff_to_wake");
    const sharesPromise = firstRelease === secondRelease;

    allowClose();
    await Promise.all([firstRelease, secondRelease]);
    const thirdRelease = owner.release("handoff_to_wake");
    await thirdRelease;

    expect(sharesPromise).toBe(true);
    expect(session.close).toHaveBeenCalledTimes(1);
    expect(first.stream.getTracks).toHaveBeenCalledTimes(1);
    expect(first.tracks[0]?.stop).toHaveBeenCalledTimes(1);
    expect(owner.owner).toBe("none");
    expect(owner.mediaStream).toBeNull();
  });

  it("rejects rollover during a final release and retains ownership until release completes", async () => {
    const eventSink = makeEventSink();
    let allowClose!: () => void;
    const closePending = new Promise<void>((resolve) => {
      allowClose = resolve;
    });
    const oldSession = makeSession(async () => closePending);
    const nextSession = makeSession(async () => undefined);
    const first = makeStream([() => undefined]);
    const owner = createMicOwner({ session: oldSession, eventSink }) as MicOwnerWithRollover;

    await owner.acquire(first.stream);
    const releasePromise = owner.release("handoff_to_wake");
    await expect(owner.rollover(nextSession, "session_rollover")).rejects.toMatchObject({
      reason: "release_in_progress",
    });
    expect(owner.owner).toBe("realtime");
    expect(owner.mediaStream).toBe(first.stream);
    expect(nextSession.close).not.toHaveBeenCalled();
    allowClose();
    await releasePromise;
  });

  it("reports a close failure as local Maintenance and keeps realtime ownership", async () => {
    const eventSink = makeEventSink();
    const close = vi.fn<RealtimeSessionHandle["close"]>(async () => {
      throw new Error();
    });
    const session = makeSession(close);
    const owner = createMicOwner({ session, eventSink });
    const first = makeStream([() => undefined]);
    const second = makeStream([() => undefined]);

    await owner.acquire(first.stream);
    await expect(owner.release("handoff_to_wake")).rejects.toThrow();

    expect(first.tracks[0]?.stop).not.toHaveBeenCalled();
    expect(owner.owner).toBe("realtime");
    expect(owner.mediaStream).toBe(first.stream);
    await expect(owner.acquire(second.stream)).rejects.toThrow();

    const failure = findEvent(eventSink, "mic_handoff_failed");
    expect(failure).toEqual(
      expect.objectContaining({
        event: "mic_handoff_failed",
        status: "failed",
        classification: "Maintenance",
      }),
    );
    expect(failure).not.toHaveProperty("stream");
    expect(failure).not.toHaveProperty("tracks");
    expect(failure).not.toHaveProperty("error");
  });

  it("reports a track-stop failure, still attempts every track once, and blocks a new owner", async () => {
    const sequence: string[] = [];
    const eventSink = makeEventSink();
    const session = makeSession(async () => {
      sequence.push("close");
    });
    const first = makeStream([
      () => {
        sequence.push("stop:first");
        throw new Error();
      },
      () => {
        sequence.push("stop:second");
      },
    ]);
    const owner = createMicOwner({ session, eventSink });
    const second = makeStream([() => undefined]);

    await owner.acquire(first.stream);
    await expect(owner.release("handoff_to_wake")).rejects.toThrow();

    expect(sequence).toEqual(["close", "stop:first", "stop:second"]);
    expect(first.tracks[0]?.stop).toHaveBeenCalledTimes(1);
    expect(first.tracks[1]?.stop).toHaveBeenCalledTimes(1);
    expect(owner.owner).toBe("realtime");
    expect(owner.mediaStream).toBe(first.stream);
    await expect(owner.acquire(second.stream)).rejects.toThrow();

    const failure = findEvent(eventSink, "mic_handoff_failed");
    expect(failure).toEqual(
      expect.objectContaining({
        event: "mic_handoff_failed",
        status: "failed",
        classification: "Maintenance",
      }),
    );
    expect(failure).not.toHaveProperty("stream");
    expect(failure).not.toHaveProperty("tracks");
    expect(failure).not.toHaveProperty("error");
  });
});

describe("realtime audio output graph", () => {
  it("uses one unmuted SDK element and a silent analyser tap without duplicate audible routing", () => {
    const remoteStream = Object.freeze({}) as unknown as MediaStream;
    const audioElement = {
      srcObject: null as MediaStream | null,
      muted: true,
      volume: 0,
    };
    const destination = {};
    const analyser = {
      connect: vi.fn(),
    };
    const source = {
      connect: vi.fn(),
    };
    const audioContext = {
      createMediaStreamSource: vi.fn(() => source),
      createAnalyser: vi.fn(() => analyser),
      destination,
    };
    const createAudioElement = vi.fn(() => audioElement as unknown as HTMLAudioElement);
    const createAudioContext = vi.fn(() => audioContext as unknown as AudioContext);

    const output = createRealtimeAudioOutput({
      dependencies: { createAudioElement, createAudioContext },
    });
    const outputWithTap = output as typeof output & {
      attachAnalyserTap(): void;
    };

    expect(createAudioElement).toHaveBeenCalledTimes(1);
    expect(output.audioElement).toBe(audioElement);
    expect(audioElement.muted).toBe(false);
    expect(audioElement.volume).toBe(1);
    expect(audioElement.srcObject).toBeNull();
    expect(audioContext.createMediaStreamSource).not.toHaveBeenCalled();
    expect(audioContext.createAnalyser).toHaveBeenCalledTimes(1);
    expect(source.connect).not.toHaveBeenCalled();
    expect(source.connect).not.toHaveBeenCalledWith(destination);
    expect(analyser.connect).not.toHaveBeenCalled();

    audioElement.srcObject = remoteStream;
    outputWithTap.attachAnalyserTap();

    expect(output.audioElement).toBe(audioElement);
    expect(audioElement.srcObject).toBe(remoteStream);
    expect(audioContext.createMediaStreamSource).toHaveBeenCalledTimes(1);
    expect(audioContext.createMediaStreamSource).toHaveBeenCalledWith(remoteStream);
    expect(source.connect).toHaveBeenCalledTimes(1);
    expect(source.connect).toHaveBeenCalledWith(analyser);
    expect(source.connect).not.toHaveBeenCalledWith(destination);
    expect(analyser.connect).not.toHaveBeenCalled();

    outputWithTap.attachAnalyserTap();

    output.setVolume(0.35);
    output.setMuted(true);

    expect(audioElement.volume).toBe(0.35);
    expect(audioElement.muted).toBe(true);
    expect(createAudioElement).toHaveBeenCalledTimes(1);
    expect(audioContext.createAnalyser).toHaveBeenCalledTimes(1);
    expect(audioContext.createMediaStreamSource).toHaveBeenCalledTimes(1);
    expect(source.connect).toHaveBeenCalledTimes(1);
    expect(analyser.connect).not.toHaveBeenCalled();
  });

  it("disposes the element, retained analyser source, and context without stopping mic tracks", async () => {
    const remoteStream = {
      getTracks: vi.fn(() => []),
    } as unknown as MediaStream;
    const audioElement = {
      srcObject: remoteStream as MediaStream | null,
      muted: false,
      volume: 1,
      pause: vi.fn(),
    };
    const analyser = { connect: vi.fn() };
    const source = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const audioContext = {
      createMediaStreamSource: vi.fn(() => source),
      createAnalyser: vi.fn(() => analyser),
      close: vi.fn(async () => undefined),
      destination: {},
    };
    const output = createRealtimeAudioOutput({
      dependencies: {
        createAudioElement: vi.fn(() => audioElement as unknown as HTMLAudioElement),
        createAudioContext: vi.fn(() => audioContext as unknown as AudioContext),
      },
    }) as RealtimeAudioOutputWithDispose;

    output.attachAnalyserTap();
    await output.dispose();

    expect(audioElement.pause).toHaveBeenCalledTimes(1);
    expect(audioElement.srcObject).toBeNull();
    expect(source.disconnect).toHaveBeenCalledTimes(1);
    expect(audioContext.close).toHaveBeenCalledTimes(1);
    expect(remoteStream.getTracks).not.toHaveBeenCalled();
    expect(source.connect).toHaveBeenCalledWith(analyser);
    expect(source.connect).not.toHaveBeenCalledWith(audioContext.destination);
    expect(analyser.connect).not.toHaveBeenCalled();
  });

  it("shares concurrent disposal and makes full disposal idempotent", async () => {
    const remoteStream = Object.freeze({}) as unknown as MediaStream;
    const audioElement = {
      srcObject: remoteStream as MediaStream | null,
      muted: false,
      volume: 1,
      pause: vi.fn(),
    };
    const source = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    let allowClose!: () => void;
    const closePending = new Promise<void>((resolve) => {
      allowClose = resolve;
    });
    const audioContext = {
      createMediaStreamSource: vi.fn(() => source),
      createAnalyser: vi.fn(() => ({ connect: vi.fn() })),
      close: vi.fn(() => closePending),
    };
    const output = createRealtimeAudioOutput({
      dependencies: {
        createAudioElement: vi.fn(() => audioElement as unknown as HTMLAudioElement),
        createAudioContext: vi.fn(() => audioContext as unknown as AudioContext),
      },
    }) as RealtimeAudioOutputWithDispose;

    output.attachAnalyserTap();
    const firstDispose = output.dispose();
    const secondDispose = output.dispose();
    const sharesPromise = firstDispose === secondDispose;

    expect(audioElement.pause).toHaveBeenCalledTimes(1);
    expect(source.disconnect).toHaveBeenCalledTimes(1);
    expect(audioContext.close).toHaveBeenCalledTimes(1);
    allowClose();
    await Promise.all([firstDispose, secondDispose]);
    await output.dispose();

    expect(sharesPromise).toBe(true);
    expect(audioElement.pause).toHaveBeenCalledTimes(1);
    expect(source.disconnect).toHaveBeenCalledTimes(1);
    expect(audioContext.close).toHaveBeenCalledTimes(1);
  });

  it("attempts unrelated disposal resources after a failure and retries only incomplete resources", async () => {
    const remoteStream = Object.freeze({}) as unknown as MediaStream;
    let failPause = true;
    let failDisconnect = true;
    let failClose = true;
    const audioElement = {
      srcObject: remoteStream as MediaStream | null,
      muted: false,
      volume: 1,
      pause: vi.fn(() => {
        if (failPause) throw new Error();
      }),
    };
    const source = {
      connect: vi.fn(),
      disconnect: vi.fn(() => {
        if (failDisconnect) throw new Error();
      }),
    };
    const audioContext = {
      createMediaStreamSource: vi.fn(() => source),
      createAnalyser: vi.fn(() => ({ connect: vi.fn() })),
      close: vi.fn(async () => {
        if (failClose) throw new Error();
      }),
    };
    const output = createRealtimeAudioOutput({
      dependencies: {
        createAudioElement: vi.fn(() => audioElement as unknown as HTMLAudioElement),
        createAudioContext: vi.fn(() => audioContext as unknown as AudioContext),
      },
    }) as RealtimeAudioOutputWithDispose;

    output.attachAnalyserTap();
    await expect(output.dispose()).rejects.toMatchObject({
      reason: expect.any(String),
      count: 3,
    });
    expect(audioElement.srcObject).toBeNull();
    expect(audioElement.pause).toHaveBeenCalledTimes(1);
    expect(source.disconnect).toHaveBeenCalledTimes(1);
    expect(audioContext.close).toHaveBeenCalledTimes(1);

    failPause = false;
    failDisconnect = false;
    failClose = false;
    await output.dispose();
    await output.dispose();

    expect(audioElement.pause).toHaveBeenCalledTimes(2);
    expect(source.disconnect).toHaveBeenCalledTimes(2);
    expect(audioContext.close).toHaveBeenCalledTimes(2);
  });

  it("rejects analyser attachment synchronously while disposal is in flight without reading the element stream", async () => {
    const remoteStream = Object.freeze({}) as unknown as MediaStream;
    let currentStream: MediaStream | null = remoteStream;
    const readSrcObject = vi.fn(() => currentStream);
    const audioElement = {
      get srcObject() {
        return readSrcObject();
      },
      set srcObject(stream: MediaStream | null) {
        currentStream = stream;
      },
      muted: false,
      volume: 1,
      pause: vi.fn(),
    };
    const source = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    let allowClose!: () => void;
    const closePending = new Promise<void>((resolve) => {
      allowClose = resolve;
    });
    const audioContext = {
      createMediaStreamSource: vi.fn(() => source),
      createAnalyser: vi.fn(() => ({ connect: vi.fn() })),
      close: vi.fn(() => closePending),
    };
    const output = createRealtimeAudioOutput({
      dependencies: {
        createAudioElement: vi.fn(() => audioElement as unknown as HTMLAudioElement),
        createAudioContext: vi.fn(() => audioContext as unknown as AudioContext),
      },
    });

    const disposePromise = output.dispose();
    let thrown: unknown;
    try {
      output.attachAnalyserTap();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(RealtimeAudioOutputStateError);
    expect(thrown).toMatchObject({ reason: "output_disposing" });
    expect(Object.keys(thrown as object)).toEqual(["reason"]);
    expect(thrown).not.toHaveProperty("audioElement");
    expect(thrown).not.toHaveProperty("audioContext");
    expect(thrown).not.toHaveProperty("error");
    expect(readSrcObject).not.toHaveBeenCalled();
    expect(audioContext.createMediaStreamSource).not.toHaveBeenCalled();

    allowClose();
    await disposePromise;
  });

  it("rejects analyser attachment synchronously after disposal with the same metadata-only state error", async () => {
    const remoteStream = Object.freeze({}) as unknown as MediaStream;
    let currentStream: MediaStream | null = remoteStream;
    const readSrcObject = vi.fn(() => currentStream);
    const audioElement = {
      get srcObject() {
        return readSrcObject();
      },
      set srcObject(stream: MediaStream | null) {
        currentStream = stream;
      },
      muted: false,
      volume: 1,
      pause: vi.fn(),
    };
    const audioContext = {
      createMediaStreamSource: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      createAnalyser: vi.fn(() => ({ connect: vi.fn() })),
      close: vi.fn(async () => undefined),
    };
    const output = createRealtimeAudioOutput({
      dependencies: {
        createAudioElement: vi.fn(() => audioElement as unknown as HTMLAudioElement),
        createAudioContext: vi.fn(() => audioContext as unknown as AudioContext),
      },
    });

    await output.dispose();

    let thrown: unknown;
    try {
      output.attachAnalyserTap();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(RealtimeAudioOutputStateError);
    expect(thrown).toMatchObject({ reason: "output_disposed" });
    expect(Object.keys(thrown as object)).toEqual(["reason"]);
    expect(thrown).not.toHaveProperty("audioElement");
    expect(thrown).not.toHaveProperty("audioContext");
    expect(thrown).not.toHaveProperty("error");
    expect(readSrcObject).not.toHaveBeenCalled();
    expect(audioContext.createMediaStreamSource).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";

import {
  createMicOwner,
  type MicOwnerMetadataEvent,
  type MicOwnerMetadataEventSink,
} from "../../src/renderer/realtime/mic-owner";
import type { RealtimeSessionHandle } from "../../src/renderer/realtime/realtime-session-adapter";
import { createRealtimeAudioOutput } from "../../src/renderer/realtime/realtime-audio-output";

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
});

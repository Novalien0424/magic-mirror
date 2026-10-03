export type NormalizedSampleFrame = ArrayLike<number>;

export type LipSyncPlayback = "playing" | "stopped";
export type PlaybackState = LipSyncPlayback;

export type LipSyncStatus =
  | "active"
  | "silent"
  | "empty"
  | "invalid"
  | "stopped";

export interface LipSyncFrame {
  samples: NormalizedSampleFrame;
  playback: LipSyncPlayback;
  deltaMs: number;
}

export interface LipSyncOptions {
  silenceThreshold: number;
  gain: number;
  attackMs: number;
  releaseMs: number;
}

export type LipSyncEnvelopeOptions = LipSyncOptions;

export interface LipSyncResult {
  rms: number;
  mouthOpen: number;
  status: LipSyncStatus;
}

export type LipSyncEnvelopeResult = LipSyncResult;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const clampUnit = (value: number): number => {
  if (value <= 0) {
    return 0;
  }

  if (value >= 1) {
    return 1;
  }

  return value;
};

const invalidResult = (): LipSyncResult => ({
  rms: 0,
  mouthOpen: 0,
  status: "invalid",
});

const isValidOptions = (options: unknown): options is LipSyncOptions => {
  if (typeof options !== "object" || options === null) {
    return false;
  }

  const candidate = options as LipSyncOptions;
  return (
    isFiniteNumber(candidate.silenceThreshold) &&
    candidate.silenceThreshold >= 0 &&
    candidate.silenceThreshold <= 1 &&
    isFiniteNumber(candidate.gain) &&
    candidate.gain >= 0 &&
    isFiniteNumber(candidate.attackMs) &&
    candidate.attackMs > 0 &&
    isFiniteNumber(candidate.releaseMs) &&
    candidate.releaseMs > 0
  );
};

const isValidSampleFrame = (
  samples: unknown,
): samples is NormalizedSampleFrame => {
  if (typeof samples !== "object" || samples === null) {
    return false;
  }

  const length = (samples as ArrayLike<number>).length;
  return (
    isFiniteNumber(length) &&
    Number.isSafeInteger(length) &&
    length >= 0
  );
};

export function advanceLipSyncEnvelope(
  previousMouthOpen: number,
  frame: LipSyncFrame,
  options: LipSyncEnvelopeOptions,
): LipSyncEnvelopeResult {
  try {
    if (
      typeof frame !== "object" ||
      frame === null ||
      (frame.playback !== "playing" && frame.playback !== "stopped")
    ) {
      return invalidResult();
    }

    if (frame.playback === "stopped") {
      return { rms: 0, mouthOpen: 0, status: "stopped" };
    }

    if (
      !isFiniteNumber(previousMouthOpen) ||
      previousMouthOpen < 0 ||
      previousMouthOpen > 1 ||
      !isFiniteNumber(frame.deltaMs) ||
      frame.deltaMs < 0 ||
      !isValidOptions(options) ||
      !isValidSampleFrame(frame.samples)
    ) {
      return invalidResult();
    }

    const sampleCount = frame.samples.length;
    if (sampleCount === 0) {
      return { rms: 0, mouthOpen: 0, status: "empty" };
    }

    let sumSquares = 0;
    for (let index = 0; index < sampleCount; index += 1) {
      const sample = frame.samples[index];
      if (
        !isFiniteNumber(sample) ||
        sample < -1 ||
        sample > 1
      ) {
        return invalidResult();
      }

      sumSquares += sample * sample;
    }

    const rms = clampUnit(Math.sqrt(sumSquares / sampleCount));
    if (!isFiniteNumber(rms)) {
      return invalidResult();
    }

    const isAboveSilence = rms > options.silenceThreshold;
    const targetMouthOpen = isAboveSilence
      ? clampUnit(rms * options.gain)
      : 0;
    const smoothingMs =
      targetMouthOpen > previousMouthOpen
        ? options.attackMs
        : options.releaseMs;
    const smoothingFactor = Math.min(1, frame.deltaMs / smoothingMs);
    const mouthOpen = clampUnit(
      previousMouthOpen +
        (targetMouthOpen - previousMouthOpen) * smoothingFactor,
    );

    return {
      rms,
      mouthOpen,
      status: isAboveSilence ? "active" : "silent",
    };
  } catch {
    return invalidResult();
  }
}

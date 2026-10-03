import { describe, expect, it } from "vitest";

import {
  advanceLipSyncEnvelope,
  type LipSyncEnvelopeOptions,
  type LipSyncFrame,
} from "../../../../src/renderer/avatar/audio/lipSyncMath";

const options: LipSyncEnvelopeOptions = {
  silenceThreshold: 0.1,
  gain: 1,
  attackMs: 100,
  releaseMs: 100,
};

const frame = (
  samples: number[],
  deltaMs = 100,
  playback: LipSyncFrame["playback"] = "playing",
): LipSyncFrame => ({ samples, deltaMs, playback });

describe("advanceLipSyncEnvelope", () => {
  it("computes RMS from alternating positive and negative samples", () => {
    expect(advanceLipSyncEnvelope(0, frame([-0.5, 0.5]), options)).toEqual({
      rms: 0.5,
      mouthOpen: 0.5,
      status: "active",
    });
  });

  it("releases toward zero for valid silence", () => {
    expect(
      advanceLipSyncEnvelope(0.75, frame([0.05, -0.05], 25), options),
    ).toEqual({
      rms: 0.05,
      mouthOpen: 0.5625,
      status: "silent",
    });
  });

  it("applies time-based attack smoothing without overshooting", () => {
    expect(
      advanceLipSyncEnvelope(0, frame([1, -1], 50), {
        ...options,
        gain: 0.5,
      }),
    ).toEqual({
      rms: 1,
      mouthOpen: 0.25,
      status: "active",
    });
  });

  it("applies time-based release smoothing", () => {
    expect(
      advanceLipSyncEnvelope(0.75, frame([0.5, -0.5], 25), {
        ...options,
        gain: 0.5,
      }),
    ).toEqual({
      rms: 0.5,
      mouthOpen: 0.625,
      status: "active",
    });
  });

  it("clamps the gained target to one", () => {
    expect(
      advanceLipSyncEnvelope(0, frame([1, 1]), {
        ...options,
        gain: 4,
      }),
    ).toEqual({
      rms: 1,
      mouthOpen: 1,
      status: "active",
    });
  });

  it("returns empty for a frame with no samples", () => {
    expect(advanceLipSyncEnvelope(0.7, frame([]), options)).toEqual({
      rms: 0,
      mouthOpen: 0,
      status: "empty",
    });
  });

  it.each([
    ["NaN", [Number.NaN]],
    ["out-of-range", [1.01]],
  ])("returns invalid for %s samples", (_label, samples) => {
    expect(
      advanceLipSyncEnvelope(0.4, frame(samples), options),
    ).toEqual({
      rms: 0,
      mouthOpen: 0,
      status: "invalid",
    });
  });

  it.each([
    ["previous mouth below zero", -0.01, frame([0.5]), options],
    ["previous mouth above one", 1.01, frame([0.5]), options],
    ["negative delta", 0, frame([0.5], -1), options],
    ["non-finite delta", 0, frame([0.5], Number.NaN), options],
    ["negative gain", 0, frame([0.5]), { ...options, gain: -1 }],
    ["non-finite gain", 0, frame([0.5]), { ...options, gain: Infinity }],
    [
      "threshold below zero",
      0,
      frame([0.5]),
      { ...options, silenceThreshold: -0.01 },
    ],
    [
      "threshold above one",
      0,
      frame([0.5]),
      { ...options, silenceThreshold: 1.01 },
    ],
    ["zero attack", 0, frame([0.5]), { ...options, attackMs: 0 }],
    [
      "non-finite release",
      0,
      frame([0.5]),
      { ...options, releaseMs: Number.NaN },
    ],
    [
      "invalid playback state",
      0,
      frame([0.5], 100, "paused" as LipSyncFrame["playback"]),
      options,
    ],
  ])("returns invalid for %s", (_label, previous, invalidFrame, invalidOptions) => {
    expect(
      advanceLipSyncEnvelope(previous, invalidFrame, invalidOptions),
    ).toEqual({
      rms: 0,
      mouthOpen: 0,
      status: "invalid",
    });
  });

  it("zeros immediately when playback is stopped", () => {
    expect(
      advanceLipSyncEnvelope(0.75, frame([1, -1], 0, "stopped"), options),
    ).toEqual({
      rms: 0,
      mouthOpen: 0,
      status: "stopped",
    });
  });
});

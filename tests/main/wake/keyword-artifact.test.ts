import { describe, expect, it } from "vitest";

import {
  compileKeywordArtifact,
  type CompileKeywordArtifactRequest,
  type KeywordArtifactSource,
} from "../../../src/main/wake/keyword-artifact";
import { syntheticKeywordCorpus } from "../../../src/main/wake/fixtures/synthetic-keyword-corpus";

const baseRequest: CompileKeywordArtifactRequest = {
  format: "sherpa-onnx-keyword-v1",
  artifactVersion: "artifact-2026-08-24",
  source: "encoded_fixture",
  keywordId: "keyword.synthetic",
  encoded: syntheticKeywordCorpus.expectedSequence,
  displayId: "synthetic-main",
  boost: 0,
  threshold: 0,
  globalBoost: 1.25,
  globalThreshold: 0.35,
  model: {
    modelId: "sherpa-onnx.synthetic",
    modelVersion: "model-1",
    sampleRateHz: 16_000,
    featureDim: 80,
  },
  numTrailingBlanks: 2,
  resetAfterDetection: true,
};

function request(
  overrides: Partial<CompileKeywordArtifactRequest> = {},
): CompileKeywordArtifactRequest {
  return { ...baseRequest, ...overrides };
}

describe("compileKeywordArtifact", () => {
  it("emits deterministic artifact bytes and metadata", () => {
    const first = compileKeywordArtifact(request());
    const second = compileKeywordArtifact(request());

    expect(first).toEqual(second);
    expect(first).toEqual({
      status: "ready",
      artifact: `${syntheticKeywordCorpus.expectedSequence} :1.25 #0.35 @synthetic-main`,
      manifest: {
        formatVersion: 1,
        artifactVersion: "artifact-2026-08-24",
        source: "encoded_fixture",
        keywordId: "keyword.synthetic",
        model: {
          modelId: "sherpa-onnx.synthetic",
          modelVersion: "model-1",
          sampleRateHz: 16_000,
          featureDim: 80,
        },
        effectiveBoost: 1.25,
        effectiveThreshold: 0.35,
        numTrailingBlanks: 2,
        resetAfterDetection: true,
      },
    });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("uses global tuning for missing and numeric-zero values", () => {
    expect(
      compileKeywordArtifact(
        request({ boost: undefined, threshold: undefined }),
      ),
    ).toMatchObject({
      status: "ready",
      artifact: `${syntheticKeywordCorpus.expectedSequence} :1.25 #0.35 @synthetic-main`,
      manifest: { effectiveBoost: 1.25, effectiveThreshold: 0.35 },
    });

    expect(
      compileKeywordArtifact(request({ boost: 2.5, threshold: 0.8 })),
    ).toMatchObject({
      status: "ready",
      artifact: `${syntheticKeywordCorpus.expectedSequence} :2.5 #0.8 @synthetic-main`,
      manifest: { effectiveBoost: 2.5, effectiveThreshold: 0.8 },
    });
  });

  it("preserves a safe Unicode display token in the serialized artifact", () => {
    expect(
      compileKeywordArtifact(request({ displayId: "synthetic-Δ" })),
    ).toMatchObject({
      status: "ready",
      artifact: `${syntheticKeywordCorpus.expectedSequence} :1.25 #0.35 @synthetic-Δ`,
    });
  });

  it.each([
    ["invalid_format", { format: "unsupported" }],
    ["invalid_tuning", { globalBoost: Number.NaN }],
    ["invalid_model_metadata", { model: { ...baseRequest.model, sampleRateHz: 8_000 } }],
    ["invalid_source", { source: "unsupported_source" as KeywordArtifactSource }],
    ["invalid_identifier", { keywordId: " keyword.synthetic" }],
    ["invalid_encoded_text", { encoded: "101 202\n303" }],
    ["reset_after_detection_required", { resetAfterDetection: false }],
  ] as const)("returns a reasoned fallback for %s", (reason, overrides) => {
    const result = compileKeywordArtifact(request(overrides));

    expect(result).toEqual({
      status: "fallback",
      fallback: "detector_disabled",
      reason,
    });
    expect(JSON.stringify(result)).not.toContain("unsupported");
    expect(JSON.stringify(result)).not.toContain("8000");
    expect(JSON.stringify(result)).not.toContain("synthetic main");
  });

  it.each([
    ["whitespace", "synthetic main"],
    ["tab", "synthetic\tmain"],
    ["control character", "synthetic\u0007main"],
    ["carriage return", "synthetic\rmain"],
    ["line feed", "synthetic\nmain"],
    ["line separator", "synthetic\u2028main"],
    ["paragraph separator", "synthetic\u2029main"],
    ["colon delimiter", "synthetic:main"],
    ["hash delimiter", "synthetic#main"],
    ["at delimiter", "synthetic@main"],
  ] as const)("rejects a display token containing %s", (_label, displayId) => {
    expect(compileKeywordArtifact(request({ displayId }))).toEqual({
      status: "fallback",
      fallback: "detector_disabled",
      reason: "invalid_display_id",
    });
  });

  it.each([
    ["carriage return", "fixture_token_a\rfixture_token_b"],
    ["line feed", "fixture_token_a\nfixture_token_b"],
    ["colon delimiter", "fixture_token_a:fixture_token_b"],
    ["hash delimiter", "fixture_token_a#fixture_token_b"],
    ["at delimiter", "fixture_token_a@fixture_token_b"],
  ] as const)("rejects encoded text containing a %s", (_label, encoded) => {
    expect(compileKeywordArtifact(request({ encoded }))).toEqual({
      status: "fallback",
      fallback: "detector_disabled",
      reason: "invalid_encoded_text",
    });
  });

  it("does not substitute an artifact or model on fallback", () => {
    const result = compileKeywordArtifact(
      request({
        encoded: syntheticKeywordCorpus.expectedSequence,
        model: { ...baseRequest.model, featureDim: 40 },
      }),
    );

    expect(result).toEqual({
      status: "fallback",
      fallback: "detector_disabled",
      reason: "invalid_model_metadata",
    });
    expect(result).not.toHaveProperty("artifact");
    expect(result).not.toHaveProperty("manifest");
  });

});

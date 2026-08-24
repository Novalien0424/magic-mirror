const KEYWORD_FORMAT = "sherpa-onnx-keyword-v1";
const KEYWORD_FORMAT_VERSION = 1 as const;
const EXPECTED_SAMPLE_RATE_HZ = 16_000;
const EXPECTED_FEATURE_DIM = 80;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const WHITESPACE_PATTERN = /\s/u;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F-\u009F]/u;
const LINE_SEPARATOR_PATTERN = /[\r\n\u2028\u2029]/u;
const SERIALIZER_DELIMITER_PATTERN = /[:#@]/u;

export type KeywordArtifactSource = "encoded_fixture" | "text2token_cli";

export interface KeywordModelMetadata {
  modelId: string;
  modelVersion: string;
  sampleRateHz: number;
  featureDim: number;
}

export interface CompileKeywordArtifactRequest {
  format: string;
  artifactVersion: string;
  source: KeywordArtifactSource;
  keywordId: string;
  encoded: string;
  displayId: string;
  boost?: number;
  threshold?: number;
  globalBoost: number;
  globalThreshold: number;
  model: KeywordModelMetadata;
  numTrailingBlanks: number;
  resetAfterDetection: boolean;
}

export interface KeywordArtifactManifest {
  formatVersion: typeof KEYWORD_FORMAT_VERSION;
  artifactVersion: string;
  source: KeywordArtifactSource;
  keywordId: string;
  model: KeywordModelMetadata;
  effectiveBoost: number;
  effectiveThreshold: number;
  numTrailingBlanks: number;
  resetAfterDetection: true;
}

export type KeywordArtifactFallbackReason =
  | "invalid_format"
  | "invalid_tuning"
  | "invalid_model_metadata"
  | "invalid_source"
  | "invalid_identifier"
  | "invalid_encoded_text"
  | "invalid_display_id"
  | "reset_after_detection_required";

export type CompileKeywordArtifactResult =
  | {
      status: "ready";
      artifact: string;
      manifest: KeywordArtifactManifest;
    }
  | {
      status: "fallback";
      fallback: "detector_disabled";
      reason: KeywordArtifactFallbackReason;
    };

function fallback(reason: KeywordArtifactFallbackReason): CompileKeywordArtifactResult {
  return {
    status: "fallback",
    fallback: "detector_disabled",
    reason,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    IDENTIFIER_PATTERN.test(value)
  );
}

function isValidDisplayId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    value === value.trim() &&
    !WHITESPACE_PATTERN.test(value) &&
    !CONTROL_CHARACTER_PATTERN.test(value) &&
    !LINE_SEPARATOR_PATTERN.test(value) &&
    !SERIALIZER_DELIMITER_PATTERN.test(value)
  );
}

function isValidKeywordArtifactSource(
  value: unknown,
): value is KeywordArtifactSource {
  return value === "encoded_fixture" || value === "text2token_cli";
}

function isValidEncodedText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    !CONTROL_CHARACTER_PATTERN.test(value) &&
    !LINE_SEPARATOR_PATTERN.test(value) &&
    !SERIALIZER_DELIMITER_PATTERN.test(value)
  );
}

function isValidBoost(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isValidThreshold(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0 && value <= 1;
}

function isValidModelMetadata(value: unknown): value is KeywordModelMetadata {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isValidIdentifier(value.modelId) &&
    isValidIdentifier(value.modelVersion) &&
    value.sampleRateHz === EXPECTED_SAMPLE_RATE_HZ &&
    value.featureDim === EXPECTED_FEATURE_DIM
  );
}

function cloneModelMetadata(model: KeywordModelMetadata): KeywordModelMetadata {
  return {
    modelId: model.modelId,
    modelVersion: model.modelVersion,
    sampleRateHz: model.sampleRateHz,
    featureDim: model.featureDim,
  };
}

export function compileKeywordArtifact(
  request: CompileKeywordArtifactRequest,
): CompileKeywordArtifactResult {
  try {
    const input = request as unknown;
    if (!isRecord(input) || input.format !== KEYWORD_FORMAT) {
      return fallback("invalid_format");
    }

    if (
      !isValidBoost(input.globalBoost) ||
      !isValidThreshold(input.globalThreshold)
    ) {
      return fallback("invalid_tuning");
    }

    const effectiveBoost =
      input.boost === undefined || input.boost === 0
        ? input.globalBoost
        : input.boost;
    const effectiveThreshold =
      input.threshold === undefined || input.threshold === 0
        ? input.globalThreshold
        : input.threshold;

    if (!isValidBoost(effectiveBoost) || !isValidThreshold(effectiveThreshold)) {
      return fallback("invalid_tuning");
    }

    const numTrailingBlanks = input.numTrailingBlanks;
    if (
      !isValidModelMetadata(input.model) ||
      !isFiniteNumber(numTrailingBlanks) ||
      !Number.isInteger(numTrailingBlanks) ||
      numTrailingBlanks < 0
    ) {
      return fallback("invalid_model_metadata");
    }

    if (!isValidKeywordArtifactSource(input.source)) {
      return fallback("invalid_source");
    }

    if (
      !isValidIdentifier(input.artifactVersion) ||
      !isValidIdentifier(input.keywordId)
    ) {
      return fallback("invalid_identifier");
    }

    if (!isValidEncodedText(input.encoded)) {
      return fallback("invalid_encoded_text");
    }

    if (!isValidDisplayId(input.displayId)) {
      return fallback("invalid_display_id");
    }

    if (input.resetAfterDetection !== true) {
      return fallback("reset_after_detection_required");
    }

    const model = cloneModelMetadata(input.model);
    const manifest: KeywordArtifactManifest = {
      formatVersion: KEYWORD_FORMAT_VERSION,
      artifactVersion: input.artifactVersion,
      source: input.source,
      keywordId: input.keywordId,
      model,
      effectiveBoost,
      effectiveThreshold,
      numTrailingBlanks,
      resetAfterDetection: true,
    };

    return {
      status: "ready",
      artifact: `${input.encoded} :${effectiveBoost} #${effectiveThreshold} @${input.displayId}`,
      manifest,
    };
  } catch {
    return fallback("invalid_format");
  }
}

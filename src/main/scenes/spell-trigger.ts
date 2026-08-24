export type TranscriptAttempt =
  | {
      readonly turnId: string;
      readonly status: "final";
      readonly transcript: string;
    }
  | {
      readonly turnId: string;
      readonly status: "partial";
      readonly transcript?: string;
    }
  | {
      readonly turnId: string;
      readonly status: "unavailable";
      readonly transcript?: string;
    };

export interface SpellDefinition {
  readonly spellId: string;
  readonly phrase: string;
}

export interface NormalizationOptions {
  readonly characterEquivalences?: Readonly<Record<string, string>>;
}

export type SpellTriggerIgnoreReason =
  | "partial_transcript"
  | "transcript_unavailable"
  | "not_exact_match"
  | "duplicate_turn";

export type SpellMatch =
  | {
      readonly matched: true;
      readonly spellId: string;
    }
  | {
      readonly matched: false;
      readonly reason: SpellTriggerIgnoreReason;
    };

export type SpellTriggerDecision =
  | {
      readonly decision: "trigger";
      readonly spellId: string;
      readonly turnId: string;
    }
  | {
      readonly decision: "ignore";
      readonly reason: SpellTriggerIgnoreReason;
      readonly turnId: string;
    };

export interface SpellTriggerGuard {
  evaluate(attempt: TranscriptAttempt): SpellTriggerDecision;
}

export type SpellCatalogErrorCode =
  | "empty_normalized_spell_phrase"
  | "normalized_spell_collision";

export class SpellCatalogError extends Error {
  readonly code: SpellCatalogErrorCode;

  constructor(code: SpellCatalogErrorCode) {
    super(code);
    this.name = "SpellCatalogError";
    this.code = code;
  }
}

const UNICODE_PUNCTUATION = /\p{P}/gu;

function applyCharacterEquivalences(
  value: string,
  options: NormalizationOptions,
): string {
  const equivalences = options.characterEquivalences;
  if (equivalences === undefined) {
    return value;
  }

  return Array.from(value, (character) =>
    Object.prototype.hasOwnProperty.call(equivalences, character)
      ? equivalences[character]
      : character,
  ).join("");
}

export function normalizeTranscript(
  transcript: string,
  options: NormalizationOptions = {},
): string {
  const widthNormalized = transcript.normalize("NFKC").trim();
  const equivalenceNormalized = applyCharacterEquivalences(
    widthNormalized,
    options,
  );

  return equivalenceNormalized.replace(UNICODE_PUNCTUATION, "").trim();
}

function normalizedSpellPhrase(
  spell: SpellDefinition,
  options: NormalizationOptions,
): string {
  const normalized = normalizeTranscript(spell.phrase, options);
  if (normalized.length === 0) {
    throw new SpellCatalogError("empty_normalized_spell_phrase");
  }
  return normalized;
}

export function matchExactSpell(
  attempt: TranscriptAttempt,
  spell: SpellDefinition,
  options: NormalizationOptions = {},
): SpellMatch {
  const normalizedPhrase = normalizedSpellPhrase(spell, options);

  if (attempt.status === "partial") {
    return { matched: false, reason: "partial_transcript" };
  }
  if (attempt.status === "unavailable") {
    return { matched: false, reason: "transcript_unavailable" };
  }

  return normalizeTranscript(attempt.transcript, options) === normalizedPhrase
    ? { matched: true, spellId: spell.spellId }
    : { matched: false, reason: "not_exact_match" };
}

export function createSpellTriggerGuard(
  spells: readonly SpellDefinition[],
  options: NormalizationOptions = {},
): SpellTriggerGuard {
  const catalog = new Map<string, string>();

  for (const spell of spells) {
    const normalizedPhrase = normalizedSpellPhrase(spell, options);
    if (catalog.has(normalizedPhrase)) {
      throw new SpellCatalogError("normalized_spell_collision");
    }
    catalog.set(normalizedPhrase, spell.spellId);
  }

  const consumedTurnIds = new Set<string>();

  return {
    evaluate(attempt): SpellTriggerDecision {
      if (consumedTurnIds.has(attempt.turnId)) {
        return {
          decision: "ignore",
          reason: "duplicate_turn",
          turnId: attempt.turnId,
        };
      }

      if (attempt.status === "partial") {
        return {
          decision: "ignore",
          reason: "partial_transcript",
          turnId: attempt.turnId,
        };
      }
      if (attempt.status === "unavailable") {
        return {
          decision: "ignore",
          reason: "transcript_unavailable",
          turnId: attempt.turnId,
        };
      }

      const spellId = catalog.get(normalizeTranscript(attempt.transcript, options));
      if (spellId === undefined) {
        return {
          decision: "ignore",
          reason: "not_exact_match",
          turnId: attempt.turnId,
        };
      }

      consumedTurnIds.add(attempt.turnId);
      return {
        decision: "trigger",
        spellId,
        turnId: attempt.turnId,
      };
    },
  };
}

export type MatchResult = SpellMatch;
export type MatchDecision = SpellTriggerDecision;
export type IgnoreReason = SpellTriggerIgnoreReason;

import { describe, expect, test } from "vitest";
import {
  createSpellTriggerGuard,
  matchExactSpell,
  normalizeTranscript,
  SpellCatalogError,
  type NormalizationOptions,
  type SpellDefinition,
  type SpellTriggerIgnoreReason,
  type SpellMatch,
  type TranscriptAttempt,
} from "../../../src/main/scenes/spell-trigger";

describe("normalizeTranscript", () => {
  test("applies NFKC width normalization, removes punctuation, trims, and preserves case and internal spacing", () => {
    expect(normalizeTranscript("  ＡＸ，Ｑ７！　Ｂ２  ")).toBe("AXQ7 B2");
    expect(normalizeTranscript("AbQ  7")).toBe("AbQ  7");
  });

  test("applies only caller-supplied explicit character equivalences", () => {
    const options: NormalizationOptions = {
      characterEquivalences: { "◇": "Q" },
    };

    expect(normalizeTranscript("AX◇7")).toBe("AX◇7");
    expect(normalizeTranscript("AX◇7", options)).toBe("AXQ7");
  });
});

describe("matchExactSpell", () => {
  const spell: SpellDefinition = {
    spellId: "spell-a",
    phrase: "AX 7",
  };

  test("matches a final transcript only when the normalized full transcript equals the spell", () => {
    expect(
      matchExactSpell(
        { turnId: "turn-exact", status: "final", transcript: "ＡＸ　７" },
        spell,
      ),
    ).toEqual({ matched: true, spellId: "spell-a" });
  });

  test("accepts the 20-case exact-match normalization corpus", () => {
    const positives = [
      "AX 7", " AX 7", "AX 7 ", "  AX 7  ", "ＡＸ ７",
      "AX, 7", "AX. 7", "AX 7!", "AX 7?", "AX: 7",
      "AX; 7", "(AX 7)", "[AX 7]", "‘AX 7’", "“AX 7”",
      "ＡＸ，　７", "ＡＸ。　７", "ＡＸ：　７", "ＡＸ；　７", "！AX 7！",
    ];

    expect(positives).toHaveLength(20);
    for (const [index, transcript] of positives.entries()) {
      expect(matchExactSpell({ turnId: `positive-${index}`, status: "final", transcript }, spell))
        .toEqual({ matched: true, spellId: "spell-a" });
    }
  });

  test("rejects the 30-case partial, similar, negated, and appended-text corpus", () => {
    const negatives = [
      "AX", "7", "AX7", "AX  7", "ax 7", "Ax 7", "AX 8", "BX 7", "AX Q",
      "NO AX 7", "not AX 7", "don't AX 7", "不要 AX 7", "AX 7 no", "AX 7 not",
      "please AX 7", "AX 7 please", "say AX 7", "AX 7 now", "now AX 7",
      "AX 7 Q", "Q AX 7", "AX 7 and continue", "AX 7 again", "AX 7 AX 7",
      "the AX 7", "AX-7", "AX/7", "AX_7", "AX ７ 追加",
    ];

    expect(negatives).toHaveLength(30);
    for (const [index, transcript] of negatives.entries()) {
      expect(matchExactSpell({ turnId: `negative-${index}`, status: "final", transcript }, spell))
        .toEqual({ matched: false, reason: "not_exact_match" });
    }
  });

  test.each([
    {
      label: "partial",
      attempt: {
        turnId: "turn-partial",
        status: "partial",
        transcript: "AX 7",
      },
      expected: { matched: false, reason: "partial_transcript" },
    },
    {
      label: "unavailable",
      attempt: { turnId: "turn-unavailable", status: "unavailable" },
      expected: { matched: false, reason: "transcript_unavailable" },
    },
  ] satisfies ReadonlyArray<{
    label: string;
    attempt: TranscriptAttempt;
    expected: SpellMatch;
  }>)("does not match a $label transcript", ({ attempt, expected }) => {
    expect(matchExactSpell(attempt, spell)).toEqual(expected);
  });

  test.each([
    ["prefix", "AX"],
    ["suffix", "AX 7 Q"],
    ["negation", "NO AX 7"],
    ["similar", "AX 8"],
  ])("rejects a final %s nonmatch without returning transcript data", (_label, transcript) => {
    const result = matchExactSpell(
      { turnId: "turn-negative", status: "final", transcript },
      spell,
    );

    expect(result).toEqual({ matched: false, reason: "not_exact_match" });
  });

  test("uses explicit equivalence during exact matching", () => {
    expect(
      matchExactSpell(
        {
          turnId: "turn-equivalence",
          status: "final",
          transcript: "AX◇7",
        },
        { spellId: "spell-equivalence", phrase: "AXQ7" },
        { characterEquivalences: { "◇": "Q" } },
      ),
    ).toEqual({ matched: true, spellId: "spell-equivalence" });
  });
});

describe("createSpellTriggerGuard", () => {
  const spell: SpellDefinition = {
    spellId: "spell-a",
    phrase: "AX 7",
  };

  test("consumes a triggering turn before a downstream failure can be retried", () => {
    const guard = createSpellTriggerGuard([spell]);
    const attempt: TranscriptAttempt = {
      turnId: "turn-failed-downstream",
      status: "final",
      transcript: "AX 7",
    };

    const first = guard.evaluate(attempt);
    expect(first).toEqual({
      decision: "trigger",
      spellId: "spell-a",
      turnId: "turn-failed-downstream",
    });

    let downstreamCalls = 0;
    try {
      if (first.decision === "trigger") {
        downstreamCalls += 1;
        throw new Error("synthetic_downstream_failure");
      }
    } catch {
      // The guard must not expose a release path after this simulated failure.
    }

    expect(downstreamCalls).toBe(1);
    expect(guard.evaluate(attempt)).toEqual({
      decision: "ignore",
      reason: "duplicate_turn",
      turnId: "turn-failed-downstream",
    });
  });

  test("does not consume partial or unavailable turns before a final transcript", () => {
    const guard = createSpellTriggerGuard([spell]);

    expect(
      guard.evaluate({
        turnId: "turn-after-partial",
        status: "partial",
        transcript: "AX 7",
      }),
    ).toEqual({
      decision: "ignore",
      reason: "partial_transcript",
      turnId: "turn-after-partial",
    });
    expect(
      guard.evaluate({
        turnId: "turn-after-partial",
        status: "final",
        transcript: "AX 7",
      }),
    ).toEqual({
      decision: "trigger",
      spellId: "spell-a",
      turnId: "turn-after-partial",
    });

    expect(
      guard.evaluate({
        turnId: "turn-after-unavailable",
        status: "unavailable",
      }),
    ).toEqual({
      decision: "ignore",
      reason: "transcript_unavailable",
      turnId: "turn-after-unavailable",
    });
    expect(
      guard.evaluate({
        turnId: "turn-after-unavailable",
        status: "final",
        transcript: "AX 7",
      }),
    ).toEqual({
      decision: "trigger",
      spellId: "spell-a",
      turnId: "turn-after-unavailable",
    });
  });

  test.each([
    {
      label: "partial transcript",
      attempt: {
        turnId: "turn-ignore-partial",
        status: "partial",
        transcript: "AX 7",
      },
      reason: "partial_transcript",
    },
    {
      label: "unavailable transcript",
      attempt: { turnId: "turn-ignore-unavailable", status: "unavailable" },
      reason: "transcript_unavailable",
    },
    {
      label: "non-exact final transcript",
      attempt: {
        turnId: "turn-ignore-nonmatch",
        status: "final",
        transcript: "AX 8",
      },
      reason: "not_exact_match",
    },
    {
      label: "duplicate turn",
      attempt: {
        turnId: "turn-ignore-duplicate",
        status: "final",
        transcript: "AX 7",
      },
      reason: "duplicate_turn",
    },
  ] satisfies ReadonlyArray<{
    label: string;
    attempt: TranscriptAttempt;
    reason: SpellTriggerIgnoreReason;
  }>)("includes the input turn ID in $label decisions", ({ attempt, reason }) => {
    const guard = createSpellTriggerGuard([spell]);
    if (reason === "duplicate_turn") {
      guard.evaluate(attempt);
    }

    expect(guard.evaluate(attempt)).toEqual({
      decision: "ignore",
      reason,
      turnId: attempt.turnId,
    });
  });

  test("allows the same spell to trigger on different turn IDs", () => {
    const guard = createSpellTriggerGuard([spell]);

    expect(
      guard.evaluate({
        turnId: "turn-one",
        status: "final",
        transcript: "AX 7",
      }),
    ).toEqual({ decision: "trigger", spellId: "spell-a", turnId: "turn-one" });
    expect(
      guard.evaluate({
        turnId: "turn-two",
        status: "final",
        transcript: "AX 7",
      }),
    ).toEqual({ decision: "trigger", spellId: "spell-a", turnId: "turn-two" });
  });

  test("rejects an empty normalized spell phrase with a stable metadata-only code", () => {
    let thrown: unknown;
    try {
      createSpellTriggerGuard([
        { spellId: "spell-empty", phrase: " ，！ " },
      ]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(SpellCatalogError);
    expect((thrown as SpellCatalogError).code).toBe("empty_normalized_spell_phrase");
    expect((thrown as Error).message).toBe("empty_normalized_spell_phrase");
    expect((thrown as Error).message).not.toContain("spell-empty");
  });

  test("rejects normalized catalog collisions without exposing either phrase", () => {
    let thrown: unknown;
    try {
      createSpellTriggerGuard([
        { spellId: "spell-width", phrase: "ＡＸ７" },
        { spellId: "spell-ascii", phrase: "AX7" },
      ]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(SpellCatalogError);
    expect((thrown as SpellCatalogError).code).toBe("normalized_spell_collision");
    expect((thrown as Error).message).toBe("normalized_spell_collision");
    expect((thrown as Error).message).not.toContain("AX7");
  });
});

export const syntheticKeywordCorpus = {
  // Synthetic future detector/corpus inputs; these are not detector evidence.
  expectedSequence: "fixture_token_a fixture_token_b",
  cases: [
    {
      caseId: "exact",
      sequence: "fixture_token_a fixture_token_b",
      expectedExactMatch: true,
    },
    { caseId: "truncated", sequence: "fixture_token_a", expectedExactMatch: false },
    {
      caseId: "reordered",
      sequence: "fixture_token_b fixture_token_a",
      expectedExactMatch: false,
    },
    {
      caseId: "extra",
      sequence: "fixture_token_a fixture_token_b fixture_token_c",
      expectedExactMatch: false,
    },
  ] as const,
} as const;

export type SyntheticKeywordCorpusCase =
  (typeof syntheticKeywordCorpus.cases)[number];

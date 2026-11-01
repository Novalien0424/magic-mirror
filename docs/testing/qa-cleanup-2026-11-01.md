# QA artifact cleanup — 2026-11-01

Owner request (2026-11-01 evening): clean up all test artifacts. Scope: every finished,
marked Phase 4 run under `.artifacts/phase4-qa` from the 10-30 evening, the 10-31 night QA
and the 11-01 evening Raven check (persona v23, `sleep_spells`). Static disposal, not new
acceptance; results already reported in the
[night journeys](user-journeys-2026-10-31.md), [PROGRESS](../../PROGRESS.md) and the
[11-01 audit](prd-audit-2026-11-01.md).

## Retained metadata

**276 finished runs: 151 exit 0, 125 exit 2**, 25,637 files. Their structured results
(`build.json`, `evidence.json`, `raven-results.json`, `output-volumes.json`: failed cases,
reasons, metrics, build hashes) are kept in
[compressed historical metadata](../archive/qa-results-before-cleanup-2026-11-01.json.gz)
(254,423 bytes; SHA-256 `94d59d3ba98c5619d5a276ce44f048ab2bf816ddf81ad9c495ed98af2f263843`;
gzip/JSON round trip passes; no credentials or transcript text). Not archived: screenshots,
profiles, persona/provenance files, synthetic fixture transcripts/summaries and launch logs.
Failures stay failures: provider rates and open defects remain in [TODO](../../TODO.md).

## Retained runs

- `2026-10-05T03-51-52-766Z` (unfinished marker) and `2026-10-17T10-12-54-520Z`,
  `2026-10-18T06-13-17-851Z` (no structured evidence): kept as in the
  [10-30 cleanup](repository-cleanup-2026-10-30.md).

Deletion uses `node scripts/qa-artifacts.mjs review <run> --report docs/testing/qa-cleanup-2026-11-01.md`
then `clean <run> --delete` for each exact run ID.

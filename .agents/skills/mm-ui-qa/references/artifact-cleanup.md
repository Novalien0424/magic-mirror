# Marked artifact cleanup

Repository implementation reference; installed code, current DECISIONS and focused contract tests outrank historical SDK/version observations. Follow AGENTS for execution policy.

## Ownership and cleanup

New Phase 4 runs receive `.qa-artifact.json` at exclusive directory creation.
The harness marks completion after Electron closes, including failed results.
Save the results and requested visual review findings in `docs/testing/<name>.md`
before marking a run reviewed. From the canonical checkout, use an exact run ID:

```powershell
node scripts/qa-artifacts.mjs review <run-id> --report docs/testing/<report>.md
node scripts/qa-artifacts.mjs clean <run-id>
node scripts/qa-artifacts.mjs clean <run-id> --delete
```

`clean` defaults to a dry run with the resolved root, file/byte counts and
report reference. Use `--delete` when task/session authorization covers cleanup.
It refuses unfinished/unreviewed runs, filesystem links, ownership/path
mismatches, or changed evidence/report since review. Review failed-run evidence
before disposal; pass status alone does not authorize deletion. A report edit
requires re-review. The checks prevent accidental scope mistakes, not malicious
concurrent filesystem changes; stop artifact writers before reviewing/cleaning.

No glob, force, arbitrary-root or legacy-adoption option exists. Unmarked older
runs and interrupted setup remain retained for separate investigation. Do not
hand-write markers to reclassify operator data or retry a policy-rejected
deletion through another mechanism. Markers describe ownership and review;
they do not override tool approval. Preserve the exact policy rejection in
the handoff if cleanup is denied.

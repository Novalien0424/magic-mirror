# Marked QA artifact cleanup

Phase 4's runner now exclusively creates each timestamp directory with an
ownership marker before generating fixtures. The marker becomes finished only
after Electron closes and records the exit code. Failed runs are eligible only
after their evidence has been reviewed, just like successful runs.

From the canonical checkout:

```powershell
node scripts/qa-artifacts.mjs review <run-id> --report docs/testing/<report>.md
node scripts/qa-artifacts.mjs clean <run-id>
node scripts/qa-artifacts.mjs clean <run-id> --delete
```

The review command binds a nonempty written report and a metadata-only tree
fingerprint to the marker. The default cleanup command reports the exact root,
file/byte counts, exit code and report without deleting. Explicit deletion
revalidates ownership, completion, report hash and unchanged inventory. Only
one exact timestamp run is accepted. Paths, parents and descendants must be
ordinary local directories/files; junctions, symlinks and hard-linked files
are rejected. Neighboring runs, operator user data and runtime deployment logs
are outside the command's scope. Artifact contents are not read for inventory.

This is an accidental-deletion guard, not a tamper-proof security boundary.
Keep artifact writers stopped during review/cleanup. Interrupted setup keeps
an unfinished marker and is retained. There is no auto-disposal on test exit,
forced cleanup or automatic adoption of older unmarked directories.

## Validation — Windows, 2026-09-10

Focused Node tests exercise real temporary directories and the actual CLI:
creation/completion/review, dry run, explicit deletion, preserved sibling,
failed/unfinished/unreviewed runs, unmarked/tampered ownership, invalid IDs,
existing-directory collision, changed report/evidence, and junction rejection.
No Electron test or app restart is needed for this filesystem-only change.

`npx vitest run tests/unit/qa-artifacts.test.ts tests/unit/phase4-qa-runner.test.ts`:
**exit 0, 21 tests / 2 files**. Both scripts pass `node --check`; diff whitespace
check passes. A read-only CLI dry run against older run
`2026-09-09T15-27-35-210Z` returned exit 1, `qa_artifact_marker_required`, as
expected. Temporary test fixtures were removed by test teardown.

The previously denied 12 profile QA runs and temporary review directory remain
unmarked and retained. This implementation does not relabel those denied
targets or route their deletion around tool policy. Their earlier evidence and
rejection are in [the profile delivery report](profile-console-2026-09-09.md).
New ownership markers make subsequent cleanup precise and reviewable; they
cannot grant permission that the tool layer denies.

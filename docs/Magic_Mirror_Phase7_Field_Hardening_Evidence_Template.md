---
artifact_kind: phase7-field-hardening-evidence-template
artifact_state: prep-only
phase_state: authorized/not-started
evidence_claim: none
phase_exit_claim: none
regression_claim: none
release_tag: none
---

# Phase 7 Field Hardening Evidence Template

This `prep-only` artifact defines empty metadata slots only. It contains no
executed evidence, result, demo, exit, regression, or release claim.

## Row contract

Each record is one metadata-only row with these fields, in this order:

`record | source | phase | build | config | environment | evidence_class | status | start | end | duration | sample | metric | unit | threshold | asset | hardware | network | operator | device | reason | evidence_path | hash | exit_code`

Use identifiers, enums, timestamps, durations, counts, numeric measurements,
paths, hashes, and numeric exit codes only. `operator` is a role/token, never a
person name; `reason` is an identifier, never a raw error. No field accepts
free-form content.

Allowed values:

- `environment`: `target_mac`, `windows_dev`, `synthetic_fixture`,
  `not_recorded`
- `evidence_class`: `none`, `real`, `deterministic`, `mock`
- `status`: `pending/not-executed`, `in_progress`, `blocked`, `mock_passed`,
  `real_passed`, `real_failed`

Generic status tokens `passed`, `failed`, `success`, and `verified` are
forbidden; use only the enumerated statuses above.

## Initial checklist

Every initial checklist row below is `evidence_class: none` and
`status: pending/not-executed`. Empty metadata fields remain unset until a
separate evidence record is authorized and executed.

| record | source | phase | environment | evidence_class | status | reason |
|---|---|---:|---|---|---|---|
| MUST-17 | traceability_matrix | 7 | not_recorded | none | pending/not-executed | prerequisite_pending |
| P7-D1 | independent_demo | 7 | not_recorded | none | pending/not-executed | prerequisite_pending |
| P7-D2 | independent_demo | 7 | not_recorded | none | pending/not-executed | prerequisite_pending |
| P7-D3 | independent_demo | 7 | not_recorded | none | pending/not-executed | prerequisite_pending |
| P7-D4 | independent_demo | 7 | not_recorded | none | pending/not-executed | prerequisite_pending |
| P7-D5 | independent_demo | 7 | not_recorded | none | pending/not-executed | prerequisite_pending |
| P7-D6 | independent_demo | 7 | not_recorded | none | pending/not-executed | prerequisite_pending |
| P7-D7 | independent_demo | 7 | not_recorded | none | pending/not-executed | prerequisite_pending |
| NFR-01 | nfr_baseline | 7 | not_recorded | none | pending/not-executed | prerequisite_pending |
| NFR-02 | nfr_baseline | 7 | not_recorded | none | pending/not-executed | prerequisite_pending |
| NFR-03 | nfr_baseline | 7 | not_recorded | none | pending/not-executed | prerequisite_pending |
| NFR-04 | nfr_baseline | 7 | not_recorded | none | pending/not-executed | prerequisite_pending |
| NFR-05 | nfr_baseline | 7 | not_recorded | none | pending/not-executed | prerequisite_pending |
| NFR-06 | nfr_baseline | 7 | not_recorded | none | pending/not-executed | prerequisite_pending |
| NFR-07 | nfr_baseline | 7 | not_recorded | none | pending/not-executed | prerequisite_pending |
| NFR-08 | nfr_baseline | 7 | not_recorded | none | pending/not-executed | prerequisite_pending |
| NFR-09 | nfr_baseline | 7 | not_recorded | none | pending/not-executed | prerequisite_pending |
| NFR-10 | nfr_baseline | 7 | not_recorded | none | pending/not-executed | prerequisite_pending |
| MAC-CHECKPOINT | dependency_only | 7 | not_recorded | none | pending/not-executed | predecessor_pending |

### MAC-CHECKPOINT dependencies

`MAC-CHECKPOINT` is dependency-only and is not a phase-exit record. Each
dependency is initially `evidence_class: none` and `status:
pending/not-executed`:

| dependency record | dependency | evidence_class | status |
|---|---|---|---|
| MAC-CHECKPOINT.signing | stable signing | none | pending/not-executed |
| MAC-CHECKPOINT.tcc-mic-camera | packaged TCC microphone/camera capture | none | pending/not-executed |
| MAC-CHECKPOINT.launchagent | sole LaunchAgent restart and clean quit | none | pending/not-executed |
| MAC-CHECKPOINT.offline-loop-30m | 30-minute OfflineLoop | none | pending/not-executed |
| MAC-CHECKPOINT.boots-10 | ten boots | none | pending/not-executed |
| MAC-CHECKPOINT.power-policy | power policy | none | pending/not-executed |

## False-pass rules

- `mock` evidence never satisfies phase exit.
- A `windows_dev` record never counts as target-Mac evidence.
- `pending/not-executed`, `blocked`, and `in_progress` are not pass claims.
- `real_passed` requires applicable real target/operator/device evidence,
  start and end timestamps, measurements, build and config references, and a
  hashed evidence path.
- This prep file is never edited into a results ledger. Results belong in a
  separately authorized metadata-only record.

## Privacy and evidence boundary

Prohibited content includes free-form user content, transcripts, audio,
memories, images, embeddings, private identifiers or context, credentials,
prompts, and raw errors. Use only metadata identifiers and the row contract;
never add credential fields or describe a storage mechanism.

Invariants 1–12 are future evidence constraints for this template, not
runtime compliance claims.

## Explicit non-goals

- No application, source, test, config, schema, or dependency edits.
- No runtime, test, device, network, or credential access.
- No evidence execution.
- No demo, exit, regression, phase, or release-tag claim.
- No `PROGRESS.md` or `DECISIONS.md` edits.
- No implementation plan artifact.

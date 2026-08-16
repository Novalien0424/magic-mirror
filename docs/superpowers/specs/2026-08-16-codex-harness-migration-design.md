# Magic Mirror Codex Harness Migration — Design

Date: 2026-08-16  
Branch: `phase0-foundation`  
Status: awaiting written-spec review

## Goal and boundaries

Move the repository workflow from the Claude-specific harness to a
repo-scoped Codex harness while leaving the Magic Mirror product contract
unchanged. The root Codex thread is the sole orchestrator and reviewer. It
dispatches all implementation, repository survey/research, and test work to
explicitly named `gpt-5.6-luna` agents at `max` reasoning effort. A reviewer
subagent is never created.

This is a harness/documentation migration only. It does not add application
features, change runtime model configuration, change dependencies, or alter
the product architecture. The existing `CLAUDE.md` and all seven files under
`.claude/skills/` are immutable source references: they must remain
byte-for-byte unchanged.

## Authority and precedence

The active order of authority after rollout is:

1. The user's current request and explicit Codex routing policy.
2. Root `AGENTS.md`, which codifies the root/worker boundary and dispatch
   contract.
3. The product sources: `docs/Magic_Mirror_PRD_v0.3.md`,
   `docs/Magic_Mirror_Tech_Spec_v0.3.md`,
   `docs/Magic_Mirror_Implementation_Plan_v0.3.md`, and
   `docs/Magic_Mirror_Stack_Adversarial_Review_2026-08-16.md`.
4. The migrated skills in `.agents/skills/`, which provide task triggers and
   operational guidance without changing those product sources.
5. `PROGRESS.md`, `DECISIONS.md`, and the ignored SDD ledger as the current
   process state and durable routing record.
6. `CLAUDE.md` and `.claude/skills/` as immutable historical/reference input,
   not as the active dispatch vocabulary.

The Codex policy explicitly supersedes the old Opus/reviewer instructions and
SDD ledger Rulings R3 and R4. It preserves R1 (in-place work on
`phase0-foundation`), R2 (the authoritative `handleSimulator` return shape),
and R5 (sequential execution of Tasks 2–5). The current position remains Task
2 next, and the prerequisite to upgrade development Node from 22.21.0 to
`>=22.22.2` or `>=24.15.0` before Task 3 remains in force.

Product source, safety invariants, and runtime model IDs outrank any
convenience wording in a skill. The harness model used to run workers is not a
Magic Mirror runtime model and must never be copied into `active.json`, source
code, or product configuration.

## Architecture and exact files

### Root control plane

Add or update the following project-scoped control files:

| File | Responsibility |
|---|---|
| `AGENTS.md` | State that the root thread only orchestrates and reviews; it does not implement, perform exploratory repository survey/research, or execute tests. Require explicit worker dispatch and make the user Codex policy supersede R3/R4. |
| `.codex/config.toml` | Backstop worker routing with `default_subagent_model = "gpt-5.6-luna"` and `default_subagent_reasoning_effort = "max"` under `[agents]`. This is a backstop, never a replacement for explicit dispatch arguments. |
| `.codex/agents/implementer.toml` | Project custom role for one bounded implementation unit; Luna/max, scoped writes, required invariant and evidence contract. |
| `.codex/agents/surveyor.toml` | Project custom read-only repository survey/research role; Luna/max, no file writes, cited findings and verified/unverified marking. |
| `.codex/agents/tester.toml` | Project custom validation role; Luna/max, owns test/validation execution and returns commands plus output as evidence. |

The three role files use the installed Codex custom-agent schema and declare
the same model and effort as the config backstop. Role files describe scope;
they do not silently select another model, grant extra write scope, or create a
review role. A dispatch may attach one role, but it must still pass
`model: "gpt-5.6-luna"` and `reasoning_effort: "max"` explicitly.

### Repo-scoped skills

Create exactly these seven directories under `.agents/skills/`; each contains
`SKILL.md` and `agents/openai.yaml`:

```text
.agents/skills/mm-phase-workflow/{SKILL.md,agents/openai.yaml}
.agents/skills/mm-invariants/{SKILL.md,agents/openai.yaml}
.agents/skills/mm-electron-foundation/{SKILL.md,agents/openai.yaml}
.agents/skills/mm-realtime-voice/{SKILL.md,agents/openai.yaml}
.agents/skills/mm-wake-word/{SKILL.md,agents/openai.yaml}
.agents/skills/mm-live2d-avatar/{SKILL.md,agents/openai.yaml}
.agents/skills/mm-face-identity/{SKILL.md,agents/openai.yaml}
```

Keep each skill's name, trigger intent, safety rules, product facts, version
pins, and dependencies. Translate only harness vocabulary: Claude/Opus
dispatches become Codex explicit worker dispatches; the main session becomes
the root Codex orchestrator/reviewer; and `.claude/skills` references become
`.agents/skills` references. `agents/openai.yaml` is UI metadata only
(`display_name`, `short_description`, and `default_prompt`); it must not be
used as a routing backdoor.

### Skill preservation matrix

| Skill | Class | Facts that must remain unchanged |
|---|---|---|
| `mm-phase-workflow` | Process | Phase order 0–7, 0.5–2 day unit template, mock-first path, one implementation unit per dispatch, failure-path test and Console increment, phase demos, and no phase advance when exit evidence fails. Replace its Opus worker and independent-review language with Luna/max implementation workers and root review. |
| `mm-invariants` | Process | All 12 canonical invariants: RAM-only transcript/audio/private context, verbal identity confirmation, Main-only guest IDs, clean profile switch, owner snapshot for extraction, control-turn exclusion, exact spell matching, one microphone owner, reasoned visible failures, degrade-not-gate, config-only model IDs with no substitution, and `safeStorage` credentials. |
| `mm-electron-foundation` | Domain | Electron 43.x, electron-vite 5, TypeScript/React, XState 5, `node:sqlite`, WAL, `safeStorage`/Keychain/DPAPI, Main-owned IPC and workers, TCC/kiosk/crash-recovery behavior, and the prohibition on `keytar`. |
| `mm-realtime-voice` | Domain | `@openai/agents` 0.16.0, `openai` 7.4.0, Realtime subpath and WebRTC contract, `gpt-realtime-2.1`, `gpt-live-transcribe`, `gpt-4o-mini-transcribe`, voices such as `marin`/`cedar`, `gpt-5.6-luna` and `gpt-5.6-terra` extractor tiers, snapshot boundaries, privacy flags, and session rollover rules. |
| `mm-wake-word` | Domain | `sherpa-onnx-node@1.13.5` or newer, `sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01`, `decibri@5.x`, the Python `sherpa-onnx==1.13.5` fallback, keyword encoding/tuning, and release/acquire microphone handoff. |
| `mm-live2d-avatar` | Domain | Official Cubism 5 SDK for Web R5, MotionSync R2, global `live2dcubismcore.js`, the analyser/RMS lip-sync-first path, actual-output-audio clock, state-gated motions, parameter ordering, and designer asset requirements. |
| `mm-face-identity` | Domain | OpenCV YuNet/SFace pair pinning: `opencv-python==4.14.0.94` with `face_detection_yunet_2023mar.onnx`, or `5.0.0.93` with `face_detection_yunet_2026may.onnx`; `face_recognition_sface_2021dec.onnx`; candidate-only matching, quality gates, enrollment persistence, rebuild/rollback, and camera/TCC degradation. |

The migration must not normalize, replace, or “modernize” these IDs or
dependencies. In particular, the `gpt-5.6-luna` worker route does not replace
the configured Realtime, transcription, extractor, wake, or face model IDs.

### Process records

Update these exact records as part of the migration:

- `DECISIONS.md`: add a newest-first ADR that names the Codex root as sole
  orchestrator/reviewer, requires Luna/max explicit dispatch, prohibits a
  reviewer subagent, and states that the user's policy supersedes R3/R4 while
  retaining R1/R2/R5.
- `PROGRESS.md`: retain Phase 0 Task 1 as done, Task 2 as the next action, the
  Node prerequisite before Task 3, and the existing evidence/risks. Add the
  harness migration state without changing application task status.
- `.superpowers/sdd/2026-08-16-phase0-foundation/progress.md`: because this
  path is ignored operational state, amend the rulings in place: mark R3/R4
  superseded by the user's Codex policy and restate R1/R2/R5. Do not rewrite
  the plan's task order or mark Task 2 complete.

Do not edit `CLAUDE.md`, any `.claude/skills/*/SKILL.md`, product source
documents, or application source as part of this migration.

## Agent data flow and dispatch contract

```text
User request
    |
    v
Root Codex thread (orchestrate + review only)
    |-- explicit survey/research spawn --> surveyor, Luna/max, read-only
    |-- explicit implementation spawn --> implementer, Luna/max, scoped writes
    `-- explicit test/validation spawn --> tester, Luna/max, evidence owner
             |
             v
       report, diff, and command output
             |
             v
Root review gate --> accept, request a scoped follow-up, or reject
                    --> update process records and phase decision
```

The root may read authoritative state and returned diffs/evidence for
orchestration and review, but it delegates exploratory repository survey,
external research, implementation, and all test execution. It does not make a
worker's role implicit from the request. Every worker dispatch envelope names:

- `model: "gpt-5.6-luna"` and `reasoning_effort: "max"`;
- exactly one role (`implementer`, `surveyor`, or `tester`);
- the bounded task, expected files, relevant migrated skill paths, and
  invariant IDs;
- whether the worker is read-only or what write scope is allowed; and
- the required evidence format (diff, primary-source URLs where research is
  requested, or complete command output for tests).

Workers do not create reviewer agents. A follow-up must preserve the same
explicit Luna/max routing and bounded scope. Missing custom-agent discovery
does not authorize a different model: use the explicit inline role prompt and
record the discovery limitation. Missing explicit model or effort is a
dispatch failure even when `.codex/config.toml` would supply a default.

## Safety and error handling

- Treat `CLAUDE.md` and `.claude/skills/` as immutable inputs. Capture hashes
  before migration and compare them after migration; any byte change fails the
  rollout.
- Keep product privacy and identity invariants in every implementation/test
  prompt. Migration docs, reports, and telemetry examples must contain only
  metadata; never place real transcripts, audio, memory values, private
  context, credentials, images, or embeddings in an artifact.
- The surveyor is read-only. An attempted write is a role failure, not a
  reason to widen its scope. The tester may create only explicitly scoped
  validation artifacts and must not alter application behavior.
- Reject malformed skill frontmatter, `agents/openai.yaml`, TOML, or stale
  role metadata before discovery. Do not silently fall back to a different
  model, a legacy Claude dispatch, or an independent reviewer.
- The stale-vocabulary scan covers active migrated skills, `AGENTS.md`,
  `.codex/`, and changed process records. It excludes the immutable legacy
  source and this migration design, where provenance terms are intentionally
  named. Active files must not contain Claude-only paths, Opus model
  dispatches, Claude Agent-tool instructions, or equivalent legacy routing
  terms.
- A failed local discovery probe is visible as a validation result with a
  reason. Static validation and explicit dispatch remain the gate; no feature
  code is added to mask an environment limitation.

## Validation and testing

Run the migration and validation one skill at a time so a failure identifies a
single source/target pair. For each target skill:

1. Compare the target against its original for preserved names, triggers,
   product facts, model IDs, dependency pins, and invariant references.
2. Run the `skill-creator` `quick_validate.py` check against the skill folder.
   Validate frontmatter and naming rules, then parse `agents/openai.yaml` and
   the role/config TOML with strict parsers.
3. Run the stale Claude-only vocabulary scan over the active migration files.
4. Verify Codex discovers the target skill in a clean local prompt where the
   environment permits it; otherwise record the exact limitation and retain
   the static evidence.

The two process skills receive behavior tests with a deliberate RED baseline
and a GREEN migrated run:

- `mm-phase-workflow`: a phase-task prompt must produce one bounded unit,
  mock-first and failure-path requirements, explicit Luna/max worker routing,
  and root-owned review, with no reviewer spawn.
- `mm-invariants`: an implementation/test prompt must carry the canonical
  invariant checklist and reject transcript persistence, guest-ID leakage,
  silent fallback, model substitution, and microphone ownership violations.

The five domain skills (`mm-electron-foundation`, `mm-realtime-voice`,
`mm-wake-word`, `mm-live2d-avatar`, and `mm-face-identity`) each receive:

- a positive trigger prompt and an unrelated negative trigger prompt;
- a retrieval test proving the target skill is selected and its relevant
  section is loaded; and
- an application forward test using a fresh Luna/max worker that applies the
  retrieved guidance to a small, non-feature task while preserving the pinned
  IDs/dependencies and safety rules.

After the skill-level checks, an explicitly spawned Luna/max tester runs
`npm run typecheck` and `npm test` and returns the complete output. The root
reviews that evidence but does not execute the commands itself. The migration
must leave the existing Phase 0 application tests semantically unchanged.

## Rollout order

1. Freeze and hash `CLAUDE.md` and all seven `.claude` skill files; record the
   immutable-source check.
2. Add root `AGENTS.md`, `.codex/config.toml`, and the three project custom
   agent definitions. Validate their model/effort declarations.
3. Migrate `mm-phase-workflow`, then `mm-invariants`, validating each RED/GREEN
   process behavior before moving on.
4. Migrate the five domain skills individually in the order listed in the
   matrix, running trigger, retrieval, and application forward tests after
   each one.
5. Update `DECISIONS.md`, `PROGRESS.md`, and the ignored SDD ledger with the
   routing supersession while preserving R1/R2/R5, Task 2, and the Node
   prerequisite.
6. Run stale-term, YAML/TOML, discovery, and immutable-source checks, then
   have the Luna/max tester run the repository typecheck and test suite.
7. Root reviews all artifacts and evidence, records any local discovery
   limitation, and activates the migrated `.agents/skills` path. No original
   Claude file is deleted or rewritten.

## Out of scope

- Any Electron, renderer, worker, database, IPC, UI, model-runtime, or test
  implementation change beyond harness validation.
- Changing PRD/Tech Spec/Implementation Plan product decisions or any runtime
  model/dependency pin.
- Deleting, reformatting, or “cleaning up” `CLAUDE.md` or the original
  `.claude/skills/` files.
- Creating a reviewer subagent, changing phase task order, changing current
  Task 2 status, or removing the Node prerequisite before Task 3.
- Adding global user skills, external plugins, or an application fallback for
  Codex discovery.

## Acceptance criteria

- All seven named `.agents/skills` directories exist, and each has a valid
  `SKILL.md` plus `agents/openai.yaml` with matching Codex metadata.
- The migrated skills retain the product model IDs, dependency/version pins,
  safety invariants, phase workflow, and domain behavior listed above; only
  harness vocabulary is translated.
- `AGENTS.md` makes the root thread the only orchestrator/reviewer and forbids
  root implementation, repository survey/research, and test execution.
- `.codex/config.toml` and all three custom roles declare Luna/max, while every
  actual worker dispatch explicitly supplies Luna/max. No reviewer role exists.
- `DECISIONS.md`, `PROGRESS.md`, and the ignored SDD ledger explicitly state
  that the user's Codex policy supersedes R3/R4 and preserve R1/R2/R5, Task 2,
  and the Node prerequisite before Task 3.
- Every skill passes individual validation; both process skills pass RED/GREEN
  behavior evaluation; all five domain skills pass positive/negative trigger,
  retrieval, and application forward tests.
- YAML/TOML parsing, stale-term scanning, local discovery/routing checks where
  available, `npm run typecheck`, and `npm test` pass with evidence from the
  Luna/max tester.
- Byte comparison proves `CLAUDE.md` and every original `.claude` skill are
  unchanged. `git status` shows no application feature code or unrelated file
  changes.
- A final root review finds no unresolved placeholders, ownership conflicts,
  contradictory precedence, ambiguous rollout step, or scope expansion.

## Final self-review

The design names every required output and preserved source, separates the
Codex worker model from product runtime models, gives the root/worker data
flow and failure behavior, and assigns all validation to an explicitly
routed Luna/max tester. It keeps R1/R2/R5 and the current Task 2/Node gate,
supersedes only R3/R4, prohibits a reviewer subagent, and makes the immutable
`CLAUDE.md` requirement a hard acceptance gate. No application feature work is
implied.

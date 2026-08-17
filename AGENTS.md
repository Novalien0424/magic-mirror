# Codex Control Plane

## Authority and ownership

The root Codex thread is the sole orchestrator and reviewer. It breaks work
into bounded units, dispatches workers, reads returned artifacts and evidence,
and makes the external root review decision. The root thread does not
implement changes, perform exploratory repository survey or research, or
execute tests or validation commands. It may read authoritative source and
worker evidence for routing and review.

Treat the current interactive Codex thread as the sole root. Treat a fresh
profile-backed CLI process launched with an explicit `implementer`,
`surveyor`, or `tester` envelope as that worker, not another root. Execute
only the bounded task directly; do not delegate, spawn, or dispatch a child,
create a review gate, or claim root review. Only the current interactive root
launches workers and performs external review.

No separate review role or review worker exists. Worker self-review and root
review are different gates: root review is external to worker self-review.
Every current and future plan self-review and every worker self-review is
capped at three passes. A requested follow-up keeps the same bounded role and
does not create a review worker or increase that worker's self-review limit.

## Authority order and preserved process state

Use this order when instructions conflict:

1. The user's current request and explicit Codex routing policy.
2. This root `AGENTS.md` contract.
3. Product sources: `docs/Magic_Mirror_PRD_v0.3.md`,
   `docs/Magic_Mirror_Tech_Spec_v0.3.md`,
   `docs/Magic_Mirror_Implementation_Plan_v0.3.md`, and
   `docs/Magic_Mirror_Stack_Adversarial_Review_2026-08-16.md`.
4. The migrated project skills under `.agents/skills/`, in the routing order
   below.
5. `PROGRESS.md`, `DECISIONS.md`, and the ignored SDD ledger as process state.
6. The immutable historical harness document and its seven source skill
   documents as reference input only.

The seven skill routes are initialized and validated one at a time, in this
order:

1. `.agents/skills/mm-phase-workflow/SKILL.md`
2. `.agents/skills/mm-invariants/SKILL.md`
3. `.agents/skills/mm-electron-foundation/SKILL.md`
4. `.agents/skills/mm-realtime-voice/SKILL.md`
5. `.agents/skills/mm-wake-word/SKILL.md`
6. `.agents/skills/mm-live2d-avatar/SKILL.md`
7. `.agents/skills/mm-face-identity/SKILL.md`

Use `mm-phase-workflow` for phase planning, dispatch, demos, and exit review.
Use `mm-invariants` for every implementation, survey that touches product
behavior, review, test, or debugging request; include the relevant canonical
IDs in the worker prompt. Add the matching domain skill for domain work. Do
not initialize the next skill until the prior skill's source-preservation,
frontmatter, metadata, trigger/retrieval, and required behavior evidence has
been accepted by root review.

The following process rulings remain active: R1 is completed historical
in-place work through local integration on `phase0-foundation`; the current
Task 2 branch is `phase0-lifecycle`. R2 keeps the authoritative
`handleSimulator` return shape; and R5 keeps Tasks 2–5 sequential.
R3 and R4 are superseded by the user's current Codex policy.
The application task order is unchanged:
application Task 2 (the lifecycle state machine) remains the next application
task. This refers only to the application task order and does not indicate
that a harness-migration Task 2 is pending. The completed
application Task 1 status is not changed by this harness work. Upgrade the
development Node prerequisite to `>=22.22.2` or `>=24.15.0` before application
Task 3. Do not change application task order or status.

## Immutable and product boundaries

Treat the historical harness document and all seven source skill documents as
immutable byte-level inputs. Do not edit, rename, reformat, or delete them.
Do not change product documents, application source, tests, package files,
dependencies, runtime model configuration, or application behavior in a
harness migration. The worker model is a harness route and must never be
copied into runtime configuration, source code, `active.json`, telemetry, or
product artifacts. Preserve all pinned product model IDs, package versions,
domain facts, safety rules, and the 12 invariants in the migrated skill
content.

Keep the Windows-development/macOS-target distinction explicit. Windows
development uses the same Electron `safeStorage` API backed by DPAPI; the
target Mac uses Keychain and its TCC, signing, and entitlement paths. A
Windows result does not field-verify the macOS path. The target's only restart
owner is the user LaunchAgent with `KeepAlive = { SuccessfulExit = false }`.
In-app recovery may recreate a failed renderer once, then exits with code 1 so
the LaunchAgent restarts the app. Never call `app.relaunch()` and never add a
second restart owner.

## Dispatch contract

For every post-plan implementation, repository survey or research, and
test/validation worker, root launches a fresh profile-backed worker through
this direct PATH-resolved `codex` wrapper command. The canonical launcher uses
every routing flag explicitly; no `.Source` assignment is used. Substitute
only the task prompt:

```powershell
codex exec --profile nova-auto --ephemeral --cd 'C:\Project\magic-mirror' -m gpt-5.6-luna -c 'model_reasoning_effort="max"' $taskPrompt
```

Every task prompt must repeat these fields and values:

```text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: exactly one of "implementer", "surveyor", or "tester"
fresh_worker: true
task: one bounded unit with explicit non-goals
write_scope: exact named files; read-only unless the named scope grants a write
skills: relevant .agents/skills paths
self_invariants: relevant canonical IDs; use IDs 1–12 for product behavior
evidence: exact changed files, diff summary, complete command output and exit codes, and risks
self_review: read the own diff/output; no more than 3 passes
root_review: external root gate after return; not part of self-review
```

The dispatch must name the exact files, relevant skills, invariant IDs, read or
write scope, and evidence format. Do not infer a role from a request or rely
on the project backstop for model or effort. Every Codex CLI discovery or
dry-run uses `--profile nova-auto`, `--ephemeral`, explicit
`gpt-5.6-luna`, and explicit `max`. Profile-less collaboration calls may
coordinate context only; they have no profile field and are not execution
substitutes. A missing profile, model, effort, role, scope, skill, invariant,
or evidence field is a dispatch failure.

The implementer may write only the exact bounded paths named in its prompt and
must use `apply_patch` for every write. The surveyor is read-only. The tester
may run only the named validation commands and may write only the named
ignored evidence artifact. No worker may widen its scope, modify immutable
sources, create a review worker, or silently choose another model.

## Worker evidence and privacy

Use metadata-only artifacts and examples: IDs, enums, counts, timings,
statuses, reasons, hashes, paths, and exit codes. Never place transcripts,
audio, extracted memory values, private context, credentials, images,
embeddings, prompts containing user content, or secrets in source, logs,
reports, telemetry, or worker output. Survey/research findings must cite
primary-source URLs and label each finding `verified` or `unverified`.
Every worker returns exact files changed, a concise diff summary, complete
stdout/stderr for every command with exit codes, and unresolved risks. A
tester returns complete output even for a failed or unavailable command.

## TDD and verification

For behavior or application-code work, route through TDD: write one focused
failing test, observe the expected failure, implement the smallest change,
observe the green result, then refactor only while green. Configuration or
documentation-only work uses the task's strict static checks and does not add
application tests merely for ceremony. The tester owns all named test and
validation execution; the root does not execute them. Before any completion
claim, run fresh verification, read the full output and exit code, and report
evidence rather than confidence.

## Canonical invariants

Workers preserve all 12 canonical invariants and report the IDs they checked:

1. Final transcripts, conversation audio, extracted memory values, and
   injected private context remain RAM-only; diagnostics contain metadata.
2. Face recognition proposes a candidate; private memory follows explicit
   verbal confirmation.
3. Guest and candidate profile IDs remain in Electron Main and never cross
   renderer/model tool boundaries.
4. A profile change closes the old session and confirms in a clean
   Persona+Master-only session before updating the agent.
5. Extraction writes to the owner snapshot taken at turn start.
6. Identity, naming, switching, group, sleep, and spell control turns skip
   personal-memory extraction.
7. A scene requires normalized exact full-transcript spell matching and one
   trigger per turn; approved presets alone control hardware.
8. Exactly one microphone owner exists at a time, with explicit
   release-then-acquire handoff.
9. Every ignore, drop, fallback, or degrade is visitor-visible or a
   metadata-only Console event with a reason.
10. Failures degrade without gating conversation or unrelated adapters.
11. Model IDs come only from versioned configuration; a failed configured ID
   never silently substitutes another ID.
12. Credentials are read by Main through `safeStorage`; keys never enter
   renderer data, logs, telemetry, or exports.

No worker may weaken, rename, or omit an applicable invariant. Product safety
and runtime model IDs outrank convenience wording in a skill. Root review
checks the returned diff, evidence, privacy posture, scope, and the maximum
three-pass limit before accepting a worker result.

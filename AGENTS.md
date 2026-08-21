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
in-place work through local integration on `phase0-foundation`; application
Task 2 (the lifecycle state machine) is completed, reviewed, and locally
integrated at `a7d74b14771de4f527762c30171ad2e68fc3d985`; `phase0-lifecycle`
was deleted. R2 keeps the authoritative `handleSimulator` return shape; and
R5 keeps Tasks 3–5 sequential. R3 and R4 are superseded by the user's current
Codex policy. Application Task 3 (ConfigService + credentials) is completed,
corrected, integrated at implementation commit `0270686` with
correction/integration tip `835c92d`, and pushed on `main`; application Task 4
(metadata-only telemetry) is completed, root-reviewed, integrated, and pushed
at `dca1327`; application Task 5 (SQLite initialization and migration baseline)
is accepted, root-reviewed, integrated, and pushed on `main` at `a8f0355`, with
32 focused tests, 145 total tests, and Node/web typecheck plus Electron Vite
build green. Application Task 6 (Main-owned module registry plus deterministic
mocks) is accepted, root-reviewed, implemented, and pushed on `main` at
`5b95a94`, with 16 focused tests, 161 total tests, and Node/web typecheck plus
Electron Vite build green. Its selected design is a runtime-exhaustive Main
registry, injected closed-outcome adapters, separate deterministic mocks,
stable metadata-only results/events, informational missing-adapter handling,
explicit `eventDelivery` values `emitted|failed`, no retry or sibling gate,
and no boot/IPC/UI/model resolver. The Task 6 plan's static gate commit was
`83be86b` on `phase0-modules`; its application/test scope was
`tests/unit/module-registry.test.ts`, `src/main/module-registry.ts`, and
`src/main/module-mocks.ts`. Application Task 7's accepted plan is recorded at
`6214b6c`; its accepted implementation is pushed on `phase0-model-settings` at
`5e24bdc`, with 7 focused tests, 168 total tests, Node/web typecheck plus
Electron Vite build green, both negative runtime-model/fallback scans
successful, and no OpenAI or `.env` requirement. Task 8 (boot wiring, IPC,
Mirror UI, and OfflineLoop) is next; Tasks 9/10 retain Console UI and
demos/records/exit ownership. This refers only to application task order and
does not indicate that a harness-migration Task 2 is pending. The completed
application Task 1 status is not changed by this harness work. No user setup is
required for Task 6. Development Node `v24.19.0` satisfies the prerequisite
of `>=22.22.2` or `>=24.15.0`. Do not change application task order or status.

Active efficiency ruling: for this nonindustrial project, the root uses the
fewest bounded fresh-worker gates consistent with strict TDD, tester-owned
validation, privacy/invariants, and external root review. Avoid duplicate
surveys, separate review workers, ceremonial tests, duplicate validation, and
PR bureaucracy. Naturally coupled behavior within one bounded unit may share
a test-write/implementation/validation sequence. This does not relax any
mandatory authority, role, profile, model, effort, scope, evidence, tester-
ownership, privacy/invariant, or external-root-review requirement.

The user-owned `scripts/install-node-lts.ps1` remains untouched. `.env`
credential presence is recorded only as ignored metadata; its content and
value are never read, and process records must not claim that its value was
inspected. The customizable wake word remains a Phase 2 requirement and later
requires keyword artifact generation plus tuning evidence.

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
target Mac uses Keychain and its TCC, signing, and entitlement paths. Windows
results do not field-verify target macOS Keychain/TCC/signing/entitlements/
packaged-worker/LaunchAgent paths. The target's only restart owner is the user
LaunchAgent with `KeepAlive = { SuccessfulExit = false }`.
In-app recovery may recreate a failed renderer once, then exits with code 1 so
the LaunchAgent restarts the app. Never call `app.relaunch()` and never add a
second restart owner.

## Dispatch contract

For every post-plan implementation, repository survey or research, and
test/validation worker, the interactive root uses
`scripts/invoke-codex-worker.ps1`, which resolves `codex` from PATH unless its
test-only `-CodexCommandPath` seam is supplied. PowerShell 7 (`pwsh`) is the
required outer host for this launcher; Windows PowerShell 5.1
(`powershell.exe`) is not a supported outer host because its parameter binder
can fail before the launcher's metadata preflight. The root writes the prompt
to a temporary file and supplies its path with `-PromptPath`; the launcher
prepends the exact role-specific H6 worker-context preamble (CRLF UTF-8
without a BOM), then appends the original prompt bytes unchanged after the
`--- BEGIN ORIGINAL PROMPT ---` delimiter and streams the combined bytes to
Codex stdin, never to argv. If launcher entry sees the exact inherited
`MIRROR_CODEX_WORKER_ACTIVE=1` sentinel, it exits 2 with
`codex_worker_launcher stage=preflight status=failed reason=recursive_invocation`
before reading or launching Codex; only the Codex child environment receives
the sentinel. The H6 preamble carries, in fixed order, global
`subagent-stop`, quiet reads, `read_scope_enforcement: "exact_only"`,
`source_body_output: "forbidden_unless_evidence_requires"`,
`terminal_read_output: "metadata_only"`,
`repository_wide_discovery: "forbidden"`, fixed
`first_write_deadline_seconds: 420`, fixed
`post_write_idle_deadline_seconds: 120`, and
`max_read_output_lines: 200`. Workers read only exact targeted paths; broad
discovery and source/skill bodies are suppressed unless exact evidence
requires a bounded excerpt.

The launcher passes documented Codex `--json` immediately before the final
stdin `-`. It captures raw stdout and stderr only for a combined raw byte cap;
neither raw stream is forwarded. It parses bounded UTF-8 JSONL and pins only
the local compatibility fields `type: "item.completed"` plus
`item.type: "file_change"` for an implementer write, and
`type: "item.completed"` plus `item.type: "agent_message"` with string
`item.text` for the final message. These event fields are the locally tested
Codex 0.148.0 compatibility contract, not an official universal schema
guarantee; Codex `--json` itself is documented. Valid progress, file-change,
and stderr payloads remain suppressed. After a zero-exit child and valid
completed protocol, only the latest nonempty agent message is written once to
parent stdout without framing or a newline. Malformed/non-object/nonconforming
JSONL exits 2 with
`codex_worker_launcher stage=protocol status=failed reason=invalid_jsonl`;
zero-exit output without a nonempty final message uses
`codex_worker_launcher stage=protocol status=failed reason=missing_final_message`.
Implementers enforce the structured first-write deadline before the first
file-change event, then arm/reset the post-write idle deadline on valid events;
surveyor and tester runs have neither deadline. Human `patch: completed` lines
never satisfy first-write. Live deadline, output, and supervision failures
terminate and confirm the exact descendant process tree, using
`tree_termination_failed` when confirmation fails. Post-exit protocol failures
report the stable `invalid_jsonl` or `missing_final_message` markers without
inventing tree evidence. The output cap marker remains
`codex_worker_launcher stage=output status=failed reason=limit_exceeded`, and
post-write expiry is
`codex_worker_launcher stage=post_write status=failed reason=deadline_exceeded`.
These are context and execution bounds, not a claim that advice can force
model completion. Use this one compact canonical invocation from the
repository root:

```powershell
pwsh -NoLogo -NoProfile -NonInteractive -File scripts/invoke-codex-worker.ps1 -Role <role> -PromptPath <path> -TimeoutSeconds 600 -MaxOutputBytes 4194304
```

The launcher pins this exact child argv, in this order; documented `--json`
immediately precedes the final `-`, which selects stdin for the prompt:

```text
exec --profile nova-auto --ephemeral --cd C:\Project\magic-mirror -m gpt-5.6-luna -c model_reasoning_effort="max" --json -
```

The bounded H6 worker harness uses three separate PowerShell command boundaries for prompt creation, launcher invocation, and exact prompt cleanup.
Create a temporary UTF-8 file outside the repository. Pass its exact resolved path to the launcher; use the exact resolved path only after the worker completes for exact prompt cleanup.
Never combine prompt creation, launcher invocation, and prompt cleanup in one shell expression.
An already-launched worker executes directly and must not recursively invoke Codex or the launcher.
Read only targeted files and required skill sections.
Do not dump unrelated source or skill content or flood worker output. Source
and skill bodies remain suppressed unless exact evidence requires them.
Keep source/skill reads separate from validation commands; never combine source or skill dumps with validation in one shell command. Returned validation evidence still includes complete stdout/stderr and exit codes for the named commands.
Tester workers include complete stdout/stderr and exit codes for every named
command in the final agent message so the H6 launcher can forward that evidence
without forwarding raw process streams. The launcher captures at most the
combined raw byte cap for stdout and stderr (`-MaxOutputBytes`) and uses
metadata-only markers; timeout and output-limit failures exit 2:
`codex_worker_launcher stage=timeout status=failed reason=deadline_exceeded`
and `codex_worker_launcher stage=output status=failed reason=limit_exceeded`.
It terminates and confirms the exact descendant process tree before reporting
either failure.

Do not use JavaScript template literals, shell command reconstruction, or a
prompt argument. Every CLI discovery or dry-run still carries
`--profile nova-auto`, `--ephemeral`, `-m gpt-5.6-luna`, and
`-c model_reasoning_effort="max"` through this launcher. Preserve the literal
Windows repository path `C:\Project\magic-mirror`.

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

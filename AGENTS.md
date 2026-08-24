# Codex Control Plane

## Authority and ownership

The interactive root Codex thread is the sole orchestrator and external
reviewer. It breaks work into bounded units, dispatches workers, reads their
artifacts and evidence, and makes the root acceptance decision. The root does
not implement changes, perform exploratory repository survey or research, or
execute tests or validation commands.

A fresh profile-backed CLI process launched with an explicit
`implementer`, `surveyor`, or `tester` envelope is a worker, not another root.
It executes only its bounded task: no delegation, recursion, child worker,
review worker, review gate, or root-review claim. Worker self-review and root
review are separate gates; every worker self-review and every root plan
self-review are capped at three passes, and a follow-up keeps the same role and
cap.

## Authority order

When instructions conflict, use this order:

1. The user's current request and explicit Codex routing policy.
2. This root contract.
3. Product sources: `docs/Magic_Mirror_PRD_v0.3.md`,
   `docs/Magic_Mirror_Tech_Spec_v0.3.md`,
   `docs/Magic_Mirror_Implementation_Plan_v0.3.md`, and
   `docs/Magic_Mirror_Stack_Adversarial_Review_2026-08-16.md`, except that the
   dated personal-build credential ruling recorded in `DECISIONS.md` and
   mirrored below supersedes conflicting credential-provisioning wording for
   this build.
4. The migrated project skills under `.agents/skills/`, loaded only when
   relevant to the bounded unit and subject to the same personal-build
   credential ruling.
5. `PROGRESS.md`, `DECISIONS.md`, and the ignored SDD ledger as process state.
6. The immutable historical harness and its seven source-skill documents as
   reference input only.

Detailed ledger ownership belongs to `PROGRESS.md`; durable rulings belong to
`DECISIONS.md`. Do not copy their long historical narrative into this file.

## Skill routes, in order

1. `mm-phase-workflow`: phase planning, bounded slicing and dispatch,
   execution, demos, and phase-exit decisions.
2. `mm-invariants`: every implementation, review, test, debugging task, or
   behavior-touching survey; name only the applicable canonical IDs.
3. `mm-electron-foundation`: Electron Main/lifecycle, windows, IPC, SQLite,
   config, credentials, auto-start, crash recovery, or worker spawning.
4. `mm-realtime-voice`: Agents SDK RealtimeSession, WebRTC voice, ephemeral
   credentials, transcription, barge-in, rollover, `updateAgent`, or the
   Responses memory extractor.
5. `mm-wake-word`: sherpa-onnx Chinese wake word, keyword encoding, capture,
   false-wake tuning, or wake-to-Realtime microphone handoff.
6. `mm-live2d-avatar`: Live2D/Cubism, MotionSync, actual-output-audio lip
   sync, avatar state/motion, Web Audio, or designer assets.
7. `mm-face-identity`: YuNet/SFace detection and embeddings, candidate
   matching, enrollment quality, rebuild/rollback, or Python camera access.

Migration or revalidation of the seven skill routes proceeds in this listed
order. The next skill is not accepted until root accepts source-preservation,
frontmatter/metadata, trigger/retrieval, and required-behavior evidence for the
prior one.

Load the phase route first for phase work, the invariant route for all product
behavior work, and then the one matching domain route. Before every worker
launch, read [`.agents/H6_WORKER_PROTOCOL.md`](.agents/H6_WORKER_PROTOCOL.md)
fully. The reference is conditional launcher detail, not a relaxation of this
contract.

## Current process checkpoint

- Branch: `phase1-realtime-voice`.
- Phase 0 is accepted and tagged `phase0-v0.3.1`.
- P1-U1 through P1-U7 are accepted; the U7 tip is `426f52c`.
- U8-A is accepted/pushed at `fd78a28`.
- U8-B deterministic engineering is accepted/pushed at `d1d5364`.
- The fresh U8-B gate recorded `49/49` files and `570/570` tests, plus node
  and web typechecks, the Electron Vite build, and diff check exit `0`.
- P1-U9 credential-source closure is accepted in product commit `b246521`;
  focused validation recorded `5/5` and `npm run typecheck:node` exit `0`.
- P1-D3/D4/D6 are deterministic `mock_passed`; P1-D1/D2/D5 remain
  `real-demo not_executed`.
- Phase 1 exit/tag is not accepted. No target-Mac, provider, device, or
  operator evidence is claimed. Official phase order, runtime integration,
  demos, exit decisions, regression, release tags, and phase-status promotion
  remain sequential; Phases 2–7 have not started. The authorized prep-only
  lanes below do not count as phase starts or phase-status promotion.

## Pre-Phase-1 prep authorization — 2026-08-24

The user explicitly authorized prep-only parallel work for Phases 2, 3, 4,
and 7 before Phase 1 exits. This is a narrow preparation exception and does
not reorder or start a phase. The official order remains `0 Foundation/Console
-> 1 Realtime Voice -> 2 Wake Lifecycle -> 3 Avatar/Audio -> 4 Scenes ->
5 Identity/Profiles -> 6 Memory -> 7 Field Hardening`; runtime integration,
demos, exit decisions, regression, release tags, and phase-status promotion
remain sequential.

A prep-only unit must be explicitly labeled `prep-only`, use an exact named
read/write scope, and produce only isolated synthetic/metadata-only artifacts.
It may not perform runtime wiring, IPC/schema/dependency/config changes,
credential access, network/device access, user-content processing, phase
promotion, real/mock demo claims, exit claims, regression claims, or release
tags. It does not alter Phase 1 evidence or create an implementation plan
artifact. Phases 2, 3, 4, and 7 are authorized only within this boundary;
Phases 5 and 6 remain unauthorized. Direct predecessor gates remain
mandatory before any runtime integration or phase exit.

All four authorized lanes remain `authorized/not-started` in `PROGRESS.md`;
no prep unit has run or produced a claimed artifact.

## Personal-build credential boundary — 2026-08-23

This personal/non-commercial build has one credential source: the ignored
local root `.env` file's `OPENAI_API_KEY`. Electron Main alone may load it at
runtime. Console provisioning, Electron `safeStorage`, macOS Keychain, Windows
DPAPI, and every alternate credential fallback are excluded from the runtime
path. Missing, empty, and read failures remain visible as metadata-only
reasons.

The master key never enters renderer IPC/data, logs, telemetry, exports, tests,
worker evidence, or committed files. Agents and workers do not inspect or
output `.env` values, even though runtime Main may load them. This dated ruling
supersedes conflicting older credential wording in product sources and
migrated skills for this personal build; future work must not restore Console
or `safeStorage` provisioning. Invariants 1–11 remain unchanged.

## Default workflow and gates

The default is one in-thread root plan review with no plan artifact, one
bounded fresh implementer, implementer-owned focused RED/GREEN for behavior
changes, one independent tester, external root acceptance, and an authorized
root commit/push. There is no separate plan worker, review worker, demo,
regression, or full-suite gate by default. Naturally coupled work may share a
worker only when its boundary is clear and jointly reviewable.

Use the smallest command set that proves the changed boundary. Full suite,
build, demo, regression, or a survey is conditional on phase exit, affected
risk, missing scope/evidence, or a concrete root finding. Escalate for
privacy/identity/profile, credentials, runtime model IDs, microphone or
restart ownership, schema/destructive migrations, dependencies/packaging,
launcher/protocol, failed evidence, or phase exit.

Behavior changes use focused TDD owned by the implementer: one failing test,
observed RED, smallest change, observed GREEN, then refactor only while green.
The independent tester owns fresh acceptance validation; root performs neither
role's commands. Documentation/configuration-only work uses strict static
checks and no ceremonial application tests. Root acceptance remains external
to worker self-review.

## Immutable, product, and platform boundaries

The historical harness and seven source-skill inputs are immutable byte-level
inputs. Migrated `.agents/skills/` files are distinct control-plane artifacts
and may change only when an exact task scope names them. A harness migration
does not change product documents, application source/tests, package files,
dependencies, runtime model configuration, or application behavior. The
worker model is a harness route and never belongs in runtime configuration,
`active.json`, telemetry, or product artifacts. Preserve pinned product model
IDs, package versions, domain facts, safety rules, and all 12 invariants.

The project workflow is npm-only. The user-owned
`scripts/install-node-lts.ps1` and
`docs/Magic_Mirror_Phase0_Adversarial_Review_2026-08-19.md` remain unchanged.
The credential boundary above is runtime policy: the ignored root `.env` with
`OPENAI_API_KEY` is Main-only, and no Console provisioning, `safeStorage`,
Keychain, DPAPI, or alternate fallback may be restored. Missing, empty, and
read failures remain metadata-only reasons; the key is excluded from renderer
IPC/data, logs, telemetry, exports, tests, worker evidence, and committed
files. Agents/workers must not inspect or output `.env` values.

The target Mac uses TCC, signing, and entitlement paths. Windows results do
not field-verify target-Mac TCC/signing/entitlements, packaged-worker, or
LaunchAgent behavior. The target's sole restart owner is
the user LaunchAgent `KeepAlive={SuccessfulExit=false}` (plist form
`KeepAlive = { SuccessfulExit = false }`). In-app recovery may recreate a
failed renderer once, then exits with code `1` for LaunchAgent restart. Never
call `app.relaunch()` or add a second restart owner.

The customizable wake word remains a Phase 2 requirement: keyword artifact
generation and tuning evidence are still required. Runtime model IDs come
only from versioned configuration; a failed configured ID never silently
substitutes another ID.

## Dispatch skeleton

Every post-plan implementation, survey/research, or test/validation dispatch
uses `scripts/invoke-codex-worker.ps1` with the exact H6 protocol in the linked
reference. Every prompt repeats these fields:

```text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: exactly one of "implementer", "surveyor", or "tester"
fresh_worker: true
task: one bounded unit with explicit non-goals
write_scope: exact named files; read-only unless the named scope grants a write
read_scope: exact named files only
skills: relevant .agents/skills paths
self_invariants: relevant canonical IDs; use IDs 1–12 for product behavior
evidence: exact changed files, diff summary, complete command output and exit codes, and risks
self_review: read the own diff/output; no more than 3 passes
root_review: external root gate after return; not part of self-review
```

The dispatch names exact files, skills, invariant IDs, read/write scope, and
evidence format. A missing field, including `read_scope`, is a dispatch
failure. The implementer writes
only exact named paths with `apply_patch`; the surveyor is read-only; the
tester runs only named commands and may write only a named ignored evidence
artifact. No worker widens scope, edits immutable inputs, creates a review
worker, or silently chooses another model. Profile-less collaboration is not
an execution substitute. The H6 reference contains the fixed launcher argv,
prompt transport, deadlines, protocol markers, and role semantics.

## Metadata-only evidence and privacy

Use only IDs, enums, counts, timings, statuses, reasons, hashes, paths, and
exit codes in artifacts, logs, telemetry, reports, and worker output. Never
place transcripts, audio, extracted memory values, private context,
credentials, images, embeddings, or prompts containing user content there.
Survey/research findings cite primary-source URLs and label each `verified` or
`unverified`. Every worker returns exact changed files, a concise diff summary,
complete stdout/stderr and exit codes for every named command, and unresolved
risks. A tester returns complete output even when a command fails or is
unavailable.

## TDD and canonical invariants

Workers preserve and report the applicable IDs among all 12 invariants:

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
12. For this personal/non-commercial build, the ignored local root `.env` with
   `OPENAI_API_KEY` is the sole master-key source, and Electron Main alone
   loads it at runtime. No Console provisioning, `safeStorage`, Keychain,
   DPAPI, or alternate credential fallback is in the runtime path. Missing,
   empty, and read failures remain visible as metadata-only reasons. The
   master key never enters renderer IPC/data, logs, telemetry, exports, tests,
   worker evidence, or committed files; agents/workers do not inspect or
   output `.env` values.

No worker may weaken, rename, or omit an applicable invariant. Product safety,
privacy, and runtime model IDs outrank convenience wording in a skill.

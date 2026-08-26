# DECISIONS.md — Durable rulings ledger

This ledger records durable boundaries, accepted design choices, and truth claims. Product documents remain authoritative except for the dated personal-build credential ruling below, which supersedes conflicting credential-provisioning wording for this personal/non-commercial build. `PROGRESS.md` owns dashboard/status, command evidence/counts, and transient incidents; `AGENTS.md` owns the root contract. No private/raw user data belongs here.

## Authority, workflow, and progressive disclosure

- The root alone orchestrates and externally accepts; it neither implements, surveys/researches, nor runs worker tests. Workers have one bounded role, exact scope, and metadata-only evidence; no delegation, recursion, or root-review claim. Implementers own focused RED/GREEN; independent testers own fresh acceptance.
- Each fresh profile-backed worker uses model `gpt-5.6-luna`, effort `max`, and role `implementer`, `surveyor`, or `tester`. Self-review is at most three passes and root review is external. H6 deadlines are first write `480s`, post-write idle `120s`, overall `600s`; raw JSON is suppressed and only the latest nonempty agent message is forwarded. Evidence is metadata-only: paths, IDs, enums, counts, timings, statuses, reasons, hashes, and exit codes.
- `AGENTS.md` is the lean always-loaded root contract; `.agents/H6_WORKER_PROTOCOL.md` is the direct conditional reference read fully before each dispatch. This is token compaction, not relaxation. Seven migrated skills retain domain facts; routing is AGENTS/H6, then phase workflow, invariants, and the matching domain route. Revalidation stays in that order and requires root acceptance of source preservation, metadata/frontmatter, triggers/retrieval, and required behavior before advancing.
- The default is one in-thread root plan review, one bounded fresh implementer, focused TDD, one independent tester, external acceptance, and authorized commit/push; no plan artifact, review worker, per-unit demo, regression, or full suite by default. Use the smallest boundary proof; docs/config use static checks. Survey only when authoritative sources cannot establish scope/evidence; corrections need a concrete root finding, and coupled work may share one jointly reviewable unit. Phase exit still requires demo, recorded result, regression evidence, and release boundary.
- Every post-plan dispatch uses `scripts/invoke-codex-worker.ps1` with model, max effort, `fresh_worker`, one role, bounded task/non-goals, exact `write_scope`/`read_scope`, skills, invariant IDs, evidence, self-review, and external root review. Escalate for privacy/identity, credentials, model IDs, mic/restart ownership, schema/destructive migration, dependencies/packaging, launcher/protocol, failed evidence, or phase exit.
- Phase order is 0 Foundation/Console, 1 Realtime Voice, 2 Wake Lifecycle, 3 Avatar/Audio, 4 Scenes, 5 Identity/Profiles, 6 Memory, 7 Field Hardening. Phase 0 is accepted; Phase 1 engineering is accepted through deterministic U8-B, but Phase 1 exit/tag is not. Phases 2–7 remain sequential; status/evidence are in `PROGRESS.md`.

## Pre-Phase-1 prep authorization — 2026-08-24

- The user explicitly authorized prep-only parallel work for Phases 2, 3, 4,
  and 7 before Phase 1 exits. This narrow preparation exception does not
  reorder or start a phase: runtime integration, demos, exit decisions,
  regression, release tags, and phase-status promotion remain sequential in
  the official order 0 Foundation/Console -> 1 Realtime Voice -> 2 Wake
  Lifecycle -> 3 Avatar/Audio -> 4 Scenes -> 5 Identity/Profiles -> 6 Memory
  -> 7 Field Hardening.
- The four authorized lanes have accepted prep-only units: P2-PREP-W1 for Wake
  Lifecycle, P3-PREP-A1 for Avatar/Audio, P4-PREP-S1 for Scenes, and
  P7-PREP-E1 for Field Hardening. Their official `phase_state` remains
  `not-started`. Phase 5 Identity/Profiles and Phase 6 Memory remain
  unauthorized and not-started.
- A permitted unit must be explicitly labeled `prep-only`, use an exact named
  read/write scope, and produce only isolated synthetic/metadata-only artifacts.
  It may not perform runtime wiring, IPC/schema/dependency/config changes,
  credential access, network/device access, user-content processing, phase
  promotion, real/mock demo claims, exit claims, regression claims, or release
  tags. No implementation plan artifact or Phase 1 evidence change is allowed.
  Direct predecessor gates remain mandatory before any runtime integration or
  phase exit; prep artifacts cannot satisfy or bypass those gates.
- Before the accepted artifacts below, this authorization had not yet produced
  a prep unit or artifact; the accepted ledger now records the four prep-only
  units. No demo, exit/regression claim, release tag, or phase-status promotion
  is recorded.

## Accepted prep-only artifacts — 2026-08-24

The four authorized prep-only units completed their isolated scopes and are
accepted as metadata-only preparation. Official phase state remains
`not-started`; none is runtime integration, a demo, an exit, regression, a
release tag, or phase-status promotion.

- `P2-PREP-W1` — accepted offline keyword artifact and opaque synthetic corpus.
  Independent validation: `26/26` focused tests and node typecheck exit `0`.
  No detector, microphone, or wake-to-Realtime handoff evidence. Artifacts:
  `src/main/wake/keyword-artifact.ts`,
  `src/main/wake/fixtures/synthetic-keyword-corpus.ts`,
  `tests/main/wake/keyword-artifact.test.ts`.
- `P3-PREP-A1` — accepted pure RMS/envelope math. Independent validation:
  `20/20` focused tests and web typecheck exit `0`. No real audio, Web Audio,
  Cubism, or asset evidence. Artifacts:
  `src/renderer/avatar/audio/lipSyncMath.ts`,
  `tests/renderer/avatar/audio/lipSyncMath.test.ts`.
- `P4-PREP-S1` — accepted pure normalized exact spell trigger and one-turn
  guard. Independent validation: `19/19` focused tests and node typecheck exit
  `0`. No transcript pipeline, preset, adapter, or hardware evidence.
  Artifacts: `src/main/scenes/spell-trigger.ts`,
  `tests/main/scenes/spell-trigger.test.ts`.
- `P7-PREP-E1` — accepted empty evidence template. Seven no-claim header
  sentinels and `19` pending rows were validated; the forbidden generic status
  scan returned the expected no-match. No field evidence. Artifact:
  `docs/Magic_Mirror_Phase7_Field_Hardening_Evidence_Template.md`.

## Personal-build credential ruling — 2026-08-23 (current)

- This personal/non-commercial build has one master-key source: the ignored local root `.env` file's `OPENAI_API_KEY`. Electron Main alone loads it at runtime.
- Console provisioning, Electron `safeStorage`, macOS Keychain, Windows DPAPI, and every alternate credential fallback are excluded from the runtime path. Missing, empty, and read failures remain visible as metadata-only reasons.
- The master key never enters renderer IPC/data, logs, telemetry, exports, tests, worker evidence, or committed files. Agents/workers do not inspect or output `.env` values, even though runtime Main may load them.
- This dated ruling supersedes conflicting older credential wording in product sources and migrated skills for this personal build. Future work must not restore Console or `safeStorage` provisioning. Invariants 1–11 remain unchanged.

## Immutable, privacy, platform, and model boundaries

- The historical harness and seven source-skill inputs are immutable byte-level inputs. A harness migration does not change product documents, application source/tests, dependencies, runtime configuration, or behavior. The worker model is never runtime configuration, `active.json`, telemetry, or a product artifact. Preserve pinned product model IDs, package versions, safety rules, domain facts, and all twelve invariants.
- Canonical invariants remain authoritative: (1) transcripts, audio, extracted memory, and injected private context are RAM-only; (2) face recognition only proposes a candidate and memory follows verbal confirmation; (3) guest and candidate IDs stay in Main; (4) profile change closes the old session and confirms a clean Persona+Master-only session before `updateAgent`; (5) extraction writes to the turn-start owner snapshot; (6) identity/naming/switching/group/sleep/spell control turns skip personal-memory extraction; (7) scenes require normalized exact full-transcript matching and one trigger, with approved presets alone controlling hardware; (8) exactly one mic owner exists with release-then-acquire handoff; (9) every ignore/drop/fallback/degrade is visitor-visible or a reasoned metadata-only Console event; (10) failures do not gate conversation or unrelated adapters; (11) model IDs are config-only and failed IDs never silently substitute; (12) for this personal/non-commercial build, the ignored root `.env` with `OPENAI_API_KEY` is the sole master-key source, Electron Main alone loads it at runtime, no Console provisioning, `safeStorage`, Keychain, DPAPI, or alternate credential fallback is in the runtime path, missing/empty/read failures remain visible metadata-only reasons, and the master key never enters renderer IPC/data, logs, telemetry, exports, tests, worker evidence, or committed files; agents/workers do not inspect or output `.env` values.
- The project is npm-only. The personal-build credential source is the ignored root `.env` loaded only by Main; its value is not inspected or recorded by agents/workers. The user-owned `scripts/install-node-lts.ps1` and `docs/Magic_Mirror_Phase0_Adversarial_Review_2026-08-19.md` remain unchanged. Records and diagnostics contain no transcripts, audio, prompts/private context, extracted memory, credentials, images, frames, embeddings, raw errors, or arbitrary user content.
- The earlier Windows `safeStorage`/DPAPI and target-Mac Keychain wording is historical platform evidence only and is superseded for this personal build by the current `.env` Main-only credential ruling. Target-Mac TCC, signing, entitlements, packaged workers, and field behavior require Mac evidence. The user LaunchAgent with `KeepAlive={SuccessfulExit=false}` (plist form `KeepAlive = { SuccessfulExit = false }`) is the sole restart owner. In-app recovery may recreate one failed renderer, then exits `1`; never call `app.relaunch()` or add a second restart owner.
- The wake phrase remains customizable and is a Phase 2 requirement: editable phrase/config/raw keyword input must produce a versioned detector artifact with metadata, visible safe fallback, and later tuning evidence. Runtime model IDs come only from versioned configuration; one bounded retry of the same configured ID is not fallback, and exhausted options visibly enter OfflineLoop.

## Phase 2 wake decision — verified 2026-08-23

- Use sherpa-onnx open-vocabulary phrase encoding for the customizable wake
  phrase; do not train a new neural model. Baseline `sherpa-onnx-node >=1.13.5`
  with `sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01`.
- Generate `keywords.txt` from `keywords_raw.txt` with
  `sherpa-onnx-cli text2token`, using the selected model's own `tokens.txt` and
  `ppinyin`. Use `16 kHz` and `featureDim 80`, and reset after each detection.
  Project defaults are score `1.0`, threshold `0.45`, and trailing blanks `2`.
- Tune with a positive corpus and a 30-minute ambient/TV negative run. Make no
  per-event confidence claim. Target-Mac evidence remains required.
- Verification gaps remain for the official `pypinyin` dependency and full
  Node camelCase tuning exposure.
- Primary sources already verified: [official KWS documentation](https://k2-fsa.github.io/sherpa/onnx/kws/index.html), [pretrained-model documentation](https://k2-fsa.github.io/sherpa/onnx/kws/pretrained_models/index.html), [issue #3791](https://github.com/k2-fsa/sherpa-onnx/issues/3791), and [release v1.13.5](https://github.com/k2-fsa/sherpa-onnx/releases/tag/v1.13.5).

## Foundation and Phase 0 durable design

- Phase 0 task order is fixed and accepted: 1 scaffold/two windows/never-black-screen boot; 2 lifecycle state machine; 3 ConfigService and credentials; 4 metadata-only non-blocking telemetry; 5 SQLite and migrations; 6 Main module registry and mocks; 7 model-settings resolver and snapshots; 8 boot wiring, IPC, Mirror UI, and OfflineLoop; 9 six-page Console UI; 10 demo runner, exit criteria, and tag. Tasks 1–10 are accepted under `phase0-v0.3.1`; P0-D1–D5 and the Phase 0 exit are accepted; later historical wording that says otherwise is superseded.
- Serialized config separates numeric `schemaVersion` from published `configVersion`. Legacy/missing markers migrate atomically while preserving operator values; unsupported/future schemas fail visibly to Maintenance. Active → Previous → packaged Default is reserved for corrupt, missing, or unreadable data. Task 7 model settings use versioned-config snapshots and never silently substitute a model.
- Task 6 uses a runtime-exhaustive Main registry with injected closed-outcome adapters and separate deterministic mocks. Results/events are stable and metadata-only; missing adapters are informational; there is no retry, sibling-module gate, boot, IPC, UI, or model-resolver work in this boundary.
- Main owns lifecycle and recovery: cloud failure maps to OfflineLoop, local core failure to Maintenance, black screen is never a degrade path, and an unrelated adapter cannot gate conversation. Telemetry is metadata-only and non-blocking: RAM ring max `2,000`, rotating JSONL max `5 MB` with `5` retained files, writer queue max `1,000`, and oldest overflow increments `telemetryDroppedCount`. Allowed persisted fields are time, module, event, status, optional duration, error code, session/scene IDs, reason, and source. Telemetry and SQLite failures remain visible through bounded metadata and never gate wake, Voice, Avatar, scenes, config, credentials, or lifecycle.
- The accepted Main-only SQLite baseline is `openSqlite`; the sole foundation table is `app_migrations(version INTEGER NOT NULL PRIMARY KEY, name TEXT NOT NULL)` with migration `1` named `foundation_baseline`. Foreign keys, WAL, integrity check, transactional migration, defensive health, and idempotent close are required. The backup contract is `import { backup } from 'node:sqlite'; await backup(sourceDb, backupPath, options)`, not `db.backup`; SQLite metadata uses `eventDelivery=emitted|failed`.
- Task 10 final smoke requires both windows loaded and lifecycle exactly `dormant` or `maintenance`; Console Overview, Events, and Phase Tests are queried while OfflineLoop and Maintenance are active. Accepted packaging is Electron `43.4.1` with electron-builder `26.15.3`; OfflineLoop video is in renderer public/output and `asarUnpack`, while config Default is in `extraResources`. The text base64 generator exists only because worker writes use `apply_patch`; activation failure is injected after `WAKE_DETECTED` and before `REALTIME_READY`.
- Development Node is `v24.19.0` (satisfies `>=22.22.2` or `>=24.15.0`), separate from Electron's Node `24.17`. The unrelated Node `DEP0190` child-process shell warning and nonblocking LF-to-CRLF warnings remain accepted limitations.

## Phase 1 durable voice and recovery contracts

- `@openai/agents` and `@openai/agents-realtime` remain exact-lockstep `0.16.1`; `ScriptedRealtimeTransport` comes from the official testing export. Session/job snapshots freeze the configured model/persona boundary; `realtimeSessionId` is authoritative for stale-event rejection and `sessionGeneration` is diagnostic only.
- A profile-scope change closes the old-owner session, confirms in a clean Persona+Master-only session, then calls `updateAgent` in that same clean session; owner/profile identifiers remain in Main. Final transcripts are a bounded current-session RAM projection. Interruptions stop audible gain and coalesce duplicates; stop, offline, rollover, restart, and close clear RAM. Exactly one mic owner exists with explicit release-then-acquire handoff; handoff failure is local Maintenance, not cloud OfflineLoop. One adapter or audio failure cannot gate unrelated conversation.
- Console Start Conversation/Disconnect use typed validated Console-only IPC to existing `manualStart`/`manualStop`, exposing only metadata action/status/reason. Simulate Cloud Failure and R2's authoritative `handleSimulator` return shape remain unchanged. The zero-argument interrupt dispatch travels Main → tracked Mirror `webContents` on exact `mirror:interrupt`; Mirror preload exposes typed `onInterrupt(listener)` with an exact disposer and drops payload. U7D is App interrupt composition, U7E1 is metadata-only Mirror-to-Main runtime outcomes, and U7E2 is the accepted browser-runtime dependency boundary. No UI consumer, `TurnController` call, acknowledgement, or completion claim is implied by transport alone.
- C1's atomic issuer copies/freezes the published model snapshot and Main realtime identity before awaiting, mints for `snapshot.realtimeDialogue`, and copies/freezes the result with `600`-second expiry. C2's existing `mirror:request-realtime-client-secret` returns one renderer-safe atomic DTO: missing identity is `session_unavailable` without a broker call, malformed data is `invalid_payload`, and preload validates, sanitizes, copies, and freezes it. The old direct secret-only path is absent; credentials remain Main-owned through the current personal-build `.env` source, and no safeStorage/Keychain/DPAPI runtime path or fallback is permitted.
- The renderer owns one browser Realtime runtime for start/rollover/stop/interrupt/dispose. Main owns pending start identity and rollover: wake increments generation, a frozen typed Main-to-Mirror command bundle uses the identity only while Activating, renderer success commits the exact ID and a strictly positive bundle generation, and delivery/start failure reaches OfflineLoop and clears pending identity. Active stop is Suspending then Dormant on success or Maintenance on failure; wrong-state outcomes are metadata-only ignored. Legacy injected recovery-controller behavior remains preserved; production dispatch uses tracked Mirror and IPC reconciles reports non-throwingly. Mirror preload retains the typed subscription/disposer.
- Pending rollover uses an exact `60`-minute timer. Mirror-to-Main realtime failure reports encode bounded failure kind in the reason without changing the telemetry allowlist. Stale identity is ignored without disturbing active ownership; active/connect/ICE failure visibly enters OfflineLoop. One deduplicated lightweight probe schedule runs at `5/15/30/60` seconds through the Main ephemeral-secret broker, discards returned material in RAM, returns Dormant on first success or exhaustion, adds no automatic full Realtime reconnect, leaves Manual Start as the next-session owner, and is cancelled on shutdown.
- Playback completion uses actual-output events with a bounded analyser fallback. U7F3 PoC values are fallback delay `500ms`, sample interval `50ms`, bound `2000ms`, silence threshold `0.02`, and `3` samples; real mic/output tuning is still required. Renderer kinds `session`, `mic`, `playback`, `transcript`, and `cleanup` cross a Mirror-only exact DTO with kind/status/reason and optional integer duration/session ID into Main-owned metadata telemetry, with no lifecycle callback. Cleanup covers close, stop, dispose, rollover, and OfflineLoop; the invariant-9 silent-drop defect is corrected.

## U8 truth and acceptance boundary

- U8-A is accepted/pushed at `fd78a28`: phase-versioned, selector-aware records/UI use truthful labels. Phase-evidence correction `d8ca7de` keeps real, deterministic, and unavailable evidence distinct.
- U8-B deterministic engineering is accepted/pushed at `d1d5364`. P1-D3/D4/D6 are `mock_passed`; P1-D1/D2/D5 are `real-demo not_executed` until real provider/device/operator evidence exists. The deterministic recorder never writes `passed` for a non-real result and uses the existing SQLite service. The artifact is not a real demo or Phase 1 exit evidence; Phase 1 exit and `phase1-v0.3.1` remain pending.
- Real Phase 1 evidence still requires an OpenAI credential/account/network, physical mic/output, temporary Persona, Voice choice, analyser tuning, and operator observation. The earlier target-Mac Keychain/`safeStorage` requirement is superseded for this personal build; remaining target-Mac evidence covers TCC mic/camera, signing/entitlements, packaged workers, LaunchAgent restart, power policy, and real device/provider behavior. Wake corpus/keyword, avatar, scene, camera/identity, memory/profile, and hardware/adapter inputs remain later product work; mocks cannot replace real Phase 1 exit evidence.

## Phase 1 automated live-gate boundary — verified 2026-08-26 (earlier attempt)

- The automated live harness launches the actual `npm run dev` /
  `electron-vite dev` path in an isolated temporary user-data environment,
  drives start-to-Active and stop-to-Dormant when the provider permits it,
  emits one fixed metadata-only marker, and supervises full process-tree
  cleanup.
- The current product configuration is realtime model `gpt-realtime-2.1`,
  input transcription `gpt-live-transcribe`, and voice `marin`, with no runtime
  fallback. Model IDs remain versioned-config-only; code must not silently
  substitute another model.
- The earlier real gate result is retained exactly:
  `PHASE1_LIVE_RESULT status=failed stage=active reason=start_connect_realtime_model_unsupported exit=1 duration_ms=2257 model_availability=unavailable cleanup=passed marker_count=1 output_marker_count=1 orphan_count=0`.
- Its `model_availability=unavailable` value is observational historical
  evidence and does not establish that either model spelling is invalid. It
  does not prove product success, Phase 1 exit, target-Mac microphone/TCC,
  natural conversation, audible output, or spoken barge-in. Phase 1 remains
  unaccepted and untagged.

## Phase 1 official model verification and fresh live attempts — verified 2026-08-26

- Verified official OpenAI sources:
  `https://developers.openai.com/api/docs/models/gpt-realtime-2.1` documents
  `gpt-realtime-2.1`, and
  `https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini` documents
  `gpt-realtime-2.1-mini`. The official Realtime session-create schema lists
  both exact IDs.
- Both model spellings are officially valid, so spelling is ruled out. The
  final versioned baseline remains solely realtime model `gpt-realtime-2.1`,
  input transcription `gpt-live-transcribe`, and voice `marin`, with no
  runtime fallback. The mini model was a bounded one-model-at-a-time
  verification attempt and did not change the versioned baseline.
- Fresh full-model attempt, with only `gpt-realtime-2.1` configured:
  `PHASE1_LIVE_RESULT status=failed stage=active reason=start_connect_realtime_model_unsupported exit=1 duration_ms=4259 model_availability=unavailable cleanup=passed marker_count=1 output_marker_count=1 orphan_count=0`.
- Fresh mini-model attempt, with only `gpt-realtime-2.1-mini` configured:
  `PHASE1_LIVE_RESULT status=failed stage=active reason=start_connect_realtime_model_unsupported exit=1 duration_ms=1686 model_availability=unavailable cleanup=passed marker_count=1 output_marker_count=1 orphan_count=0`.
- Both exact one-model-at-a-time live connects were rejected and absent from
  the API project's bounded catalog view. An API key marked unrestricted
  controls key endpoint permissions but is not evidence that the project
  catalog exposes a model. `model_availability` is observational; the failed
  actual connect is authoritative. The evidence does not establish a more
  specific entitlement cause.
- Provider/project access remains pending. P1-D1/P1-D2/P1-D5 remain
  `real-demo not_executed`; target-Mac microphone/TCC, physical device
  behavior, natural conversation, audible output, spoken barge-in, and the
  remaining human checks are pending/not-executed. Phase 1 remains unaccepted
  and untagged. Applicable invariant IDs are `1, 8, 9, 10, 11, 12`.

## Accepted identifiers (detailed validation remains in `PROGRESS.md`)

- Phase 0: `phase0-v0.3.1@9237dc7`; Task 2 `a7d74b14771de4f527762c30171ad2e68fc3d985`; Task 3 `0270686`/`835c92d`; Task 4 `dca1327`; Task 5 `a8f0355`; Task 6 plan/implementation `83be86b`/`5b95a94`; Task 7 plan/implementation `6214b6c`/`5e24bdc`; Tasks 8–9 are accepted inputs and Task 10 is accepted.
- Phase 1 plan `82aa39c`; P1-U1–U5 are `4862383`, `5be5871`, `18461e5`, `cffd484`, `fb5e58f`; P1-U6 is accepted with no self-referential hash. U7A and U7B1/B2 are accepted without invented hashes; U7C1=`cc8c34f`, U7C2 is accepted on the uncommitted integration diff with no future hash, and U7C3=`24bccfd`.
- Named U7 records: U7D=`4b2b6fa`, U7E1=`4636b17`, U7E2=`f4e5103`, U7F1=`105db2f`, U7F2A=`b81d400`, U7F2B1=`5e8b66d`, U7F2B2a=`c427670`, U7F2B2b=`b4abd76`, and U7F3=`426f52c` (U7 tip). U8-A, its correction, and U8-B are `fd78a28`, `d8ca7de`, and `d1d5364`.
- Harness H9=`5818830` (frozen suite/profile-backed probe accepted); the accepted Windows firewall script-fix record is `3e93936`.

## Superseded rulings

- The earlier credential ruling that used Console provisioning and Electron `safeStorage` through macOS Keychain or Windows DPAPI is preserved as history, but is superseded on `2026-08-23` by the personal-build `.env`/`OPENAI_API_KEY` Main-only ruling above. It is not a runtime fallback or future implementation direction.
- Historical application wording that Phase 0 was in progress, Tasks 8–10 were next/unimplemented, or Phase 1 was blocked is superseded by the accepted Phase 0 ledger and the current truth in `PROGRESS.md`.
- Harness-migration task labels and commits are process history, not application Tasks 1–10. R1 is completed historical in-place integration; R2 preserves the authoritative `handleSimulator` return shape; R5 keeps Tasks 3–5 sequential. R3 and R4 are superseded by the current routing policy.

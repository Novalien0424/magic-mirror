# Magic Mirror Phase 1 Realtime Voice Implementation Plan

**Goal:** Deliver the first real Realtime voice vertical slice: configured Traditional-Chinese speech-to-speech, Persona, interruption, RAM-only completed-transcript mapping, safe ephemeral credentials, deterministic contract coverage, and visible cloud-failure recovery into OfflineLoop.

**Architecture:** Electron Main remains the sole owner of lifecycle, credentials, model snapshots, configuration publication, telemetry, IPC authorization, and Phase Test records. The renderer owns the app-provided MediaStream, the official RealtimeSession/WebRTC adapter, the one audible SDK audio element, the silent analyser tap, and the bounded current-session transcript view. The implementation extends the existing Phase 0 services and authoritative Phase Test store; it does not add a second database, telemetry service, lifecycle, or restart owner.

**Tech Stack:** Electron 43.4.1, electron-vite 5, TypeScript 5.9, React 19, XState 5 lifecycle, node:sqlite, Electron safeStorage, OpenAI Agents SDK 0.16.1, WebRTC, Vitest, and the official ScriptedRealtimeTransport testing export.

**Spec:** docs/Magic_Mirror_PRD_v0.3.md; docs/Magic_Mirror_Tech_Spec_v0.3.md; docs/Magic_Mirror_Implementation_Plan_v0.3.md; docs/Magic_Mirror_Stack_Adversarial_Review_2026-08-16.md

**Status:** Authoritative execution plan authored 2026-08-20. Phase 1 implementation has not started and no Phase 1 demo or exit result is claimed.

**Authority:** The current user request and root AGENTS.md control process. Product documents control product behavior. The implementation plan owns Phase exit criteria. Existing ConfigService, credential-store, lifecycle, telemetry, IPC/preload, Console, model-settings, OfflineLoop, and Phase Test interfaces are extended in place; none are duplicated.

**Phase 0 baseline/tag:** Start from the existing local tag `phase0-v0.3.1`, the root-accepted Phase 0 exit tree recorded in PROGRESS.md on 2026-08-20, with Phase 0 Tasks 1–10 accepted and P0-D1 through P0-D5 recorded as passed. The root confirms that existing tag before dispatching P1-U1; this plan does not ask the root to create a replacement anchor. Windows Phase 0 evidence remains Windows-labeled and does not verify target-macOS Keychain, TCC, signing, entitlements, packaged-worker, or LaunchAgent behavior.

**Branch/integration assumptions:** The root creates branch `phase1-realtime-voice` from the accepted Phase 0 baseline. Units execute sequentially in the order P1-U1 through P1-U8 because the SDK lockstep, snapshots, credential broker, session adapter, audio ownership, lifecycle recovery, Console, and demo runner share contracts. Workers do not commit, push, tag, merge, or widen their file scope. The root integrates each accepted unit locally after external root review. The recoverable Phase 1 tag is `phase1-v0.3.1` and is local-only unless the user explicitly authorizes a later push; `phase1-realtime-voice` remains the branch/evidence-directory name.

**TDD/tester/root-review rules:** Every behavior unit writes one focused RED test, has a fresh tester run the exact RED command, implements the smallest GREEN change, and has a fresh tester run the exact GREEN commands. Testers own all named test, typecheck, build, scan, and demo commands and return their complete stdout/stderr plus exit codes. Implementers do not run validation commands; their evidence is limited to exact changed paths, a concise diff/scope/read audit, self-review evidence, metadata-only design evidence, and unresolved risks. Implementer self-review is capped at three passes. Root review is external to worker self-review and is the only acceptance gate. Documentation-only planning performed here adds no application tests and runs no validation. Every tester dispatch separately uses the required fresh profile-backed `role: "tester"` envelope and the exact named command allowlist.

**Evidence directory:** Future tester-owned metadata-only artifacts belong under .superpowers/sdd/2026-08-20-phase1-realtime-voice/ with one subdirectory per unit and one final-exit directory. Artifacts may contain paths, IDs, enums, counts, timings, statuses, reason codes, hashes, config revisions, model-role IDs, SDK version, and exit codes only. Never write transcripts, audio, extracted memory values, private context, images, embeddings, credentials, raw errors, or user-content prompts to those artifacts.

## Global constraints

- package.json and package-lock.json add exactly @openai/agents 0.16.1 and @openai/agents-realtime 0.16.1 in lockstep. Keep Electron 43.4.1 and electron-builder 26.15.3 unchanged. openai ^7.2.0 remains the umbrella-package dependency relationship; it is not treated as an agents-realtime peer. No other package upgrade is part of Phase 1.
- Use only the official imports from the pinned SDK and the official ScriptedRealtimeTransport export. Do not create a transport double that imitates the official export, use an alternate SDK, use an npx/network runtime path, build an SDP/data-channel transport, or add a sideband server.
- Runtime model IDs come only from versioned configuration and the published Active model settings. The current session freezes SessionModelSnapshot at creation. Draft is used only by explicit contract tests and Publish preflight. A mid-session Publish never retargets the current session. A forced new session and the 60-minute rollover freeze the Published Active values at their own creation boundary.
- Production and live contract tests use the same versioned-config resolver. Deterministic tests may inject the official transport, fetch, clock, and device fixtures, but they do not bypass model snapshot creation or invent a second resolver.
- The configured Realtime Dialogue and Input Transcription IDs are passed explicitly. The SDK hidden transcription default gpt-4o-mini-transcribe is rejected by contract unless that exact ID is the configured Active Input Transcription ID. A failed configured ID fails visibly; it never silently substitutes another model.
- RealtimeSession owns its complete configuration in its constructor, including model, voice, turn detection, input transcription, historyStoreAudio false, tracingDisabled true, and config.tracing null. connect receives only documented short-lived compatible arguments; the baseline call passes only the ephemeral apiKey and never passes config.
- Before any SDK use, Main sets OPENAI_AGENTS_DISABLE_TRACING=1, OPENAI_AGENTS_DONT_LOG_MODEL_DATA=1, and OPENAI_AGENTS_DONT_LOG_TOOL_DATA=1. Production never enables DEBUG=openai-agents*. No SDK audio history or model/tool trace content is persisted.
- Main owns the long OpenAI key through safeStorage: DPAPI on the Windows development machine and Keychain on the target macOS. Renderer receives only a short-lived client secret. The broker POSTs /v1/realtime/client_secrets using the configured model and an injected fetch implementation. No key or client secret enters renderer storage, configuration, telemetry, SQLite, logs, exports, or worker evidence.
- The normal runtime credential path never treats `.env` as a credential source. Only an explicit one-time operator action may instruct Main to read the selected local `.env` once, import the key into safeStorage, immediately discard plaintext, and thereafter use safeStorage. Agents, workers, and tests never read the real workspace `.env`; tests use isolated synthetic fixture files, and worker/process records never claim that the real `.env` value was inspected.
- The app-owned MediaStream is the only Phase 1 microphone stream. Exactly one microphone owner exists: none or Realtime. Closing a session is followed by explicit stop() on every microphone track before release or handoff; every future handoff is release-then-acquire. Phase 1 manual wake means the Console manual Start action, not a keyword detector. Phase 1 has no wake owner; the wake worker and wake-to-Realtime handoff belong to Phase 2.
- The SDK unmuted audio element is the sole audible Realtime output. The analyser is a silent tap from the same stream and never connects to AudioContext.destination. Do not route the same remote stream through a second audible path.
- output_audio_buffer.stopped is the primary actual playback-completion boundary for Speaking to Listening, idle timing, and safe rollover. A bounded actual-output-audio/analyser fallback is allowed only when the primary event is delayed; the fallback is visible and emits metadata with a reason.
- VAD automatic interruption and manual interrupt are both supported. Completed transcript item-ID mapping is RAM-only. Voice never waits for final transcription. A transcription failure degrades only transcript-dependent behavior and emits a metadata-only reason; conversation and unrelated adapters continue.
- Connect failure, ICE failure, and Active disconnect stop AI audio, close the current session, stop and release its microphone tracks, clear current owner/transcript state, and enter visible OfflineLoop within five seconds. Recovery probes occur at 5, 15, 30, and 60 seconds; an early successful probe may finish the loop, and after the final bounded probe the state returns to Dormant. Recovery never resumes the old session and never retries a full session in a background loop.
- The 60-minute rollover waits for the current user turn and actual playback completion, mints a new client secret, creates a new RealtimeSession from the current Published Active snapshot, changes realtimeSessionId, and never calls reconnect. It does not buffer speech across the boundary.
- Existing lifecycle states remain starting, dormant, activating, active, suspending, offlineLoop, and maintenance. realtimeSessionId is the authoritative stale-event key. sessionGeneration is diagnostics only and never decides correctness.
- Main sets and clears owner/session state; renderers never gain lifecycle, credential, model-raw-config, profile-ID, SQLite, transcript-persistence, or restart authority. Every IPC handler remains sender-authorized and narrow.
- Extend the existing Console pages and existing metadata-only telemetry. Voice controls, model cards, credentials status, Persona Draft editing, loaded snapshot, and the bounded RAM transcript panel are additive. Do not create a second Console, database, config service, telemetry service, or Phase Test store.
- Every ignore, drop, fallback, stale event, failure, or degrade is visitor-visible or a metadata-only Console event with an allowlisted reason. Failures must not gate conversation or unrelated adapters.
- LaunchAgent with KeepAlive = { SuccessfulExit = false } remains the only app-level restart owner. In-app renderer recovery may recreate a renderer once; never call app.relaunch and never add a second supervisor.
- Windows development evidence may verify DPAPI safeStorage and local Windows behavior only. It cannot claim target-macOS Keychain, TCC, signing, entitlements, packaged-worker, LaunchAgent, or target hardware field verification.
- Phase 1 non-goals are wake worker/custom wake artifact/tuning, avatar or Live2D lipsync, identity/profile/face recognition, memory extraction or memory writes, scenes/MCP/handoff/multi-agent/tool writes, public profile IDs, provider/model fallback, audio/transcript persistence, offline AI, custom voice, multi-Persona, remote admin, enterprise platform work, package upgrades beyond the two exact SDK additions, and field acceptance of macOS-only behavior.
- Preserve all existing Phase 0 behavior and the public `SimulatorCommand` shape; Phase 1 does not add a new public simulator command or weaken an existing one.

## 1. Phase 1 contract decision table

| Contract | Authoritative decision | Evidence boundary |
|---|---|---|
| SDK versions | package.json and package-lock.json contain @openai/agents 0.16.1 and @openai/agents-realtime 0.16.1 exactly; official imports and official ScriptedRealtimeTransport only | P1-U1 lockstep test and P1-D5 real contract |
| Realtime model | Published Active aiModels.realtimeDialogue.modelId; Phase 1 baseline is gpt-realtime-2.1 in versioned config, never a source literal | P1-U1 snapshot test; P1-D5 |
| Input transcription | Published Active aiModels.inputTranscription.modelId; Phase 1 baseline is gpt-live-transcribe in versioned config, explicitly sent to the session | P1-U1/U3 contract test; hidden gpt-4o-mini-transcribe is rejected unless configured |
| Model snapshot | SessionModelSnapshot captures all three role IDs, voice, reasoning, turn-detection profile, config revision/fingerprint, and SDK version at session creation | P1-D6 proves a mid-session Publish does not retarget |
| Draft versus Active | Draft is allowed for validation and the explicit real P1-D5 contract; only Published Active creates runtime sessions; invalid Draft leaves Active unchanged | P1-U1/U7 and P1-D5 |
| Session construction | RealtimeSession constructor owns transport, model, audio settings, transcription, turn detection, voice, reasoning, historyStoreAudio false, tracingDisabled true, and config.tracing null | P1-U3 constructor assertion |
| connect arguments | connect receives only documented compatible short-lived arguments; baseline is connect({ apiKey: ephemeralClientSecret }); no config argument | P1-U3 test rejects constructor/config drift |
| Tracing privacy | Main sets all three OPENAI_AGENTS_* disable/log environment flags before SDK use; production DEBUG is absent | P1-U2/U3 privacy test and final sentinel scan |
| Long credential | Main safeStorage only: DPAPI on Windows development, Keychain on target macOS; no keytar, renderer key, log, export, or DB copy | P1-U2 and P1-D1/D2/D5 operator checkpoint |
| .env import | Only an explicit one-time operator action may instruct Main to read the selected local `.env`; normal runtime never reads or uses it as a credential source; agents/workers/tests use synthetic fixtures only | P1-U2 isolated fixture and evidence metadata |
| Ephemeral broker | Main POSTs /v1/realtime/client_secrets with the configured model and injected fetch; the renderer sees only the returned short-lived value in RAM, and only stable expiry metadata returned by the provider is projected when available | P1-U2 broker tests |
| Mic ownership | App-owned MediaStream has exactly one Phase 1 owner, Realtime; release closes session and stops every track before any future owner can acquire | P1-U4; Phase 2 owns wake handoff |
| Audible output | SDK unmuted audio element is the one audible path; analyser is a silent tap and never reaches destination | P1-U4 graph test |
| Playback completion | raw output_audio_buffer.stopped is primary; bounded analyser/actual-output fallback is visible and metadata-only | P1-U4 and P1-D2/D6 |
| Interruption | SDK VAD interruption plus manual session.interrupt; AI audio gain reaches zero and the new turn can proceed | P1-U3/U6 and real P1-D2 |
| Transcript mapping | Completed item ID maps to a bounded current-session RAM record; missing transcript emits transcript_unavailable and never blocks Voice | P1-U6; no persistence |
| Session identity | realtimeSessionId rejects stale events; sessionGeneration is diagnostic only | P1-U3/U5 and P1-D6 |
| Cloud failure | Connect/ICE/Active disconnect uses one failure path, clears state and enters OfflineLoop within five seconds | P1-U5 and deterministic P1-D3/D4 |
| Recovery | Probe at 5/15/30/60 seconds, then Dormant; manual new Start is required; old session is never resumed | P1-U5 and P1-D4 |
| Rollover | At 60 minutes wait for turn plus actual playback completion, mint a new secret, create a new session/current Published snapshot, and never reconnect | P1-U5/U6 and P1-D6 |
| Console authority | Sender-authorized Main IPC exposes status/actions only; no raw key, secret, raw model configuration, profile ID, transcript persistence, or new renderer authority | P1-U7 |
| Persona | Authorized Console edits Persona Draft; Publish is versioned and affects the next session only | P1-U1/U7 and P1-D5/D6 |
| Transcript panel | Bounded current-session RAM panel is opt-in, clears on stop/offline/restart/session close, and never enters telemetry/SQLite/export | P1-U6/U7 and privacy scan |
| Phase Test records | Existing SQLite/Console Phase Test store is extended for Phase 1; exactly one metadata-only record per demo attempt; no second store | P1-U8 |
| Demo split | P1-D1, P1-D2, and P1-D5 are real and require an operator checkpoint; P1-D3, P1-D4, and P1-D6 are deterministic and may use ScriptedRealtimeTransport | P1-U8 final matrix |
| Restart/platform | LaunchAgent remains sole app restart owner; Windows results never become macOS field claims; no app.relaunch | P1-U5/U8 and final exit review |

## 2. Execution and path map

The following paths are the exact Phase 1 implementation allowlist. Existing
paths are extended in place; new paths are created only by the unit that owns
them. Shared existing files appear in multiple rows only as sequential
extension points; the current dispatch write_scope controls the exact edit.
A worker may not edit another unit's portion of a shared file.

| Unit | Production paths | Test paths |
|---|---|---|
| P1-U1 | Extend package.json; Extend package-lock.json; Extend src/shared/types.ts; Extend src/main/model-settings.ts; optionally Create one narrow src/shared/realtime-contract.ts | Create tests/unit/realtime-sdk-lockstep.test.ts; Create tests/unit/session-snapshot-boundary.test.ts |
| P1-U2 | Extend src/main/credential-store.ts; Extend src/main/index.ts; Extend src/main/boot.ts; Create one narrow src/main/realtime/client-secret-broker.ts; shared metadata types only if needed | Create tests/unit/realtime-client-secret-broker.test.ts; Create tests/unit/realtime-credential-import.test.ts; Create tests/unit/realtime-privacy-flags.test.ts |
| P1-U3 | Extend src/shared/bridge.ts; Extend src/main/ipc.ts; Extend src/main/boot.ts; Extend src/preload/mirror.ts; Create src/renderer/realtime/realtime-session-adapter.ts; Create src/renderer/realtime/realtime-transport.ts; Create src/shared/realtime-events.ts | Create tests/unit/realtime-session-adapter.test.ts; Create tests/unit/realtime-scripted-transport.test.ts; Create tests/integration/realtime-contract.test.ts |
| P1-U4 | Create src/renderer/realtime/mic-owner.ts; Create src/renderer/realtime/realtime-audio-output.ts; Create src/renderer/realtime/playback-completion.ts | Create tests/unit/realtime-audio-ownership.test.ts; Create tests/unit/realtime-playback-completion.test.ts |
| P1-U5 | Extend src/main/lifecycle.ts; Extend src/main/boot.ts; Create src/main/realtime/outage-recovery.ts; Create src/shared/realtime-recovery.ts; Extend src/shared/realtime-events.ts and src/renderer/realtime/realtime-session-adapter.ts only for the narrow outage/rollover event/callback contract | Create tests/unit/realtime-outage-recovery.test.ts; Create tests/unit/realtime-rollover.test.ts; Create tests/integration/phase1-recovery.test.ts |
| P1-U6 | Create src/renderer/realtime/transcript-buffer.ts; Create src/renderer/realtime/turn-controller.ts; Create src/renderer/realtime/session-cleanup.ts; Extend src/shared/console-types.ts and src/main/console-data.ts only for the opt-in bounded RAM projection | Create tests/unit/realtime-transcript-buffer.test.ts; Create tests/unit/realtime-interruption.test.ts; Create tests/unit/realtime-privacy-cleanup.test.ts |
| P1-U7 | Extend src/renderer/console/App.tsx; Extend src/renderer/console/App.css; Extend src/shared/console-types.ts; Extend src/shared/bridge.ts; Extend src/main/console-data.ts; Extend src/main/ipc.ts; Extend src/preload/console.ts; Extend src/main/console-config.ts only if the existing controller needs a narrow gap closure | Create tests/unit/console-realtime-voice.test.ts; Create tests/integration/console-realtime-ipc.test.ts |
| P1-U8 | Create src/main/phase1-demo-runner.ts; Extend src/main/sqlite-service.ts; Extend src/shared/console-types.ts; Extend src/main/console-data.ts; Extend src/main/boot.ts only if record append wiring is required; Create scripts/run-phase1-demos.mjs | Create tests/unit/phase1-demo-runner.test.ts; Create tests/unit/phase1-privacy-sentinel.test.ts; Create tests/unit/phase1-records.test.ts; Create tests/integration/phase1-demos.test.ts; Extend tests/unit/sqlite-phase-tests.test.ts |

Shared contracts used by later units:

~~~ts
type SessionModelSnapshot = {
  configVersion: number;
  fingerprint: string;
  sdkVersion: '0.16.1';
  realtimeDialogue: string;
  inputTranscription: string;
  memoryExtractor: string;
  voice: string;
  reasoningEffort: string;
  turnDetectionProfile: string;
  takenAt: string;
};

type RealtimeSessionHandle = {
  realtimeSessionId: string;
  sessionGeneration: number;
  connect(): Promise<void>;
  interrupt(): Promise<void>;
  close(reason: string): Promise<void>;
};

type ClientSecretBroker = {
  issue(input: {
    modelId: string;
    fetchImpl?: typeof fetch;
  }): Promise<{ value: string; expiresAt?: number }>;
};
~~~

These names are the plan-level contract. If an existing Phase 0 type already
owns one of these names, extend that type rather than introduce a duplicate.
The runtime semantics and fields above remain fixed.

### Required checkbox sequence for every unit

Apply this sequence to P1-U1 through P1-U8 using the unit's exact paths and
commands below:

- [ ] Root confirms the previous unit's external review, accepted diff, and integration boundary before dispatching this unit.
- [ ] A fresh RED implementer writes only the named failing tests and returns read/diff/scope/self-review evidence; it does not run validation commands.
- [ ] A fresh RED tester runs the unit's exact RED command and confirms the stated failure reason without changing files.
- [ ] Root reviews the RED evidence, then a fresh GREEN implementer writes only the unit's production/test allowlist.
- [ ] A fresh GREEN tester runs the exact GREEN commands, including the unit's focused tests and any named typecheck.
- [ ] Root reviews the implementer diff/evidence plus the tester's complete command output, privacy/invariant posture, and self-review count; root integrates the unit locally only after acceptance.
- [ ] Root records the unit's metadata-only result and unresolved risks under .superpowers/sdd/2026-08-20-phase1-realtime-voice/ before the next dispatch.

## 3. Implementation units

### P1-U1 SDK lockstep + versioned voice/session snapshots

**Size:** 1–1.5 working days.

**Story/outcome:** As the operator, I need every voice session and its contract
test to use the exact approved SDK pair and the Published Active model settings,
so a Draft change or SDK drift cannot silently change a live session.

**Exact production paths:**

- Extend package.json and package-lock.json with exactly the two 0.16.1 SDK packages and preserve all existing pins. The implementer patches both manifests with apply_patch only and never mutates node_modules.
- Extend src/shared/types.ts at the existing SessionModelSnapshot type, preserving the Phase 0 public types while adding only the Phase 1 snapshot metadata required by the contract.
- Extend src/main/model-settings.ts at the existing Active/Draft/Previous resolver and existing createSessionModelSnapshot factory; do not create a second resolver or snapshot owner.
- Create one narrow src/shared/realtime-contract.ts only if the focused contract assertions cannot remain in the existing shared types; it may validate the pinned SDK contract but may not duplicate the resolver or snapshot factory.

**Exact test paths:**

- Create tests/unit/realtime-sdk-lockstep.test.ts.
- Create tests/unit/session-snapshot-boundary.test.ts.

**Interfaces consumed and produced:**

- Consume the existing Published Active resolver and the existing SessionModelSnapshot/JobModelSnapshot names owned by src/shared/types.ts and src/main/model-settings.ts.
- Extend the existing createSessionModelSnapshot(publishedActive, takenAt) factory and, only if needed, create a narrow assertRealtimeContract(snapshot): void helper; neither may become a duplicate owner.
- The existing factory copies configured IDs and non-secret voice settings, records config version/fingerprint, the pinned SDK version 0.16.1, and the required session metadata, and never reads Draft for runtime creation.

**Console/telemetry increment:** Define the metadata contract later consumed by
U7's existing Models card: SDK 0.16.1, Published Active role IDs, Runtime
loaded snapshot, Previous, revision, fingerprint, and a pending-next-session
marker. Emit realtime_config_loaded and realtime_model_contract_rejected with
role, requested model ID, config version, SDK version, status, reason, and
source; never emit prompt or content. U1 does not edit the Console UI.

**Happy-path tests:**

- A Published Active fixture creates a snapshot containing the configured Realtime Dialogue, Input Transcription, voice, reasoning, turn-detection profile, revision, fingerprint, and SDK version.
- A Draft Publish leaves the current snapshot unchanged and a new session factory reads the newly Published Active snapshot.
- The package manifest and lockfile contain both exact 0.16.1 packages and preserve Electron 43.4.1/electron-builder 26.15.3.

**Failure/fallback tests:**

- A missing or mismatched SDK package version fails the lockstep assertion with a metadata-only reason and never creates a runtime adapter.
- An invalid Draft does not alter Active or Previous.
- A fixture that omits Input Transcription config fails rather than accepting hidden gpt-4o-mini-transcribe.
- A failed configured model is represented as failed/degraded and never replaced by a different model ID.

**Exact RED implementer dispatch boundary:**

~~~text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: "implementer"
fresh_worker: true
task: RED only for P1-U1. Add the two focused failing tests that require exact manifest lockstep and Published-Active SessionModelSnapshot capture. Keep the RED tests static/fixture-based and do not import the SDK before dependency materialization. Do not implement production behavior, update package files, or edit any other path.
write_scope: tests/unit/realtime-sdk-lockstep.test.ts; tests/unit/session-snapshot-boundary.test.ts
skills: .agents/skills/mm-phase-workflow/SKILL.md; .agents/skills/mm-invariants/SKILL.md; .agents/skills/mm-electron-foundation/SKILL.md; .agents/skills/mm-realtime-voice/SKILL.md
self_invariants: 1, 9, 10, 11, 12
evidence: exact test paths, diff summary, read/diff/scope/self-review evidence, expected RED failure reason, metadata-only risks; no validation command is run by the implementer
self_review: read the own diff/output; no more than 3 passes
root_review: external root gate after return; not part of self-review
~~~

**Exact RED tester command:**

~~~powershell
.\node_modules\.bin\vitest.cmd run tests/unit/realtime-sdk-lockstep.test.ts tests/unit/session-snapshot-boundary.test.ts --reporter=verbose
~~~

**Expected RED reason:** FAIL because the exact SDK entries and/or the
SessionModelSnapshot factory/assertion are not yet present. The tester must
return the complete failure output and exit code; no production file is changed
in the RED phase. This RED test does not claim that SDK imports are runnable.

**Exact GREEN implementer dispatch boundary:**

~~~text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: "implementer"
fresh_worker: true
task: GREEN P1-U1. Implement only the exact SDK lockstep and Published-Active session snapshot contract required by the RED tests. Extend the existing model-settings boundary; do not build RealtimeSession, credentials, audio, lifecycle recovery, Console UI, demos, or persistence.
write_scope: package.json; package-lock.json; src/shared/types.ts; src/main/model-settings.ts; src/shared/realtime-contract.ts (only if needed); tests/unit/realtime-sdk-lockstep.test.ts; tests/unit/session-snapshot-boundary.test.ts
skills: .agents/skills/mm-phase-workflow/SKILL.md; .agents/skills/mm-invariants/SKILL.md; .agents/skills/mm-electron-foundation/SKILL.md; .agents/skills/mm-realtime-voice/SKILL.md
self_invariants: 1, 9, 10, 11, 12
evidence: exact changed paths, concise diff summary, read/diff/scope/self-review evidence, snapshot fields, package-manifest intent, metadata-only risks; validation output is tester-owned and not run by the implementer
self_review: read the own diff/output; no more than 3 passes
root_review: external root gate after return; not part of self-review
~~~

**Operator dependency-materialization checkpoint:** After root accepts the
U1 package.json/package-lock.json patch, pause before any SDK-import validation.
The user/operator runs `npm ci --ignore-scripts` to materialize the exact
lockfile dependencies. This is an operator action, not a tester command or a
worker success claim; implementers never mutate node_modules. Only after this
checkpoint may the GREEN tester run the SDK-import lockstep assertion.

**Exact GREEN tester commands after the operator checkpoint:**

~~~powershell
.\node_modules\.bin\vitest.cmd run tests/unit/realtime-sdk-lockstep.test.ts tests/unit/session-snapshot-boundary.test.ts --reporter=verbose
npm run typecheck:node
~~~

**Invariant IDs:** 1, 9, 10, 11, 12. The final Phase 1 invariant map also
checks all other IDs even though identity, memory, scene, and wake behavior are
explicit non-goals here.

**Non-goals:** No SDK imports in runtime yet, no network call, no credential
broker, no audio, no lifecycle transition, no Console control, no Persona
editing, no real model contract, and no new config service.

**Affected demos:** P1-D5 consumes the snapshot and package contract; P1-D6
consumes the snapshot freeze boundary.

**Root review checklist:**

- Exact dependency versions are present in both manifests, with no unrelated dependency drift.
- Runtime factory reads only Published Active and captures every required field.
- No model literal or fallback was added to a runtime TypeScript module.
- Input transcription is explicit and hidden SDK default cannot pass the contract.
- No credentials, transcript, audio, private context, or raw errors appear in tests or telemetry.
- The changed paths match this unit exactly and self-review stayed within three passes.

**Integration/commit boundary:** After external root acceptance, root integrates
only the listed paths and records a local commit named
feat(phase1): lock realtime sdk and session snapshots. No worker commit, push, or
tag is permitted.

### P1-U2 Main safeStorage credential import + ephemeral client-secret broker

**Size:** 1–1.5 working days.

**Story/outcome:** As the operator, I need Main to turn its safeStorage-held
long credential into a short-lived Realtime client secret without exposing the
long key to the renderer or persisting the short secret.

**Exact production paths:**

- Extend src/main/boot.ts to set the three SDK privacy environment variables before any SDK use or renderer session creation.
- Extend src/main/index.ts only where the existing Main service composition registers the broker and the explicit one-time operator credential action.
- Extend src/main/credential-store.ts for the Main-only safeStorage import boundary while preserving safeStorage/DPAPI behavior.
- Create one narrow src/main/realtime/client-secret-broker.ts with injectable fetch, configured-model request construction, response validation, provider-returned expiry metadata when available, and metadata-only errors. No second credential service is created.

**Exact test paths:**

- Create tests/unit/realtime-client-secret-broker.test.ts.
- Create tests/unit/realtime-credential-import.test.ts.
- Create tests/unit/realtime-privacy-flags.test.ts.

**Interfaces consumed and produced:**

- Consume the existing Main CredentialStore and Published Active model resolver.
- Produce ClientSecretBroker.issue({ modelId, fetchImpl }) and a Main-only importCredentialFromOperatorAction boundary.
- The broker request uses POST /v1/realtime/client_secrets, Authorization from decrypted safeStorage only inside Main, and session type realtime with the configured model ID. It does not request or assume a fixed client-secret lifetime; it projects only stable expiry metadata returned by the provider, when available.
- The renderer-facing result contains only the short-lived client-secret value in transient call memory plus provider expiry/status metadata; status IPC never returns either long key or client secret.

**Console/telemetry increment:** Emit credential_status_changed,
realtime_client_secret_issued, and realtime_client_secret_failed with status,
role, configured model ID, provider-expiry-metadata-present status, source,
reason, and error code only.
The Console receives present/replace/import status, never a secret. The
operator-import event says operator_import and synthetic tests say
source=test_fixture; neither reads the real workspace `.env`.

**Happy-path tests:**

- An injected safeStorage fixture and fetch fixture produce a validated ek_
  client secret with the exact configured model ID and provider expiry metadata
  only when the response supplies a stable value.
- The request body and headers are correct while the emitted event omits the
  Authorization value and response value.
- A one-time explicit operator action instructs Main to read the selected local
  `.env` once, stores only an encrypted blob through the existing CredentialStore,
  immediately discards plaintext, and a second import is rejected with a visible
  reason unless the operator first uses the explicit replace action. Normal
  runtime startup never treats `.env` as a credential source.
- Privacy environment variables are set before the broker/session composition
  can import or use the SDK.

**Failure/fallback tests:**

- Missing safeStorage credential, non-2xx response, malformed response, wrong
  secret prefix, and fetch rejection all return metadata-only failure and never
  expose the long key.
- An attempt to pass the long key through the renderer bridge is rejected by
  the type and sender-authorized handler.
- The real workspace `.env` is not read by the fixture tests or any worker;
  synthetic isolated fixture files are used only to exercise the operator seam.
- A broker failure does not substitute another model and leaves the existing
  Active model unchanged.

**Exact RED implementer dispatch boundary:**

~~~text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: "implementer"
fresh_worker: true
task: RED only for P1-U2. Add failing broker, synthetic credential-import, and privacy-flag tests. Do not edit production, package, the real workspace .env, telemetry, IPC, or any path outside the three named test files.
write_scope: tests/unit/realtime-client-secret-broker.test.ts; tests/unit/realtime-credential-import.test.ts; tests/unit/realtime-privacy-flags.test.ts
skills: .agents/skills/mm-phase-workflow/SKILL.md; .agents/skills/mm-invariants/SKILL.md; .agents/skills/mm-electron-foundation/SKILL.md; .agents/skills/mm-realtime-voice/SKILL.md
self_invariants: 1, 9, 10, 11, 12
evidence: exact test paths, diff summary, read/diff/scope/self-review evidence, expected RED failure reason, metadata-only risks; no validation command is run by the implementer
self_review: read the own diff/output; no more than 3 passes
root_review: external root gate after return; not part of self-review
~~~

**Exact RED tester command:**

~~~powershell
.\node_modules\.bin\vitest.cmd run tests/unit/realtime-client-secret-broker.test.ts tests/unit/realtime-credential-import.test.ts tests/unit/realtime-privacy-flags.test.ts --reporter=verbose
~~~

**Expected RED reason:** FAIL because ClientSecretBroker, the synthetic
operator import seam, and the pre-SDK privacy initialization are not yet
implemented.

**Exact GREEN implementer dispatch boundary:**

~~~text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: "implementer"
fresh_worker: true
task: GREEN P1-U2. Implement only the Main safeStorage credential import and ephemeral client-secret broker covered by the RED tests. The real `.env` may be read only by the explicit one-time operator action inside Main; normal startup/runtime never reads it as a credential source, and plaintext is discarded immediately after safeStorage import. Preserve existing CredentialStore behavior and sender boundaries. Do not implement RealtimeSession, mic/audio, lifecycle recovery, Console visual components, or demos.
write_scope: src/main/boot.ts; src/main/index.ts; src/main/credential-store.ts; src/main/realtime/client-secret-broker.ts; tests/unit/realtime-client-secret-broker.test.ts; tests/unit/realtime-credential-import.test.ts; tests/unit/realtime-privacy-flags.test.ts
skills: .agents/skills/mm-phase-workflow/SKILL.md; .agents/skills/mm-invariants/SKILL.md; .agents/skills/mm-electron-foundation/SKILL.md; .agents/skills/mm-realtime-voice/SKILL.md
self_invariants: 1, 9, 10, 11, 12
evidence: exact changed paths, concise diff summary, read/diff/scope/self-review evidence, request metadata and failure reason enums, platform boundary and unresolved risks; no secret values and no validation command run by the implementer
self_review: read the own diff/output; no more than 3 passes
root_review: external root gate after return; not part of self-review
~~~

**Exact GREEN tester commands:**

~~~powershell
.\node_modules\.bin\vitest.cmd run tests/unit/realtime-client-secret-broker.test.ts tests/unit/realtime-credential-import.test.ts tests/unit/realtime-privacy-flags.test.ts --reporter=verbose
npm run typecheck:node
~~~

**Invariant IDs:** 1, 9, 10, 11, 12.

**Non-goals:** No renderer secret storage, no RealtimeSession construction,
no real network credential check, no worker/test read of the real `.env` and no
startup auto-read, no custom credential backend, no keytar, no credential
export, no Console visual UI.

**Affected demos:** Enables the real credential path for P1-D1, P1-D2, and
P1-D5; deterministic demos use injected fetch and never require a credential.

**Root review checklist:**

- The long key is decrypted and used only in Main; no IPC payload, event,
  telemetry field, log, SQLite row, export, or test output contains it.
- POST path, configured model, expiry, response validation, and injected fetch
  are exact.
- All three environment flags are set before SDK use.
- Synthetic `.env` fixture is isolated; no command, test, or worker reads the real workspace `.env`, and no evidence claims its value was inspected.
- Missing/failed credential is visible and never triggers model substitution.
- Windows DPAPI and target macOS Keychain are described as distinct evidence
  boundaries; no Windows result claims Keychain.

**Integration/commit boundary:** Root integrates the exact paths after review
with local commit feat(phase1): add Main credential broker. No push or tag.

### P1-U3 deterministic RealtimeSession/WebRTC adapter + official ScriptedRealtimeTransport

**Size:** 1.5–2 working days.

**Story/outcome:** As a visitor, I need a real official RealtimeSession over
WebRTC with configured Persona/model/transcription settings, while CI and
failure demos use the official deterministic transport rather than network
calls.

**Exact production paths:**

- Create src/renderer/realtime/realtime-session-adapter.ts for the single
  RealtimeSession lifecycle handle and session ID binding.
- Create src/renderer/realtime/realtime-transport.ts for the WebRTC transport
  construction that receives the app MediaStream and SDK audio element.
- Extend src/shared/bridge.ts with the narrow mirror-only transient client-secret
  request/result contract; no Console bridge method carries the secret.
- Extend src/main/ipc.ts with a sender-authorized mirror-only handler that obtains
  a secret from Main for the immediate session start and rejects Console/visitor
  senders.
- Extend src/main/boot.ts only to compose that existing Main broker handoff and
  preserve Main lifecycle/model/credential authority.
- Extend src/preload/mirror.ts with only the typed transient handoff method;
  ipcRenderer is never exposed wholesale.
- Create src/shared/realtime-events.ts for allowlisted metadata event
  names and stale-session filtering inputs.

**Exact test paths:**

- Create tests/unit/realtime-session-adapter.test.ts.
- Create tests/unit/realtime-scripted-transport.test.ts.
- Create tests/integration/realtime-contract.test.ts for the live contract
  shape; the real operator run is P1-D5, not a CI fake.

**Interfaces consumed and produced:**

- Consume SessionModelSnapshot from P1-U1, the Main-owned ClientSecretBroker
  result from P1-U2 via the narrow mirror IPC/preload handoff, and the app-owned
  MediaStream/audio element from P1-U4's boundary.
- Produce createRealtimeSession({ snapshot, clientSecret, mediaStream,
  audioElement, sessionId, eventSink }): RealtimeSessionHandle.
- The mirror-only handoff is transient and sender-authorized; Console IPC has no
  equivalent method and no credential value is written to renderer storage,
  telemetry, SQLite, logs, or exports.
- Use official imports from @openai/agents/realtime and the pinned official
  ScriptedRealtimeTransport testing export. Do not implement a custom
  scripted transport.
- The constructor passes model and all config; connect passes only the
  documented apiKey argument.

**Constructor contract sketch:**

~~~ts
const transport = new OpenAIRealtimeWebRTC({ mediaStream, audioElement });
const session = new RealtimeSession(agent, {
  transport,
  model: snapshot.realtimeDialogue,
  historyStoreAudio: false,
  tracingDisabled: true,
  config: {
    tracing: null,
    audio: {
      input: {
        transcription: { model: snapshot.inputTranscription },
        turnDetection: snapshot.turnDetectionProfile
      },
      output: { voice: snapshot.voice }
    },
    reasoning: { effort: snapshot.reasoningEffort }
  }
});
await session.connect({ apiKey: clientSecret });
~~~

The exact pinned SDK option nesting is frozen by the live contract test; the
non-negotiable semantics are constructor-owned config, explicit IDs, explicit
privacy flags, and no config argument to connect.

**Console/telemetry increment:** Emit realtime_session_created,
realtime_connect_started, realtime_ready, realtime_connect_failed,
realtime_stale_event, and realtime_disconnect with realtimeSessionId,
sessionGeneration, configured role IDs, revision, SDK version, status, reason,
and latency. Never emit event payload content.

**Happy-path tests:**

- ScriptedRealtimeTransport creates a session using the same adapter contract
  as WebRTC and emits ready/response/interruption/completion outcomes.
- Constructor receives the snapshot model, voice, transcription, turn
  detection, historyStoreAudio false, tracingDisabled true, and tracing null.
- connect receives only the short-lived apiKey and transitions to ready with
  the current realtimeSessionId.
- A response can begin before completed transcription without waiting.
- Real contract test asserts gpt-realtime-2.1 and gpt-live-transcribe arrive
  from the configured snapshot, not a source literal.

**Failure/fallback tests:**

- Scripted connect, ICE, and active disconnect outcomes close the handle and
  emit a reason without a retry maze.
- A stale event with an old realtimeSessionId is ignored and logged; changing
  sessionGeneration alone does not make an event current.
- A configured model failure returns failure/OfflineLoop input and never
  substitutes another ID.
- A constructor/config mismatch or connect(config) attempt fails the contract.
- Scripted tests never claim real OpenAI D1/D2/D5 evidence.

**Exact RED implementer dispatch boundary:**

~~~text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: "implementer"
fresh_worker: true
task: RED only for P1-U3. Add failing adapter and official ScriptedRealtimeTransport contract tests for constructor-owned config, explicit configured model/transcription IDs, connect apiKey-only arguments, realtimeSessionId stale-event filtering, scripted failure outcomes, and the mirror-only sender-authorized transient secret handoff. Do not implement the adapter or edit audio/lifecycle/UI paths.
write_scope: tests/unit/realtime-session-adapter.test.ts; tests/unit/realtime-scripted-transport.test.ts; tests/integration/realtime-contract.test.ts
skills: .agents/skills/mm-phase-workflow/SKILL.md; .agents/skills/mm-invariants/SKILL.md; .agents/skills/mm-realtime-voice/SKILL.md
self_invariants: 1, 8, 9, 10, 11, 12
evidence: exact test paths, diff summary, read/diff/scope/self-review evidence, expected RED failure reason, metadata-only risks; no validation command is run by the implementer
self_review: read the own diff/output; no more than 3 passes
root_review: external root gate after return; not part of self-review
~~~

**Exact RED tester command:**

~~~powershell
.\node_modules\.bin\vitest.cmd run tests/unit/realtime-session-adapter.test.ts tests/unit/realtime-scripted-transport.test.ts tests/integration/realtime-contract.test.ts --reporter=verbose
~~~

**Expected RED reason:** FAIL because the adapter and official transport
construction do not yet exist, so constructor/config/session-ID assertions
cannot be satisfied.

**Exact GREEN implementer dispatch boundary:**

~~~text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: "implementer"
fresh_worker: true
task: GREEN P1-U3. Implement only the official RealtimeSession/WebRTC adapter, deterministic official ScriptedRealtimeTransport path, and narrow mirror-only transient secret handoff required by the RED tests. Keep config in the constructor, use configured IDs only, pass only documented short-lived connect arguments, bind realtimeSessionId as the authoritative stale key, enforce sender authorization, and emit metadata-only outcomes. Do not implement mic release, playback clock, outage recovery, Console UI, or demo records.
write_scope: src/shared/bridge.ts; src/main/ipc.ts; src/main/boot.ts; src/preload/mirror.ts; src/renderer/realtime/realtime-session-adapter.ts; src/renderer/realtime/realtime-transport.ts; src/shared/realtime-events.ts; tests/unit/realtime-session-adapter.test.ts; tests/unit/realtime-scripted-transport.test.ts; tests/integration/realtime-contract.test.ts
skills: .agents/skills/mm-phase-workflow/SKILL.md; .agents/skills/mm-invariants/SKILL.md; .agents/skills/mm-realtime-voice/SKILL.md
self_invariants: 1, 8, 9, 10, 11, 12
evidence: exact paths, concise diff summary, read/diff/scope/self-review evidence, SDK import/export names, session outcome enums, sender-authorization outcome, metadata-only risks; validation output is tester-owned and not run by the implementer
self_review: read the own diff/output; no more than 3 passes
root_review: external root gate after return; not part of self-review
~~~

**Exact GREEN tester commands:**

~~~powershell
.\node_modules\.bin\vitest.cmd run tests/unit/realtime-session-adapter.test.ts tests/unit/realtime-scripted-transport.test.ts tests/integration/realtime-contract.test.ts --reporter=verbose
npm run typecheck:web
npm run typecheck:node
~~~

**Invariant IDs:** 1, 8, 9, 10, 11, 12.

**Non-goals:** No real operator credential run, no mic ownership release,
no playback completion fallback, no recovery schedule, no transcript panel,
no Persona editor, no profile IDs, no tools, no memory, and no scene handling.

**Affected demos:** P1-D1 and P1-D2 use real WebRTC; P1-D3/D4/D6 use
ScriptedRealtimeTransport; P1-D5 uses the live contract path.

**Root review checklist:**

- SDK imports point only to the exact 0.16.1 official paths, including the
  official ScriptedRealtimeTransport export.
- The transient client-secret path exists only for the authorized mirror sender;
  Console sender authorization rejects it and no preload exposes ipcRenderer.
- RealtimeSession constructor owns config and explicit privacy flags; connect
  does not receive config.
- All runtime role IDs come from SessionModelSnapshot; no model literal or
  fallback is present.
- realtimeSessionId, not sessionGeneration, is the stale-event authority.
- The adapter does not persist audio, transcript, raw events, or credentials.
- Scripted tests are clearly deterministic and cannot be reported as real.

**Integration/commit boundary:** Root integrates the listed adapter/event/test
paths after review with local commit
feat(phase1): add official realtime session adapter. No push or tag.

### P1-U4 one microphone owner + one audible output + playback completion

**Size:** 1–1.5 working days.

**Story/outcome:** As a visitor, I need reliable microphone ownership and one
audible Realtime output path, so interruption, shutdown, and future Phase 2
handoff do not leave a busy microphone or double audio.

**Exact production paths:**

- Create src/renderer/realtime/mic-owner.ts with the Phase 1 owner enum
  none/realtime and explicit acquire/release operations.
- Create src/renderer/realtime/realtime-audio-output.ts with the SDK audio
  element, its unmuted output, and the silent analyser tap.
- Create src/renderer/realtime/playback-completion.ts with the raw
  output_audio_buffer.stopped listener and bounded analyser fallback.

**Exact test paths:**

- Create tests/unit/realtime-audio-ownership.test.ts.
- Create tests/unit/realtime-playback-completion.test.ts.

**Interfaces consumed and produced:**

- Consume the RealtimeSessionHandle from P1-U3 and the app-owned
  MediaStream/audio element boundary.
- Produce MicOwner.acquire(stream): Promise<void>,
  MicOwner.release(reason): Promise<void>, and
  PlaybackCompletion.waitForActualEnd(signal): Promise<{ source:
  'output_audio_buffer.stopped'|'bounded_analyser_fallback'; reason?: string }>.
- release must close the session before stopping every stream track and
  returning owner none. A failed handoff is a local Maintenance reason for
  P1-U5, not an OfflineLoop reason.

**Audio graph contract:**

~~~text
Realtime remote stream -> SDK audio element (unmuted, sole audible output)
                       -> analyser tap (measurement only, no destination)
~~~

**Console/telemetry increment:** Add audio owner, track count, output path,
playback completion source, fallback count, and handoff status to the existing
Voice/Audio cards. Emit mic_acquired, mic_released, mic_handoff_failed,
playback_completed, and playback_completion_fallback with counts, source,
duration, status, and reason only.

**Happy-path tests:**

- none -> realtime acquire succeeds once and exposes an app-owned stream.
- release closes the session and calls stop on every microphone track before
  owner becomes none.
- A second owner acquisition is rejected while realtime owns the mic.
- output_audio_buffer.stopped resolves actual playback completion, and the
  analyser is not connected to destination.
- AI volume/mute controls affect the single audio element only.

**Failure/fallback tests:**

- Track-stop or release failure is visible as mic_handoff_failed and cannot
  silently allow a second owner.
- A delayed primary playback event uses the bounded analyser fallback, records
  the fallback source/reason, and resolves within the bound.
- A duplicate audio route or analyser-to-destination connection fails the graph
  assertion.
- Closing the SDK session alone is insufficient; the test must fail if any
  app-owned track remains live.

**Exact RED implementer dispatch boundary:**

~~~text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: "implementer"
fresh_worker: true
task: RED only for P1-U4. Add failing mic-owner and playback-completion tests covering one owner, explicit track.stop release, one audible SDK audio element, silent analyser, primary output_audio_buffer.stopped, and bounded visible fallback. Do not implement production audio or modify lifecycle/SDK adapter/UI.
write_scope: tests/unit/realtime-audio-ownership.test.ts; tests/unit/realtime-playback-completion.test.ts
skills: .agents/skills/mm-phase-workflow/SKILL.md; .agents/skills/mm-invariants/SKILL.md; .agents/skills/mm-realtime-voice/SKILL.md; .agents/skills/mm-electron-foundation/SKILL.md
self_invariants: 1, 8, 9, 10
evidence: exact test paths, diff summary, read/diff/scope/self-review evidence, expected RED failure reason, metadata-only risks; no validation command is run by the implementer
self_review: read the own diff/output; no more than 3 passes
root_review: external root gate after return; not part of self-review
~~~

**Exact RED tester command:**

~~~powershell
.\node_modules\.bin\vitest.cmd run tests/unit/realtime-audio-ownership.test.ts tests/unit/realtime-playback-completion.test.ts --reporter=verbose
~~~

**Expected RED reason:** FAIL because the owner, audio graph, track cleanup,
and playback-completion modules are not yet present.

**Exact GREEN implementer dispatch boundary:**

~~~text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: "implementer"
fresh_worker: true
task: GREEN P1-U4. Implement only the mic owner, single audible output graph, raw playback completion, and bounded fallback required by the RED tests. Use the app-owned MediaStream and the P1-U3 session handle. Do not add wake ownership, recovery scheduling, transcript persistence, music, avatar, or UI.
write_scope: src/renderer/realtime/mic-owner.ts; src/renderer/realtime/realtime-audio-output.ts; src/renderer/realtime/playback-completion.ts; tests/unit/realtime-audio-ownership.test.ts; tests/unit/realtime-playback-completion.test.ts
skills: .agents/skills/mm-phase-workflow/SKILL.md; .agents/skills/mm-invariants/SKILL.md; .agents/skills/mm-realtime-voice/SKILL.md; .agents/skills/mm-electron-foundation/SKILL.md
self_invariants: 1, 8, 9, 10
evidence: exact paths, concise diff summary, read/diff/scope/self-review evidence, owner/source enums, track-stop evidence counts, metadata-only risks; validation output is tester-owned and not run by the implementer
self_review: read the own diff/output; no more than 3 passes
root_review: external root gate after return; not part of self-review
~~~

**Exact GREEN tester commands:**

~~~powershell
.\node_modules\.bin\vitest.cmd run tests/unit/realtime-audio-ownership.test.ts tests/unit/realtime-playback-completion.test.ts --reporter=verbose
npm run typecheck:web
~~~

**Invariant IDs:** 1, 8, 9, 10.

**Non-goals:** No wake worker, no Phase 2 handoff, no music graph, no Live2D,
no transcript mapping, no outage state machine, and no real hardware field
claim.

**Affected demos:** P1-D1/D2 use the real output path; P1-D3/D4 use
deterministic tracks; P1-D5 validates real configured audio; P1-D6 validates
playback boundary and rollover gating.

**Root review checklist:**

- There is exactly one Phase 1 microphone owner and every track is stopped on release.
- Session close and track stop are both present; close alone does not pass.
- The SDK audio element is unmuted and is the sole audible output.
- The analyser never connects to destination.
- output_audio_buffer.stopped is primary; fallback is bounded, visible, and
  metadata-only.
- Handoff failure maps to local Maintenance, not cloud OfflineLoop.

**Integration/commit boundary:** Root integrates the three production audio
paths and two tests with local commit
feat(phase1): enforce realtime audio ownership and playback boundary.

### P1-U5 lifecycle outage/OfflineLoop/recovery/manual wake/rollover

**Size:** 1.5–2 working days.

**Story/outcome:** As a visitor, I need cloud failure to become a visible
OfflineLoop quickly and recover to a clean Dormant state, while the operator
can start manually and a 60-minute session can roll over safely.

**Exact production paths:**

- Extend src/main/lifecycle.ts only at the existing seven-state transition
  boundary.
- Extend src/main/boot.ts for the existing OfflineLoop entry/composition and
  Main privacy/session setup.
- Create src/main/realtime/outage-recovery.ts for failure cleanup, bounded
  probes, manual start/stop routing, and rollover coordination.
- Create src/shared/realtime-recovery.ts for failure/recovery/rollover enums
  and timing constants.
- Extend src/shared/realtime-events.ts only for the narrow outage/rollover
  metadata callback contract.
- Extend src/renderer/realtime/realtime-session-adapter.ts only for the narrow
  outage/rollover callback needed to close, replace, and stale-filter sessions.

**Exact test paths:**

- Create tests/unit/realtime-outage-recovery.test.ts.
- Create tests/unit/realtime-rollover.test.ts.
- Create tests/integration/phase1-recovery.test.ts.

**Interfaces consumed and produced:**

- Consume the P1-U3 session handle, P1-U4 MicOwner and PlaybackCompletion,
  P1-U1 SessionModelSnapshot factory, P1-U2 ClientSecretBroker, and existing
  Main lifecycle/OfflineLoop services.
- Produce handleRealtimeFailure({ kind, realtimeSessionId, reason }),
  manualStart(), manualStop(), scheduleRecoveryProbes(), and
  rolloverAtSafeBoundary().
- Main state remains authoritative. A current session event is accepted only
  when realtimeSessionId matches. A generation counter is diagnostic metadata.

**Failure cleanup ordering:**

~~~text
failure received
  -> stop AI output and mouth/audio state
  -> close current RealtimeSession
  -> stop every app-owned microphone track and release owner
  -> clear active owner and RAM transcript state
  -> transition to offlineLoop
  -> show/continue local OfflineLoop within 5000 ms
~~~

Recovery probes wait 5, 15, 30, and 60 seconds. A successful lightweight
probe stops the loop and transitions to dormant; it never recreates a full
Realtime session. Manual Start is the only next session creation.

Rollover waits for the current user turn and PlaybackCompletion primary/fallback
boundary, mints a new client secret, creates a new RealtimeSession using the
current Published Active snapshot, and changes realtimeSessionId. It never
calls reconnect and never buffers new speech across the boundary.

**Console/telemetry increment:** Emit realtime_failure_entered,
offline_loop_started, recovery_probe, recovery_dormant,
manual_realtime_start, manual_realtime_stop, and realtime_rollover with
failure kind, session ID, probe delay, status, config revision, model role IDs,
source, and reason. Add visible state/reason to Mirror and Console. No full
error, transcript, audio, or secret.

**Happy-path tests:**

- Manual Start moves dormant -> activating -> active only after mic and
  Realtime ready.
- Deterministic connect failure enters offlineLoop within the 5-second bound.
- Deterministic active disconnect stops audio, closes session, clears RAM state,
  and enters offlineLoop.
- Recovery probes use exactly 5/15/30/60 seconds, then dormant; manual Start
  creates a fresh session and no old session resumes.
- Rollover waits for turn/playback completion, issues a new secret, creates a
  fresh session with current Published Active, and uses a new session ID.

**Failure/fallback tests:**

- Connect, ICE, active disconnect, mic release, and playback-boundary failures
  all produce visible reasoned outcomes; local mic failure is Maintenance.
- A failed probe does not create a full Realtime session or retry forever.
- A mid-session Publish does not alter the live snapshot; rollover sees only
  the Published Active snapshot at rollover creation.
- A stale failure from an old realtimeSessionId cannot take a newer session
  offline.
- No app.relaunch call or second restart owner is introduced.

**Exact RED implementer dispatch boundary:**

~~~text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: "implementer"
fresh_worker: true
task: RED only for P1-U5. Add failing lifecycle/recovery and rollover tests for connect/ICE/active failures, OfflineLoop <=5s, cleanup ordering, 5/15/30/60 probes, manual Start, fresh-session recovery, 60-minute new-secret/current-Published rollover, authoritative realtimeSessionId, and no reconnect/relaunch. Do not implement production recovery.
write_scope: tests/unit/realtime-outage-recovery.test.ts; tests/unit/realtime-rollover.test.ts; tests/integration/phase1-recovery.test.ts
skills: .agents/skills/mm-phase-workflow/SKILL.md; .agents/skills/mm-invariants/SKILL.md; .agents/skills/mm-electron-foundation/SKILL.md; .agents/skills/mm-realtime-voice/SKILL.md
self_invariants: 1, 8, 9, 10, 11, 12
evidence: exact test paths, diff summary, read/diff/scope/self-review evidence, expected RED failure reason, metadata-only risks; no validation command is run by the implementer
self_review: read the own diff/output; no more than 3 passes
root_review: external root gate after return; not part of self-review
~~~

**Exact RED tester command:**

~~~powershell
.\node_modules\.bin\vitest.cmd run tests/unit/realtime-outage-recovery.test.ts tests/unit/realtime-rollover.test.ts tests/integration/phase1-recovery.test.ts --reporter=verbose
~~~

**Expected RED reason:** FAIL because the Phase 1 recovery controller,
failure ordering, bounded probes, manual start path, and rollover coordinator
are not yet present.

**Exact GREEN implementer dispatch boundary:**

~~~text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: "implementer"
fresh_worker: true
task: GREEN P1-U5. Implement only the outage/recovery/manual-start/stop/rollover behavior required by the RED tests, extending the existing Main lifecycle and OfflineLoop plus the narrow shared-event and adapter callback seams. Keep realtimeSessionId authoritative, sessionGeneration diagnostic, recovery probes lightweight and bounded, rollover new-secret/new-session only, and preserve LaunchAgent-only restart ownership. Do not implement Console visual controls, transcripts, avatar, identity, memory, scenes, or wake worker.
write_scope: src/main/lifecycle.ts; src/main/boot.ts; src/main/realtime/outage-recovery.ts; src/shared/realtime-recovery.ts; src/shared/realtime-events.ts; src/renderer/realtime/realtime-session-adapter.ts; tests/unit/realtime-outage-recovery.test.ts; tests/unit/realtime-rollover.test.ts; tests/integration/phase1-recovery.test.ts
skills: .agents/skills/mm-phase-workflow/SKILL.md; .agents/skills/mm-invariants/SKILL.md; .agents/skills/mm-electron-foundation/SKILL.md; .agents/skills/mm-realtime-voice/SKILL.md
self_invariants: 1, 8, 9, 10, 11, 12
evidence: exact paths, concise diff summary, read/diff/scope/self-review evidence, state/timing/session-ID evidence, platform boundary, metadata-only risks; validation output is tester-owned and not run by the implementer
self_review: read the own diff/output; no more than 3 passes
root_review: external root gate after return; not part of self-review
~~~

**Exact GREEN tester commands:**

~~~powershell
.\node_modules\.bin\vitest.cmd run tests/unit/realtime-outage-recovery.test.ts tests/unit/realtime-rollover.test.ts tests/integration/phase1-recovery.test.ts --reporter=verbose
npm run typecheck:node
npm run typecheck:web
~~~

**Invariant IDs:** 1, 8, 9, 10, 11, 12.

**Non-goals:** No wake worker or wake-to-Realtime handoff, no 300-second idle
timer, no avatar state machine, no profile switch, no memory job, no scene,
no app.relaunch, no LaunchAgent creation, and no macOS field verification.

**Affected demos:** P1-D3 deterministic connect outage, P1-D4 deterministic
active outage/recovery/manual new start, and P1-D6 deterministic snapshot and
rollover boundary. Manual Start is also the entry for real D1/D2/D5.

**Root review checklist:**

- All three failure types stop audio, close the session, stop tracks, clear
  RAM state, and reach visible OfflineLoop within five seconds.
- Probe schedule is exactly 5/15/30/60 seconds and never creates a full
  session; success ends in Dormant and requires manual Start.
- Rollover waits for actual playback completion, mints a new secret, uses a new
  session ID and current Published Active, and never calls reconnect.
- Old session events cannot affect the current session.
- Manual stop and cloud failure have distinct expected lifecycle outcomes.
- No second restart owner or app.relaunch appears in the changed paths.

**Integration/commit boundary:** Root integrates the listed paths with local
commit feat(phase1): add visible realtime outage recovery and rollover.

### P1-U6 interruption/final-transcript RAM mapping and cleanup

**Size:** 1–1.5 working days.

**Story/outcome:** As a visitor, I need automatic and manual interruption to
feel immediate while final transcript mapping remains available only in RAM for
the current session and is cleared on every close/failure boundary.

**Exact production paths:**

- Create src/renderer/realtime/transcript-buffer.ts for bounded item-ID to
  current-turn mapping.
- Create src/renderer/realtime/turn-controller.ts for VAD/manual interrupt,
  transcript-independent Voice progression, and transcript-dependent reason
  outcomes.
- Create src/renderer/realtime/session-cleanup.ts for deterministic RAM
  cleanup hooks invoked by close, stop, OfflineLoop, rollover, and restart.
- Extend src/shared/console-types.ts with the bounded current-session transcript
  projection shape only.
- Extend src/main/console-data.ts with the narrow opt-in RAM projection only;
  it must never read or write SQLite, telemetry persistence, exports, or disk.

**Exact test paths:**

- Create tests/unit/realtime-transcript-buffer.test.ts.
- Create tests/unit/realtime-interruption.test.ts.
- Create tests/unit/realtime-privacy-cleanup.test.ts.

**Interfaces consumed and produced:**

- Consume P1-U3 event adapter, P1-U4 playback/volume boundary, and P1-U5
  cleanup callbacks.
- Produce TranscriptBuffer.addCompleted({ itemId, turnId, transcript }),
  TranscriptBuffer.get(itemId), TranscriptBuffer.clear(reason), and
  TurnController.onUserSpeechStarted(), onCompletedTranscript(), interrupt().
- The buffer is bounded to the current session and may hold final transcript
  text in RAM for the Console panel; no persistence or telemetry serializer can
  accept its content.

**Console/telemetry increment:** Add transcript_available,
transcript_unavailable, interruption_requested, interruption_completed, and
transcript_buffer_cleared metadata events with item/turn counts, latency,
session ID, status, and reason. The Console panel receives RAM values only
through the current authorized session view and never through persisted
telemetry.

**Happy-path tests:**

- A completed item ID maps to the correct current turn and remains available
  only until session cleanup.
- Voice response progression starts before transcript completion.
- SDK VAD interruption and manual interrupt both stop current AI output and
  permit a new turn.
- Clear removes every mapped item and current transcript view at close,
  manual stop, OfflineLoop, rollover, and renderer restart.

**Failure/fallback tests:**

- Missing or failed completed transcription emits transcript_unavailable,
  leaves Voice running, and disables only transcript-dependent behavior.
- An item ID from a stale realtimeSessionId is ignored and cannot populate the
  current buffer.
- A buffer-overflow policy drops the oldest entry with a visible metadata
  reason; it never writes the dropped text to disk.
- Transcript text is absent from telemetry, SQLite, export, and error output.

**Exact RED implementer dispatch boundary:**

~~~text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: "implementer"
fresh_worker: true
task: RED only for P1-U6. Add failing transcript-buffer, interruption, and cleanup tests for item-ID mapping, no transcript wait, VAD/manual interrupt, transcript_unavailable degradation, stale-session rejection, bounded RAM clearing, zero persistence, and the narrow opt-in Console RAM projection. Do not implement production code or edit Console UI.
write_scope: tests/unit/realtime-transcript-buffer.test.ts; tests/unit/realtime-interruption.test.ts; tests/unit/realtime-privacy-cleanup.test.ts
skills: .agents/skills/mm-phase-workflow/SKILL.md; .agents/skills/mm-invariants/SKILL.md; .agents/skills/mm-realtime-voice/SKILL.md
self_invariants: 1, 4, 5, 6, 9, 10, 11, 12
evidence: exact test paths, diff summary, read/diff/scope/self-review evidence, expected RED failure reason, metadata-only risks; no validation command is run by the implementer
self_review: read the own diff/output; no more than 3 passes
root_review: external root gate after return; not part of self-review
~~~

**Exact RED tester command:**

~~~powershell
.\node_modules\.bin\vitest.cmd run tests/unit/realtime-transcript-buffer.test.ts tests/unit/realtime-interruption.test.ts tests/unit/realtime-privacy-cleanup.test.ts --reporter=verbose
~~~

**Expected RED reason:** FAIL because the RAM transcript buffer,
interruption controller, and unified cleanup hooks do not yet exist.

**Exact GREEN implementer dispatch boundary:**

~~~text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: "implementer"
fresh_worker: true
task: GREEN P1-U6. Implement only the RAM-only transcript mapping, automatic/manual interruption, transcript-independent Voice progression, transcript_unavailable degradation, session cleanup, and narrow opt-in Main/Console RAM projection required by the RED tests. Do not add persistence, memory extraction, scenes, identity, avatar, or new IPC.
write_scope: src/renderer/realtime/transcript-buffer.ts; src/renderer/realtime/turn-controller.ts; src/renderer/realtime/session-cleanup.ts; src/shared/console-types.ts; src/main/console-data.ts; tests/unit/realtime-transcript-buffer.test.ts; tests/unit/realtime-interruption.test.ts; tests/unit/realtime-privacy-cleanup.test.ts
skills: .agents/skills/mm-phase-workflow/SKILL.md; .agents/skills/mm-invariants/SKILL.md; .agents/skills/mm-realtime-voice/SKILL.md
self_invariants: 1, 4, 5, 6, 9, 10, 11, 12
evidence: exact paths, concise diff summary, read/diff/scope/self-review evidence, buffer bounds, cleanup boundary counts, metadata-only risks; validation output is tester-owned and not run by the implementer
self_review: read the own diff/output; no more than 3 passes
root_review: external root gate after return; not part of self-review
~~~

**Exact GREEN tester commands:**

~~~powershell
.\node_modules\.bin\vitest.cmd run tests/unit/realtime-transcript-buffer.test.ts tests/unit/realtime-interruption.test.ts tests/unit/realtime-privacy-cleanup.test.ts --reporter=verbose
npm run typecheck:web
~~~

**Invariant IDs:** 1, 4, 5, 6, 9, 10, 11, 12. IDs 4–6 are preserved as
future-safe boundaries: Phase 1 does not implement profile or memory behavior,
but this unit must not create an API that would bypass their clean-session,
owner-snapshot, or control-turn rules.

**Non-goals:** No persisted transcript, audio recording, memory extraction,
identity confirmation, profile switch, spell matching, scene, avatar lipsync,
or remote transcript history.

**Affected demos:** P1-D1/D2 use real interruption and transcript hot path;
P1-D3/D4 verify cleanup; P1-D6 verifies stale mapping and session boundary.

**Root review checklist:**

- Transcript text exists only in bounded current-session RAM and is cleared at every close/failure boundary.
- Voice response is not blocked by transcript completion.
- VAD and manual interruption both stop actual output and allow a new turn.
- Missing transcription is visible and does not gate conversation.
- No transcript text, audio, raw event, private context, or prompt is emitted or persisted.
- The unit does not accidentally implement identity, memory, spell, or scene behavior.

**Integration/commit boundary:** Root integrates the three renderer realtime
paths with local commit feat(phase1): keep transcripts in RAM and support
realtime interruption.

### P1-U7 Console voice controls/persona/credential/model/RAM transcript view

**Size:** 1.5–2 working days.

**Story/outcome:** As a local operator, I need to start, interrupt, stop,
inspect, configure, and diagnose Phase 1 voice without receiving secrets,
raw model configuration, public profile IDs, or persisted transcript content.

**Exact production paths:**

- Extend src/renderer/console/App.tsx and src/renderer/console/App.css in the
  existing single Console surface with Start, Interrupt, Stop, connection/
  outage status, model cards, Persona Draft/Publish controls, credential
  status, and the opt-in bounded current-session RAM transcript panel. Do not
  split the current Console into additional page files.
- Extend src/shared/console-types.ts with narrow metadata/status and bounded
  RAM projection types only.
- Extend src/shared/bridge.ts with sender-authorized, narrow Console voice
  request/result types; no secret-bearing method is added to Console.
- Extend src/main/console-data.ts with metadata-only voice status/actions,
  credential status, loaded snapshot projection, bounded RAM transcript
  projection, and Phase 1 event projection.
- Extend src/main/ipc.ts with sender-authorized Console handlers for those
  status/actions while preserving the existing mirror/Console separation.
- Extend src/preload/console.ts with only those typed methods; never expose
  ipcRenderer wholesale or a raw Main object.
- Extend src/main/console-config.ts only if the existing Draft/Publish
  controller needs a narrow Persona/voice contract gap closure; do not create
  a second config controller.

**Exact test paths:**

- Create tests/unit/console-realtime-voice.test.ts.
- Create tests/integration/console-realtime-ipc.test.ts.

**Interfaces consumed and produced:**

- Consume P1-U1 snapshot, P1-U2 credential status/broker, P1-U3 session
  handle, P1-U5 Main lifecycle/recovery actions, and P1-U6 RAM transcript
  view.
- Produce typed Console actions startRealtime(), interruptRealtime(),
  stopRealtime(), editPersonaDraft(), publishPersona(), replaceCredential(),
  importCredentialOnce(), and typed projections
  getVoiceStatus()/getLoadedModelSnapshot()/getRamTranscriptView().
- Every handler validates senderFrame/webContents authorization before action.
  Credential actions return metadata statuses only. Transcript view is cleared
  with the session cleanup path and is never serialized by Console events.

**Console/telemetry increment:** This is the main Phase 1 Console increment:
voice status, manual controls, Persona Draft editing, credential present/
replace/import, loaded model snapshot, SDK/contract result, connection latency,
interrupt status, outage reason, and the bounded current-session RAM transcript
panel. The existing Overview, Events, Models, Config, Simulator, and Phase Tests
pages remain one Console, not parallel services.

**Happy-path tests:**

- Authorized Console sender can start, interrupt, and stop a session and see
  ready/active/stopped metadata.
- Models card distinguishes Draft, Published Active, Runtime loaded, and
  Previous, including pending next session after Publish.
- Authorized Persona edit validates and publishes a Draft; the current session
  remains on its original snapshot.
- Credential present/replace/import actions return status only and never reveal a key.
- RAM transcript panel displays bounded current-session entries and clears on stop.

**Failure/fallback tests:**

- Visitor sender cannot invoke Console/admin handlers; unauthorized sender is
  rejected with metadata reason.
- Invalid Persona Draft leaves Active unchanged and shows the field reason.
- Missing/failed credential shows a visible status and does not permit model substitution.
- Console cannot request raw model config, profile IDs, long key, client secret
  persistence, SQLite access, or transcript export.
- Starting during OfflineLoop does not bypass recovery/manual-start rules.
- Closing Console or restarting the renderer clears the RAM transcript panel.

**Exact RED implementer dispatch boundary:**

~~~text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: "implementer"
fresh_worker: true
task: RED only for P1-U7. Add failing sender-authorized IPC and existing-Console projection tests for manual Start/Interrupt/Stop, Persona Draft publish boundary, credential status/import action without secrets, model snapshot cards, and bounded RAM transcript clearing. Do not implement production IPC, preload, or UI.
write_scope: tests/unit/console-realtime-voice.test.ts; tests/integration/console-realtime-ipc.test.ts
skills: .agents/skills/mm-phase-workflow/SKILL.md; .agents/skills/mm-invariants/SKILL.md; .agents/skills/mm-electron-foundation/SKILL.md; .agents/skills/mm-realtime-voice/SKILL.md
self_invariants: 1, 3, 9, 10, 11, 12
evidence: exact test paths, diff summary, read/diff/scope/self-review evidence, expected RED failure reason, metadata-only risks; no validation command is run by the implementer
self_review: read the own diff/output; no more than 3 passes
root_review: external root gate after return; not part of self-review
~~~

**Exact RED tester command:**

~~~powershell
.\node_modules\.bin\vitest.cmd run tests/unit/console-realtime-voice.test.ts tests/integration/console-realtime-ipc.test.ts --reporter=verbose
~~~

**Expected RED reason:** FAIL because the Phase 1 Console voice projection,
typed actions, and sender-authorized bridge methods do not yet exist.

**Exact GREEN implementer dispatch boundary:**

~~~text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: "implementer"
fresh_worker: true
task: GREEN P1-U7. Implement only the existing Console App.tsx/App.css, Main/IPC/preload, and shared-type extensions required by the RED tests. Keep Main authoritative, validate senders, expose status/actions only, keep Persona editing in versioned Draft/Publish, and keep transcripts RAM-only. Extend the existing config controller only if a narrow gap is proven; do not create split page files, remote admin, profile identity, memory, scenes, or a second backend.
write_scope: src/renderer/console/App.tsx; src/renderer/console/App.css; src/shared/console-types.ts; src/shared/bridge.ts; src/main/console-data.ts; src/main/ipc.ts; src/preload/console.ts; src/main/console-config.ts (only if a narrow existing-controller gap is proven); tests/unit/console-realtime-voice.test.ts; tests/integration/console-realtime-ipc.test.ts
skills: .agents/skills/mm-phase-workflow/SKILL.md; .agents/skills/mm-invariants/SKILL.md; .agents/skills/mm-electron-foundation/SKILL.md; .agents/skills/mm-realtime-voice/SKILL.md
self_invariants: 1, 3, 9, 10, 11, 12
evidence: exact paths, concise diff summary, read/diff/scope/self-review evidence, sender/auth outcomes, exposed field names, metadata-only risks; validation output is tester-owned and not run by the implementer
self_review: read the own diff/output; no more than 3 passes
root_review: external root gate after return; not part of self-review
~~~

**Exact GREEN tester commands:**

~~~powershell
.\node_modules\.bin\vitest.cmd run tests/unit/console-realtime-voice.test.ts tests/integration/console-realtime-ipc.test.ts --reporter=verbose
npm run typecheck:node
npm run typecheck:web
~~~

**Invariant IDs:** 1, 3, 9, 10, 11, 12. IDs 2, 4, and 5 remain
future-safe by preserving Main authority and the existing clean-session/
owner-snapshot interfaces; no identity or memory is implemented.

**Non-goals:** No remote Console, account/login system, profile ID display,
identity, memory, scenes, wake controls, audio persistence, transcript export,
raw config exposure, long-key exposure, public model router, or second IPC
authority.

**Affected demos:** All P1 demos are observed through the same Console;
manual Start drives P1-D1/D2/D5, Simulator drives D3/D4/D6, and Phase Tests
records are added only in P1-U8.

**Root review checklist:**

- Existing sender authorization remains enforced for every new handler.
- Renderer receives no long key, client secret beyond the transient start call,
  raw model configuration, profile ID, transcript storage handle, or DB handle.
- Voice controls map to Main/lifecycle actions and cannot bypass OfflineLoop.
- Persona editing uses Draft/Publish and does not retarget a live session.
- Model card distinguishes requested, Published Active, Runtime loaded, and Previous.
- RAM transcript view is bounded, clears on session cleanup, and never reaches persistence.
- Console remains the existing second BrowserWindow and does not become a backend.

**Integration/commit boundary:** Root integrates the exact Main/shared/preload/
Console paths with local commit feat(phase1): expose safe realtime voice Console
controls. No push or tag.

### P1-U8 deterministic demos/records/privacy/regression + real exit checkpoint

**Size:** 1.5–2 working days for implementation and deterministic tests; real
operator checkpoints are separately scheduled by root and are not faked by a
worker.

**Story/outcome:** As the root operator, I need repeatable Phase 1 demos,
exactly one authoritative record per attempt, privacy proof, prior-Phase
regression, and an explicit real-world checkpoint before Phase 1 can exit.

**Exact production paths:**

- Create src/main/phase1-demo-runner.ts with P1-D1 through P1-D6 definitions,
  source/mode distinction, deterministic injection, timing bounds, and
  metadata-only outcomes.
- Extend src/main/sqlite-service.ts, the existing authoritative SQLite Phase
  Tests API and phase_test_records table owner, with the Phase 1 phase/demo
  metadata migration and one-record-per-attempt behavior while preserving the
  existing table/service and Phase 0 rows. Do not create another DB, table,
  service, record store, config service, or telemetry service.
- Extend src/shared/console-types.ts with the Phase 1 record/Console projection
  types while preserving the existing Phase 0 record shape.
- Extend src/main/console-data.ts only for Phase 1 Phase Tests projections.
- Extend src/main/boot.ts only if existing Main-owned record append wiring is
  required; it remains the sole record writer boundary.
- Create scripts/run-phase1-demos.mjs as the operator/tester entrypoint; it
  uses existing app services and does not read the real workspace `.env`.

**Exact test paths:**

- Create tests/unit/phase1-demo-runner.test.ts.
- Create tests/unit/phase1-privacy-sentinel.test.ts.
- Create tests/unit/phase1-records.test.ts.
- Create tests/integration/phase1-demos.test.ts.
- Extend tests/unit/sqlite-phase-tests.test.ts with the Phase 1 migration,
  record-owner, and privacy-preservation assertions.

**Demo contracts:**

| ID | Mode/source | Required result |
|---|---|---|
| P1-D1 | Real/runtime | 20 Traditional-Chinese or mixed Chinese-English voice rounds through real OpenAI Realtime; no deadlock, duplicate playback, or session leak |
| P1-D2 | Real/runtime | 10 real barge-ins while AI speaks; actual AI audio stops and each new turn proceeds |
| P1-D3 | Deterministic/simulator | Inject connect failure; visible OfflineLoop within 5 seconds; one record with failure reason |
| P1-D4 | Deterministic/simulator | Inject Active disconnect; audio stops, state clears, recovery reaches Dormant, manual new Start succeeds; one record |
| P1-D5 | Real/contract_test plus runtime | Test Draft Realtime Dialogue/Input Transcription contract with real account, Publish, create next session, and prove requested IDs/revision; invalid Draft leaves Active unchanged |
| P1-D6 | Deterministic/contract_test | Publish during a scripted session; current session keeps original SessionModelSnapshot, forced new session/rollover uses newly Published Active |

P1-D1, P1-D2, and P1-D5 require an explicit operator checkpoint before
execution: credential status is present, network is available, the selected
microphone is identified and available, speakers are connected and audible,
the Console is open for live observation, and the operator has agreed that
the run is real. ScriptedRealtimeTransport, synthetic audio, or a deterministic
disconnect may not be reported as completion of these three real demos.

**Privacy sentinel contract:** Tests create an isolated synthetic secret
sentinel in RAM, run the session/Console/record/export paths, then scan
metadata-only event output, SQLite Phase Test rows, and diagnostic export
bytes. The sentinel count must be zero in every persisted/exported surface.
The same scan asserts zero transcript/audio/private-context fields and that
only metadata fields are serialized. The sentinel itself never appears in
worker evidence or command output.

**Record contract:** Each demo attempt writes exactly one row through the
existing Main-owned SQLite Phase Tests API and existing phase_test_records table
with phase, demo ID, attempt ID,
start/end metadata, mode, source, status, config revision/fingerprint, SDK
version, role model IDs, timing result, and reason code. Duplicate completion,
retry, or observer refresh cannot create a second row. No transcript, audio,
credential, client secret, private context, raw error, image, or embedding is
stored. The Phase 1 schema extension preserves Phase 0 records in the same
service/table and never introduces a parallel file or store.

**Console/telemetry increment:** Phase Tests shows six Phase 1 demos, real/
deterministic mode, latest attempt, status, build, config revision, SDK/model
metadata, timing, operator-checkpoint status, and reason. Events use source
runtime, simulator, or contract_test and never merge deterministic success
into real exit evidence.

**Happy-path tests:**

- Deterministic D3, D4, and D6 complete with the required visible states,
  bounded timing, session IDs, snapshot revisions, and exactly one record each.
- A second observer read does not create another record.
- The privacy sentinel is absent from logs/telemetry, SQLite, and export.
- Phase 0 regression demo tests still pass through the existing runner/store.

**Failure/fallback tests:**

- A deterministic demo that fails still creates one failed metadata record with
  a reason and no content.
- A real-demo run without the explicit checkpoint is refused as
  checkpoint_missing, not marked passed.
- A malformed/invalid Draft cannot produce a passed D5 or modify Active.
- A duplicated attempt ID is rejected or idempotently returns the existing
  single row without a second insert.
- The scan fails if any sentinel, transcript, audio, secret, private context,
  or raw error reaches logs, SQLite, or export.
- Windows-only execution is labeled Windows and cannot satisfy the target-Mac
  Keychain/TCC/signing/LaunchAgent checkpoint.

**Exact RED implementer dispatch boundary:**

~~~text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: "implementer"
fresh_worker: true
task: RED only for P1-U8. Add failing demo-runner, one-record Phase Test, privacy-sentinel, and Phase 0 regression tests for P1-D1 through P1-D6 metadata/mode boundaries, including the existing SQLite phase-record owner. Do not implement the runner, records, scripts, Console UI, or read the real workspace `.env`.
write_scope: tests/unit/phase1-demo-runner.test.ts; tests/unit/phase1-privacy-sentinel.test.ts; tests/unit/phase1-records.test.ts; tests/integration/phase1-demos.test.ts; tests/unit/sqlite-phase-tests.test.ts
skills: .agents/skills/mm-phase-workflow/SKILL.md; .agents/skills/mm-invariants/SKILL.md; .agents/skills/mm-electron-foundation/SKILL.md; .agents/skills/mm-realtime-voice/SKILL.md
self_invariants: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
evidence: exact test paths, diff summary, read/diff/scope/self-review evidence, expected RED failure reason, metadata-only risks; no validation command is run by the implementer
self_review: read the own diff/output; no more than 3 passes
root_review: external root gate after return; not part of self-review
~~~

**Exact RED tester command:**

~~~powershell
.\node_modules\.bin\vitest.cmd run tests/unit/phase1-demo-runner.test.ts tests/unit/phase1-privacy-sentinel.test.ts tests/unit/phase1-records.test.ts tests/integration/phase1-demos.test.ts tests/unit/sqlite-phase-tests.test.ts --reporter=verbose
~~~

**Expected RED reason:** FAIL because Phase 1 demo definitions, Phase Test
record extensions, privacy sentinel scan, and runner integration do not yet
exist.

**Exact GREEN implementer dispatch boundary:**

~~~text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: "implementer"
fresh_worker: true
task: GREEN P1-U8. Implement only the deterministic Phase 1 demo runner, the extension of the existing SQLite Phase Tests API/table and Console projection, privacy sentinel scan, and operator script required by the RED tests. Keep real D1/D2/D5 explicit and unfakeable, preserve one record per attempt, use metadata-only outputs, and keep Phase 0 records/regression intact. Do not create a second store/table/service, implement new product behavior, change packages, or make macOS field claims.
write_scope: src/main/phase1-demo-runner.ts; src/main/sqlite-service.ts; src/shared/console-types.ts; src/main/console-data.ts; src/main/boot.ts (only if record append wiring is required); scripts/run-phase1-demos.mjs; tests/unit/phase1-demo-runner.test.ts; tests/unit/phase1-privacy-sentinel.test.ts; tests/unit/phase1-records.test.ts; tests/integration/phase1-demos.test.ts; tests/unit/sqlite-phase-tests.test.ts
skills: .agents/skills/mm-phase-workflow/SKILL.md; .agents/skills/mm-invariants/SKILL.md; .agents/skills/mm-electron-foundation/SKILL.md; .agents/skills/mm-realtime-voice/SKILL.md
self_invariants: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
evidence: exact changed paths, concise diff summary, read/diff/scope/self-review evidence, demo modes/record-count design/privacy-count design/platform-label risks; validation output is tester-owned and not run by the implementer; metadata-only
self_review: read the own diff/output; no more than 3 passes
root_review: external root gate after return; not part of self-review
~~~

**Exact GREEN tester commands:**

~~~powershell
.\node_modules\.bin\vitest.cmd run tests/unit/phase1-demo-runner.test.ts tests/unit/phase1-privacy-sentinel.test.ts tests/unit/phase1-records.test.ts tests/integration/phase1-demos.test.ts tests/unit/sqlite-phase-tests.test.ts --reporter=verbose
npm test
npm run typecheck:node
npm run typecheck:web
npm run build
.\node_modules\.bin\vitest.cmd run tests/integration/phase0-demos.test.ts tests/unit/sqlite-phase-tests.test.ts --reporter=verbose
~~~

The final tester also runs the real operator checkpoints and six demo matrix
entries only after root authorizes them. All command stdout/stderr and exit
codes are returned in the ignored evidence directory. No current worker runs
these commands during plan authoring.

**Invariant IDs:** 1–12, explicitly all canonical IDs.

**Non-goals:** No new database, record store, telemetry service, model router,
credential source, runtime feature, wake worker, avatar, identity, memory,
scene, MCP, public profile ID, transcript/audio persistence, macOS field claim,
remote admin, or push/tag.

**Affected demos:** Owns P1-D1 through P1-D6, the privacy sentinel, Phase 0
regression, record ownership, and the final Phase 1 exit checkpoint.

**Root review checklist:**

- All six demos are listed with the exact real/deterministic split.
- D1/D2/D5 cannot pass without the operator checkpoint and real observation.
- Exactly one authoritative Phase Test row exists per attempt; no second store or DB.
- P1-D3/D4/D6 are deterministic and visibly source-labeled.
- Privacy scan proves zero sentinel, transcript, audio, secret, private context,
  raw error, image, or embedding in logs/SQLite/export.
- Phase 0 regression, node/web typechecks, build, and test output are complete.
- Windows evidence is labeled and does not claim macOS Keychain/TCC/signing/
  entitlements/LaunchAgent/packaged-worker behavior.
- No app.relaunch, second restart owner, provider fallback, or worker-model
  runtime configuration was introduced.

**Integration/commit boundary:** Root integrates only the listed demo/record
paths after external review with local commit
feat(phase1): add deterministic demos privacy scan and exit records. Root then
performs the final external Phase 1 review and may create the local recoverable
tag `phase1-v0.3.1`. No worker pushes or tags.

## 4. Final Phase 1 demo and exit matrix

| Gate | Required evidence | Deterministic/real rule | Owner/checkpoint |
|---|---|---|---|
| P1-D1 | 20 Traditional-Chinese or mixed rounds, stable session, no duplicate playback, no content persistence | Real OpenAI Realtime/WebRTC only; scripted transport cannot count | Tester executes after operator confirms credential, network, microphone, speakers, Console observation |
| P1-D2 | 10 real barge-ins, actual audio stop, next turn continues, playback completion recorded | Real OpenAI Realtime and real audio only | Tester executes after the same explicit operator checkpoint |
| P1-D3 | Connect failure reaches visible OfflineLoop in <=5s with reason and one record | Deterministic injected connect failure; no real cloud dependency | Tester owns deterministic runner |
| P1-D4 | Active disconnect stops audio, closes/clears state, probes 5/15/30/60, reaches Dormant, manual Start creates a fresh session | Deterministic active outage and recovery clock; no auto-resume | Tester owns deterministic runner |
| P1-D5 | Real Draft Realtime Dialogue/Input Transcription contract, Publish, next-session requested IDs/revision, invalid Draft leaves Active unchanged | Real account for contract and new session; deterministic invalid-Draft assertion may supplement but cannot replace real run | Tester plus operator checkpoint |
| P1-D6 | Mid-session Publish leaves current SessionModelSnapshot unchanged; forced new session/rollover uses newly Published Active; stale old events ignored | Deterministic official ScriptedRealtimeTransport and fake clock/fetch | Tester owns deterministic runner |

### Final privacy sentinel scan

The final scan runs against the complete Phase 1 test/demo surface:

~~~powershell
.\node_modules\.bin\vitest.cmd run tests/unit/phase1-privacy-sentinel.test.ts --reporter=verbose
~~~

It must report zero occurrences of the isolated synthetic sentinel in
metadata telemetry, rotating diagnostics, SQLite Phase Test rows, Console
exports, or test evidence. It must also report zero transcript/audio/private-
context fields in persisted records. A scan failure is a Phase 1 exit failure,
not a warning. The scan output contains counts and paths only.

### Regression and build gate

The tester runs, in this order, after focused unit/contract tests are green:

~~~powershell
npm test
npm run typecheck:node
npm run typecheck:web
npm run build
.\node_modules\.bin\vitest.cmd run tests/integration/phase0-demos.test.ts tests/unit/sqlite-phase-tests.test.ts --reporter=verbose
~~~

The result must include complete stdout/stderr and exit codes. A pre-existing
warning may be recorded only as metadata with its code and does not become a
success claim. Any new failure blocks the phase.

### Record ownership

The existing Main-owned SQLite/Console Phase Test store is the sole record
owner. P1-U8 extends its Phase enum and metadata schema; it does not create a
second database, test-results table, telemetry writer, or file-based parallel
ledger. Each P1 demo attempt has exactly one attempt ID and one row. The row
contains only phase/demo/mode/source/status/timing/build/config/model/SDK/
reason metadata. Real and deterministic evidence is never merged.

### Operator checkpoint

Before P1-D1, P1-D2, or P1-D5, the operator records only:

- credential present status from Main safeStorage, without reading or recording its value;
- network available status;
- selected microphone device/status;
- selected speaker/output status;
- Console open and live-observation status;
- platform label Windows-development or target-macOS field;
- operator approval that this run is real.

The checkpoint does not authorize reading the real .env, copying a key, saving
audio, saving transcripts, or claiming target-macOS results from Windows.

### Integration order and final tag

1. Root confirms the existing local Phase 0 tag `phase0-v0.3.1` and accepted baseline.
2. Root dispatches and reviews P1-U1, then integrates it.
3. Root dispatches and reviews P1-U2, then integrates it.
4. Root dispatches and reviews P1-U3 and P1-U4 sequentially, then integrates each.
5. Root dispatches and reviews P1-U5, then integrates it.
6. Root dispatches and reviews P1-U6, then integrates it.
7. Root dispatches and reviews P1-U7, then integrates it.
8. Root dispatches and reviews P1-U8, then runs the tester-owned final matrix and regression gate.
9. Root performs the external final exit review against this plan, all 12 invariants, privacy evidence, operator checkpoints, record count, and platform boundary.
10. Only after acceptance may root create the local recoverable tag `phase1-v0.3.1`. Workers never create tags, push, or claim Phase 1 exit.

## 5. Canonical invariant map

| ID | Required preservation in Phase 1 | Units/checks |
|---|---|---|
| 1 | Final transcripts, conversation audio, extracted memory values, and injected private context remain RAM-only; diagnostics contain metadata only | U2/U3/U4/U6/U7/U8; privacy sentinel and cleanup tests |
| 2 | Face recognition only proposes a candidate; private memory follows explicit verbal confirmation | Phase 1 non-goal; U8 regression asserts no identity/profile path is added |
| 3 | Guest and candidate profile IDs remain in Electron Main and never cross renderer/model tool boundaries | U7 bridge tests; Phase 1 exposes no profile IDs |
| 4 | Profile change closes old session and confirms in clean Persona+Master-only session before updating agent | Phase 1 non-goal; U3/U5 interfaces do not add a bypass; U8 regression |
| 5 | Extraction writes to owner snapshot taken at turn start | Phase 1 memory non-goal; U1 snapshot names remain compatible and U8 regression checks no extractor write |
| 6 | Identity, naming, switching, group, sleep, and spell control turns skip personal-memory extraction | Phase 1 memory/control non-goal; U6 marks transcript-dependent controls without creating extraction |
| 7 | Scenes require normalized exact full-transcript matching and one trigger per turn; approved presets alone control hardware | Phase 1 scene non-goal; U6 never dispatches scenes and U8 regression preserves the boundary |
| 8 | Exactly one microphone owner exists with explicit release-then-acquire handoff | U3/U4/U5; track-stop, single-owner, and failure tests |
| 9 | Every ignore, drop, fallback, or degrade is visitor-visible or metadata-only Console event with a reason | All units; telemetry/event assertions and final matrix |
| 10 | Failures degrade without gating conversation or unrelated adapters | U2/U3/U5/U6/U7/U8; cloud OfflineLoop versus local Maintenance tests |
| 11 | Model IDs come only from versioned config; failed configured ID never silently substitutes another | U1/U3/U5/U7/U8; model/fallback scans and D5/D6 |
| 12 | Credentials are read by Main through safeStorage; keys never enter renderer data, logs, telemetry, or exports | U2/U7/U8; synthetic credential fixture and sentinel scan |

## 6. Final completion rule

Phase 1 is complete only when all eight units have passed external root review,
the six demo results satisfy the matrix, the three real demos have explicit
operator checkpoints, the deterministic demos are source-labeled, the privacy
sentinel scan is zero, the Phase 0 regression remains green, exactly one
metadata-only record exists per demo attempt, all 12 invariant checks are
documented, and the root accepts the local `phase1-v0.3.1` tag boundary.
No worker may claim completion, create a tag, push, or convert a Windows result
into a target-macOS field claim.

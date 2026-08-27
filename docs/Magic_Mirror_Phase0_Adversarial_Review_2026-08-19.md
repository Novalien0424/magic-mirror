# Magic Mirror — Adversarial Review: Implementation Plan & Phase 0 Plans

**Date:** 2026-08-19
**Reviewed against:** PRD v0.3.1, Tech Spec v0.3.1, Implementation Plan v0.3.1 (primary targets), plus the ten Phase 0 plans under `docs/superpowers/plans/` and the implemented code on branch `phase0-boot-ipc` (Tasks 1–9 committed; Task 10 planned, not built).
**Relation to prior review:** `Magic_Mirror_Stack_Adversarial_Review_2026-08-16.md` settled the architecture and stack three days ago; its A/B/C/D amendments are applied as v0.3.1. This review does **not** re-litigate those decisions. It covers (1) what is *new* since that review — the ten detailed Phase 0 plans and the Task 10 packaging/demo machinery, (2) time-sensitive re-verification of the stack against the Mac mini M4 target, and (3) an over-/under-engineering audit of the Phase 0 execution approach.
**Evidence base:** full read of the three primary docs, all ten Phase 0 plans, PROGRESS.md/DECISIONS.md, spot-checks of the implemented code, and three primary-source research passes (OpenAI stack delta, Electron/node:sqlite/electron-builder, Mac mini M4 runtime fit) run 2026-08-19.

## Verdict

**The architecture and stack still survive adversarial review; nothing needs replacing, and the Phase 0 plans trace to the PRD/Tech Spec with unusual rigor.** The Mac mini M4 is comfortably over-provisioned for this workload; the chosen low-latency paths (Agents SDK RealtimeSession over WebRTC, RMS-first lip sync, local exact spell matcher, thin SQLite MemoryService) remain the right calls for the hardware and are not over-built for a single venue.

However, the review found **one design gap that will bite in Phase 1+ (config schema evolution silently replaces venue config with packaged defaults), one operational gap that will fail the 72-hour soak (no display-sleep prevention anywhere in the plan), one external dependency needing written confirmation before Phase 3 (the Live2D free-tier license carries a logo/showcase condition a private venue may not accept), an accumulating macOS-validation deferral risk, and a set of over-engineering patterns in the Phase 0 execution process** that cost velocity without adding review power. Several stack facts also moved since 2026-08-16 (Electron 43.4.1, electron-builder 26.15.7, `sqlite.backup()` API shape, SDK 0.16's scripted test transport) — none invalidates a decision, but the pins and one contract wording need updating. Findings below, ordered by severity.

---

## A. Design gaps (change before Phase 1)

### A1. Config schema evolution has no migration path — silent venue-config replacement — HIGH

Task 3's `mirrorConfigSchema` is `.strict()` at every level (confirmed in `src/main/config-service.ts`), and the defensive read chain is: invalid `active.json` → validated `previous.json` → **packaged `default.json`**, emitting only a `config_recovered` (degraded) event.

Every later phase adds config fields the schema does not yet have (Tech Spec §13.3: audio/camera stable device IDs, memory count/context budget, spell normalization equivalences, scene cues/cooldowns, reasoning level, turn-detection profile…). The moment a new build ships a stricter schema, the operator's existing `active.json` — carrying the real Persona, spells, and device IDs — fails validation, `previous.json` fails identically, and the app **silently substitutes the packaged default config** and keeps running. That is the config-file equivalent of the hidden model fallback that Invariant 11 exists to forbid: the mirror boots looking healthy while speaking the placeholder persona.

Harmless in Phase 0 (all values are mock fixtures). Must be fixed before Phase 1 puts real venue values into config. Pick one policy and record it as an ADR:

1. **Additive-only schema rule:** every new config field is optional-with-default in the schema (the service materializes defaults on read and persists them on next publish). Cheapest; covers renames/removals poorly.
2. **Config migrations:** versioned upgrade steps keyed on `configVersion`, exactly like the SQLite `app_migrations` pattern the project already has. Most robust.
3. **Fail closed:** a schema-version mismatch routes to Maintenance ("config needs migration") instead of default-substitution. Honest, but turns every upgrade into manual work.

Recommendation: (2) for structural changes plus (1) as the normal case; and in *all* cases, falling back to the packaged default should be allowed only when Active **and** Previous are corrupt/missing — never merely "old shape".

### A2. Display-sleep prevention is entirely absent — will fail the 72 h soak — MEDIUM

No `powerSaveBlocker`, `caffeinate`, or `pmset` appears in any of the three primary docs, any Phase 0 plan, or the code (verified by scan). PROGRESS.md notes kiosk polish was "deliberately out of Task 1 scope" — but no later phase picked it up: Phase 7's scope lists auto-login and process restart only. macOS will sleep the HDMI display long before hour 72; a sleeping mirror is indistinguishable from the black screen the whole product forbids (NFR-09/-10, Invariant 10).

Fix is cheap but must be *named*: add to Phase 7 scope (or Phase 2, when the mirror first runs unattended for hours): `powerSaveBlocker.start('prevent-display-sleep')` while not in Maintenance, plus documented `pmset`/Energy Saver settings on the field Mac, plus a Console card showing blocker state (Invariant 9: a failed blocker start must be visible).

### A3. macOS validation deferral is compounding — pull a "Mac smoke checkpoint" forward — MEDIUM

The 2026-08-16 review made TCC plists/entitlements a **Phase 0 packaging deliverable** precisely because TCC denies mic/camera to spawned workers *silently*. Phase 0 executes that as: plists authored on Windows + electron-builder mac config validated schema-only + everything stamped "Mac-pending (Phase 7)". The deferral list is now long: TCC behavior, hardened-runtime entitlements, LaunchAgent GUI-app restart, `simpleFullscreen` kiosk, Keychain-backed `safeStorage`, packaged `node:sqlite`, and the OfflineLoop 30-min soak on target.

Individually reasonable; together they re-create the late-discovery risk the amendment was meant to remove. Phase 2's exit already requires live wake tests ("現場 20 次真人 wake"), so the Mac must exist by then anyway. Recommendation: when the Mac mini arrives, spend one scripted day — **before Phase 2 exit** — running: packaged build → TCC prompts for the app (mic/camera) → LaunchAgent kill/restart → Keychain safeStorage round-trip → 30-min OfflineLoop soak → 10 boots. Record in Console Phase Tests as the "Mac checkpoint". This converts seven open risks into evidence for the cost of one day.

### A4. Console cannot display the active conversation owner — record the deviation — LOW-MED

Task 8 (correctly, per Invariant 3) removed `activeProfileId` from the renderer-visible `AppSnapshot`, replacing it with a bounded `identityStatus` enum. But Tech Spec §6.2 and Impl Plan §3.2 promise the Console Overview shows "Active conversation owner", and Invariant 3 explicitly allows the *public call name* to cross. As written, Phase 5's operator cannot see *who* the mirror thinks it is talking to — only "active".

This is a good privacy-first default, but it is currently an undocumented spec deviation. Record an ADR: Phase 5 adds a Console-only, sender-authorized "owner display" field carrying the public `call_name` (never the UUID), mirroring how Task 9 confined model IDs to the Models payload.

### A5. Phase 1 needs a Persona-editing path in Console — LOW

Task 9's `ConsoleConfigSafeView` deliberately excludes `persona.instructions` from the renderer. Reasonable in Phase 0, but Persona iteration is a core Phase 1 activity (Impl Plan §20: Persona Bible arrives at Voice phase) and Impl Plan §3.2 says Config shows "當前 Phase 已能使用的設定". Without a planned Console increment, the operator edits `draft.json` by hand — workable but against the "Console is the observability/control surface" principle. Name it in the Phase 1 Console increment.

### A6. Simulator cannot exercise Activating → OfflineLoop — LOW

Task 8's `wake` simulator command atomically sends `WAKE_DETECTED` then mock `REALTIME_READY`, and no `realtime_ready`/failure-during-activation command exists. Consequence: the `activating → offlineLoop` edge (US-OUTAGE-001's wake-time outage; P1-D3) is unit-tested but cannot be *demoed* in Phase 0; P0-D2 covers only `active → offlineLoop`. Acceptable if consciously deferred to P1-D3 — but Task 10's runner could cover it cheaply (inject `cloud_failure` between the two lifecycle events in a dedicated demo case). At minimum, note the deferral in the P0-D2 record.

### A7. Dual stale-event mechanisms — settle the contract in Phase 1 — LOW

The lifecycle context carries both `sessionGeneration` (bumped only on OfflineLoop entry) and `realtimeSessionId` (new per activation). Tech Spec §5.2 makes session-ID matching the stale-event rule; FR-VOICE-02 names `sessionGeneration`. A clean sleep→wake cycle does not bump the generation, so generation alone would pass a stale event from the previous session. Phase 1 must make session-ID matching authoritative and treat the generation counter as diagnostic metadata only — one sentence in the Phase 1 contract test plan avoids a divergence.

---

## B. Tech stack & hardware verification (Mac mini M4)

### B1. OpenAI stack — delta check vs the 2026-08-16 baselines: ALL UNCHANGED — VERIFIED

A primary-source delta pass (developers.openai.com model/deprecation/changelog pages; openai-agents-js releases and source at v0.16.1; npm registry) confirms every v0.3.1 baseline still holds as of 2026-08-19:

- `gpt-realtime-2.1` GA and the Agents SDK default (`DEFAULT_OPENAI_REALTIME_MODEL` in v0.16.1 source); 60-minute session cap; no reconnect API; WebRTC + `ek_` ephemeral secrets; `updateAgent()` unchanged.
- `gpt-live-transcribe` exists; SDK hidden defaults are still `gpt-4o-mini-transcribe` + `semantic_vad` (the P1-D5 "config value actually reached the session" assertion remains load-bearing).
- `gpt-5.6-luna` ($0.20/$1.20 per 1M, Structured Outputs) and `gpt-5.6-terra` are not deprecated; the newest deprecation announcement is still 2026-07-20 (old realtime models, shutdown 2027-01-20 — none of ours).
- Privacy env vars and `historyStoreAudio:false` defaults verified present in `agents-core/src/config.ts` and `realtimeSession.ts` at v0.16.1.
- `output_audio_buffer.stopped` remains the raw WebRTC playback-completion event, still untyped by the SDK.

**Three new facts worth acting on:**

1. **Pin `@openai/agents`/`@openai/agents-realtime` at 0.16.x for Phase 1.** v0.16.0 (2026-08-15) ships `ScriptedRealtimeTransport` under `@openai/agents-realtime/testing` — a deterministic scripted transport for RealtimeSession tests with no live WebRTC. This directly serves the Phase 1 contract-test plan and removes the need for a hand-rolled recorded-events mock (Impl Plan Phase 1 "What Can Be Mocked").
2. **`openai` peer ≥ 7.2 is required from SDK v0.15+** when supplying your own client, and the SDK's default *text* model is now `gpt-5.6-luna` — a hidden default that Invariant 11 says must never be relied on; the extractor role must keep setting the model explicitly from config (the existing P0-D5/P6-D8 assertions already enforce this — keep them strict).
3. **`output_audio_buffer.stopped` latency bug:** an open community report describes intermittent multi-second delays in the event after audio finishes. Phase 3's Speaking→Listening transition and the 300 s idle timer key off this event — add a bounded timeout fallback via the local audio analyser (the Tech Spec §8.3 backstop) with a Console event when the fallback fires, rather than waiting unboundedly.

### B2. Electron 43 / node:sqlite / electron-builder — VERIFIED (incl. an empirical probe in a real Electron 43.4.0 main process)

**Baseline confirmed.** Electron 43.x bundles Node 24.17→24.18.1 (43.4.1, released today 2026-08-19, is the current patch; Chromium 150; EOL 2027-01-05; Electron 44 ships 2026-08-25). `node:sqlite` requires no flag, is stability "1.2 Release candidate" in this Node line, and `DatabaseSync` + WAL work in the Electron main process (verified by running a throwaway Electron 43.4.0 app: `journal_mode=WAL` sticks, `-wal`/`-shm` created, persists across reopen). electron-builder 26.15.3 exists, has no Electron-version gate, and `--config.directories.output` is a valid dot-notation CLI override (exact schema casing required). Sources: releases.electronjs.org releases.json + schedule, nodejs.org v24 sqlite docs, npm packument, app-builder-lib source at 26.15.7.

**Corrections and pins to apply:**

1. **There is no `database.backup()` instance method — the backup API is module-level `sqlite.backup(sourceDb, path, opts)` returning a Promise** (added Node v23.8; verified `db.backup === undefined` in both Electron 43.4.0 and system Node 24.19.0). The 2026-08-16 review's shorthand "online `backup()` API for the Console button" reads as an instance method; the Phase 7 backup unit must target the module-level function. Fix the contract wording now so a worker doesn't discover it at implementation time.
2. **Pin Electron `43.4.1`, not the currently-installed 43.4.0.** 43.3.0+ carries the node:sqlite CVE-2026-58041 fix; 43.4.1 additionally fixes a BrowserWindow-creation memory leak and reduces idle main-process CPU wakeups — both material for a 24/7 kiosk. Schedule the 44/45 bump before 43's 2027-01-05 EOL (Phase 7 window).
3. **Vitest under system Node is not a faithful proxy for Electron's SQLite.** System Node 24.19.0 carries two `node:sqlite` fixes Electron 43's Node 24.18.1 lacks — including *"do not leave database open after failed open"*, exactly the failure-path class Phase 0's SQLite tests assert — plus SQLite 3.53.3 vs 3.53.1 and V8 13.6 vs 15.0 (ABI 137 vs 148). Add a small Electron-runtime smoke (headless main-process harness, as this research pass ran) for DB open/close lifecycle before relying on those failure-path tests as Mac evidence.
4. **electron-builder: prefer `26.15.7` over the planned exact pin `26.15.3`.** 26.15.3 is npm's `latest` tag but four patches behind the `v26` branch (26.15.7, 2026-07-18). 26.15.3 carries the #9983 NSIS regression in which the Windows installer *silently omits every PE file* — harmless for the planned `--dir`/mac targets, fatal if anyone ever builds an NSIS installer. Either pin 26.15.7 (must be requested explicitly; `latest` resolves to 26.15.3) or record "NSIS out of scope" next to the 26.15.3 pin.
5. **Ad-hoc signing + hardenedRuntime silently kills mic and camera** (electron-builder #9529): with the automatic ad-hoc identity and the *default-true* `hardenedRuntime`, `getUserMedia()` resolves, tracks report `live`, and zero frames/samples arrive — no TCC prompt, no error. This is the exact silent-TCC failure class the 2026-08-16 review flagged, arriving via a second path. Both `entitlements.plist` **and** an inherit entitlements file must carry `com.apple.security.device.audio-input`/`.camera` — verify the Task 1 `resources/macos/` files cover the inherit case, and add this to the Mac checkpoint (A3).
6. **Mac packaging config is schema-validated but never executed on Windows.** AJV validates the whole config (good: typos fail the Windows build), but entitlements-file paths, `extendInfo` plist merging, and hardenedRuntime resolution run only in the mac sign path — a wrong path passes every Windows `--dir` build. Reinforces A3: run one real `--mac --dir` build at the Mac checkpoint, before Phase 2/5 depend on mic/camera.
7. **`extraResources` lands at `Contents/Resources/` on macOS vs `resources/` on Windows.** Worker assets (sherpa-onnx models, Python face worker, `default.json`) must be resolved via `process.resourcesPath`, never a hand-built relative path — otherwise dev-on-Windows works and the Mac build can't find its workers.
8. **macOS-26 boot crash risk (Electron #52815, OPEN, filed on 43.1.0 / macOS 26 arm64):** the main process `abort()`s in `_RegisterApplication` when `launchservicesd` is unreachable — precisely the LaunchAgent-starts-app-at-login window. The existing `KeepAlive={SuccessfulExit=false}` design already restarts on abort; add a startup telemetry event distinguishing "restart after abnormal exit" so repeated boot-loops are visible in Console (Invariant 9), and re-test at the Mac checkpoint.
9. **Synchronous `DatabaseSync` on the main process:** no async node:sqlite API exists in this Node line (nodejs#54307 still open), and Electron's own performance guidance forbids blocking the main process. For this project's data sizes that is fine *if* main-thread queries stay indexed point-lookups; move memory-extraction batch writes, embedding rebuild scans, and `sqlite.backup()` to a `utilityProcess`/worker holding its **own** connection (handles are not shareable), and set a non-zero busy `timeout` on every connection (default 0 = immediate `SQLITE_BUSY` throw). Record this as the Phase 6/7 DB-access rule.
10. **Reading large assets out of `app.asar` over long sessions has an open macOS bug** (#52804: `createReadStream` on an ASAR entry fails after the extracted temp file is deleted). Keep Live2D rigs, the OfflineLoop video, and ONNX models `asarUnpack`ed or in `extraResources` — which Task 10B already does for the video; apply the same rule to Phase 3/5 assets.

### B3. Mac mini M4 runtime fit (sherpa-onnx, OpenCV, Live2D, 24/7 kiosk) — VERIFIED (with binary-level checks)

**Hardware verdict: the M4 is comfortably over-provisioned for this workload.** Estimated steady state (Electron + WebGL Live2D + KWS worker + burst face worker + WebRTC) is well under 8 GB against 24 GB, and a fraction of the 155 W envelope. The M4 mini *does* throttle under sustained all-core encode loads where M1/M2 did not (anecdotal but consistent reports) — irrelevant to this workload's profile, but behind an enclosed one-way mirror the 10–35 °C ambient operating limit is a real installation constraint. Wire up `powerMonitor.getCurrentThermalState()` / `'thermal-state-change'` as a Console card (free first-party telemetry, maps directly onto Invariant 9). 24 GB is ~3× headroom insurance, not a requirement — the PRD §16 recommendation stands.

**sherpa-onnx (wake) — pin confirmed at the binary level.**
- Latest is 1.13.6 (2026-08-18). The M4/SME bug fix was verified by extracting the ORT version from the actual shipped `sherpa-onnx-darwin-arm64` dylibs: 1.13.4 bundles ORT 1.27.0 (broken), 1.13.5 and 1.13.6 bundle ORT 1.27.1 (fixed). No regression reissue. Note **issue #3791 remains open** — open ≠ unfixed; do not be misled during Phase 2 triage. Issue #3776 independently confirms the same root cause *through the Node addon inside an Electron app* — exactly this project's configuration — and an M2 Pro was unaffected (SME is M4+ only), so any comparison testing on older Macs proves nothing about the target.
- **`sherpa-onnx.node` is a pure N-API addon** (zero `v8::` symbols, verified by binary inspection) — ABI-stable across Electron versions, **no electron-rebuild needed**. This removes a whole class of packaging risk the plans didn't need to but could have worried about.
- A public standalone reproducer (`0xlau/sherpa-onnx-m4-repro`) exists and is worth adapting directly as the Phase 2 "known WAV must detect" smoke assertion the Impl Plan already mandates.
- No published CPU/RAM figures exist for streaming KWS (verified negative); defaults are `num_threads=1`, threshold 0.25, int8 weights ~4.8 MB. Expect low-single-digit-percent CPU — but **measure on the target**, per the plan's own "measure honestly" ethos.
- The official Node mic example depends on **`node-cpal`** — a single-maintainer 0.1.x package (prebuilt darwin-arm64 N-API binary confirmed). If Phase 2 adopts it, vendor and pin it; do not treat it as infrastructure.
- A newer **zh-en 3M KWS model (2025-12-20**, `cjkchar`, 160/320 ms chunk latency) exists alongside the 2024 wenetspeech model; worth an A/B in Phase 2 tuning — a config change, not an architecture change.

**OpenCV / YuNet / SFace (face) — one live packaging trap.**
- **PEP 440 trap: an unpinned `pip install opencv-python` now resolves to 5.0.0.93** (because 5.0.0.93 > 4.14.0.94 in version ordering) even though 4.14.0.94 shipped later — silently changing which YuNet generation is required. The Impl Plan §10's "pin the pair explicitly" rule is therefore not just hygiene but load-bearing; encode it as `opencv-python==<exact>` in the Phase 5 worker's requirements from day one.
- Pairing rule re-verified verbatim from the zoo README: 4.x ↔ `yunet_2023mar` (fixed shape), 5.x ↔ `yunet_2026may` (dynamic shape). One correction to the zoo's own guidance: the `ENGINE_ORT=4` path it names requires an OpenCV built `WITH_ONNXRUNTIME=ON`, which pip wheels are not; a 5.x pip install runs `ENGINE_AUTO→ENGINE_NEW`, and the dynamic-shape model remains the correct pairing.
- `FaceDetectorYN`/`FaceRecognizerSF` APIs are signature-identical across 4.x and 5.0 (verified from headers) — the US-ID-002 rebuild design is safe against the 4→5 transition.
- SFace `2021dec` is still the only recognizer in the zoo (confirms prior review A2: the rebuild feature will first be exercised by detector/precision changes). Bonus: the zoo ships `face_image_quality_assessment_ediffiqa` — a ready-made enrollment quality gate candidate for US-ID-002's quality score, instead of hand-rolling one.
- No Apple Silicon benchmarks exist anywhere in the zoo (verified negative). Extrapolating from the i7-12700K figures (YuNet 0.69 ms @160×120, SFace 5.1 ms @150×150), YuNet+SFace on a 640×480 activation frame lands well under 100 ms on an M4 core — ample for a 2–3 s scan — but this is an estimate; confirm in the Phase 5 spike.

**Live2D (avatar) — two decisions to make before Phase 3, one architecture confirmation.**
- Current SDK: Cubism 5 SDK for Web R5 (2026-04-02), Core 06.00.0001, no official npm package (avoid the unauthorized `live2dcubismcore` npm re-upload; do not ship the `.js.map` — it is excluded from `RedistributableFiles.txt`).
- **R5 requires WebGL2** (verified in changelog and sample source: `getContext('webgl2')`, no fallback) — but the renderer still *type-accepts* a WebGL1 context, so a mistake surfaces as runtime blend-mode corruption, not a compile error. Phase 3 must request `webgl2` explicitly and route a null context to Maintenance, loudly.
- **License needs written confirmation before Phase 3 asset spend.** The applicable plan for a guest-facing mirror is Plan B "Non-profit Content Plan (non-distributed)" which explicitly covers digital signage — free for entities under ¥10M annual gross revenue (whole-entity, parent rolls up; affirmative duty to notify within ~2 months of crossing). However, the fee table's footnote conditions *all* rows — including the free ones — on displaying the Live2D logo in-content and being listed on Live2D's public showcase page. A private venue may want neither, and the contradiction with the EULA's unconditional small-scale exemption is not resolvable from published documents. **Get it in writing from Live2D**; this is the only potentially blocking external dependency found by this review.
- **MotionSync Web is semi-abandoned** (R2, 2025-03, pinned against SDK R3 while the project would run R5) — this *strengthens* the v0.3.1 decision to make RMS the Phase 3 exit baseline. Better still: base R5 added `CubismLipSyncUpdater` + `IParameterProvider`, so the RMS path can feed an `AnalyserNode` through a first-party seam that reads the model's declared LipSync parameter IDs — no proprietary MotionSync Core, no version skew, ~the same 20 lines. If MotionSync is attempted as the layered enhancement, its `ILAppAudioBufferProvider` seam accepts the Realtime remote track directly (never the mic — consistent with Invariant 8).
- Rendering environment facts for Phase 3: Electron = ANGLE/Metal on Apple Silicon with no practical opt-out (regression history exists); set `backgroundThrottling: false` on the mirror window (default throttles rAF when the window is deemed occluded — a screensaver can do that to a kiosk); log `WEBGL_debug_renderer_info` UNMASKED_RENDERER at startup and raise a Console event if it reports SwiftShader (silent software-rendering fallback is the top 60 FPS threat, and a macOS point release has disabled GPU acceleration before). Default clipping-mask buffer is 256×256 — likely soft on a portrait panel; `setClippingMaskBufferSize()` is the dial, and mask count / ArtMesh ordering are *authoring-time* constraints that must go into the designer's asset deliverable spec (Tech Spec §20 Avatar input) now, not at integration.
- Live2D has **zero public issue tracker** (issues disabled on all repos) — read as "no observability", so the Phase 3 independent demo genuinely is the only acceptance evidence that will exist.

**24/7 kiosk operation (extends finding A2) — verified mechanics.**
- `powerSaveBlocker.start('prevent-display-sleep')` maps to a legitimate IOKit no-display-sleep assertion and also prevents idle system sleep — sufficient as the in-app layer. Two verified limitations: it **cannot re-light an already-dark panel** (escape hatch: `caffeinate -u -t 1`), and it is process-scoped (dies with a crash). So the persistent floor is `pmset -a displaysleep 0 sleep 0 autorestart 1` on the field Mac, with `powerSaveBlocker` layered in-app and `pmset -g assertions` as the verification step. Screensaver/lock is a *separate* control: use a `com.apple.screensaver` configuration profile (`idleTime=0`), not `defaults write` (unreliable since Ventura). Do not use the undocumented `pmset disablesleep`.
- **The repo's LaunchAgent plist already dodges the worst trap found**: `RunAtLoad=true` is present (without it, `KeepAlive={SuccessfulExit=false}` may never perform the *initial* spawn on macOS 26 — electron#50866), and `ProgramArguments` points at the inner binary, not `open -a`. Add `AssociatedBundleIdentifiers` for macOS 13+ Login Items attribution. Verified gap remains: none of it is field-tested (A3).
- **TCC severity upgrade:** Apple documents that a missing `NSMicrophoneUsageDescription`/`NSCameraUsageDescription` at capture time **terminates the app** — not a silent deny but a crash-loop against the LaunchAgent, i.e. a black mirror (Invariant 10). The keys exist in `resources/macos/Info.plist.additions.xml`; the Mac checkpoint must verify they survive into the *packaged* Info.plist. Also verified: the Python face worker must be spawned as a **direct child** of Electron main — no setsid/double-fork/daemonization — or TCC responsible-process attribution breaks with no prompt and no error (Apple DTS: camera from a launch daemon is unsupported outright; inheritance itself is officially "test it to know").
- **Code-signing identity is a day-one field decision:** ad-hoc/rotating signatures make TCC treat every rebuild as a new app, silently dropping mic/camera grants on each redeploy (and per B2.5, ad-hoc + hardenedRuntime yields live-but-empty media tracks). One stable Developer ID from the first Mac deployment.
- **FileVault and unattended auto-login are mutually exclusive** (Apple-documented). A venue kiosk that must survive power cuts without a human needs FileVault off + `pmset autorestart 1` + physical security as the compensating control — a venue policy decision to record, not a software task.

---

## C. Over-engineering findings (simplify without losing value)

The product architecture itself is *not* over-built — the thin MemoryService, exact matcher, mock-first adapters, and single lifecycle owner all remain proportionate. The over-engineering has crept into the Phase 0 **execution machinery**:

### C1. Plan documents that embed the entire implementation — MED (velocity + drift risk)

Task 3's plan is 2,659 lines and contains the complete test files verbatim; Task 2's plan contains the full XState implementation inline. The RED/GREEN worker dispatch then becomes transcription, and the plans become a second source of truth that is already drifting: the foundation plan's `AppSnapshot.activeProfileId` and its Task 5 all-domain-tables schema were both superseded by later task plans, but the foundation plan still states them as the contract. A future worker reading the wrong document will faithfully implement stale interfaces.

Recommendation for Phases 1–7: return unit plans to what Impl Plan §14 actually mandates — the 8-field template plus *public interface signatures and behavioral contracts* (event names, error-code vocabularies, invariants). Test *bodies* and exact reason-string formats live only in the repo, produced by the TDD cycle. Add a "SUPERSEDED BY task-N plans" banner to `2026-08-16-phase0-foundation.md` sections that later plans replaced.

### C2. The base64 → generator → dual-placement pipeline for one placeholder video — MED

Task 10B ships: a base64-encoded mp4 tracked in git (~33% larger than the binary), a generator script with fixed hash/length contract, `predev`/`prebuild` hooks, a `publicDir` remap, a new `.gitignore` rule, **and** the same video packaged twice (`asarUnpack` of the built renderer copy *and* an `extraResources` copy). The root cause is a harness limitation — apply_patch workers cannot write binary files — leaking into the product build system.

Simplifications, in order of value:
1. **Drop the dual placement.** One video, one packaged location. If the renderer loads it from the built renderer output, `asarUnpack` alone suffices; the `extraResources` copy of the video serves no declared consumer. (Keep `extraResources` for `default.json`.)
2. **Commit the binary directly** (the root/human commits it once; git handles small binaries fine) with a checked-in SHA-256 asserted by a unit test — deleting the generator, both npm hooks, and the ignore rule. The venue's final asset replaces the file in Phase 7 the same way.

If the team keeps the generator for the worker-authoring reason, keep it — but say so in the plan; today the machinery reads as unexplained complexity.

### C3. Five-fresh-worker TDD gates per single-file unit — LOW-MED (cost, not correctness)

Each Phase 0 unit runs RED-implementer → RED-tester → GREEN-implementer → GREEN-tester → merged-main-tester, each with a full repeated invariant envelope. For 1–2 file pure modules this quintuples process cost over a single implementer + single tester while the orchestrator's diff review provides the same assurance. The discipline that demonstrably pays (keep it): tests-first with an observed RED, tester-owned complete command output, negative scans, invariant checklist in every dispatch. The part to relax for Phases 1+: dedicated RED-observation and merged-main workers for trivial units — fold RED observation into the GREEN tester's evidence (`git stash` of the production file or a timestamped first run), and reserve merged-main re-validation for units that touched shared files.

### C4. Hyper-strict structural validation of `app_migrations` — LOW

Task 5 validates the exact normalized `sqlite_master` DDL string, exact `table_info` rows, *and* asserts zero indexes/foreign keys on the table. This makes legitimate future maintenance (e.g., an index to speed Task 10A's prune) a fatal "schema invalid". Already built — no need to revert — but do not extend the pattern to domain tables in Phases 5–6; validate version/name rows and required columns only.

### C5. Assorted small ones — LOW

- `eventDelivery: 'emitted' | 'failed'` metadata on every registry probe result models a failure mode (a throwing telemetry sink) that Task 4's sink contractually cannot produce (emit never throws). Harmless; don't propagate.
- Three different model-literal scan regexes exist across Tasks 9/10 and the foundation plan. Consolidate into one `scripts/scan-model-literals.mjs` used by all future gates, so the Phase 0 exit criterion has a single maintained definition.
- Wake keywords are URL-encoded into telemetry `reason` (correct, given the no-spaces grammar) — the Console Events page should percent-decode for display, or operators will read `%E9%AD%94%E9%8F%A1`.

---

## D. Phase 0 exit-evidence audit (Task 10 vs Impl Plan §5 Exit Criteria)

| Exit criterion (Impl Plan §5) | Task 10 evidence | Gap |
|---|---|---|
| 10 consecutive boots, Dormant or Maintenance, no blank | 10 isolated smoke boots, exit 0 + nonblank markers | Assert final state ∈ {dormant, maintenance} explicitly, not just "left starting"; Mac boots remain pending (A3) |
| OfflineLoop 30 min, no memory growth/stall | 1,800,000 ms soak, 7 samples, explicit memory thresholds, media-advance checks | Windows-only; repeat once at the Mac checkpoint (A3) |
| Every mock action → visible result + Console event | P0-D1..D3 runner + per-command markers | Covered |
| Model-ID source scan clean; no runtime literal/hidden fallback | rg scans + literal-scan unit test | Covered (consolidate regexes, C5) |
| Invalid Draft / mock contract failure → Active unchanged, no partial publish | P0-D5 + 9B tests | Covered |
| P0-D1..D5 repeatable by a non-author from docs | exact runner commands per demo | Covered |
| Console openable from every state (Tech Spec §16) | — | Not explicitly evidenced; add a Console-query-during-offlineLoop/maintenance assertion to P0-D2/D3 |

Also verified: the 17-story traceability matrix still holds; no Phase-2 scope (guest memory tools, custom voice, multi-persona) has leaked into Phase 0; Task 10's demo-only `app.setPath('userData')` injection is properly gated behind `MIRROR_PHASE0_DEMO`/smoke mode; phase-test records moving from the foundation plan's `phase-tests.json` to SQLite (Task 10A) is an improvement consistent with "SQLite is the only truth store".

---

## E. Housekeeping findings

- **PROGRESS.md is two tasks stale.** It states "Tasks 1–7 accepted; Task 8 is next" while `phase0-boot-ipc` has Tasks 8 and 9 committed. CLAUDE.md makes PROGRESS.md the current-verified-state ledger and requires updating it every behavior-changing session; the Task 9/10 plans defer the update to Task 10D, which leaves the ledger wrong for the entire span. Update it now (a two-line status correction), and for future phases update the task table in the same commit as each accepted task.
- **`.env` credential provisioning** is documented metadata-only and stays out of git — consistent with Invariant 12, but Phase 1 must define the one-time "move key from .env into safeStorage via Console/Main" step so `.env` does not quietly become the runtime source.
- **Plans embed harness-specific worker routes** (model IDs, CLI profiles) into repo docs. These churn independently of the product; keep them in AGENTS.md and reference them, rather than repeating per plan.

## F. Consolidated action list (prioritized)

**Now (before Phase 0 exit / inside Task 10):**
1. Record ADRs for the two undocumented spec deviations already in the code: Console shows `identityStatus` not owner (A4, with the Phase 5 call-name plan) and phase-test records in SQLite instead of `phase-tests.json`.
2. Task 10 tweaks while it is still unbuilt: assert final smoke state ∈ {dormant, maintenance}; add a Console-openable/query assertion during OfflineLoop and Maintenance (P0-D2/D3); pin electron-builder **26.15.7** (or record NSIS-out-of-scope next to 26.15.3); drop the duplicate video placement (`asarUnpack` *or* `extraResources`, not both — C2); bump Electron to **43.4.1**.
3. Update PROGRESS.md to actual state (Tasks 8–9 done) and add "SUPERSEDED" banners to the stale foundation-plan sections (C1, E).
4. Fix the backup contract wording: module-level `sqlite.backup(db, path)` (Promise), not `db.backup()` (B2.1).

**Before Phase 1:**
5. Decide and ADR the config-schema evolution policy (A1) — the single highest-value fix in this review.
6. Pin `@openai/agents*` 0.16.x and plan Phase 1 contract tests around `ScriptedRealtimeTransport` (B1); keep the "config reached the session" assertions strict; add the `output_audio_buffer.stopped` timeout fallback to the Phase 3 backlog (B1.3).
7. Add a small Electron-runtime DB smoke to complement Vitest-under-system-Node (B2.3). Plan the Phase 1 Console increment for Persona instructions editing (A5) and the one-time `.env`→safeStorage migration step (E).
8. Right-size the unit-plan process: 8-field template + interface contracts; test bodies live in the repo; single shared model-literal scan script (C1/C3/C5).

**When the Mac mini arrives (target: before Phase 2 exit):**
9. Run the one-day **Mac checkpoint** (A3): real `--mac --dir` package → packaged Info.plist carries the TCC keys (missing keys *terminate* the app — B3) → mic/camera prompt + capture with a **stable Developer ID** (never ad-hoc — B2.5/B3) → LaunchAgent login/crash/clean-quit → Keychain safeStorage round-trip → `pmset` floor + `powerSaveBlocker` + screensaver profile (A2/B3) → 30-min OfflineLoop soak → 10 boots → sherpa-onnx known-WAV detection on the M4 itself.
10. Record the venue policy decision: FileVault off + `pmset autorestart 1` + physical security (B3).

**Before Phase 3 asset spend:**
11. Obtain written Live2D license confirmation (Plan B free tier vs. logo/showcase footnote) — the only potentially blocking external dependency found (B3).
12. Put the mask/ArtMesh authoring constraints and WebGL2 requirement into the designer deliverable spec; plan the RMS lip-sync path via `CubismLipSyncUpdater`/`IParameterProvider`; add `backgroundThrottling: false` + SwiftShader detection to the Phase 3 unit (B3).

## G. What this review deliberately did not challenge

The eleven Tech Spec §18 architecture decisions, the v0.3.1 amendments (sherpa-onnx ≥ 1.13.5 pin, detector+recognizer pair versioning, wake-telemetry shape, RMS-first lip sync, `node:sqlite`, LaunchAgent-only restarts, safeStorage), the no-platform scope cuts, hardware purchasing, and the deferred NFR-02 latency mitigation (pre-minted ephemeral key) — all reconfirmed as settled; nothing found that reopens them.

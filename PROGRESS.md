# Magic Mirror — Progress

**Phase 0 — Foundation / Visible Skeleton: COMPLETE — Tasks 1–10 accepted; Phase 1 is next.**

## Task 10 / Phase 0 exit accepted (2026-08-20)

- Task 10 and Phase 0 are accepted by the interactive root after the full
  tester-owned gate. The accepted Task 10 implementation paths are
  `resources/offline-loop/offline-loop-v1.mp4.base64`,
  `scripts/generate-offline-loop.mjs`, `scripts/run-phase0-demos.mjs`,
  `src/main/boot.ts`, `src/main/console-data.ts`,
  `src/main/crash-recovery.ts`, `src/main/index.ts`,
  `src/main/phase0-demo-runner.ts`,
  `tests/integration/phase0-demos.test.ts`, and
  `tests/unit/sqlite-phase-tests.test.ts`.
- Focused Task 10B tests passed `13/13`; frozen Task 10C black-box demos passed
  `8/8`; the full suite passed `311` tests; Node/web typechecks and the
  Electron Vite build passed; and ten bounded smoke cycles passed.
- P0-D1 through P0-D5 passed, including both P0-D2 cloud/core failure cases.
  The exact real-time 30-minute OfflineLoop soak passed with seven samples at
  elapsed `0`, `300000`, `600000`, `900000`, `1200000`, `1500000`, and
  `1800000` ms; every sample was nonblack and playing, and memory growth stayed
  below the accepted `134217728`-byte allowance.
- The privacy scan passed; `.env` was not read; `package.json` and
  `package-lock.json` were unchanged; Electron `43.4.1` and
  `electron-builder` `26.15.3` were preserved; and the negative runtime
  model/fallback scan passed. Windows unpacked packaging, fixed asset
  hash/length/decode, the no-relaunch scan, exact whitespace, and status-scope
  gates passed.
- The only post-gate correction was a comment-only wording change in
  `src/main/crash-recovery.ts` so the literal no-relaunch scan remained clean;
  runtime behavior was unchanged. The LaunchAgent
  `KeepAlive={SuccessfulExit=false}` remains the sole restart owner, and no
  relaunch behavior was added.
- Model IDs remain versioned-config-only. D5 fixture model/persona values exist
  only in the isolated demo configuration route and frozen test, never in
  normal fallback, runtime, telemetry, or markers. Canonical invariants 1–12
  remain preserved: diagnostics are metadata-only and private content stays
  RAM-only; microphone ownership remains single; ignores/degrades have reasons;
  failures do not gate unrelated behavior; configured model IDs are never
  substituted; and credentials remain Main-owned through `safeStorage`.
- Windows development validates DPAPI-backed `safeStorage` and local Windows
  packaging only. It does not field-verify target macOS Keychain, TCC,
  signing, entitlements, packaged-worker, or LaunchAgent behavior. No product
  decision was made, so `DECISIONS.md` remains unchanged.
- Phase 1 is the next application work. It has not started and is not complete.

## Historical pre-exit state (2026-08-19)

- Tasks 1–9 are accepted. Task 10 is not implemented: its original plan is
  at `255008e`, the accepted correction plan is at `9adcca4`, and no Task 10
  demo, exit, tag, or Phase 0 success is claimed here.
- The current branch is `phase0-boot-ipc`. Phase 0 remains in progress and
  Phase 1 remains blocked until corrected Units A–E, Task 10, external root
  acceptance, and the root-only Phase 0 tag are complete.
- This ledger is updated again only after final Task 10 PASS and external root
  acceptance. It does not pre-claim Units B–E or any Phase 0/Phase 1 result.
- The adversarial review is directionally valid, but root accepted only its
  recorded subset. Any premise that Task 10 was already implemented is false;
  the review file itself remains unmodified.

- Accepted Task 2 plan: `docs/superpowers/plans/2026-08-17-phase0-task2-lifecycle.md`
- Accepted Task 3 plan: `docs/superpowers/plans/2026-08-18-phase0-task3-config-service.md`
- Accepted Task 4 plan: `docs/superpowers/plans/2026-08-19-phase0-task4-telemetry.md`
- Accepted Task 5 plan: `docs/superpowers/plans/2026-08-19-phase0-task5-sqlite.md`
- Accepted Task 6 plan: `docs/superpowers/plans/2026-08-19-phase0-task6-module-registry.md`
- Accepted Task 7 plan: `docs/superpowers/plans/2026-08-19-phase0-task7-model-settings-resolver.md`
- Task 3 accepted integration: implementation commit `0270686` and correction/
  integration tip `835c92d` are on pushed `main`.
- Fresh merged-main verification supplied for Task 3: 7 test files / 92 tests
  passed; full Node plus web typecheck exit 0; Electron Vite
  main/preload/renderer build exit 0.
- Task 4 accepted integration: pushed `main` tip `dca1327`; focused telemetry
  `21/21`; full `8 files / 113 tests`; Node plus web typecheck exit 0; Electron
  Vite build exit 0.
- Task 5 accepted integration: pushed `main` tip `a8f0355`; focused SQLite
  verification `32/32`; full suite `145/145`; Node plus web typecheck exit 0;
  Electron Vite build exit 0.
- Task 6 accepted integration: pushed `main` tip `5b95a94`; focused
  verification `16/16`; full suite `161/161`; Node plus web typecheck exit 0;
  Electron Vite build exit 0.
- Task 7 accepted implementation: accepted plan commit `6214b6c`; pushed
  `phase0-model-settings` tip `5e24bdc`; focused verification `7/7`; full
  suite `168/168`; Node plus web typecheck exit 0; Electron Vite build exit 0;
  both negative runtime-model/fallback scans successful; no OpenAI or `.env`
  requirement.
- Current branch: `phase0-boot-ipc`; Tasks 8 and 9 are accepted. Task 10 is
  planned but not started or implemented.
- The five-command Task 6 plan static gate passed: status scope, git diff check,
  458 lines/final marker/trailing whitespace, 10 required markers, and no
  forbidden markers.
- Task 6 selected design: runtime-exhaustive Main registry, injected
  closed-outcome adapters, separate deterministic mocks, stable metadata-only
  results/events, informational missing adapter, explicit
  `eventDelivery` `emitted|failed`, no retry/sibling gate, and no boot/IPC/UI/
  model resolver. The application/test scope was
  `tests/unit/module-registry.test.ts`, `src/main/module-registry.ts`, and
  `src/main/module-mocks.ts`; Task 6 application implementation is accepted at
  `5b95a94` on `main`. Tasks 8/9 own integration/UI, and Task 10 owns
  demos/records/exit.
- No user setup is required for Task 6. Deterministic
  injected adapters and mock controls provide the complete test path; no
  credential, device, network, or `.env` value is needed by this task.
  Development Node `v24.19.0` satisfies the repository prerequisite
  `>=22.22.2` or `>=24.15.0`.
- Verified integration metadata: GitHub origin is
  `https://github.com/Novalien0424/magic-mirror`.
- Workspace note: the untracked `scripts/install-node-lts.ps1` remains
  untouched and is outside this task's scope.

## Historical setup and Phase 2 prerequisite (2026-08-19)

- **Credential setup (metadata only).** The user reports that the local OpenAI
  credential is provisioned through `.env`. Supplied metadata records
  `.env` exists: true, `.gitignore` line 9 rule `.env` ignores it, tracked by
  Git: false (untracked), content/value accessed: false, and validity checked:
  false. No value is recorded, and process records must not claim that its
  value was inspected. `.env` is provisioning input only, not runtime
  renderer-visible storage; Main/`safeStorage` and short-lived renderer
  credentials remain authoritative.
- Credential existence does not itself prove account/billing/network/API
  validity, audio devices, or target macOS field readiness.
- **Phase 2 prerequisite.** The customizable wake word remains a Phase 2
  requirement; keyword artifact generation plus tuning evidence remains
  required before real wake tuning.
  Configurability is accepted, but implementation has not started: the
  editable phrase/config/raw keyword source must generate the artifact, with
  version/metadata and safe fallback visible.
- These notes preserve the application order: Tasks 3–5 are accepted,
  integrated, and pushed; Tasks 6–7 are accepted at their recorded boundaries;
  Tasks 8 and 9 are accepted; Task 10 remains planned and unimplemented;
  Phase 0 remains in progress, and Phase 1 remains blocked.

## Historical Task 6 and Task 7 completion boundary (2026-08-19)

- **Task 4 completion:** metadata-only, non-blocking telemetry is completed,
  root-reviewed, integrated, and pushed on `main` at `dca1327`. Focused
  telemetry verification is `21/21`; the full suite is `8 files / 113 tests`;
  Node plus web typecheck exit `0`; and the Electron Vite build exit `0`.
- **Authoritative caps:** Main-owned RAM ring max 2,000 events; non-blocking
  rotating JSONL max 5 MB per file and 5 files; writer queue max 1,000,
  dropping oldest and incrementing `telemetryDroppedCount`; Console
  pagination is a later consumer. No external telemetry stack is allowed.
- **Persisted boundary:** only time, module, event, status, optional
  duration_ms, error_code, session_id, scene_id, reason, and source. Transcripts,
  audio, prompts/private context/memory values, images/frames, embeddings, keys,
  Realtime secrets, raw errors, and arbitrary extra fields remain excluded.
- **Failure boundary:** writer, rotation, scheduler, and queue failures must
  remain visible through bounded RAM metadata/counters without blocking wake,
  Voice, Avatar, scenes, config, credentials, or lifecycle. Internal failure
  diagnostics use a non-recursive path.
- **Known risks:** the existing unrelated Node DEP0190 warning remains. Windows
  results do not field-verify target macOS Keychain/TCC/signing/entitlements/
  packaged-worker/LaunchAgent paths. Task 4 has no boot/IPC/Console wiring
  until its later owner.
- **Credential boundary:** `.env` remains ignored/present metadata only:
  exists true, ignored by `.gitignore` line 9, untracked, content/value never
  accessed, and validity not checked. Process records must not claim that the
  value was inspected. Long-lived credentials remain Main plus safeStorage;
  no `.env` value is recorded.
- **Wake boundary:** the wake phrase remains configurable and must be generated
  into a versioned detector keyword artifact with metadata and safe fallback.
  Task 4 records configurable keyword, configured_threshold, boost, and
  num_trailing_blanks metadata only; it never records per-event confidence and
  does not implement wake detection.
- **Task 5 completion:** SQLite initialization and the migration baseline are
  accepted, root-reviewed, integrated, and pushed on `main` at `a8f0355`, with
  32 focused tests, 145 total tests, and Node/web typecheck plus Electron Vite
  build green.
- **Task 6 completion:** the accepted plan is
  `docs/superpowers/plans/2026-08-19-phase0-task6-module-registry.md`; its
  five-command static gate passed (status scope, git diff check, 458
  lines/final marker/trailing whitespace, 10 required markers, and no
  forbidden markers). The plan was committed at `83be86b` on
  `phase0-modules`; the accepted implementation was root-reviewed and pushed
  on `main` at `5b95a94`, with 16 focused tests, 161 total tests, and Node/web
  typecheck plus Electron Vite build green.
  The selected design is a runtime-exhaustive Main registry with injected
  closed-outcome adapters and separate deterministic mocks, stable
  metadata-only results/events, informational missing-adapter handling,
  explicit `eventDelivery` values `emitted|failed`, no retry or sibling gate,
  and no boot/IPC/UI/model resolver. The application/test scope was
  only `tests/unit/module-registry.test.ts`, `src/main/module-registry.ts`, and
  `src/main/module-mocks.ts`. Task 7's accepted plan is recorded at `6214b6c`;
  its accepted implementation was pushed on `phase0-model-settings` at
  `5e24bdc`, with 7 focused tests, 168 total tests, Node/web typecheck plus
  Electron Vite build green, both negative runtime-model/fallback scans
  successful, and no OpenAI or `.env` requirement. Tasks 8 and 9 are accepted;
  Task 10 retains demos/records/exit ownership but remains unimplemented.
  Windows results do not field-verify target macOS
  Keychain/TCC/signing/entitlements/packaged-worker/LaunchAgent paths. The
  untracked `scripts/install-node-lts.ps1` remains untouched.

## Historical next action before Task 10 exit (2026-08-19)

1. Complete the root-accepted adversarial-review correction units in order;
   Unit A is documentation-only and Units B–E are not pre-claimed here.
2. Resume the corrected Task 10 plan only after Units A–E receive external
   root acceptance. Task 10 remains the Phase 0 demo/record/exit owner.
3. Keep Phase 0 in progress and Phase 1 blocked. No P0-D1–P0-D5 demo or
   release tag is complete yet.

## Task 2 completion and Task 3 preparation (2026-08-18)

- Task 2 is completed, reviewed, and locally integrated at
  `a7d74b14771de4f527762c30171ad2e68fc3d985` on `phase0-config`; the old
  `phase0-lifecycle` branch was deleted. The merged tree contains the
  Main-owned seven-state lifecycle implementation and focused test contract.
- Task 2 evidence: 31 focused lifecycle tests passed; merged-tree evidence is
  5 files / 51 tests with `npm run typecheck:node` clean. This is application
  test evidence from the completed Task 2 route, not evidence from this
  documentation worker.
- GitHub integration metadata was verified as
  `https://github.com/Novalien0424/magic-mirror`; `main` is pushed/tracking
  `origin/main` at the integrated commit. `phase0-config` has no push claim.
- Task 3 is prepared, not started, with the accepted plan at
  `docs/superpowers/plans/2026-08-18-phase0-task3-config-service.md`.
- Node `v24.19.0` now satisfies the development prerequisite. The untracked
  `scripts/install-node-lts.ps1` remains untouched.
- Phase 0 remains in progress. Phase 1 remains blocked until the complete
  Phase 0 demos and exit review; no demo is claimed here.

## Historical Task 1 local integration and pre-Task-2 verification (2026-08-17)

- `main` was locally fast-forwarded from `7c07244` to
  `426728f012556b4095eb8b25d94aa7476617f103`; no remote/upstream exists.
- `phase0-foundation` was deleted after green verification. At that time the
  `phase0-lifecycle` branch started at
  `426728f012556b4095eb8b25d94aa7476617f103`; it was later completed and
  deleted as recorded above.
- A fresh `nova-auto` `gpt-5.6-luna` max tester verified merged `main` at that
  exact HEAD: Node `v22.21.0`, `npm run typecheck` exit `0`, `npm test` exit
  `0`, 4 files / 20 tests, Vitest `34.96s`, clean.
- This was pre-Task-2 application state. Phase 0 remains in progress; the
  current sequential boundary is Tasks 3–5; Phase 1 remains blocked and must
  not start.

## Codex harness migration — Task 10 records-only update (2026-08-17)

- Control plane complete: `cb4f439` captured the RED/hash baseline; `cdf982b`
  added `AGENTS.md`, `.codex/config.toml`, and the three explicit worker roles.
- Seven migrated skills are complete and root-reviewed: `mm-phase-workflow`
  (`fba68fe`), `mm-invariants` (`899dd9d`), `mm-electron-foundation`
  (`4480897`), `mm-realtime-voice` (`b161421`), `mm-wake-word` (`7ddcdc4`),
  `mm-live2d-avatar` (`09cc954`), and `mm-face-identity` (`5ca5a6c`).
- Validation status: per-task static skill/metadata, trigger, retrieval,
  application-forward, and immutable-source `8/8` evidence is recorded; no
  application, source, dependency, or runtime changes were made. Final
  migration validation remains pending.
- This is migration state only. The application task table below preserves
  Task 1 as done + reviewed and records the later Task 2 completion and Task 3
  preparation separately.

## Codex harness migration - final validation (2026-08-17)

- Overall result: PASS from the ignored `.superpowers/sdd/2026-08-16-phase0-foundation/final-validation.md` at validation HEAD `14fb5ab`.
- Exact active set: seven skills — `mm-phase-workflow`, `mm-invariants`, `mm-electron-foundation`, `mm-realtime-voice`, `mm-wake-word`, `mm-live2d-avatar`, and `mm-face-identity` — plus three roles (`implementer`, `surveyor`, `tester`); no reviewer.
- Frontmatter/skill-validator, YAML, ASCII, TOML, control-plane, and stale-template scans: PASS.
- Immutable source receipt: `8/8`.
- Execution gate: Node `v22.21.0`; `npm run typecheck` exit `0`; `npm test` exit `0` — 4 files / 20 tests, duration `35.42s`.
- Migration scope: clean `23/23` allowed paths; no product/app/dependency/test changes.
- Discovery LIMITATION: recursive live-selector discovery was unavailable because of the root-only launcher. Earlier profile-backed Luna/max local-direct trigger/retrieval evidence exists for all seven skills, but it is not recursive telemetry.
- Commit evidence: design `15eae49`, plan `49479f6`, Task 1 `cb4f439`, Task 2 `cdf982b`, Task 3 `fba68fe`, Task 4 `899dd9d`, Task 5 `4480897`, Task 6 `b161421`, Task 7 `7ddcdc4`, Task 8 `09cc954`, Task 9 `5ca5a6c`, Task 10 `bd5f0a7`, Task 11 hygiene fix `14fb5ab`.
- The `Task 10` label in this historical commit list is a Codex harness
  migration task, not application Task 10. It does not change the current
  application status above: application Task 10 remains unimplemented.
- Residual: macOS field verification remains outstanding. The development Node
  prerequisite for application Task 3 is now satisfied by `v24.19.0`.

## Task status

| #  | Task                                            | State       | Evidence |
|----|-------------------------------------------------|-------------|----------|
| 1  | Scaffold, two windows, never-black-screen boot  | done + reviewed | `npm run typecheck` clean; `npm test` 4 files / 20 tests passing, incl. 4 spawned smoke runs; orchestrator review clean (3 minors deferred, see SDD ledger) |
| 2  | Lifecycle state machine (XState v5)             | done + reviewed + locally integrated | `a7d74b14771de4f527762c30171ad2e68fc3d985`; 31 focused lifecycle tests; merged tree 5 files / 51 tests; `npm run typecheck:node` clean |
| 3  | ConfigService + credentials                     | done + reviewed + integrated | `0270686` with correction/integration tip `835c92d` on pushed `main`; fresh merged-main 7 test files / 92 tests, full Node+web typecheck 0, Electron Vite main/preload/renderer build 0 |
| 4  | Telemetry (metadata-only, non-blocking)         | done + reviewed + integrated | pushed `main` tip `dca1327`; focused `21/21`; full `8 files / 113 tests`; Node plus web typecheck `0`; Electron Vite build `0` |
| 5  | SQLite + migrations (`node:sqlite`)             | done + reviewed + integrated | pushed `main` tip `a8f0355`; focused `32/32`; full `145/145`; Node/web typecheck `0`; Electron Vite build `0` |
| 6  | Module registry + mocks                         | done + reviewed + accepted + integrated | `5b95a94` on pushed `main`; focused `16/16`; full `161/161`; Node/web typecheck and Electron Vite build green |
| 7  | AI model settings resolver + snapshots          | done + reviewed + accepted | plan `6214b6c`; implementation `5e24bdc` on pushed `phase0-model-settings`; focused `7/7`; full `168/168`; typecheck/build and both negative scans green |
| 8  | Boot wiring, IPC, Mirror UI + OfflineLoop       | accepted | accepted application task; no Task 10 evidence implied |
| 9  | Console UI — 6 pages                            | accepted | accepted application task; no Task 10 evidence implied |
| 10 | P0 demo runner, exit criteria, tag              | done + accepted | Task 10B `13/13`; Task 10C `8/8`; full `311` tests; typechecks/build, ten smoke cycles, P0-D1–D5, and 30-minute OfflineLoop soak passed |

Phase demo records (P0-D1…P0-D5): passed. Task 10 and Phase 0 are accepted;
Phase 1 is next and has not started.

## How to run

| Command             | What it does |
|---------------------|--------------|
| `npm run dev`       | electron-vite dev: Mirror window (frameless, maximized on Windows) plus a hidden Console window. `Ctrl+Shift+D` toggles the Console. |
| `npm run build`     | Production bundles into `out/`. |
| `npm run typecheck` | `tsc --noEmit` over the node project (main/preload/shared/tests) and the web project (renderers). |
| `npm test`          | vitest. The smoke tests spawn real `npm run dev` runs, so a full pass takes ~35 s. |

## Boot smoke contract (produced by Task 1, consumed by Task 10)

| Environment variable            | Effect |
|---------------------------------|--------|
| `MIRROR_SMOKE_MS=<n>`           | Quit `n` ms after `app.ready`. Exit **0** only if both windows loaded and the lifecycle is exactly `dormant` or `maintenance`; exit **2** otherwise. `starting` uses `lifecycle_still_starting`; `activating`, `active`, `suspending`, and `offlineLoop` use `lifecycle_not_terminal`. Windows are created and loaded but stay hidden in smoke mode so repeated runs do not hijack the desktop. A set-but-unusable value (non-numeric, `0`, negative) exits 2 rather than silently booting non-smoke. |
| `MIRROR_FORCE_RENDERER_FAIL=1`  | Mirror preload throws: the window still loads and paints a Starting screen saying the bridge is unavailable, no readiness signal arrives, run exits 2. |
| `MIRROR_FORCE_RENDERER_CRASH=<n>` | Crashes the next `n` mirror renderers (test hook for crash recovery). |

Exit codes: `0` pass · `1` renderer recreate budget exhausted (the supervisor restarts the app) · `2` smoke conditions unmet.

Boot markers are written to stdout as `NAME key=value …` and are **metadata only** —
never transcripts, audio, prompts, memory values or credentials (invariant #1). They are
the Phase 0 stand-in for telemetry, which Task 4 owns:
`MAIN_READY`, `WINDOW_LOADED`, `WINDOW_LOAD_FAILED`, `WINDOW_SHOWN`, `WINDOW_KEPT_HIDDEN`,
`RENDERER_READY`, `LIFECYCLE`, `PRELOAD_ERROR`, `RENDERER_GONE`, `RENDERER_GONE_UNTRACKED`,
`WINDOW_RECREATED`, `FORCED_RENDERER_CRASH`, `IPC_SENDER_REJECTED`, `SHORTCUT_REGISTERED`,
`SHORTCUT_REGISTER_FAILED`, `CONSOLE_TOGGLED`, `CONSOLE_TOGGLE_IGNORED`, `APP_EXIT`,
`SMOKE_RESULT`, `SMOKE_CONFIG_INVALID`.

## Decisions taken in Task 1

- **Historical Electron `^43.0.0`** wording (43.4.0 at the time) is superseded by
  the corrected Task 10 exact `43.4.1` pin; this documentation unit does not
  change package metadata or the lockfile.
- **TypeScript 5.9, not 7.0.** TS 7 shipped recently; xstate 5 and the vite/electron-vite
  toolchain are only verified against 5.x. Revisit when Phase 0 closes.
- **electron-vite 5 peers vite ^7**, so the renderer uses `@vitejs/plugin-react@5` (vite 8
  would force plugin-react 6 and break electron-vite).
- **CommonJS output** (no `"type": "module"` in package.json): sandboxed preloads cannot
  be ES modules.
- **Preloads bundle self-contained.** A sandboxed preload cannot `require` a relative
  rollup chunk, so `src/preload/*.ts` may only take *type-only* imports from `src/shared/`.
  The IPC channel literal in each preload is pinned by the `BootChannel` type in
  `src/shared/bridge.ts` — renaming the channel breaks typecheck.
- **One restart owner.** In-app recovery recreates a crashed window once; when that budget
  is spent the app exits 1 and the macOS LaunchAgent (`KeepAlive={SuccessfulExit=false}`)
  restarts it. `app.relaunch()` is never called.
- **`node:sqlite` is in the main config's rollup externals** already, so Task 5 does not
  have to touch the build.

## SUPERSEDED historical Phase 0 placeholders

The following bullets describe the pre-Task-8/9 scaffold and remain only for
historical traceability. Tasks 8 and 9 are accepted; they are not current
status or a claim that Task 10, Phase 0, or Phase 1 is complete.

- The Mirror renderer's Starting → Dormant transition remains a local 1.2 s timer;
  Main now has the completed seven-state XState contract from Task 2, and Task 8
  will wire it through IPC.
- `src/main/index.ts` exports `createWindows()`; Task 8 wires `bootSequence()` into the
  same file.
- Console window is a shell listing its six pages as "Not implemented" (Task 9 fills them).

## Known gaps / pending verification

- **Mac-pending (Phase 7).** `resources/macos/*` were authored on Windows and are marked
  NOT field-verified in their own comments: Info.plist TCC usage descriptions,
  hardened-runtime entitlements, and the LaunchAgent. The `simpleFullscreen` +
  `alwaysOnTop` kiosk path and Keychain-backed `safeStorage` are likewise unexercised
  here; everything macOS sits behind `process.platform === 'darwin'` guards.
- **Renderer CSP not set yet.** Deferred to Task 8, which owns the visitor UI and must
  choose a policy that survives both the vite dev server and the packaged `file://` load
  (and later Cubism Core, which loads as a global script).
- **Development Node was previously 22.21.0, below `write-file-atomic@8`'s
  engine range** (`^22.22.2 || ^24.15.0 || >=26`). It is now resolved at
  `v24.19.0`, which satisfies the Task 3 prerequisite; Electron's own Node
  24.17 remains a separate runtime fact.
- **Navigation hardening not set yet** (`setWindowOpenHandler` deny, `will-navigate`
  guard). Nothing in Phase 0 can navigate, but Task 8 should add it with the visitor UI.
- Kiosk polish was deliberately out of Task 1 scope. The accepted correction
  plan now assigns one Main-owned `powerSaveBlocker` start/ID/stop contract to
  the pre-Phase-1 foundation; `pmset` and screensaver remain future target-Mac
  operations evidence, not Windows evidence.

## Codex harness migration — Task 1 Step 2 status (2026-08-17)

- Preflight/hash recording captured for the RED-baseline sequence; the ignored receipt records exactly 8 SHA-256 values for `CLAUDE.md` and the seven legacy skills.
- Known launcher ruling: the PowerShell wrapper was invoked directly, and an equivalent command-object marker returned `PROFILE_READY` with exit code `0`; no profile contents, credentials, environment secrets, or private data were recorded.
- Invariant IDs 1–12 remain unchanged product constraints; this metadata-only note does not change application task status.

# Magic Mirror — Progress

**Phase 0 — Foundation / Visible Skeleton: IN PROGRESS — Tasks 1–3 accepted; Task 4 current and not started.**

- Accepted Task 2 plan: `docs/superpowers/plans/2026-08-17-phase0-task2-lifecycle.md`
- Accepted Task 3 plan: `docs/superpowers/plans/2026-08-18-phase0-task3-config-service.md`
- Accepted Task 4 plan: `docs/superpowers/plans/2026-08-19-phase0-task4-telemetry.md`
- Task 3 accepted integration: implementation commit `0270686` and correction/
  integration tip `835c92d` are on pushed `main`.
- Fresh merged-main verification supplied for Task 3: 7 test files / 92 tests
  passed; full Node plus web typecheck exit 0; Electron Vite
  main/preload/renderer build exit 0.
- Current branch: `phase0-telemetry`, pushed from `main`; Task 4 is current
  and its implementation has not started.
- Verified integration metadata: GitHub origin is
  `https://github.com/Novalien0424/magic-mirror`.
- Workspace note: the untracked `scripts/install-node-lts.ps1` remains
  untouched and is outside this task's scope.

## Current setup and Phase 2 prerequisite (2026-08-19)

- **Credential setup (metadata only).** The user reports that the local OpenAI
  credential is provisioned through `.env`. Supplied metadata records
  `.env` exists: true, `.gitignore` line 9 rule `.env` ignores it, tracked by
  Git: false (untracked), content/value accessed: false, and validity checked:
  false. No value is recorded. `.env` is provisioning input only, not runtime
  renderer-visible storage; Main/`safeStorage` and short-lived renderer
  credentials remain authoritative.
- Credential existence does not itself prove account/billing/network/API
  validity, audio devices, or target macOS field readiness.
- **Phase 2 prerequisite.** Wake phrase selection plus generation of the
  detector keyword artifact remains required before real wake tuning.
  Configurability is accepted, but implementation has not started: the
  editable phrase/config/raw keyword source must generate the artifact, with
  version/metadata and safe fallback visible.
- These notes preserve the application order: Task 3 is accepted/integrated,
  Task 4 is current and not started, Task 5 remains next and sequential, Phase
  0 remains in progress, and Phase 1 remains blocked.

## Current Task 4 planning status (2026-08-19)

- **Task 4:** metadata-only, non-blocking telemetry is current and not started.
  The bounded plan is
  `docs/superpowers/plans/2026-08-19-phase0-task4-telemetry.md`.
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
- **Known risks:** the existing unrelated Node DEP0190 warning remains; Windows
  development does not field-verify macOS Keychain/TCC/signing/entitlements;
  Task 4 has no boot/IPC/Console wiring until its later owner.
- **Credential boundary:** .env metadata remains presence-only: exists true,
  ignored by .gitignore line 9, not tracked, content/value not accessed, and
  validity not checked. Long-lived credentials remain Main plus safeStorage;
  no .env value is recorded.
- **Wake boundary:** the wake phrase remains configurable and must be generated
  into a versioned detector keyword artifact with metadata and safe fallback.
  Task 4 records configurable keyword, configured_threshold, boost, and
  num_trailing_blanks metadata only; it never records per-event confidence and
  does not implement wake detection.

## Next action (for the next session)

1. Use the accepted Task 4 plan at
   `docs/superpowers/plans/2026-08-19-phase0-task4-telemetry.md` to execute
   its separate test-only RED, production implementation, focused GREEN,
   external-root-review, and full-suite/typecheck/build tester checkpoints on
   `phase0-telemetry`. Task 4 is current and not started.
2. Task 3 remains accepted evidence on pushed `main`: commits `0270686`
   and `835c92d`, 7 test files / 92 tests, full Node plus web typecheck exit
   0, and Electron Vite main/preload/renderer build exit 0.
3. Tasks 3–5 run SEQUENTIALLY (ledger Ruling R5), even where a product plan
   marks other work parallel-eligible.
4. No Phase 0 demo is complete from this preparation; P0-D3/P0-D4/P0-D5
   remain later consumers of the Task 3 and Task 4 foundation.

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
- Residual: macOS field verification remains outstanding. The development Node
  prerequisite for application Task 3 is now satisfied by `v24.19.0`.

## Task status

| #  | Task                                            | State       | Evidence |
|----|-------------------------------------------------|-------------|----------|
| 1  | Scaffold, two windows, never-black-screen boot  | done + reviewed | `npm run typecheck` clean; `npm test` 4 files / 20 tests passing, incl. 4 spawned smoke runs; orchestrator review clean (3 minors deferred, see SDD ledger) |
| 2  | Lifecycle state machine (XState v5)             | done + reviewed + locally integrated | `a7d74b14771de4f527762c30171ad2e68fc3d985`; 31 focused lifecycle tests; merged tree 5 files / 51 tests; `npm run typecheck:node` clean |
| 3  | ConfigService + credentials                     | done + reviewed + integrated | `0270686` with correction/integration tip `835c92d` on pushed `main`; fresh merged-main 7 test files / 92 tests, full Node+web typecheck 0, Electron Vite main/preload/renderer build 0 |
| 4  | Telemetry (metadata-only, non-blocking)         | current, not started | `docs/superpowers/plans/2026-08-19-phase0-task4-telemetry.md`; branch `phase0-telemetry`; exact implementation scope is tests/unit/telemetry.test.ts then src/main/telemetry.ts |
| 5  | SQLite + migrations (`node:sqlite`)             | not started | |
| 6  | Module registry + mocks                         | not started | |
| 7  | AI model settings resolver + snapshots          | not started | |
| 8  | Boot wiring, IPC, Mirror UI + OfflineLoop       | not started | |
| 9  | Console UI — 6 pages                            | not started | |
| 10 | P0 demo runner, exit criteria, tag              | not started | |

Phase demo records (P0-D1…P0-D5): none yet — Task 10 runs and records them.

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
| `MIRROR_SMOKE_MS=<n>`           | Quit `n` ms after `app.ready`. Exit **0** only if both windows loaded **and** the lifecycle left `starting`; exit **2** otherwise. Windows are created and loaded but stay hidden in smoke mode so repeated runs do not hijack the desktop. A set-but-unusable value (non-numeric, `0`, negative) exits 2 rather than silently booting non-smoke. |
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

- **Electron `^43.0.0`** (43.4.0 today) with a committed `package-lock.json`: pins the
  major per the plan while keeping patch fixes; the lockfile makes installs reproducible.
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

## Phase 0 placeholders (replaced by later tasks)

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
- Kiosk polish (cursor hiding, `powerSaveBlocker`) is deliberately out of Task 1 scope.

## Codex harness migration — Task 1 Step 2 status (2026-08-17)

- Preflight/hash recording captured for the RED-baseline sequence; the ignored receipt records exactly 8 SHA-256 values for `CLAUDE.md` and the seven legacy skills.
- Known launcher ruling: the PowerShell wrapper was invoked directly, and an equivalent command-object marker returned `PROFILE_READY` with exit code `0`; no profile contents, credentials, environment secrets, or private data were recorded.
- Invariant IDs 1–12 remain unchanged product constraints; this metadata-only note does not change application task status.

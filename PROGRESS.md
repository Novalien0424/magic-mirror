# Magic Mirror — Progress

**Phase 0 — Foundation / Visible Skeleton: IN PROGRESS — Task 1 of 10 done and reviewed.**

- Plan: `docs/superpowers/plans/2026-08-16-phase0-foundation.md`
- Branch: `phase0-foundation`
- Last verified: 2026-08-16, Task 1, on the Windows 11 dev machine
  (Electron 43.4.0, Node 22.21.0, electron-vite 5.0.0, vite 7.3.6, vitest 4.1.10)

## Next action (for the next session)

1. Resume subagent-driven execution: the SDD ledger is at
   `.superpowers/sdd/2026-08-16-phase0-foundation/progress.md` (on disk,
   git-ignored). It records Task 1 complete and 5 standing rulings — read it
   first; tasks with a `complete` line are done, resume at Task 2 (lifecycle
   state machine). Workflow: root harness rule + `mm-phase-workflow` +
   superpowers:subagent-driven-development; dispatch briefs live next to the
   ledger (`shared-interfaces.md` is the cross-task contract file).
2. **Before Task 3**: upgrade dev Node from 22.21.0 to ≥22.22.2 or ≥24.15.0 —
   `write-file-atomic@8` declares that engine range and Task 3's vitest run
   uses the dev Node (`npm install` already warns EBADENGINE).
3. Tasks run SEQUENTIALLY (ledger Ruling R5) even where the plan marks them
   parallel-eligible.

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
- This is migration state only. The application task table below is unchanged:
  application Task 1 remains done + reviewed, and application Task 2 remains
  next/not started.

## Task status

| #  | Task                                            | State       | Evidence |
|----|-------------------------------------------------|-------------|----------|
| 1  | Scaffold, two windows, never-black-screen boot  | done + reviewed | `npm run typecheck` clean; `npm test` 4 files / 20 tests passing, incl. 4 spawned smoke runs; orchestrator review clean (3 minors deferred, see SDD ledger) |
| 2  | Lifecycle state machine (XState v5)             | not started | |
| 3  | ConfigService + credentials                     | not started | |
| 4  | Telemetry (metadata-only, non-blocking)         | not started | |
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

- The Mirror renderer's Starting → Dormant transition is a local 1.2 s timer; Main tracks
  only "did the lifecycle leave `starting`". Task 2 brings the real XState machine and
  Task 8 wires it through IPC.
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
- **Dev Node is 22.21.0, below `write-file-atomic@8`'s engine range**
  (`^22.22.2 || ^24.15.0 || >=26`). Electron's own Node 24.17 satisfies it at runtime, but
  Task 3's unit tests run on the dev Node — upgrade the dev machine's Node before Task 3.
- **Navigation hardening not set yet** (`setWindowOpenHandler` deny, `will-navigate`
  guard). Nothing in Phase 0 can navigate, but Task 8 should add it with the visitor UI.
- Kiosk polish (cursor hiding, `powerSaveBlocker`) is deliberately out of Task 1 scope.

## Codex harness migration — Task 1 Step 2 status (2026-08-17)

- Preflight/hash recording captured for the RED-baseline sequence; the ignored receipt records exactly 8 SHA-256 values for `CLAUDE.md` and the seven legacy skills.
- Known launcher ruling: the PowerShell wrapper was invoked directly, and an equivalent command-object marker returned `PROFILE_READY` with exit code `0`; no profile contents, credentials, environment secrets, or private data were recorded.
- Invariant IDs 1–12 remain unchanged product constraints; this metadata-only note does not change application task status.

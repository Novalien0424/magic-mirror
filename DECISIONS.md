# DECISIONS.md — ADRs beyond Tech Spec §18

Newest first. Only durable decisions not derivable from the docs; the 11
architecture decisions in Tech Spec §18 are not repeated here.

## 2026-08-16 — Task 1 (Phase 0 scaffold)

- **TypeScript 5.9, not 7.0.** xstate 5 and the vite/electron-vite toolchain
  are only verified against 5.x today. Revisit when Phase 0 closes.
- **vite 7 + @vitejs/plugin-react 5, not vite 8.** electron-vite 5 peers
  `vite ^5||^6||^7`; vite 8 would force plugin-react 6 and break electron-vite.
- **CommonJS output** (no `"type": "module"`): sandboxed preloads cannot be
  ES modules.
- **Preloads bundle self-contained.** A sandboxed preload cannot `require` a
  relative rollup chunk, so `src/preload/*.ts` takes only type-only imports
  from `src/shared/`; the IPC channel literal is pinned by the `BootChannel`
  type so a rename breaks typecheck.
- **One restart owner.** In-app recovery recreates a crashed renderer once;
  when the budget is spent the app exits 1 and the macOS LaunchAgent
  (`KeepAlive={SuccessfulExit=false}`) restarts it. `app.relaunch()` is never
  called.
- **Smoke mode keeps windows hidden** so automated boot loops (Task 10) don't
  hijack the desktop; the visible path is exercised by plain `npm run dev`.
- **Env-gated test hooks** (`MIRROR_FORCE_RENDERER_FAIL`,
  `MIRROR_FORCE_RENDERER_CRASH`) ship in production code paths as the only
  way to E2E-test the failure branches; Phase 7 gates them behind a build
  flag before field deployment.

## 2026-08-16 — Session/process decisions (orchestrator)

- Docs are authoritative at v0.3.1 (in-place amendment, filenames keep v0.3);
  `docs/Magic_Mirror_Stack_Adversarial_Review_2026-08-16.md` records why.
- Implementation Plan owns phase exit criteria; Tech Spec §16 is a summary
  that defers to it on any mismatch.
- Extractor Draft baseline is `gpt-5.6-luna` (config data, not code);
  `gpt-5.6-terra` is the A/B candidate.
- SDD process rulings (review seat, sequential tasks, worktree choice) live
  in the SDD ledger: `.superpowers/sdd/2026-08-16-phase0-foundation/progress.md`.

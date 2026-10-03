# Wake activation and embedded scene audio — 2026-09-15

## Current delivery

The operator authorized applying and reloading. Fixes were copied from `.worktrees/wake-audio-fix-20260915` into canonical and extended following the requested audio audit. Previous session `89812` was stopped before QA. The worktree preserves the earlier proposed fix; canonical now owns the completed BGM isolation and pending-load repairs. [Audio rules, code owners and audit](audio-playback-audit-2026-09-15.md).

## Findings

- Current Windows telemetry at 07:31:36 and 07:31:49 UTC shows successful client-secret issuance followed by `realtime_runtime_start / invalid_payload` and `CLOUD_FAILED`. Current published avatar has both `voiceSpeed` and `voiceEffects`. Main accepts these optional snapshot fields, while Mirror preload rejects them and omits them from sanitization.
- Scene videos use the separate managed-media origin without setting `crossOrigin` before `src`; Web Audio requires a CORS-enabled media load. The protocol response already supplies CORS headers.
- Dormant fades the shared background bus to zero. Embedded video attachment does not restore it, so Console previews inherit silence. Current persisted effects volume is 1.

## Prepared changes

- Mirror preload validates and preserves the two supported optional fields, making a frozen copy of effects. Unknown fields and malformed values remain rejected.
- Scene video requests anonymous CORS before loading its managed URL.
- The final implementation confines stop/lifecycle fade to BGM's own gain. Shared ducking now responds only to avatar speech, so BGM stop cannot silence embedded video. Stop also invalidates pending music loads, and entering Active never cancels a pending stop. This supersedes the isolated worktree's preliminary attachment-time restore.

Six changed files: three implementation files and their focused tests. No credentials, model IDs, operator settings, dependencies, or lifecycle transitions were changed.

## Windows checks

- Before the fix: focused tests exited 1 with three expected failures (valid Voice Studio payload rejected, missing CORS mode, faded preview gain).
- `npx vitest run tests/unit/realtime-session-start-bridge.test.ts tests/unit/mirror-projection.test.ts tests/renderer/mirror/scene-visual-controller.test.ts tests/renderer/avatar/avatar-media-controller.test.ts`: exit 0, 63 tests / 4 files, in isolated worktree.
- `npm run typecheck:web`: exit 0.
- `npx electron-vite build`: exit 0; compilation only, no stamped QA or Electron launch from worktree. Existing Live2D classic-script warnings remain.
- `npm run typecheck:node`: exit 1, only the previously documented TS7016 missing declaration for `scripts/qa-artifacts.mjs` in `tests/unit/qa-artifacts.test.ts:6`.
- `git diff --check`: exit 0. Final six-file diff reviewed.

## Applied validation and operator retest

- Final canonical focused command: `npx vitest run tests/unit/realtime-session-start-bridge.test.ts tests/unit/mirror-projection.test.ts tests/renderer/mirror/scene-visual-controller.test.ts tests/renderer/avatar/avatar-media-controller.test.ts tests/renderer/avatar/audio/music-ducking.test.ts tests/unit/presentation.test.ts tests/main/scenes/scene-runtime.test.ts`: exit 0, **89 tests / 7 files**.
- `npm run typecheck:web` and `npm run build`: exit 0 after removing temporary QA instrumentation.
- Scoped Node TypeScript API check, excluding only the already documented unrelated `qa-artifacts.test.ts` declaration failure: exit 0, 182 files, zero diagnostics. Final diff whitespace check: exit 0.
- Targeted canonical Electron QA used `MIRROR_WAKE_AUDIO_QA=1 node scripts/run-phase4-qa.mjs --music-only` with temporary, synthetic-fixture-only instrumentation. Exit 0, **7 checks**, 2 video cases and 2 inspected screenshots. Real Realtime connection accepted Voice Studio options; final background audio signal was present in Dormant and Active, remained present after Stop BGM, and returned to silence after video completion. [Evidence](../../.artifacts/phase4-qa/2026-09-15T07-45-34-602Z/evidence.json). The temporary env branch and meter are removed from final code; the command is historical evidence, not a retained QA mode.
- No real visitor microphone was captured: the live connection used a silent synthetic stream. Physical wake detection, speaker sound quality and echo are still manual checks. No phase acceptance claim.
- Final canonical `npm run dev` session `11420` reported `MAIN_READY`, `WINDOW_LOADED` and `RENDERER_READY` for both Mirror and Console. Left running at `http://localhost:5173/` for the operator. Build outputs now contain development bundles.

# Scene idle timer and effective wake values — Windows, 2026-09-15

## Result

Scene runtime start/finish events now hold and release Main's idle timer. The
hold covers scene cleanup and overlaps correctly with avatar speech. Only the
last tracked scene finishing can allow a timer, and ongoing speech continues
to hold it. Completed/stopped/failed/replaced scenes all use the existing
terminal event. Lifecycle teardown clears holds; late unmatched completion
cannot extend a new session. The next idle interval starts in full after
playback finishes. Developer Mode now honors the published avatar's idle
seconds instead of silently capping them at 30.

Wake tuning inputs show their effective numeric values even when overrides
are disabled. Main reads defaults through the verified package loader and
production worker-package builder. Each field resolves its own phrase-bound
override or package value; the UI labels the source and identifies these as
effective draft values that apply after publication. Missing package data is
shown as unavailable. No threshold, score, trailing-blank setting or runtime
model was changed for the operator.

## Evidence

The user's runtime metadata showed a scene finishing at 22:14:08 Asia/Taipei,
followed by IDLE_TIMEOUT at 22:14:13. Ren was configured for 300 seconds, while
idle events reported 30 seconds. Source tracing found speech holds but no
scene holds, plus the Developer Mode cap.

Initial updated idle tests failed in three cases before the fix. Final focused
command (exit 0, **149 tests / 9 files**):

```powershell
npx vitest run tests/unit/boot-runtime.test.ts tests/unit/console-ipc.test.ts tests/unit/wake-tuning-ui.test.ts tests/unit/console-config-models.test.ts tests/unit/boot-ipc.test.ts tests/unit/realtime-privacy-cleanup.test.ts tests/main/wake/runtime-config.test.ts tests/main/wake/model-package.test.ts tests/main/scenes/scene-runtime.test.ts
```

Coverage includes long playback, overlapping speech/scenes, stale completion,
a full post-playback timeout, actual scene runtime-to-idle notifications,
package values differing from the installed baseline, partial overrides,
disabled/stale phrase tuning, missing defaults, and existing cleanup contracts.

- `npm run typecheck:web`: exit 0.
- `npm run build`: exit 0.
- `git diff --check`: exit 0.
- `npm run typecheck:node`: existing TS7016 only, at
  `tests/unit/qa-artifacts.test.ts:6` importing `scripts/qa-artifacts.mjs`.
- First Windows run preserved at
  [14:28 artifacts](../../.artifacts/phase4-qa/2026-09-15T14-28-16-370Z):
  numeric default display passed; the broader profile test failed by clicking
  New while deletion's asynchronous refresh still disabled controls. The test
  now waits for completion. The package-value screenshot was visually reviewed.

Final Windows profile run passed **32 checks with 30 screenshots**, runner exit 0, one pass result and no timeout:
[14:30 artifacts](../../.artifacts/phase4-qa/2026-09-15T14-30-02-185Z).
The new check compares the numeric controls against Main's verified package
values. Existing save/publish/reload assertions verify adjusted values 0.37,
1.7 and 2. The responsive matrix covers 1440×900 and 1024×768 layouts.

## Changed boundaries and limits

`src/main/boot.ts` and `ipc.ts`: Main-owned scene holds and configured idle.
`src/main/index.ts`, `console-config.ts`, `src/shared/console-types.ts`: verified
package defaults supplied to Console. `src/renderer/console/App.tsx` and
`AvatarCharacterEditor.tsx`: effective numeric inputs and source labels.
Focused tests and `src/main/profile-console-qa.ts` cover these changes.

Windows evidence only. Idle timing is verified with controlled timers and the
production scene-event connection. UI QA uses synthetic userData. No new
physical wake-accuracy, provider speech, microphone, Mac or phase-exit claim.
Wake misses remain for later measured tuning; the requested starting values
are now visible.

## Runtime handoff

Normal dev session **48314**, `http://localhost:5173/`, restarted from the canonical checkout at **22:31 Asia/Taipei**. Main and both renderers reported ready; Mirror shown. Left running for operator test. Ctrl+Shift+D opens Console. Rebuild stamped output before future Electron QA because dev replaces `out/`.

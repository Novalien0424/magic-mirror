# Historical handoff — superseded 2026-09-08

Snapshot before the Cubism Console handoff update. Runtime, next-action and
delivery statements below are historical; use [current progress](../../PROGRESS.md).

# Magic Mirror — Current handoff

Clocked out **2026-09-06 14:10 Asia/Taipei**. This file owns current status;
[AGENTS.md](../../AGENTS.md) owns execution policy and [DECISIONS.md](../../DECISIONS.md)
owns durable rulings. Read historical records only for a specific question.

## Delivery and running app

- Branch: `main`. Latest product commit `2206ac6` is pushed; remote hash matched.
  Earlier editor delivery: `1ed4a50`; wake diagnostics: `1c84930`;
  multi-avatar delivery: `33e93a8`.
- Canonical Windows app remains running via `npm run dev` at
  `http://localhost:5173/`. Main/Console/Mirror reported ready, smoke off;
  HTTP 200 rechecked at clock-out. Runtime state is point-in-time, not a watchdog.
- Console shortcut: `Ctrl+Shift+D`. It was left on the compact trigger editor.
  The operator authorized the last restart without saving pending UI edits;
  saved configuration and `sample/` were not changed by QA.
- Separate concurrent `CLAUDE.md` edits and untracked operator `sample/`
  remain untouched. Do not stage them blindly.
- Rebuild before Electron QA: dev rewrites `out/` and is not a stamped
  production build. Never overlap normal Electron, Electron QA, or `npm test`
  (the full suite includes Electron smoke). Preserve/resolve unsaved UI edits
  before stopping or reloading the normal app.
- Persistent Private TCP/UDP firewall rules were previously verified for
  canonical `node_modules\electron\dist\electron.exe`; path unchanged.
  Recheck only under the conditions in AGENTS.

## Phase status and next work

- Phases 0–3 accepted and tagged `phase0-v0.3.1` through `phase3-v0.3.1`
  as Windows checkpoints. Phase 4 active, unaccepted, untagged.
- Multi-avatar/character configuration was pulled forward by the user; this
  does not start guest identity, memory or Phase 8.
- First: operator validation of current scenes/media and the first-boot wake
  report. Then Phase 4 acceptance with required physical-adapter evidence.
- Phases 5 Identity/Profiles and 6 Memory follow sequentially.
- Phase 7 retains P2-D2 offline wake, representative multi-speaker corpus,
  19/20 live-wake sample, 30-minute ambient/TV negatives and field hardening.
- Remaining Phase 8 work: operator-owned custom Cubism rig, per-model
  calibration and character/voice quality. Mac mini M4 port and Mac-only
  deployment/accuracy/performance evidence follow PC development.

## Current product changes

- Scene editor: numbered vertical steps, nearby ordering, scoped Save step/scene,
  real draft Test action/step/scene, Stop All cancellation, saved-state
  normalization, tooltips and explicit unavailable reasons. Draft media needs
  neither publication nor an avatar switch.
- Trigger Phrase row: phrase, Enabled, cooldown seconds, accessible removal icon
  inline; no Spell options/name panel. Multiple phrases start the same scene.
- Multi-avatar: loadable public character profiles, personality/style/base voice,
  full public prompt inspection, per-avatar presentation/scenes/triggers,
  shared or owner-locked resources, managed Cubism imports.
- Media/lifecycle corrections: saved-draft routing, byte ranges, actual preview
  playback, wake background pause/hide, farewell-before-dormant, mic release,
  managed-model CORS and retired offscreen-mask cleanup.

## Evidence and unresolved risks

| Boundary | Latest evidence / remaining limit |
|---|---|
| Trigger row | 12 focused tests; typecheck/build exit 0. Editor QA retry: 26 checks / 20 captures, exit 0; native updated row inspected. First run passed trigger checks but failed Cubism coverage probe; no Cubism fix inferred from retry. |
| Scoped editor/media | 114 affected tests, typecheck/build exit 0; Console QA 29 checks / 27 captures. Earlier full suite: 896 tests before later focused fixes, not a final full-suite claim. |
| First-boot wake | **Unresolved**: operator says first wake fails until Start Conversation is used, then subsequent wake works. New RAM-only wake-stream level/block/report-age/detection diagnostics are present. Fresh/reset/post-silence synthetic probes and real capture/handoff checks pass but did not reproduce the reported difference. |
| Preview performance | Reproduced Windows stall corrected using scoped software video decoding, preserving WebGL. Personal high-resolution media, physical sound and hardware quality still need operator validation. |
| Normal sleep | Two actual-provider greeting/farewell cycles passed with no OfflineLoop and released input tracks. Physical wake/listening acceptance remains separate. |
| Multi-avatar | Full suite 883 tests at that earlier delivery; Console, portrait/live scenes and two-avatar provider cycles passed. Does not close Phase 4 or prove Mac readiness. |

Resume the wake investigation with actual speech on a failing first boot and
the new wake-stream meter; do not infer a fix from synthetic speaker playback.

Detailed evidence:
- [Scene editor and trigger-row QA](../testing/scene-editor-usability-2026-09-06.md)
- [First-boot wake investigation](../testing/wake-first-boot-2026-09-06.md)
- [Multi-avatar QA](../testing/multi-avatar-qa-2026-09-06.md)
- [Avatar/media RCA](../testing/avatar-media-rca-2026-09-05.md)
- [Harness audit](../testing/harness-audit-2026-09-06.md)
- [Operator scene/media checklist](../testing/phase4-scene-media-windows-checklist.md)

## History

[Pre-compaction progress snapshot](progress-through-2026-09-06.md)
retains prior handoffs, accepted-unit hashes, exact historical markers and
failures. Its stale phase/model/next-step wording is not current authority.
Clock-out compaction changes documentation only; no product or phase change.

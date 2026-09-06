# Spell-scene editor usability — Windows evidence

Scope: step navigation, scoped saving, draft playback, contextual help and
readability. No phase promotion, provider/model change, or personal-media test.

## Changes

- Numbered vertical steps; Move up/down alongside the list. Copy/Delete live in
  Step options, with independent copied actions and reversible removal.
- Save step persists only that step and its action/media dependencies. Other
  unfinished edits remain in the editor. Save scene includes ordering and spells;
  Save Draft still saves the entire workspace. Shared action effects are explained.
- Test action/step/scene saves the relevant draft and dispatches through the
  existing runtime. Main uses saved draft media without publishing or loading a
  different avatar; active and draft resource locks are respected. Preview media
  flags survive the strict preload boundary. Feedback/stop stay on the current
  runtime; new runtime generations fence stale reports.
- Hover/focus tooltips support Escape dismissal and disabled-control focus.
  Persistent text explains test blockers. Validate draft is explicitly a check,
  not playback. Publishing controls no longer cover the editor while scrolling.
  Playback status uses scene/step names and includes failure reasons.

## Checks

- Focused save, IPC, preload, media/controller/runtime tests: exit 0 (84 tests,
  followed by an additional passing saved-order test).
- Node/web typechecks and production build: exit 0.
- Real Console run: exit 0, 29 checks / 27 captures, including unpublished finite
  video completion, unrelated unsaved-edit preservation, keyboard tooltip and
  Escape, scoped action/step tests, copy/reorder/delete, publish guards and avatar
  locks. Artifact: `.artifacts/phase4-qa/2026-09-06T02-30-49-557Z/`.
- Initial actual-playback failure retained at
  `.artifacts/phase4-qa/2026-09-06T02-28-06-461Z/`: preload rejected the new flag,
  producing `visual_start_timeout`. Added RED/GREEN preload regression; corrected.
- Full regression initially found a missing React import in the tooltip's
  server-render path. Corrected; all 27 affected Console tests pass.

- Full suite: `npm test`, exit 0, 896 tests / 96 files. The subsequent pending
  Stop All fix passes 113 focused tests / 9 files, plus both typechecks and build.
- A later run exposed start/stop ordering: Stop All during draft save could
  precede the eventual test start. Pending tests now cancel in Console; Main
  serializes scene starts/stops. Deterministic IPC and actual UI cancellation
  checks cover this. The harness also clears stale completion text before tests.
- Escape dismissal now resets on a new hover/focus, not on mouse leave; hiding
  a tooltip beneath the pointer must not immediately reopen it.

Final Console run: `npm run test:phase4:qa:console`, exit 0, 29 checks / 27
captures at `.artifacts/phase4-qa/2026-09-06T02-41-34-082Z/`. Portrait display
750255250 verified at 800 × 1280 logical pixels, scale 2. This run covers pending
test cancellation, successful unpublished video, Escape help and the complete
existing Console journey. Captures inspected for readable controls, finite media
and full Avatar return. The intermediate 02:35 run overlapped the suite's Electron
smoke and is not final visual evidence.

Native Windows interaction in isolated manual sessions
`02-42-37-700Z` and `02-47-50-505Z` (same artifact parent): opened Scenes,
selected the finite visual fixture, clicked Test step, observed completed status
and the full returned Avatar. Hover/focus on disabled Move up displayed “Already
the first step”; Escape dismissed it. Both apps exited cleanly (exit 0). Manual
mode correctly retains `resultCount=0`, not an invented automated pass count.

Native review also found a phantom unsaved badge on legacy profiles. Comparison
now normalizes avatar defaults and ignores object-key ordering while preserving
array order and real changes. A temporary synthetic-only comparison proved that
the pre/post-save objects were equal but their serialized key order differed;
the diagnostic was removed. Durable regression and the final 49-test affected
subset pass. Before the key-order follow-up, the corrected initial saved badge
was also observed in the rebuilt native UI. Checkbox sizing no longer inherits
the full-width text-input rule. Final Node/web typechecks and build exit 0.

Normal canonical `npm run dev` restored at localhost:5173, Main/Console/Mirror
ready, smoke off. Saved operator configuration and `sample/` unchanged. The
concurrent unrelated `CLAUDE.md` change was not edited. Local implementation;
no phase acceptance, release tag or external deployment claimed.

## Trigger Phrase compact-row follow-up

Renamed trigger labels and Add Trigger Phrase; phrase, Enabled, cooldown seconds
and accessible trash-icon removal now share a row (wraps on narrow windows).
Removed the options disclosure and redundant name editor; existing stored names,
matching, cooldown conversion and Undo behavior are preserved.

Focused Vitest run (scene-composer, scene-editor-model, console-config-ui):
12 tests passed, exit 0. `npm run typecheck` and `npm run build`: exit 0.
The new render regression failed before the UI change. Electron checks verified
adding/removing phrases, collision rejection, 1.2 seconds saved as 1200 ms, and
enabled state publication. Inspected `console-trigger-phrase-inline.png`:
readable labels, aligned controls, no disclosure, and a clear removal icon.

`npm run test:phase4:qa:editor`: first run `2026-09-06T03-27-38-615Z` passed
the trigger checks but failed the later Cubism coverage probe
(`phase4_qa_managed_rig_incomplete`, exit 1). One unchanged retry
`2026-09-06T03-28-46-350Z` passed 26 checks / 20 captures, exit 0.
Both runs are under `.artifacts/phase4-qa/`; the initial probe failure is
retained, not treated as a trigger regression or a proven Cubism fix.
The user authorized restarting without saving the pending Console edits.

## Remaining operator checks

Delivery verification (2026-09-06): the final nine-file affected subset passed
114 tests (exit 0); `npm run typecheck` and `npm run build` both exited 0.
The prior normal app exited cleanly before the delivery rebuild. Commit/push
and latest-runtime confirmation are reported separately after execution.

Personal high-resolution video and physical audio/hardware quality still need
the operator. The separate first-boot wake report remains unresolved; this editor
change is not a wake fix. Phase 4 acceptance and Mac validation remain pending.

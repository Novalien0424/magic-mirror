# Console field help — Windows delivery, 2026-09-14

## Outcome and scope

Resumed the [paused tooltip task](field-help-handoff-2026-09-14.md) in the canonical checkout, `main` at `3b20c81`. Integrated the three preserved new files without copying the worktree's older audio baseline. Existing audio, harness and document edits remain local and intact. No commit, push or phase promotion.

All 82 input/select/textarea source locations in the Console now use `HelpField`, including conditional scene controls, mapped voice/volume sliders, hidden local speech selection, resource locks and dynamic Cubism parameters. An AST inventory found zero unwrapped controls. Dynamic parameters display the actual rig's name, ID, bounds and default. The editing-avatar description retains the full selected name and ID.

`HelpField.tsx` keeps the existing label, appends an accessible description, and places a separate 44px help target beside it. Help opens after a 400ms pointer dwell or immediately on focus; it supports click, Enter and Space pinning, Escape without losing focus, outside dismissal and moving the pointer into the popup. Body portals prevent panel clipping; positioning follows scroll/resize and flips within viewport bounds. Help remains usable inside disabled fieldsets. Explanations stay in `field-help-text.ts`; reviewed limits match the existing schemas and Models copy identifies the simulator boundary.

Integration files: `App.tsx`, `AvatarCharacterEditor.tsx`, `PresentationEditor.tsx`, `VoiceStudio.tsx`, `CubismStudio.tsx`, `ResourceAccess.tsx`, `SceneActionFields.tsx`, `SceneComposer.tsx`, and `styles.css` under `src/renderer/console/`. The trigger-phrase row has a wider cooldown column and an earlier responsive break to accommodate help without splitting its label.

Reusable QA: `src/main/field-help-console-qa.ts`, routed through `phase4-console-qa.ts` and `scripts/run-phase4-qa.mjs --field-help`. It uses isolated synthetic data, rendered production controls and real Electron pointer/keyboard events. Its disabled-fieldset case temporarily changes only the DOM disabled attribute, then restores it; it does not claim a production authorization transition.

## Fresh checks

- `npx vitest run tests/unit/field-help.test.ts tests/renderer/console tests/unit/console-ui.test.ts tests/unit/console-config-ui.test.ts tests/unit/console-phase-tests-ui.test.ts`: exit 0, **62 tests / 11 files**. New coverage assertions were first observed failing for missing descriptions. They cover persona, presentation and 13 conditional action variants. The Events keyword assertion now targets the Events panel; private-content sentinel assertions still cover the entire Console.
- `npm run typecheck:web`: exit 0.
- `npm run typecheck:node`: exit 1, existing TS7016 in `tests/unit/qa-artifacts.test.ts:6`, missing declaration for `scripts/qa-artifacts.mjs`. A TypeScript API check using the same config and excluding only that test checked **182 files, zero diagnostics**, exit 0. The unrelated declaration was not changed.
- `npm run build`: exit 0, stamped build at `2026-09-14T10:40:15.477Z`. [Build hashes](../../.artifacts/phase4-qa/2026-09-14T10-40-16-076Z/build.json).
- `node --check scripts/run-phase4-qa.mjs`: exit 0. Normal repository `git diff --check`: exit 0. A diagnostic invocation that disabled Git CRLF normalization incorrectly flagged existing CRLF endings; no line-ending sweep was made.
- `node scripts/run-phase4-qa.mjs --field-help`: exit 0, **20 checks / 6 screenshots**. [Final run](../../.artifacts/phase4-qa/2026-09-14T10-40-16-076Z/). Includes Devices, Models, Advanced config, Events, Phase Tests, Persona, Appearance, Voice, assigned rig and Rig library, scene end conditions, Tab focus, Enter/Space/Escape, hover, click and outside dismissal, disabled fieldsets and 1024/768 window widths.
- With `MIRROR_VOICE_QA=1`, `MIRROR_VOICE_QA_LIVE=0`, `node scripts/run-phase4-qa.mjs --editor`: exit 0, **6 checks / 3 screenshots**. [Voice run](../../.artifacts/phase4-qa/2026-09-14T10-40-51-932Z/). Local file decode/loop, Original/Processed, Stop, saved controls, avatar isolation and page leave passed. Raven fixture: `resources/avatar/Raven/v10/runtime/raven-lord.model3.json`. A GPU teardown message followed the passing result, as in earlier audio QA.

## Visual review and retained failures

Inspected the help captures and Voice Studio captures. Text, focus outlines, checkbox labels and range controls are readable; the cooldown label no longer splits mid-word. The tooltip stays within the narrow viewport and above the sticky action bar. The final [Rig library image](../../.artifacts/phase4-qa/2026-09-14T10-40-16-076Z/screenshots/field-help-rig.png) shows Ren and its dynamic parameter help together. [1024 scene](../../.artifacts/phase4-qa/2026-09-14T10-40-16-076Z/screenshots/field-help-scene-1024.png), [768 scene](../../.artifacts/phase4-qa/2026-09-14T10-40-16-076Z/screenshots/field-help-scene-768.png), and [Voice controls](../../.artifacts/phase4-qa/2026-09-14T10-40-51-932Z/screenshots/voice-default-controls.png) retain the relevant views.

- [First run](../../.artifacts/phase4-qa/2026-09-14T10-36-08-436Z/): exit 1, child 2. The second resize attempted to refocus the same Escape-dismissed trigger without first leaving focus. The harness now blurs between resize cases. Its screenshots also exposed the narrow cooldown column, repaired in CSS.
- [Intermediate pass](../../.artifacts/phase4-qa/2026-09-14T10-37-26-198Z/): 19 checks. The assigned rig's early screenshot showed a blank preview; no rendering claim is based on it. The final harness additionally enters Rig library, loads Ren and allows frames to settle before capturing.
- [Tab test failure](../../.artifacts/phase4-qa/2026-09-14T10-39-39-079Z/): exit 1, child 2. Devices refresh had temporarily disabled the source slider, so `.focus()` did not move there and Tab advanced from the old target. The final driver waits for the slider to be enabled and verifies its focus before sending Tab.

No provider audition, microphone capture, physical speaker acceptance, screen-reader or touch-hardware acceptance, full scene playback, or Mac verification is claimed. Phase 4 remains active and unaccepted. The complete editor journey's pre-existing config/navigation failure remains in the [audio report](audio-volumes-2026-09-14.md).

Both persistent Private Electron firewall rules matched the canonical executable. QA runs did not overlap normal Electron. Development startup after QA and the current runtime observation are recorded in [PROGRESS](../../PROGRESS.md).

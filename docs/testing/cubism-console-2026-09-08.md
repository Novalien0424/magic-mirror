# Dedicated Live2D Cubism Console — Windows evidence

Request: select/load Ren and Raven in a separate Console section and test each
rig's actions. Implementation plan: [Cubism Console](../superpowers/plans/2026-09-08-cubism-console.md).

## Delivered behavior

Top-level **Live2D Cubism** page: built-in Ren and validated managed imports,
native Browse/import, explicit Load preview, every group/index motion,
every exported expression, every actual MOC parameter with observed value,
slider, Min/Default/Max and timed Test, plus Stop/reset and Unload.
Leaving the page unloads the preview and cancels timed tests. Imports can be
assigned in Avatar / Audio → Appearance using the existing draft workflow.
Tests run locally without a microphone or configuration publication.

The renderer now loads all motion indices. Preview parameter writes are opt-in,
clamped to the actual rig bounds, applied after automatic effects, and cleared
on reset/model replacement. Reset stops animation and restores real defaults.
The normal Mirror does not receive preview controls.

Library discovery revalidates completed import directories after restart,
rejects junctions/unsafe paths/corrupt bundles, and reports skipped bundles.
Console-only IPC validates sender/frame and rejects caller-supplied arguments.

## Research and inspected inputs

- [Raven handoff](../../RAVEN-AVATAR-HANDOFF.md): final v07 bundle; seven
  lifecycle motion groups, five expressions, separate gaze/blink/beak inputs.
- Vendored Core 6.0.1 and Framework: actual parameter count/ID/min/max/default
  APIs, expression manager, indexed motion loading and WebGL disposal.
- Live2D [motion documentation](https://docs.live2d.com/en/cubism-sdk-manual/motion/)
  and [expression documentation](https://docs.live2d.com/en/cubism-sdk-manual/expression/).
  Body motion and expression blending are separate. A Speaking clip alone does
  not provide Raven's external mouth input.

## Focused checks

- `npx vitest run tests/unit/avatar-model-import.test.ts tests/unit/avatar-profiles.test.ts tests/unit/avatar-editor.test.ts tests/unit/console-config-ui.test.ts tests/unit/console-ui.test.ts tests/unit/console-ipc.test.ts tests/unit/avatar-component-contract.test.ts tests/renderer/avatar/cubism-preview.test.ts tests/renderer/avatar/avatar-runtime-controller.test.ts` — exit 0, 9 files / 69 tests.
- `npm run typecheck` — exit 0, Node and web.
- `npm run build` — exit 0, stamped production build.
- `node --check scripts/run-phase4-qa.mjs` — exit 0.

## Retained failed evidence

- `.artifacts/phase4-qa/2026-09-08T01-05-27-274Z/`: exit 2 from Electron
  (npm wrapper exit 1). Ren loaded and all seven motions/five expressions
  started; the new QA driver generated invalid subtraction syntax for a
  negative expected limit. Parenthesized the expected number.
- `.artifacts/phase4-qa/2026-09-08T01-06-28-460Z/`: exit 2 from Electron
  (npm wrapper exit 1). Found slider quantization at `ParamArmL03`. Core read
  confirms min −15, max 30, default 0. A 0.45 HTML step rounded the displayed
  default to −0.15. Changed the slider to `step="any"` to preserve real defaults.
- Initial focused checks caught the missing listing function (expected RED),
  a readdir overload type, the test JSX import, and stale expected tab lists;
  all were corrected before the passing focused run above.

## Operator state

Normal Console had unsaved Appearance changes with Raven selected. Used the
native Save Draft control and observed **Draft saved**, Active v12 / Draft 84
changes before stopping the old app. Did not validate or publish that draft.
Existing repository `.codex/config.toml`, `CLAUDE.md`, handoff/survey and `sample/`
changes were preserved.

Before native validation, normal configuration SHA-256:

- active: `ABF27F0C257B123AFAE96C0A35C561A7C98916245264417581CDF60DD34AEB35`
- saved draft: `9FDF232C4D953DAA800BB5B9E4FFEC34C2CF16323B1CB9A82357FF144E2FC711`

## Final isolated UI run

`MIRROR_CUBISM_QA_MODEL` set to the handoff's delivered v07 manifest, then
`npm run test:phase4:qa:cubism` — **exit 0; 219 checks; 6 captures**.
[Evidence JSON](../../.artifacts/phase4-qa/2026-09-08T01-10-19-572Z/evidence.json)
and [build provenance](../../.artifacts/phase4-qa/2026-09-08T01-10-19-572Z/build.json).

| Rig | Motion starts | Expressions | Parameter min/max/default checks |
|---|---:|---:|---:|
| Built-in Ren | 7 | 5 | 73 |
| Managed Ren with an added second Scene clip | 8 | 5 | 73 |
| Raven v07 | 7 | 5 | 27 |

Includes native-import cancellation via picker substitution, real managed import,
actual motion-start callbacks, live MOC parameter readouts, timed-test cancellation
for each rig, Raven → Ren replacement, page-leave cleanup, and byte-equivalent
configuration responses before/after. No mock renderer or direct config writes.

Inspected captures: [Raven neutral](../../.artifacts/phase4-qa/2026-09-08T01-10-19-572Z/screenshots/cubism-2-neutral.png),
[beak open](../../.artifacts/phase4-qa/2026-09-08T01-10-19-572Z/screenshots/cubism-raven-beak-open.png),
[eye closed](../../.artifacts/phase4-qa/2026-09-08T01-10-19-572Z/screenshots/cubism-raven-blink.png),
[Ren after replacement](../../.artifacts/phase4-qa/2026-09-08T01-10-19-572Z/screenshots/cubism-ren-return.png).
Raven's half-body and Ren's full body render intact; readable controls, visible
eye/beak changes, and no partial-mask regression in the inspected poses.

## Native Windows computer use

Used the installed Computer Use plugin to operate the normal Electron Console:

- Opened the top-level Live2D Cubism page and loaded built-in Ren.
- Tested Ren expression exp_04 and head-turn Test; observed minimum pose then
  completion and return to neutral.
- Opened the model selector. Both existing Raven imports were rediscovered;
  selected the handoff's final `e7eaac2d` suffix and loaded it over Ren.
- Ran Raven Waking and observed its actual completion; tested exp_05,
  Stop/reset, `ParamEyeLOpen` minimum and `ParamMouthOpenY` maximum. Inspected
  closed eye/open beak in the live window, then restored neutral.
- Browse opened the actual native file dialog. Cancelled it with Escape and
  observed **Import cancelled** while Raven remained loaded. No duplicate import.
- Sticky portrait remained visible while navigating the parameter list.
  Left the normal Console on the Cubism section with final Raven selected/loaded.
- Rechecked both normal config hashes after these actions: unchanged from above.

During startup, a delayed first launch briefly overlapped a second launch.
Stopped those processes and launched one clean instance before native testing;
the final Console shortcut and normal app operate in that instance. No UI test
was performed against the overlapping launches. Initial native attempts at
offscreen/cached controls were recovered by fresh observations and scrolling or
keyboard cancellation; the resulting actions were verified in the actual UI.

The avatar and UI QA guidance informed indexed motion coverage, real parameter
readback, safe managed loading, preserved drafts, and inspection of replacement
rendering. Some exported parameters have no rigged visible effect; changing a
valid parameter value is distinct from proving artistic movement for that ID.

Physical speech, camera tracking, human artistic acceptance and Mac behavior
are outside this local rig-control check. Phase 4 is not promoted by this work.

## Independent QA handoff

Use the dirty canonical `C:\Project\magic-mirror` working tree: the feature is
not committed/pushed at this handoff. Read root AGENTS/PROGRESS/DECISIONS and
the UI QA skill. The results above are prior evidence; record your own run
separately, including failures. Do not alter phases, model settings or drafts.

### Fixture and rerun

Raven v07 source is the complete folder containing:
`C:\Users\b8901\Documents\Codex\2026-09-07\new-chat\outputs\raven-lord\runtime\raven-lord.model3.json`.
See [asset handoff](../../RAVEN-AVATAR-HANDOFF.md); do not move/delete source
assets or substitute an earlier export. Check the path exists before running.

First inspect the running normal Console for new unsaved edits; preserve them
before stopping its process tree. Never overlap normal Electron, isolated QA
or full `npm test`. Firewall rules were verified for the canonical executable;
follow AGENTS if installation/path changes. This Console-only mode does not
require a portrait monitor and intentionally leaves display verification false.

From canonical checkout, PowerShell:

```powershell
npm run typecheck
npm run build
$env:MIRROR_CUBISM_QA_MODEL = 'C:\Users\b8901\Documents\Codex\2026-09-07\new-chat\outputs\raven-lord\runtime\raven-lord.model3.json'
npm run test:phase4:qa:cubism
```

Check each exit code before continuing. Use the single named mode, not combined
flags. Restore the previous environment-variable value afterward (remove it
only if previously unset). The optional variable adds Raven to built-in Ren
and the managed Ren second-Scene-clip fixture; without it, a pass excludes Raven.
The runner allows 300 seconds in-app / 310 seconds watchdog. It uses isolated
user data under `.artifacts/phase4-qa/<timestamp>/`, not the normal config.
Do not extend deadlines or bypass build hashes just to obtain a pass.

Run the exact focused Vitest command under **Focused checks** when checking
implementation regressions. Inspect `evidence.json`, `build.json`, exit code
and all six images directly; require expected rigs/cases, not just status text.
With the unchanged v07 fixture, expect 219 checks, 22 motion starts, 15
expressions and parameter inventories 73/73/27. `scene_count=0`,
`visual_count=0`, `music_analyser=not_executed` are deliberate exclusions,
not scene/music passes. Preserve every failed artifact directory.

### Native computer-use checks

After isolated QA exits, restore **one** normal built Electron instance from
canonical checkout if you stopped it. Preserve current state unless the user
requests otherwise; do not Validate/Publish the saved Raven Appearance draft.
Use the available Computer Use skill/plugin to operate the actual Console:

1. Open `Ctrl+Shift+D` → Live2D Cubism. Select/load built-in Ren; inspect the
   full body, controls and completion/reset after motion, expression and Test.
2. Select existing final Raven suffix `e7eaac2d`, then Load preview. Another
   older Raven suffix `9114fd4c` exists; do not delete it or confuse it with v07.
   Confirm intact half-body framing and actual motion completion.
3. Exercise head/gaze, `ParamEyeLOpen` Min and `ParamMouthOpenY` Max, then
   Stop/reset. Raven has 27 writable IDs, not 27 independently rigged visible
   actions. Speaking alone does not animate the beak; right-eye metadata does
   not imply visible right-eye artwork.
4. Observe timed Test's min → max → default cycle and cancel it with reset,
   unload, replacement and page navigation. Switch Raven → Ren and inspect
   full rendering, not merely ready status/nonblack pixels.
5. Open the actual Browse dialog and cancel without making a duplicate import.
   Automation substitutes picker return values; it does not prove native dialog
   interaction. Inspect sticky preview, scrolling and readable parameter rows.
6. Verify normal active/draft files remain unchanged from your own pre-QA
   hashes; retain hashes only. Leave final Raven loaded/neutral in the tester
   as handed off unless the operator requested a different state.

UI automation controls rendered DOM and production IPC; native computer use
and screenshot judgment are separate evidence. No provider/mic, camera,
physical speech, hardware or artistic acceptance is implied.

### Implementation map

- `src/renderer/console/CubismStudio.tsx`: library, selection/load separation,
  action/parameter controls, timers and cleanup; `App.tsx`/`styles.css`: page
  integration and layout.
- `src/renderer/avatar/cubism-preview.ts`, `cubism-avatar.ts`, `AvatarCanvas.tsx`:
  opt-in preview contract, indexed clips, Core parameters and serialized disposal.
- `src/main/avatar/model-import.ts`, `index.ts`, `ipc.ts`,
  `src/preload/console.ts`, `src/shared/bridge.ts`: validated managed discovery,
  media allowlist registration and zero-argument Console-only listing IPC.
- `src/main/cubism-console-qa.ts`, `phase4-qa.ts`,
  `scripts/run-phase4-qa.mjs`, `package.json`: isolated Cubism QA mode.
- Focused tests are listed above; the scoped [implementation plan](../superpowers/plans/2026-09-08-cubism-console.md)
  is design context, not a current phase or completion ledger.

Active harness updates: root AGENTS/CLAUDE, PROGRESS/DECISIONS, UI QA and Cubism
skills, and the [coverage plan](phase4-automated-qa-plan.md). Unrelated role/model
configuration and immutable `.claude/skills/` history were not rewritten.

Handoff documentation validation (2026-09-08): `quick_validate.py` under
`python -X utf8` passed for both edited skills (exit 0); local-link/fixture
check passed, 44 links across nine documents (exit 0); `git diff --check`
passed (exit 0). The first plain-Python Cubism skill validation failed on the
Windows cp950 default decoding existing UTF-8 text; explicit UTF-8 validation
passed without changing the content for that error. This documentation pass
did not rerun product QA, restart the app, publish config, commit or push.

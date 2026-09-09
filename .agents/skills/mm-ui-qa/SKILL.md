---
name: mm-ui-qa
description: Run and extend Magic Mirror Windows Console and portrait Avatar/Scene QA using the real Electron UI, isolated synthetic fixtures, runtime assertions, and screenshot inspection. Use for a requested visual or Console audit; ordinary unit tests do not need this skill.
---

# Magic Mirror UI QA

Use the repository AGENTS.md for execution policy. This skill owns the practical
QA route, not phase acceptance. Read the current PROGRESS.md handoff and the
[coverage plan](../../../docs/testing/phase4-automated-qa-plan.md) when choosing
cases; preserve the operator's normal user data and uncommitted changes.

## Choose the evidence needed

- `npm run test:phase4:qa:profiles`: new Avatar journey plus local Voice QA,
  independent persona/rig/voice/scenes, draft retention, invalid Save, guarded
  navigation/reload, saved scope after reload, Publish and Dormant activation.
  Captures 1440x900 and 1024x768 Console states. Active-conversation switch
  denial remains separate Main/unit evidence; this mode makes no provider call.

- `npm run test:phase4:qa:cubism`: dedicated Live2D Cubism page, every motion
  index/expression/actual MOC parameter, reset/cancellation and rig replacement.
  Mirror stays hidden; no portrait, speech or scene-playback claim. Built-in
  Ren and managed Ren with a second Scene clip are always covered. Set
  `MIRROR_CUBISM_QA_MODEL` to an external manifest to cover that rig too; an
  omitted value does **not** test Raven. Read the [Cubism rerun handoff](../../../docs/testing/cubism-console-2026-09-08.md#independent-qa-handoff)
  for the supplied Raven fixture, expected evidence and native checks.
- `npm run test:phase4:qa:editor`: real Console import, authoring, validation,
  Test/Publish and failure cases. Mirror stays hidden. No portrait or playback
  evidence is claimed by this mode.
- `npm run test:phase4:qa:console`: the editor journey plus actual finite-video
  playback and Avatar return on the portrait monitor.
- `npm run test:phase4:qa`: all exported Cubism motions/expressions, legacy
  Scenes, still/finite/loop/embedded-audio/replacement/failure cases.
- `npm run test:phase4:qa:live`: configured-provider conversation and audible
  output integration. Use only when live provider/microphone work is in scope.

Run `npm run build` after code changes before Electron QA; the runners execute
`out/`, not the source tree. The Phase 4 runner requires a completed build stamp
and verifies input/output content hashes before launching. Missing, interrupted,
stale or altered builds must be rebuilt, not bypassed. Each run retains the
hashes and build time in `build.json`; credentials/user data are never inputs.
Use one named npm mode on PowerShell: extra flags can be consumed by npm instead
of reaching the runner. Unknown/combined modes are rejected.

## Host and interaction boundaries

Launch Electron only from `C:\Project\magic-mirror`. Verify the two exact-path
Private firewall rules described in AGENTS.md before the first run. Do not run
two Electron QA sessions or interfere with an operator's manual test session.
Full `npm test` also launches Electron smoke; run it separately. Check for
unsaved Console edits before stopping/reloading the normal app.

Visual modes require an OS-reported portrait display and verify the actual
Mirror window's display. `PHASE4_QA_DISPLAY` records the selection and display
dimensions. A physically rotated panel still needs the correct Windows display
orientation. Ask which panel and whether to change orientation if Windows
reports all panels as landscape; do not guess. Editor-only work can continue.

The Console harnesses in `src/main/phase4-console-qa.ts` and
`src/main/cubism-console-qa.ts` drive rendered DOM controls
through Electron's `executeJavaScript`. It substitutes only the native file
picker's return value inside the isolated process, restoring it in `finally`.
Import, decode, React edits, IPC, validation, and publication remain production
paths. Read-only bridge assertions may check saved state. Do not mutate config
through the bridge to claim that the editor authored it. Native picker interaction
itself remains outside this automation.

Wait for the next control to be enabled, not just for success/failure text:
React can render the message before an async refresh clears the busy state.
Keep playback thresholds strict. Measure elapsed time alongside frame counts
and use metadata-only probes to distinguish a stalled video from a slow host.
Do not turn a diagnostic decoder flag or altered media source into a QA pass
for the normal production path.

## Judge and retain evidence

The runner creates `.artifacts/phase4-qa/<timestamp>/` with isolated config,
managed synthetic media, and screenshots. Never substitute personal scenes or
capture transcripts, private context, credentials, or unrelated desktop windows.
Generated media, public rig imagery and metadata are the only visual fixtures.
`evidence.json` retains the typed case results, selected display, and explicit
human/physical evidence exclusions. Inspect it alongside the command exit code.

Inspect `PHASE4_QA_STEP`, `PHASE4_QA_RESULT`, and `PHASE4_QA_ARTIFACTS`. A pass
requires exit 0 and the expected cases; `not_executed` is never a pass. On failure,
use the bounded reason and the Console failure screenshot to locate the failing
interaction. Fix the cause and rerun the affected mode rather than hiding a case.

Open captured images with the available image-viewing tool. Inspect Console
readability, error visibility, selected values, portrait framing, Avatar visibility,
and active/returned media frames. Nonblack pixels and changing hashes prove only
mechanical frame properties; they do not replace visual judgment. Static images
cannot prove smoothness, physical sound, conversational timing, or real fog/lights.

For profile Console visual QA, capture both the top-of-page hierarchy and the
actual action/error/disclosure being assessed. A screenshot named "publish
scope" is not evidence if its scope panel is below the frame. Move the pointer
to a neutral location before overview captures so incidental help popovers do
not hide fields. Inspect sticky action bars for discoverability AND obstruction;
check that long/duplicate names have a visible full-name/ID alternative, shared
resource scope is explicit, and narrow layouts keep controls and previews in
the page. Keep stable React keys distinct for simultaneous preview siblings;
rig-ready status and the assigned rig ID must agree after a selection change.

When the user requests an independent visual review, provide actual synthetic
images to the reviewer and record which were opened, concrete findings and
corrections. A text-only design review is not a visual review. Keep screenshots
until the requested reviews finish. If the user requests artifact cleanup,
record results/build hashes and the exact run roots first, then remove only
verified task-created isolated roots. Preserve reusable harnesses, written
findings and pre-existing operator artifacts.

### Marked artifact cleanup

New Phase 4 runs receive `.qa-artifact.json` at exclusive directory creation.
The harness marks completion after Electron closes, including failed results.
Save the results and requested visual review findings in `docs/testing/<name>.md`
before marking a run reviewed. From the canonical checkout, use an exact run ID:

```powershell
node scripts/qa-artifacts.mjs review <run-id> --report docs/testing/<report>.md
node scripts/qa-artifacts.mjs clean <run-id>
node scripts/qa-artifacts.mjs clean <run-id> --delete
```

`clean` defaults to a dry run with the resolved root, file/byte counts and
report reference. Use `--delete` when task/session authorization covers cleanup.
It refuses unfinished/unreviewed runs, filesystem links, ownership/path
mismatches, or changed evidence/report since review. Review failed-run evidence
before disposal; pass status alone does not authorize deletion. A report edit
requires re-review. The checks prevent accidental scope mistakes, not malicious
concurrent filesystem changes; stop artifact writers before reviewing/cleaning.

No glob, force, arbitrary-root or legacy-adoption option exists. Unmarked older
runs and interrupted setup remain retained for separate investigation. Do not
hand-write markers to reclassify operator data or retry a policy-rejected
deletion through another mechanism. Markers describe ownership and review;
they do not override tool approval. Preserve the exact policy rejection in
the handoff if cleanup is denied.

Test managed Cubism both at fresh start and after switching from another rig.
For framing changes, compare fresh model instances at identical 9:16 canvas
pixels/DPR and neutral state; record MOC canvas/origin/PPU and Layout. Inspect
head/body extremes, combined eye/mouth poses, resize and reference rigs.
Read back combined parameters after React and the observed-value refresh settle;
an input event alone does not prove the intended pose. Empty canvas alpha
readback is not a valid reference image; use actual window capture to distinguish
capture-path failure from missing rendering. Retain partial/failed evidence.
For the dedicated page, compare actual parameter readback to MOC bounds/defaults,
not only slider text. Timed Test/reset/unload/page leave must clear overrides.
Separate writable-but-unrigged IDs from visible motion; inspect meaningful
eye, mouth and head changes. Never publish the operator's draft to test a rig.
The Ren fixture's light-coat pixel coverage catches the observed partial-mask
regression; keep that fixture-specific assertion separate from general assets.
Live dialogue comparisons may normalize punctuation/case, not extra words or
changed wording. On timeout retain only comparison categories, counts and
settings-match booleans, never provider text.

Record commands, exit codes, case counts, exact artifact locations, display evidence,
visual observations, and remaining manual checks in a task report. Only the operator's
separate acceptance closes Phase 4; this skill cannot advance phases or tag releases.

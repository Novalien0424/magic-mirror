# Visual evidence and Cubism inspection

Repository implementation reference; installed code, current DECISIONS and focused contract tests outrank historical SDK/version observations. Follow AGENTS for execution policy.

## General visual evidence

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

## Cubism and live comparisons

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

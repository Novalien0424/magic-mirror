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
`out/`, not the source tree. Use named npm scripts on PowerShell: an extra CLI
flag can be consumed by npm instead of reaching the runner.

## Host and interaction boundaries

Launch Electron only from `C:\Project\magic-mirror`. Verify the two exact-path
Private firewall rules described in AGENTS.md before the first run. Do not run
two Electron QA sessions or interfere with an operator's manual test session.

Visual modes require an OS-reported portrait display and verify the actual
Mirror window's display. `PHASE4_QA_DISPLAY` records the selection and display
dimensions. A physically rotated panel still needs the correct Windows display
orientation. Ask which panel and whether to change orientation if Windows
reports all panels as landscape; do not guess. Editor-only work can continue.

The Console harness in `src/main/phase4-console-qa.ts` drives rendered DOM controls
through Electron's `executeJavaScript`. It substitutes only the native file
picker's return value inside the isolated process, restoring it in `finally`.
Import, decode, React edits, IPC, validation, and publication remain production
paths. Read-only bridge assertions may check saved state. Do not mutate config
through the bridge to claim that the editor authored it. Native picker interaction
itself remains outside this automation.

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

Record commands, exit codes, case counts, exact artifact locations, display evidence,
visual observations, and remaining manual checks in a task report. Only the operator's
separate acceptance closes Phase 4; this skill cannot advance phases or tag releases.

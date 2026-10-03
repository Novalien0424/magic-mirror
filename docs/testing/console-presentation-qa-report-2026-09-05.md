# Console and presentation QA report — Windows, 2026-09-05

Scope: readable Console, focused spell-scene authoring, and optional Cubism
sleep/wake presentation. This is engineering evidence, not Phase 4 acceptance.
The operator's normal active configuration was not replaced by QA fixtures.

## Implemented design

- Three primary pages: Overview, Scenes, Avatar / Audio. Settings and Diagnostics
  remain available in menus; detailed health and renderer tools are collapsed.
- 18px base text, secondary text at least 15px, higher-contrast labels, visible
  focus/selection, and 44px controls. Overview refreshes from Main snapshots.
- Scene -> exact spell -> selected step -> selected action. Inline action creation,
  independent duplicate steps, reorder, remove/undo, and advanced reusable actions.
  Save/Test/Publish and live-versus-draft distinctions remain explicit.
- Optional, validated presentation configuration. Existing installations retain
  always-visible behavior. Emerge mode layers a looping background beneath Cubism
  and procedural mist above it. Independent bounded entry/exit timing does not
  delay microphone release or session shutdown.
- Separate sleep ambience loops on the selected output, fades and pauses on wake.
  Background video is muted. The local Cubism preview uses no microphone/audio or
  provider session. Missing background media retains visible avatar fallback.

Research, implementation sequence, and pre-implementation self-review:
[plan](../superpowers/plans/2026-09-05-console-presentation.md).
Acceptance cases: [QA plan](console-presentation-qa-plan-2026-09-05.md).

## Verification

| Command | Exit | Result |
|---|---:|---|
| `npm run typecheck` | 0 | Node and renderer TypeScript checks |
| `npm test` | 0 | 88 files, 839 tests passed |
| `npm run build` | 0 | Canonical Electron production bundle |
| `npm run test:phase4:qa:console` | 0 | 21 checks, 19 screenshots |
| `npm run test:phase4:qa` | 0 | 7 motions, 5 expressions, 3 scenes, 5 visual cases, 28 screenshots; music analyser active |
| `npm run test:phase4:qa:manual` | 0 | Native Windows interaction; closed normally through File -> Exit |
| `git -c core.safecrlf=false diff --check` | 0 | No whitespace errors |

Console evidence:
`.artifacts/phase4-qa/2026-09-05T11-47-44-137Z/evidence.json`.
Screenshots are in that run's `screenshots/` directory.
Cubism/media regression evidence:
`.artifacts/phase4-qa/2026-09-05T11-51-29-811Z/evidence.json`.
The non-live dialogue scenes correctly report partial_failure with
no_active_realtime_session; their visual/music/adapter actions still complete.
These expected failures are not a real-provider conversation pass.

The real Console imported synthetic media through production decode/IPC, authored
and published scenes, rejected invalid or changed assets, preserved invalid drafts,
blocked unsaved publication, and exercised duplicate/reorder/remove/undo. Portrait
playback completed and returned to Cubism. Lifecycle presentation was simulated,
not provider-driven: asleep video/audio loops, entrance, awake audio pause, exit,
and return were asserted. Console state/buttons followed both activation and sleep.

Actual Mirror display: Windows display 750255250, 800x1280 logical, scale 2.
The Console ran on display 201176610. At 1000px and 1280px outer window widths,
Overview, Scenes and Avatar / Audio had no horizontal page overflow, base text
18px, visible text >=15px, enabled text contrast >=4.5:1 against its solid
background, and controls >=44px except checkboxes. This is targeted measurement,
not a claim of full WCAG certification.

## Findings fixed during QA and self-review

- Saving temporarily unmounted the step editor and lost selection: preserve the
  last successful payload during refresh.
- Object-key ordering could mark a saved presentation dirty: compare canonical
  safe draft projections on both sides.
- Overview was read only at startup: subscribe to snapshots and reject stale
  overlapping responses, without loading-state flicker.
- Preview controls were below a tall portrait: place compact controls above a
  smaller sticky preview so the whole avatar remains visible when operating it.
- Ordinary media start/stop events were being treated as degraded: classify
  failure reasons explicitly; do not erase existing failures on routine success.
- Synthetic sleep had no provider to send MEDIA_CLOSED: use the existing demo
  completion option only in QA. Production shutdown is unchanged.
- Full-resolution PNG encoding inside a timed scene blocked Main: retain the
  original frames in RAM and encode after scene completion. Timing limits remain
  unchanged; no product timer was relaxed.

The new Mirror DTO contains only presentation and managed asset id/kind. Optional
configuration preserves older payloads and requires no database migration. Existing
audio-device, idle-playback and SQLite work was preserved. No credential, private
conversation data, hardware write, dependency/model change or phase promotion was
introduced by this task.

## Human validation still needed

Native Windows clicks exercised step selection, independent duplication, saving,
visibility selection and a full local mist cycle with the actual Cubism rig.
The final native session (`2026-09-05T11-53-33-439Z`) verified simplified Overview,
Settings -> Config navigation and menu dismissal, scene selection, default
always-visible Cubism, Emerge from mist, full cycle, and independent entrance/exit.
The held awake preview displayed the complete avatar; the exit returned to mist.
Controls and the entire preview remained visible together after scrolling. Native
screenshots were inspected in-session; no automated pass marker is claimed for
manual mode. The isolated app was closed normally through File -> Exit.

Normal `npm run dev` was restarted from the canonical checkout after QA. Vite
reported `http://localhost:5173/`; Electron reported smoke=off and both Console
and Mirror RENDERER_READY. The development process remains running. No synthetic
presentation was published into the normal configuration; always-visible remains
the compatibility default until the operator chooses and publishes a presentation.

The audio selectors showed Windows default for both the 2-SRS-NB10 headset input
and headphone output. DOM/audio graph checks do not prove physical audibility.
Native file-picker operation, acoustic wake words over music, real-provider
conversation timing, final artist effects, physical lighting/fog, and macOS are
not accepted by these synthetic tests.

For the operator trial, prepare:

1. A seamless 20–60s portrait cloud/mist loop, with no embedded audio, and a
   separate quiet instrumental/ambient loop you own or have permission to use.
2. A 3–8s finite reveal video with a clear final frame to test video completion.
3. A short stereo-identification clip and speech clip for physical output and
   intelligibility checks; keep levels comfortable.

Suggested short scenes: a 3s sparkle reveal; a 5s reveal followed by a 1s return;
or a brief gesture/expression with an explicit music fade/stop step. Keep infinite
sleep loops in Avatar presentation, not in a spell scene.

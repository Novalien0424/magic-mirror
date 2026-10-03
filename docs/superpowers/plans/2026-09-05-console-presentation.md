# Console and lifecycle presentation implementation plan

Goal: a readable operator Console, short spell-scene authoring, and optional
looping sleep ambience with Cubism entrance/exit presentation.

Execution: inline under AGENTS.md. User requested planning -> self-review ->
implementation -> QA plan -> real Windows QA. No phase promotion or commit.

## Design and research

- Primary navigation: Overview, Scenes, Avatar / Audio. Configuration and model
  controls remain accessible under Settings; Events, Simulator and Phase Tests
  under Diagnostics. Do not remove errors or safety controls.
- Use 18px body text, secondary text at least 15px, normal text contrast >=4.5:1,
  visible keyboard focus and comfortable 44px controls. Responsive layouts must
  work at 1000px and 1280px wide without horizontal page scrolling.
- Scenes: select one scene; edit its exact spell and ordered steps. Focus one
  step at a time; add an action directly to it. Keep shared-action reuse in an
  advanced library. Duplicate steps with independent action IDs and remapped
  video-completion references. Preserve other scenes and existing authored data.
- Presentation: always-visible default, or emerge-from-mist. Background media
  below Cubism, procedural mist above it. Separate ambient audio from scene music.
  Sleep video/audio loop indefinitely, but wake cancels immediately. Entry/exit
  durations are bounded. Rapid lifecycle changes cancel old completion callbacks.
- Cubism Waking/Suspending motions accompany entry/exit; keep the renderer alive
  across ordinary wake/sleep. Visual transitions never own microphone or session
  teardown. Scene completion restores the underlying lifecycle presentation.
- Save/Test/Publish remains versioned and explicit. Test Draft is decode/config
  validation, not a real-provider or physical-hardware pass. Preview is local
  presentation-only and never starts recording or changes lifecycle.

Sources and adopted principles:

- QLab selected cue inspector and short sequences:
  https://qlab.app/docs/v5/fundamentals/cue-sequences/
- OBS explicit preview versus live operation:
  https://obsproject.com/kb/obs-studio-overview/
- Resolume layer-local media controls:
  https://www.resolume.com/support/en/layers
- Cubism motion groups and callbacks:
  https://docs.live2d.com/en/cubism-sdk-manual/motion/
- W3C contrast: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html

## Tasks

1. Config and deterministic presentation contract
   - Add optional `presentation` to shared config/safe Console views; absent means
     always-visible with no ambience. Validate strict shape, bounded durations and
     gains, and managed asset references. Preserve it in Console save/projection.
   - Add a Mirror-only read DTO containing presentation and managed asset metadata,
     not persona, model credentials, transcripts or identity. Refresh on published
     config version. Preview stays renderer-local in Console.
   - Tests: absent defaults, invalid fields/ranges/assets, round-trip publication,
     safe DTO; presentation state timing, fast wake/sleep and cancellation.
2. Presentation renderer
   - New focused renderer component/controller; integrate in Mirror App and CSS.
     Background video muted by default, separate ambient element on selected
     speaker. Fade ambience on wake and stop outside ordinary lifecycle states.
   - Preload background; hide avatar only after background ready, otherwise keep
     avatar/fallback visible and emit a bounded metadata reason. Procedural mist
     requires no missing external artist asset or unverified alpha-video codec.
   - Entry/exit motions use bounded presentation state, not mic/session delays.
     Report normal media stop as success, not degraded.
3. Console editor and readability
   - Preserve ScenesPanel import/save/test/publish wrapper and existing action
     capabilities; add scene/step selection, inline action creation, duplication,
     focused action editing, compact library and presentation settings.
   - Add pure editor helpers/tests for duplicate isolation and reference remapping.
   - Simplify overview/header/lifecycle controls; collapse technical information;
     remove inferred idle-timer status. Improve CSS hierarchy, spacing and contrast.
4. QA plan and checks
   - Write a task QA matrix after implementation, before executing acceptance.
   - Extend isolated real Console harness for focused editor and presentation
     controls. Keep production DOM/IPC authoring and capture only synthetic media.
   - Run relevant unit tests, both typechecks, build, Console/portrait harness and
     full repository tests given config/renderer/IPC impact.
   - Use native Windows computer-use to navigate, edit and preview in an isolated
     Console. Inspect screenshots at normal and narrower sizes, plus portrait
     sleep/entry/active/exit. Record native picker and physical-audio limitations.
   - Restart normal development app after tests, without publishing synthetic
     fixtures to normal user data.

## Plan self-review (before implementation)

- Coverage: operator readability, focused short scenes, both visibility modes,
  looping media, Cubism transitions and real UI QA each have a task above.
- Corrected risk: do not reuse the active-only Scene controller for sleep loops.
  Its cleanup would stop them, and an infinite scene would obstruct spell scenes.
- Corrected risk: an exit must outlive a fast Suspending -> Dormant transition,
  but must not delay realtime shutdown. Own visual timing separately.
- Corrected risk: background media is muted; ambience is a single separate audio
  path so embedded video does not accidentally double the sound.
- Corrected risk: new config is optional, and old Console payloads preserve the
  existing presentation when omitted. No migration or active-config overwrite.
- Corrected risk: duplicate stage action IDs and video end references together;
  editing a copy must not modify the original.
- Evidence boundary: synthetic media proves rendering/control paths, not the
  final artist effect, audible speaker quality or acoustic wake detection.
- Applicable invariants: 1, 6, 7, 8, 9, 10, 11, 12. No new dependencies, schema
  migration, model changes, credential reads, phase promotion or hardware writes.

## Execution outcome

Implementation and self-review completed. Both typechecks, 839 repository tests,
build, 21 Console/portrait checks, full Cubism/media regression and native Windows
navigation/preview tests passed. QA findings were corrected before the passing
runs. Evidence and human/physical limitations are recorded in
[the QA report](../../testing/console-presentation-qa-report-2026-09-05.md).
Phase status remains unchanged; no synthetic configuration was published to the
normal operator installation.

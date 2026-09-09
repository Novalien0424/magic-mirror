# Phase 4 automated Console and visual audit

Scope: Windows Phase 4 candidate, including the real Console editor and the
portrait Mirror display. Human acceptance, physical lighting/fog, and Mac
deployment remain pending. No Phase 5 engineering is included.

## Execution and acceptance

1. Verify the canonical Electron firewall rules and the connected displays.
   Require the Mirror on the portrait display; keep Console on another display.
2. Extend the isolated Phase 4 harness with a Console mode. Substitute only
   native file-picker selection. Drive real DOM controls and production IPC;
   inspect saved/published state without bypassing the editor for mutations.
3. Exercise import cancel/rejection/cleanup, finite visual authoring,
   Draft/Test/Publish, run/completion/Avatar return, invalid Stage combinations,
   missing links, rejected-save preservation, unsaved-edit publication safety,
   Stage reorder/delete, scene/action enablement, and Stop All.
4. Reproduce discovered product defects, patch their cause, and rerun the
   relevant cases. Add focused runtime tests for uncovered timeout or stale
   event boundaries using injected clocks.
5. Run Node/web typechecks, build, repository tests, real Console automation,
   and the existing synthetic Avatar/media QA. Inspect captured portrait and
   Console images directly. Frame changes and nonblack pixels are mechanical
   evidence; visual inspection separately checks framing and readability.
6. Create a reusable QA skill tied to these commands and evidence limits.
   Record exact results, artifact directories, outstanding human observations,
   and final diff review in a dedicated report. Do not accept/tag Phase 4.

Use synthetic fixtures and isolated user data. Do not capture operator content,
conversation audio/transcripts, credentials, or unrelated desktop windows.
The native Windows picker itself is outside automated selection coverage.

## Multi-avatar extension coverage (2026-09-06)

- Catalog: legacy preservation, independent scenes/spells, valid model/voice
  references, owner-only direct/transitive resource checks, bounded IPC.
- Author two avatars through Console controls; verify editing/loaded separation,
  dirty-draft guard, Save/Test/Publish, load in Dormant and reject during Active.
- Force load publication failure and concurrent save with unit seams; verify
  previous active/draft preservation and serialized writes.
- Import the complete public Ren model through the managed route; test unsafe
  paths, junctions and missing files; inspect both preview and switched Mirror.
  Require fixture light-coat coverage to catch partial-mask rendering.
- Execute selected action/step/whole scene through normal dispatch and Stop All.
  Run standalone motions before voice ownership. Use silent synthetic input for
  provider scene tests and a separate two-avatar greeting/sleep lifecycle suite.
- Compare actual provider voice/instructions and spoken-line classifications in
  RAM; retain only enums, counts, matches and playback/track state. Normalize
  punctuation/case, never changed or added dialogue.
- Native Windows check: select/load each profile, open Appearance, preview and
  stop selected media, verify full rig and readable controls. No operator data.

Results: [multi-avatar QA report](multi-avatar-qa-2026-09-06.md).

## Dedicated Cubism Console coverage (2026-09-08)

Use `npm run test:phase4:qa:cubism` for this boundary; the older full scene
mode is not a substitute for the dedicated Console journey. Read the
[independent QA runbook](cubism-console-2026-09-08.md#independent-qa-handoff)
for Raven's explicit fixture path, commands, prior results and native checks.
This mode hides Mirror: the portrait requirement above applies to visual/scene
modes, not this one. Apply proportionate checks per AGENTS, not every historical
plan step to every rerun. Never overlap normal Electron, QA or full `npm test`.

- Discover/select/load built-in and managed rigs without draft publication or
  live character switching. Import through production validation/managed copy;
  cover cancellation, invalid directories and Console IPC bounds in focused tests.
- Test every exported motion group/index (including the second Scene clip),
  every expression and actual MOC parameter min/max/default readback. Preserve
  exact range values; HTML slider quantization is a real failure.
- Check timed-test cancellation, reset, unload, page leave, model replacement
  and return to intact Ren rendering. Compare configuration before/after.
- Supply `MIRROR_CUBISM_QA_MODEL` for Raven; omission tests only Ren fixtures.
  Inspect meaningful blink/beak/head poses; writable-but-unrigged parameters
  are not evidence of visible artistic action.
- Inspect captures and run native Windows selection/dialog/control checks.
  DOM picker substitution is not native picker evidence. No physical speech,
  hardware, camera tracking, Mac or phase-acceptance claim.

Results and retained failed runs: [Cubism Console report](cubism-console-2026-09-08.md).

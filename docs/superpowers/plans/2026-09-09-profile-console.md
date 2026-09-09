# Avatar Console implementation and acceptance plan

Design: [profile workspace](../specs/2026-09-09-profile-console-design.md).
User requested implementation through validation, two Fable design reviews,
and cleanup. Review decisions are recorded before product edits.

## Implementation slices

1. Console navigation and scope helpers. Three primary destinations: Mirror,
   Avatars, System. Avatar sections: Persona, Appearance, Voice,
   Spells & scenes. Shared library within Avatars: Rigs, Media, Actions. System: Devices, Models,
   Advanced config, Diagnostics. Keep the existing ScenesPanel draft owner
   mounted across Avatars and Library. Keep Config/Models mounted and report
   dirty/busy state to the shell; prevent entering another draft editor until
   the current editor has saved. Mirror and diagnostic reads remain available.
2. Profile workspace: persistent editing/on-Mirror context, distinguish profiles
   by short public ID, explicit section headings and shared-resource scope.
   New creates clean defaults, Duplicate retains accessible links. Disable
   profile switching during async mutations. Saving and publishing clearly
   apply to all profiles; render affected profile names and shared sections.
   A two-step inline publication disclosure resets when saved payload changes.
   Use on Mirror shows its first blocking reason including non-Dormant state.
3. Persona contains character and spoken lines; Voice owns all delivery
   controls. Fine tuning collapses without disabling saved settings. Appearance
   has one assignment selector and a bound Cubism inspector without another
   selector. Its advanced local rig preview and presentation preview are
   separate labelled tasks; entering a page never generates provider audio.
   Shared library rig labels retain their explicit immediate-save scope.
4. Layout: compact primary navigation, responsive profile list, section tabs,
   single-column fallback, visible focus, touch-size primary controls, and
   publication actions that do not cover the bottom of long forms.
5. Adapt existing DOM QA navigation and action names; add a new-profile journey
   to the isolated Console harness using real controls/production IPC. Reuse
   native picker substitution only. Add focused pure helper and rendered
   contract tests for navigation ownership, publication scope and blockers.

## Acceptance matrix

| ID | Journey / failure | Evidence |
| --- | --- | --- |
| P01 | Identify editing versus running profile | UI text and public snapshot |
| P02 | Create profile, edit persona and spoken lines | DOM authoring, saved values |
| P03 | Rig assignment agrees with Appearance and Voice | DOM selection + read model |
| P04 | Independent voice/style/speed/effects | Two profiles, saved assertions |
| P05 | Create spell, scene and action | DOM authoring, validation/publish |
| P06 | Cross-section/profile and Mirror/System navigation retains unsaved changes | Navigate and read back |
| P07 | Config/Models cannot overwrite another unsaved draft | Guard and return route |
| P08 | Save changes draft only; invalid input fails visibly | Active/draft snapshots |
| P09 | All-profile/shared publish scope visible before confirmation | UI and published readback |
| P10 | Use on Mirror only after publish while Dormant | UI blockers + Main tests |
| P11 | Reload before publish keeps saved settings and publish scope; reload after activation keeps selection | Isolated renderer reload |
| P12 | Previews release resources on leave/profile switch | Existing voice/Cubism tests + UI |
| P13 | Shared locks prevent unauthorized reuse/editing | Existing editor QA + scope text |
| P14 | 1440x900 and 1024x768 readable, keyboard focus and no overflow | Window captures + DOM geometry |
| P15 | Bridge/loading/library failure remains visible/recoverable | Focused component tests |

Execution results and limits are recorded in the
[validation report](../../testing/profile-console-2026-09-09.md).
P15 combines rendered initial read-failure evidence, pure refresh-conflict tests
and source review; it is not an injected end-to-end bridge-outage test.

Run focused tests and both typechecks first. Before Electron checks, inspect and
preserve operator unsaved drafts without publishing. Full npm test (including
Electron smoke), build, isolated editor/new-profile QA and Cubism QA run
sequentially. Inspect captures rather than equating nonblack pixels with good
design. Physical sound, lights/fog and Mac behavior are explicitly excluded.

## Cleanup and delivery

Additional user requirement: after implementation, Codex and Fable independently
inspect actual Console screenshots for intuitive hierarchy and visual quality.
Cover spacing, typography, color/contrast, alignment, density, selected states,
empty/error states and both target sizes. This visual review is additional to
the two planning reviews. Correct concrete findings and recapture affected
screens. Improve the reusable UI QA skill and harness with lessons proved by
this task, avoiding generic workflow expansion. Do not delete captures until
both visual reviews and corrections are recorded.

Record exact source revision/build hashes, test commands, exit codes, case
counts, both review findings and visual observations in a written report.
Then remove only this task's verified isolated artifact directories (including
synthetic profiles, media, cache and screenshots) and temporary MCP client.
Keep reusable QA code, written journey/reviews/report and all pre-existing
operator files. Build and restore normal canonical Windows runtime, verify
ready state, commit/push the scoped changes under the user's delivery authority.

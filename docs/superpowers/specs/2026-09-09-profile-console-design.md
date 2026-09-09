# Profile-based Console design

User authority: redesign the confusing peer-level Console pages around Avatar
profiles; obtain exactly two Fable reviews of planning/UIUX; implement, validate
the complete new-profile journey, and clean up generated test artifacts.

## Operator model

Choose a public Avatar profile, configure its persona, appearance, voice and
spell scenes, check saved changes, publish, then explicitly put that avatar on
the Mirror. Editing a profile is not switching the running character. A shared
resource is not an independently copied profile setting. Guest identity and
private memory do not belong in this workspace.

Candidate navigation for review: Mirror / Avatars / System. Mirror contains
current active avatar/status and conversation controls. Avatars contains a
persistent profile list and four sections: Persona / Appearance / Voice /
Spells & scenes. Shared resources must be visibly separate from profile
settings; compare an explicit fourth Library destination with a secondary
shared-resources area. System owns devices, provider model settings and
collapsed advanced configuration/diagnostics.

Alternatives rejected provisionally: a linear setup wizard makes revisiting
one setting cumbersome; renamed peer tabs retain the original ownership
confusion. Prefer a profile workspace with guided section descriptions and
progressive disclosure, while preserving direct access for repeat operators.

## Truthful scope and editing

- Persistent profile context: Editing <name>, On Mirror <name>, unsaved/saved
  draft/published state. List works with long/duplicate names and up to 32
  profiles; distinguish identifiers without exposing guest identity.
- One existing rawDraft owner stays mounted across profile sections and
  shared resources. Switching profile/section preserves edits and cancels
  local audio/rig previews. Do not reinitialize drafts on navigation.
- Current backend saves and publishes the ENTIRE configuration. Labels must
  say Save all changes / Check saved changes / Publish all changes, with a
  visible summary of affected profiles and global/shared areas. No cosmetic
  per-profile Save promise. Check always operates on saved draft.
- Separate Use on Mirror from edit selection. Show why unavailable: unsaved
  changes, unpublished changes, profile not yet published, currently in use,
  or conversation active. Preserve Main's clean-Dormant guard.
- Config and Models currently own independent local drafts: protect cross-
  workspace edits from refresh/replacement. Navigation within a profile is
  lossless; cross-editor navigation must keep unsaved work or block it with a
  visible explanation and route back. No silent discard or automatic publish.
- Publish all changes shows affected-profile/shared scope before committing.
  Avoid repeated confirmation for Save or preview. Keep rollback in System.

## Profile sections

Persona: name, personality, wake greeting, farewell, inactivity. Move duplicate
base-voice and delivery-style controls to Voice. Effective prompt is advanced.

Appearance: assign a library rig to this profile using a single selection.
Inline preview follows the assigned rig. Existing Cubism motion/expression/
parameter inspector is advanced and locked to that assignment; it must not
have a second independent model selection. Import and rig name/version editing
clearly disclose that they affect the library; assignment remains draft-only.
Include profile presentation/background/ambience settings here.

Voice: base voice, delivery style and speed, preset buttons, preview first;
fine pitch/formant/EQ/room controls under Fine tuning. Original/processed A/B,
local loop/stop and generated audition retain existing privacy/output lease.
Opening or navigating never calls the provider. No changes to DSP behavior.

Spells & scenes: this profile's phrases, scene steps and actions. Preserve full
existing editor, saved-step tests, owner locks and exact spell matching. Do not
label these as configurable AI plugins, which do not exist. Show shared-action
impact at the point of editing and provide ownership controls already supported.

## Layout and implementation constraints

Readable task labels, one selected primary destination, profile rail and one
section editor, compact active-Mirror strip rather than full conversation
controls on every editor. Use existing fonts/theme; 44 px controls, visible
keyboard focus, no horizontal document overflow at 1024x768 or 1440x900.
Collapse the profile rail at narrow widths. Advanced diagnostics do not
compete with everyday character setup.

No config schema migration, new dependency, new guest/profile identity flow,
DSP retuning or backend publication semantics change. Extract focused shell/
navigation helpers from App only where needed. Existing draft/read models,
strict validation and Main checks remain authoritative. Canonical invariants
1, 3, 7–12 apply; no transcript/audio/private context in test artifacts.

## New-profile journey and QA plan

All mutating acceptance uses real rendered controls and production IPC in a
canonical Windows Electron process with isolated synthetic user data. Only
native picker return values may be substituted. Test cases and exit markers
must prove the journey, not only screenshot presence.

1. Open Mirror; identify active profile and system readiness. Open Avatars;
   identify editing versus running profile and see only profile sections.
2. Create New avatar; set a distinctive name/personality, greeting/farewell.
   Verify defaults and no inherited owner-locked assets that invalidate saving.
3. Assign imported Raven v10; see its full preview and the same assignment in
   Voice. Exercise motion/expression/parameter preview; leaving resets it.
4. Choose voice/speed/style/preset, adjust fine tuning. Play a synthetic local
   file, A/B, loop and Stop. Navigate away during playback/setup and verify
   cleanup. No provider call needed for UI redesign acceptance.
5. Create a spell and finite scene with at least one action through the editor.
   Add a reusable/shared action and inspect sharing scope; owner-lock controls
   prevent another profile from editing/using locked resources.
6. Navigate Persona->Voice->Scenes->Appearance and between two profiles before
   Save. Verify independent values and no lost edits, including long names.
   Attempt entering a second draft editor and verify the unsaved guard.
7. Save all changes. Verify saved independent profiles and active configuration
   unchanged. Check saved changes; invalid/missing scene references fail visibly,
   preserve the draft, and block publish. Correct them through the UI.
8. Inspect the publish scope; confirm all saved changes including other profiles
   are named, then publish synthetic config. Use on Mirror while Dormant.
   Verify active persona, rig, voice/speed/effects and spell/scenes by public
   read-only snapshot assertions. Active-conversation switching is denied.
9. Reload the isolated Console and/or restart the same isolated fixture. Verify
   saved/published profile, rig selection and other settings persist. Editing
   another profile does not change the active one. Stop previews on page leave.
10. Inspect screenshots at 1440x900 and 1024x768 plus keyboard focus/order,
    headings, labels, overflow, sticky actions and inline failure messages.
    Empty/loading/missing-library states remain readable and recoverable.

Also run affected unit contracts, renderer tests, Node/web typechecks, build,
adapted existing scene-editor and Cubism QA. Full npm test includes Electron
smoke and must not overlap normal runtime or other QA. Capture pass/fail counts
and remaining human-only limitations. Do not claim hardware sound/lighting/fog
or Mac acceptance from this UI task.

Before restarting normal runtime, inspect/preserve unsaved operator edits.
Never publish the operator's draft for testing. After recording the final
report, remove this task's isolated userData, generated fixtures, caches,
screenshots and temporary review-client files using verified absolute paths
inside this task's artifact roots. Preserve code, QA harnesses and written
review/validation findings; do not remove pre-existing artifacts.

## Review checkpoints

Round 1: critique ownership/navigation alternatives and the journey above.
Revise design and write implementation tasks. Round 2: adversarial review of
the revised design/plan against concrete failure states and acceptance cases.
Record both review identities, substantive findings, decisions and costs.
Do not count a tool error as a review or relaunch a paid job without checking
its idempotency key/job record.

## Round 1 decisions and source facts

Adopt Mirror / Avatars / System. Shared library is a visually separated scope
inside Avatars, with Rigs / Media / Actions; it is not a fourth peer destination.
All three existing draft owners are unconditionally mounted in App today and
remain so. Mirror/System round trips preserve edits. Entering another mutable
draft owner is blocked while one is dirty/busy, with a direct return button.
Consequently Save all changes includes all currently editable unsaved fields;
provider settings cannot have concurrent unsaved edits. Use persisted
payload.active versus payload.draft for publication scope, and rawDraft versus
payload.draft for unsaved scope. Reload between Save and Publish in QA.

Refresh from successful Save/Publish/Load/Rollback updates clean owners. The
cross-owner guard prevents rollback while Avatar edits are dirty. An unexpected
changed saved baseline while dirty retains edits, blocks Save, and offers an
explicit discard/reload action; never merge or overwrite silently.

New avatar uses UUID independent of guest identity, built-in Ren, alloy voice,
speed 1, bypassed effects, default inactivity and presentation, no scenes/spells.
Keep the required nonempty default farewell: the review's empty-farewell/no-rig
suggestion conflicts with current schema. Duplicate is a separate operation.
Check remains disabled while dirty (already implemented today). Save failures
already include exact schema field paths; show them with profile/section context
where possible, without promising a new arbitrary scene-selection API.

Cubism inspector is already preview-only; profile mode receives the assignment
as a prop and hides library writes/independent selection. Clear timers/overrides
on leave. Voice cleanup covers profile/section/destination/close/reload and
explicit Use on Mirror; publishing should also stop previews. Rig labels are
immediate shared library writes and have their own Save label control.

Existing QA runner supplies separate per-run userData, prevents process overlap,
and emits typed case results. Preserve this mechanism, record exact created run
paths, verify confinement before cleanup. Actual output-device integration uses
the existing isolated preview lease; do not substitute a null output and claim
production audio passed.

## Round 2 closure

Keep the existing hard Check gate: each saved revision needs a successful Check
before Publish; edits or failed media decoding block publication. The disclosure
names affected profiles/shared areas and confirms the whole saved revision.
Invalid schema is tested at Save, not by weakening validation to make it reach
Check. Existing editor QA separately covers an imported media file becoming
undecodable after Save and Check blocking Publish. Dormant activation uses the
existing isolated QA boot; active-session denial is Main unit evidence plus UI
blocker tests, without generating a provider conversation for this redesign.
Rig labels are separate sidecars returned by listAvatarModels, not config draft
fields; Appearance refreshes their display by stable rig ID. Add a dirty
beforeunload guard and a saved-baseline conflict test. No third planning review
is needed; the separately requested Fable visual review follows implementation.

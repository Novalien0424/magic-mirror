# Spell-scene editor usability plan

Goal: edit a step, save its draft, and test that draft without publishing; make
every structural operation and unavailable action understandable.

Approved design: numbered vertical steps; ordering beside the list; Copy/Delete
under Step options; Save step / Test step / Stop beside the step editor; separate
scene publishing. Add hover and keyboard-focus tooltips, with disabled reasons
also visible as text. Rename configuration Test Draft to Validate draft.

Constraints: preserve personal drafts, resource locks and loaded-avatar identity.
Use the existing scene runtime/cleanup; no second scheduler, automatic publishing,
dependency changes or new microphone owner. Test buttons act on the Mirror.

- [x] Scoped saves: add a pure draft merge in scene-editor-model, retaining
  unrelated saved steps/settings, copying the selected step's actions and media;
  retain other unsaved editor changes across the save response. Test isolation,
  new scenes, reordered/new steps, shared action dependencies and saved status.
- [x] Draft playback: extend the existing runScene bridge with an explicit draft
  source, select validated saved draft in Main, reject unloaded-avatar tests and
  resource-lock violations. Include draft source in runtime cache identity;
  route visual/music commands to existing draft-media endpoints. Verify source
  selection, stop/cleanup, sender checks and no publish/config changes.
- [x] UI: reorganize SceneComposer, add accessible tooltip/help components,
  show save/test status next to controls and explicit blockers. Preserve Undo.
  Save step/Test step share the scoped-save path; Test step saves before playing.
  Whole-scene save/test remains separate and named accordingly.
- [x] QA: focused model/IPC/renderer tests, Node/web typechecks and build;
  update existing Console harness for labels and add unpublished step save/test
  assertions. Run isolated Windows editor QA and inspect real hover/focus help,
  layout, disabled reasons and media playback. Restart the normal app afterward.

Self-review: a renamed published-test button is insufficient. Main must select
the draft, draft media must resolve, and scope saves must not discard unrelated
unsaved edits. Publishing remains explicitly separate from preview.

Evidence and fixes discovered during real UI verification:
[Windows QA report](../../testing/scene-editor-usability-2026-09-06.md).

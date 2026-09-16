# Raven V11 audit — 2026-09-16

Status: **implementation / SDK candidate; not visually or artistically accepted**.
Baseline: `7072a1cfa44733c44c6aa6d63c6f167d6a0e2d03`. Work was performed in
an isolated Linux checkout, not the canonical Windows host. No live model,
Appearance publication, operator draft, phase acceptance or running Windows app
was changed.

## Brief and scope

The user's latest instruction supersedes an earlier awake-Dormant proposal:
Dormant closes the eyes with extremely slight movement; Waking only opens the
eyes with a small adjustment. The state-by-state plan is in [README](README.md).

V11 changes seven motion files, five face-only expressions and explicit profile
metadata, together with the renderer and Console descriptions. The MOC, atlas,
physics data and Layout remain V10's original assets. The profile bypasses
physics/generic breath at playback. V10's 17 runtime files still match the
historical SHA-256 inventory.

This is a performance update, **not a new rig derived from the generated images**.
Generated A1/A2 beak, A3/A4 eyelid and B1–B4 angle images were reviewed as targets
in the preceding reference-image QA. They differ in canvas size and redraw
clothing/feathers; they are not registered texture layers. In particular,
A4's closed-eyelid drawing is not present in this MOC. The editable CMO/PSDs
listed in V10's archive are ignored and absent from this clone. Large-angle
view synthesis and rebuilding feather/eye/beak topology remain Editor work.

## Diagnosed and repaired

| Finding | V11 behavior |
| --- | --- |
| Dormant did not author eyelids; expression Add −0.7 left a slit | Authored eyes 0, closed initial pose; automatic blink disabled for sleep/wake/settle |
| Generic breath added head swings after a quiet motion | Explicit profile assigns head/body/breath to authored curves only |
| Physics rewrote body Z; expressions added extreme head/body offsets | Physics bypassed for this profile; expressions only affect eyes/smile |
| Waking repeatedly reversed direction; all curves were linear | Small eased adjustment with holds; restricted cubic segments and zero-tangent loop seams |
| Meta.Loop alone did not configure actual playback | Explicit SDK loop flag on every lifecycle start/resume |
| Waking/Suspending restarted after completion | Waking/Scene/Suspending play once and hold, including finite Console previews |
| stopAllMotions discarded transitions | Independent motion instances crossfade; output continuity survives interruptions |
| SDK stopAllMotions skipped alternating fading entries | Public-API draining removes every motion/expression entry at cancellation/reset |
| Old same-group completion could steal a newer action | Generation-scoped callback ownership |
| Low-pass eye filtering never reached zero during blinks | Exact zero preserved; tested with real SDK blink over time |
| Console sets Dormant before a selected preview | Selected group owns preview blink/finite behavior; reset disables all motion/effects |
| Motion group could suppress a live utterance's beak | Actual lifecycle governs live mouth; selected group only governs silent preview |

The drain/callback cancellation correction also applies to existing models.
Other Raven performance choices are opt-in only; there is no ID/name heuristic
or global Ren expression replacement. Manual sliders remain last. No audio
capture, transcript or private-context changes were made.

## Measured evidence

- Focused Vitest: **92 tests / 9 files passed**, exit 0. Includes 34 Raven tests,
  existing model import/validation, state/runtime controller, framing, preview
  and component contracts. No full suite or Electron smoke was run.
- `npx tsc --noEmit -p tsconfig.web.json`: exit 0.
- Skill `quick_validate.py .agents/skills/mm-live2d-avatar`: valid, exit 0.
- Tests advance actual vendored CubismMotion managers through three loops and
  finite completion/hold, parse every motion with consistency checks, evaluate
  expression blending, exercise blink/continuity and multiple-entry draining,
  and compare unchanged V10 hashes and V11 MOC/atlas/Layout.
- `node scripts/audit-raven-core.cjs`: exit 0. Actual Core reports version 6.0.1,
  27 parameters and 22 drawables. Full structural result: [CORE-AUDIT.json](CORE-AUDIT.json).
  Eye L changes the closed-lid patch; mouth changes interior/lower-jaw/front-beak
  parts. Eye R produces no drawable difference at the neutral side-view probe;
  that is not proof of a faulty rig or of right-eye behavior at other angles.
- The actual atlas was opened and visually inspected as a texture atlas. This
  is not a composited model image and cannot prove masking, seams or naturalness.
- Independent review found the queue-drain, playback identity and incomplete
  blink defects above; those were repaired and regressed.

## Failed / unavailable evidence, retained explicitly

- Vite audit server initially failed `uv_interface_addresses`; a localhost-only
  server started, but the cloud browser rejected its URL (`ERR_BLOCKED_BY_CLIENT`).
- The shared-file preview URL was explicitly rejected by browser URL security
  policy, with an instruction not to bypass it. No further browser workaround
  was attempted. The offline diagnostic bundler also failed on top-level await
  with IIFE output; it is not a delivered preview or evidence of rendering.
- First Core diagnostic failed because its Node VM lacked `atob`; adding the
  standard global fixed initialization. No MOC/artwork was modified to pass it.
- Initial SDK test fixture lacked effect-ID arrays; the fixture was corrected.
- No current composed screenshots/video, actual Windows Magic Mirror playback,
  Cubism Editor operation, speaker/lip timing or subjective naturalness approval
  was obtained. Prior Windows evidence is historical, not evidence for V11.

## Windows acceptance still required

Use the updated application code and import
`resources/avatar/Raven/v11/runtime/raven-lord.model3.json` as a separate draft.
Keep the entire runtime directory; importing V11 into old application code will
not apply its ownership/loop policy. Preserve unsaved Console edits. Follow the
canonical host and firewall requirements in AGENTS before running Electron.

1. Inspect Dormant for 30 seconds at installation size: eyelid fully covers the
   visible eye, no residual slit, closed rigid beak, stable neck/collar, no sway.
2. Waking and Suspending: complete, hold for 10 seconds, then interrupt at early,
   middle and late times. Check no snap, repeated wake, gaze jump or black seam.
3. Listening/Thinking/Speaking: observe two full loops and transitions. Check
   pauses, full blink closure, feather/neck stability and no perceptible loop seam.
4. Scene: one modest gesture and stable endpoint. Retrigger the same action
   rapidly; old completion must not stop the newer action or restart obsolete work.
5. With actual processed output: inspect quiet/loud speech, onset, silence and
   interruption. No unrelated action may suppress a live utterance's beak.
6. Console: reset → each clip, expression, slider → reset; finite preview holds,
   stop truly stops, and eye/beak sliders inspect the full MOC range directly.
7. Compare original identity and A3/A4/A1/A2 targets in eye/beak/neck close-ups.
   If a lid is a sliding patch, the jaw stretches, or feathers reveal seams,
   reject artistic acceptance and repair the layered master in Cubism Editor.

Do not call this candidate flawless or auto-promote it on numerical evidence.
The repo `mm-live2d-avatar` skill now carries these lessons. The separate
Windows-only personal `magic-mirror-avatar-studio` skill was not accessible and
was not updated.

## Delivery boundary

Implementation is committed locally. Standard Git push failed because this
checkout has no HTTPS credentials. The connected GitHub create-tree request
was then rejected by automatic approval review: it classified uploading these
30 files (source, tests, docs and model assets) to the remote repository as
sharing/publication without explicit approval for that payload/fallback. No
remote tree, branch or draft PR was created by that rejected request. Do not
retry through another upload path without approval. A local Git bundle contains
the reviewable commits and preserves the repository skill changes.

The user subsequently explicitly approved the described upload and draft PR.
The connected GitHub integration may now deliver the same 30-file scope to
`Novalien0424/magic-mirror` on `raven-v11-calm-performance`. This authorization
does not change the outstanding rendered/Windows acceptance gates. The draft
PR is the remote delivery record; the earlier Git bundle remains a checkpoint.

Remote delivery completed after that approval: [draft PR #1](https://github.com/Novalien0424/magic-mirror/pull/1),
branch `raven-v11-calm-performance`, containing the 30-file candidate. The
uploaded candidate tree `282ed050eea94fad189d14f02e566ecddab5e672` matched the
reviewed local tree exactly. This follow-up changes delivery documentation only.
The PR remains unmerged and current Windows visual acceptance is still open.

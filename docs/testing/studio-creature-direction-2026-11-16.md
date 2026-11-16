# Studio animal/mythical-creature direction — 2026-11-16

Status: implemented, checked and deployed at 13:37 Taipei.

## Owner requirement and reason

Owner approved the painterly style after reviewing three actual Drive samples.
The nautilus was a good example; the chair was not an acceptable subject. Default
subjects must be animals, including mythical creatures. Interpret the deeper
meaning of answers creatively rather than depicting literal objects. Operators
must be able to change these instructions through the UI.

## Plan

Add an optional, bounded per-avatar **Concept direction** field. Its versioned
fallback asks for thoughtful interpretation of one meaningful theme/tension,
embodied in animal or mythical-creature form, posture and material. Keep the
approved Art style separate and unchanged. Objects may inspire creature details,
not become the default principal subject. Do not make the nautilus a preset.

The fixed provider instructions own privacy, bounded output and revision behavior;
the editable creative direction owns subject choice. This avoids a hidden animal
rule contradicting an operator's deliberate override. Initial selection, explicit
reimagination, local refinement and Console test pictures receive the effective
saved direction. No hidden chain-of-thought is requested or stored.

Console should expose editing, help, validation and reset near Art style; Inspector
and illustrative preview should reveal the effective direction. Existing saved
configs use the new fallback without publishing unrelated draft work. Verify
schema round trips, actual Main/runtime plumbing, rendered editor persistence and
reset, and live concept behavior for default animal versus custom subject choices.

No changes to the approved painterly style, provider model family, camera policy,
consent, private-memory ownership or unrelated operator settings are planned.

## Live concept and render evidence

Root opt-in probe: `STUDIO_CREATURE_LIVE=1 node node_modules/vitest/vitest.mjs run tests/integration/studio-creature-direction-live.test.ts`.
Four real concept calls passed configured model judgments: three defaults
(chair repair, exploration/belonging, renewal) yielded animal/mythical subjects,
selective symbolic interpretation and no invented diagnosis. An explicit custom
operator chair direction also passed, proving no hidden fixed animal rule defeats
operator choice. One real image from chair-repair answers passed animal/mythical
subject and sophisticated painterly fantasy judgments; decoded alpha present.
This is sampled automated evidence, not a fresh owner style/edge acceptance.

Metadata-only checkpoint:
`.artifacts/studio-creature-2026-11-16/live-2026-11-16T05-33-05-554Z.json`.
No artwork, briefs, answers or credentials persisted by this probe. Prior pale-edge
quality findings remain separate; this change does not claim to fix them.

Active and draft inspected: version24, no conceptDirection field, qualities medium
and low respectively. The new fallback needs no operator config write. Only the
Mirror window was open before QA; no unsaved Console editor was observed.

## Implementation, UI QA and deployment

Changed versioned `studio-concept.v1.json` into fixed provider rules plus editable
`defaultDirection`; optional `StudioSettings.conceptDirection` is bounded to 1,600
characters with control-character/blank rejection. Missing field follows default.
Shared helper resolves it consistently. Main runtime and Console test-generation
pass it to the provider; visit snapshots retain their direction through refinement
and reimagination. Existing painterly Art style was not changed.

Console: Avatars → Interactive Studio → 4 · Picture → Concept direction. Textarea,
help, edited marker, reset, wrapped illustrative preview and Prompt Inspector
show the effective instruction. Operators save/publish and start a new session.
The UI test deliberately authored an object-domain override to demonstrate real
control; the production animal default was not overwritten by that isolated test.

Checks: 92 focused tests passed, Node/web typechecks and diff check passed. Root
review caught missing wrapping on the new preview and fixed it before UI QA.
First rendered run failed at an obsolete “Image prompt line · edited” assertion
from the previous redesign; retained `.artifacts/phase4-qa/2026-11-16T05-35-21-445Z`.
Updated the assertion to the current “Concept context line · edited” wording.
Final canonical `--studio-journey` run: **24 checks passed, exit0**, 19 screenshots,
artifact `.artifacts/phase4-qa/2026-11-16T05-37-05-172Z`. Verified actual rendered
edit, validation, save/publish, reload, reset, Inspector and narrow layout. Root
reviewed the reset screenshot: clear field directly above Art style, readable
wrapping and visible reset. No operator configuration was published by this QA.

Existing Drive-export probe now passes the published conceptDirection; historical
concept-matrix reimagination fixture now asks for a new mythical sea creature,
rather than a tree conflicting with the new animal default. No additional Drive
uploads or artwork retention was performed for this change.

Final build source `cdd626367840b10eefccb8446263372374147a137c9da83a7f1287f7bcc2939e`,
output `84cd1043414c62a4ca71da5dfb72b6bcdd2bed59098add3b85324c57f5dcf05d`, built13:36:55.
Normal app restored13:37:34, renderer ready, music route settled2.317s. QA output
restoration passed, Jabra≈80% and A1≈65% calibrated/unmuted; helper reports one
uncontrolled output as before. No phase promotion or dependency/model changes.

## Owner-requested Astra switch and three comparison exports

Owner explicitly required the final creative call to use latest Astra instead of
Sol, then three new runs uploaded to Drive. Verified 2026-11-16 official model
catalog (`https://developers.openai.com/api/docs/models/gpt-6-astra`) and the
account catalog checked05:15UTC: newest published Astra ID is `gpt-6-astra`.
Changed only `studio-concept.v1.json#modelId` from `gpt-6.1-sol` to that ID.
This governs the final semantic interpretation/creative brief; the actual PNG
renderer remains `gpt-image-2.6-flare`. No invented latest alias or silent fallback.
The approved animal direction, style, low reasoning effort and settings remain.

Affected provider/runtime/IPC/Inspector tests:72/72 passed; build passed.
Normal app stopped/started under lease and renderer ready13:43:13, route settled
2.264s. Source stamp `9386aba8416073d4edc4192241d5a32c666689e95174e052bbf1ac804991c6fa`,
output `c4ab010c0495b72107e8d3d80a191d6011ed10aabc6f0a5e8c55bec927fb4c9c`.
Comparison export test uses an explicit `astra` batch, asserts Astra is configured,
refuses overwrites, and repeats the same three synthetic answer sets. Originals
and authorized synthetic manifest are under `.artifacts/studio-astra-2026-11-16/`.
Actual calls/upload evidence follows after completion.

Completed all3 real Astra concept/image runs: concept13.543/13.455/11.229s,
render41.049/44.674/41.327s, original1254×1254 transparent PNGs. Export test passed
165.46s; Node typecheck passed. No rerolls or image edits. All3 original files
uploaded and folder contents read back in
[Drive](https://drive.google.com/drive/folders/1hbVxZAHuU-rEqIcYzsm-VoSYqM5HRhT9).
No new sharing permission added. This establishes actual Astra provider access,
not a comparative quality score or closure of the previous edge-quality issue.

# Studio art direction: concept first, borderless fantasy illustration

Status: **implemented and deployed; functional QA passed, visual edge acceptance remains open** (2026-11-15). The planning entry
below preserves the original no-change boundary. The owner subsequently approved
implementation and full relevant QA.

## Owner request and reasons

The owner observed that the delivered artwork remained too cartoon-like, said
the white border is unnecessary if the background is transparent, and requested
creative symbolic interpretation rather than incorporating every answer. Their
preferred direction is “2D stylized fantasy illustration, in a sophisticated,
hand-painted animation concept-art style” with a modern, cool feel.

Read-only inspection confirmed:

- Published Raven and its draft still use the prior minimalist flat-vector style,
  excluding gradients and heavy texture. The previous implementation deliberately
  preserved these settings, so its template cleanup did not activate a new medium.
- The default transparent format explicitly requests a white cutting border and
  the painted-name variant refers to that border.
- The fixed soul brief and four saved question image lines instruct the image
  model to translate each answer into a feature. This encourages an illustrated
  inventory, despite the visitor having supplied reflective conversation.
- Published quality is medium; draft quality is low. These unrelated differences
  must not be overwritten when applying the new art direction.
- Prior model-judged tests measured engraving/watercolor compliance and format,
  not this owner's preferred fantasy aesthetic. They do not overrule the owner's
  assessment of actual outputs.

## Proposed design

### 1. Separate creative interpretation from image rendering

Flow: recorded answers → bounded concept selection → coherent visual brief →
image generation → requested revision.

Add a Main-owned concept step before the first image request. It reads only the
current visit's answers and question meanings, not memories, guest lists or raw
conversation history. It chooses a dominant theme (optionally a closely related
second theme) and a recognizable real-world analogue: an animal, plant, object,
material or natural form. It then translates that anchor into one original
fantasy subject. It may omit answers that do not strengthen the concept. An
answer is inspiration, not a mandatory object to draw.

Return a small validated creative brief, such as subject/real-world anchor,
visual interpretation, pose or composition, and mood. This is a product artifact,
not a request to expose the model's private reasoning. Keep it in RAM with the
visit. The image request receives that brief, selected art style and output
constraints, rather than the full list of per-answer visual obligations.

Example with synthetic answers only: wanting both freedom and belonging could
become a migratory bird with a sheltering wing silhouette. It need not also carry
a city, friend, house, clock and bridge to account for every answer. This example
explains the process; it must not become a repeated production mascot preset.

Use a dedicated versioned concept prompt/model role through the existing Main
provider/credential architecture; select a supported configured text model during
implementation rather than silently borrowing memory-extraction instructions or
inventing a model alias. Keep a short deadline and bounded output. Cancellation,
sleep, mode switch and session replacement abort both concept and image work.
On concept failure, report the failure and offer retry/continued conversation;
do not silently revert to the rejected all-answers collage prompt.

Why a separate step: it is observable and testable, and prevents the image model
from treating raw answer lines as a checklist. A single-call “be creative” prompt
is cheaper but leaves that failure mode intact. The extra request adds latency;
measure it separately and keep image rendering on the verified Flare family.

### 2. Change the actual art direction, not just the surrounding template

Proposed Art style text:

> 2D stylized fantasy illustration in a sophisticated, hand-painted animation
> concept-art style. An elegant, expressive silhouette with intentional proportions,
> layered painterly shading, subtle brush texture and selective fine detail.
> A contemporary, cool visual attitude with a restrained palette and deliberate
> accents. Let the concept determine the colours and character; avoid a generic
> cute mascot, chibi proportions or flat vector-icon treatment.

“Cool” means contemporary visual attitude, not a rule that every result must be
blue, icy or emotionally cold. Painterly rendering remains two-dimensional;
do not replace the previous bias with mandatory photorealistic/3D rendering.

Apply the chosen direction to the active avatar's published Art style and the
corresponding draft field only, preserving unrelated draft values. Update the
default for new experiences. Inspect saved/custom prompt overrides and change
only the fields conflicting with this request; preserve unrelated authored text.
Update the current default question mappings so they provide context to concept
selection rather than imposing one depicted feature per answer. Review creature-
only wording so it does not force all concepts into mascots; preserve the name,
interview, consent and ending flow.

### 3. Make transparency independent of sticker styling

Keep square output, the complete subject inside the canvas, usable edge padding,
PNG output and a genuinely transparent background. Remove white cutting borders,
white halos, sticker/keyline outlines, badges and any name-banner wording tied to
the old border. Keep natural painted edges. White highlights *within* the subject
remain allowed; they are not an unwanted white perimeter.

Describe the output as an isolated illustration instead of repeatedly requesting
a die-cut sticker. Preserve backward compatibility of the stored `sticker` enum,
while updating user-facing wording/help to describe the transparent output.
Do not require arbitrary decorative motifs or a scenic background. Format rules
must not prohibit shading, texture or linework chosen by the art direction.

The shared Conversation image skill also contains a white-border instruction.
Audit and remove that default border requirement there so ordinary avatar artwork
does not silently retain the problem. Keep explicit visitor requests for a border
possible; do not add a universal speech/content filter.

### 4. Keep revisions coherent

Retain the selected concept with the visit. A local change modifies that concept
and the prior image rather than reinterpreting all original answers from scratch.
A requested reimagining can run concept selection again. Preserve requested
art style and transparent, borderless output on both paths. Keep existing limits
on the number of revisions and existing consent/session ownership.

The application should not invent a verbal psychological explanation of the
visitor. A reveal may describe visible artwork, not assert inferred personality
or sensitive traits. Reference photos retain their existing explicit consent and
Main ownership; photo likeness is a separate validation boundary.

## Implementation sequence and ownership

1. Record this plan and the previous implementation as the baseline. Capture only
   non-sensitive settings/revisions and source hashes needed for comparison.
2. Implement versioned concept instructions, typed output validation and Main
   lifecycle integration. Add focused tests for selective interpretation,
   cancellation, failure, session isolation and revision reuse.
3. Update Studio/Conversation output defaults, default art style, question-context
   handling and Console preview/help. Preview the actual concept/render pipeline,
   with synthetic examples; label samples rather than pretending they are a live
   visitor's request. Preserve custom styles and unrelated settings.
4. Apply the requested art-direction fields through the scoped configuration path,
   checking saved/unsaved draft state first. Do not publish the entire unrelated
   draft to accomplish an Art style update. Verify the next session sees the new
   published snapshot.
5. Run unit/integration checks and a matched live comparison using synthetic
   answer sets. Retain failed evidence and the precise prompt/model versions.
6. Build from frozen source under the Electron operation lease, run the relevant
   Studio and ordinary image-skill paths, restore normal audio/runtime, and record
   the deployed build stamp. Sound-producing QA remains at 1% with cleanup.

## Acceptance and review

- At least three different synthetic answer sets yield coherent, distinguishable
  concepts; they are not required to depict every answer or use the same creature.
- Include one overstuffed/conflicting answer set to test selective interpretation,
  and one sparse/unanswered set to check that no biography is invented.
- Artwork visibly follows the requested sophisticated painterly fantasy direction.
  Evaluate this separately from transparency and request success.
- Decoded alpha proves a transparent exterior with visible artwork. Visual review
  checks that there is no imposed white border/halo, badge or background panel.
- One local revision preserves the concept and format; one explicit reimagining
  can change the concept. Cancel/exit cannot deliver a late image into a new visit.
- Verify published and draft field changes exactly; preserve the current draft
  quality difference and all unrelated settings.
- Report individual timings for concept and rendering, successes and failures,
  and the distinction between automated judgments and owner visual acceptance.
  A few model-graded samples alone cannot establish that the owner likes the art.

## Audit record required for implementation

Append a dated entry for each actual change with: owner requirement, previous
behavior, design reason, exact prompt/config diff or version, changed files,
test command/result, retained failures, runtime/build stamp and remaining limits.
Distinguish planned, implemented, tested and deployed states. Do not overwrite
earlier failures with a later pass or report a plan as completed work.

Persist no real visitor answers, transcripts, source photos, generated visitor
artwork, private creative briefs or credentials in the audit. Use synthetic
fixtures and metadata. Any owner-facing visual review must respect that boundary;
the audit records the outcome, not an automatic archive of visitor images.

## Execution log

- Planning entry: inspected current source and the selected published/draft art
  fields. Confirmed flat-vector style, mandatory white border and per-answer
  visual mappings. Wrote this plan. **No application code/settings changes, live
  calls, builds, restarts or deployments performed for this revision.**

### 2026-11-15 implementation and settings

- Added Main-only `concept-provider.ts`, `studio-concept.v1.json` and a strict
  four-field brief contract. Reason: answer lists encouraged literal inventories.
  The dedicated `gpt-6.1-sol` role selects one coherent real-world anchor and
  interpretation; render requests receive that brief, not the answer list.
- Integrated concept selection into Studio runtime and Console test pictures.
  Initial/reimagine may read current-visit answers; refine reads only the previous
  concept and requested change. Cancellation/stale-session handling covers both
  stages; failed renders preserve the prior image/concept. Briefs stay in RAM.
- Updated Studio prompt catalog, shared Conversation format, default experience,
  Console help/preview and prompt inspector. Reason: transparency does not require
  white borders, and saved flat-vector instructions contradicted the desired medium.
  Retained the stored `sticker` enum for compatibility. Image model stays on the
  previously verified `gpt-image-2.6-flare`; no invented moving alias.
- Added scoped Main config maintenance with atomic compensation. At 16:14 Taipei,
  Raven active/draft versions 23→24 changed only artStyle, recognized old q1 zh/en
  and four old imageLine fields. Structural comparison verified all unrelated fields
  unchanged, active medium/draft low quality preserved, previous equals old active.
  Evidence: `.artifacts/studio-concept-2026-11-15/settings.json` and opt-in
  `tests/integration/studio-art-settings-maintenance.test.ts` (1/1 pass).
- Focused integrated verification: 249/249 tests across 11 affected files passed;
  build passed. Earlier config fixture failed because its mock voice was invalid;
  corrected the synthetic fixture to the accepted voice, then 57/57 config tests
  passed. Earlier Console assertion expected the retired label; updated it to
  “Concept context line.” Retained logs in the artifact directory.
- Live QA is ongoing; no final aesthetic/deployment acceptance claimed yet.

### Live QA findings and retained failures (16:29 Taipei)

- First real concept/render sample passed all concept and art checks. Its refinement
  failed the automated no-white-border/halo criterion; other style criteria and
  decoded alpha passed. Retained `live-2026-11-15T08-14-39-960Z.json`.
- Overstuffed-answer sample passed all checks. Sparse-answer concept passed, but its
  artwork also failed the border/halo criterion. Retained
  `live-2026-11-15T08-17-04-094Z.json`. These are visual-judge findings, not alpha
  failures. No failed synthetic images or briefs from these runs were archived.
- Reason for correction: “no added border” did not reliably prevent an inherited or
  generated light perimeter. Tighten the positive edge definition (subject colours
  directly meet transparency) and explicitly remove inherited perimeters in edits.
  Re-test all three initial cases, refinement and reimagination, plus distinct
  concepts; do not discard failed evidence or call transparency alone a style pass.
- Both typechecks passed. Additional tool/privacy/prompt-boundary checks: 96/96
  across six files. Integrated checks above plus these total 345 distinct tests.
- Canonical Electron native-camera Studio soul journey: **26/26, exit 0**, artifact
  `.artifacts/phase4-qa/2026-11-15T08-14-58-457Z`. Published version24 style used.
  Synthetic speech, real USB camera and providers; no frames, artwork or screenshots
  retained. Includes interview, reveal, revision, farewell, fresh restart and
  entering Studio from Conversation.
- Canonical Conversation image journey: **15/15, exit 0**, artifact
  `.artifacts/phase4-qa/2026-11-15T08-22-07-368Z`. Synthetic camera fixture and speech,
  real providers; create/chat/edit/dismiss/consent-decline/consent-approve/photo-edit/
  cleanup passed. Reviewed synthetic revision and permission screenshots: image
  displays correctly, controls readable and consent text intact. Its requested
  full-picture fox scene verifies display/flow, not Studio's transparent fantasy style.
- Both runs used source stamp `2eb029b0c5a62ace6cae8411663e3dcec51ab68a6425042da8be8dfbb695abaf`.
  A wording-only follow-up will reuse these unchanged flow passes and get a new
  build plus affected live image checks. At cleanup, output restore=true and helper
  read-back calibrated/unmuted Jabra≈80%, A1≈65%; one output is reported uncontrolled.
  Normal application remains stopped until final build deployment.

### Final build, live matrix and remaining boundary (16:35 Taipei)

- Final edge wording lives in `portrait-studio.v1.json#imagePrompt.sticker.frame`
  and `.revision`: subject colours/brushwork meet transparent pixels, no pale
  perimeter/rim glow, and edits remove inherited borders. This is a prompt change,
  not destructive erosion of painted edges or an automatic provider retry.
- Final prompt checks: 95/95 passed, Node typecheck and diff check passed. Old-text
  assertions initially failed after the deliberate wording change; updated those
  expectations and retained the failed/passing logs. No runtime defect in those failures.
- Final real-provider matrix: `.artifacts/studio-concept-2026-11-15/live-2026-11-15T08-30-01-900Z.json`;
  **exit 1 / strict visual acceptance failed**, all five requests completed.
  All five outputs are 1254×1254 PNGs with decoded transparent and visible pixels.
  All five passed automated painterly-2D, coherent-subject, no-scenery and no-cute-
  mascot-dominance criteria. All concept checks and three-concept diversity passed.
  These model judgments are sampled evidence, not owner aesthetic acceptance.

| Synthetic case | Concept seconds | Render seconds | Clean-edge judgment |
| --- | ---: | ---: | --- |
| movement/belonging | 5.471 | 40.007 | failed |
| local refinement | 2.679 | 39.673 | passed |
| explicit reimagination | 6.657 | 44.668 | failed |
| overstuffed answers | 5.702 | 26.782 | passed |
| sparse answers | 5.265 | 44.518 | failed |

- Root visually inspected the three failed synthetic images in a temporary RAM
  volume. Initial nautilus and reimagined tree have pale matte fringes at portions
  of their natural silhouettes; no broad sticker badge. Sparse crab/shell has a
  wider surrounding glow and tight/cropped framing. This last finding is stricter
  than the automated no-scenery pass; do not use that pass to dismiss the glow.
  Review images were deleted; no visitor artwork or private briefs were archived.
- **Open quality issue:** prompt instructions no longer demand white borders or
  a per-answer collage, but the image provider still produces unwanted pale edges/
  glow in 3/5 final samples. Square/alpha alone does not prove clean isolation or
  full-subject padding. Further quality work must address this without silently
  eroding fine painted detail or misreporting failed images as accepted.
- Final build stamp source
  `887a8ae2f9110c6acb718e38a533a7090614c0eca226e8c488b295493683b6c0`,
  output `eb65ad847c19754e299e5d5693a738ebc2fd3ccddac65aa509414c9854e79971`,
  built 16:30:59. Normal LaunchAgent started under lease at 16:32:36; Main and
  renderer ready, music route settled in 2.236 s. Earlier 26/26 Studio and 15/15
  Conversation flow passes are reused for this wording-only correction.
- Settings remain scoped version24. No runtime models silently substituted,
  credentials exposed, phase advanced or unrelated draft published. Real-person
  likeness and owner aesthetic acceptance remain unverified. Functional delivery
  is complete; strict visual edge acceptance is explicitly **not complete**.

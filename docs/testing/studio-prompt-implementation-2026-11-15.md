# Interactive Studio prompt implementation — 2026-11-15

## Approved outcome and implementation plan

The owner accepted the prompt audit and requested a complete plan followed by
implementation. Sticker format must remain square with transparent background,
padding and a white cutting border. Operator art style controls the image's
medium, texture, internal linework and proportions without a hidden cartoon
default overriding it.

1. Replace default sticker art restrictions with format instructions. Preserve
   the visitor-data guard, reflective soul-creature interpretation, answer order
   and name/lettering behavior. Remove default anti-likeness wording that conflicts
   with an explicitly consented photo reference.
2. Ensure Art style is included even if an existing custom opening template omits
   `{{style}}`, without duplicating it when the template includes it. Keep fallback
   prose versioned. Preserve operator-authored templates and saved settings.
3. Simplify revision wording while retaining the existing redraw-from-meaning
   policy and applying the same chosen style and output format.
4. Replace generic preview answers with reflective examples and clarify the
   published/new-session behavior in operator help. Test preview/runtime builder
   parity and custom-template compatibility.
5. Keep the verified `gpt-image-2.6-flare` family identifier. No verified automatic
   latest-fast alias exists; do not invent one or silently substitute models.
6. Run focused unit/editor tests and typechecks. Run matched old/new prompt
   comparisons using contrasting styles, identical synthetic answers and image
   settings; assess images in RAM through the configured visual judge and retain
   metadata only. Check decoded transparency/square geometry independently and
   exercise a revision. These small samples are not statistical quality claims.
7. With source frozen, stop the normal app under the Electron operation lease,
   build in the canonical checkout, run the native-camera Studio journey with
   synthetic visitor speech at 1% output, restore calibrated output levels, and
   restore the normal application. Preserve failures and operator drafts.

## Acceptance boundaries

- Transparent output has decoded zero-alpha pixels and visible image content;
  a painted checkerboard alone is not a pass. Square geometry is checked rather
  than assuming backend adherence to requested pixel dimensions.
- Style evaluation distinguishes requested-medium evidence from a cartoon mascot
  bias. Failed/unavailable judgments are retained, never treated as passes.
- A live guided Studio run must complete generation, revision and ending; Node
  tests alone do not establish this behavior.
- Real-person photo likeness remains unverified without a consenting person.
  No visitor data, images, credentials or raw judge output enter reports.
- Existing published vector art remains an intentional operator choice; this
  work changes the universal template, not the operator's saved style.

## Starting state

Branch `field/macmini-deploy`. Camera changes have been committed/deployed by the
other session (PROGRESS 11-15 15:29), including the pending 2.6 Flare model setting.
Initial uncommitted work is the prior model audit/config/test/report. No unrelated
source changes were present at clock-in.

## Results

Implemented:

- Final sticker opening reduced from 107 to 91 words, revision from 73 to 44 words.
  These counts describe removal of conflicting art restrictions, not a quality
  score. Square format, white cutting border and transparent exterior remain.
- Default full-picture/sticker frames no longer prohibit identifiable people;
  consented-photo instructions can operate without that contradictory clause.
- Custom frames without `{{style}}` receive `imagePrompt.styleFallback`; frames
  containing the placeholder do not receive a duplicate. Operator edits remain.
- Reflective sample answers now match the default soul questions. Console help
  explains style/format separation, preserved overrides and new-session behavior.
- The visual QA judge accepts bounded PNG input for RAM-only assessment. Existing
  JPEG bounds and metadata-only reporting remain; input/privacy tests cover it.

Checks so far: 89 prompt/runtime/editor/Prompt Inspector tests passed; 7 judge
input/privacy tests passed; full Node/web typechecks and stamped build passed.
The initial focused run caught an old phrase expectation; the final wording
retains “fully transparent background” and all 89 tests passed on the rerun.

The first 66-word frame passed format pixels but failed the visual isolation
criterion: all three revised images contained environmental scenes inside the
border. The final 91-word frame therefore limits isolated motifs and directs
places/experiences into the subject's form, markings or carried objects, explicitly
excluding scenery/background panels inside and outside the border. Texture and
shading remain available to the operator's medium. The 89 tests passed again.

### Retained first visual comparison

Same model, settings, synthetic answers and styles; only the old/new opening
frame differed. The configured visual judge assessed actual PNGs in RAM; no
images or raw judge text were retained.

| Case | Generation/edit time | Requested medium | Cartoon dominates | Square/alpha/border | No background scene |
| --- | ---: | --- | --- | --- | --- |
| Old engraving | 41.071 s | yes | no | pass | yes |
| First revised engraving | 42.239 s | yes | no | pass | **no** |
| Old watercolor | 37.173 s | **no** | **yes** | pass | yes |
| First revised watercolor | 45.786 s | yes | no | pass | **no** |
| First revised watercolor edit | 43.890 s | yes | no | pass | **no** |

All five outputs were 1254×1254 with decoded transparency. Test exit 1 is retained
in `.artifacts/studio-prompt-implementation-2026-11-15/style-live.log`; it was not
relabelled a pass. These are individual model judgments, not statistical proof.
After the final composition correction, all three affected live checks passed:
engraving generation, watercolor generation and watercolor revision. Each passed
square geometry, decoded transparent/visible pixels, requested medium visible,
no dominant cartoon treatment, white border visible and no background scene.
The test exited 0 in 138.42 seconds (138.56 including harness overhead). Passing
Vitest output suppressed individual metadata, so no exact final dimensions or
per-operation times are claimed. Log: `style-live-revised.log` in the same folder.

### Guided application journey

Initial candidate build: **26/26 passed, exit 0**, 395.687 seconds, native camera,
synthetic speech and real image/Realtime services. Includes name correction and
confirmation, four answers, generation/reveal, revision, ending and a fresh visit.
Evidence: `.artifacts/phase4-qa/2026-11-15T07-38-51-899Z/`.
Artwork/transcripts were not retained. This run preceded the final composition
wording correction; the unchanged application-flow pass is reused, while final
wording is checked by the affected real generation/edit tests.

Normal app restored after the journey. Test output was 1%; restoration and
calibrated Jabra/A1 readback passed.

### Final deployment

Final build/stamp verification passed at 15:49 Taipei. Normal app restarted at
15:49:46; Main and Mirror renderer ready, target TV matched, audio route settled
in 2.267 seconds. Both published and draft settings match their pre-task hashes.
Metadata: `.artifacts/studio-prompt-implementation-2026-11-15/final-deployment.json`.
The running build includes the final prompt wording and `gpt-image-2.6-flare`.

No source portraits, artwork, transcripts or raw judge output were retained.
Real-person likeness and repeated-run visual reliability remain unverified.
Existing custom frames may still contain deliberate conflicting art directions;
they were preserved, and help explains how to remove/reset those restrictions.

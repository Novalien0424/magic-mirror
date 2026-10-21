# Interactive Studio audit QA — 2026-10-21

## Scope and starting state

Requested by the owner after the two fixes in `480dfb6`; journey written before
execution. Checkout: `field/macmini-deploy`, HEAD `1860a6c`, initially clean.
Fresh process inspection found no Magic Mirror Electron or QA runner. The normal
app remains stopped; all visits use isolated QA data in the canonical checkout.
No operator draft is published, no phase is advanced.

## User journey and expected results

1. **Operator prepares the studio.** Open the Mirror Console, select Interactive
   Studio while Dormant, and return to Conversation. The mode badge and listening
   phrase follow the switch without waking the mirror. Edit a synthetic studio,
   inspect its prompts, trigger and repair validation, save/check/publish, and
   check the service page and narrow layout. Evidence: rendered Console journey
   (`--studio-journey`) and inspection of its synthetic screenshots.
2. **Operator changes their mind during startup.** Start Studio while its
   configuration check is pending, then exit or select Conversation before it
   finishes. No stale Studio may open. Console/visitor calls get the documented
   cancellation result; a cancelled Studio wake releases the normal greeting.
   Switching Studio → Conversation → Studio admits only the newest start, and a
   later ordinary start still succeeds. Evidence: controlled Main IPC regressions;
   these intentionally control the race and do not claim manual timing coverage.
3. **Visitor corrects their name repeatedly.** Supply an unconfirmed synthetic
   name more than four times, then correct it. The mirror stays in read-back,
   rejects a premature question answer, and reads back the corrected name.
   Confirmation in the correction's own turn must not advance. A later visitor
   confirmation of the same displayed name advances to question 1. Evidence:
   Main runtime plus renderer/Main integration regressions and portrait-layer
   rendering checks. No real name, transcript or audio is retained.
4. **Visitor completes a normal live visit.** With the published Raven rig and
   an isolated copy of the published studio, select Studio, enter through the
   synthetic wake/session route, give and confirm a synthetic name, answer four
   questions, see a sticker, request one change, and see the revised result.
   Open Remote Console during the visit and the Console over the mirror while
   painting; neither should interrupt the session. Finish, hold the picture,
   speak the configured farewell and return to Dormant. In Conversation mode,
   a later visitor request can enter Studio and exit back to conversation.
   Evidence: `portrait_studio` with story `default`, real providers, synthetic
   virtual microphone, actual Raven rendering, metadata and synthetic screenshots.

The live visit is one probabilistic sample. It does not force the repeated-name
edge case or a delayed-start race; those are covered by step 2/3 checks. Physical
wake, human speech, audible quality, printer output and field acceptance remain
unexecuted. The current output is 0% and muted; preserve mute, cap QA output at
1%, never alter input gain, and restore the captured output state in cleanup.

## Planned commands

Run sequentially, never overlapping Electron owners:

```sh
node scripts/qa-build.mjs --verify
node scripts/electron-owner.mjs studio-audit-tests node node_modules/vitest/vitest.mjs run tests/unit/studio-config-ipc.test.ts tests/unit/studio-runtime.test.ts tests/unit/realtime-session-studio.test.ts tests/renderer/mirror/portrait-studio-layer.test.ts
node scripts/run-phase4-qa.mjs --studio-journey
node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario portrait_studio --studio-story default
```

QA commands run under output-volume capture/restore. Preserve failures and allow
at most one retry for an external/flaky action. Inspect case counts and screenshots
before reporting a pass. Results and final runtime state will be recorded below.

## Results

### Build and focused regressions

- Build verification: exit 0, reused the unchanged completed build from
  `2026-10-21T02:53:59.968Z` (10:53 Taipei).
  Source SHA-256 `990877dfb68b215323d914188a7f400453594e36bf84d12551c5d61367c4b2d8`;
  output SHA-256 `dc710e669350a2b8fc3919dd835cfed581aa69fe9e099bfd7d559eb0665a94ec`.
- Focused command above: exit 0, **83/83 tests in four files**, 11:07 Taipei.
  Includes both cancellation regressions, six unconfirmed Main read-backs plus
  correction, and the adapter/Main integration with five unconfirmed visitor
  turns, a same-turn correction, and later confirmation.
  [Test log](../../.artifacts/studio-audit-qa-2026-10-21/focused-tests.log).

### Rendered Console journey

- Command above: exit 0, **14/14 checks**, 12 screenshots, 11:08 Taipei.
  [Evidence](../../.artifacts/phase4-qa/2026-10-21T03-08-07-820Z/evidence.json) ·
  [Build](../../.artifacts/phase4-qa/2026-10-21T03-08-07-820Z/build.json) ·
  [Screenshots](../../.artifacts/phase4-qa/2026-10-21T03-08-07-820Z/screenshots) ·
  [Command log](../../.artifacts/studio-audit-qa-2026-10-21/studio-journey.log).
- Opened all twelve `journey-*.png` captures. Conversation/Studio selection and
  the Studio mode badge are clear; the missing `{{answer}}` error appears beside
  its field; the publication review and confirm/keep-editing buttons are visible;
  service status and the 1024×768 layout are readable without horizontal overflow.
  Initial/mode-transition wake warnings clear to the correct listening phrase
  and “All modules normal” in the later captures.
- Screenshot coverage limit: `journey-06-no-name.png` captures the section top,
  not the disabled name controls; the prompt preview and ending edits are also
  outside their overview captures. These behaviors passed DOM/IPC assertions,
  but the overview images alone do not establish their visual presentation.
- This is Console-only evidence: the Mirror display is not visually verified by
  this mode. Output state was restored exactly to Jabra, 0%, muted; input remained
  57%. [Audio guard record](../../.artifacts/studio-audit-qa-2026-10-21/studio-journey-audio.json).

### Live synthetic visit

First attempt, 11:08–11:13 Taipei: **22/23 checks**, exit **2**, 326 seconds.
The run completed the visit; its only failed check was
`studio_picture_format / raven_qa_studio_picture_format`.

- Initial PNG: 1254×1254, maximum corner alpha 0. Revised PNG: 1254×1254,
  maximum corner alpha **1/255**, failing the strict zero-alpha requirement.
  The production generation/edit requests both specify `background: transparent`
  and PNG. The evidence identifies a near-transparent revised output; it does
  not justify loosening the assertion or altering the image behind the check.
- The intended synthetic name was confirmed after **one correction**. Four
  questions, both reveals, the requested change, one repaint announcement,
  photo hold, exact configured farewell, Dormant, Conversation-requested entry
  and release all passed. 13 classified avatar lines, zero language mismatches;
  38 server-listed items deleted, no provider errors or duplicate deletions.
- Opened all six portrait captures (name, question, painting, reveal, revision,
  keepsake). Raven and the name/question prompts are framed clearly. The initial
  owl/seashore artwork becomes an owl in snowy forest on revision; the name,
  change/finish prompts, photo hint and 30-second timer are legible. Screenshots
  cannot reveal a one-level alpha residue; the pixel metadata caught it.
- The runner identifies portrait display 3 at 1080×1920, but leaves its formal
  `display.verified` flag false. These are actual Mirror-window captures and
  placement checks, not physical TV acceptance.
- Output state restored exactly: Jabra, 0%, muted; input unchanged at 57%.
  `real_audio_route` is the runner's playback integration assertion, not physical
  audibility. Transcripts/audio were not retained.

[First attempt evidence](../../.artifacts/phase4-qa/2026-10-21T03-08-24-946Z/evidence.json) ·
[Detailed metadata](../../.artifacts/phase4-qa/2026-10-21T03-08-24-946Z/raven-results.json) ·
[Raven rig and prompt provenance](../../.artifacts/phase4-qa/2026-10-21T03-08-24-946Z/raven-provenance.json) ·
[Build](../../.artifacts/phase4-qa/2026-10-21T03-08-24-946Z/build.json) ·
[Full metadata log](../../.artifacts/phase4-qa/2026-10-21T03-08-24-946Z/launch.out.log) ·
[Screenshots](../../.artifacts/phase4-qa/2026-10-21T03-08-24-946Z/screenshots) ·
[Audio restoration](../../.artifacts/studio-audit-qa-2026-10-21/studio-live-audio.json).

One unchanged retry, 11:14–11:21 Taipei: **23/23 checks**, exit **0**, 366 seconds.
Both PNGs were 1254×1254 with maximum corner alpha **0**. The intended name again
needed one correction; the configured farewell matched, repaint was announced
once, 38 server-listed items were deleted, and provider errors/duplicate deletions
were zero. The three retry reveal/revision/keepsake captures were opened: the
requested seashore-to-snowy-forest change is visible, the name and instructions
remain readable, and the photo countdown is present. No assertion, prompt,
setting or source was changed.

[Retry evidence](../../.artifacts/phase4-qa/2026-10-21T03-14-56-322Z/evidence.json) ·
[Detailed metadata](../../.artifacts/phase4-qa/2026-10-21T03-14-56-322Z/raven-results.json) ·
[Raven rig and prompt provenance](../../.artifacts/phase4-qa/2026-10-21T03-14-56-322Z/raven-provenance.json) ·
[Build](../../.artifacts/phase4-qa/2026-10-21T03-14-56-322Z/build.json) ·
[Full metadata log](../../.artifacts/phase4-qa/2026-10-21T03-14-56-322Z/launch.out.log) ·
[Screenshots](../../.artifacts/phase4-qa/2026-10-21T03-14-56-322Z/screenshots) ·
[Audio restoration](../../.artifacts/studio-audit-qa-2026-10-21/studio-live-retry-audio.json).

## Outcome and remaining limits

Both repaired contracts pass focused regression checks, the Console journey
passes, and the unchanged live retry passes. Across the two live samples, name
confirmation passed 2/2; complete runs passed 1/2 because one of four images
(a revision) had corner alpha 1. This is a retained intermittent output issue,
not an unconditional clean QA result. Further transparency qualification belongs
with [sticker output follow-up](../../TODO.md); no image processing or relaxed
acceptance threshold was introduced during this QA task.

Checks directly exercise startup ordering/visible cancellation, control-turn
exclusion, cleanup and microphone handoff (invariants 1, 6, 8, 9, 10), without
changing any of the twelve invariants. Physical wake, human-microphone accuracy,
audible delivery, print output and field acceptance remain pending. No full-suite
rerun or phase promotion was needed for this unchanged application build.

Fresh runtime check at **11:21 Taipei**: no canonical Electron processes, no QA
LaunchAgent jobs, normal LaunchAgent `print` exit **113** (unloaded). The normal
app remains stopped. Jabra output is **0%, muted**, input **57%**, alert **100%**,
matching the pre-run snapshot. Each guard captured Jabra before/during/after;
the wrapper uses the default-output route, so the existing device-pinned
restoration follow-up remains open. No normal START/STOP or TV-power command ran.

Changed tracked content is limited to this journey/results document, PROGRESS
and the new transparency follow-up in TODO. The task-local quiet runner and full
test/audio logs remain in the ignored artifact directory.

# Lowest-camera image journeys — 2026-10-21

The owner requests the lowest USB resolution and frame rate for now, followed
by complete journeys in Conversation and Interactive Studio. This supersedes
the earlier full-HD acceptance requirement for this temporary mode.

## Journeys before execution

1. Read the camera's current advertised formats. Select its smallest frame
   and slowest supported rate without upscaling or inventing a frame rate.
2. Exercise native capture and recovery. Record only timing, dimensions,
   frame counts and face counts; discard all images from memory after use.
3. Conversation: start → create an imaginary picture → chat while it paints
   → spoken reveal → revise → dismiss → request a camera portrait → decline
   without either camera tool taking a still → request again → spoken
   explanation → explicit approval → countdown → fresh USB still → portrait
   generation/reveal → revision → dismiss → ordinary conversation → sleep.
4. Studio: start → name correction/confirmation → request photo use → decline
   → new request/approval/countdown → fresh USB still → four questions →
   painting/reveal → revision → keepsake → exact farewell → sleep →
   Conversation-requested Studio entry → disconnect/release.

Use the actual existing voice and image services with scripted visitor audio
and the physical USB camera. The owner subsequently confirmed nobody was
available and explicitly authorized an Internet portrait after successful
native capture. Six native stills and a separate frame-rate sample were obtained.
The first two journey attempts kept the native camera active; after failures,
the final journeys use the public portrait directly, with native capture
verified separately as the owner requested. The substitute is explicit in
provenance; it is never a production fallback.
Native camera images and transcripts are not retained. Public-fixture-derived
screenshots may be retained for visual QA. This does not establish human
microphone accuracy, physical audibility or a real guest's likeness.

## Fresh format inspection

The device currently advertises **96×96 YUY2 at 5 fps** as its minimum, smaller
than the earlier 320×240 diagnostic mode. The read-only AVFoundation query
found one matching device. Numeric evidence is in
[formats.json](../../.artifacts/low-camera-journey-2026-10-21/formats.json).

Production capture now selects the smallest advertised frame and its slowest
advertised rate. The shared portrait handler accepts a decoded frame at its
real dimensions (minimum 96×96), retaining the one-face and consent guards.
The runner's explicit `--native-camera` route uses the production camera owner
with synthetic visitor speech and disables photo/derived-image screenshots
unless the owner explicitly selects the public-portrait fixture.

The downloaded reference is NASA's
[official portrait S92-40463](https://images-assets.nasa.gov/image/S92-40463/S92-40463~orig.jpg),
with [public-domain provenance](https://commons.wikimedia.org/wiki/File:Mae_Carol_Jemison.jpg).
The fixture preparation crops around the detected face, resizes to the actual
96×96 camera dimensions, and independently detects exactly one face at that
size. The source is a published test image, not a visitor or an identity match.

## Results

- Native capture at minimum settings returned **six 96×96 snapshots**. All
  had zero faces (no subject present). The stability/recovery test failed:
  two automatic USB resets and a 9.789-second receipt gap. This establishes
  working still delivery, not reliability.
  [Native result](../../.artifacts/phase4-qa/2026-10-21T06-37-40-368Z/camera-native.json).
- Separate rate measurement verified input/output 96×96 and **0.2-second
  configured duration (5 fps)**. It delivered 72 advancing frames, about
  **2.18 fps**, with no resets/restarts and a 2.24-second maximum source gap.
  The strict cadence screen failed; it is not relabeled as a stability pass.
  [Rate result](../../.artifacts/phase4-qa/2026-10-21T06-39-21-718Z/camera-availability.json).
- Image consent/runtime tests: **26/26**. Camera and runner checks: **173/173**.
  Typecheck and native/production build passed.
- After the permission repair, the complete suite passed **2707 tests, 2 skipped**
  across 213 passing files (exit 0). The final public-tool metadata rename then
  passed **162 adapter/catalog/probe tests**, followed by a successful rebuild.
  [Full suite](../../.artifacts/low-camera-journey-2026-10-21/full-regression.log) ·
  [Focused checks](../../.artifacts/low-camera-journey-2026-10-21/tool-rename-checks.log).
- Final Conversation completed **14/14 checks, exit 0**, in 398.5 seconds:
  [results](../../.artifacts/phase4-qa/2026-10-21T07-21-36-799Z/raven-results.json).
  Refusal caused no capture; the next approved request supplied one 96×96,
  single-face public portrait after countdown. Four pictures were displayed
  and presented aloud, with four image attachments removed afterward. Chat
  during painting, both revisions, both dismissals, return to ordinary chat,
  sleep and microphone release passed, with no provider errors.
  Visually inspected the first picture, permission panel, portrait and edited
  portrait: full artwork fits, disclosure/controls are readable, and the
  requested blue hat appears while the original scene remains.
  [Portrait](../../.artifacts/phase4-qa/2026-10-21T07-21-36-799Z/screenshots/image-photo-reveal.png) ·
  [Revision](../../.artifacts/phase4-qa/2026-10-21T07-21-36-799Z/screenshots/image-photo-revision.png).
- Ordinary camera questions passed **5/5 checks, exit 0**, in 64.8 seconds:
  [results](../../.artifacts/phase4-qa/2026-10-21T07-35-06-497Z/raven-results.json).
  The live model asked permission, waited for approval, received the synthetic
  camera image and correctly described the blue square on the left and yellow
  circle on the right. All four visual-answer judgments passed, with no provider
  errors. This verifies the camera-answer repair without claiming native optics.
- Final Studio completed **24/24 checks, exit 0**, in 398.3 seconds:
  [results](../../.artifacts/phase4-qa/2026-10-21T07-36-24-302Z/raven-results.json).
  Name correction, refusal, new approval/countdown, photo attachment, all four
  questions, painting, reveal, revision, keepsake, exact farewell, Dormant,
  Conversation-requested entry and microphone release passed. Both reveals
  used image attachments; no provider errors or language mismatches occurred.
  Both output PNGs measured 1254×1254 with corner alpha 0 in this sample.
  Inspected the reveal and revision/keepsake screens: the portrait remains in
  the Studio frame, the requested snowy forest replaces the sea, and the name,
  controls and keepsake countdown are readable.
  [Studio reveal](../../.artifacts/phase4-qa/2026-10-21T07-36-24-302Z/screenshots/studio-reveal.png) ·
  [Studio revision/keepsake](../../.artifacts/phase4-qa/2026-10-21T07-36-24-302Z/screenshots/studio-revision-1.png).

### Retained initial journey failures

- [06:44:47Z](../../.artifacts/phase4-qa/2026-10-21T06-44-47-559Z/evidence.json):
  **10/11, exit 2**. Drawing, conversation during painting, grounded reveal,
  revision, dismissal and photo refusal passed. The repeated photo request
  omitted the image tool. No requested still or public-portrait substitution
  occurred. The native camera exhausted its recovery budget during the visit.
- One unchanged retry,
  [06:49:23Z](../../.artifacts/phase4-qa/2026-10-21T06-49-23-914Z/evidence.json):
  **4/5, exit 2**. The virtual visitor audio failed to finish at the first
  drawing request (`raven_qa_speech_interrupted`), coinciding with a camera USB
  reset. The model did call `create_image`; this is a distinct harness failure.
- A silent AudioContext sink was investigated using
  [Chrome's documented contract](https://developer.chrome.com/blog/audiocontext-setsinkid).
  Its full journey at
  [06:55:43Z](../../.artifacts/phase4-qa/2026-10-21T06-55-43-044Z/evidence.json)
  failed at initial speech playback (**3/5, exit 2**, including missing ASR).
  That change was reverted. A separate native Electron clock probe then
  completed a short buffer on all three routes (default, silent, silent with
  connected destination). The longer interruption's cause remains unproven;
  do not attribute it definitively to USB reset or the sink API.
  The clock probe's first launch had an incorrect Electron import, was stopped,
  and was corrected; both logs and restored-audio records are retained.
- The final harness retains the original audio route and adds numeric playback
  timing, clock-state and ended-event evidence. Missing image-tool failures
  retain stage/tool-name counts and exact-ASR booleans, never transcript text.
  The updated probe tests pass **16/16**. The source clock experiment's 17-test
  pass does not qualify the abandoned silent-sink change.

### Permission bug found in the live journey

The next run, [07:01:02Z](../../.artifacts/phase4-qa/2026-10-21T07-01-02-007Z/evidence.json),
passed 9/10 checks but failed photo refusal: the model called the ordinary
camera-looking tool before the image permission flow. Only the authorized
public fixture was involved. All six visitor audio clips completed, and no
provider error occurred, so this failure was an application authorization gap.

Main now requires a single-use camera permit after completed disclosure,
whole-final approval and countdown. The permit expires after 15 seconds and
cannot survive a session change or cancellation. The visual-question tool is
named `look_at_surroundings` to distinguish it from image creation; both still
follow the versioned native-tool catalog and validated application handlers.
Changing the model's tool choice alone would not have closed this gap.

The first focused run exposed five outdated adapter test setups (missing a
committed visitor turn and explicit session generation); the first typecheck
caught a QA helper outside its scope. Both failures are retained. Corrected
camera permission, runtime, adapter, catalog and IPC checks pass **267/267**.

The first public-portrait Studio run,
[07:28:34Z](../../.artifacts/phase4-qa/2026-10-21T07-28-34-385Z/raven-results.json),
passed 9/10 checks (exit 2). Name correction, refusal, fresh approval, countdown
and attachment passed. The first question was transcribed exactly, but the
model replied without calling `studio_answer`. All visitor audio ended normally
and the provider reported no errors. The application's former generic
"ended or cancelled" receipt did not distinguish successful Studio attachment;
Main now sends a validated `photo_attached` outcome with versioned guidance to
resume the current Studio question. This addresses a plausible context cause;
one retry cannot establish a long-run tool-selection rate.

Final review also found that ordinary camera replies needed application-owned
response metadata: the approval turn is a control turn, so an unmarked answer
would be suppressed. The approved image now requests a marked visual answer
after ongoing speech ends. Focused checks include suppression, stale capture,
Studio completion receipt and Main authorization: **268/268**, plus typecheck
and rebuild. The unaffected complete Conversation pass above is retained.

## Reproduction

Run sequentially from the canonical checkout with normal Electron stopped.
The wrapper preserves output mute, tests at output 1%, and restores the exact
sampled output/input/device state on success or failure. It never changes input
gain. These journeys use real Realtime and image services with virtual visitor
audio and the explicitly authorized public portrait; native USB delivery is
the separate evidence above.

```sh
python3 .artifacts/low-camera-journey-2026-10-21/quiet-run.py conversation-permission-final \
  node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario image_skill \
  --portrait-fixture .artifacts/low-camera-journey-2026-10-21/portrait-fixture.json
python3 .artifacts/low-camera-journey-2026-10-21/quiet-run.py studio-public-resume \
  node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario portrait_studio \
  --studio-story default --studio-photo \
  --portrait-fixture .artifacts/low-camera-journey-2026-10-21/portrait-fixture.json
```

## Final handoff

The final source passed **268 focused behavioral checks**, typecheck and build
after the camera-answer and Studio attachment receipt repairs. The earlier
full-suite pass and unchanged Conversation journey are reused; the repaired
ordinary-camera and Studio paths were then exercised live. The final source
diff and document links were checked. No dependencies, runtime model IDs,
credential sources or operator config were changed; no commit, push or phase
promotion occurred.

At **15:43 Taipei**, no Electron, native camera helper or QA LaunchAgent remained.
The normal LaunchAgent was still unloaded (print exit 113), matching the initial
runtime. All **13** guarded runs/probes restored the sampled Jabra output to
**0%, muted**, with input **57%**. Existing background services were left alone.
[Runtime snapshot](../../.artifacts/low-camera-journey-2026-10-21/runtime-final.json).

The authorized simulated user journeys are complete. Remaining limits are
intermittent physical USB delivery, real microphone/audibility and real guest
likeness. Those are not established by a downloaded portrait or virtual audio.

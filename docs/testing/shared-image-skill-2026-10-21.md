# Shared avatar image skill — implementation and journeys, 2026-10-21

Owner-approved scope: add drawing/editing/display to Conversation using the same
image service as Interactive Studio; allow a fresh USB-camera portrait only on
the guest's explicit request and a subsequent scoped confirmation. Preserve the
working Studio story, name confirmation, revisions and ending. No phase promotion.

Later owner directives and fresh evidence are in the
[lowest-camera follow-up](low-camera-image-journeys-2026-10-21.md): 96×96 at 5 fps,
successful native still delivery, authorized public-portrait simulation, and
the ordinary-camera permission repair. The full-HD requirement and zero-frame
runtime result below describe the earlier run, not the current handoff.

## Architecture and implementation order

1. Follow the native avatar tool catalog, shared validation, explicit renderer
   handlers and Main-owned effects described in
   [the foundational tool contract](realtime-tool-architecture-2026-09-17.md).
2. Share the existing Studio provider, sign-in and configured image model.
   Keep Studio's guided runtime separate from Conversation's image workspace.
3. Add typed image requests/events, bounded RAM storage, cancellation and
   session ownership. Add prompt-inspector coverage and visible progress/results.
4. Add application-owned photo consent, actual-playback ordering, a countdown,
   fresh full-HD capture and per-request permission. Studio may attach an approved
   photo before its first painting; ordinary camera-looking never authorizes art.
5. Verify controlled failures and existing Studio regressions, typecheck/build,
   then run complete real-provider journeys in both modes. Separately exercise
   the physical USB route; a synthetic-camera pass cannot qualify the hardware.

## Journeys written before implementation/QA

### Conversation

Wake in Conversation → request an imaginary full picture → continue talking
while it paints → see the picture and hear its grounded presentation → request
one change → see the changed picture → dismiss → request a photo-based picture
→ hear capture/cloud-use explanation → decline (no capture/upload) → request it
again → explicitly confirm after the question finishes → countdown/fresh capture
→ photo-based picture/revision → dismiss → ordinary conversation → sleep/release.
Also check that a generic drawing request never enters the guided Studio.

### Interactive Studio

Wake in Studio → normal opening/name read-back/correction/confirmation → existing
questions → painting → reveal → revision → handover/photo hold → exact Studio
farewell → Dormant/release. Run this unchanged path first. A separate portrait
visit requests photo use before painting, declines once, requests/approves again,
then completes the same questions, image, revision and ending using the photo.
Conversation-requested guided entry must still return to Conversation.

### Failure/privacy/cancellation boundaries

No capture from a general drawing request, a hypothetical/negated mention, a
model-supplied confirmation flag, silence, or an answer before consent playback.
Permission expires and cannot cross sessions, guest/profile changes, mode/scene
replacement, cancellation or another photo request. Cancel during sign-in,
countdown, capture, generation and revision; late results must never reappear.
Reject duplicate jobs and malformed/stale IPC. Camera absence/corruption/size
failure and provider failures are visible and conversation remains usable.
Image/consent turns skip learning; ordinary conversation keeps its existing policy.
No photographs, instructions, private context or credentials in diagnostics/files.

## Evidence boundary

The journeys above were written before implementation. Live QA uses the actual
configured Realtime and image providers with synthetic
visitor speech. Human microphone/physical audibility and photo likeness need
their own evidence. The existing camera qualification blocker remains in
[PROGRESS](../../PROGRESS.md). Preserve original failing artifacts.

The 2026-10-21 sticker alpha=1/255 sample came from returned provider bytes:
production requests transparent PNG and does not re-encode the displayed image.
No app-side cause was found. Per the owner, provider transparency variability is
not a blocker for this implementation; format/integration defects remain actionable.

## Implemented design

The versioned native tools `create_image`, `edit_image`, `dismiss_image` and
`studio_use_photo` use shared validation, explicit Realtime handlers, typed
preload/IPC and Main-owned execution. Prompt Inspector exposes their instructions.
Conversation and Studio share the existing `PortraitImageProvider` and sign-in;
Studio keeps its guided runtime, operator story, name and question flow.

The Conversation workspace shows progress and a full picture, accepts revisions,
and permits conversation during generation. A prepared copy of the current
picture grounds Raven's spoken reveal and is removed from Realtime context after
the response. Generated images and source photos have no local archive.

Photo permission is armed only after the spoken disclosure's actual playback
finishes. A subsequent whole final approval, for that request alone, starts a
three-second countdown. Main accepts only a decoded 1920×1080 frame with one
detected face. Studio consumes that photo for its first image edit request and
then releases it; revisions use the resulting artwork. Failed camera capture
does not advance or close the Studio visit. These guards do not establish that
the existing camera transport supplies an intact face reliably.

Session/profile changes, mode/scene/media replacement, sleep and dismissal
cancel pending work. Late configuration, capture and provider completions cannot
restore a closed picture. A failed revision leaves the previous picture visible.
Source photos are not supplied by face recognition or the ordinary camera tool.

## Automated verification

Logs are under [the isolated evidence folder](../../.artifacts/shared-image-skill-2026-10-21/).
No dependency or runtime model selection changed.

- Latest full `npm test`: exit 0, **2700 passed, 2 skipped**, 213 passing files,
  after the live playback/language fixes (13:33–13:35 Taipei). The earlier full
  pass was 2688 tests. Existing MaxListeners warning was nonfatal. The later
  completion-notice, language-priority and camera-routing refinements were
  checked with focused tests rather than another full-suite run.
- Focused tests cover session/startup cancellation, duplicate work,
  explicit consent and playback ordering, photo attachment, image revision,
  memory exclusion and late reveal preparation. Completion-notice/privacy tests
  passed **175/175**, language tests **76/76**, and the final affected
  adapter/tool/inspector selection **195/195**. Earlier IPC portrait
  quality/authorization checks passed **9/9**.
- Final Node/web typecheck and production build (including the Swift helper)
  pass (`typecheck-camera-boundary.log`, `build-camera-boundary.log`).
  Build stamps and final live-run provenance identify the executed revisions.
- Rendered Studio Console journey: **14/14**, exit 0, twelve screenshots at
  [05:11:11Z](../../.artifacts/phase4-qa/2026-10-21T05-11-11-316Z/evidence.json).
  Service and narrow editor captures were inspected: sign-in, controls and
  layout were legible. The later service-description edit only clarifies
  that both modes share the service.

The first focused run's five failures and the first adapter run's asynchronous
assertion failure are retained in `first-focused-tests.log` and `adapter-tests.log`.
They were repaired before the passing runs; no failed evidence was overwritten.

## Live journeys

Each command uses `python3 .artifacts/shared-image-skill-2026-10-21/quiet-run.py
<label>` before the runner. The wrapper captures volume/mute, uses 1% output
while preserving mute and input gain, and restores in `finally`. These runs use
synthetic visitor audio through real WebRTC/ASR, tools, Main IPC, configured image
service and playback. They do not establish physical audibility or human speech
acceptance. No synthetic transcript is saved.

### Existing Interactive Studio

Command: `node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario
portrait_studio --studio-story default`.

- First attempt: **6/7 checks, exit 2** at
  [05:12:24Z](../../.artifacts/phase4-qa/2026-10-21T05-12-24-167Z/evidence.json).
  The name step advanced after one correction with the displayed name still
  different from the intended name (`raven_qa_studio_name_not_as_intended`).
  This is a retained live dialogue failure, not a passed name test.
- One unchanged retry: **23/23, exit 0**, 338 seconds, at
  [05:15:44Z](../../.artifacts/phase4-qa/2026-10-21T05-15-44-966Z/evidence.json).
  Name correction/confirmation, four answers, first picture, revision, handover,
  exact farewell, Dormant, Conversation-requested guided entry and release all
  passed. Two grounded reveals; no provider errors or repeated item deletions;
  both square PNGs had corner alpha 0. Name success across these two attempts is
  **1/2**, so this is not a claim of reliable name recognition.
- Inspected the reveal and keepsake screens: corrected name, complete artwork,
  requested snowy-background revision, countdown and handover prompt were legible
  and contained within the portrait display. The source artwork was not saved.

The retry ran the application implementation before the subsequent QA-only reveal
instrumentation, clarified default guided-entry example, and shared-service copy.
Those final changes are covered by the following final-build journeys.

### Conversation failures found and repaired during live QA

Command: `node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario
image_skill`.

- [05:22:01Z](../../.artifacts/phase4-qa/2026-10-21T05-22-01-064Z/evidence.json):
  **6/7, exit 2**. The first picture appeared, but the dedicated spoken reveal
  did not start. The original chat step waited too long and did not prove
  overlap with painting; that evidence gap was corrected in the harness.
- [05:26:43Z](../../.artifacts/phase4-qa/2026-10-21T05-26-43-910Z/evidence.json):
  **11/12, exit 2**. The diagnostic run proved chat during painting, two normal
  pictures, dismissal, declining photo use without capture, then approval and
  one photo-based picture. The fourth picture (photo revision) appeared but
  its reveal was stuck: four ready events, only three reveal requests, three
  grounded image attachments and three deletions. All three requested reveals
  had spoken transcripts and playback; there were no provider errors.
- Root cause reproduced locally: a preamble and follow-up can share one WebRTC
  output buffer. Receiving the final reply's playback-stop event left the older
  completed reply marked as playing, indefinitely blocking queued image speech.
  The adapter now retires completed earlier replies when that buffer drains,
  while keeping newer/still-generating replies protected. The regression failed
  before the fix ([retained red test](../../.artifacts/shared-image-skill-2026-10-21/joined-playback-red.log));
  the affected adapter, Studio and playback selection then passed **172/172**.
- Initial drawing language also relied on a sentence hint that did not recognize
  “create/draw” imperatives. The image tools now carry the guest's language explicitly,
  like Studio tools, so the permission panel and reveal use the requested language.
  The affected tool/adapter/inspector selection passed **78/78**.

The permission and synthetic-photo result captures were inspected: readable
capture/cloud disclosure, visible Cancel/Dismiss controls, complete artwork, and
the synthetic smiley reference preserved in the generated character. No human
portrait or real-camera success is claimed by these screenshots.

The repaired-build run at
[05:35:16Z](../../.artifacts/phase4-qa/2026-10-21T05-35-16-181Z/evidence.json)
passed both normal pictures and spoken reveals with all temporary image items
deleted, plus the declined-photo check. It stopped at the next photo request:
the live model omitted `create_image` (**10/11, exit 2**). No photo was captured
on that request. The model/tool-routing miss is retained separately from the
repaired playback defect; one unchanged retry follows.

That retry at [05:40:32Z](../../.artifacts/phase4-qa/2026-10-21T05-40-32-614Z/evidence.json)
also stopped at the repeated photo request (**10/11, exit 2**). Code review found
that cancellation speech is out-of-band, while the earlier permission-pending
tool output remained in the model's conversation. The adapter now sends a short
versioned application system notice when an image request closes, replacing the
stale pending state; it removes the notice when another image event supersedes it.
This creates no visitor turn and grants no capture permission. A focused test
checks both facts and removal of the notice. Typecheck/build and affected
adapter/privacy tests pass; the final live journeys below use this additional fix.

### Final Interactive Studio with photo input

Command: `node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario
portrait_studio --studio-story default --studio-photo`.

**24/24, exit 0**, 404 seconds, at
[05:49:11Z](../../.artifacts/phase4-qa/2026-10-21T05-49-11-267Z/evidence.json).
The same published Studio completed name correction/confirmation, declined a
photo without capture, accepted a new request and later explicit approval,
captured once after the countdown, and continued at question 1 of 4. All questions,
photo-based painting, grounded reveal, revision, handover, exact farewell,
Dormant, Conversation-requested guided entry and release passed.

The camera source was a synthetic 1920×1080 smiley fixture; the voice and image
providers were real. Two image attachments served two reveals; no provider
errors, repeated deletions or synthetic visitor-text injections. Both outputs
were square PNGs with corner alpha 0. All 19 classified spoken lines matched
Chinese. Name steps across the three Studio attempts in this task passed **2/3**.
The attached-photo/question, reveal and revised keepsake screens were inspected:
existing framing, nameplate, snowy-background revision and countdown were intact.

The completion-notice change passed **175/175** affected adapter/privacy
tests plus node/web typecheck and build (`image-state-final-tests.log`,
`typecheck-state-fix.log`, `build-state-fix.log`). The full 2700-test pass preceded
that bounded notice change and the later refinements documented below.

The subsequent Conversation attempt at
[05:56:34Z](../../.artifacts/phase4-qa/2026-10-21T05-56-34-207Z/evidence.json)
stopped at the initial language-display assertion (**4/5, exit 2**), before any
image completed. The harness had checked the DOM immediately after the IPC view
event; it now waits for the painting panel to render and records tool/display
language metadata. The app also gives a clearly classified completed visitor
sentence priority over the tool's guessed language. The affected selection
passes **76/76**, node/web typecheck passes, and `build-language-final.log`
records the rebuild. This small language refinement follows the 24/24 Studio run.

The first rebuilt attempt at
[06:00:23Z](../../.artifacts/phase4-qa/2026-10-21T06-00-23-226Z/evidence.json)
failed before greeting (**3/4, exit 2**, zero Realtime tokens):
`start_connect_network_failed`. The application recovered via its normal probe
to Dormant five seconds later; it did not silently resume the visit. One
unchanged retry was then started. This attempt exercised no image behavior.

### Camera-tool routing gap found by the stronger audit

The retry at [06:02:57Z](../../.artifacts/phase4-qa/2026-10-21T06-02-57-131Z/evidence.json)
again stopped at the repeated photo request (**10/11, exit 2**). The completion
notice alone did not resolve it. A direct audit of bounded tool/camera metadata
showed `capture_camera` being used as an artwork preflight instead of calling
`create_image(source=photo)` directly. It captured the synthetic test frame
before permission in the first request and again after cancellation. The earlier
05:35 run also used the ordinary camera before its first photo-art permission.
The original decline assertion counted only the image-engine capture, so those
old passes do **not** establish zero capture across both camera paths. Earlier
user-facing wording that no photo was taken was corrected when this was found.

The versioned tool catalog now explicitly separates visual questions from
photo-based artwork and forbids ordinary-camera preflight for artwork. The
adapter also blocks the ordinary camera while an image-photo permission step
owns the request (including late results). The live decline/approval checks now
reject ordinary-camera capture as well as image-engine capture before approval.
No regex intent router or model confirmation boolean was introduced.
The affected adapter/tool/inspector selection passed **195/195**, followed by
typecheck and the stamped `build-camera-boundary.log` build.

### Final Conversation — complete journey passed

Command: `node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario
image_skill`.

**14/14, exit 0**, 392 seconds, at
[06:11:52Z](../../.artifacts/phase4-qa/2026-10-21T06-11-52-815Z/evidence.json).
English drawing request → chat while painting → grounded spoken reveal → edit
→ dismissal → fresh-photo request → refusal with **neither camera route used**
→ new request → disclosure → later exact approval → countdown → one fresh
synthetic photo → generated picture → photo-art revision → dismissal → ordinary
conversation → sleep and microphone release. No guided Studio entry occurred.

All four ready images had a dedicated reveal request, an image attachment,
spoken transcript, playback and deletion of the temporary image item. Tool and
display language were English. No provider errors, repeated deletions or injected
visitor text. The previous stuck-reveal and wrong-camera routes did not occur.
The approved capture followed permission by 3.047 seconds; no other capture
was recorded. The final photo revision screen was inspected: blue wizard hat,
consistent subject/setting, complete picture and visible dismiss control.

This is one successful complete sample after the retained failures and fixes,
not a statistical claim that live model routing never fails. Studio's 24/24 pass
preceded the final Conversation language/camera-routing refinements; its guided
flow and provider were preserved, with the affected shared boundaries checked
by the subsequent focused tests.

## Physical USB check and remaining acceptance

Command: `node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario
camera_native` (same quiet wrapper). **Exit 2**, at
[06:19:53Z](../../.artifacts/phase4-qa/2026-10-21T06-19-53-747Z/camera-native.json).
Camera permission was granted, but the native helper received **zero frames and
zero snapshots**. Its two automatic USB resets completed, but delivery did not
recover; it reported `camera_frames_missing` and
`camera_usb_recovery_exhausted`. No camera image was saved or transmitted.
No additional unchanged hardware run was made: this reproduces the existing
transport blocker and needs new hardware/vendor evidence.

The real image/voice service journeys establish the software integration with a
synthetic camera reference. They do not establish usable physical guest portraits,
likeness, human microphone accuracy, physical wake or audibility, printing, or
long-running camera reliability. The native test was a bounded physical capture
attempt, not a full hardware acceptance pass. All failed artifacts remain linked
above; no phase status changed.

The normal app stayed stopped. Every sound-producing run restored the captured
default output (Jabra Speak2 75, 0%, muted); input remained 57%. This is sampled
default-device restoration, not device-pinned restoration across a possible route
switch. The final process/audio snapshot is
[runtime-final.json](../../.artifacts/shared-image-skill-2026-10-21/runtime-final.json).

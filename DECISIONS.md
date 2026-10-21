# Magic Mirror — Durable rulings

## 2026-10-21 — Selectable common image skill per Avatar (owner directive)

- Avatars → Skills owns each Avatar's `skills.imageGeneration` assignment.
  Existing/missing assignments stay enabled for compatibility; disabling one
  Avatar never changes another or erases saved Interactive Studio content.
- The versioned tool catalog declares `requiredSkill`. Native definitions,
  instructions and the Prompt Inspector share the same assignment filter.
  Main independently authorizes effects; hiding a tool is not authorization.
- Save/Publish applies the assignment on the next conversation. Main and the
  renderer use the same immutable session assignment, retained through a
  connection rollover. Unknown session assignments deny image effects.
- Conversation and guided Interactive Studio receive one independent,
  Main-owned image service. The existing provider/model/sign-in path stays;
  the Studio workflow no longer owns the common service. Studio needs the image
  skill; ordinary conversation and separately consented camera questions do not.
- Guest photo permission remains explicit, per request and separate from the
  operator's skill assignment. Camera minimums and field-evidence limits remain.
  [Design and fresh acceptance](docs/testing/avatar-image-skill-selection-2026-10-21.md).

## 2026-10-21 — Temporary lowest-bandwidth USB camera (owner directive)

- For now, use the camera's smallest advertised resolution and slowest
  supported frame rate. Fresh AVFoundation inspection reports 96×96 at 5 fps.
- This temporarily supersedes the full-HD-only portrait requirement. Preserve
  actual captured dimensions, decoded-image validation, single-face validation
  and explicit per-request capture/cloud permission; never upscale to claim HD.
- Complete Conversation and Interactive Studio journeys with the actual USB
  capture route. Camera-fixture passes remain separate evidence.
- As nobody is available, the owner explicitly permits a downloaded Internet
  portrait to simulate the guest after successful USB-frame delivery. Keep
  that substitution explicit in QA provenance and isolated from production.

## 2026-10-21 — Close ordinary-camera permission bypass

- Live portrait refusal QA exposed a second route: the model could call the
  ordinary camera-looking tool before image permission. Main now requires a
  single-use, session-bound permission for that route too, granted only after
  application disclosure, whole-final approval and the three-second countdown.
  It expires after 15 seconds and is revoked on session change or cancellation.
- The native visual-question tool is named `look_at_surroundings`; its handler
  remains `capture_camera`. It sends an approved image to the conversation
  service, while `create_image` sends an approved portrait to the image service.
  Neither route can reuse the other's permission. Local gaze tracking and the
  Console's metadata-only camera check retain their existing ownership.

## 2026-10-21 — Shared avatar image skill (owner directive)

- Conversation can create, present and edit images without entering the guided
  Interactive Studio. Both use the existing Studio image service, versioned
  image model and Main-owned ChatGPT sign-in. This extends that image-only
  credential route to both entry points; no other capability uses it.
- Follow the foundational native avatar tool catalog and validated application
  handlers. The existing Studio name/questions/revisions/ending remain intact.
  Explicit guided-experience requests enter Studio; ordinary drawing stays in
  Conversation. Portrait input may join Studio before its first painting.
- A fresh guest portrait requires an explicit guest request and application-owned
  disclosure/confirmation before capture and cloud use. Permission is single-use,
  scoped to the current request/session, and ends on cancellation or replacement.
  A later whole final reply 「使用我的照片」 / “use my photo” (versioned approved
  variants, case/spacing normalization and shared command folds) grants it only
  after disclosure playback; no model boolean or substring authorizes a photo.
- Source portraits/artwork stay in RAM; no identity inference, private-memory
  injection, image/transcript diagnostics or automatic archive. Image and consent
  controls skip learning. Existing camera gaze/looking permission is separate.
- Retain the observed sticker corner alpha metadata. Provider transparency
  variation alone is not an application release blocker; fix an app-caused
  request/format/rendering defect if found. Do not reclassify historical QA.

## 2026-10-20 — Sticker pictures and visible prompts (owner directive, afternoon)

- **Picture type, sticker by default.** The Console sets Picture type per
  studio: Sticker (square transparent PNG, one symbolic emblem in bold flat
  vector with a thick white die-cut border, for a colour sticker printer and
  cutting around the shape) or Full picture (the tall opaque scene). A saved
  studio without the field is a sticker. Image instruction defaults follow the
  type; operator edits stay. Sticker wording follows the OpenAI image prompting
  guide (isolated subject on a fully transparent background, flat design, no
  gradients, simplicity) and sticker printers' border advice.
- **Name font.** A painted name is lettered in the Console's Name font
  (versioned default "bold rounded sans-serif letters"); the nameplate stays a
  screen banner and is not part of a printed sticker.
- **No prompt text hidden in code.** The memory helpers' instructions, the
  studio agent's name/question lines and the reply-language line are versioned
  prompt files; the Console Prompt Inspector shows them with the two requests
  the application writes during a visit (first question, picture description).
  Memory helper instructions are view only (privacy rules).

## 2026-10-20 — Studio prompts follow the realtime prompting guide (owner directive)

- **Short prompts, no stacked rules.** Studio stage prompts and tool
  descriptions say what to do in a sentence or two, with at most one example,
  following the OpenAI realtime prompting guide ("Start simple", avoid
  overlapping always/never/only/must rules). Application code never rewrites
  the model's words with patterns: the avatar writes the name as it should
  appear (spelled M-I-A is written Mia), replacing Main's 2026-10-19 letter join.
- **The repaint is announced once.** When the avatar spoke a preamble while
  calling studio_revise, the change result is committed without another reply
  (application ordering); otherwise the result's reply announces it. Owner
  choice (2026-10-20, extends the 2026-10-14 preamble ruling): studio_revise may
  have one short in-character line before the call, saying the change is being
  painted and takes about half a minute; its tool instructions give a sample
  line, as the prompting guide recommends.
- **The reveal names its language last.** The application ends every reveal
  request with the reply language (Taiwan Mandarin with Traditional characters
  by default, English for an English studio or visitor), after the operator's
  English stage text.
- **Order, not wording, guards the studio steps.** A name counts as confirmed
  only from a visitor turn after its read-back, for the name read back;
  otherwise it is read back again. Nothing is recorded as the visitor's name or
  answer before the visitor has spoken in the studio, and a revealed picture is
  changed or finished only after the visitor has spoken since it was shown. A
  different answer to the question just recorded replaces it. Studio cleanup deletes only items the server listed in
  the conversation (out-of-band spoken lines never are).

## 2026-10-19 — Studio opening and name read-back (owner directive: fix everything found in QA)

- **The avatar asks the first step.** A studio started by Main (wake in
  Interactive Studio mode, Mirror mode switch, Console) speaks the Studio start
  script, then the avatar asks the name question (or question 1) in character
  from the stage prompts. The step's guidance also joins the conversation, so a
  visitor who answers first is still understood and the question is not repeated.
- **Start language follows the start script.** A start script in Latin letters
  only starts the studio in English (glass and questions); otherwise Chinese.
  The visitor's replies set the language after that.
- **Read-back corrections.** The read-back is one short in-character question.
  Names in Latin letters are spelled back; spelled letters or a described
  character are a correction, never a confirmation, and outrank the heard
  characters. (Main's letter join was replaced on 2026-10-20.)
- **The application finishes after the last picture.** With no change left, the
  reveal describes the picture and hands it over (Final version) without tools;
  when that reply ends, the application finishes the studio. Hand over the
  picture applies when the visitor is happy before every change is used.

## 2026-10-18 — Remote Console on the main display (owner directive, evening)

- **Two routes, one Console.** The Neo CONSOLE key keeps opening the Console
  over the avatar on the portrait TV (for the TV mouse). The Desktop app
  **Remote Console Magic Mirror** opens the same Console window on the main
  (virtual) display at the normal window level, so the avatar stays uncovered
  for remote desktop checks. Whichever is used last decides where the Console
  shows; unsaved edits move with it.
- **Remote Console does nothing else.** It never starts the app or changes the
  TV, the TV mouse, the Mirror mode or venue sound; failures show as an alert
  on the remote screen. It is not a Stream Deck key.

## 2026-10-18 — Interactive Studio visit flow (owner directive, later the same day)

- **Own wake phrase.** In Interactive Studio mode the mirror listens for the
  avatar's **Studio wake phrase** (Console, Interactive Studio › Start) instead
  of the Persona wake phrase; each mode switch reloads the wake listener. Avatar
  wake tuning stays bound to the conversation phrase. Default 「招喚渡鴉使者」
  as the owner wrote it (招 is encoded zhāo; 召喚 would be zhào).
- **Fixed ending.** A studio-mode visit (wake or switch) always ends: picture →
  photo hold → **Studio farewell** → Dormant. Default
  「願你找到你所追尋 / 再會 / 人類」, one phrase per line, spoken as one cue with
  about a second's pause between lines. The per-avatar "After the experience"
  choice is retired; a visitor-requested studio in Conversation mode returns to
  conversation.
- **Character.** The studio's character (system prompt) is editable in the
  studio and replaces Persona › Personality there only; studio rules, every
  step's reply and all questions stay editable as before.
- **Printing later.** Finished pictures already pass through the
  `KeepsakeSink` seam; a printer skill plugs in there (comments in
  `studio-runtime.ts` and `studio-ipc.ts`).

## 2026-10-18 — Interactive Studio and the Mirror mode switch (owner directives)

Supersedes the 2026-10-17 Portrait Studio "Default mode" ruling; the other
2026-10-17 studio rulings stand. Design and Fable audit:
[design](docs/superpowers/specs/2026-10-18-interactive-studio-design.md);
journeys: [user journeys](docs/testing/user-journeys-2026-10-18.md).

- **Name.** Portrait Studio is called **Interactive Studio** everywhere an
  operator sees it; the experience follows the story and situation. Internal
  IDs (`portrait_studio`, `studio_*`) are unchanged.
- **Explicit switch.** The Mirror has one Main-owned, persisted mode:
  Conversation or Interactive Studio (Console control bar › Mirror mode). In
  Interactive Studio every wake starts the studio; a live switch starts or
  closes it for the current visitor. The mode is captured once per session so
  the greeting and Main always agree. The saved per-avatar default mode is
  ignored. Visitors may still ask for it in Conversation when the avatar allows.
- **Stream Deck.** **INTERACTIVE STUDIO** (bottom-left) launches the Mirror in
  Interactive Studio; **START MIRROR** now selects Conversation; PLAY LOOP keeps
  the mode. The owner imports the regenerated profile.
- **Tuning.** Per avatar, only edits stored, reset to the tested default:
  the studio system prompt and every stage prompt (incl. **What the studio
  offers**, rendered into the versioned tool catalog's `{{studioOffer}}`), an
  optional name step, questions with per-question image prompt lines, every
  image instruction with a preview, on-glass text and spoken failure lines.
  One fixed guard line marking visitor text as data stays in the app. Image
  model and size stay versioned (invariant 11).

## 2026-10-18 — Memory model and ChatGPT sign-in upkeep (owner directives)

- **Memory model.** Memory extraction uses `gpt-6.1-sol`, the undated alias
  OpenAI documents for GPT-6.1 Sol, so newer snapshots of that model apply
  without a config change. OpenAI lists no family-wide "latest" alias for Sol;
  moving to a later Sol generation is a new versioned config change, never
  automatic (invariant 11). The Raven QA transcript judge reads the same
  published role, so it changes with it. Packaged default `configVersion` 8;
  the field config is published as version 19 (backup
  `config/backups/before-memory-model-sol-2026-10-18/`).
- **ChatGPT sign-in.** Keep the owner's Portrait Studio sign-in alive: Main
  refreshes it in the background (every 30 minutes it refreshes a token that
  would expire before the next check, plus the 8-day refresh). The Console says
  plainly whether it is signed in. Signing in stays owner-run
  `npm run chatgpt:login`; agents never read `.env.chatgpt`.

## 2026-10-17 — QA sound level (owner directive)

Before any QA that can produce sound, capture the affected output's volume and
mute state, lower output to the minimum level, and restore the exact captured
settings after success, failure or cancellation. Preserve an existing mute.
Normal use is the Jabra at 69 % unmuted (owner, 2026-10-18); 1 % is for tests
only, so real people nearby are not disturbed.
On this Mac, the tested system-output route supports `osascript` volume capture
and 1% output. Do not change microphone input gain. If a test changes output
devices, protect and restore that device too. Record the reduced level in
acoustic evidence; minimum-volume results cannot establish normal-volume wake
or speaker performance. Do not silently raise volume for those tests.

## 2026-10-17 — Google Drive media source (owner directive)

Treat Google Drive as the normal source of linked media. Missing local content
must be prepared by the app on demand. Listing the library must not download it;
prepare only media requested for preview, Save or playback. Keep any playback
copies in one app-managed location with automatic cleanup, never scattered
folders or a copy of the whole Drive. A repair must not change the owner's saved
video/audio selection. Implementation and evidence:
[on-demand media cache](docs/testing/loop-video-cloud-save-2026-10-17.md).

## 2026-10-17 — Portrait Studio mode (user rulings)

Design: [plan](docs/superpowers/plans/2026-10-17-portrait-studio.md) and the
owner-reviewed design page. Branch `feature/portrait-studio`.

- **Mode.** A second interactive mode: Raven asks the visitor's name, then a
  configurable number of questions (1–8), paints one portrait, reveals it on the
  glass with the name, and offers a bounded number of changes.
- **Default mode and start script.** Each avatar's default mode after wake
  (Conversation or Portrait Studio) is set in the Console. Each mode has its own
  start script; Conversation's is the existing wake greeting.
- **Image route.** Images use the owner's ChatGPT plan through the Codex backend
  image endpoints (the route OpenClaw and Hermes use), not an API-key call. The
  owner signs in on this Mac; the session is saved like `.env` in ignored root
  `.env.chatgpt` (invariant 12 amended). The route is unpublished by OpenAI and
  may change; failures degrade visibly.
- **Model.** Test candidates live and prefer `gpt-image-2.5-flare`. The chosen ID
  lives only in `resources/config/portrait-studio.v1.json` (invariant 11).
  Live probe the same day: flare, sunburst and `gpt-image-2` all work on the
  owner's plan; flare medium took 21.7 s and its edit 26.1 s. Flare is selected.
- **Name and memory.** The visitor's name is always asked first, is only a
  caption, and is never added to memory. Studio turns are control turns.
- **Guest list.** Operators may enter guest names; Main shortlists up to three by
  pronunciation and the model chooses and confirms with the visitor. The list
  stays in Main.
- **Keepsake.** No QR or download. A printer skill may come later; keep the
  output seam flexible. Images stay in RAM.
- **Limits.** No application generation limit; plan limits degrade visibly.
- **Questions.** The proposed default questions are approved and remain
  editable in the Console, including how many.
- **Stage prompts (owner follow-up).** What the avatar is told at every studio
  stage is configurable per avatar in the Console (Experiences → Avatar prompts at
  each stage), in visit order, with reset to the versioned default. Only edits are
  stored; required placeholders such as `{{name}}` and `{{question}}` are enforced.
  The Console UI must stay reasonable and easy to use.

## 2026-10-17 — Portrait Console mouse and remote desktop (owner confirmed)

The Xiaomi Wireless Mouse Lite 3 receiver must remain in the TV board. Forward
only that USB device (`2717:50d1`) over the existing direct Ethernet connection
to the Mac, using the tested native VirtualHere server and normal Mac GUI client.
CONSOLE ensures the connection after Console/HDMI readiness; STOP releases the
receiver, closes the dedicated client and stops the board server even if other
shutdown steps fail. START/PLAY LOOP leave mouse ownership alone. Keep failures
bounded and metadata-only, without gating Console access from remote desktop.

Preserve the physically accepted Mac rotation 90° / Android user_rotation 2.
Do not add global mouse-axis remapping, continuous pointer warping, input capture,
another Electron restart owner, or changes to remote desktop permissions/services.
CONSOLE may place the pointer on the sole portrait display once if it is outside.
Remote desktop uses ordinary Mac coordinates and must remain usable independently
of the forwarded receiver. Existing Chrome Remote Desktop stays available after
Magic Mirror STOP. The owner confirmed one working physical pointer with correct
direction and clicks; remote end-to-end acceptance is tracked separately.
See [setup](deploy/macos/stream-deck.md#tv-connected-mouse-and-remote-desktop) and
[evidence](docs/testing/portrait-console-mouse-2026-10-17.md).

## 2026-10-17 — Stream Deck global STOP and Console on mirror (owner revision)

Keep START at top-left and PLAY LOOP third on the top row. Move STOP to the
bottom-right Neo key `(3,1)` and label it exactly **STOP**. It is the universal
Magic Mirror shutdown control: sleep the TV and stop the whole application and
owned processes, including loop/media and future program modes. Future modes
must participate in the existing Main shutdown; do not maintain a list of media
types to stop or terminate unrelated Mac applications.

Use the freed second key `(1,0)` for **CONSOLE**. Bring the existing Console
renderer above the mirror display, preserving unsaved edits and the current
program. Repeated presses show/focus it, never toggle it away. START/PLAY LOOP
return to the mirror view. Console may start the application and wake HDMI when
needed; it does not change the saved avatar or playback intent. Use the same
bounded operator mailbox, queue and LaunchAgent. Keep icon artwork/text within
the Neo key; PLAY LOOP uses two short lines.

## 2026-10-17 — Operator Loop Video mode (owner approved)

Stream Deck Neo retains START first and STOP second; PLAY LOOP is the third
top-row button. Loop Video is a separate global Console tab and appliance mode,
not an avatar skill, model tool or conversational media request. Only operator
UI/Stream Deck controls end it; spoken wake/stop phrases do not interrupt it.
Main releases Realtime, wake microphone and camera ownership before playback.
No avatar, ambience, mist or spells run behind the loop.

Select video and optional separate music from the existing shared/Common media
folder. Embedded-video audio or muted video plus independent looping music are
supported, with saved fit and volume. Save is scoped to these settings and does
not publish an avatar draft. Initial owner selection: `3_worlds_loop.mp4` plus
`天使_intro.mp3`. START returns to normal Dormant behavior for the saved active
avatar; STOP puts the TV in standby and cleanly shuts down the app.

PLAY LOOP waits for observed frame/time advancement and separate audio when
selected before waking HDMI. Repeated PLAY is idempotent. One bounded playback
reload is allowed; a second failure leaves the mirror black with a Console
reason, never an unsolicited return to Raven. Persist desired loop mode for
crash recovery under the existing LaunchAgent; explicit START/STOP supersedes
it. No additional restart owner, driver or microphone listener is introduced.

## 2026-10-17 — Reflective wake/sleep performance and Reduce Motion

The owner expects the configured mist and gradual avatar reveal/retreat on
wake/sleep. Reflective mode is an explicitly authored performance: play its
selected video and opacity animation using the saved timings even when macOS
Reduce Motion is enabled. Leave the system preference and ordinary UI/legacy
presentation motion reduction intact. Do not silently hide the reflective
video or replace its reveal with a sudden appearance. Validate moving video
frames and intermediate computed opacity with both motion preferences.

## 2026-10-17 — Stream Deck Neo application controls (user request)

The connected Neo has separate START and STOP buttons for Magic Mirror.
The startup default is the last saved active avatar from the previous use
(owner clarification, 2026-10-17), currently Raven. START/STOP must preserve that
selection, not force a fixed avatar; selecting an editor profile alone is not
the Console's persisted **Use on Mirror** selection.
Use Elgato's built-in Open actions to launch small local application wrappers
around the existing queued canonical start/stop scripts. Keep the existing user
LaunchAgent as the sole Electron restart owner. Intentional STOP requests clean
Main shutdown, then unloads and verifies the job/process release; the next START
bootstraps that same job. It does not persistently disable login startup or
change TV presence policy. No extra hotkey driver/plugin is needed.

Owner follow-up: STOP must put the reflective TV in **standby**, so the macOS
desktop does not remain visible on the glass. Sleep the TV before closing app
windows; still clean up the app if TV control fails. START launches the saved
active avatar's app, waits for current-Main renderer load/bridge markers, then
wakes the TV and opens its HDMI activity. Use the installed trusted wired ADB
server and explicit SLEEP/WAKEUP keys, never a power toggle or another daemon.
Standby means Android sleep/display OFF, **not full shutdown or mains power-off**;
the wired control path stays alive. Full-power-removal wake is not established.
Physical Neo START/STOP presses were confirmed working by the owner before this
TV integration. USB reconnect and cold-login acceptance remain separate.
See [setup](deploy/macos/stream-deck.md) and
[fresh evidence](docs/testing/stream-deck-controls-2026-10-17.md).

## 2026-10-14 — Online media only after a hidden opening phrase (user ruling)

Replaces the default local→YouTube fallback, explicit-YouTube requests and the
keyword-based local-only source policy. The owner keeps mini as the default
model; the application, not the model, decides when online search is allowed.

- Media requests search local media only. Online (YouTube) search is allowed
  only when the visitor's final transcript **opens with** the avatar's online
  search phrase (default 「在雲上找找」, configurable per avatar in the Console
  Persona section), for example 「在雲上找找晴天」, or is the phrase alone. The
  phrase alone also covers the visitor's next turn. Results of an allowed search
  stay playable for a later selection.
- Matching uses the shared sound-alike key. Opening-phrase (prefix) matching is
  an owner-approved exception to invariant 7's whole-utterance equality for this
  phrase only. Quoted, negated, embedded or late mentions do not unlock it, and it
  only permits a search, never playback or hardware by itself.
- The phrase is hidden like the spells: never in persona text, prompts or model
  tools; it is a transcription hint and Console field only. Raven never offers
  or explains online search. A phrase turn skips memory extraction (invariant 6).
- Saying "YouTube" without the phrase no longer goes online.
- On a phrase turn Raven may search online without a local lookup first; the
  application does not enforce local-first there (owner, 2026-10-15).

## 2026-10-14 — Short line before local search and memory (user ruling)

Refines the 2026-10-11 preamble ruling. The owner keeps `gpt-realtime-2.1-mini`
as the default, and mini speaks before these tools despite prompt wording
([evidence](docs/testing/review-fixes-2026-10-14.md)).

- Before `search_youtube`, `find_media` or a memory lookup/save/change, Raven may
  say one short in-character line in the reply language. It never names the tool
  or the mechanism.
- `memory` `identify` stays silent: the application's identity question speaks
  next. Other tools (play, camera, sleep, stop) keep no spoken preamble.
- Accepted playback stays silent; no claim of success before the result.

## 2026-10-13 — Research the measurement as well as the failure (user ruling)

The owner authorizes another focused research, repair and QA round, including
camera/driver investigation and synthetic wake-volume comparisons. Prefer small
recovery improvements over a new architecture. Challenge failed tests with
positive/negative controls and adversarial cases; a grader diagnosis or one
passing sample is not established causation or general acceptance. Record a
proven research limit instead of repeating unchanged experiments. Existing
TV-off device/provider authority and app-owned USB recovery remain in force.

## 2026-10-13 — Audited remediation and Raven's authority (user ruling)

The owner authorizes fixes and QA for the remaining-errors audit, superseding
its application-code audit-only boundary. TV-off real-device/provider authority
continues; production TV shutdown policy remains intact outside isolated QA.

Raven is calm, authoritative and self-possessed, with dry, mildly disdainful wit
about human fussing. It need not comply with every idle demand, empty praise,
repetition or attempt to make it a generic assistant. It may decline briefly
without performing the refused request. This replaces the earlier uniformly
warm/accommodating sage direction. It remains non-aggressive: no humiliation,
threats or contempt for the visitor's worth. Genuine distress receives restrained
care. Clear requests for supported skills and application-owned cues still follow
their existing authorization, ordering and exact-speech rules; character is not
permission to obstruct media, camera, consented memory or sleep controls.

The versioned authoritative candidate is tested in isolated configuration before
scoped publication. Model IDs, tool count and unrelated operator settings remain
unchanged. Automated character judgments do not establish owner listening
acceptance or universal reliability.

## 2026-10-13 — Camera monitoring follows the living avatar (user correction)

Camera capture and stall monitoring run only while the visitor avatar is waking
or in an active conversation, with a ready Mirror renderer. Dormant, suspending,
offline, maintenance and renderer replacement release the camera and stop its
watchdog. Wake activation reacquires it only after the prior worker has exited.
The rapid missing-frame reset rule applies while this owner is active; it does
not authorize continuous background camera polling while Raven sleeps.

## 2026-10-13 — Prompt camera-stall recovery (user ruling)

When an operating camera stops producing video/images, the application must
detect missing fresh frames and initiate targeted USB recovery promptly. Do not
wait for a visitor's capture request or treat a live worker heartbeat/delayed
face-analysis result as proof of video delivery. Preserve bounded retries,
permission/device-absence handling and unrelated audio/USB operation. Current
timing and measured recovery belong in PROGRESS and its linked test evidence.

Image requests arriving during camera-worker replacement join its existing
bounded recovery. Once the USB budget is exhausted, pending/new image requests
fail promptly rather than waiting for a recovery that is no longer scheduled.
Fresh frames permit capture again but do not by themselves replenish the reset
budget. A successful USB call alone must never be reported as restored video.

## 2026-10-11 — TV-off real-device testing (user authorization)

For this repair session the owner keeps the TV off, leaves Jabra and camera on,
and authorizes Raven, real Realtime calls and a temporary bypass of TV-off
shutdown. Use the existing isolated QA exemption or a temporary launch
definition; restore the installed TV policy after testing. This does not change
the normal human-controlled TV power policy below. Current evidence belongs in
[the field follow-up](docs/testing/realtime-field-followup-2026-10-11.md).

## 2026-10-11 — Third-audit remediation

The owner requested systematic fixes in the [third audit](docs/testing/third-audit-prompts-skills-persistence-2026-10-11.md).
The named Agents SDK upgrade to 0.20.0 and application liveness recovery are
in scope. A repeated wake failure in Dormant exits 1; renderer hangs use the
existing single-recreation budget, and Main hangs terminate for launchd recovery.
An intentional stop remains exit 0 even after repeated signals or cleanup errors.
No additional process restart owner is introduced.

The owner confirmed 「停止播放」 as the application-owned media stop phrase.
It uses whole-final-transcript sound-alike equality during Active
media, once per turn, and skips memory extraction. Dormant loops still use the
configured native wake phrase. `stop_media` is no longer advertised to the model.
Prompt and merged-media comparisons stay isolated QA trials; production model
and operator persona promotion retain their existing trial/approval boundaries.

QA runners and agent start/stop operations share the Electron operation lease
at `~/Library/Caches/MagicMirror/electron-owner`. Use
`node scripts/electron-owner.mjs <owner> <command> [args]` before manipulating
normal Raven. A busy lease is not permission to stop another agent's app.
On the final Mac the `.lock` sibling is kernel-owned and released on process
exit/crash/reboot; `.json` is diagnostic metadata. Never unlink that lock inode.
A stale, valid legacy directory may migrate only after its PID is confirmed dead.

## 2026-10-11 — The application owns USB camera recovery (user ruling)

- A stalled USB camera must be reset and recovered by the application. Do not
  make unplugging/replugging the camera an operator prerequisite or the normal
  recovery instruction; the owner explicitly declines that manual workflow.
- Recovery may release capture, reset/re-enumerate the selected camera's USB
  device, rediscover it and verify fresh frames. Keep attempts bounded and
  report precise metadata when macOS cannot complete the reset.
- Scope resets to the camera, preserve unrelated USB/audio devices, and keep
  Main responsible for worker ownership. This does not add an Electron restart
  owner or permit camera frames/identifiers in diagnostics.

## 2026-10-11 — TV power, conversation behavior and kiosk settings (user rulings)

Accepted from the [second audit](docs/testing/second-audit-remaining-failures-2026-10-11.md).

- **Power is human-controlled.** A person turns the TV on and off. When the TV
  is off, Magic Mirror exits after the absence grace, by design. A future
  Bluetooth button will start it; until then, start it through
  `com.magicmirror.launchagent`. Auto-start before the TV, or auto-resume
  after the TV returns, is not required.
- **Preambles.**
  - Quick tools get no spoken preamble.
  - Before a slow YouTube search, Raven may say one short in-character line in
    the reply language. It never names the tool or the mechanism.
  - The application adds a non-verbal working cue in Active only.
- **Language.**
  - Default: Taiwan Mandarin in Traditional characters.
  - Switch to English only on a complete English sentence.
  - The Chinese greeting stays, and it does not set the reply language.
- **Sound-alike scope** (refines the entry below).
  - Accepted: homophones, tone differences, Simplified/Traditional, and the
    in/ing and en/eng merges.
  - Held until tested: zh/z, ch/c, sh/s.
  - The whole utterance must still be the command.
  - Stop-phrase and media-wake turns are control turns that skip extraction
    (invariant 6).
- **Spells.** An unmatched utterance starting with 「施放咒語」 gets one fixed
  application-spoken, in-character retry line. The line reveals nothing about
  spells.
- **Model trial.** A QA-only A/B of `gpt-realtime-2.1` against `-mini` is
  approved. A production switch needs separate approval and a versioned config
  change (invariant 11).
- **Persona.** Adopt the proposed sage persona after the prompt trial passes.
- **AI disclosure.** By venue signage; nothing is shown in Dormant. Raven
  answers truthfully, in character, if sincerely asked whether it is human.
- **Memory.** An explicit visitor request to forget, change policy or go
  temporary needs no extra confirmation question.
- **Wake during media.**
  - An audible deciding test is approved, run with the app stopped.
  - Looping media plays about 12 dB quieter while Dormant and is restored on
    wake, with a metadata reason.
- **Kiosk settings.**
  - Start the Mac when power is connected.
  - No screen lock.
  - Skip BetterDisplay's staged update and freeze its auto-update.
- **Wi-Fi acceptance.**
  - The TV's Wi-Fi root-cause item is closed as not required, because wired
    ADB is the control path.
  - The Mac's Wi-Fi is the Wi-Fi acceptance item.

## 2026-10-11 — Spoken commands accept sound-alike wording (user ruling)

- Raven is a speaking avatar, so phrases the application matches from speech
  accept transcripts that sound the same or nearly the same. This covers
  homophones, tone differences, Simplified/Traditional script and
  similar-sounding words, for example 渡鴨/渡鴉 or 銀登/銀燈.
- It applies to scene spells, the scene stop phrase, the wake phrase matched
  from Realtime ASR during media, and future spoken commands. The local wake
  detector already matches by pronunciation tokens. Sleep stays model-intent
  routing.
- In invariant 7, "normalized" now includes this deterministic local
  pronunciation folding. It uses the shared pronunciation lexicon, never a
  model guess. The whole utterance must still be the command. Added, missing
  or different words, quotations, negations and hypotheticals do not trigger.
  Mismatches keep metadata-only reasons (invariant 9).
- The exact sound-alike classes are an implementation choice. Toneless pinyin
  is the baseline; common Taiwan Mandarin merges such as in/ing, en/eng and
  zh/z, ch/c, sh/s are candidates. Each must be proven with positive and
  negative phrase lists before release.

## 2026-10-10 — Black Dormant in reflective presentation (user ruling)

- In `reflective` presentation mode, a healthy Dormant stays completely black:
  no avatar, mark, silhouette, glint or on-screen wake-phrase hint. The
  reflective TV reads as a plain mirror; Raven appearing after the wake phrase
  is the intended surprise.
- 「不黑畫面」 in the PRD, Tech Spec and Implementation Plan applies to failure
  and recovery states (Maintenance, OfflineLoop, renderer recovery,
  avatar-asset failure). Those must remain visibly distinct from black
  Dormant. Operator liveness and wake health belong in the Console
  (invariant 9).
- Any post-wake acknowledgement must not spoil the black-to-reveal moment;
  prefer an audio cue or an earlier ritual start over a Dormant visual.

## 2026-10-10 — Spell effect timing under the requested review remediation

The owner requested all fixes in the performance/correctness/UI review. Its
MX-05 recommendation is adopted: an application-authorized normalized exact
full transcript commits its approved scene before the spoken cue completes.
The cue runs alongside the effect. Ambient VAD may interrupt cue speech but
does not revoke an already completed authorization. Session changes, Stop,
duplicate-turn protection and approved hardware presets retain their existing
authority. Farewell still waits for processed playback before session closure.
This supersedes older cue-before-effect implementation/evidence descriptions;
see [the remediation ledger](docs/testing/review-remediation-2026-10-10.md).

## 2026-10-05 — Realtime relationship memory and Markdown import (user authorization)

- Keep the current Realtime voice path. Ordinary replies never wait for final
  transcription, extraction or retrieval. Prefer compact conversational turns.
- The user approved the reviewed relationship-memory design and instructed
  implementation through TDD, self-review and thorough automated end-to-end QA.
  A small confirmed-person brief and selective semantic/keyword recall supplement
  the RAM-only current encounter. No implicit cross-person or cross-avatar sharing.
- New scopes default to background distilled summaries; migrated explicit-only
  scopes retain their policy. Automatic, explicit-only, off and encounter-temporary
  controls apply in Main. Turn-start ownership, control exclusions, revisions,
  source dependencies and scope epochs guard background writes and forgetting.
- SQLite stays private in a Main-owned worker thread. A pinned local
  Qwen3-Embedding-0.6B/MLX runtime supplies vectors on this final Mac; no cloud
  embedding fallback or runtime model substitution. The embedding manifest is
  versioned independently of the unchanged dialogue/transcription/extractor IDs.
- The forthcoming large Markdown is explicitly in scope: preview persona headings
  separately, then distill bounded history chunks using the configured extractor.
  Only summaries persist. The source stays in place; persona changes require the
  existing editor. Import is cancellable and requires Dormant. Already saved
  summaries remain after cancellation or failure, visibly reported.
- These rulings supersede the October 4 explicit-only/lexical-only restrictions.
  Human conversation quality, actual microphone timing and physical presentation
  remain later acceptance; automated synthetic tests do not claim those results.

## 2026-10-04 — Reusable local lasting memory (user request)

- Selected structured memories may persist in a private Main-owned SQLite file,
  scoped by avatar and person. Raw transcripts/audio, transient context and
  diagnostics retain invariant 1's RAM-only/content-free boundaries. This
  supersedes older blanket RAM-only wording for selected memory records only.
- Begin with explicit remember/correct/forget requests and authorized Console
  editing; automatic extraction is not enabled. Verbal identity confirmation
  is application-checked on a separate later turn. This is self-identification,
  not biometric authentication. Guest IDs remain Main-only.
- Retrieval is bounded lexical search with Chinese segmentation, not semantic
  search. Use existing node:sqlite, no new server, vector extension or embedding
  model. Reconsider vectors only with measured recall failures.
- Memory lives outside public configuration and the prompt inspector. Console
  edits require Dormant; voice deletion or person change replaces the cloud
  session to remove old private context. No implicit sharing across avatars.
- Private files use owner-only permissions and SQLite secure deletion. External
  backups/OS snapshots are outside app deletion guarantees; no app backups of
  this store are created. Local storage still sends selected recall to Realtime.

[AGENTS](AGENTS.md) owns execution policy and canonical invariants; [PROGRESS](PROGRESS.md) owns current delivery/evidence. This file records implementation decisions, not task status. The [pre-compaction ledger](docs/archive/decisions-before-harness-2026-09-13.md) preserves complete dated wording and earlier source links.

## 2026-10-03 — Current Sol worker routing (user decision)

- **Route.** The user changed active harness routing to exact `gpt-6.1-sol`,
  reasoning effort `max`, profile `nova-auto`, and fresh `--ephemeral`
  workers. The native macOS `--cd` path
  `/Users/novalien0424/magic-mirror` is authorized; the Windows example
  remains valid for Windows.
- **Provenance.** This Sol route supersedes historical worker-route references
  in older plans and records. Those records retain their Luna completion
  evidence as provenance, never active dispatch.
- **Boundary.** Runtime model IDs remain unchanged. Worker routing and
  target deployment authority do not accept tasks or promote phases.

## Scope and platform

- **2026-10-03 user confirmation:** this Mac is the FINAL Raven deployment
  target, with canonical workspace `/Users/novalien0424/magic-mirror`.
  Explicitly scoped local deployment work is authorized. This supersedes the
  older deferred-Mac/M4-port ruling; target TCC, signing, workers, LaunchAgent,
  power and wake evidence still require actual Mac verification. Windows
  results remain historical Windows evidence; phase acceptance is unchanged.
- **2026-08-27 historical platform ruling:** Windows was the engineering/functional host and the Mac port was deferred. The 2026-10-03 final-target authority supersedes that deferral; Windows tags still cannot establish Mac readiness.
- Phase order is Foundation → Realtime → Wake → Avatar/Audio → Scenes → Identity → Memory → Field Hardening (0–7). Remaining Phase 8 covers custom Cubism authoring/calibration and character/voice quality. Rigging is not ML training.
- Phase 2 deferred P2-D2 offline wake, 19/20 live-wake sampling, multi-speaker accuracy and 30-minute ambient/TV negatives to Phase 7; these are not passes. Dated prep-only/engineering overlap exceptions are not standing parallel-phase authority.
- **2026-09-05:** multi-avatar Console was pulled forward: one public character loaded at a time; per-avatar personality/voice/presentation/scenes/triggers and shared/locked media/actions. Public avatar IDs are not guest identities. This changes scope, not phase acceptance or Identity/Memory sequence.
- **2026-09-13:** user authorized personal skill and related harness compaction following [OpenAI guidance](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra). Preserve general principles and domain safeguards; no runtime-model, dependency or phase changes are implied.

## 2026-10-03 — Field audio device policy (operator decision)

- **Device.** The venue PoC audio device is the **Jabra Speak2 75** (USB,
  CoreAudio UID `AppleUSBAudioEngine:Unknown Manufacturer:Jabra Speak2
  75:9842AB51A9700254000:1`), standing in for the PRD's Speak2 40 in the same
  role: one USB device for microphone, playback, and AEC. The PRD's final
  hidden-audio plan (reSpeaker XVF3800) is unchanged.
- **Operator rule.** The Jabra is both the default input and the default output
  whenever it is connected; otherwise macOS falls back to its own choice. The
  Magic Mirror app uses the same device.
- **System enforcement.** The user LaunchAgent `com.magicmirror.audio-prefer`
  (`~/Library/Application Support/MagicMirror/ops/audio-prefer`) sets default
  input, output, and system output to the Jabra at login and on every CoreAudio
  device-list change. It does not fight a manual pick between plug events.
  Its log is metadata only:
  `~/Library/Logs/MagicMirror/audio-prefer.log`.
- **App policy and historical observation.** The pre-merge field build used
  the OS default (Chromium `default` device), observed as the Jabra. Retain the
  operator's Jabra preference for the incoming audio runtime; its target-Mac
  selection is not yet verified. The Tech Spec §13.3 config uses "audio stable
  device IDs".
  Chromium `deviceId` values are per-origin hashes, so selection matches on the
  label (`Jabra Speak2 75`). If the label is missing, the app falls back to the
  OS default with a Console event giving the reason (invariant 9) and never
  blocks voice (invariant 10).

## Credentials, ownership and persistence

- **2026-08-23 personal build:** Main alone loads `OPENAI_API_KEY` from ignored root `.env`; no Console provisioning, keystore, inherited environment or alternate source. Missing/empty/read failures are metadata-only. Agents never inspect the value. Only the short-lived Realtime secret crosses to the renderer. This supersedes older credential plans.
- One Main lifecycle owner: cloud failure → OfflineLoop; local core failure → Maintenance. Unrelated adapters never gate conversation. One failed renderer recreation precedes exit 1; LaunchAgent `KeepAlive={SuccessfulExit=false}` alone owns process restart.
- Config has separate schema/config versions, atomic migrations preserving operator values, and visible Maintenance for unsupported schemas. Active→Previous→packaged Default recovery is for corrupt/missing/unreadable data, never silent model substitution.
- Main-only `node:sqlite`: `app_migrations`, foreign keys, WAL, integrity check, transactional migrations, defensive health, idempotent close. Online backup is exported `backup(sourceDb, path, options)`, not `db.backup`. DB failure does not block unrelated conversation/adapters.
- Telemetry: RAM ring 2,000; JSONL 5 MB × 5; queue 1,000 with oldest-overflow `telemetryDroppedCount`. Only time/module/event/status and optional timing, bounded error/session/scene ID/reason/source; never raw content/errors, credentials, frames or embeddings. Overflow/delivery failures remain visible and nonblocking.
- **Superseded in part by the 2026-10-04/05 memory rulings:** selected facts and validated summaries may persist in Main's private scoped database. Raw transcripts/audio and injected context remain RAM-only. Historical worker routes/H6 remain provenance; AGENTS owns current workers.

## Voice, identity and microphone

- Runtime IDs/voices are versioned config. Session snapshots freeze at creation, job snapshots at enqueue; Publish affects future sessions/jobs. Worker model routing is separate.
- Main atomically snapshots model + Realtime identity before minting; renderer receives validated/frozen identity + secret, expiry 600 seconds. Missing identity never calls the broker.
- One browser runtime owns start/rollover/stop/interrupt/dispose. `realtimeSessionId` rejects stale events; generation is diagnostic except the positive Main start-bundle generation that commits activation. Main owns pending activation/rollover and reasoned stale/wrong-state drops.
- Mic ownership is explicit release→acquire; stop caller-owned renderer tracks before returning to wake. Handoff failure is local Maintenance.
- Profile changes close old-owner history, confirm in a clean Persona+Master session, then update the agent. Guest/candidate IDs stay in Main. Final transcripts are bounded session RAM and clear on stop/offline/rollover/restart. Extraction uses turn-start ownership and skips control turns.
- Audible playback completion, including processed output tail, governs idle, rollover and farewell. Interruption stops output and coalesces duplicates.
- Rollover timer: 60 minutes. After cloud failure, one Main schedule probes the ephemeral broker at 5/15/30/60 seconds, discards secrets in RAM, and returns Dormant on success/exhaustion. Manual Start owns the next full session; no automatic session reconnect. Shutdown cancels probes.
- Console Start/Disconnect and payload-free interrupt use validated Console-only IPC through the tracked Mirror; preserve `handleSimulator` response shape. No guest IDs in model tools.
- **2026-08-27 RCA:** mock model IDs once leaked from non-isolated userData into live runs. Live flags select isolated data; provider prose is not entitlement proof. Use bounded status/transport reasons and retain failed evidence.

## Voice Studio — 2026-09-09

One embedded implementation: Signalsmith Stretch + native Web Audio, per-avatar controls and supernatural default/Raven presets. Provider speed/delivery instructions are separate from pitch/formant DSP. No neural engine, Python voice worker, virtual cable or separate changer app.

The operator relaxed added direct-speech p95 to <=180 ms and overhead above engine latency to <=40 ms. Preserve <=50 ms interruption mute and zero stale cancelled audio. The SDK receiver is muted; one MediaStreamAudioSource/shared AudioContext graph is audible. The rejected MediaElementAudioSource candidate is historical. Human sound, speakerphone echo and Mac acceptance remain distinct. [Design](docs/superpowers/specs/2026-09-09-avatar-voice-effects-design.md); current proof belongs in PROGRESS.

## Wake and scenes

- One hashed sherpa package binds phrase/platform/version/tuning/corpus. Custom phrases use its token encoding, not training; no engine fallback. Changed wake packages take effect at next app start.
- Chinese KWS uses model-owned tokens, ppinyin, 16 kHz / featureDim 80 and reset after detection. Package/corpus tuning, not invented event confidence, governs acceptance; revalidate final Mac hardware.
- Customizable wake baseline: `魔鏡阿魔鏡`. Sleep is Active-only directed intent, never a wake keyword. Preserve the current avatar's exact farewell and finish playback before Realtime close, mic release and Dormant. Quoted/negated/hypothetical/incidental mentions do not sleep.
- Scene spells require normalized exact full-transcript match once per turn. Approved typed presets alone control hardware. Public scene/trigger/action IDs are not guest IDs. Draft tests never silently publish or activate another avatar.

## Cubism, previews and asset ownership

- Official vendored Framework/Core, WebGL2 and closest 9:16 display; actual output RMS/envelope drives lip sync. MotionSync is separate scope, not a retroactive Phase 3 gate.
- **2026-09-08:** dedicated Cubism library/test page. A rig is reusable art, not a public profile or guest. Managed imports validate and rediscover; rejection is visible. Appearance assignment is an explicit draft edit.
- Selection/load owns a silent local preview, without publication, Mirror switch, mic or provider call. Expose all motion groups/indices, expressions and actual MOC IDs/bounds/defaults/readback; lifecycle uses index zero. Writable parameters need not have artwork; Speaking clips do not replace audio mouth input.
- Reset stops actions and restores defaults. Replacement/unload/page leave release timed work and overrides. Preview overrides follow automatic effects; preserve actual bounds/defaults without range-step quantization.
- **2026-09-09:** Console motion previews loop natively without repeated fade-in; expressions retain SDK indefinite pose hold. Active highlight persists until reset/replacement. This is `preview: true` only; normal Mirror playback stays one-shot.
- **2026-09-08 framing:** preserve initial model canvas-height fit and explicit Layout. Draw/resize compose fresh projection/MVP without model-matrix mutation. PPU/horizontal padding must not shrink art. Console/Mirror share renderer, 9:16 viewport, aspect and DPR. No per-ID multiplier, dynamic alpha-fit or CSS zoom workaround. Artistic extreme-pose crop calibration is separate.
- **2026-09-09 labels:** operator name/version lives in managed `avatar-label.json`; no filename/UUID guesses. Unknown stays unknown; invalid labels fail visibly without hiding valid rigs. Sidecars may travel with future exports. [Label contract](docs/testing/avatar-library-labels-2026-09-09.md).
- **2026-09-09 Raven master:** `resources/avatar/Raven/v10/` separates runtime from editable CMO/PSD. Preserve masters; new authoring gets a new version. Managed userData copies stay distinct; no direct edits or automatic publication/synchronization. Build remains Ren-only. **Superseded storage wording:** versioned CMO/PSD masters are tracked under the [current storage policy](resources/avatar/Raven/README.md); scratch QA and derived working files remain outside that master inventory. Preserve byte-safe Git attributes and separate backups.

## Evidence

Mocks, unavailable cases and real results stay distinct. Required unavailable evidence is pending, never passed. Automation does not prove physical sound/effects, operator acceptance or Mac readiness. Cubism QA must explicitly identify external rigs; built-in success cannot stand in for Raven, and hidden-Mirror Console coverage cannot establish portrait/speech acceptance.

Protected product/review documents, historical `.claude/skills` inputs and installer remain under AGENTS boundaries. [Archived ledger](docs/archive/decisions-before-harness-2026-09-13.md) retains complete rulings and links to older archives; read it only for details/history absent here.

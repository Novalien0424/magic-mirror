# Magic Mirror — Raven deployment on the final Mac, 2026-10-05

## Current: real two-visit memory smoke — 2026-10-05

User authorized real API conversations and full synthetic transcript recording.
[Test and full-transcript judgment](docs/testing/relationship-memory-real-conversation-2026-10-05.md):
two fresh WebRTC sessions, eight real audio/ASR utterances, normal Console
start/disconnect, automatic summary extraction, and two correct follow-up recalls.
No guest history was preloaded; seven summaries were learned through production.
Seven live checks passed in 266 seconds. Full synthetic transcripts remain in
local ignored artifacts; ordinary visitor recording stays disabled.

The test exposed and fixed an adapter bug: an unsolicited rejected memory save
was marking ordinary speech as control and suppressing automatic learning.
Main now owns memory-intent classification from visitor words. TDD regression,
110 focused tests, typechecks and build pass. Earlier failed runs are preserved.

**Memory recall passed; conversation quality did not.** The avatar repeated
confirmation questions, incorrectly described automatic memory as explicit-only,
averaged 51 words per visitor turn and added one unsupported first-visit claim.
Next: repair confirmation/policy dialogue and compactness before human acceptance.
No additional paid run was spent retrying wording. Existing Markdown import is
ready for the user's future file; no actual user history was imported here.

Normal app restored through the existing LaunchAgent, PID **24396**, with operator
configuration unchanged. Avatar, camera, wake listening and local embeddings report
ready; [restoration evidence](.artifacts/phase4-qa/2026-10-05T06-09-23-569Z/runtime-restored.json).

## Current: Realtime relationship memory implemented — 2026-10-05

The user authorized implementation through TDD, self-review and thorough automated
end-to-end QA, including a forthcoming large Markdown containing persona and history.
Realtime voice/model IDs remain unchanged. Delivered: scoped private SQLite v2 in a
Main worker, turn-bound background summary learning, confirmed-person brief,
semantic-first plus keyword recall, revision/epoch/dependency guards, correction and
forget cleanup, automatic/explicit/off/temporary modes, and a cancellable Markdown
import with separate persona review. Raw conversation evidence stays RAM-only.

[Implementation, import guide and review](docs/relationship-memory-implementation-2026-10-05.md)
links the design and evidence. [Earlier planning/foundation progress](docs/archive/memory-planning-progress-2026-10-05.md)
is historical. The architecture is no longer waiting for permission to implement.

Focused regression: 258 tests passed across 23 files. Node/web typechecks and build
pass. The real local Qwen3/MLX
smoke passed bilingual similarity and concurrent query-priority checks (1.44 s load,
14.2 ms warm mean; two synthetic relevance fixtures). More than 1 MiB of synthetic
Markdown was chunked and distilled with a synthetic extractor; raw-history/persona
markers did not enter SQLite and restart/isolation/correction/deletion checks passed.

The [final natural-provider live Electron run](.artifacts/phase4-qa/2026-10-05T04-09-01-242Z/evidence.json)
passed 23 checks: production Console edits,
policy/reload/draft retention/import, configured cloud extraction, actual Realtime
confirmation/context acknowledgment/remembered answer, local cross-language recall,
SQLite restart, guest/avatar isolation, and forget. Real WebRTC used a silent
synthetic microphone and synthetic ASR edges; it does not pass human microphone
or conversational-quality acceptance. Earlier natural-provider failures and their
repairs are retained in the implementation report; these fixtures do not prove
general conversational recall quality. No phase or packaged-deployment promotion.

Normal app restored through the existing LaunchAgent, PID **17514**. Operator
configuration v15 is byte-for-byte unchanged across restoration. Startup reports
Cubism, camera tracking, wake listening and local embeddings ready;
[metadata evidence](.artifacts/memory-implementation-2026-10-05/runtime-restored.json).

Next: use **Avatars → Memories → Import Markdown** for the user's actual file,
one person at a time. Persona is previewed separately; only distilled history is
saved. Human testing will assess omissions, recall cues, interruptions and natural
turn length. No user history has been imported in these synthetic tests.

## Current: local wake during loops, global Mac threshold 0.32 — 2026-10-04

New logs confirmed repeated `media_wake_not_matched` while cloud ASR was used
to interrupt looping media. Loop startup now requests the existing Dormant
transition after player confirmation: Realtime closes/releases its microphone,
then the local wake worker acquires it. Main preserves this loop through the
intentional transition. Local wake stops media before normal conversation
activation. Once playback retains its existing automatic completion path.
The Mac package threshold default is **0.32**; Raven's published enabled
override was already **0.32**, and saved operator config is unchanged.

Renderer sleep cleanup and reflective CSS now preserve requested video during
Dormant; music keeps the avatar visible while conversation remains disconnected.
The initial live trial proved release→acquire→`wake_worker_listening`, but caught
the renderer stopping/hiding video and produced `media_playback_timeout`; this
failure is retained in telemetry at 09:52:59Z. Corrected live trial at 09:56Z
confirmed `dormant`, no Realtime session, visible unpaused looping video at
20.3 seconds, then the next complete-loop boundary at 09:57:00Z. A fullscreen
1080×1920 capture confirms video remains visible. Telemetry records Realtime
cleanup before local `wake_worker_listening`; no second mic owner was started.
Eight focused files: **98 tests passed**; subsequent catalog/wake checks:
**26 passed** (overlapping coverage). Typecheck/build and diff checks passed.
Normal LaunchAgent PID **56497** runs the corrected build; debug window closed.
Operator confirmed the live spoken wake test succeeded: “yes now wake works!”
This confirms wake interruption of the current media loop on the final Mac.
The earlier speaker-generated synthetic phrase did not establish detection.
Operator config is unchanged. No phase promotion.

## Current follow-up: wake diagnostics and debug errors — 2026-10-04

Operator reported repeated spoken wake failures during the loop. Historical
logs contained repeated `realtime_request_rejected`, but no wake-match result.
A temporary content-free live probe confirmed `item_retrieve_invalid_item_id`:
the application deleted completed media-time speech before the SDK retrieved
the item. Cleanup now waits for retrieval. Speech remains excluded from normal
conversation/extraction. New allowlisted `media_wake_matched` and
`media_wake_not_matched` events expose recognition outcome without transcript
or audio. The one live transcript observed during the probe did not match;
the earlier operator attempts cannot be reconstructed from old metadata.
Speaker-generated synthetic wake produced no detected speech and is not a
recognition pass. Temporary listeners and references were removed.

Closed optional Console windows no longer receive snapshot delivery attempts
reported as failures. Both renderer pages remove the ineffective header-only
`frame-ancestors` meta directive that caused three Chromium startup errors;
the effective source restrictions remain unchanged. The remaining blocked-eval
issue came from Zod's capability probe; both renderer entry points now select
its supported `jitless` mode before schemas load. An isolated 12-second
camera-worker check produced 51 valid frame messages and no validation errors;
the earlier intermittent camera error was not reproduced or claimed repaired.

TDD red→green covers retrieval-before-delete, wake outcome metadata, optional
Console closure, CSP meta validity and validation without any Function probe.
Seven focused files: **135 passed**, exit 0.
`npm run typecheck`, `npm run build`, `git diff --check`: exit 0. Final normal
LaunchAgent PID **54178**. Actual Realtime startup and 3 Worlds looping playback
showed no Console errors/warnings or Chromium Issues entries; diagnostic window
closed, fullscreen video captured. Recent telemetry showed media requested/
playing and no degraded/failed events in that observation window. Saved v15
active/draft hashes remain unchanged. Physical wake recognition remains
unverified; next operator attempt should be checked for the new match events.

## Current: compact media Console and verified playback — 2026-10-04

Music & video now shows a searchable filename list; folders, playback controls
and help are collapsed. System keeps Devices and Media folders visible, with
diagnostics and advanced pages behind disclosures. Save controls remain visible.

Media tools await actual player startup before accepting. Failed files return a
failure the avatar can explain. Video fills the display, requested media pauses
BGM, and completion/Stop restores the avatar and BGM. The exact configured wake
phrase stops media through the existing Realtime microphone; duplicate and
negated input are covered, without acquiring a second microphone.

Actual-file QA found incomplete linked-file transfers: Bike stalled at 1.127s
with only 1.443s buffered; a complete read made playback succeed. Folder media
now streams to EOF once before playback to prepare cloud-backed files, with
bounded buffering, metadata caching and authorization rechecks. Existing range
streaming remains in place. No-store responses and fresh playback URLs prevent
stale video buffers after linked files change. The investigated native-protocol
workaround was discarded; no Electron protocol defect is claimed.

Media playback now mutes the processed voice output and disables automatic
Realtime replies while keeping one microphone for the exact wake phrase.
Ordinary playback-time speech is excluded from conversation and extraction,
including delayed transcription arriving after playback ends. Stop/completion
restores normal response generation and BGM. DevTools is closed and its saved
docking preference is now a separate window; the split display was diagnostics.

TDD: focused failing startup/BGM/wake/failure/cache checks were made green.
Final focused command covers eleven test files: **181 passed**, exit 0.
`npm run typecheck`, `npm run build`, and `git diff --check` exit 0.
Mac `node scripts/run-phase4-qa.mjs --media-skill`: **16 checks, 7 captures**,
exit 0; includes 8 MiB transfer, ranges crossing 4 MiB, fullscreen video,
once/loop, BGM restoration, malformed-file failure, filename search, saved
settings and completely black dormant output.
[Passing QA](.artifacts/phase4-qa/2026-10-04T09-03-04-661Z/evidence.json).
[Preserved cache regression](.artifacts/phase4-qa/2026-10-04T08-35-19-954Z/evidence.json).
Screenshots for the filename list, Devices and fullscreen video were reviewed.

Normal LaunchAgent runs the final quiet-playback build, PID **51739**, including
the delayed-transcription guard. Clean startup was captured fully black, with
no diagnostic panel. Saved v15
active/draft remain identical SHA-256
`56b65290bc964e3bbdbcabde468fa0f064f39252dadac9eb0e1ac70dc2b09bf4`.
Actual Bike once playback reaches `media_completed`; actual 3 Worlds has crossed
multiple complete loops, including on the quiet-playback build. Fullscreen
1080×1920 video with no diagnostics was captured. Physical silence and spoken
wake interruption remain pending operator confirmation; automated exact-ASR,
mute routing and delayed-background-transcription regressions pass. No phase
promotion. The Electron QA above predates the quiet-playback change; those
voice changes have focused automated coverage plus the current live trial.

## Previous: actual folder BGM and preview recovered — 2026-10-04

Operator-selected Common MP3 is published in v15. Its original live/preview
failure cleared after a clean LaunchAgent stop/start; the underlying cause is
not established and no application behavior change is claimed. Actual file
decode (ffmpeg) and isolated Electron managed-protocol playback exited 0.
Restored Mirror playback: readyState 4, advancing time, unpaused, unmuted,
volume 0.06 (0.3 dormant × 0.2 master). Operator confirmed audible output.
Actual Console full-cycle preview also passed: readyState 4, time 37.73s,
loop enabled, volume 0.06, media error 0. Preview and inspectors were closed;
normal dormant BGM remains running under LaunchAgent, PID 43314.
Active/draft remain identical SHA-256
`56b65290bc964e3bbdbcabde468fa0f064f39252dadac9eb0e1ac70dc2b09bf4`.
Temporary diagnostics were removed; no source media was modified or copied.
If this recurs, capture the protocol response/media error before restarting.

Camera update: targeted macOS IOUSBHost device capture/release reset restored
tracking at 07:38:10 UTC; worker restart alone had not. Still-capture checks
remained unavailable. No reusable USB reset command or Console button is
installed. Earlier no-frame and configuration notes below are historical.

## Previous: simpler media/BGM setup and on-demand camera vision — 2026-10-04

Removed the redundant media-enable and per-file selection checkboxes. Linked
folders authorize all indexed music/video automatically, including subfolders.
Raven's Appearance → Dormant music lists both avatar-folder and Common/shared
music; selections save with **Save & apply all changes** and use stable folder
IDs. The actual Common music choices were verified in the deployed Console.
Existing imported resources, folder links, voice and mist settings are preserved.

System → Devices has an explicit Save/Discard workflow and a sticky save bar;
System → Media folders has Save folder settings with success feedback. Scrolling
to the bottom and save/reload persistence were exercised in real Mac Electron.
Console is also accessible from **View → Magic Mirror Console**.

The versioned `capture_camera` tool requests one frame from the existing
Main-owned Arducam worker, adds it to the current Realtime conversation, then
resumes the response. Frames stay in RAM/private pipes, never files or telemetry.
Stale sessions, invalid senders, overlapping capture and timeouts are bounded.
**System → Devices → Check camera capture** returns dimensions/status only;
it does not upload the test image. Real hardware check currently fails: camera
permission is granted and the device is detected, but no frames arrive. This
predates this change (last ready 06:32:53 UTC, then stale at 06:32:57 and starting
at 06:33:02). Operator USB reconnection is requested; live visual conversation
acceptance remains pending. Conversation and wake continue normally.

Validation: focused 10-file Vitest run **201 passed**; subsequent affected
presentation/config/folder/IPC/help checks **142 passed** (overlapping coverage),
camera checks **5 passed**, and final Console help/editor checks **19 passed**.
Typecheck, build and build verification exit 0. Mac `--media-skill` QA:
**14 checks, 7 captures**, exit 0, including own/Common BGM options, publication,
reload, actual looping BGM and every dormant output pixel RGB=0. Save-bar and
checkbox-free editor screenshots inspected.
[Passing evidence](.artifacts/phase4-qa/2026-10-04T07-20-42-157Z/evidence.json).
[Preserved preceding failure](.artifacts/phase4-qa/2026-10-04T07-18-28-171Z/evidence.json)
exposed the old Appearance save/publish split; Appearance now uses the same
single save/apply action as Music & video.

Before restart, the operator's pending avatar edits were saved through the
Console as **v14**. Active/draft SHA-256 remains
`c02dec3337bda77837bcd6dc6a98a69d9a95e201096f151697112336632f65e2`;
folder-link SHA-256 remains
`d0fe1035b267cbe6c054bca6992362b936675946288c11adb24736e6135b9444`.
Dormant BGM is still unselected; the operator can now choose either Common
track directly. No phase promotion or live spoken-vision acceptance claimed.
Final build is running under the existing LaunchAgent, **PID 41481**; avatar
ready and wake listening confirmed at **07:30:18 UTC**. Working tree and saved
configuration were checked after deployment. Console is left on Raven →
Appearance for BGM selection.

## Previous: avatar and shared media folders deployed — 2026-10-04

Per the operator's preference, native Mac folder selection is the primary media
workflow; Google Drive for desktop supplies syncing without another app login.
**Avatars → avatar → Music & video → Choose folder** links that avatar's folder.
**System → Media folders → Choose folder** links the shared folder inherited by
all avatars. Links save immediately, subfolders are indexed automatically every
30 seconds or with Refresh files, and the next conversation receives own +
shared media. Existing imported resources remain available under a collapsed
section. No operator folders have been chosen yet; selectors are ready.

Main owns the atomic local link file, bounded index and playback path resolution.
Only IDs/names/kinds enter session prompts; inspector and runtime use the same
catalog projection. Owner scopes, overlap/symlink rejection, file removal,
unavailable-folder status and playback-time rechecks preserve boundaries.
The existing once/loop/video-fade/music-visible behavior is unchanged. Folder
links are machine-local, independent of draft publication; 200 media files per
folder, MP4/WebM and MP3/WAV/OGG/M4A. Offline cloud playback needs local files.

`npm run typecheck`, final build and build verification: exit 0. Focused tests:
**128 passed** across folder indexing, IPC, session snapshots, prompts and media
runtime; a stale Console IPC expectation was updated for the existing media
tool channel. Mac `--media-skill` QA: **12 checks, 6 captures**, exit 0, including
production folder-picker flows, persistence, exact inspector IDs, actual folder
video/music playback, removal rejection, and previous media behavior.
[Final evidence](.artifacts/phase4-qa/2026-10-04T06-30-00-653Z/evidence.json).
The preceding complete run's folder screenshots were inspected at
[06-26-21](.artifacts/phase4-qa/2026-10-04T06-26-21-126Z/evidence.json).

Deployed under the existing LaunchAgent, **PID 36505**. Avatar ready and native
wake listening confirmed at 06:30:57 UTC. Operator active/draft **v13 hashes
unchanged**; mist/dormant settings preserved. Real Google Drive hydration and
live spoken intent/physical sound remain operator checks; no phase promotion.

## Previous: simpler avatar media setup deployed — 2026-10-04

Open Console with **⌘⇧D → Avatars → select avatar → Music & video**.
Upload selects permitted music/videos immediately; existing files have selection
checkboxes and local previews. Names/aliases and once/loop/stop examples are on
the same page. **Save & apply all changes** saves, checks and publishes in one
action, preserving edits made during checks. Advanced prompts and playback
settings are collapsed. Blank alias lines no longer block saving; duplicate
import names get distinct defaults. Avatar locks remain enforced.

Changed Console editor/import/publish flow, media selection/preview components,
alias normalization and corresponding QA/tests. Focused Vitest: **110 passed**;
typecheck and final build: exit 0. Real Mac Electron media QA: **8 checks,
4 captures**, exit 0, covering upload/selection, publication/reload, preview
exclusivity, video fade/once/loop, music with avatar visible, stop and sleep.
[Evidence](.artifacts/phase4-qa/2026-10-04T04-15-30-698Z/evidence.json).
Screenshots inspected; a final CSS correction contains preview width and help
copy matches selection controls. Playback evidence remains applicable.

Deployed the built workspace under the existing LaunchAgent, **PID 29074**.
Avatar ready and native wake listening are reported; live dormant output was
visually checked black. Operator active/draft **v13 hashes are unchanged**;
the actual Raven mist remains assigned. Dormant music is still unassigned
because no audio has been imported. Live spoken-command recognition and physical
speaker/panel acceptance remain operator checks; no phase promotion.

## Previous: actual Raven mist assigned; dormant output black — 2026-10-04

`git pull --ff-only origin main` returned already up to date. The actual
`sample/_media/raven/fog.webm` is present and fully decodes: silent VP9,
720×1280, 8 seconds, SHA-256
`7b3a265e4ffc7fe509099b8d2af660f87cdfefb205c70dcf1598e3f6d49e27dd`.
Live diagnosis found published Raven v12 still used `emerge`, with no imported
media. Its visible gray dormant output was confirmed directly.

Using the existing managed-asset and transactional configuration services,
imported the fog clip and published Raven **v13**, `reflective`, entrance/exit
`visual-7b3a265e4ffc7fe509099b8d`, screen blend, black hold 400 ms,
reveal start 1500 ms, entrance 4000 ms, exit 2400 ms. Existing voice/persona and
other avatar settings are preserved. Pre-change config is backed up under the
application's `config/backups/before-reflective-ritual-2026-10-04`; no credentials
were accessed. Dormant music remains unassigned because no audio was imported.

The ritual QA now imports this actual fog file. `npm run build` and
`node scripts/run-phase4-qa.mjs --ritual` exited 0: **13 checks, 13 captures**,
advancing decoded mist before reveal, two cycles, and all 2,073,600 dormant
pixels exactly RGB zero. [Evidence](.artifacts/phase4-qa/2026-10-04T03-42-26-214Z/evidence.json).
Root inspected the mist/reveal capture and the normal Raven dormant window
after restoring LaunchAgent supervision: live output is visibly all black.
Physical panel black level and Raven artistic acceptance remain operator checks.

## Previous: shared avatar media skill — 2026-10-04

Implemented and built: **Avatars → Skills → Media skill**. Each avatar can select
managed library videos/music, spoken names, aliases, gain and video fade duration.
Native `play_media` / `stop_media` tools share the versioned catalog and prompt
inspector. Main checks the live session, published resource list and avatar locks.
Video fades the presentation away and restores it after completion/stop/failure;
music keeps the avatar visible. Once is the instructed default; explicit loops
run until stopped, replaced, or sleep. Media pauses idle expiry and active ambience.
Console Stop All, scene replacement and lifecycle teardown release ownership.

- Focused runtime/tool/IPC/prompt/audio Vitest: **143 passed**, exit 0. Focused
  config/editor/runtime/QA-runner checks: **61 passed**, exit 0 (four overlap).
  `npm run typecheck`, `npm run build`, `git diff --check`: exit 0.
- `node scripts/run-phase4-qa.mjs --media-skill`: **7 checks, 3 captures**, exit 0.
  [Mac evidence](.artifacts/phase4-qa/2026-10-04T03-24-12-870Z/evidence.json)
  covers real import, Skills authoring, Save/Publish/reload, measured avatar fade,
  advancing decoded video, once/loop/stop, visible avatar during music, music
  completion, Console Stop All and dormant cleanup. Captures were inspected.
  Two failed fixture runs remain retained at
  [03-20-56](.artifacts/phase4-qa/2026-10-04T03-20-56-452Z/evidence.json) and
  [03-21-44](.artifacts/phase4-qa/2026-10-04T03-21-44-253Z/evidence.json);
  the final run imports through production Console rather than assuming a
  preloaded library. No live provider/microphone intent-recognition claim.
- Normal Raven restored under the existing LaunchAgent, **PID 25143**. Operator
  active/draft configuration remains **v12**. Media skill lists start empty;
  import/select resources and publish to expose them to each avatar. Existing
  personal media choices were not replaced. No phase promotion or commit.

## Previous: Save / wake test repaired; workflow trimmed — 2026-10-04

Save all now adopts the server-normalized draft only if the submitted edits
are still current; newer edits and partial scene saves remain protected.
The pinned sherpa 1.13.6 numerical scoring extension is built and installed for
darwin-arm64, with platform-specific preparation, hashing and packaging paths.
Normal Raven is running under the existing LaunchAgent, **PID 20191**. Telemetry
confirmed avatar ready, camera ready and wake listening at 02:15:47–48 UTC.
The operator's saved v8 draft was preserved by hash; it was not published.

- `npm run typecheck`: exit 0. Focused Vitest across workspace, scene-save,
  detector, calibration, native bundle and build provenance: **48 passed**, exit 0.
- Native build and bundle validation: exit 0. Tone and silence each produced
  12 numerical measurements and zero detections. Initial SDK/linker mismatch
  was fixed by selecting the installed Xcode SDK explicitly; full native build
  output remains in [.artifacts/sherpa-score-native-mac/build.log](.artifacts/sherpa-score-native-mac/build.log).
- Final `npm run build`: exit 0. `node scripts/run-phase4-qa.mjs --profiles`:
  **42 checks, 38 captures**, exit 0. [Evidence](.artifacts/phase4-qa/2026-10-04T02-14-31-686Z/evidence.json)
  covers live numerical calibration/start/stop, normalized Save, preservation
  of edits during Save, Publish and reload. Root inspected the live score/mic
  capture. The earlier [failed run](.artifacts/phase4-qa/2026-10-04T02-13-18-120Z/evidence.json)
  exposed a Windows-only QA fixture; the runner now selects the Mac wake package
  for Mac profile QA. A stale-build rejection before that run is also retained
  in session output. `git diff --check` and runner syntax check: exit 0.
- Per the latest user instruction, AGENTS and the three worker roles now default
  to one agent, focused checks and brief results. Mandatory worker/tester/review
  handoffs and command-transcript reports were removed. Five harness files are
  40% smaller; TOML parses and all 12 invariants/platform protections are unchanged.

No human spoken-wake accuracy, signed-package acceptance or phase promotion is
claimed. The automation could not trigger the global Console shortcut; the real
Console controls were verified through isolated Electron QA. Operator shortcut
confirmation and the user's actual mist/media setup remain pending. Earlier
runtime PIDs and delivery statements below are historical evidence.

## Reflective ritual and Console setup — 2026-10-04

Implemented in the current uncommitted workspace and built on this Mac. Console
→ Avatars → Appearance now offers reflective mode, the `Quiet, ceremonial dread`
preset, dormant music/volume, separate entrance/exit videos and blend settings,
black hold/reveal timing, greeting/farewell and local previews. Media library
imports feed the selectors. Invalid timing disables preview/Save/Publish;
Main also validates video kind, references and avatar ownership. Legacy modes
remain available. Reflective sleep outputs RGB zero; wake uses a bounded reveal,
then the greeting. Visitor speech cancels a pending greeting without delaying
connection or microphone ownership. Farewell completion precedes visual exit;
dormant music returns after the exit reaches black.

Fresh validation:

- [Initial focused run](.artifacts/reflective-ritual/green.md): 252/253 tests passed;
  QA type narrowing and incomplete field-help fixtures failed. These were fixed;
  [fixture recheck](.artifacts/reflective-ritual/fixture-recheck.md) passed typecheck,
  all 16 field-help tests and `git diff --check`, each exit 0.
- [First runtime run](.artifacts/reflective-ritual/runtime-check.md): typecheck,
  48 focused tests and build passed. The QA assertion incorrectly called 19
  advancing frames with 2 startup drops a stall. The corrected assertion requires
  rendered frame progression and retains dropped-frame measurements; it makes
  no sustained-smoothness claim. Failed evidence is preserved.
- [Runtime recheck](.artifacts/reflective-ritual/runtime-recheck.md):
  typecheck, 63 greeting/session tests, build and
  `node scripts/run-phase4-qa.mjs --ritual` all exited 0. The Mac run passed
  **13 checks with 13 captures**: production Console import/edit, invalid timing,
  full-cycle preview and cleanup, Save/Publish/reload persistence, unchanged
  legacy avatar settings and two portrait wake/sleep cycles. Across the focused
  checks, all 254 current tests passed (the final media test added one case).
- [Final build and runtime](.artifacts/reflective-ritual/final-runtime.md): after
  the last CSS change forces hidden loading/scene overlays to opacity zero,
  build, the same 13-check ritual QA, build-provenance verification and
  `git diff --check` all exited 0. No application source changed afterward.
- [Current QA evidence](.artifacts/phase4-qa/2026-10-04T00-53-45-978Z/evidence.json):
  each of five expected-black 1080×1920 captures had 2,073,600 pixels,
  zero nonzero-RGB pixels and maximum RGB 0. Timed entrances were 4000–4001 ms;
  exits were 2401–2402 ms. Sampled video progression was 18–19 frames in
  600–602 ms with zero drops; music time/levels and post-preview cleanup passed.
  Root inspected Console regular/1024 captures, validation messages, synthetic
  entrance video, awake Ren and black portrait. These are synthetic fixtures,
  not acceptance of Raven with the user's actual mist, physical sound or TV
  panel black level. Earlier passing/failed runs emitted a helper sandbox-extension
  warning; no causal failure was established.

Normal Electron was quit through its menu before building/QA; LaunchAgent showed
last exit 0, with no overlapping instance. After QA, root restored the existing
LaunchAgent (`kickstart` exit 0). Current Main is **PID 10610**, `runs=4`.
Metadata-only telemetry confirmed `cubism_avatar_ready` at
`2026-10-04T00:55:05.373Z`, `wake_worker_listening` at `00:55:07.407Z`, and
`camera_tracking_ready` at `00:55:06.197Z`. CUA confirmed the Mirror window returned.
Operator active/draft config remains v8 with no draft changes; no sample media or
ritual preset was published to Raven. The user's actual mist path remains
unsupplied. Next: import/select that clip and dormant track in Console, preview,
then publish the chosen settings and obtain physical/artistic acceptance.
No phase promotion or complete Mac deployment acceptance is claimed.

## Clock-in after operator reboot — 2026-10-04 (Taipei)

Root verified boot time `06:35:06`. Workspace HEAD is `5259ef0` on
`field/macmini-deploy`; implementation checkpoint `be7272f` is unchanged.
At clock-in the LaunchAgent was loaded, Electron was absent, and last exit was 0.
The cause is unverified; this does not pass automatic login startup. Root ran
`launchctl kickstart gui/501/com.magicmirror.launchagent` with exit 0. The sole
supervisor job is now running PID 2951, `runs=2`.

Primary UI observation: System Settings showed both Electron microphone entries
on, Electron camera on, and Codex Computer Use on. CUA could read/click Settings
and capture its screenshot, resolving the prior access blocker for this run.
Root's runtime telemetry recorded `wake_worker_listening` success at
`2026-10-03T23:07:22.953Z`, `camera_tracking_ready` success at
`2026-10-03T23:07:23.007Z`, and `cubism_avatar_ready` success. Primary telemetry:
`~/Library/Application Support/magic-mirror/telemetry/telemetry-0.jsonl`, read
through a time/module/event/status/reason-only parser. Root verified
[camera-tracker.swift](deploy/macos/camera-tracker.swift#L121) lines 121–140 emit
`camera_tracking_ready` only after an actual frame and successful Vision detection.
The prior no-frame camera blocker is therefore resolved for this run; physical
USB replug is no longer required now.

Root's `system_profiler` observation confirmed Jabra Speak2 75 as default input,
output and system output, and `T749-fHD720` online in portrait 1080×1920 at 60 Hz.
Root inspected the live Raven portrait through Computer Use. The board-HDMI
LaunchDaemon is running (PID 292); `pmset -g custom` reports AC sleep and display
sleep disabled and automatic restart after power loss enabled. These settings
and the static portrait observation do not prove unattended recovery or motion.
Root requested an operator live wake trial; no result has arrived. Spoken wake,
live voice/audibility, operator gaze, hardware unplug/replug, unattended login,
and packaging/signing remain pending. The initial clock-in was read-only;
subsequent feature validation is recorded above.

## Resume here

This Mac is the user-confirmed FINAL Raven deployment target. Incoming runtime
and local HDMI policy are integrated; the 15 conflict resolutions have been
reviewed and validated. Check the field branch's local deployment checkpoint
commit for the resolved merge. Dependencies and Electron 44
are installed. The operator supplied `.env.rtf`; it was converted locally to
plain root `.env`, with both files owner-only and ignored. Never inspect either
value. Main-only `.env` loading now avoids inherited environment fallback or
process-environment mutation. A real broker issued an ephemeral key and confirmed
the configured models available; active voice has not yet passed.

Raven v11 is imported (17 files, model ID
`model-290002c3-7e18-466c-b547-d98a67e054eb`) and selected as `raven-field` in
published config v8. Prior default profile/config is preserved. The Mac wake
package `sherpa-magic-mirror-mac-v1` is installed with verified upstream neural
and token hashes, bundled-lexicon keywords and unchanged tuning/model version.
Spoken accuracy is not yet verified.

The user LaunchAgent is installed at
`~/Library/LaunchAgents/com.magicmirror.launchagent.plist`, with the sole app
restart policy `KeepAlive={SuccessfulExit=false}`. Earlier Mac startup reported both
renderers ready and the Mirror on `T749-fHD720` with simple fullscreen and
screen-saver level. Crash recovery passed: verified Main PID 33024 was killed,
launchd started PID 33087, and the HDMI Mirror returned ready. All 17 installed
Raven files match the source bundle. The current field app is **running**, PID
10610, with avatar, camera and native wake readiness as recorded above.
No other app restart owner exists.

Nearest-person gaze uses largest face area with a 600 ms switching hold and
smoothed, bounded gaze. Apple Vision capture is RAM-only and identifies no
visitors. Camera worker and active Realtime microphone hotplug recovery are
implemented. Wake retries a missing microphone and cancels retries on release.

Historical pre-reboot camera evidence: Arducam enumerated and camera permission
was authorized, but the real 12-second probe produced zero frames. macOS reported
`kIOReturnNotResponding` (`0xe00002ed`) while starting the stream. Explicit supported
640×480 NV12 capture also produced zero frames after rebuild. The operator says
nobody could reach it physically; USB replug was then considered required.
Post-reboot frame/Vision readiness above resolves that blocker for the present
run; unplug/replug acceptance is still pending.
Historical Computer Use window access was blocked by macOS permissions; the
remote operator reported its Allow control disabled. Helper signature verified as
OpenAI and this Mac is not MDM-enrolled. Remote-input restrictions are a possible
cause, not a verified diagnosis. No TCC security controls were bypassed. Current
System Settings UI access and screenshot capture now succeed as recorded above.

Before reboot, Mac microphone status was `not-determined`. Main requests
permission before native wake capture, exposes denial/unavailable/pending reasons and prevents
late startup after shutdown. The pre-reboot app reported
`wake_microphone_permission_required`; operator approval was requested then.
Current UI permissions are on and native wake listening succeeded; spoken
acceptance remains pending. Historical isolated cloud smoke plus its one
diagnostic retry returned `active_timeout`
after 60 seconds, with valid provenance, model availability, and zero orphans.
No connect-start metadata followed key issuance. Do not claim live conversation
or Jabra audio from these results; cloud/live voice diagnosis remains unresolved.

Codex's `local_thread_store_compression` under-development flag was disabled in
the user config. TOML parses and fresh workers no longer show that warning.
No evidence establishes it as the previous crash cause. Other warnings await
the operator's exact text, if any.

Next: obtain the requested operator live wake trial result, verify live voice and
Jabra audibility, then perform operator gaze QA, physical camera/HDMI/Jabra
unplug/replug and unattended login checks when accessible. Nearest-person gaze
is implemented and unit-tested. Named-person recognition/enrollment is not enabled: the incoming
configuration still uses mock face-model IDs and there is no live identity
backend. Camera gaze does not provide that feature. Operator gaze, spoken wake
accuracy, live voice/audibility and unattended login startup remain
unverified. A normal clean quit passed before ritual QA. The observed reboot
and manual kickstart do not pass automatic login
startup. This is a checkout deployment through local Electron; packaging/signing
remain pending.

## Current worker routing — 2026-10-03

Exact model `gpt-6.1-sol`, effort `max`, profile `nova-auto`, fresh `--ephemeral`
workers; native `--cd /Users/novalien0424/magic-mirror` is authorized. This
supersedes historical Luna routes. Runtime model IDs remain unchanged;
fresh Sol tester evidence is linked below. See [AGENTS](AGENTS.md) and
[DECISIONS](DECISIONS.md) for the exact dispatch contract.

## Current workspace and verification boundary

- Canonical Mac workspace: `/Users/novalien0424/magic-mirror`; recovered
  origin/main integration on the field branch. Preserve operator data and local edits.
- [Tracking build/checks](.artifacts/mac-deployment/tracking-green.md): typecheck,
  build and 104 focused tests passed. [Recovery checks](.artifacts/mac-deployment/recovery-green.md):
  80 tests/build passed; test fixture type error subsequently fixed.
- [Fresh types/camera tests](.artifacts/mac-deployment/recovery-types.md):
  typecheck exit 0; 12 tests passed. [Wake/audio recovery](.artifacts/mac-deployment/wake-hotplug-green.md):
  typecheck exit 0; 71 tests passed. Red evidence retained beside each report.
- [Final build and credential checks](.artifacts/mac-deployment/final-checks.md):
  typecheck/build exit 0; 20 tests passed. Swift inputPriority and smoke temp-path
  provenance problems are fixed; historical failed evidence is retained.
- [Historical crash recovery and cloud check](.artifacts/mac-deployment/deployment-runtime.md):
  crash/HDMI recovery and 17 managed-file hashes passed; cloud active timeout.
  [Historical voice diagnostic retry](.artifacts/mac-deployment/voice-diagnostics.md):
  key issued, model available, active timeout, microphone not-determined before reboot.
- [Microphone permission checks](.artifacts/mac-deployment/microphone-permission-green.md):
  typecheck/build and 20 focused tests passed; OS approval was pending before
  reboot. Current UI permissions and native wake listening are root-verified
  above; live spoken acceptance remains pending. Current ritual checks are
  recorded in the feature delivery section.
- The old display test now correctly expects a configured-but-absent target to
  remain hidden. QA temp fixtures use canonical macOS paths. Windows historical
  evidence below is not Mac runtime acceptance. No phase promotion is claimed.

## Historical evidence

Pre-reboot clock-out — 2026-10-04: the operator requested commit/push and a reboot
to address permission/camera problems. No reboot was initiated by the agent.
LaunchAgent was running Main PID 34513 after the microphone repair/build, with
`cubism_avatar_ready` and native microphone permission pending. It was left in
place for the operator's reboot. Those observations are superseded by the
clock-in facts above; historical cloud timeouts remain unresolved voice evidence.

[Earlier Windows delivery and Mac field observations](docs/archive/progress-before-mac-reboot-2026-10-04.md)
are archived with their evidence links. They do not establish current Mac acceptance.

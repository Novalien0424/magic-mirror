# Magic Mirror — Raven deployment on the final Mac, 2026-10-04

## Current: simpler avatar media setup deployed — 2026-10-04

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

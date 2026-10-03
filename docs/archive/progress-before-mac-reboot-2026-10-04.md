# Historical progress before final Mac reboot handoff — 2026-10-04

Archived observations; use [current PROGRESS](../../PROGRESS.md) for runtime state and next actions.

## Incoming runtime delivery — historical Windows evidence, 2026-09-17

The current Realtime sleep skill is migrated to a versioned structured tool
catalog: schemas, use/avoid/speech rules, availability and JSON results share
one source for runtime and Console. Explicit handlers validate arguments before
effects; spells retain application exact-match routes. AGENTS and compact
Realtime, roleplay and QA guidance are updated.
[Architecture and evidence](../../docs/testing/realtime-tool-architecture-2026-09-17.md):
159 focused tests, web typecheck/build and real SDK serialization tests pass.
Normal Raven Tools & input was visually verified on Windows; that run used v20 and
the saved draft preserved. Isolated lifecycle QA failed at Electron capture
before provider work, including its one retry; it is not a live pass.

The earlier [prompt audit](../../docs/testing/realtime-prompt-audit-2026-09-17.md)
introduced five native inspector windows and response-scoped greeting/scene
cues. **Sleep silence remains unresolved:** prior Raven pre-tool speech and
residual-output failures are retained. Next: operator testing of the structured
tools, then investigate pre-tool output and the QA capture failure separately.

On Windows, Raven V11 from remote PR #1 was installed in the normal shared rig library as
**Raven · v11**, with its matching renderer and motion ownership changes.
The repository Live2D and installed avatar-studio skills are updated. V10 and
the prior published state were preserved at installation; V11 was not
automatically assigned/published. The operator has since published v20. [Installation evidence](../../docs/testing/raven-v11-install-2026-09-17.md):
69 focused tests, web typecheck/build, bundle validation and 227 isolated
Windows Console checks passed. Normal native import and visible Console
display were observed; all 17 managed files match V11. Artistic and live
output-audio acceptance remain separate.

Raven's extra invitation on sleep is addressed with a compact silent-tool prompt,
SDK background completion, and an application-owned exact farewell response.
Sleep intent clears local processed audio; only the farewell response reopens
output, and sleep waits for its playback/tail. No linguistic regex filters.
[Raven farewell evidence](../../docs/testing/raven-farewell-2026-09-16.md): 112 focused
tests, web typecheck/build and final real-provider host/Raven lifecycle and
speaker-output checks passed. Failed attempts remain linked. Physical operator
retest and broader spoken reliability remain open.

Wake greetings and application scene speech now explicitly forbid tool calls
for that response, preventing a greeting from invoking the sleep/farewell tool.
Visitor sleep commands retain their tool. Replacement-worker timer/send failures
now enter failed recovery instead of remaining on Restarting.
[Diagnosis and current checks](../../docs/testing/wake-greeting-sleep-2026-09-16.md):
189 focused tests, web typecheck/build and four real-provider Windows lifecycle
checks passed. The operator's physical stop-calibration/wake retest remains open;
the original model/tool decision cannot be reconstructed from metadata alone.

Repeated Start failure is fixed: an exhausted wake worker previously stayed
absent while Start kept sending it configuration. Start now safely creates a
fresh worker; automatic recovery remains bounded. Console preserves failure
and recovery state across cleanup, shows restart attempts, and explicitly
prompts saving edits and restarting Magic Mirror when recovery fails.
[Recovery RCA, research and checks](../../docs/testing/wake-recovery-retry-2026-09-16.md):
125 focused tests, web typecheck/build, real worker-exit recovery, explicit
terminal failure and production Start/Stop retry passed. The original native
device/driver failure at 17:21 is identified by code, not its physical cause.

The live calibration meter now displays the real native acoustic score and
matched/total sound tokens. Direct Console observation of the operator's three
spoken attempts at threshold 0.18 recorded **2 detections**, with full 9/9-token
scores **0.517361** and **0.473206**. Partial matches also appeared; threshold
alone does not resolve incomplete matches. Published settings were preserved.
[Native score delivery and evidence](../../docs/testing/wake-native-score-2026-09-16.md):
141 focused tests, 21 final follow-up tests, five native cases, web typecheck,
build and 33 Windows UI checks passed. The adapter also consumes results at
every decoder step, fixing lost detections in coalesced input. Human wake
reliability remains open; the original zero-detection interval is not fully
explained. Release packaging did not complete and remains unverified.
Next: use score plus token progress to investigate the remaining spoken miss.

Live wake calibration is available at Avatars → Persona → Wake sensitivity
tuning → Start live test. It shows separate microphone and native score
meters, repeated detection counts and applied threshold/score/trailing blanks.
Use in draft → Save → Publish keeps tested values across restart; temporary
tests restore published settings when stopped or interrupted. No operator
sensitivity setting changed. [Delivery and RCA](../../docs/testing/wake-calibration-2026-09-16.md):
139 focused tests, web typecheck/build and 33 Windows UI checks passed.
The reported rain misses were one non-exact transcript and one cancelled
announcement; cancellation diagnostics now distinguish visitor speech from
output interruption. Physical wake/spell accuracy is not yet established.
The repeated `魔鏡阿魔鏡` trial is recorded above; rain verification remains open.

Wake input now verifies first-block delivery and recovers a stalled worker;
release/shutdown cancel recovery and old callbacks cannot affect a new capture.
Console reports recovery/failure and actual quiet levels. No device, phrase or
sensitivity setting changed. [Delivery evidence](../../docs/testing/wake-capture-recovery-2026-09-16.md):
169 focused tests, 19 overlapping follow-up checks, web typecheck/build passed;
six real Electron microphone/ownership checks passed on each of two fresh launches.
[RCA](../../docs/testing/wake-rca-2026-09-16.md) retains the original stalled-stream evidence.
Physical wake accuracy and overnight/device-change behavior remain hardware
verification; the current calibration panel supports the next operator test.

Scene playback now pauses idle until playback finishes, then starts the full
configured interval. The hidden Developer Mode 30-second cap is removed.
Wake tuning controls show actual numeric package/override values. No operator
sensitivity setting changed. [Current evidence](../../docs/testing/scene-idle-wake-values-2026-09-15.md):
149 focused tests and 32 Windows UI checks passed.

Avatar CRUD fixes remain delivered; [prior evidence](../../docs/testing/avatar-crud-audit-2026-09-15.md)
records immediate deletion, keyboard renaming and consistent Mirror selection.

Console Stop/Abort and automatic Save/check are also complete;
[prior delivery evidence](../../docs/testing/console-stop-save-check-2026-09-15.md) records those checks.

## Historical Windows runtime and workspace — 2026-09-17

- Canonical `C:/Project/magic-mirror`, branch `main`; accumulated delivery is
  recorded in Git history. Preserve local operator data and installed skills.
- Normal dev session **14915**, `http://localhost:5173/`, restarted from canonical
  checkout on **2026-09-17 Asia/Taipei**. Main, Mirror and Console are ready;
  Raven remains active on published **v20**. Its pending edit was saved and
  checked before restart, but not published. The Tools & input inspector is
  open with the saved Raven draft. V11 remains installed in the rig library.
  Isolated QA ended before launch; operator authorized restarts. Persistent
  Private TCP/UDP firewall rules matched the canonical executable. Physical
  sleep and stop-calibration/wake retests remain open.
- Operator config preserved, with Ren's short phrase `施放咒語，下雨`. Per-avatar
  wake/sleep and sensitivity controls are available; video fades default to 0.
- `out/` contains a development build. Rebuild stamped output before Electron
  QA; never overlap QA/full tests with normal Electron. Preserve any new
  unsaved Console edits before restart. See [UI QA](../../.agents/skills/mm-ui-qa/SKILL.md).

## Evidence and limits

- [Avatar management](../../docs/testing/avatar-management-2026-09-15.md): Mirror activation,
  historical first delivery. Its draft-only deletion workflow is superseded by
  the [CRUD audit](../../docs/testing/avatar-crud-audit-2026-09-15.md).

- [Console Stop/Abort and Save/check](../../docs/testing/console-stop-save-check-2026-09-15.md):
  Windows Console 38 checks, profiles/voice 25, developer audio 3, Cubism 181;
  final focused suite 166 tests, web typecheck/build passed. Live queued dialogue
  and physical sound remain operator verification; no phase promotion.

- [Latest persona/spell/fade RCA and checks](../../docs/testing/persona-spell-video-fades-2026-09-15.md):
  real-provider spell QA 3 checks; Console/portrait fade QA 10 checks, 6
  screenshots, 151 opacity/gain samples. Focused tests, web/scoped Node checks
  and build passed. These are historical results for the recorded build.
- [Wake tuning and short-command evidence](../../docs/testing/short-spells-wake-tuning-2026-09-15.md);
  [audio ownership/state table](../../docs/testing/audio-playback-audit-2026-09-15.md).
- Full Node typecheck has pre-existing TS7016 in the QA-artifacts test. Human
  speech accuracy, first-boot wake reproduction, physical speakers/echo and
  hardware/long-run acceptance remain open in TODO.
- Phases 0–3 accepted on Windows; Phase 4 active, unaccepted and untagged.
  Identity → Memory → Field Hardening remain sequential. The 2026-10-03 final
  Mac deployment authority does not change that phase acceptance.
- Current Raven assets: [storage](../../resources/avatar/Raven/README.md),
  [handoff](../../RAVEN-V10-EXPRESSION-FIX-HANDOFF.md). Large ignored source assets need
  separate backup; built-in Ren QA does not establish Raven acceptance.

## Historical Mac field observations — 2026-10-03 19:40–19:43

Recorded before this origin/main merge, from the Phase 0 field build. These
are historical observations, not a current runtime or Raven installation
claim. The user has since confirmed this Mac as the FINAL deployment target.

Recorded machine: Mac mini M6, macOS 27 (Darwin 27.0.0). Branch
`field/macmini-deploy` (pushed): `c43cf66` tooling/records, `6598e07` Mirror
window display targeting. How-to: `deploy/macos/README.md`.

| Component | Status | Evidence / remaining |
|---|---|---|
| Glass (HAOCROWN smart mirror via HDMI) | ✅ working | Portrait, undistorted, upright, no Android bars, no macOS menu bar |
| Board boot recovery (root LaunchDaemon `com.magicmirror.board-hdmi`) | ✅ installed, reboot-tested ×3 | HDMI picture back 82 s / 55 s after `adb reboot` |
| Mirror window on the glass (`MIRROR_DISPLAY=T749`) | ✅ live-verified | Survives board reboot (hide → return); operator monitor never covered |
| Audio: Jabra Speak2 75 = default mic + speaker | ✅ enforced (LaunchAgent `com.magicmirror.audio-prefer`) | Unplug/replug re-enforcement not yet exercised |
| Camera: Arducam 1080P Low Light | ✅ streaming 1920x1080 | Re-aimed: guest in frame, face ≈450 px; still looks up from below (ceiling = top half) — tilt down / mount nearer eye level before Phase 5 tuning |
| App auto-start at login + crash restart | ❌ not set up | App currently started from a session shell; Phase 0 LaunchAgent/KeepAlive work |
| Avatar, voice, wake, identity | ⏳ not built | Phase 3 / 1 / 2 / 5 — glass shows the Phase 0 "DORMANT" placeholder |

### Facts

- **Glass hardware.** HAOCROWN smart mirror: ZC-3568D board (Rockchip
  RK3568, Android 11, build `ZC-3568D-LVDS-HDMI-20240903`), portrait 1080x1920
  LVDS panel, LAN `10.0.0.4` / Wi-Fi MAC `74:24:ca:f1:db:d9`. HDMI-in is an
  RK628D bridge whose EDID is Rockchip's stock default ("RKS" / "T749-fHD720"),
  not a panel name. The Mac picture shows only while
  `com.android.rockchip.camera2/.RockchipCamera2` is in front; the board boots
  to its own launcher and has no boot-to-HDMI setting. Touch on the glass does
  not reach the Mac (vendor manual).
- **Display path.** Mac HDMI 1920x1080@60 (EDID-preferred; macOS defaulted to
  2160p30) rotated 90° in macOS (logical 1080x1920) → board Android landscape
  (`user_rotation=1`) → RockchipCamera2 fills the panel undistorted. Board
  "Systemui Setting" = StatusBar Hidden. Avatar layout (Phase 3) must target a
  **portrait 1080x1920** canvas.
- **Board control.** Board setting "Connect to the computer" opens network adb
  (`10.0.0.4:5555`, no auth prompt). Homebrew adb 37.0.1 aborts on macOS 27
  (`libunwind … invalid compact unwind encoding`) unless run with
  `ADB_MDNS=0 ADB_MDNS_AUTO_CONNECT=0`.
- **Board boot recovery.** `board-hdmi-keepalive.sh` relaunches the HDMI viewer
  when the board sits on its launcher (never over Settings). As a per-user
  LaunchAgent adb got `No route to host` (macOS Local Network privacy, no grant
  offered for the CLI), so it runs as root LaunchDaemon
  `com.magicmirror.board-hdmi` (adb port 5038, root-owned script copy),
  installed by the operator 19:17. Reboot tests: 19:20:59→19:22:04 (82 s),
  19:33:23→19:34:18 (55 s); network adb, rotation and bar hiding survive
  reboots. Log `/Library/Logs/MagicMirror/board-hdmi.log`.
- **Mirror window display targeting** (`6598e07`). `MIRROR_DISPLAY=<label
  substring>` pins the Mirror window to the glass while the operator monitor
  stays main; unset = primary (previous behavior). Pure planner
  `src/main/display-target.ts` (27 tests) + wiring in `src/main/index.ts`.
  HDMI drop-out → window **hidden** (not moved onto the operator monitor) →
  moved back, fullscreen, shown when the display returns; recreated renderers
  keep that state. macOS window level `screen-saver` keeps every app's menu
  bar off the glass. Gate 195/195 tests, typecheck, build. Live:
  `MIRROR_DISPLAY_SELECTED display_id=2 label=T749-fHD720 reason=match`,
  CGWindowList `x=-1080 1080x1920 layer=1000`, clean board screenshot; reboot
  → `FALLBACK reason=target_removed action=hidden_until_return` →
  `REHOMED reason=target_returned` (still layer 1000).
- **Camera.** Arducam 1080P Low Light (UVC, unique ID `0x31000000c450520`,
  up to 1920x1080@30), camera permission authorized. Hung once (UVC probe
  `Unable to send device request`) after killed ffmpeg runs; physical replug
  fixed it. After the operator re-aimed it (19:40) an AVFoundation frame
  shows the guest centered with a clear face (~450 px tall at 1080p) but a
  strong upward angle; frontal, eye-level framing will matter for SFace
  recognition. Test frames were kept only in the session scratchpad and
  deleted.
- **Audio.** Jabra Speak2 75 (CoreAudio UID
  `AppleUSBAudioEngine:Unknown Manufacturer:Jabra Speak2 75:9842AB51A9700254000:1`)
  is default input + output + system output (verified 19:40). Policy:
  DECISIONS 2026-10-03. HID-only enumeration = Jabra off/charging.
- **Operator layout.** ASUS MB16NCG is the macOS main display; the glass is
  extended at `-1080,0`. Never make the glass main while someone works on the
  ASUS (macOS moves their windows under the fullscreen Mirror). Production has
  HDMI only.
- **At the field observation.** App on the glass with `MIRROR_DISPLAY=T749`, started from
  the session shell (not a login item).

### Face test fixtures (operator, 2026-10-03 19:43)

At the operator's explicit request, 6 full-frame 1920x1080 photos of the
operator were captured from the Arducam for later Phase 5 recognition testing
(YuNet/SFace, threshold tuning). Stored **locally only, outside the repo**:
`~/Library/Application Support/MagicMirror/test-fixtures/face/operator-2026-10-03/`
(folder 0700, files 0600) with `MANIFEST.md` (consent statement, capture time,
camera unique ID, SHA-256 per file). Quality: near-frontal, eyes looking down
at a phone, face ≈280 px tall, camera below face height looking up. One frame
of the operator walking away was discarded. Never commit or upload these
images; delete the folder when no longer needed. These are development
fixtures, not production enrollment records (production enrollment follows
Tech Spec §10 with verbal consent and UUID storage). Observation: the burst
stopped after 7 frames while the camera kept working afterwards (clean UVC stop,
0 dropped packets), so the stall is attributed to the ad-hoc capture tool, not
the camera.

### Historical field follow-up list

As recorded before this merge; recheck runtime and installation state before
using these items. The old Phase 0 implementation sequence is superseded by
the incoming complete runtime.

- [ ] **Board dropped off the network at 19:39** (no ping, adb closed; HDMI
  display still present on the Mac). Cause unknown: operator power-off,
  Wi-Fi power saving, or board sleep (`persist.sys.zcsleep` /
  `persist.sys.zcscreenoff` exist in the vendor firmware). If it recurs while
  the glass is on, disable board sleep/Wi-Fi sleep or move the board to
  Ethernet (manual lists a LAN port). The watchdog reconnects by itself.
- [ ] **App auto-start at login + crash restart** (LaunchAgent + KeepAlive;
  `MIRROR_DISPLAY=T749` while the operator monitor is attached). Until then
  the app runs only when started by hand.
- [ ] **Jabra unplug/replug test**: confirm `audio-prefer.log` shows
  `PREFERRED_AUDIO_ABSENT` then `DEFAULT_SET` for input/output/system output.
- [ ] **Camera final mount** near eye level, tilted slightly down, so the frame
  is frontal and mostly the guest area (now: ceiling in the top half).
- [ ] **Recapture face fixtures after the final mount**: looking at the mirror,
  a few head angles, two lighting states. Current set = eyes down, low angle.
- [ ] **Phase 5 recognition check** against the fixtures: YuNet detects the
  face in all 6; SFace self-similarity across frames vs. a non-match baseline.
- [ ] **Review/merge** `field/macmini-deploy` into `main` (no PR opened yet).
- [ ] Optional: replace the ad-hoc burst capture with a proper Console
  "capture test" (Tech Spec §6 Camera preview/capture test, Phase 5).

## Instruction ownership

[AGENTS](../../AGENTS.md) owns execution/invariants; [DECISIONS](../../DECISIONS.md) owns
rulings; [TODO](../../TODO.md) contains open work only. The personal
`roleplay-control-prompts` skill and `C:/Users/b8901/.codex/AGENTS.md` retain the
no-coaching and code-controlled playback lesson. Completed task narratives have
been removed from this handoff; linked test reports retain necessary evidence.


# Magic Mirror — current handoff, 2026-11-15

## Current delivery

**11-16 13:56 minimalist symbolic style deployed:** owner requested clean modern
shapes instead of sophisticated painterly texture/detail. Astra now uses medium
reasoning and meaning-first direction: express spirit through behavior, posture,
emotion or purposeful carrying, not species alone. Scoped active/draft24→25 changes
only Raven Art style; quality and other fields preserved.92tests/build/typecheck,
4 live concept cases and3fresh exports passed. Six prior Drive images deleted as
requested; [three new originals](https://drive.google.com/drive/folders/1Tin39EMvbxbkdH19cqN6SB5fTaHYt_Ak)
uploaded/verified, no rerolls. Chair-answer image passed minimalist/creature/expression
judgments. Runtime ready; prior edge-quality limit remains. [Audit](docs/testing/studio-minimal-symbolism-2026-11-16.md).


**11-16 13:43 Astra creative call deployed:** owner-required `gpt-6-astra` replaces
Sol in versioned Studio concept config (latest official/account catalog verified).
GPT Image Flare renders the images; editable creature direction/style preserved.
72 focused tests, Node typecheck/build and3 real generation runs pass. Original
transparent PNGs uploaded to [Astra review folder](https://drive.google.com/drive/folders/1hbVxZAHuU-rEqIcYzsm-VoSYqM5HRhT9).
Normal runtime ready; source stamp `9386aba8…`. [Audit](docs/testing/studio-creature-direction-2026-11-16.md).


**11-16 13:37 editable creature direction deployed:** owner accepted painterly style,
rejected chair subject. New default selects animals/mythical creatures from selective
meaning rather than literal answer nouns. Operators edit **Avatars → Interactive
Studio → 4 · Picture → Concept direction**, save/publish, then start a new session;
reset follows versioned animal default. Art style and saved version24 configs unchanged.
92 focused tests, typechecks/build, 24 rendered UI checks passed. Live three-default
concepts, custom override and chair-answer creature image passed sampled judgments.
Normal app/audio restored. [Audit and retained failure](docs/testing/studio-creature-direction-2026-11-16.md).


**11-16 owner review samples:** three actual concept/image generations with different
synthetic answers and published version24/medium settings completed. Original
transparent PNGs uploaded to [Drive](https://drive.google.com/drive/folders/1Z5Otqj3KNi3JrDDuItvYQ116h7z-f1JI).
No rerolls, runtime restart or settings changes. Format verified; prior edge-quality
issue remains open pending visual acceptance. Audit appended below.


**Concept-first art deployed 11-15 16:32; visual edge issue remains:** Main now
selects a symbolic concept before rendering; raw answer checklists are removed,
refine/reimagine differ, and Raven active/draft version24 use sophisticated
hand-painted fantasy style. White-border requirements removed. Unrelated settings
and medium/low quality difference preserved. Functional QA: 345 focused tests,
typechecks/build, native-camera Studio26/26 and Conversation image15/15 pass.
Final five-image matrix: all requests/alpha/style/concept checks pass, but clean
edges fail3/5; manual review confirms pale fringes, and sparse sample has wider
glow/tight crop. Strict visual QA is NOT accepted. Failures retained, RAM review
images deleted. Final source stamp `887a8ae2…`, Main/renderer ready; calibrated
audio restored and normal runtime running.
[Plan, reasons, failures and full evidence](docs/testing/studio-art-direction-plan-2026-11-15.md).

**Studio prompts implemented/deployed, 11-15 15:49:** sticker format is separated
from operator art style; custom frames cannot silently omit Art style. Default
photo-likeness contradiction removed, revisions simplified, reflective examples
and new-session help updated. `gpt-image-2.6-flare` deployed; no supported moving
latest-fast alias verified. Checks: 89 prompt/runtime/editor tests + 7 judge-input
tests, full typechecks/build; native-camera guided journey **26/26**. Initial
visual comparison exposed scenery inside the border; after composition correction,
**3/3** affected real engraving/watercolor generation/edit checks passed square,
alpha, medium, border and no-scene criteria via configured visual judge. Earlier
flow pass reused for the final wording-only correction. Final build/Main/renderer
ready, outputs restored; published/draft hashes unchanged. Real-person likeness
and repeated visual reliability unverified. [Plan, failures and evidence](docs/testing/studio-prompt-implementation-2026-11-15.md).

**Photo: several people allowed, deployed 11-15 15:29** (owner: "multiple
people is allowed. we will lock into the nearest people that has the full face";
[ruling](DECISIONS.md)): the still now reports where each clear face is; with several people
the photo is cut to the nearest person whose whole face is in the frame (largest face not
touching the edge, else the largest), at the camera's own pixels, and one person keeps the
whole picture. Only a still with no clear face is refused. The consent line no longer asks the
visitor to stand alone, and the photo prompt names the nearest person as the guest. Checks:
typecheck, helper type-check, 442 focused tests, build; at 1% sound 20 open/capture cycles and
the real-camera conversation 8/8 passed on the new build (stills now carry face boxes; the room
had no face). The owner approved the stop and the build, which also carries the other
operator's uncommitted Studio image-model change (`gpt-image-2.6-flare`), so the build stamp
matches the working folder, not the last commit, until that change is committed.
Not tested: a real still with one or several people, so the cut itself is proven only by tests.
[Evidence](docs/testing/camera-paths-highest-resolution-2026-11-14.md).

**Camera gates simplified and a daylight defect fixed, 11-15 14:37** (owner: "high resolution
but not unnecessary gates"; [ruling](DECISIONS.md)): the helper picks the camera's best mode
within the snapshot limit and keeps one resolution check (delivered frame = selected mode);
Main's and the photo path's extra full-HD rejections are removed; the one-face photo rule was
unchanged then (superseded above). The daylight run then showed that Raven could not answer camera questions since the
11-14 HD change: the 359 KB picture exceeded the Realtime message limit (~256 KiB) and the send
was refused silently (it passed at night with a small picture). Main now fits that picture
(full size, lower JPEG quality first) and a refused send is reported and spoken. Checks at 1%:
410 focused tests, typecheck, build, native recovery, 20 cycles, real-camera conversation 8/8
after two retained failures. Photo path with a person still untested.
[Evidence](docs/testing/camera-paths-highest-resolution-2026-11-14.md).

**Highest-resolution path enforcement, 11-14 20:33 (partly superseded above):** native capture now refuses
input/output below the selected maximum and never resizes snapshots; Main and
Conversation/Studio photo validation reject sub-HD. Current camera: 1920×1080
NV12 near 5 FPS. Fresh evidence: 296 focused tests, typechecks/build, production
USB recovery, **20/20 reopen cycles / 27 HD snapshots**, real-camera Conversation
**8/8**, and default Studio with real image generation/revision **26/26** pass.
Real-person photo-reference/retake runs await a consenting person (last native
samples: zero faces); those paths are not claimed live-passed. Normal app restored,
output reset/readback passed. [Changes, evidence and next real runs](docs/testing/camera-paths-highest-resolution-2026-11-14.md).

**USB camera audit, 11-14 evening (Codex):** Arducam now enumerates. Per the
owner's updated request, production selects maximum resolution near 5 FPS:
actual **1920×1080 NV12**. **30-minute normal-processing soak passed** with
30/30 decoded HD snapshots, zero stale timestamps/resets/restarts; source/receipt
gaps 184/381 ms. Production HD recovery also passed (six snapshots before/six
after targeted reset, fresh frames in 4.682 s). Fixed production timestamp
freshness and the QA executable guard's shell-argument false positive. 217 focused
tests, typechecks and build pass. Real-camera consent/room-description journey
passed 8/8 with synthetic speech; physical speech at 1% failed before capture
(camera wake/sleep ownership passed). Normal app restored 19:32, outputs restored;
portrait likeness/reboot/days-long acceptance excluded. [Audit and retained failures](docs/testing/usb-camera-audit-2026-11-14.md).
Earlier compact repository/Claude knowledge: [index](docs/testing/claude-knowledge-2026-11-14.md).

**Codex harness updated 11-10:** user-wide Astra orchestration, Sol implementation
and Terra computer-use roles; catalog-resolved local aliases with login/hourly
refresh. Two redundant skill entrypoints retired; useful details retained;
project skill entrypoints 38% smaller. Invariants and app runtime unchanged.
[Audit, checks and limits](docs/testing/codex-harness-audit-2026-11-10.md).
New Codex sessions use the installed defaults; existing chats retain their model.

Runtime: `field/macmini-deploy` at the commit with this handoff. Canonical Mac, user
LaunchAgent, macOS 27.2.1 since the owner's upgrade and reboot at 18:13 Taipei 11-14. The app is
running (agent's START 16:32:36 11-15 after the concept-first art change, no loop playing); the
16:30 11-15 build is deployed and matches this commit (stamp checked 11-16 13:04; Codex's Studio
work above was committed by Claude on the owner's word, 11-16);
speakers at the defaults
(Jabra 80% in normal playback and in its call volume, A1 65%, Edifiers 50%, Mac mini speaker 1%).
A1 joined again at 14:44:35 and 15:04:46 (below). Products and stories: [PRD](PRD.md); open work:
[TODO](TODO.md); rulings: [DECISIONS](DECISIONS.md). Previous handoff:
[archived 11-14](docs/archive/progress-before-sound-system-2026-11-14.md).

**Speakers after the macOS 27.2.1 upgrade, 11-14 evening:** the 18:14 start had only the Jabra
(`music_output_airplay_not_found`, no A1). macOS now enforces Local Network privacy on Airfoil,
which had no recorded choice: its Bonjour search was refused (`-65570`) while both Edifiers
answered on the network. An Airfoil relaunch raised the dialog; the owner pressed Allow at 18:29
and both Edifiers and A1 joined within a minute. 1% check 18:35–18:38 on the production app:
cold VIDEO LOOP settled the route in 2.3 s (two Edifiers, A1 after its hold at 18:36:37, TV
display `reason=match`), then MUSIC LOOP played 5 tracks; app markers and Airfoil state only,
nothing was recorded or heard by the agent, the TV picture was not looked at. The agent's STOP
inside its own lease was refused, so MusicLoop played ~17 s at normal level before the second
STOP. Runbook: [Stream Deck](deploy/macos/stream-deck.md) "Edifier not listed".

**A1 runs flat, 11-15:** A1 reports its battery to macOS (Bluetooth log, "Battery changed"):
100% at 18:30 11-14, falling about 10% per 1.4 h to 30% at 03:00, link ended from A1's side at
04:24:55 (reason 10721). It linked again at 13:55:44 at 30%, joined after its hold at 14:04:57
and went off again at 14:08:15 while MUSIC LOOP played. So A1 is not charging; the app and
Airfoil are not the cause. Owner: check A1's charger and cable. The app logs nothing when A1
drops (gap, no marker yet). When A1 is on and linked, Main connects it at its 10 s check and it
joins after the 6.5 min hold without a START. Seen in the middle of a run: the owner switched
A1 on at 14:37:58 (owner: "A1 has auto sleep"), Main connected it at 14:38:01 and it joined at
14:44:35; it reported 30% again. Auto sleep versus a flat battery is not separated: ~10 h
linked without music before the 04:24 drop fits the battery trend better than a sleep timer.
It linked once more at 14:58:03 and joined at 15:04:46, and its battery now rises (30% at
14:47, 50% at 14:58, 60% at 15:25), so it is charging again.

**Stream Deck page lost during a loop, 11-14** ([evidence](docs/testing/stream-deck-page-2026-11-14.md)):
the main profile was marked default, and Stream Deck selects the default profile whenever
another app comes to the front, so the Music page fell back to the main keys (no VOL±), and
MUSIC LOOP then restarted the music. Fixed: no profile is marked default (proven on/off/on
with the plugin's new page log `deck.log`); MUSIC LOOP keeps a playing subfolder (live at 1%).
Rapid-press audit of 09:46:54–09:47:31: a VOL− press brought its own helper app to the front,
the main keys came back under the finger and three presses meant for VOL− started DANCE FLOOR;
same cause, same fix. The queue and its 3 s same-key debounce worked. One gap closed: a folder
key pressed again keeps its playing folder (live at 1%, 16:51).
Rulings: DECISIONS 2026-11-14. Owner's own presses 17:02:40–17:05:35: MUSIC LOOP showed the
Music page and it stayed until the STOP key (`deck.log`); app switching and rapid VOL− at the
physical keys are not yet confirmed. Stream Deck updated to 7.6.1 at 17:55 (owner's request);
profiles, no-default setting, plugin and the page test re-verified on it.

**Open from the owner's test 17:05, 11-14** ([measurements](docs/testing/video-loop-start-2026-11-14.md)):
- VIDEO LOOP from STOP: "short sound first, then it plays later". The app's output is
  continuous; A1 and the Edifiers start ~2.3 s later without a burst; the Jabra appears to start
  ~1 s ahead of them, not observable with its own microphone. Cause not established, nothing
  changed. Needs a non-Jabra microphone (owner: tests at 1% only).
- TV without picture 16:57–17:07 while the Mac rendered: the HDMI link to the board was down
  (board receiver errors), probably set off by the agent's System Information /
  `system_profiler`; not proven. Do not run those here.

**Sound system 11-14** ([investigation, evidence and limits](docs/testing/sound-system-2026-11-14.md)):
- **Edifiers missing (09:05):** the Mac's Wi-Fi link (6 GHz multi-link, Orbi RBE771, up 5 d 18 h)
  received no group (multicast) traffic while unicast worked, so Airfoil, which finds AirPlay
  speakers only by Bonjour group replies, listed neither. Both speakers were healthy. The
  owner's reboot cured it at once. Router vs Mac is not separated: the system log did not reach
  back to the onset.
- **Deployed fallback:** when no Edifier is listed, Main asks by the unicast-reply path and
  announces the speakers to the Mac's own Bonjour (`src/main/airplay-bonjour.ts`). 31 tests,
  typecheck, build; the 15:48 START joined both Edifiers in 2.2 s with no fallback marker.
  Listing a local record in Airfoil is proven; connecting and playing through one is **not**
  (Airfoil merges a second record for a visible speaker).
- **Installed watch:** root LaunchDaemon `com.magicmirror.net-watch` (every 5 min, owner chose
  self-heal: Wi-Fi off/on when blind and the app is not running). Log
  `/Library/Logs/MagicMirror/net-watch.log`; first line `state=ok`. Heal path not exercised.
- **Second Edifier (621E):** was 112 ms behind the first; Airfoil offset −0.130 s leaves it
  6–13 ms behind (measured, three runs). Not heard by a person.
- **A1 silent after a reboot:** the designed 6.5 min hold after Airfoil reconnects it; it joined
  at 11:54:25 by itself. No change.

Earlier delivery, detail in the archived handoff and the linked reports:
- 11-08/09 speaker sync: split Music/Capture driver (2 s echo), STOP keeps the Jabra and A1
  connected (A1 late after START), a loop pressed from STOP waits for the final route.
  [Evidence](docs/testing/airfoil-sync-2026-11-08-followup.md).
- 11-08 audit fixes across Raven, the loops and Studio
  ([report](docs/testing/audit-fixes-2026-11-08.md)); Jabra call-path volume reset at the first
  conversation ([report](docs/testing/jabra-call-volume-2026-11-08.md)).
- 11-07 speaker levels, A1 settle hold, online songs in Dormant, Jabras sit out music while
  their microphone is open ([evidence](docs/testing/online-songs-2026-11-07.md)).

## Last observed runtime — not a live health guarantee

- 11-15 16:32:36 START after the concept-first art build: Main/renderer ready, TV display
  `reason=match`, route settled in 2.2 s. Still running 11-16 13:04; levels read back at the
  defaults (Jabra 80%, A1 65%).

- 11-15 15:49:46 START after final Studio prompt build: Main/renderer ready, target TV
  matched, audio route settled in 2.267 s. QA speaker restore/readback passed; saved
  published and draft settings unchanged. Build stamp matches final source/output.

- 11-15 14:37:09 START after the camera work: Main/renderer ready, TV display `reason=match`,
  route settled in 1.1 s with the Jabra and both Edifiers, no A1 (off since 14:08:15); levels
  read back at the defaults (Jabra 80%). Owner's own STOP was at 14:18:29.
- 11-15 14:04:57 A1 joined after its hold; Airfoil: Jabra, A1 and both Edifiers connected,
  MUSIC LOOP playing since 14:01:43 (owner). Codex's camera work committed as `090b410` after
  typecheck and its eight changed test files (202 tests) passed again.

- 11-14 20:33 production restored after strict-HD path testing; speaker restoration
  passed. Real-person photo-reference tests await physical availability.

- 11-14 19:32 production restored after HD camera QA: Main/renderer ready, named TV
  display matched, music route settled in 2.3 s, two speakers reconnected. Calibrated
  output restoration passed. Camera owns no worker while Dormant by design.

- 11-14 18:38 app stopped by the STOP key; levels read back at the defaults (Jabra 80%, A1 65%);
  Airfoil keeps the Jabra and A1 connected, Edifiers released. `net-watch` `state=ok` at 18:29.
- 11-14 17:45 app stopped after the VIDEO LOOP measurements (17 starts 17:21–17:45, all found
  the named TV display); levels read back at the defaults (Jabra 80%, A1 65%); Airfoil keeps
  the Jabra and A1 connected, Edifiers released; recordings deleted, RAM disk removed.
- 11-14 16:58 START: both Edifiers joined, route settled in 2.4 s; owner test 17:02–17:06
  (MUSIC LOOP, folder 1, STOP, VIDEO LOOP from STOP). TV dark 16:57–17:07 (HDMI link, above).
- 11-14 16:51, 1% check: repeated folder-key presses kept the song; 16:38: MUSIC LOOP kept a
  playing folder. 15:48:57 START on the fallback build: route settled in 2.2 s, no fallback
  marker; `net-watch` `state=ok`.
- 11-14 11:47 cold boot: both Edifiers joined in 5 s; A1 joined after its 6.5 min hold.
- Focused checks 11-14: 31 tests in the three music-output files, 151 in the music and
  operator files, typecheck, build (16:50). The full
  unit suite was last run 11-08 (151 files / 2364 tests); the six `phase4-qa-runner` cases
  still fail intermittently in the first full run after a build and pass alone (TODO).

## Next work / unresolved boundaries

0. After the macOS 27.2.1 upgrade (done 11-14 18:13; music route, Airfoil permission, TV
   display match, `net-watch` and the board adb daemon checked): still to confirm at the Neo are
   that no Stream Deck profile is marked default and the main keys show, and a conversation
   (microphone, camera markers). A1 is silent for 6.5 min after a reboot by design.
0a. A1 (above): owner checks A1's charger and cable and its auto-sleep setting (battery fell
   from 100% to off in ~10 h and reads 30% at each return);
   a marker when a Bluetooth speaker drops is still missing.
0b. Camera: photo-reference Conversation and Studio runs with consenting people, one and
   several in view (the several-people cut is deployed but proven only by tests).
1. VIDEO LOOP start sound and the dark TV (above): a non-Jabra recording of two VIDEO LOOP
   starts from STOP, or the owner's go-ahead for three starts at normal volume through the A1's
   microphone. No fix exists yet.
2. Owner, at the Neo: on the Music page press VOL− quickly several times and use the Mac
   (switch apps): the page must stay; MUSIC LOOP or the folder key again must not restart the song.
3. Owner go-ahead for a simulated-fault test (temporary firewall rule dropping incoming group
   traffic on Wi-Fi): proves the Edifier fallback and whether playback survives the fault.
4. At the next real fault: `/Library/Logs/MagicMirror/net-watch.log` (onset, roam count, heal
   result) and whether another 6 GHz client sees the speakers. Prevention is a wired LAN port
   for the Mac or leaving the 6 GHz multi-link network.
5. Owner, in the room at real volume: an online song and a loop on every speaker, the second
   Edifier included (no voice wake while music plays; use STOP); music during a conversation
   comes only from A1 and the Edifiers.
6. Owner, physical (carried from 11-01): press each Neo key once, including the Playback page;
   the USB camera has now passed the HD soak and recovery checks above.
7. Open items in [TODO](TODO.md), notably "Online songs" and "Airfoil sync".

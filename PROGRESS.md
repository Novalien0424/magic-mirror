# Magic Mirror — current handoff, 2026-11-14

## Current delivery

**Replacement camera work, 11-14 (Codex):** compact repository/Claude handoff
knowledge retained in [this index](docs/testing/claude-knowledge-2026-11-14.md).
Production and native QA now select the sole external USB camera instead of
hard-coding Arducam; minimum-mode QA derives expected dimensions/rate from
advertised descriptors instead of assuming 96×96/5. 116 focused camera tests,
TypeScript and Swift typechecks pass. **Source only, not deployed:** build was
blocked by `electron_owner_busy`, then `electron_already_running` during separate
sound work ([logs](.artifacts/camera-replacement-2026-11-14/)). At 17:29 Taipei,
after owner-confirmed replug, macOS still lists zero cameras and only three USB
hubs, Jabra and Stream Deck. Physical capture/recovery remain unverified; next:
resolve USB enumeration, then build and run native delivery/stability/cycle QA
when the shared runtime is available. Preserve the other operator's runtime.

**Codex harness updated 11-10:** user-wide Astra orchestration, Sol implementation
and Terra computer-use roles; catalog-resolved local aliases with login/hourly
refresh. Two redundant skill entrypoints retired; useful details retained;
project skill entrypoints 38% smaller. Invariants and app runtime unchanged.
[Audit, checks and limits](docs/testing/codex-harness-audit-2026-11-10.md).
New Codex sessions use the installed defaults; existing chats retain their model.

Runtime: `field/macmini-deploy` at the commit with this handoff. Canonical Mac, user
LaunchAgent, macOS 27.2.1 since the owner's upgrade and reboot at 18:13 Taipei 11-14. The app is
stopped (18:38, STOP key after the 1% loop check); the build made 16:50 is deployed and the next START runs it; speakers at the defaults (Jabra 80% in normal playback and in its call volume, A1 65%,
Edifiers 50%; Mac mini speaker 1%). Products and stories: [PRD](PRD.md); open work:
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
   the camera is damaged.
7. Open items in [TODO](TODO.md), notably "Online songs" and "Airfoil sync".

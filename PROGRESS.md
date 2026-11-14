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
LaunchAgent. The app is stopped (17:45 Taipei 11-14, after the owner's test and the agent's
VIDEO LOOP measurements); the build made 16:50 is deployed and the next START runs it; speakers at the defaults (Jabra 80% in normal playback and in its call volume, A1 65%,
Edifiers 50%; Mac mini speaker 1%). Products and stories: [PRD](PRD.md); open work:
[TODO](TODO.md); rulings: [DECISIONS](DECISIONS.md). Previous handoff:
[archived 11-14](docs/archive/progress-before-sound-system-2026-11-14.md).

**Stream Deck page lost during a loop, 11-14** ([evidence](docs/testing/stream-deck-page-2026-11-14.md)):
the main profile was marked default, and Stream Deck selects the default profile whenever
another app comes to the front, so the Music page fell back to the main keys (no VOL±), and
MUSIC LOOP then restarted the music. Fixed: no profile is marked default (proven on/off/on
with the plugin's new page log `deck.log`); MUSIC LOOP keeps a playing subfolder (live at 1%).
Rapid-press audit of 09:46:54–09:47:31: a VOL− press brought its own helper app to the front,
the main keys came back under the finger and three presses meant for VOL− started DANCE FLOOR;
same cause, same fix. The queue and its 3 s same-key debounce worked. One gap closed: a folder
key pressed again keeps its playing folder (live at 1%, 16:51).
Rulings: DECISIONS 2026-11-14. Not yet confirmed with a physical key press.

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

- 11-14 16:38, 1% check on the production app: MUSIC LOOP, folder 1, MUSIC LOOP again kept
  the folder playing; route settled in 2.3 s; STOP; levels at the defaults.
- 11-14 15:48:57 START on the new build: both Edifiers joined, route settled in 2.2 s, A1 at
  once (kept connected), no fallback marker; `net-watch` `state=ok`. Owner STOP 16:08. Before it, 15:30–15:44:
  three chirp runs at measurement level, levels read back at the defaults.
- 11-14 11:47 cold boot: both Edifiers joined in 5 s; A1 joined after its 6.5 min hold.
- Focused checks 11-14: 31 tests in the three music-output files, 95 in the music and
  operator files, typecheck, build. The full
  unit suite was last run 11-08 (151 files / 2364 tests); the six `phase4-qa-runner` cases
  still fail intermittently in the first full run after a build and pass alone (TODO).

## Next work / unresolved boundaries

0. Owner, at the Neo: MUSIC LOOP, a folder key, then use the Mac (switch apps) for a while:
   the Music page must stay; MUSIC LOOP again must not restart the song.
1. Owner go-ahead for a simulated-fault test (temporary firewall rule dropping incoming group
   traffic on Wi-Fi): proves the Edifier fallback and whether playback survives the fault.
2. At the next real fault: `/Library/Logs/MagicMirror/net-watch.log` (onset, roam count, heal
   result) and whether another 6 GHz client sees the speakers. Prevention is a wired LAN port
   for the Mac or leaving the 6 GHz multi-link network.
3. Owner, in the room at real volume (all QA ran at 1%): an online song and a loop on every
   speaker, the second Edifier included (no voice wake while music plays; use STOP); music
   during a conversation comes only from A1 and the Edifiers.
4. Owner, physical (carried from 11-01): press each Neo key once, including the Playback and
   Music pages; the camera is damaged.
5. Open items in [TODO](TODO.md), notably "Online songs" and "Airfoil sync".

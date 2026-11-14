# Magic Mirror — current handoff, 2026-11-14

## Current delivery

**Codex harness updated 11-10:** user-wide Astra orchestration, Sol implementation
and Terra computer-use roles; catalog-resolved local aliases with login/hourly
refresh. Two redundant skill entrypoints retired; useful details retained;
project skill entrypoints 38% smaller. Invariants and app runtime unchanged.
[Audit, checks and limits](docs/testing/codex-harness-audit-2026-11-10.md).
New Codex sessions use the installed defaults; existing chats retain their model.

Runtime: `field/macmini-deploy` at the commit with this handoff. Canonical Mac, user
LaunchAgent. The app is running in START (owner reboot 11:47, STOP 15:26 for the work below,
START 15:48:57 Taipei 11-14) on the build made 15:28; speakers at the defaults (Jabra 80% in
normal playback and in its call volume, A1 65%, Edifiers 50%; Mac mini speaker 1%). Products
and stories: [PRD](PRD.md); open work: [TODO](TODO.md); rulings: [DECISIONS](DECISIONS.md).
Previous handoff: [archived 11-14](docs/archive/progress-before-sound-system-2026-11-14.md).

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

- 11-14 15:48:57 START on the new build: both Edifiers joined, route settled in 2.2 s, A1 at
  once (kept connected), no fallback marker; `net-watch` `state=ok`. Before it, 15:30–15:44:
  three chirp runs at measurement level, levels read back at the defaults.
- 11-14 11:47 cold boot: both Edifiers joined in 5 s; A1 joined after its 6.5 min hold.
- Focused checks 11-14: 31 tests in the three music-output files, typecheck, build. The full
  unit suite was last run 11-08 (151 files / 2364 tests); the six `phase4-qa-runner` cases
  still fail intermittently in the first full run after a build and pass alone (TODO).

## Next work / unresolved boundaries

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

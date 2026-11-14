# Magic Mirror — current handoff, 2026-11-14

## Current delivery

Runtime: `field/macmini-deploy` at the commit with this handoff (the 11-10 Codex harness
changes are still uncommitted in the working tree). Canonical Mac, user LaunchAgent. The app is running in START (owner reboot 11:47,
STOP 15:26 for the work below, START 15:48:57 Taipei 11-14) on the build made 15:28 from that
working tree; speakers at the defaults (Jabra 80% in normal playback and in its call volume,
A1 65%, Edifiers 50%; Mac mini speaker 1%). Products and stories: [PRD](PRD.md); open work:
[TODO](TODO.md); rulings: [DECISIONS](DECISIONS.md). Previous handoff:
[archived 11-01](docs/archive/progress-before-online-songs-2026-11-07.md).

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
- Next: owner go-ahead for a simulated-fault test (temporary firewall rule) to prove the
  fallback and whether playback survives without group traffic.

**Fixed/deployed 11-08 — speaker sync** ([evidence and limits](docs/testing/airfoil-sync-2026-11-08-followup.md)):
- **Two-second echo:** the old "Magic Mirror Music" device was both what apps play into and what
  Airfoil listened to, so its 2.081 s picture delay leaked into Airfoil's timing for the Jabra
  and A1 whenever Core Audio loaded it. The driver now has output-only **Magic Mirror Music**
  (keeps the picture delay) and input-only **Magic Mirror Capture** (Airfoil's source, zero).
  Re-checked 21:00: Jabra–Edifier +2/+4 ms. Offsets Computer 0.222, A1 0, Edifier −0.108; `mmlt` 99888.
- **A1 late after START:** reconnecting the Jabra in Airfoil restarts A1's ~6 min glide
  (+134 ms at first); STOP released the Jabra. STOP now keeps the Jabra and A1 connected and
  releases only the Edifier; a Jabra rejoin re-settles A1 (`music_output_bluetooth_resync_computer_joined`).
  Proved with the real route and music helper: A1 −1/+21/+17/−21 ms from the first block.
  14 route tests, typecheck and build pass. Not yet seen: a real Stream Deck START.
- **Loop pressed from STOP (11-09):** it played ~0.5 s on the temporary direct speakers, stopped
  while the route moved to Airfoil, then restarted; the Edifier joined ~10 s later. Its sound
  now waits for the final route with the Edifier joined (`music_output_route_settled`, ~2 s
  after start, bounded). Live at 1% on the production app: VIDEO LOOP and MUSIC LOOP each
  started only after the route settled, with no fallback warning. Not yet heard by a person.
- The superseded [debug log](docs/testing/airfoil-sync-2026-11-08-debug-log.md) and
  [brief](docs/testing/airfoil-sync-2026-11-08.md) are kept as history.
  `music_output_airplay_unreachable` / `_not_found` / `_restored` were unit-tested, not forced live.

Audit and fixes 11-08 (owner: "clean up; audit loops, Raven and Studio; fix everything; commit,
push, deploy"):

- 292 MB of old test artifacts moved to the Trash; a leaking unit test fixed.
- Audit fixes across Raven (farewell talked over, online-song fallback, searched-only YouTube),
  the loops (START after a failed loop, reload re-arm, Airfoil retries, player restart, Dance speaker
  reset) and Studio (Main deadlines, per-visit settings, name confirmation, image retry and pause,
  abandoned visit, End this visit).
- Rulings: DECISIONS 2026-11-08. Report:
  [audit fixes](docs/testing/audit-fixes-2026-11-08.md).
- Live QA at 1%: all pass except `youtube_modes` (the model plays an explicit loop request as once; TODO).

Fixed 11-08 (owner: Raven started very quiet and STOP did not help): the Jabra has a separate
call-path volume, set only during a call. The 11-07 night's 1% sound work had left it muted, and
START/STOP resets run outside a call. The first conversation after each start/START/STUDIO now resets it to
the Jabra's normal level (`stop-state --reset-voice`; QA runs skip it). Silent tests on the real
Jabra passed; still to confirm with a real visitor.
[Report](docs/testing/jabra-call-volume-2026-11-08.md).

Delivered 11-07 (commits c38dab7 → fce46fd):

- **Speaker levels and sync:** levels calibrated to the Jabra and owner-tuned (Jabra 80%,
  A1 65%, Edifier 50%), and VOL+ can take every speaker to 100%. START, STOP and VIDEO LOOP
  reset the defaults. Airfoil sync was re-tuned for the linked second Jabra.
  [Runbook](deploy/macos/stream-deck.md#speaker-levels-calibrated-2026-11-07).
- **A1 Bluetooth:** a freshly connected A1 is held silent for 6.5 min while Airfoil's sync
  settles; it (and since 11-08 the Jabra) stays connected through STOP. The settle resumes across a quick STOP/START.
- **Online songs:** natural wordings (幫我在雲上找, 幫我再網路上找, 在 YouTube 上找, 上網查查…)
  unlock the online search. A requested song always plays: the app plays YouTube's first
  result if the model only answers. While the song plays Raven is Dormant and stays Dormant
  after it; the picture fills the mirror, centred, and plays at full scale so the speaker
  levels set the loudness. Odd result labels no longer fail the whole search.
- **Sync over voice control (owner ruling):** the Jabras play about 150 ms early whenever
  their microphone is open. So every song or loop handed to Dormant plays with the wake
  listener off, and STOP ends it. During a conversation the Jabras sit out the music, which
  plays on A1 and the Edifier. STOP quits the app, so the next key starts with the mic working.
  [Evidence](docs/testing/online-songs-2026-11-07.md).

## Last observed runtime — not a live health guarantee

- 11-07 night, real QA runs at 1%: `cloud_songs` (the owner's two sentences) passed in the
  last two runs. `local_loop` and `youtube_modes` (online loop) passed on their latest runs:
  no wake listener during the loop, then an operator stop and a fresh conversation. Earlier
  failures, all retained in the [evidence](docs/testing/online-songs-2026-11-07.md): the
  model asked instead of playing, a weak local match, and the YouTube search label failure.
- Live in production at 1%: MUSIC LOOP (Jabra mic closed) → STOP (app gone) → START (Jabra
  mic open) → STOP (black, TV standby, levels reset). Speakers restored to the defaults
  afterwards.
- Unit suite 151 files / 2364 tests pass. The six `phase4-qa-runner` cases still fail
  intermittently in the first full run after a build and pass alone (TODO).

## Next work / unresolved boundaries

1. Owner, in the room at real volume (all QA ran at 1%): an online song and a loop on every
   speaker (no voice wake while music plays; use STOP); music during a conversation comes
   only from A1 and the Edifier.
2. Owner, physical (carried from 11-01): press each Neo key once, including the Playback and
   Music pages; the camera is damaged.
3. Open items in [TODO](TODO.md), notably "Online songs" (local media still resumes the
   conversation and its video sound stays on the Jabra; the mini's tool preambles; the runner
   flake) and "Airfoil sync" (A1 wanders on its weak link; the TV is outside the Airfoil group).

# Magic Mirror — current handoff, 2026-11-08

## Current delivery

Runtime: `field/macmini-deploy` at the commit with this handoff. Canonical
Mac, user LaunchAgent. The app is stopped (owner STOP 09:21 Taipei 11-08; afterwards only QA apps,
the last one ended about 12:30); speakers at the defaults (Jabra 80% in normal playback and in its
call volume, A1 65%, Edifier 50%; Mac mini speaker 1%). The build with all fixes is deployed (`out/`,
`stop-state`); the next START runs it. Products and stories: [PRD](PRD.md); open work: [TODO](TODO.md); rulings:
[DECISIONS](DECISIONS.md) (2026-11-07 entries). Previous handoff:
[archived 11-01](docs/archive/progress-before-online-songs-2026-11-07.md).

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
  settles, and it stays connected through STOP. The settle resumes across a quick STOP/START.
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

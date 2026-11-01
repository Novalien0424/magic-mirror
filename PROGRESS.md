# Magic Mirror — current handoff, 2026-11-01

## Current delivery

Runtime: `field/macmini-deploy`. Canonical Mac, user LaunchAgent; the app is stopped
(STOP 20:15 11-01 after evening QA; TV in standby behind the black cover; speakers 70%). Products and stories: [PRD](PRD.md); open work: [TODO](TODO.md);
night goal G1–G15 ledger: [journeys](docs/testing/user-journeys-2026-10-31.md#night-goal-ledger-moved-from-todo-2026-11-01). Previous detail:
[archived handoff 10-31](docs/archive/progress-before-night-qa-2026-11-01.md) ·
[journeys and results](docs/testing/user-journeys-2026-10-31.md).

Delivered 10-31 → 11-01 (commits 41b684f, f59c5e4, 41229ce and the night commit):

- **All music in sync through Airfoil (11-01 afternoon):** the Edifier is on Wi-Fi/AirPlay;
  every music source plays into the new virtual output "Magic Mirror Music"
  ([music-device/](deploy/macos/music-device/), installed with the owner's admin password), and
  Airfoil (licensed) plays it on the Jabra, A1 and the Edifier. Main's
  [airfoil-route](src/main/airfoil-route.ts) connects/reconnects speakers and falls back to the
  direct group. Measured, not by ear ([speaker-sync/](deploy/macos/speaker-sync/), a second
  Jabra as mic, an iPad memo for the Jabra): Edifier +0.8 ms and A1 +26 ms from the Jabra;
  total 2148 ms, reported to Chromium so VIDEO LOOP/YouTube pictures wait for the sound.
  Calibration record: runbook "Airfoil music route".
- **Evening 11-01 (owner away, automated):** TV picture delay measured without a mic
  ([tv-picture/measure.sh](deploy/macos/speaker-sync/tv-picture/measure.sh): 68/67/62 ms) and
  compensated: Magic Mirror Music now reports 2081 ms (audio 2148 − picture 67). MusicLoop's
  re-sync pause is skipped on the Airfoil route; YouTube keeps 5 recorded results out of 10;
  a STOP-cancelled Dance start is silent; button logs keep the speaker helper's own reason.
  Runbooks (Stream Deck, buttons, Mac) audited against the code; owner-check wake test fixed.
  Owner decisions done: mini kept; persona v23 (short in-character refusals; v22 rollback);
  Studio picture-hold setting retired; owner wake test run (synthetic visitor never detected,
  even without media: needs a human). 276 QA runs archived and deleted.
  [Audit record](docs/testing/prd-audit-2026-11-01.md).
- **Neo / Stream Deck:** three-profile package (main "Magic Mirror copy 3", Playback,
  Music). Cause of the Neo silently showing old keys: an older copy held Stream Deck's
  default-profile mark (`AppIdentifier *`), applied at launch and on focus changes.
  copy 3 is now the default and the obsolete copies are deleted; the runbook's "After
  every import (required)" step prevents a repeat. 11-01: VIDEO LOOP and MUSIC LOOP fell
  back to the main keys about 1 s after the press. Cause: the mirror window activated
  Electron, and Stream Deck selects the default profile on any focus change. Fixed: the
  mirror shows without focus. The press paths were checked with no focus change; a
  physical press is still the owner's check.
- **VIDEO LOOP:** cold start fixed; loop re-reads reuse the verified local copy instead
  of checking Google Drive per range request; each wrap logs
  `OPERATOR_LOOP operator_loop_wrapped wraps= dropped=` (QA: 0, 0, 2 dropped frames).
- **MUSIC LOOP:** independent of the TV; file-name order; Music page (3 folder keys
  titled by the Magic Mirror Controls plugin, PREV/NEXT, VOL±, STOP); unreadable Drive
  folders skipped; optional 1.2 s Bluetooth re-sync pause between songs. A rejoining
  speaker (A1) joins mid-song at the Jabra's level; a half-ready join keeps the music on
  the other speakers and retries with back-off (5 s doubling to 5 min,
  `operator_loop_music_route_kept`). QA no longer overwrites the Neo's folder titles.
- **TV board:** standby made the board retry deep suspend every ~10 s, cycling Ethernet
  and the HDMI bridge until they wedged. A root wakelock before every TV operation plus
  the owner-installed two-minute keep-awake tick; 10-31 22:38 → 11-01 01:09 standby:
  900 of 900 pings answered, wakelock held throughout.
- **STOP / TV mouse:** a mouse client ignoring EXIT is ended (own process only).
- **Conversation:** a spell that cut the previous scene's line before any audio no
  longer stalls 8 s and closes the visit (`scene_dialogue_cancel_failed`); YouTube
  search tolerates media fields copied from other tools (`tool_arguments_trimmed`) and
  skips live/upcoming broadcasts; local search ignores scope and loop words
  ("我們 寶庫 … 循環") as title clues.
- **QA harness:** YouTube loop reload states, long online videos, memory realtime and
  pipeline (introduction → delivered question → answer), spells refusal wait, closed
  audio contexts in the lifecycle tap.

## Last observed runtime — not a live health guarantee

- 16:05–16:10 Taipei 11-01, build with the Airfoil route, through the real button paths at
  70%: START, VIDEO LOOP, MUSIC LOOP, NEXT, PREV, VOL+, VOL−, folder key 1 (84 songs), MUSIC
  LOOP, CONSOLE, DESKTOP, STUDIO, DANCE, VIDEO LOOP: every outcome success; music and Dance
  routed through Airfoil (`outputs=1`, `music_output_airfoil_ready`), Edifier at the Jabra's
  70%. START/MUSIC LOOP logged `jabra_output_reset_failed` because a second Jabra was attached.
- 17:49 11-01: the owner unplugged the second Jabra and pressed STOP: `stopped`, speakers
  `jabra_output_70`, Airfoil left with no speaker connected and the route flag removed.
- 19:51–20:15 11-01, new build, real button paths, speakers held at 1% (Dance under a 1%
  guard): START `started` (Airfoil: Computer + Edifier; A1 off Bluetooth), MUSIC LOOP
  `music_preparing` (song 1 → 2 with no re-sync pause), VIDEO LOOP `loop_playing`, DANCE
  `dance_preparing`, STOP `stopped` (`tv_standby`, `blackout_covered`, `jabra_output_70`).
  Speakers restored: Jabra 70% (`stop-state --reset-output`), Mac mini speaker 1%.
  Unit suite 150 files / 2323 tests pass.

QA on the final builds (outputs at 1%, speakers back to 70%): full unit suite 2952
passed (2 skipped), typecheck clean. Phase 4: all 22 modes run; after fixes `--live`,
`--spells-live`, `--memory-live`, `--media-skill`, `--operator-loop`, default pass;
`--lifecycle-live` and `--memory-conversation` remain model-rate failures. Raven: 18
scenarios; after fixes `default_fallback`, `spell_control`, `sleep_spells` and the
YouTube runner pass. Remaining provider rates are listed in TODO ("Provider rates after
the night QA").

## Next work / unresolved boundaries

1. Owner, physical: check the unplugged second Jabra is not still linked to the venue
   Jabra; press each Neo key once (incl. Playback/Music pages); glance at VIDEO LOOP/YouTube
   lip-sync (now measured on the picture side); A1 keeps leaving Bluetooth; the camera is damaged.
2. Owner decisions recorded 11-01 (DECISIONS): mini kept, so its rates stay open in TODO;
   persona v23 to be judged in the room. (VIDEO LOOP's TV wake order stays: DECISIONS 11-01.)
3. Open items in [TODO](TODO.md), including the audit follow-ups not fixed on 10-31.

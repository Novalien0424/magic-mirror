# Magic Mirror — current handoff, 2026-11-01

## Current delivery

Runtime: `field/macmini-deploy` (pushed). Canonical Mac, user LaunchAgent; the app is
left stopped (STOP state) after the night QA. Products and stories: [PRD](PRD.md);
open work: [TODO](TODO.md) (night goal G1–G15). Previous detail:
[archived handoff 10-31](docs/archive/progress-before-night-qa-2026-11-01.md) ·
[journeys and results](docs/testing/user-journeys-2026-10-31.md).

Delivered 10-31 → 11-01 (commits 41b684f, f59c5e4, 41229ce and the night commit):

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

- 01:27–01:32 Taipei 11-01, field pass on the final build through the real Stream Deck
  command path (outputs at 1%): START, VIDEO LOOP, VOL±, STOP, MUSIC LOOP, NEXT (track 2),
  PREV (track 1), folder key 1 (Yunelle, 84 songs from song 1), MUSIC LOOP back to the main
  folder (5 songs), STOP, CONSOLE, DESKTOP, STUDIO, DANCE (raised to 90%, re-quieted), STOP:
  every outcome success; each STOP put the TV in standby with the black cover. Music
  outputs 3 (A1 absent). End state: app stopped, Jabra and Edifier 70% unmuted (read
  back), Neo on "Magic Mirror copy 3" (default), Music page titles `["Yunelle"]`.

QA on the final builds (outputs at 1%, speakers back to 70%): full unit suite 2952
passed (2 skipped), typecheck clean. Phase 4: all 22 modes run; after fixes `--live`,
`--spells-live`, `--memory-live`, `--media-skill`, `--operator-loop`, default pass;
`--lifecycle-live` and `--memory-conversation` remain model-rate failures. Raven: 18
scenarios; after fixes `default_fallback`, `spell_control`, `sleep_spells` and the
YouTube runner pass. Remaining provider rates are listed in TODO ("Provider rates after
the night QA").

## Next work / unresolved boundaries

1. Owner, physical: press each Neo key once (main, Playback, Music page) and listen across
   song changes; reconnect the camera (it is not on the USB bus at all: G11).
2. Owner decisions: mini vs full dialogue model (farewell preamble, YouTube search-then-ask,
   tool routes, identity/recall quality); Raven's ~30 s in-character refusals. (VIDEO LOOP's
   TV wake order stays: DECISIONS 11-01.)
3. Open items in [TODO](TODO.md), including the audit follow-ups not fixed on 10-31.

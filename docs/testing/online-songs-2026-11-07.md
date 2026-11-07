# Online songs and speaker sync — 2026-11-07 (night, owner away)

Owner requests: the online search phrase "should not be too strict"; 「幫我在雲上找 周杰倫青花瓷撥放」
and 「幫我在雲上找周深的組曲撥放」 must find and play, with Raven Dormant while the song plays and
after it; STOP must stop it; songs play on every speaker at the default levels. Rulings are in
[DECISIONS](../../DECISIONS.md) (2026-11-07 entries); sync method and values in the
[Stream Deck runbook](../../deploy/macos/stream-deck.md#speaker-levels-calibrated-2026-11-07).

## Changes

- `matchSearchPhrase` (`src/shared/spoken-command.ts`): lead-in up to six syllables, optional
  repeated last character, 雲上找 without 在; negation (A-not-A excepted), quotes and later mentions
  still block. Used by the Realtime adapter; unit-tested with the owner's sentences.
- Every `play_youtube` hands Raven to Dormant (`src/main/ipc.ts`); a failed handoff keeps a
  play-once playing in the conversation. YouTube plays at full scale while Dormant
  (`youtube-player.ts`), so the speakers' calibrated levels set the loudness. The mirror no longer
  draws the avatar awake while Dormant during music (`App.tsx`).
- QA: new scenario `cloud_songs` (two visits, the owner's exact sentences), YouTube play-once
  check `dormant_after_media`, `new_visit` hook; `default_fallback` and `youtube_modes` lost the
  turns that chatted on after a YouTube play-once.

## Evidence (metadata only; speakers held at 1%, restored after)

| Run | Result |
| --- | --- |
| `2026-11-07T13-24-33-738Z` | `cloud_songs` exit 0: both sentences found and played an actual returned YouTube result; Dormant during playback, `lifecycle=dormant;phase=asleep;media=false` after each; quality judge flagged `tool_silence` on the first turn (mini preamble); audio route and provider checks passed; 25,799 Realtime tokens. |
| `2026-11-07T13-39-08-346Z` | First song passed again; the STOP probe fired at the start of visit 2 (wake music already on "Magic Mirror Speakers"), so it proved STOP of a running session only: app and speaker device gone within 1 s. Exit 2 by design. |
| `2026-11-07T13-40-19-285Z` | First song passed again; the YouTube player appeared 8 s into visit 2 with music running; `launchctl kill TERM` (the physical STOP's signal) at +2 s: Electron, the YouTube helpers and the speaker device gone within 1 s. Exit 2 by design. |

Also: unit suite 151 files / 2343 tests pass (the six `phase4-qa-runner` cases fail only in the
first full run right after `npm run build` and pass on rerun). Airfoil's Bluetooth settle and the
keep-A1-connected STOP were verified live (START/STOP/START cycles, A1 joined 6 min 34 s after its
first connect, resumed its settle across a quick STOP/START, then played at once).

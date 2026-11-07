# Online songs and speaker sync — 2026-11-07 (night, owner away)

Owner requests: the online search phrase "should not be too strict"; 「幫我在雲上找 周杰倫青花瓷撥放」
and 「幫我在雲上找周深的組曲撥放」 must find and play, with Raven Dormant while the song plays and
after it; STOP must stop it; songs play on every speaker at the default levels. Rulings are in
[DECISIONS](../../DECISIONS.md) (2026-11-07 entries); sync method and values in the
[Stream Deck runbook](../../deploy/macos/stream-deck.md#speaker-levels-calibrated-2026-11-07).

## Changes

- `matchSearchPhrase` (`src/shared/spoken-command.ts`): natural "search online" wordings (an online
  place plus a search verb, e.g. 幫我在雲上找, 幫我再網路上找, 在 YouTube 上找, 上網查查) or the configured
  phrase, after a lead-in of up to six syllables; negation (A-not-A excepted), quotes and later
  mentions still block; 油管 is excluded (sounds like 有關). Unit-tested with the owner's sentences.
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

## Second round (owner feedback: phrase too strict, YouTube less in sync, picture off-centre)

- **Sync cause measured.** Chirps through Airfoil, A1's mic, Jabra 80% / Edifier 30%: with the Jabra
  microphone closed the Jabras were −4 ms from the Edifier; with it held open (as the Dormant wake
  listener did during a YouTube song) they were −140 and −157 ms (the speakerphone's call path),
  back to normal once closed. MusicLoop releases the microphone, so local music sounded fine.
  YouTube audio itself went only to "Magic Mirror Music" (process routing monitor), i.e. Airfoil.
- **Fix.** During an online play-once the wake listener is released before Raven sleeps and returns
  after the song (`mediaWakeMicrophone`); online loops keep voice wake. Search results carry
  `mediaOnlinePlay` (play the best fit when asked to play, no choice question): one earlier run's
  medley turn searched but asked instead of playing (`raven_qa_tool_route`).
- **Picture.** The YouTube view is laid out from the window size on every poll (the mirror's simple
  full screen does not always emit `resize`) and fills the mirror with the 16:9 picture centred
  while Raven sleeps; awake, music keeps the strip below the avatar.
- **Independent audit** (read-only agent) findings fixed: wake release limited to play-once (loops
  had lost voice wake), 油管/有關 collision, ASR spaces and 查查, stale VOL± group level (the shared
  output helper now rewrites it while the Jabra is below 100%), awake layout/volume after Dormant,
  a failed Bluetooth join and a failed wake restore are now Console degradations.

| Run | Result |
| --- | --- |
| `2026-11-07T14-13-16-936Z` | Routing monitor run: first song passed; the medley turn searched but did not play (`raven_qa_tool_route`, model asked). Exit 2. |
| `2026-11-07T14-46-51-392Z` | After the fixes: both sentences played, wake listener off during each song and restored after, Dormant after; judge passed; YouTube audio only to "Magic Mirror Music". Exit 0. |

Unit suite 151 files / 2361 tests pass (the six `phase4-qa-runner` cases fail intermittently in
some full runs and always pass alone).

## Third round (owner: sync over voice control; STOP must reset everything)

- Every song or loop handed to Dormant (online or local) plays with the wake listener off; the
  Jabras sit out Airfoil music while their microphone is open (conversation, or the wake listener
  in Dormant), so A1 and the Edifier play it. QA loop checks now require no wake listener during
  the loop, then an operator stop and a fresh conversation (the acoustic wake-during-loop helper was
  removed).
- A requested song from an online search must play: if the model only answers, the application
  plays YouTube's first result (`media_online_autoplay`; unit-tested, not needed in the runs below).
- YouTube search cleans odd result labels instead of failing the whole search (the QA loop query
  returned `youtube_search_unavailable` twice before, results after).

| Run | Result |
| --- | --- |
| `2026-11-07T15-03-04-727Z` | Medley turn searched but did not play (model). Exit 2. |
| `2026-11-07T15-04-38-271Z` | Online loop: `youtube_search_unavailable`; operator stop + fresh conversation passed. Exit 2. |
| `2026-11-07T15-07-59-249Z` | Local loop: weak local match, no loop (model); operator stop + fresh conversation passed. Exit 2. |
| `2026-11-07T15-14-09-677Z`, `2026-11-07T15-15-31-052Z` | Both sentences played (model's own play_youtube), wake listener off during each song, Dormant after. Exit 0. |
| `2026-11-07T15-16-55-495Z` | Online loop: search unavailable again (before the label fix). Exit 2. |
| `2026-11-07T15-20-20-529Z` | Local loop played, no wake listener during it, operator stop, fresh conversation. Exit 0. |
| `2026-11-07T15-23-27-166Z` | After the search fix: online loop played, no wake listener during it, operator stop, fresh conversation, quoted request ignored. Exit 0. |

Live (production, outputs held at 1%): MUSIC LOOP (Jabra microphone closed, only Airfoil's
music input) → STOP (app gone) → START (conversation, Jabra microphone open) → STOP (black, TV
standby, levels reset, microphone closed).

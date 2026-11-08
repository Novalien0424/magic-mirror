# Audit and fixes — 2026-11-08

The owner asked for a cleanup and an audit of the loops (VIDEO LOOP, MUSIC LOOP, Dance Floor), Raven
and Interactive Studio, then: "fix everything; commit, push and deploy".

- Three read-only reviewers (Opus) audited one area each. The root checked the high findings in code.
- Two workers fixed the loop and Studio files. The root fixed Raven and the shared files
  (adapter, `ipc.ts`, `index.ts`).
- Rulings are in [DECISIONS](../../DECISIONS.md) (2026-11-08).

## Cleanup

- **Moved to the Trash** (`~/.Trash/magic-mirror-cleanup-2026-11-08`, 292 MB; the permission
  system refused permanent deletion):
  - 45 old `.artifacts/` run folders and loose logs. They held synthetic Studio transcripts and
    portraits, and copies of third-party repositories.
  - 16 `/tmp/mirror-owner-*.lock` files.
  - The owner wake-check results.
- **Fixed at the source:** `tests/unit/electron-owner.test.ts` left one lock file per run.
- **Kept:**
  - Needed: `.local/memory-embedding` (runtime), `resources/generated`, `out/`, the wake models, and
    `.artifacts/sherpa-score-native-mac` (wake-scorer build workspace; its script does not re-download).
  - Owner decisions: `.env.rtf` (not opened), the tracked Raven v10 QA captures (~370 MB), and the
    historical root handoff notes.
- **Removed (dead):** `src/renderer/realtime/turn-controller.ts` and its test (flagged in the
  10-10 review). Also the WebSocket-only `audio_interrupted` and `audio_stopped` handlers and the
  Studio model-reveal path, which Main no longer used.

## Fixes

**Raven**

- **High — farewell talked over.**
  - Before: a visitor talking over the goodbye left Raven awake with every reply muted. WebRTC sends
    `output_audio_buffer.cleared` and never `audio_interrupted`, so the reset never ran.
  - Now: a farewell that is cleared or cancelled after its audio started ends the visit
    (`sleep_farewell_interrupted`).
  - A farewell that never reports its end goes to sleep after 30 s (`sleep_farewell_watchdog`).
  - A refused sleep request restores Raven to responsive instead of muted.
- **High — online-song fallback (11-07 code).** It matched single characters (放, 聽, 唱, 播)
  anywhere in the sentence. Now `matchPlayRequest` uses a deterministic phrase list with sound-alike
  keys and blocks a negation just before the phrase. A skipped autoplay reports
  `media_online_autoplay_skipped`.
- **Medium — cancelled sleep call.** A sleep call whose response was cancelled before it ran no
  longer leaves the mute flag set (`sleep_tool_cancelled`).
- **Low — YouTube.**
  - Main plays only video IDs its own search returned in that session (`media_youtube_not_searched`).
  - A run that went stale while starting is stopped.
- **Low — interrupt failure.** It now reports `realtime_interrupt_failed` instead of a connect failure.
- **Barge-in.** A WebRTC barge-in now also tells the avatar it was interrupted.

**VIDEO LOOP, MUSIC LOOP and Dance** (details in the [runbook](../../deploy/macos/stream-deck.md))

- **High — START after a failed loop.** After a VIDEO LOOP failed before its player mounted, START
  waited for a release that never came, and every later START failed. Now it waits only for a
  launched generation.
- **Medium-high — VIDEO LOOP reload.** The one automatic reload returns after 5 healthy minutes.
- **Medium — Airfoil writes.**
  - Jabra on/off and AirPlay level writes count as done only after they succeed.
  - A failure is reported (`music_output_jabra_music_failed`, `music_output_airplay_level_failed`)
    and retried on the next poll.
  - Writes are serialized.
- **Medium — player recovery.** The MusicLoop/Dance player restarts once after an exit. A stalled
  song is retried, and retired only after 3 stalls in a row.
- **AirPlay level during a conversation.** The Jabra then reads its call volume, so the AirPlay
  speakers keep the last music level. Dormant levels still follow.
- **Smaller fixes:**
  - A failed mode-file save no longer blocks mode changes.
  - The latest MUSIC/DANCE press wins over a VIDEO LOOP still validating.
  - A queued STOP cancels a pending VIDEO LOOP start (`loop_cancelled`).
  - Leaving Dance by any path resets the speakers.
  - STOP resets the other speakers even without a Jabra.
  - Stop Dance Floor acts only during Dance.
  - Dance falls back to the first track and skips unreadable files.
  - NEXT/PREV jump to the nearest ready song.
  - The shared-output helper restart budget returns after 10 healthy minutes.
  - Stale 70% labels were corrected, and a drift test was added for the Swift speaker-level copies.

**Interactive Studio**

- **Medium-high — Main deadlines.** Painting not started within 30 s fails (`studio_paint_timeout`).
  A keepsake not delivered within 60 s is delivered (`studio_keepsake_timeout`).
- **Medium — settings per session.** A visit uses the settings published when its session started.
- **Medium — name confirmation.** It counts only for the pending read-back, and keeps the list
  spelling.
- **Medium — image failures.**
  - One retry for transient errors.
  - A content refusal is classified separately from an auth failure.
  - After a quota or auth failure, new visits are refused for 15 minutes.
  - The Console shows the last failure.
- **Owner-approved — abandoned visit.** Silence from the name through Q1 ends the visit without
  painting (`studio_abandoned`).
- **Smaller fixes:**
  - Every non-accepted reply is reported, and an answer is replaced only against its own step.
  - Main's default start has a 9 s deadline, and the renderer ignores a late `enter`.
  - Unused view fields were removed (answer text no longer in view payloads).
  - Other guests' names no longer reach the model.
  - Async keepsake sinks are handled.
  - The remote Console cannot run the name-match test or a test picture.
  - The Console has "End this visit".
- **Not changed.** Deferring the hourly rollover during a Studio visit: the provider's 60-minute
  hard session cap leaves nothing to defer to (TODO).

## Evidence (metadata only)

- **Unit, renderer and main tests:** 221 files / 3016 tests pass. Typecheck and build pass.
- **New tests:**
  - Play-request phrases (yes and no lists).
  - Information questions do not autoplay.
  - Farewell talked over, and the watchdog.
  - Cancelled sleep call.
  - Searched-only YouTube.
  - Late default enter.
  - START after a failed loop.
  - Loop reload re-arm.
  - Airfoil write retry.
  - Player restart and stall retry.
  - Dance speaker reset.
  - Studio deadlines, abandoned visit and name confirmation.
  - Image retry and pause.
  - Remote Console refusal.
- **Live QA at 1%:** below.

## Live QA at 1% (all external speakers held at 1% every 50 ms; restored after)

| Run | Result |
| --- | --- |
| `cloud_songs` (03:32) | The first song played, went Dormant and completed (seeked near its end), and the wake listener returned. Then the QA driver hung 24 min: its `wait` awaited a page probe with no per-call timeout. Stopped. Probes now fail by name after 15 s (`raven_qa_<reason>_probe_hung`). |
| `cloud_songs` (03:59) | Second turn: the model searched and only answered. The app played the first result (`media_online_autoplay`), but the driver counted only model tool calls, failed the route and its cleanup stopped the song. The driver now counts the app's autoplay as the play step. Exit 2. |
| `youtube_modes` (04:00) | The model itself played the loop request as `once` (model). Exit 2. |
| `sleep_spells` (04:03) | Pass: farewell and sleep after the refactor. |
| `--operator-loop` (04:07) | Pass (29 Console checks, incl. a failed loop then START, and MusicLoop pending cancel). |
| `--studio-journey` (04:11) | The driver expected "1 of 5" failure lines; there are now 6 (`abandoned`). Updated. Exit 2. |
| `--dance-floor` (04:11) | The driver expected the old `dance_track_missing`; the fallback now plays the first track. Updated. Exit 2. |
| `cloud_songs` (04:18) | Pass: both sentences, Dormant after each. |
| `youtube_modes` (04:19) | The model only searched; the app autoplayed in loop mode, but the driver assumed `once`. The app now logs `media_online_autoplay_loop` and the driver reads it. Exit 2. |
| `--studio-journey` (04:22) | Pass (23 Console checks). |
| `--dance-floor` (04:24) | Pass (41 frames, track fallback, stop cancels preparation, speakers restored). |
| `youtube_modes` (04:26) | The model itself played the explicit loop request (「循環播放 … 這部影片」) as `once` again (model; 2 of 3 runs today). Wake off during the loop, operator stop, quoted request and quality passed. Exit 2. No more retries. |

All QA artifacts were reviewed against this report and deleted (`qa-artifacts.mjs`).

**Open after this round:** the mini model sometimes plays an explicit online loop request as play-once. A
fix belongs in the versioned tool/prompt catalog (`roleplay-control-prompts`), not a code override; see TODO.

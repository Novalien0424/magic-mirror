# User journeys — QA plan, 2026-10-31

Draft QA plan. It lists every current feature as a person-level journey and gives
the check that proves each one. Sources: [PRD](../../PRD.md) §2–5 (modes, journeys,
story IDs), [Stream Deck runbook](../../deploy/macos/stream-deck.md),
[operator controls](../../deploy/macos/raven-button.md),
[mm-ui-qa](../../.agents/skills/mm-ui-qa/SKILL.md) and its
[modes reference](../../.agents/skills/mm-ui-qa/references/modes.md), and the runners
named below. Every result is **pending**: this file contains no new QA evidence.
The previous plan, [user-journeys-2026-10-18](user-journeys-2026-10-18.md), is history.

## 1. Purpose, environment and evidence rules

**Purpose.** Give every host, visitor and maintainer journey a clear pass condition
and a single owner of evidence: an automated runner, a field button with log markers,
or a person. This includes the new Stream Deck **Playback** page.

**Environment (venue Mac mini, canonical checkout `/Users/novalien0424/magic-mirror`).**

- App: user LaunchAgent `com.magicmirror.launchagent`. Its `KeepAlive={SuccessfulExit=false}`
  is the only restart owner. Logs: `~/Library/Logs/MagicMirror/button.log`
  (one JSON line per control: `action`, `outcome`, `app`/`tv`/`audio`/`mouse`/`blackout`)
  and `app.out.log` (markers such as `MAIN_READY`, `WINDOW_LOADED`, `RENDERER_READY`,
  `OPERATOR_CONTROL`, `MIRROR_MODE`, `OPERATOR_LOOP`, `MUSIC_LOOP`, `MUSIC_OUTPUT`,
  `DANCE_FLOOR`, `CONSOLE_ON_MIRROR`, `CONSOLE_ON_MAIN`, `TV_PRESENCE`, `RENDERER_GONE`,
  `WINDOW_RECREATED`, `WEB_CONSOLE`).
- TV: portrait Android smart-mirror panel. Its HDMI receiver reports as T749;
  accepted orientation is Mac 90° with Android `user_rotation=2`. The board is
  controlled over wired ADB (`192.168.77.2:5555` via the root daemon on port 5038).
  **Current state (PROGRESS, 2026-10-31):** the HDMI bridge lost its EDID, so macOS
  lists the panel unnamed. A single unnamed non-main display is now treated as the
  panel. The board does not answer, so TV standby/wake and the TV mouse fail
  (`tv_*_failed`, Basso). The avatar's placement on the unnamed TV has not yet been
  seen live.
- Speakers: Jabra Speak2 75 (microphone, voice and cues, echo cancellation for its own
  output only), Bluetooth Edifier and A1 (aligned to a 185 ms floor), HDMI TV (fixed
  volume). The Mac mini speaker is excluded from music when an external speaker is
  present. Music plays through the shared "Magic Mirror Speakers" output.
- Stream Deck Neo (Stream Deck 7.6.0):
  - **Magic Mirror** profile, 8 keys:
    - top row: START (`0,0`), CONSOLE (`1,0`), VIDEO LOOP (`2,0`), DESKTOP (`3,0`);
    - bottom row: STUDIO (`0,1`), MUSIC LOOP (`1,1`), DANCE FLOOR (`2,1`), STOP (`3,1`).
  - **New Magic Mirror Playback** profile: VOL+ (`0,0`), VOL− (`0,1`), STOP (`3,1`).
    VIDEO LOOP and MUSIC LOOP are Multi Actions: they open the control app, then switch
    to Playback. Playback STOP opens the stop control, then switches back.
- Camera: Arducam UVC. **Current blocker:** it did not enumerate after two replugs
  (`0c45:0520` count 0, 17:44/17:48 Taipei).

**Evidence rules.**

- **Synthetic (automated):** runners use isolated user data and synthetic media. A pass
  needs:
  - exit 0;
  - the expected cases (`PHASE4_QA_RESULT status=passed`; `evidence.json`; YouTube 5/5
    and media-intent 8/8 checks);
  - inspection of the relevant screenshots.

  Also note these limits:
  - A virtual mic or synthetic speech is not human recognition.
  - Built-in Ren does not prove Raven.
  - Console-only modes do not prove the portrait display.
  - Pixels prove neither sound nor smoothness.
  - Provider dialogue is probabilistic: report rates over repeated runs with
    `node scripts/raven-quality-rates.mjs RUN_DIRECTORY...`. Reply quality and
    barge-in are rates; tools, effects, privacy and cues are hard gates.
- **Physical (devices):** use the production app driven by
  `zsh deploy/macos/raven-button.sh <action>`. Proof is the `button.log` outcome plus
  `app.out.log` markers and native read-backs
  (`"$HOME/Library/Application Support/MagicMirror/ops/stop-state" --output-status`).
  Script exit 0 only means the request was queued.
- **Human:** a person must do these; they never come from a runner:
  - real voice wake, names and barge-in;
  - listening to all four speakers, and Dance in the room;
  - physical Neo presses and the profile switch;
  - TV mouse clicks;
  - printing (not connected: FUTURE-04);
  - cold login or power cut.
- **Sound:** QA plays sound with outputs at **1%**.
  - Before any sound-producing run, record each output's level and mute and quiet it.
    Use the same `qa-output-volume quiet|restore` helper that `--dance-floor` builds from
    `deploy/macos/qa-output-volume.swift`; `--dance-floor` quiets and restores by itself.
  - Afterwards (on success, failure or cancel), release the test playback, then run
    `stop-state --reset-output` and check `--output-status`. Every external speaker
    (Jabra, Edifier, A1) must read 70% unmuted, within 1.5 points.
  - Return the Mac mini speaker to its recorded level and mute state. Never change
    input gain. Report a failed read-back; do not claim the volume was restored.
  - Some keys set levels by design: START, MUSIC LOOP and STOP set 70%, Dance starts at
    90%, and VOL± steps the level. Verify those by read-back first, then quiet. Only a
    human-present listening check runs above 1%.
- **Metadata only:** keep logs, markers, counts and hashes. Never keep transcripts,
  audio, private memory, camera frames or credentials. Never read `.env` or
  `.env.chatgpt`; image journeys rely on the owner's own `npm run chatgpt:login`.
  `--keep-transcript` is only for an owner review of a synthetic visit. Keep failed
  artifacts. Delete artifacts only on request, via `node scripts/qa-artifacts.mjs
  review|clean`.
- **Ownership:**
  - Run one Electron at a time from the canonical checkout.
  - Production must be stopped (STOP) before any runner. Runners refuse otherwise
    (`electron_already_running`, `raven_qa_electron_already_running`).
  - `run-youtube-qa.mjs` and `run-media-intent-qa.mjs` do not take the Electron lease,
    so serialize them by hand.
  - A button press during QA returns `electron_owner_busy` (Basso).
  - Save unsaved Console edits before STOP: STOP closes the app.
  - Rebuild with `npm run build` when a runner reports an unverified or stale build.
    The last clock-in showed `qa_build_stale`.

## 2. Journeys

Format: Stories · Actor · Preconditions · Steps · Expected/pass · QA method.
"Cold" means the app was stopped by STOP. "Warm" means the app is running in another mode.

### Stream Deck and field controls

#### J-01 START: cold start and warm return
- **Stories:** DISPLAY-01, WAKE-01, RECOVERY-01 · **Actor:** host.
- **Pre:** Cold: after STOP, the HDMI black cover is up; TV on, portrait. Warm: one of Studio, Video Loop, MusicLoop, Dance, Desktop or Console is open.
- **Steps:** 1. Press START.
- **Expected/pass:**
  - The black cover clears only after `MAIN_READY`, `WINDOW_LOADED`/`RENDERER_READY window=mirror` and the `normal` acknowledgement.
  - The TV wakes onto HDMI. Raven appears in reflective black Dormant, with no marks.
  - The previous mode releases its audio, timers and devices. The Console hides with its edits kept. The saved active avatar is unchanged.
  - About 6 s after wake, every external speaker reads 70% unmuted.
  - `button.log` shows `start` → `started` (Glass) cold or `already_on` (Pop) warm, with `audio: jabra_output_70` (this name covers all external speakers).
  - With the board unreachable, expect `tv_awake_failed` (Basso) while the app and mode still succeed.
- **QA:**
  - Field: `zsh deploy/macos/raven-button.sh start`, cold and after each other mode.
  - Automated (isolated mailbox): `node scripts/run-phase4-qa.mjs --operator-loop`: `operator_loop_start_normal_recovery`, `operator_desktop_return_buttons`, `operator_music_loop_transitions`.
  - Physical: Neo press and TV wake.

#### J-02 CONSOLE: cold open and overlay over a running mode
- **Stories:** CONSOLE-01, DISPLAY-01 · **Actor:** host.
- **Pre:** Cold; or warm in Conversation, Video Loop, MusicLoop, Dance or Desktop, with an unsaved edit in the Console.
- **Steps:**
  1. Press CONSOLE.
  2. Press it again.
  3. From Desktop, press CONSOLE.
- **Expected/pass:**
  - The Console appears on the TV over the kiosk and keeps the current playback (loop, MusicLoop, Dance) and the unsaved edit. Opening the Console is not a mode switch.
  - A repeat press shows and focuses; it does not hide. From Desktop, CONSOLE first resumes the saved avatar mode.
  - The TV mouse connects.
  - `console` → `console_shown` (Pop), `mouse: mouse_started`, `CONSOLE_ON_MIRROR`.
- **QA:**
  - Field: `raven-button.sh console`.
  - Automated: `--operator-loop`: `operator_console_on_mirror`, `operator_console_preserves_loop_and_draft`, `operator_music_loop_play_repeat_console`, `operator_console_remote_main_then_deck`.
  - Dance kept under the Console: field only.

#### J-03 VIDEO LOOP: cold/warm, repeat, switch to Playback
- **Stories:** LOOP-01 · **Actor:** host.
- **Pre:** A Loop Video preset is saved (J-25).
- **Steps:**
  1. Press VIDEO LOOP, cold and then from Conversation, Studio, MusicLoop and Desktop.
  2. Press it again after more than 3 s.
- **Expected/pass:**
  - Playback actually starts before the acknowledgement. Conversation, wake and camera pause. The TV wakes; the Console hides.
  - A repeat does not restart playback (Main is idempotent). A repeat within 3 s logs `debounced`.
  - `loop` → `loop_playing` (Glass); `OPERATOR_LOOP` playing.
  - The Neo shows the **Magic Mirror Playback** page (J-09) even if the mode fails.
- **QA:**
  - Field: `raven-button.sh loop`.
  - Automated: `--operator-loop`: `operator_loop_duplicate_play`, `operator_loop_start_cancel`, `operator_loop_failed_black`, `operator_remote_console_venue_keys`.
  - Physical: the Multi Action profile switch on the Neo.

#### J-04 DESKTOP: cold/warm and return keys
- **Stories:** DISPLAY-01 · **Actor:** host.
- **Pre:** Cold, or warm in any mode, with an unsaved Console edit.
- **Steps:**
  1. Press DESKTOP.
  2. Press it again.
  3. Press START, STUDIO, VIDEO LOOP and CONSOLE in turn, returning to DESKTOP between each.
- **Expected/pass:**
  - The input gate closes before voice, wake, camera and scenes are released, and before the loop or MusicLoop stops.
  - The Mirror and Console windows hide, and Electron stays alive with its draft. The portrait macOS desktop shows on the TV; the mouse connects.
  - Each return key restores its own view. Desktop persists across crash recovery.
  - `desktop` → `desktop_shown` (Pop).
- **QA:**
  - Field: `raven-button.sh desktop`.
  - Automated: `--operator-loop`: `operator_desktop_preserves_draft`, `operator_desktop_return_buttons`.

#### J-05 STUDIO: cold/warm Interactive Studio mode
- **Stories:** STUDIO-01, WAKE-01 · **Actor:** host.
- **Pre:** Cold, or warm in Conversation, a loop or Desktop.
- **Steps:** 1. Press STUDIO.
- **Expected/pass:**
  - Mirror mode becomes Interactive Studio, and the mirror listens for the Studio wake phrase (default 「招喚渡鴉使者」) instead of the Persona phrase.
  - The mode switch keeps Dormant (it does not wake the mirror).
  - Each visit ends with the Studio farewell and Dormant.
  - `studio` → `studio_ready` (Glass).
- **QA:**
  - Field: `raven-button.sh studio`.
  - Automated: `node scripts/run-phase4-qa.mjs --studio-journey` (`journey_mode_switch_dormant`); `--operator-loop` (Studio return cases); `node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario portrait_studio` (`studio_mode_on`, `studio_wake_entry`).

#### J-06 MUSIC LOOP key: cold/warm, repeat, Playback page
- **Stories:** LOOP-02 · **Actor:** host.
- **Pre:** `Common/MusicLoop` holds ready tracks; volume capture taken.
- **Steps:**
  1. Press MUSIC LOOP, cold (TV black) and then from Conversation.
  2. Adjust the Jabra buttons.
  3. Press MUSIC LOOP again.
- **Expected/pass:**
  - Each accepted press first sets every external speaker to 70% and reads it back.
  - Ready tracks loop on all external outputs. Voice and camera are off.
  - TV power, orientation, mouse and the black cover are untouched; no TV wake.
  - The physical volume holds until the next press. A repeat keeps playback and preparation.
  - `music` → `music_preparing` (Pop), `tv: tv_unchanged`, `audio: jabra_output_70`; `MUSIC_LOOP`/`MUSIC_OUTPUT` markers.
  - The Neo shows Playback.
- **QA:**
  - Field: `raven-button.sh music`.
  - Automated: `--operator-loop`: `operator_music_loop_play_repeat_console`, `operator_music_loop_transitions`.
  - Physical: Jabra buttons and the Neo profile switch.
  - Human: listen on all four outputs.

#### J-07 DANCE FLOOR key: cold/warm
- **Stories:** DANCE-01 · **Actor:** host.
- **Pre:** `Common/DanceFloor.m4a`, or a selected track saved in Console (J-23).
- **Steps:** 1. Press DANCE FLOOR, cold and from Conversation/MusicLoop.
- **Expected/pass:**
  - Raven says 「Ready to Party?」 verbatim, then the music loops on all external outputs at 90%, with beat-driven head and body motion. Voice listening and camera are off; the TV wakes.
  - `dance` → `dance_preparing` (Pop); `DANCE_FLOOR` markers.
  - The deck stays on the 8-key profile.
- **QA:**
  - Field: `raven-button.sh dance`; plays at 90%, so quiet immediately unless a human is listening.
  - Unit: `npx vitest run tests/unit/mirror-tv-control.test.ts tests/unit/operator-control.test.ts`.
  - The mailbox `dance_floor` path is not in `--operator-loop`; Dance runtime is J-23.

#### J-08 STOP from every mode
- **Stories:** RECOVERY-01 (PRD §2 STOP) · **Actor:** host.
- **Pre:** Each mode in turn: Dormant, Active conversation, Studio mid-visit, Video Loop, MusicLoop (also a pending cold download), Dance, Desktop, Console open.
- **Steps:**
  1. Press STOP.
  2. Press STOP again.
- **Expected/pass:**
  - The T749 or unnamed panel turns pure black before the windows close.
  - TV standby is attempted. Main shuts down and owned processes exit. The job is unloaded and does not restart (no restart for 30 s).
  - Every external speaker reads 70% unmuted; the mouse is released.
  - A queued STOP cancels a pending MusicLoop start without a failure chime.
  - `stop` → `stopped` (Tink) or `stopped_forced` (Sosumi), with `blackout: blackout_covered`, `audio: jabra_output_70`, `mouse: mouse_stopped`. The second STOP gives `already_off` (Pop).
  - Today, `tv_standby_failed` (Basso) is expected while the local stop still completes.
  - `stop_processes_remaining`/`stop_cleanup_unverified` require inspection.
- **QA:**
  - Field: `raven-button.sh stop` after each mode.
  - Unit: `tests/unit/raven-button.test.ts`, `tests/unit/mirror-tv-control.test.ts`.
  - Physical: TV standby once the board answers.

#### J-09 Playback page: VOL+, VOL−, STOP (new)
- **Stories:** LOOP-01, LOOP-02. No PRD ID yet; PRD §2 and the runbook do not describe Playback.
- **Actor:** host.
- **Pre:**
  - The regenerated profile package (both profiles) has been imported; importing is the owner's explicit Stream Deck action.
  - VIDEO LOOP or MUSIC LOOP has been pressed, and outputs are at a known quiet level with no playback.
- **Steps:**
  1. Check the layout: VOL+ top-left, VOL− bottom-left, STOP bottom-right, other keys empty.
  2. Press VOL+ twice.
  3. Press VOL− once.
  4. Press STOP.
  5. Failure variant: VIDEO LOOP with a forced mode failure (for example, no saved loop media), then STOP.
- **Expected/pass:**
  - Each VOL press moves **every external speaker** (Jabra, Edifier, A1) by ±10%, snapped to a 5% grid and clamped to 0–100%. VOL+ also unmutes.
  - The Mac mini speaker and HDMI are untouched. The Jabra is not required for stepping.
  - Volume presses run outside the queue: they act at once even while a start is pending, without touching the app, TV or Electron lease.
  - `button.log` logs `volume_up`/`volume_down` with the same outcome (Pop). A failure logs `volume_step_failed` (Basso).
  - `stop-state --output-status` shows all external speakers moved together.
  - STOP runs J-08, then the Neo returns to the 8-key profile.
  - Failure variant: `loop_mode_failed` (Basso), the deck still shows Playback, and STOP returns.
- **QA:**
  - Field: `zsh deploy/macos/raven-button.sh volume-up` / `volume-down` plus read-back; finish with `stop-state --reset-output`.
  - Unit: `npx vitest run tests/unit/raven-button.test.ts` (wrappers and installer).
  - Physical: profile switching and the layout on the Neo.
- **Open point:** Playback has no START/CONSOLE/STUDIO key. Leaving a loop for another mode needs STOP (full shutdown) or Console **Return to Avatar**, and the latter leaves the deck on Playback. Confirm this is intended.

#### J-10 Control queue, debounce and QA lockout
- **Stories:** RECOVERY-01 · **Actor:** host/maintainer.
- **Steps:**
  1. Press the same key twice within 3 s.
  2. Press STOP then START quickly.
  3. Press any key while a QA runner owns Electron.
- **Expected/pass:**
  - The second press logs `debounced`. STOP→START stays ordered.
  - Requests older than 120 s log `expired`.
  - A press during QA gives `electron_owner_busy` (Basso) and leaves the QA app untouched.
- **QA:**
  - Unit: `tests/unit/raven-button.test.ts`.
  - Field: steps 1–2.
  - Step 3: only observe it if it happens; do not deliberately interrupt QA.

### Visitor journeys

#### J-11 Conversation visit: wake, chat, barge-in, sleep or idle
- **Stories:** VOICE-01, WAKE-01, AVATAR-02 · **Actor:** visitor.
- **Pre:** Conversation mode, Dormant. The published Raven Persona sets the wake and sleep phrases and the idle time.
- **Steps:**
  1. Say the Persona wake phrase.
  2. Chat in Chinese, then ask for English.
  3. Interrupt Raven mid-sentence.
  4. Say the sleep phrase. Separately, stay silent past the idle time.
- **Expected/pass:**
  - The entrance plays and voice connects. Lip sync follows the actual output; interrupting stops audio and mouth together.
  - Persona v22 holds: no stock line such as 「你們人類太囉嗦了」, and sarcasm only for really chatty or unclear visitors.
  - Sleep or idle closes the session, clears RAM content and returns the microphone to wake. Dormant returns to exact black.
- **QA:**
  - Automated, synthetic and provider:
    - `--lifecycle-live` (greeting, verbatim farewell, follow-up without a repeated greeting);
    - `--live`;
    - `--ritual` (Dormant exact black, entrance/exit);
    - Raven `--scenario character_consistency`, `empathy_context`, `additional_capabilities` (`barge_in_and_followup`).
  - Report rates for these.
  - Human: real voice wake, barge-in, echo with music, idle timeout.

#### J-12 Cloud failure: OfflineLoop and recovery
- **Stories:** RECOVERY-01 · **Actor:** visitor/maintainer.
- **Steps:**
  1. During a visit, cut only the internet uplink. Keep the direct TV Ethernet.
  2. Restore the uplink.
- **Expected/pass:**
  - The old connection closes and the offline loop video shows; the reason is visible in Console Events.
  - After recovery the mirror goes to Dormant. It never resumes the previous person's conversation.
- **QA:** Manual only; no runner simulates this.

#### J-13 Identity and private memory
- **Stories:** IDENTITY-01, MEMORY-01 · **Actor:** visitor.
- **Steps:**
  1. Introduce yourself verbally and confirm.
  2. Share a fact, a promise and a correction.
  3. Leave, return, and confirm again.
  4. Deny a proposed identity.
  5. Stay anonymous, or join as a group.
- **Expected/pass:**
  - Memory loads only after a verbal confirmation. A switch of person closes the old history.
  - Learning is attributed to the turn-start owner; control turns skip extraction.
  - A denial or an unrelated "yes" does not confirm.
  - Anonymous visitors and groups get no personal memory. A Studio name never grants memory.
- **QA:**
  - Raven `--scenario two_visit_memory`, `identity_denial`.
  - `node scripts/run-phase4-qa.mjs --memory-live`, `--memory-conversation`.
  - Human: a real voice self-introduction.

#### J-14 Local media request
- **Stories:** MEDIA-01 · **Actor:** visitor.
- **Steps:**
  1. Ask for local music, a video and an image by title or alias.
  2. Ask an ambiguous title, then choose a version.
  3. Ask "only local" for a missing title.
  4. Ask for a loop, then say 「停止播放」.
  5. Say a negated or quoted stop.
- **Expected/pass:**
  - The real assets play; ambiguity is clarified; a miss stays local.
  - Only the exact 「停止播放」 (whole utterance, sound-alike folds) stops media, once, with no tool call, no avatar line and no memory. Negations and quotes do nothing.
  - The follow-up chat continues.
- **QA:**
  - Raven `--scenario local_media`, `local_scope`, `local_loop`, `media_stop`.
  - `node scripts/run-media-intent-qa.mjs` (8 checks).
  - `--media-skill` (image/video/music once and loop, embedded audio suppresses BGM, Console stop).

#### J-15 Sound-alike media titles
- **Stories:** MEDIA-01 · **Actor:** visitor.
- **Steps:**
  1. Ask in Mandarin with a sound-alike title, for example 「我想聽女祭司唱的天使，幫我放一次。」.
  2. Ask for a version that is missing.
  3. Ask an ambiguous version and choose.
- **Expected/pass:** The correct local track plays; a missing version is reported; ambiguity gets a clarification and then the chosen version.
- **QA:**
  - Raven `--scenario phonetic_media` (synthetic audio, real providers).
  - Human: does not prove human recognition.

#### J-16 Cloud search phrase gate and YouTube
- **Stories:** MEDIA-02 · **Actor:** visitor.
- **Steps:**
  1. Ask for a YouTube video without the hidden cloud phrase.
  2. Ask again with the phrase, once and then as a loop.
  3. Stop the loop from the Console.
  4. Quote "loop a YouTube video" hypothetically.
- **Expected/pass:**
  - Nothing goes online without the whole phrase, and a local miss never auto-escalates.
  - With the phrase: once plays to the end and closes; a loop crosses the end; Stop releases it.
  - Audio on all external speakers.
- **QA:**
  - Raven `--scenario default_fallback`, `youtube_modes`.
  - `node scripts/run-youtube-qa.mjs` (5 checks). Add `--audible` with `out/native/music-loop --shared-output` beside it for the route.
  - Human: listen on all four speakers.

#### J-17 Image creation in conversation
- **Stories:** IMAGE-01, CAMERA-01 · **Actor:** visitor.
- **Pre:** The owner's ChatGPT sign-in is valid; the image skill is enabled for Raven.
- **Steps:**
  1. Ask Raven to paint.
  2. Chat while it paints.
  3. Ask for an edit.
  4. Dismiss it.
  5. Ask for a photo portrait; decline once, then accept.
  6. Ask in English.
- **Expected/pass:**
  - Painting does not block chat. The reveal shows, and the edit keeps the meaning.
  - A photo needs separate consent, and a decline takes no photo.
  - Sleep releases the image.
  - A missing login, quota or refusal is explained, never covered with a success line.
- **QA:**
  - Raven `--scenario image_skill`. Its `--native-camera` variant is blocked while the camera does not enumerate.
  - Manual: the missing-login and quota wording.

#### J-18 Camera gaze and visual questions
- **Stories:** CAMERA-01 · **Actor:** visitor.
- **Steps:**
  1. Move in front of the mirror.
  2. Ask "what do you see?".
- **Expected/pass:**
  - Gaze follows the visitor. A photo goes to the model only for a matching request.
  - Asleep there are 0 camera workers, awake 1, and after sleep 0.
- **QA:**
  - Raven `--scenario camera` (synthetic frame), then `camera --physical`. The physical run is blocked until the camera enumerates.

#### J-19 Interactive Studio: full Studio-mode visit
- **Stories:** STUDIO-01, IMAGE-02 · **Actor:** visitor.
- **Pre:** STUDIO mode (J-05).
- **Steps:**
  1. Say the Studio wake phrase.
  2. Give a name; deny the read-back, then correct it.
  3. Answer the questions; stay silent on one.
  4. Comment while it paints.
  5. Ask for one change.
  6. Listen to the farewell.
- **Expected/pass:** The fixed order from PRD §3 holds:
  - Opening: 「歡迎來到Gate thirty-three. 在這連結現實與虛幻的地方，唯有捨棄你的肉身，吾才能引渡你前往下一個世界」, then 「準備好的話就告訴我你的名字」.
  - Name: candidates are read back, and a new answer is required. 30 s of silence gives 「無名之人」.
  - Questions: the name is used only in the first question. A silent question records 「不回答 也是一種回答」.
  - Painting: 「現在 讓我們來嘗試描繪你靈魂的形狀」, and while waiting 「你自己覺得 你的靈魂會是什麼形狀?」.
  - Reveal: 「讓我們來看看描繪出來的靈魂形狀」. Feedback: 「看看你的靈魂形狀 還喜歡嗎? 還是你覺得有哪邊不像 想要做更多想像的」.
  - Redraw: at most one, only for a fresh explicit request.
  - Ending: 「現在讓我們把你的靈魂傳遞出去」, a printer-sink call that never claims a print, then 「願你的靈魂順利穿越」 and Dormant.
  - Only the name text appears on the glass.
  - A restart does not reuse the name or timers.
- **QA:**
  - Raven `--scenario portrait_studio` (default story), plus `--studio-story soul`, `soul_silence`, `guest_names_zh`, `guest_names_en`, `soul_language`.
  - `--studio-name-only --physical` captures the name through the Jabra.
  - Human: real guests' names and wake; real printing (FUTURE-04).

#### J-20 Conversation-started Studio
- **Stories:** STUDIO-01 · **Actor:** visitor.
- **Steps:**
  1. In Conversation mode, ask 「請開始互動工作室，帶我完成靈魂問答體驗。」.
  2. Complete the visit.
- **Expected/pass:**
  - The Studio opens (`studio_started_visitor`).
  - After the transfer line it returns to the same conversation, with no Studio farewell and no Dormant (ruling 2026-10-31).
- **QA:**
  - Raven `--scenario portrait_studio --studio-story soul` (`studio_conversation_request` covers the start only).
  - The return is unit-only (`tests/unit/studio-runtime.test.ts`, `realtime-session-studio.test.ts`) plus a manual check.

#### J-21 Spells, scenes and Stop All
- **Stories:** SCENE-01, SCENE-02 · **Actor:** visitor/host.
- **Steps:**
  1. Say an exact spell, then a quoted, negated or extended one.
  2. Repeat it within cooldown.
  3. The host runs a published scene and presses **Stop All**.
- **Expected/pass:**
  - Only a whole-transcript match (with approved sound-alike folds) triggers, once per turn.
  - Stages advance by duration. Progress and failure are visible.
  - Lights and fog use mock adapters; the physical adapters are not connected.
  - Stop All ends effects and keeps the app running.
- **QA:**
  - `node scripts/run-phase4-qa.mjs` (default scenes: spells, negatives, duplicates, visuals, missing-visual fallback).
  - `--music-only`, `--spells-live`, `--profiles` (`profile_short_spell_completed_once`).
  - Raven `--scenario spell_control`, `sleep_spells`.
  - Manual: Stop All on a running Console scene.

#### J-22 Conversation music
- **Stories:** SCENE-03 · **Actor:** visitor.
- **Steps:**
  1. Ask for music during chat.
  2. Keep talking.
  3. Ask it to stop or fade.
  4. Sleep, then wake.
- **Expected/pass:**
  - Music plays on all external speakers and ducks under Raven's speech, which stays on the Jabra, then restores.
  - Interrupted speech restores the music level. Sleep and wake behave.
  - This is distinct from MusicLoop/Dance, which own the voice exclusively.
- **QA:**
  - `--active-bgm`, `--media-skill`.
  - Human: guest turns and voice stop while music plays on all four speakers. The other speakers are not echo-cancelled.

### Host and operator journeys

#### J-23 Dance Floor from the Console
- **Stories:** DANCE-01 · **Actor:** host.
- **Steps:**
  1. In Console → Dance Floor: refresh and select a track; set intensity, volume and ±500 ms offset; set the welcome and language; Save.
  2. Start.
  3. Adjust the controls live.
  4. Press **Stop Dance Floor**. Repeat with **Stop All**, then with **Return to Avatar**.
  5. Remove the track and Start.
- **Expected/pass:**
  - 「Ready to Party?」 plays before the music. The native clock drives beat-locked motion.
  - Intensity, volume and offset apply live; track, welcome and language apply at the next Start.
  - Stop and Stop All end Dance only: speakers return to 70% and Raven to Conversation; the app keeps running.
  - A missing track is shown visibly. Stop cancels preparation. The defaults are 90% volume, intensity 1, offset 0, welcome on.
- **QA:**
  - `node scripts/run-phase4-qa.mjs --dance-floor` (quiets and restores volume itself).
  - Human: audio-visual sync in the room, offset by ear, hot-plug, a full long track.

#### J-24 MusicLoop library lifecycle
- **Stories:** LOOP-02, MEDIA-03 · **Actor:** host.
- **Steps:**
  1. Drop files into `Common/MusicLoop`, including a cloud-only file and one over 200,000,000 bytes.
  2. Press MUSIC LOOP.
  3. Empty the folder and press again.
  4. STOP, then MUSIC LOOP.
- **Expected/pass:**
  - Local tracks start first; cloud files join at a track boundary when ready.
  - The oversized file is skipped, with a Console message if all files are oversized. An empty folder gives an explicit message.
  - STOP then MUSIC LOOP reloads the files and retries downloads.
- **QA:**
  - `--operator-loop`: `operator_music_loop_empty_recovery`, `operator_music_loop_background_download`, `operator_music_loop_pending_cancel`.
  - Field: writing to the shared synced folder needs the owner's OK; remove the test files afterwards.

#### J-25 Video Loop Console settings
- **Stories:** LOOP-01 · **Actor:** host.
- **Steps:**
  1. In Console → Loop Video, choose a video, original or separate audio, volume and fit; Save.
  2. Play, Stop, Return to Avatar.
  3. Cancel a slow start.
- **Expected/pass:**
  - Settings persist across reload. The muted preview works.
  - Embedded or separate audio wraps independently. There is a single reload; a failure turns black with a visible reason.
  - Return to Avatar restores the saved avatar, and cancelling a start leaves no error alert.
- **QA:**
  - `--operator-loop`, cases 1–16 (`operator_loop_*`).
  - `--console` (finite video and portrait return).

#### J-26 Console editing, publish, rollback and conflicts
- **Stories:** CONSOLE-01 · **Actor:** host.
- **Steps:**
  1. Edit; Save draft → Check/Test → Publish, or Save & apply.
  2. Look at the draft-wide impact.
  3. Leave with unsaved edits.
  4. Edit the same setting in two Consoles (local and web) and save both.
  5. Roll back.
- **Expected/pass:**
  - Publish shows the whole draft's scope. Publishing is separate from loading; new sessions use the published settings.
  - An unsaved publish is blocked, and an invalid draft is kept.
  - The second save shows "saved configuration changed while you were editing".
  - Rollback asks for confirmation and restores the previous version.
- **QA:**
  - `--editor`, `--console`, `--video-fades`; Raven `--scenario review_ui`.
  - Rollback and the two-Console conflict are manual. Use `node scripts/run-phase4-qa.mjs --web-console` for an isolated two-Console session; unit `tests/unit/config-service.test.ts`, `console-config-ui.test.ts`.

#### J-27 Avatars, rigs, voice and presentation
- **Stories:** AVATAR-01, AVATAR-02 · **Actor:** host.
- **Steps:**
  1. Create, duplicate, load and delete avatars; lock a shared resource.
  2. Import a Cubism bundle; preview motions and expressions.
  3. Set the voice preset and effects, and preview.
  4. Set reflective Dormant and entrance/exit; Use on Mirror.
- **Expected/pass:**
  - Settings stay independent per avatar. A locked resource is owner-only.
  - Delete confirms its scope and refuses to break required references.
  - Motions and parameters match the MOC bounds. Reduce Motion follows macOS. Dormant is exact black.
- **QA:**
  - `--profiles`, `--console` (multi-avatar, duplicate isolation, lock/active-switch guard, Cubism import).
  - `MIRROR_CUBISM_QA_MODEL=<Raven .model3.json path> node scripts/run-phase4-qa.mjs --cubism`; without the variable, only Ren is tested.
  - `--ritual`, `--lifecycle-live` (avatar load).
  - Voice editor: manual. `voice-console-qa.ts` is not reachable from any runner flag.

#### J-28 Studio authoring and prompt inspector
- **Stories:** STUDIO-02, IMAGE-02 · **Actor:** host.
- **Steps:**
  1. In Avatars → Interactive Studio: edit the start, character, ending and wake phrase.
  2. Edit the name list (Off/Suggest/Only, aliases, up to 1,000).
  3. Set 1–8 questions with per-question image prompts.
  4. Set the style, format, name lettering, quality and 0–3 redraws; use `[pause=1s]`.
  5. Open the Prompt inspector.
  6. Publish, then run a visit.
- **Expected/pass:**
  - Validation enforces the limits; the matching preview and image-prompt preview show.
  - The next visit uses the published questions.
  - When the skill is disabled, it is removed from the Mirror tools.
- **QA:**
  - `--studio-journey`.
  - Raven `--scenario portrait_studio --studio-story soul_silence` (edited questions).

#### J-29 Memory management
- **Stories:** MEMORY-02 · **Actor:** host (Mac only).
- **Steps:**
  1. In Avatars → Memories: choose a person; search, add, edit and delete.
  2. Set the learning policy.
  3. Import Markdown: preview, summarize, cancel.
- **Expected/pass:**
  - Changes save immediately and stay local. People are isolated from each other.
  - The original Markdown is never stored. Cancel keeps the finished summaries.
  - Persona drafts stay separate.
- **QA:** `--memory`, `--memory-live` (live import).

#### J-30 Media folders and library
- **Stories:** MEDIA-03 · **Actor:** host.
- **Steps:**
  1. In System → Media folders: link the shared and avatar folders.
  2. In Avatars → Media: add aliases and playback settings.
  3. Import through the Media library.
  4. Unlink a folder.
- **Expected/pass:**
  - Discovery is by kind. Large files transfer by range, and the file list stays compact.
  - Unlinking revokes playback. A cloud file prepares before it plays.
- **QA:** `--media-skill`, `--media-skill-functional` (functional, portrait not verified).

#### J-31 Web Console over tailnet
- **Stories:** CONSOLE-02 · **Actor:** host on another tailnet device.
- **Steps:**
  1. Open the Mac's Tailscale Serve HTTPS URL (`:8443`).
  2. View Mirror; edit and publish; run Dance Floor.
  3. Try file import, private memory, voice preview, wake calibration, simulation and developer controls.
- **Expected/pass:**
  - The tailnet node identity is verified, and only the listed capabilities work.
  - The Mac-only items are blocked with a reason.
- **QA:**
  - `node scripts/run-phase4-qa.mjs --web-console`: an isolated app using the installed `web-console.json`, with a 30-minute manual window. Its evidence stays `not_executed` until the human result is recorded.
  - Unit: `tests/unit/web-console.test.ts`.

#### J-32 Remote Console on the main display
- **Stories:** DISPLAY-01 · **Actor:** host over Chrome Remote Desktop.
- **Steps:**
  1. Double-click **Remote Console Magic Mirror**.
  2. Do it again, and minimize or maximize.
  3. Press CONSOLE.
  4. Use it while the app is stopped.
- **Expected/pass:**
  - The Console opens on the main display, beside the avatar, which stays untouched. Nothing starts, wakes, connects the mouse, changes mode or plays sound.
  - The next CONSOLE press moves it back over the mirror.
  - When the app is stopped, an alert says so.
  - Markers: `CONSOLE_ON_MAIN` / `CONSOLE_ON_MIRROR`.
- **QA:**
  - `--operator-loop`, cases 17–21 (`operator_remote_console_*`).
  - Field: `zsh deploy/macos/magic-mirror-remote-console.sh`.

#### J-33 Desktop and TV mouse
- **Stories:** DISPLAY-01 · **Actor:** host at the TV.
- **Steps:**
  1. Press CONSOLE or DESKTOP.
  2. Move and click with the Xiaomi receiver mouse on the portrait Console or desktop.
  3. Press STOP.
- **Expected/pass:**
  - One pointer with correct movement and clicks.
  - `mouse_started`, then `mouse_stopped` on STOP. A failed connection still opens the Console, with a reason within 10 s.
- **QA:**
  - Field: button logs.
  - Human: clicks. Blocked while the board is unreachable (the VirtualHere server runs on the board).

#### J-34 Maintainer: devices, wake, models, events
- **Stories:** WAKE-01, OPS-01 · **Actor:** maintainer.
- **Steps:**
  1. In System → Devices: change the BGM, Avatar audio and Sound effects volumes; save and reload.
  2. Run the avatar test tools, then Stop avatar tests.
  3. Calibrate wake.
  4. Draft a model change.
  5. Filter Events. Use the field help.
- **Expected/pass:**
  - Volumes persist. Numeric fields are bounded and announced as invalid.
  - A model change requires a publish review. Help popovers stay within the viewport.
- **QA:**
  - `--audio`, `--field-help`; Raven `--scenario review_ui`.
  - Wake diagnostics: Raven `--scenario wake_levels`, `wake_diagnostic`.
  - Human: wake calibration with a real voice.

### Recovery journeys

#### J-35 Renderer crash and hangs
- **Stories:** RECOVERY-01 · **Actor:** maintainer.
- **Expected/pass:**
  - One renderer crash recreates the window once (`RENDERER_GONE`, `WINDOW_RECREATED window=mirror attempt=1`). A second crash announces give-up and exits 1.
  - A frozen renderer is replaced while Main is preserved. A Main hang leads to one launchd restart.
  - A double TERM does not restart within 60 s. The WebGL context is recreated.
- **QA:**
  - `npm test -- tests/unit/smoke-contract.test.ts` (Electron smoke, holds the lease).
  - Raven `--scenario additional_capabilities` (`avatar_webgl_context_recovery`).
  - Optional, with the owner's OK: `node scripts/run-field-persistence-qa.mjs` and `node scripts/run-main-hang-qa.mjs`. Both operate the installed LaunchAgent and require the active config to equal the draft.

#### J-36 TV absent, unnamed HDMI, board unreachable
- **Stories:** RECOVERY-01, DISPLAY-01 · **Actor:** maintainer.
- **Expected/pass:**
  - A single unnamed non-main display is used as the panel (`unnamed_target`), and portrait and the black cover still work.
  - TV presence uses the same rule, so an unnamed panel counts as present (`TV_PRESENCE hdmi=present`). Before the 2026-10-31 fix it read `hdmi=absent`, and with the board also off Ethernet the app quit three minutes after start (observed 17:48 Taipei).
  - START with no panel reports `portrait_failed` before anything starts.
  - When the board is unreachable, TV steps fail with Basso, but app, cover, audio and mouse cleanup still run.
  - TV off makes the app exit 0 after the absence grace, by design (`TV_PRESENCE`, ruling 2026-10-11).
- **QA:**
  - Unit: `npx vitest run tests/unit/display-target.test.ts tests/unit/mirror-tv-control.test.ts tests/unit/tv-network-presence.test.ts`.
  - Field: START/STOP in the current state.
  - Human: TV power-off, HDMI reseat, and a look at the avatar on the unnamed panel.

#### J-37 Camera failure
- **Stories:** CAMERA-01, RECOVERY-01 · **Actor:** maintainer/visitor.
- **Steps:**
  1. Unplug or hang the camera during an Active visit.
  2. Replug it.
- **Expected/pass:**
  - Conversation continues (invariant 10), with a visible or metadata degrade reason.
  - A targeted USB reset is attempted; there is no restart storm.
- **QA:**
  - Raven `--scenario camera_native`, `camera_availability --camera-check stable`, `camera --physical`.
  - **Blocked:** the camera does not enumerate today.

## 3. Results

| Journey | Method | Result | Evidence | Notes |
| --- | --- | --- | --- | --- |
| J-01 START | Field cold/warm | pass | button.log `started`/`already_on`, `tv_awake` after the board fix | Before the TV power cycle every display key ended `tv_awake_failed` (Basso) |
| J-02 CONSOLE | Field cold/warm + `--console` | pass | `console_shown`, `mouse_started`; runner exit 0 |  |
| J-03 VIDEO LOOP | Field cold/warm/repeat + `--operator-loop` ×2 | pass after fix | `loop_playing`; runner exit 0 | Fixed: cold start failed `operator_loop_output_unavailable` (default output switching to the shared speakers) and the failure stuck in the renderer |
| J-04 DESKTOP | Field cold/warm | pass | `desktop_shown`, `mouse_started` |  |
| J-05 STUDIO | Field + `--studio-journey` + `portrait_studio` default/soul | pass | `studio_ready`; all three runs exit 0 |  |
| J-06 MUSIC LOOP key | Field cold (TV on and in standby)/warm + `--operator-loop` | pass after fix | `music_preparing`, `operator_loop_music_playing outputs=4` | Fixed: a missing TV made the command fail and the TV-absent exit stopped music; both decoupled |
| J-07 DANCE FLOOR key | Field cold/warm + `--dance-floor` | pass | `dance_preparing`; 90% then 70% on leaving |  |
| J-08 STOP | Field from every mode and when off | pass | `stopped`, `tv_standby`, `mouse_stopped`, no Electron/helpers, default output Jabra, black cover | 1 of 3 mouse stops `mouse_stop_failed` (client exit unverified), not reproduced |
| J-09 Playback VOL±/STOP | Field VOL± + profile read-back + unit | pass (script); physical press pending | VOL± 0.22 s, ±10% on Jabra/Edifier/A1; imported Switch Profile targets remapped | Neo key presses are the owner check |
| J-10 Queue/lockout | Unit + field | pass | `electron_owner_busy` for owner presses during QA (by design) | Presses during Electron QA are refused |
| J-11 Conversation visit | `--live`, `--lifecycle-live`, `--ritual`, Raven character/empathy/sleep | pass with known rate items | lifecycle 1 of 2 (mini preamble before farewell); ritual 3 of 4 after harness fix; v22 character: 0 stock lines in 11 replies, judge 0 of 10 (codes: unnecessary_question 5, wrong_language 4) | Human voice not covered |
| J-12 Offline | Manual | not run |  |  |
| J-13 Identity/memory | Raven identity/two-visit, `--memory*` | partial | `identity_denial` pass; `two_visit_memory` 1 of 2 (retry pass); `--memory-conversation` 0 of 2 (recall, then return identify); `--memory-live` harness race fixed (see rerun) | Mini model identity/recall rate below target |
| J-14 Local media | Raven local media/scope/stop/loop, `--media-skill*` | pass except local_loop | `local_loop` retry: see below |  |
| J-15 Sound-alike media | Raven `phonetic_media` | pass | exit 0 | Not human ASR |
| J-16 Cloud/YouTube | YouTube runner, Raven fallback/modes | partial | YouTube runner pass; `default_fallback` 1 of 2 (retry pass); `youtube_modes` 0 of 2 (no tool call; then the YouTube loop paused in Dormant, `raven_qa_loop_lost`) | Open: YouTube loop hand-off |
| J-17 Image creation | Raven `image_skill` | pass on retry | 1 of 2 (first: no reply while painting) |  |
| J-18 Camera gaze | Raven camera | blocked | Camera not enumerated |  |
| J-19 Studio visit | Raven `portrait_studio` default + soul | pass | exit 0 both | No printer |
| J-20 Conversation Studio | Unit | unit only |  |  |
| J-21 Spells/scenes | Default, `--music-only`, `--spells-live`, Raven spells | pass | `spell_control` 1 of 2 (first: mini preamble cut by sleep); `sleep_spells` pass |  |
| J-22 Conversation music | `--active-bgm`, `--media-skill` | pass | exit 0 |  |
| J-23 Dance Console | `--dance-floor` | pass | exit 0 |  |
| J-24 MusicLoop library | `--operator-loop` + field | pass |  |  |
| J-25 Video Loop settings | `--operator-loop`, `--console` | pass |  |  |
| J-26 Console publish | `--editor`, `--console`, `--video-fades`, `review_ui` | pass after fix | `review_ui` wake cue 458 → 13 ms | Fixed: cue context now opens on the Jabra |
| J-27 Avatars/rigs | `--profiles`, `--cubism` (Raven), `--ritual` | pass | exit 0 |  |
| J-28 Studio authoring | `--studio-journey` | pass | exit 0 |  |
| J-29 Memory management | `--memory` | pass | exit 0 |  |
| J-30 Media folders | `--media-skill`, `--media-skill-functional` | pass | exit 0 |  |
| J-31 Web Console | `--web-console` manual window | not run |  |  |
| J-32 Remote Console | `--operator-loop` remote screenshots | pass |  |  |
| J-33 Desktop/TV mouse | Field | pass after board fix | `mouse_started`/`mouse_stopped` |  |
| J-34 Maintainer | `--audio`, `--field-help` | pass | exit 0 |  |
| J-35 Renderer crash | Full `npm test` (smoke contract) | pass | 2932 passed, 2 skipped |  |
| J-36 TV absent / board | Unit + field + RCA | fixed | Unnamed-panel fallback, presence fix, board wakelock (0 ping drops in standby) | RCA in PROGRESS |
| J-37 Camera failure | Raven camera scenarios | blocked | Camera not enumerated |  |

**Coverage gaps found while drafting** (the two doc gaps were fixed the same day):

- The runbook's Dance section still says "default 100%" and "other outputs' prior levels", while the PRD and `--dance-floor` use 90% and all speakers at 70%.
- `raven-button.md` lists the STOP reset as Jabra-only and omits the dance and volume wrappers.
- No runner covers the Playback profile, rollback, the two-Console conflict, the voice editor, the mailbox `dance_floor` path, or the Studio return-to-conversation.

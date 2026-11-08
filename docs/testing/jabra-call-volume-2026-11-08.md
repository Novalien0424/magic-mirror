# Jabra call volume — 2026-11-08

Owner report (morning): "Magic Mirror avatar start at super low volume and even STOP cannot fix
it." Fix and prevent it; tests may run at 1%.

## Cause

The Jabra Speak2 75 keeps a **second stored volume for its call path**. A conversation's
echo-cancelled capture enters it: Chromium `getUserMedia({ audio: true })`, or macOS voice
processing. The app's wake listener does not.

- The call volume is stored in coarse steps: 1% becomes step 0, which the Jabra reports as muted.
- Writes made during a call change it, but only once the call has held for a few seconds.
- The level stays after the call closes.
- It had been left at 0, muted, during the 11-07 night's sound work at 1%. The exact capture isn't
  established: Raven QA conversations use synthetic input and never open the Jabra.
- START's reset (6 s after the TV wakes, Raven still Dormant) and STOP's (app gone) run outside a
  call, so neither reached it. Every conversation then started at 0, muted.
- The earlier "6.25% after a restart" readings (TODO, 10-20 → 11-07) fit the same mechanism.

Ruled out on the device (metadata only):

- Raven's voice goes straight to the Jabra, not through Airfoil.
- Airfoil's Computer volume (0 or 1) does not move the Jabra's CoreAudio level.
- The app's stored voice volume is 1.

## Fix

- **Helper:** `stop-state --reset-voice` (`deploy/macos/stop-state.swift`).
  - For 10 s it returns the Jabra to its normal level, unmuted, whenever the level reads otherwise.
  - Writes are 0.3 s apart, at most 8, because the switch ramps for about a second and overrides
    writes made during it.
  - It touches only the Jabra: not the other speakers, the group level or input gain.
- **Main:** `src/main/jabra-voice-level.ts`, wired in `src/main/index.ts`.
  - It runs the helper as the first conversation after an app start, START or STUDIO begins
    (lifecycle `activating`).
  - The reset is used up once that conversation reaches `active`. After a failure the next
    conversation retries.
  - QA runs skip it (`jabra_voice_level_qa_skipped`).
  - Events: `JABRA_VOICE` markers and `audio/jabra_voice_level` telemetry. A failure is the
    degradation `jabra_voice_level_reset_failed`.
  - Later conversations keep a visitor's Jabra-button level until the next START.

## Evidence (metadata only; no audio played or recorded)

The probes opened the Jabra, discarded the samples, and read the output volume and mute.

| Check | Result |
| --- | --- |
| State found | Echo-cancelled capture: 0.0000, muted, and still muted after closing. A raw CoreAudio IOProc capture: unchanged. |
| Write during a call | Setting 0.8 in the call: 0.7991, unmuted. The next call opened at 0.7991 (held 10 s after the write: 2 of 2; held about 2 s: did not persist). |
| 1% stored | Writing 0.01 in a call reads 0.0097; the next call opens at 0.0000, muted (step 0). |
| Conversation capture | Silent Electron page, `getUserMedia({ audio: true })` on the Jabra (echo cancellation, AGC and noise suppression on, 48 kHz), call stored at 6.25%: 0.7991 ramped to 0.0000, muted, within about 0.5 s. This is the owner's symptom. |
| Helper, then conversation capture | Call stored at 6.25%: the helper fought the ramp and held 0.7991 from 1.65 s (3 writes, exit 0). A second capture with no helper stayed at 0.7991. |
| Helper, then voice-processing capture | First version (4 immediate writes): all landed inside the switch, ended muted, `output_volume_verify_failed`. Spaced writes, call stored at 1%: three of three corrected; the next call opened at 0.7991. |
| Production start | LaunchAgent started without the button chime, A1 held at 1%, call stored at 6.25% (verified). The wake listener held the Jabra input for 40 s with no change in level, and Raven stayed Dormant (no conversation). A build with an extra wake-listener trigger ran the installed helper from Main (`JABRA_VOICE reason=jabra_voice_level_reset`). That trigger was then removed: the wake listener never switches the Jabra, and only a conversation does. |
| QA at 1% | `empathy_context` through the LaunchAgent, all external outputs held at 1%. The app logged `jabra_voice_level_qa_skipped`, and the hold only quieted the starting levels (2 outputs, 3 channels). Audio route, provider, quality and 4 of 5 turns passed; one turn failed `raven_qa_tool_route` (model). Exit 2. 23,397 Realtime tokens. |
| Unit | `tests/unit/jabra-voice-level.test.ts`: 5 pass. Unit suite: 152 files / 2369 tests pass. Typecheck and build pass. |

Final state: the call volume opens at 0.7991 on both the conversation capture and the
voice-processing capture; plain playback is Jabra 0.80 and A1 0.65; the app is stopped.
Not yet observed: a real visitor's production conversation (synthetic wake is never detected on
this Mac). Check Raven's voice and `JABRA_VOICE reason=jabra_voice_level_reset` in the app log.

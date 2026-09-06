# Wake input / first-boot investigation — Windows, 2026-09-06

Status: diagnostics implemented, built, and verified in the normal Windows app;
the operator-reported first-boot wake failure remains unresolved, not reproduced
by the controlled comparison below.

## Evidence

- Published config and encoded detector keyword both select `魔鏡阿魔鏡`,
  package `sherpa-magic-mirror-win-v2`.
- Windows default capture endpoint resolves to `Headset (2- SRS-NB10)`.
  Audio/Bluetooth services run, endpoint reports OK, microphone access is allowed.
- Operator reports Windows microphone-test playback works despite a flat meter.
- Operator reports initial wake attempts fail, but Console Start Conversation
  supports voice conversation; subsequent wake attempts then work. This narrows
  investigation to initial capture/startup versus post-conversation reacquisition;
  it does not yet distinguish a stalled stream, silent samples, or detector state.
- Original `wake_worker_listening` event confirms acquisition only, not continuing
  audio delivery. No original amplitude/block telemetry exists retrospectively.

## Diagnostic change

Console → Avatar / Audio → Wake microphone — live input shows bounded peak/RMS
derived levels, block count, last report age, and wake detections. It distinguishes
inactive, waiting, stalled (>3 seconds without a report), silent/very quiet, and
signal. Reports are throttled to 500 ms and retained in RAM only. No new mic owner,
recording, raw audio/transcript IPC, persistent amplitude logging, model tuning,
or automatic recovery is introduced. A signal is not proof of speech recognition.

Checks: `npx vitest run tests/main/wake tests/unit/console-ipc.test.ts
tests/unit/console-ui.test.ts tests/unit/boot-ipc.test.ts
tests/unit/audio-devices.test.ts tests/unit/audio-preferences.test.ts` — exit 0,
138 tests / 15 files. `npm run typecheck` and `npm run build` — exit 0.
Initial worker/supervisor tests failed for missing diagnostics; an IPC test caught
the missing polling projection before its correction.

## Native Windows verification — 2026-09-06, 09:50–09:58 Taipei

- Exited the earlier dev process through File → Exit while Dormant; exit 0.
  Restarted from the canonical checkout with `npm run dev`; Main, Console and
  Mirror reported ready, smoke off. Final polling IPC projection is loaded.
- Before any Start Conversation action: the real Console showed signal, 368
  blocks, peak −33.9 dBFS, report age 318 ms and zero wake detections. Blocks
  continued through 2,639 with varying level and recent reports. This restart
  does not exhibit a dead/stalled initial capture stream; ambient signal alone
  does not establish intelligible speech pickup.
- Visually inspected the meter, explanatory status, block/age/count readout and
  both Windows-default selectors, which resolve to SRS-NB10. No settings changed.
- Generated one fixed synthetic wake phrase using local Microsoft Hanhan TTS,
  with no microphone opened. The actual configured detector recognized it once
  on a fresh instance, once after reset and once after 60 seconds of digital
  silence (Node probe exit 0). No threshold/model/package changes were made.
- Played that synthetic WAV through the default speaker before and after one
  manual conversation. Neither acoustic playback produced a wake. This is an
  inconclusive acoustic test, not a successful real-voice wake or a reproduction
  of a first-boot-only difference.
- Native Start Conversation reached Active; wake diagnostics became inactive and
  stopped advancing. Disconnect returned Dormant and capture resumed (153 blocks,
  peak −29.5 dBFS, report age 474 ms). Thus the diagnostic release/reacquire
  transitions work. No transcript or conversation audio was collected.
- Re-ran the 138 focused tests after native startup; exit 0. Earlier failed
  checks remain described above; no phase acceptance is implied.

## Remaining acceptance

App remains running normally, with the diagnostics available under Avatar /
Audio. No code fix for the reported first-boot fault is claimed: current evidence
does not justify changing detector reset, thresholds, automatic recovery, or
Windows settings. The remaining comparison requires the operator's actual voice
on a failing first boot, followed by the known manual-conversation workaround.
Compare block delivery, level change while speaking, and wake count in both
states. No Windows reboot is justified by the flat Windows meter alone.

Synthetic fixture: `.artifacts/wake-startup-20260906/synthetic-wake.wav` (generated
public phrase, not a microphone recording). Personal config and `sample/` remain
unchanged. Native snapshots were inspected in-session, not exported to files.

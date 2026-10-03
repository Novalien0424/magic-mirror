# Active BGM and Talos-inspired sound profiles — Windows evidence

## Follow-up: echo controls and tuned profiles

The authoring UI now includes **Echo amount (0–30%), Echo delay (60–500 ms), Echo repeats (1–4)** and **Hall (1.2 s) / Cathedral (2.4 s)** room sizes under Voice → Local voice effects → Fine tuning. Existing saved settings normalize to echo off. The implementation uses finite, diminishing convolution taps; no recursive feedback or new dependencies/provider are introduced. Mouth movement still reads the direct processed voice, while completion observes the full output tail. Interruption replaces both echo and room buffers and resets the existing speech processors.

Updated built-in profiles (reselect the profile to apply these values to an existing avatar draft):

| Setting | Priestess | God |
| --- | --- | --- |
| Base voice / speed | marin / 0.90× | cedar / 0.85× |
| Pitch / formant | −0.8 / −0.3 semitones | −3 / −1.5 semitones |
| Warmth / brightness | +0.8 / +0.2 dB | +1.8 / +0.4 dB |
| Grit | 0 | 0.02 |
| Room | Medium, 12% | Hall, 16% |
| Echo | Off | 22%, 230 ms, 3 fading repeats |
| Output trim | −3 dB | −5.5 dB |

The tuning keeps God deep while reducing bass buildup/distortion and restoring consonant brightness. Priestess uses gentler pitch/formant processing. These are authored starting settings, not measured perceptual matches; the user will judge resemblance by listening.

Fresh follow-up evidence:

- `node scripts/run-voice-effects-proof.cjs` — exit 0. [Archived report](../../.artifacts/voice-effects/echo-proof-20260921-135225.json). Real Chromium convolution produces exactly three diminishing impulse peaks (0.30257, 0.13616, 0.06127), no dry duplicate, and zero output after the finite echo. The maximum room/echo graph tail is 2.626 s; it drains to RMS 0. Interruption plus immediate restart remains RMS 0 across that entire tail. Extreme combined settings stay finite and peak at 0.894. Existing direct speech DSP onset p95 measured 149.33 ms; this is a synthetic local processing measurement, not provider latency or a listening comparison.
- `npx vitest run tests/unit/voice-effects.test.ts tests/unit/voice-spatial-effects.test.ts tests/unit/voice-profiles.test.ts tests/unit/voice-preview-lease.test.ts tests/unit/processed-audio-tail.test.ts tests/unit/field-help.test.ts tests/renderer/avatar/presentation-ambience.test.ts` — exit 0, 26 tests. Includes legacy schema defaults, bounded echo settings, profile persistence, and withholding `output_stopped` until the longer tail finishes so BGM stays suppressed; interruption drops stale completion.
- `MIRROR_VOICE_QA=1 MIRROR_VOICE_PROFILE_QA_LIVE=1 node scripts/run-phase4-qa.mjs --editor` (environment variables set in PowerShell) — exit 0, 13 checks, including live generated auditions for both updated profiles, echo persistence, UI edits and playback cancellation. [Run](../../.artifacts/phase4-qa/2026-09-21T13-54-16-010Z/evidence.json), [echo controls](../../.artifacts/phase4-qa/2026-09-21T13-54-16-010Z/screenshots/voice-echo-controls.png).
- Web typecheck and production build pass. Node typecheck still reports only the existing `qa-artifacts.mjs` missing declaration described below. An attempted older `voice-audition-cleanup.test.ts` also fails because its mock bridge omits `getAvatarRuntime` and its router omits current volume methods; those two fixture failures precede the changed DSP path. Actual Console startup-abort and stop/restart QA pass.
- Before shutdown, normal Console showed **Published v26 · Up to date**, with no unsaved avatar edits. A pre-existing `wake_audio_stalled` banner was present before these changes. Isolated QA did not modify operator profiles.
- Normal app restarted successfully (launcher PID 43828; readiness confirmed). Console still reports `wake_audio_stalled` after restart; this separate microphone/wake-listener problem remains. Voice auditions do not acquire the microphone. Console was left on Avatars → Voice for the user's listening test.

## Operator controls

- **Avatars → Appearance:** select the loop under Sleep ambience, then set **Active BGM volume**, immediately below Ambience volume. Existing avatars default to 0% awake volume. System BGM volume also applies. Save all changes, then Publish all changes.
- While awake, the same music continues at the active level. Avatar output immediately silences ambience without restarting its timeline. After processed speech finishes (including its tail) or is interrupted, ambience fades back over 500 ms. Sleep restores the sleep ambience level.
- **Avatars → Voice → Sound profile:** choose **Priestess** or **God**, then **Generate test voice**. Selection applies base voice, speed, delivery instructions and effects together. Save/publish stores these fields in that avatar; published voice changes apply next conversation. Fine tuning changes the selector to Custom settings.

## Voice-reference limits

Inspected the user-selected `Talos_Voice.wav` locally: 76.394667 seconds, stereo, 48 kHz, 24-bit PCM. Analysis used Priestess 0–40 seconds and God 42 seconds–end. Rough voiced-frame median F0 estimates were 179.8 Hz and 98.2 Hz respectively; music, reverb and octave ambiguity limit these measurements.

The two built-in profiles are **provisional approximations**, not cloned voices or verified close matches. They use marin/cedar and the existing bounded speech effects. The agent could not perceptually listen to the recording; no claim of perceptual similarity is established by the measurements or playback QA. A listening comparison and tuning remain necessary. No reference audio is shipped with the app or uploaded for cloning.

OpenAI's [custom voice documentation](https://developers.openai.com/api/docs/guides/custom-voices) requires eligible access and a separate matching speaker consent recording; the reference WAV alone does not satisfy that workflow. Custom-voice creation was not implemented or submitted.

## Verification

- `node scripts/run-phase4-qa.mjs --active-bgm` — exit 0, eight focused real Windows Electron checks. Evidence: [run](../../.artifacts/phase4-qa/2026-09-21T13-15-29-122Z/evidence.json), [slider screenshot](../../.artifacts/phase4-qa/2026-09-21T13-15-29-122Z/screenshots/active-bgm-slider.png). Covers preview, save/publish/reload, awake/sleep, recorded speech with mouth activity and unchanged voice gain, interruption, restoration and global mute. Live provider conversation/microphone conditions were not part of this BGM run.
- `MIRROR_VOICE_QA=1 node scripts/run-phase4-qa.mjs --editor` — exit 0, eleven Windows Electron checks. [Run](../../.artifacts/phase4-qa/2026-09-21T13-23-32-764Z/evidence.json). Covers both profile selections and saves, custom detection, existing local audio loop/Original/Processed/stop/abort controls, rig changes and draft/active isolation.
- With `MIRROR_VOICE_PROFILE_QA_LIVE=1` also set — exit 0, thirteen checks including one successful provider-generated audition per profile. [Run](../../.artifacts/phase4-qa/2026-09-21T13-24-43-701Z/evidence.json), [profile controls](../../.artifacts/phase4-qa/2026-09-21T13-24-43-701Z/screenshots/voice-sound-profiles.png). This proves generated playback completes; it does not measure reference similarity. Generated audio remained in RAM.
- Focused BGM/persistence/playback suites — exit 0, 79 tests across 11 files. After fixing recorded fixture URLs, 12 relevant tests passed again.
- `npx vitest run tests/unit/voice-profiles.test.ts tests/unit/voice-effects.test.ts tests/unit/field-help.test.ts` — exit 0, ten tests. Profile settings survive validation/JSON roundtrip and active-avatar projection independently.
- `npm run typecheck:web` and `npm run build` — exit 0.
- `npm run typecheck:node` — exit 1, existing TS7016 in `tests/unit/qa-artifacts.test.ts:6` (no declaration for `scripts/qa-artifacts.mjs`). No added-source type errors reported.
- Existing broader field-help coverage has an unrelated fixture missing `spells`, causing `AvatarCharacterEditor` to fail; focused field-help unit tests pass.

## Task-caused repairs and preserved evidence

Built Electron exposed absolute `/audio/...` URLs failing for local recorded speech. These two fixture URLs now resolve relative to the renderer (`../audio/...`), and recorded speech QA passes. The isolated BGM harness also filters hidden duplicate controls.

Failed runs remain under `.artifacts/phase4-qa/`: `2026-09-21T13-05-18-279Z` and `2026-09-21T13-07-33-683Z` (broader Console preview/sequence timeouts); `2026-09-21T13-11-37-392Z` (hidden control selection); `2026-09-21T13-13-25-883Z` (recorded fixture URL). No broad Console pass is claimed. Operator configuration was not changed by isolated QA.

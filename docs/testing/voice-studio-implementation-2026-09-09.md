# Voice Studio implementation — Windows, 2026-09-09

Implemented locally after the operator requested relaxing the delay standard
and proceeding. Added direct-speech latency target: p95 <=180 ms, with measured
overhead <=40 ms above engine latency. Interruption and stale-audio requirements
remain unchanged. No phase promotion, operator configuration publication,
commit/push or Mac acceptance.

## Delivered behavior

- Voice Studio beside Live2D Cubism, using the existing avatar draft owner:
  voice, speed, style/templates, pitch/formant, warmth/brightness, grit,
  room mix/size, trim, bypass/reset and explicit Ethereal/Dark oracle recipes.
  Library rig name/version is read from the existing labels; unlabeled imports
  are identified as version not set. Rig bytes are unchanged.
- Approved local file playback (20 MB / 30 seconds maximum), loop, stop and
  attenuation-only RMS-matched A/B. Provider speed/style requires Generate.
  Shared Cubism preview uses processed speech before the room tail for mouth
  movement, gated by output gain/mute.
- Explicit generated audition through the existing broker/session adapter;
  configured model, public draft settings and a fixed bilingual synthetic text.
  Silent synthetic input track, no microphone, tools or input transcription;
  generated audio stays in RAM, plays once and closes. Main leases output only
  while Dormant and suppresses Console output before a live start. Generated
  lease expires after 20 seconds; local lease after five minutes.
  A preempted delivered lease remains reserved until renderer cleanup acknowledges
  it; Console audio is then restored. Preempting credential preparation exposes
  neither audio nor a lease that would require an impossible renderer acknowledgment.
- Published settings are copied/frozen into initial and rollover snapshots.
  Old configurations default to bypass/speed 1; malformed present values fail
  validation. Per-avatar draft merging preserves these settings.
- Production Realtime output and auditions share one DSP constructor. The SDK
  receiver plays muted at volume zero; its remote MediaStream feeds one
  AudioContext output. Effects-off is an exclusive dry route. Existing device
  selection, gain/mute, processed completion and bounded tail handling use that
  context. Worklet failure emits a reason and bypasses effects.

The preset values are sound-tuning starting points. Automated success does
not establish Mandarin/English voice quality or an accepted supernatural sound.

## Dependency and execution assets

Only new audio dependency: exact `signalsmith-stretch@1.3.2`, MIT. Package and
lockfile pinned. The package's official .mjs/.js artifacts were compared
byte-for-byte with the official upstream `web/release` artifacts before use.

- MJS SHA-256: `97530b11d5bc01015af4cde40d6aa55ff10c40aa1294ca4c8c5762027d517a46`
- JS SHA-256: `fe0e23b6bb5dbffb231a91e7dc39f9d2a7d10c7f793fb0237d819ca748f7f778`
- Lock integrity: `sha512-tJqRbwPCoWLSHXwO29UQ75u72IwPsHns3RG+TKzuOAp7OduJiJMzEtz32JEFbPFQcTR7aiKCIVc+/Kzw8bMZUw==`

`scripts/prepare-voice-effects.mjs` checks version/license and copies the static
local worklet and retained MIT notice into generated assets for dev/build.
Renderer CSP adds `wasm-unsafe-eval`; the official factory uses an explicit
local module URL, without a blob worklet loader or general `unsafe-eval`.
Main schema imports are separate from preload-safe shared defaults: initial
QA exposed a sandboxed preload `require('zod')` failure, fixed by that split.

## Measured DSP evidence

Command: `node scripts/run-voice-effects-proof.cjs` — **exit 0** at
2026-09-09T07:44:28Z. Canonical Electron 44.0.0 / Chromium 152.0.7977.54,
48 kHz, isolated hidden sandbox, no microphone/provider. Actual two-peer
loopback WebRTC remote track and a 440 Hz synthetic source.
[Metadata result](../../.artifacts/voice-effects/proof/result.json).

| Check | Result |
| --- | --- |
| Receiver suppressed throughout | muted=true, volume=0, playing |
| Bypass RMS / processed RMS | 0.014163 / 0.021859 |
| Pitch at -3 semitones | 372.07 Hz (FFT resolution limited) |
| Engine + native estimate | 146 ms |
| Actual 20-pulse input/output p95 | 149.333 ms; 20/20 matched onsets |
| Observed added-delay range | 146.667–149.333 ms |
| Muted / resumed RMS | 0 / 0.022580 |
| Stale RMS after upstream silence | 0 |
| Immediate direct-source reset RMS | 0 |
| Both extreme-setting samples finite | true |
| Peak at amplitude 0.8 / maximal grit, room and trim | 0.877352 |
| Default setSinkId / context disposal | succeeded / closed |

The initial MediaElementAudioSource candidate failed and remains documented in
[the original routing report](voice-routing-proof-2026-09-09.md).
A strengthened immediate-reset test then failed with RMS 0.009698 despite WASM
reset: native filters/oversampling/compressor lookahead also retained samples.
Interrupt now recreates those stateful native stages and the convolver while
muted, and resets WASM before reopening. The identical strengthened test passes.
[Preserved failure](../../.artifacts/voice-effects/proof/failed-immediate-reset-20260909.json).
The upstream-silence test alone was insufficient evidence for immediate reset.

These samples establish signal timing and selected extremes, not all possible
speech spectra, physical speaker output, perceived pitch quality or exact
conversation-history truncation.

## Validation and UI evidence

- `npx vitest run tests/unit tests/renderer` — **exit 0, 779 tests / 79 files**.
  Includes settings/defaults/strict validation/frozen snapshots, output lease
  preemption and late credentials, adapter preview isolation and speeds,
  late connection close, and cancellation while output/device setup resolves.
- After final lease acknowledgment/restoration correction,
  `npx vitest run tests/unit/voice-preview-lease.test.ts tests/unit/voice-audition-cleanup.test.ts`
  — **exit 0, six tests / two files**, including the newly added restore case.
  The 779-test run above preceded this final bounded correction.
- `npm run typecheck` — **exit 0**, Node and renderer.
- `npm run build` — **exit 0**, local worklet copied and both preloads built.
- `MIRROR_VOICE_QA=1 npm run test:phase4:qa:editor` (PowerShell env syntax) —
  **exit 0**, six grouped UI checks and three screenshots. Real Console DOM,
  decoder, graph and IPC; native picker selection alone substituted. Default
  preset/knobs/save; local loop/A-B/stop; imported Raven v10 preserves -3 preset;
  two avatar drafts retain independent effects; active config unchanged.
  [Latest local evidence](../../.artifacts/phase4-qa/2026-09-09T07-45-45-296Z/evidence.json).
- With `MIRROR_VOICE_QA_LIVE=1`, actual provider auditions at 0.75, 1 and 1.25
  all completed through the same Console flow: **exit 0**, nine grouped checks.
  [Provider run](../../.artifacts/phase4-qa/2026-09-09T07-35-35-434Z/evidence.json).
  Runner envelope calls this editor mode/live=false; the three explicit
  `voice_provider_speed_*` markers identify the provider-backed cases. This run
  preceded the subsequent cleanup/native-reset fixes. Provider audio was not
  recorded; this is completion evidence, not duration-ratio or listening evidence.

Screenshots inspected: readable controls and unclipped default/Raven head/torso
preview within the scrollable editor. [Default](../../.artifacts/phase4-qa/2026-09-09T07-45-45-296Z/screenshots/voice-default.png),
[controls](../../.artifacts/phase4-qa/2026-09-09T07-45-45-296Z/screenshots/voice-default-controls.png),
[Raven](../../.artifacts/phase4-qa/2026-09-09T07-45-45-296Z/screenshots/voice-raven.png).
The final label lookup adds existing library name/version display after these
captures; no layout change. Initial UI driver sequencing and preload failures
were corrected; failed run artifacts are retained under `.artifacts/phase4-qa`.
An earlier regression selection had three outdated tab/build-script assertions;
updated those expectations, then reran all 779 successfully.

## Remaining acoustic/performance acceptance

Still open: human Mandarin/English listening and preset tuning, speech-duration
and formant/pitch independence measurements, physical <=50 ms interruption and
lip-sync checks, speakerphone echo cancellation, actual non-default output
device, word-boundary interruption/history mismatch, worklet p99 execution,
30-minute scene workload, and 100 complete lifecycle cycles/native graph-memory
baseline. UI/preemption unit evidence is not a hardware barge-in demonstration.
Windows evidence does not certify M4/M6 or Mac packaging/deployment.

No normal Electron was running before this work. All isolated QA exited and
the final process check found no Electron. Existing unrelated operator and
motion-loop edits remain. All voice changes are local/uncommitted; the operator
must use existing Save/Validate/Publish controls to adopt a tuned configuration.

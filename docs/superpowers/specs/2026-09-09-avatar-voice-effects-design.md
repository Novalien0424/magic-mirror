# Integrated avatar voice effects — focused design

2026-09-09. Requested design for one integrated open-source voice effect, model-
side voice controls, and default-avatar/Raven supernatural presets. Supersedes
the neural-engine implementation branches in the earlier
[research proposal](../plans/2026-09-09-avatar-voice-changer-research.md).
This document describes the intended implementation; it is not runtime evidence.

**2026-09-09 revision:** operator requested relaxing the delay standard and
proceeding with implementation. Direct-speech added delay now targets p95
**<=180 ms**, with measured timing no more than 40 ms above the engine estimate.
Interruption mute and stale-audio requirements are unchanged. The initial
MediaElementAudioSource route failed and is replaced by a muted receiver plus
MediaStreamAudioSource after a successful actual loopback-WebRTC proof.
[Original failed evidence](../../testing/voice-routing-proof-2026-09-09.md),
[implementation and current acceptance](../../testing/voice-studio-implementation-2026-09-09.md),
[Fable review assessment](../../testing/avatar-voice-effects-design-review-2026-09-09.md).

## 1. Scope and choice

Use **Signalsmith Stretch**, MIT, as the only new third-party audio dependency.
Use its official local WASM/AudioWorklet build for pitch/formant processing and
native Web Audio nodes for EQ, saturation and a small room effect. Pin the
release/integrity in the lockfile, package all executable assets locally, retain
license notices, and verify the package against upstream source before install.
Registry candidate checked read-only: `signalsmith-stretch@1.3.2`, MIT,
232,286 bytes unpacked. This is package size, not runtime memory evidence.
No CDN, Python, RVC, model downloads, virtual soundcard, extra audio service,
plugin framework or voice-model library.

Why: this delivers the requested supernatural sound with considerably less
latency, memory pressure and deployment work than neural conversion. It is an
effected version of the chosen provider voice, not an exact cloned speaker.
[Signalsmith source and license](https://github.com/Signalsmith-Audio/signalsmith-stretch),
[official Web Audio release](https://github.com/Signalsmith-Audio/signalsmith-stretch/tree/main/web/release).

One active public avatar; existing provider/model IDs and microphone ownership
stay unchanged. Windows development/QA first, with the same code intended for
Apple Silicon. Actual M4 and M6 performance remains a hardware acceptance task.

## 2. Console and configuration

Add **Voice Studio** beside **Live2D Cubism**. Reuse the existing public avatar
catalog/draft ownership and shared Cubism renderer. Show selected avatar, rig
name/version, preset name, draft/published state and whether effects are bypassed.
Do not turn the silent Cubism library page into an audio session.

Keep settings embedded in each public AvatarProfile: one `voiceEffects` object
and one `voiceSpeed` number. `voice` and `speakingStyle` already exist and remain
the authoritative fields. No separate preset database or independent revision
store: existing configuration versions provide persistence and rollback.
Built-in preset buttons copy values into the draft; subsequent edits are simply
Custom. Rig replacement preserves that public avatar's voice settings.

Old configurations normalize to effects off, speed 1.0. Missing new fields are
backward-compatible defaults; present-but-invalid values fail validation. Test
the strict schema, active-avatar projection, draft merge and Main-frozen session
snapshot together. Do not add root compatibility fields unless a current caller
requires them; avoid a second source of truth.
Explicitly merge the new fields in `mergeAvatarDraft`; its current selected-
avatar merge lists edited fields and would otherwise discard them. Deep-copy/
freeze the nested effects object in Main's start bundle. Pass that frozen
snapshot to audio-output creation on both initial start and rollover; the
current zero-argument factory must not read mutable Console/global settings.

### Controls

| Control | Range/behavior | Owner |
| --- | --- | --- |
| Base voice | Existing supported voice selector | Provider session |
| Speech speed | 0.5–1.5x, 0.05 steps, default 1.0 | `config.audio.output.speed` |
| Delivery style | Existing speakingStyle text plus Natural/Solemn/Ethereal draft templates | Model instructions, qualitative not guaranteed |
| Effects enabled | On/off, default off | Local graph |
| Pitch | -12..+12 semitones, 0.1 steps | Signalsmith |
| Formant/body size | -6..+6 semitones, 0.1 steps | Signalsmith, independent of pitch |
| Formant preservation | On/off, default on | Signalsmith compensation |
| Warmth | Low shelf +/-6 dB | Web Audio |
| Brightness | High shelf +/-6 dB | Web Audio |
| Grit | 0..30%, default 0 | Gentle normalized waveshaper |
| Room mix | 0..25%, default 0 | Dry plus finite convolution tail |
| Room size | Short/Medium, 120/250 ms impulse support | Built-in deterministic impulse; no feedback loop |
| Output trim | -18..0 dB, default -3 dB while enabled | Final gain; fixed safety stage |

Start without chorus, robot mode, multi-band dynamics editors or adjustable
feedback delay. The listed controls are enough to tune two distinct voices.
Every effect has a neutral value and numeric readback; Reset restores bypass.
The room uses one small mono input/stereo output impulse generated in memory,
not a new dependency or downloaded sample. Wet mix preserves the direct voice.

**Speed distinction:** the provider documents speed as post-generation
processing, not a guarantee about the model's delivery. It accepts 0.25–1.5 and
allows changes only between turns; our UI intentionally exposes 0.5–1.5 for
quality. The SDK 0.16.1 supports `audio.output.speed`. Natural pacing/emotion
belongs in speakingStyle. No browser playbackRate/time-stretch speed control.
Signalsmith live input stays 1:1 duration.
[Official speed and instruction fields](https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets/methods/create).

Save Draft/Validate/Publish remain existing operations. Live sessions use a
frozen voice/effect snapshot; published changes apply next conversation. No
mid-conversation global reconfiguration. DSP edits affect only the current local
preview; provider voice/speed/style edits require Generate again.

### Preview without accidental live changes

- Local sample -> Loop, Stop, Original/Processed A/B; uses an explicitly selected
  approved speech fixture. Loudness-match A/B. Mark speed/style controls as
  requiring new generation; never pretend they modify the recorded fixture.
- **Generate test voice** -> an explicit provider-backed, out-of-conversation
  audio response through the same session adapter and effect graph. Use a new
  isolated preview session with public draft voice/style/speed, no visitor
  context, no tools, no greeting/auto-turn, no microphone acquisition and no
  transcript retention. Main uses the existing credential broker; no new master-
  key path. Inject a fixed synthetic test request; audio stays in RAM.
  Supply a valid synthetic silent audio track from a MediaStreamDestination:
  the installed SDK calls getUserMedia when mediaStream is absent and expects
  getAudioTracks()[0] when present. An empty stream is not a mic-free solution.
  Disable input turn detection; stop/dispose the synthetic track and context
  on every completion, cancellation and connection failure.
- Preview must be denied while the Mirror has an active conversation or while
  another audio preview owns output. Opening Voice Studio never calls a provider.
  A live start preempts/stops preview before acquiring normal output. Main owns
  this small preview lease to avoid races between renderer windows.
- Loop applies to the approved local fixture only. Generated auditions play
  once and close; Generate again tests provider changes. No generated-audio
  recording/replay subsystem, WAV export, files, transcript or telemetry
  payload. Bound each audition to 20 seconds and show timeout reasons. Reuse
  the live DSP constructor, not a separate sounding implementation.
- Stop/reset/page leave closes the preview session, stops the source, removes
  buffers/tails and clears the mouth. Delayed async results are generation-gated.

## 3. Sound starting points

Preset application is explicit; never overwrite existing operator voice/style
settings during migration or restart. Do not identify Raven by display-name
string matching. Operator selects a public avatar and applies a preset.

| Preset | Pitch | Formant | Warmth / brightness | Grit | Room | Speed |
| --- | --- | --- | --- | --- | --- | --- |
| Default avatar / Ethereal | +1 | +1.5 | -1 / +1 dB | 0% | 12%, Medium | 0.95x |
| Raven / Dark oracle | -3 | -2 | +2 / -1 dB | 8% | 10%, Short | 0.90x |

Both retain the operator's selected base voice. Start output trim at -3 dB;
adjust after loudness-matched listening. Preset style templates are offered
separately so applying DSP does not erase authored character instructions.
Supernatural quality must be accepted by listening in Mandarin and English;
these numeric values are tuning starting points, not a claim of finished sound.

## 4. Single audio owner and lifecycle

Target graph:

`SDK remote MediaStream -> MediaStreamAudioSource -> Signalsmith -> EQ/grit -> dry/room mix -> safety/trim/mute -> selected AudioContext output`

Keep the SDK receiver attached/playing with muted=true and volume=0. Create
the shared graph before connecting, then attach the remote stream once it is
available. Only the graph reaches speakers. Effects-off uses a mutually
exclusive dry route in the same owner. Sink routing uses AudioContext.setSinkId
through the existing AudioDeviceRouter. A permanent zero-gain drain keeps the
remote stream rendering while the cancelled effect input is disconnected.

The first element-source candidate failed; the replacement stream route is
numerically verified on canonical Windows Electron. Alternate physical device
routing and Mac output-device behavior still require their own evidence.

- One output owner holds the source, graph and cancellation generation. Existing
  setVolume/setMuted target final output, so ducking/mute also silence tails.
- Lip-sync taps processed direct speech **before room**, timed to actual output
  and gated by final mute/trim, so the beak does not talk through the room tail.
  Completion uses the final voice-only graph, excluding background scene/music.
- Keep the pitch worklet mono. Only the inexpensive room mix becomes stereo.
  Use fixed channels so the inspected upstream dynamic-channel reconfigure
  branch is not exercised. Coalesce UI changes once per animation frame and
  smooth continuous graph gains over 20 ms. Worklet messages carry controls,
  never audio frames on the React/main thread.
- Initialize WASM before the first audible response. Start with the upstream
  cheaper preset and compare one higher-quality configuration if listening
  requires it. Query actual latency; do not label an engine setting zero-latency.
- On upstream stopped, wait for the known processing delay plus bounded room/
  safety tail and final playout silence before Speaking -> Listening, idle,
  farewell teardown or rollover. Preserve the existing bounded fallback with a
  metadata-only reason if the upstream event or analyser fails.
- On barge-in/Stop/disconnect: final gain closes immediately; cancel provider;
  reset/recreate effect state while muted; invalidate obsolete callbacks;
  reopen only for the next valid utterance. Muting alone must not allow old
  samples to reappear later. Ordinary slider changes do not recreate the graph.
- SDK `interrupt()` clears the upstream buffer, not local effect memory. Do not
  assume worklet `stop()` flushes it: its inspected source processes silence
  and can emit its existing tail. Prove explicit reset/disposal behavior.
- Source timestamps and measured added delay bound the WebRTC/history mismatch.
  Test interruptions at the beginning/end of words. Do not fabricate exact
  item/sample truncation or send guessed conversation.item.truncate events.
  If the small DSP delay produces unacceptable unheard retained text, treat it
  as a release blocker and report it; no automatic WebSocket rewrite.
- On worklet failure, continue the same provider voice through effects-off with
  a visible `voice_effects_failed_bypassed` status. This is DSP degradation, not
  substitution of a model/voice. Device/sink failure uses existing reasoned
  default-device fallback; it must not strand microphone release.

Safety stage: fixed compression plus a bounded normalized soft ceiling at final
output; compressor alone is not a brick-wall guarantee. Verify finite samples,
peaks and no sustained hard clipping at allowed extremes. Meter degradation is
reported but cannot gate conversation.

## 5. Implementation boundary

New units, no generic engine abstraction:

- `src/shared/voice-effects.ts`: defaults, settings types/validation and two
  preset recipes. Voice speed remains a separate provider field.
- `src/renderer/avatar/audio/voice-effects.ts`: create/update/reset/dispose of
  the shared graph and measured latency/tail metadata.
- `src/renderer/console/VoiceStudio.tsx`: per-avatar editor and shared preview.
- Small preview owner/bridge under Main/renderer realtime boundaries; extend
  existing typed IPC/broker rather than adding a new service or secret store.

Modify only related owners: AvatarProfile/avatar-config; config draft projection;
session snapshot/start-bundle validation; session adapter speed; realtime output,
runtime dependencies/owner, device router, playback completion and avatar audio
coordinator; Console navigation; local WASM build-copy/CSP handling and licenses.
Keep default and Raven rig bytes unchanged. Do not publish operator config as QA.

Delivery sequence:

1. Prove single-sink live-stream routing, real worklet processing, reset and
   device selection with a synthetic isolated harness.
2. Add settings/draft/snapshot wiring and Voice Studio with local sample tests.
3. Integrate live graph and the narrow provider-backed voice audition.
4. Run default-avatar/Raven acceptance; tune the two recipes; update evidence
   and relevant audio/UI harness facts. No completion on preview-only success.

## 6. Quality/performance acceptance

All numbers below are proposed gates, not benchmark results.

- DSP added direct-speech delay p95 <=180 ms after the operator's relaxation,
  measured by input/output signal timing, with <=40 ms overhead above the
  engine's reported latency. The former <=80 ms / preferred <=50 ms is superseded.
- Worklet p99 execution below 50% of the measured render-quantum duration; no
  underruns or growing buffers in a 30-minute avatar/scene workload.
- Interrupt signal -> local output mute <=50 ms; separately measure physical
  speaker tail. After resume, zero stale audio from the cancelled utterance.
- Lip-sync/direct-speech mismatch <=50 ms. Room tail may outlast mouth movement,
  but must finish within configured support plus DSP/device delay.
- Post-warmup memory bounded across 100 starts/stops/avatar switches; native
  audio graph count returns to baseline after disposal.
- Inspect and listen on both default rig and Raven v10; verify v8/v10 labels
  and that changing rig does not unexpectedly reset the voice preset.
- Numeric tests: pitch changes fundamental frequency while duration stays 1:1;
  formant changes preserve intended pitch; all permitted values produce finite
  output; bypass does not double the signal; gain/mute/output device affect the
  actual audible route. Include stop during WASM load and late provider audio.
- Provider test: configured voiceSpeed reaches session creation, defaults to 1,
  and unsupported/rejected config fails visibly. 0.75/1/1.25 settings are tested
  with equivalent synthetic requests; no exact duration ratio promised for
  independently generated responses. Validate speed/style by actual listening.
- Console computer use: choose default/Raven, apply preset, tweak each knob,
  A/B, generate, loop, stop, switch avatar, leave page, save/reload draft. Verify
  draft/publication isolation and live-start preemption of preview.
- Human acoustic QA: Mandarin consonants/tones, English sibilants, quiet voice,
  short and long replies, abrupt barge-in; no metallic warble, clipped words or
  muffled Raven dialogue at accepted presets. Re-test with the intended room
  speakerphone so transformed output does not break echo cancellation.
- Windows evidence does not certify Mac. Run the selected same build/asset
  combination on actual M4 and M6 hardware before claiming those deployments.

## 7. Review and handoff

Self-review corrections made before external review: distinguish provider speed
from generative style; remove neural layers and separate preset storage; keep
mic-free preview explicit; separate speech lip-sync from room-tail completion;
require effect-memory reset rather than gain-only interruption; do not pretend
screenshots or offline timing establish live sound quality.

Further self-review removed generated-audio recording/replay from v1, specified
the SDK-compatible silent input track, and made nested snapshot freezing and
selected-avatar draft merging explicit.

One Claude-in-Codex Fable review was launched. Windows retrieval initially failed
with `module 'os' has no attribute 'WNOHANG'`; the authorized persistent repair
recovered its result. It contains attempted tool-call text instead of critique:
verdict unknown, cost USD 0.265971. No second paid call was made; replacement
approval was requested. See [review evidence](../../testing/avatar-voice-effects-design-review-2026-09-09.md).
The later clock-in obtained the replacement external review and failed the
first routing proof. Following the operator's instruction to proceed, the
replacement source, DSP, Voice Studio and live output integration were built.
Current measured results and remaining human acoustic/performance gates are
recorded in the implementation report; code delivery is not acoustic acceptance.

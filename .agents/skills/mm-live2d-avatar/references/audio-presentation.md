# Audio clock, layout and media ownership

Repository implementation reference; installed code, current DECISIONS and focused contract tests outrank historical SDK/version observations. Follow AGENTS for execution policy.

## Output audio is the speaking clock

Drive lip sync from the Realtime remote audio, never transcripts or room-mic
input. The current processed-audio-output owner mutes the SDK receiver and sends one shared processing graph to AudioContext.destination. Use its speech/completion analysers; never add a second audible path. Keep lip-sync values bounded and
write the rig's declared LipSync parameter before `model.update()`.

Generation completion is not physical buffer completion; also wait for the processed output tail through its existing owner. Preserve raw
`output_audio_buffer.stopped` handling for Speaking -> Listening, idle timing,
rollover and farewell completion. On interruption/disconnect, clear mouth and
obsolete speaking motions with the audio path. See Realtime skill for privacy
flags; do not duplicate or weaken that configuration here.

RMS is the implemented fallback. Treat MotionSync as separate, explicitly
scoped integration; verify the vendored API, source sample rate and processing
order against its official sample before claiming support.

## Async layout and media ownership

Framing belongs to `avatar-framing.ts`: preserve CubismModelMatrix's initial
height fit and the model's explicit Layout. Draw/resize compose a fresh MVP,
never mutate the model matrix or branch on `getCanvasWidth() > 1` (export PPU
and horizontal padding must not change subject scale). Console and Mirror use
the same renderer. Test equivalent physical vertices across PPU values, Layout
width/height/translation, repeated draws and DPR/resize. Fixed height is not
automatic artistic crop acceptance: inspect extreme poses separately.

Model loading can finish after a preview resizes or changes state. Apply the
latest layout/state after initialization, not the values captured before
`await`. Dispose superseded models and ignore stale completion callbacks.
Serialize asynchronous rig replacement on a reused canvas. After releasing a
rig, remove its context from Cubism's offscreen mask pool; retained destroyed
targets caused a complete-looking ready status with only collar/hand visible.
Managed protocol images must set `crossOrigin = 'anonymous'` before `src`;
otherwise WebGL texture upload can fail despite successful image decoding.

Canvas size matters: compare backing width/height with current CSS size × DPR.
The 2026-09-05 RCA measured a stale 706×1256 preview backing store where 329×584
was expected. Texture dimensions, pixel fill, masks and model complexity can
all affect performance; measure rather than promising a universal FPS.

Preview must resolve saved-draft assets, including unpublished media, through
the managed draft path. Verify actual `readyState`, advancing playback time,
audio activity, frame counts/drops, and resource cleanup. A successful config
validation or a nonblack screenshot does not prove playback.

Dormant ambience and scene audio have distinct owners. On wake, pause/hide
dormant media as configured; on sleep, finish farewell before dormant. Normal
sleep is not a cloud failure and must not transiently claim OfflineLoop.

## Smallest relevant proof

Use focused unit tests for loading, ownership and stale callbacks. For visual
changes use [UI QA](../../mm-ui-qa/SKILL.md): real Electron rendering plus screenshot
inspection, and runtime playback assertions when media is involved. Preserve
synthetic-only captures and explicitly separate physical sound/smoothness and
operator acceptance from automation.

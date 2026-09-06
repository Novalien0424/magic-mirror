---
name: mm-live2d-avatar
description: Use for Magic Mirror Cubism rendering, output-audio lip sync, motions, expressions, presentation transitions, Web Audio routing, or designer asset validation. Not for unrelated Console forms or ordinary media-library metadata.
---

# Magic Mirror Cubism and presentation

[AGENTS.md](../../../AGENTS.md) owns execution policy and invariant IDs. This
reference records repository boundaries, not upstream version/license advice.
Check installed code first; consult official documentation when changing SDKs.
Windows evidence does not establish Mac performance or deployment readiness.

## Inspect the owner first

- Model loading/rendering: `src/renderer/avatar/cubism-avatar.ts`,
  `avatar-model-source.ts`, `AvatarCanvas.tsx`.
- Model contract: `src/main/avatar/model-bundle.ts`; bundled source assets in
  `resources/avatar/`, copied by `scripts/prepare-avatar-assets.mjs`.
- Audio/lifecycle coordination: `src/renderer/realtime/`; use
  [Realtime voice](../mm-realtime-voice/SKILL.md) when touching that boundary.
- Presentation and scene media: `src/renderer/avatar/PresentationStage.tsx` and
  `src/renderer/mirror/`; managed file access belongs to Main.

## Cubism contract

Use the vendored official Framework. Core is a proprietary global script,
not an ESM import; preserve the build copy and CSP path. Do not introduce a
wrapper or upgrade the SDK as an incidental fix.

Validate `.model3.json` and every referenced moc, texture, physics, motion and
expression file. EyeBlink/LipSync groups and the product's required lifecycle
motion groups are an explicit contract, not something every external rig has.
Reject unsafe paths and make missing/incompatible assets visibly fail.

Motion priority does not replace lifecycle ownership. Gate starts by current
state, cancel obsolete work, and keep expressions separate from body motions.
Parameter writes are order-dependent: body motion, physics, blink, expression
and mouth blending must be checked in the actual update loop before changing
their order. A body curve must not erase the final mouth value.

## Output audio is the speaking clock

Drive lip sync from the Realtime remote audio, never transcripts or room-mic
input. The SDK audio element is the audible path. An analyser tap must not also
connect to `destination` and double-play it. Keep lip-sync values bounded and
write the rig's declared LipSync parameter before `model.update()`.

Generation completion is not physical buffer completion. Preserve raw
`output_audio_buffer.stopped` handling for Speaking -> Listening, idle timing,
rollover and farewell completion. On interruption/disconnect, clear mouth and
obsolete speaking motions with the audio path. See Realtime skill for privacy
flags; do not duplicate or weaken that configuration here.

RMS is the implemented fallback. Treat MotionSync as separate, explicitly
scoped integration; verify the vendored API, source sample rate and processing
order against its official sample before claiming support.

## Async layout and media ownership

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
changes use [UI QA](../mm-ui-qa/SKILL.md): real Electron rendering plus screenshot
inspection, and runtime playback assertions when media is involved. Preserve
synthetic-only captures and explicitly separate physical sound/smoothness and
operator acceptance from automation.

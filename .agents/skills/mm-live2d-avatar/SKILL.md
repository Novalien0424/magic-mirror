---
name: mm-live2d-avatar
description: Use when implementing or reviewing Magic Mirror Live2D avatar rendering, actual-output-audio lip sync, Cubism and MotionSync motions or expressions, avatar state transitions, Web Audio routing, or designer asset deliverables.
---

# Magic Mirror Live2D Avatar

## Overview

Verified 2026-08-16. Use the official Cubism 5 SDK for Web R5 with the
MotionSync plugin R2. Build the RMS/AnalyserNode -> ParamMouthOpenY path first
(about 20 lines, unblocking Phase 3), then layer MotionSync after it.

## Reusable worker contract

Use this bounded contract for any implementation worker using this skill:

```text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: "implementer"
fresh_worker: true
task: one bounded mm-live2d-avatar unit with explicit non-goals
write_scope: exact task-named paths only; product, application, test,
             dependency, runtime, and report paths are read-only unless an
             exact future task write_scope explicitly names them
skills: .agents/skills/mm-live2d-avatar/SKILL.md,
        .agents/skills/mm-invariants/SKILL.md,
        .agents/skills/mm-realtime-voice/SKILL.md
self_invariants: 1, 8, 9, 10, 11, 12
evidence: exact changed files, concise diff summary, complete stdout/stderr
          and exit codes for every command, metadata-only risks
self_review: read the own diff and output; no more than 3 passes
root_review: external root gate after worker return; not part of self-review
```

Use `apply_patch` for every write. Do not delegate, spawn a child, create a
reviewer, or create a separate review role. The root thread performs the
external review. Keep evidence metadata-only: IDs, enums, counts, timings,
statuses, reasons, hashes, paths, and exit codes. Never put transcripts,
audio, extracted memory values, injected private context, credentials,
images, embeddings, or prompts containing user content in evidence, logs,
telemetry, or reports.

Check these applicable invariants on every behavior task: 1 (transcripts,
conversation audio, extracted memory values, and injected private context are
RAM-only), 8 (exactly one microphone owner with release then acquire), 9
(every ignore, drop, fallback, or degrade has a visitor-visible or
metadata-only reason), 10 (failures degrade without gating conversation or
unrelated adapters), 11 (runtime model IDs come only from versioned config
and never silently substitute), and 12 (Main reads credentials through
`safeStorage`; keys never enter renderer data, logs, telemetry, or exports).

## SDK, renderer, and loading rules

Use the official `CubismWebFramework` directly for full control of motion
managers and the MotionSync path. Avoid `guansss/pixi-live2d-display`, which
is stale and uses Pixi v6. If a Pixi wrapper is ever wanted, use only
`untitled-pixi-live2d-engine`, which is current on Pixi v8. Its
`-lipsyncpatch` forks use Pixi 7 and are a known trap.

Cubism Core (`live2dcubismcore.js`) is a proprietary global script. It is not
an npm package and must never be imported as ESM. MotionSync Core ships only
in the manual download and expects the SDK as a sibling directory. Commit or
vendor both, add an explicit build step, and allow the global script in CSP.

The publication license applies only at release. Small-scale users with
sales below 10M JPY are exempt; the single-venue prototype owes nothing.
Accept the SDK agreements at download.

## Actual-output-audio lip sync

Use the fallback-first analyser path on the Realtime remote stream. The
actual output audio is the clock: do not drive mouth motion from subtitle or
transcript timing. The SDK audio element is the only audible path and stays
unmuted. Make the analyser a silent tap from
`audioElement.srcObject` with `audioCtx.createMediaStreamSource(...)` and an
`AnalyserNode`; never connect that tap to `destination`, because doing so
would double-play audio. Drive it from the WebRTC remote track, never a room
mic, to avoid feedback.

On WebRTC, `audio_stopped` means generation is done, not that speaker output
has ended. Use raw `output_audio_buffer.stopped` through
`session.transport.on(...)` as the true playback-end boundary when
coordinating Speaking -> Listening, the idle timer, or safe rollover.

Build the RMS path first:

```ts
// Dedicated CubismMotionManager for the mouth.
const rms = computeRms(analyserData);            // 0..1, per frame
model.addParameterValueById(lipSyncId, rms, 0.8); // official sample blend weight
// Call before model.update(); a value outside 0..1 silently breaks lip sync.
```

Lip-sync parameter IDs come from `model3.json` `Groups -> LipSync` through
`GetLipSyncParameterId(i)`; the usual ID is `ParamMouthOpenY`. Keep the value
in the 0..1 range and call the mouth write before `model.update()`.

For MotionSync R2, process each frame in this order:

```text
push samples -> setSoundBuffer(idx, buf, 0) ->
updateParameters(model, dt) -> splice off getLastTotalProcessedCount()
```

Feed `SetSampleRate` the source stream sample rate. Using
`AudioContext.sampleRate` desynchronizes the result; the official sample
warns about this. The RMS/AnalyserNode lip-sync path remains first, with
MotionSync layered after it.

When audio is interrupted or disconnected, zero the mouth parameter and stop
pending speaking motions in the same frame that audio stops. This preserves
the audio-to-mouth stop-sync requirement.

## States, motions, and parameter order

Use these eight avatar states:

```text
Dormant, Waking, Listening, Thinking, Speaking, Scene, Suspending,
OfflineLoop
```

`OfflineLoop` is the video asset, not Live2D.

Start motions with
`CubismMotionManager.startMotionPriority(motion, autoDelete, priority)`.
Priority is advisory only: the manager does not stop a lower-priority motion
from starting. Lifecycle code must gate which motion may start in each state;
otherwise idle behavior can stomp speaking behavior. Treat priority as state
gating, not as a state machine.

Load `.exp3.json` expressions through `CubismExpressionMotion` on its own
motion manager. Its modes are Add, Multiply, and Overwrite; expressions are
static and have no curves.

Create blink with `CubismEyeBlink.create(setting)`, which reads
`Groups -> EyeBlink`. `setBlinkingInterval(sec)` randomizes the interval from
0 to 2 times the supplied value, providing natural variance for free.

Use `CubismBreath` with `BreathParameterData` for breath and micro head
motion. Sample defaults are:

```text
ParamBreath:      0.5 / 0.5 / 3.23s
ParamAngleX:     +/-15 degrees / 6.53s
ParamAngleY:      +/-8 degrees / 3.53s
ParamAngleZ:     +/-10 degrees / 5.53s
ParamBodyAngleX:  +/-4 degrees / 15.53s
```

Parameter writes are additive and order-dependent. Apply all of these before
`model.update()` in this order:

```text
breath -> blink -> expression -> lip sync
```

Use `CubismFramework.initialize(1024*1024*32)`. Under-allocation makes
models silently stop updating.

Never use one motion manager for all curves: body `motion3` curves can
overwrite lip-sync writes. The mouth needs its own `CubismMotionManager`, and
expressions use their own manager as described above.

## Designer asset contract

Hand these required deliverables to the artist:

- `.moc3`
- `.model3.json`, with `Groups` entries for both `EyeBlink` and `LipSync`,
  and `Motions` groups named for the avatar states
- Texture atlas PNG files
- One `.motion3.json` per motion, with fades authored in the Editor
- One `.exp3.json` per expression
- `.physics3.json`
- `.motionsync3.json` when MotionSync is used; author it in Editor 5+ against
  a 16-bit, 44.1 kHz WAV

The stable Editor version is 5.3.

## Performance and verification notes

The target is 60 FPS on M4. Texture or canvas size does not matter. The cost
order is parameters per object (keep multiplicative blends at 2 or fewer and
use blend shapes), polygon count, ArtMesh count, deformer depth, blend modes,
then masks.

Physics evaluates at the real frame rate, so Editor preview is not runtime.
Bake critical sway into motions when determinism matters. One detailed model
at 60 FPS on Apple Silicon is expected but unbenchmarked; measure FPS in the
Console from day one because telemetry already requires it.

Keep privacy flags explicit in the voice path: set
`historyStoreAudio: false`, `tracingDisabled: true`, and server-side
`config.tracing = null` before connect. The Main environment uses
`OPENAI_AGENTS_DISABLE_TRACING=1`, `OPENAI_AGENTS_DONT_LOG_MODEL_DATA=1`,
and `OPENAI_AGENTS_DONT_LOG_TOOL_DATA=1`; do not set
`DEBUG=openai-agents*` in production. Final transcripts, conversation audio,
extracted memory values, and injected private context remain RAM-only.

Every ignore, drop, fallback, or degrade must be visitor-visible or a
metadata-only Console event with a reason. Camera, extractor, or single
adapter failure must not block conversation or unrelated adapters; failures
degrade visibly.

## Non-negotiable mistakes to avoid

- Do not drive the mouth from subtitle or transcript timing. Use the
  analyser on actual output audio only (Spec section 9.1).
- Do not use one motion manager for everything; body `motion3` curves can
  overwrite lip-sync writes, so the mouth gets its own manager.
- Do not trust `startMotionPriority` to police states; it does not. The state
  machine must gate motions.
- Do not bundle Cubism Core as an import. It is a global script; handle it in
  CSP and the build configuration.

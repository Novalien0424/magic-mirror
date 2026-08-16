---
name: mm-live2d-avatar
description: Use when implementing the Live2D avatar — rendering, lip sync from live audio, motions/expressions/blink/breath, avatar state transitions, the Web Audio graph, or specifying designer asset deliverables (Phase 3).
---

# Live2D Avatar & Audio-Driven Lip Sync — Magic Mirror Reference

## Overview

Verified **2026-08-16**. Baseline: official **Cubism 5 SDK for Web R5** +
**MotionSync plugin R2**, with an RMS/AnalyserNode → `ParamMouthOpenY` path
built FIRST (≈20 lines, unblocks Phase 3) and MotionSync layered on after.
License: publication license only applies at release, and small-scale
(<¥10M sales) users are exempt — the single-venue prototype owes nothing;
accept the SDK agreements at download.

## Renderer Choice

Use the official `CubismWebFramework` directly (full control of motion
managers, needed for MotionSync). Avoid `guansss/pixi-live2d-display`
(stale, Pixi v6). If a Pixi wrapper is ever wanted: only
`untitled-pixi-live2d-engine` (Pixi v8) is current; the `-lipsyncpatch`
forks are Pixi 7 — a known trap.

Vendoring: Cubism Core (`live2dcubismcore.js`) is a proprietary global
script (not npm, not ESM); MotionSync Core likewise ships only in the manual
download and expects the SDK as a sibling directory — commit/vendor both
with an explicit build step and CSP allowance.

## Lip Sync (mouth follows ACTUAL audio — invariant: audio is the clock)

Fallback-first path — analyser on the Realtime remote stream (see
`mm-realtime-voice` for the Web Audio graph):

```ts
// dedicated CubismMotionManager for mouth, so body motions can't fight it
const rms = computeRms(analyserData);            // 0..1, per frame
model.addParameterValueById(lipSyncId, rms, 0.8); // 0.8 = blend weight (official sample)
// call BEFORE model.update(); value outside 0..1 silently breaks lip sync
```

- LipSync param IDs come from `model3.json` `Groups → LipSync`
  (`GetLipSyncParameterId(i)`), typically `ParamMouthOpenY`.
- MotionSync R2 (per-frame): push samples → `setSoundBuffer(idx, buf, 0)` →
  `updateParameters(model, dt)` → splice off `getLastTotalProcessedCount()`.
  Feed the **source stream's sample rate** via `SetSampleRate` — using
  `AudioContext.sampleRate` desyncs (official sample warns). Drive it from
  the WebRTC remote track, never a room mic (feedback).
- Interrupt/disconnect: zero the mouth param and stop pending speaking
  motions in the same frame the audio stops (NFR: audio→mouth stop sync).

## States, Motions, Idle Life

Eight states: Dormant, Waking, Listening, Thinking, Speaking, Scene,
Suspending, OfflineLoop (OfflineLoop is the video asset, not Live2D).

- Motions: `CubismMotionManager.startMotionPriority(motion, autoDelete,
  priority)` — **priority is advisory only**; the manager will NOT stop a
  lower-priority motion from starting. Our lifecycle code gates which motion
  may start per state, or idle stomps speaking.
- Expressions: `.exp3.json` via `CubismExpressionMotion` on its **own**
  motion manager (Add/Multiply/Overwrite; static, no curves).
- Blink: `CubismEyeBlink.create(setting)` reads `Groups → EyeBlink`;
  `setBlinkingInterval(sec)` randomizes 0–2× — natural variance for free.
- Breath + micro head motion: `CubismBreath` with `BreathParameterData`
  (sample defaults: ParamBreath 0.5/0.5/3.23s, ParamAngleX ±15°/6.53s,
  ParamAngleY ±8°/3.53s, ParamAngleZ ±10°/5.53s, ParamBodyAngleX ±4°/15.53s).
- Parameter writes are **additive and order-dependent**: breath → blink →
  expression → lip sync, all before `model.update()`.
- `CubismFramework.initialize(1024*1024*32)` — under-allocation makes models
  silently stop updating.

## Designer Deliverables (hand this list to the artist)

`.moc3`, `.model3.json` (MUST contain Groups for EyeBlink + LipSync, and
Motions groups named per our states), texture atlas PNGs, `.motion3.json`
per motion with fades authored in Editor, `.exp3.json` per expression,
`.physics3.json`; MotionSync adds `.motionsync3.json` (Editor 5+, authored
against 16-bit/44.1 kHz WAV). Editor stable: 5.3.

## Performance (60 FPS target on M4)

Texture/canvas size does NOT matter. Cost order: parameters-per-object
(keep multiplicative blends ≤2 — use blend shapes), polygon count, ArtMesh
count, deformer depth, blend modes, masks. Physics evaluates at real frame
rate — Editor preview ≠ runtime; bake critical sway into motions if
determinism matters. 60 FPS with one detailed model on Apple Silicon is
expected but unbenchmarked — measure FPS in Console from day one (telemetry
already requires it).

## Common Mistakes

- Driving mouth from subtitle/transcript timing — forbidden; analyser on
  actual output audio only (Spec §9.1).
- One motion manager for everything — body `motion3` curves overwrite
  lip-sync writes. Mouth gets its own manager.
- Trusting `startMotionPriority` to police states — it doesn't; the state
  machine does.
- Bundling Cubism Core as an import — it's a global script; handle in CSP +
  build config.

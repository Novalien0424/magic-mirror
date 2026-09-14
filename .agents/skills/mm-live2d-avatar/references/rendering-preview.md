# Cubism contract and Console preview

Repository implementation reference; installed code, current DECISIONS and focused contract tests outrank historical SDK/version observations. Follow AGENTS for execution policy.

## Inspect the owner first

- Model loading/rendering: `src/renderer/avatar/cubism-avatar.ts`,
  `avatar-model-source.ts`, `AvatarCanvas.tsx`.
- Model contract: `src/main/avatar/model-bundle.ts`; bundled source assets in
  `resources/avatar/`, copied by `scripts/prepare-avatar-assets.mjs`.
- Dedicated Console tester: `src/renderer/console/CubismStudio.tsx`,
  `src/renderer/avatar/cubism-preview.ts`; managed library discovery/import
  lives in `src/main/avatar/model-import.ts` via Console-only typed IPC.
- Audio/lifecycle coordination: `src/renderer/realtime/`; use
  [Realtime voice](../../mm-realtime-voice/SKILL.md) when touching that boundary.
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

The dedicated Live2D Cubism section loads a local silent preview, not the live
Mirror or a published character. List validated managed imports independently
of draft assignment; invalid bundles need a visible skipped reason/count.
Load every motion group/index (lifecycle defaults still use index zero), every
expression and actual MOC parameters. Use Core bounds/defaults/readback; HTML
range steps must not quantize valid values (`step="any"` preserves defaults).
Preview-only parameter overrides follow automatic effects. Reset stops
motions/expressions and restores defaults; replacement, unload and page leave
cancel timed tests and release the canvas. Keep these controls opt-in, out of
the normal Mirror. An exported writable parameter need not have visible art;
Raven's Speaking clip needs separate mouth input to open the beak.

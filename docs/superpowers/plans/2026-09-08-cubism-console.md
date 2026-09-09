# Dedicated Cubism Console

User request: select/load the existing avatar or Raven, browse/import bundles,
and test every exported action through a separate Console section. Windows.

## Design

- Top-level **Live2D Cubism** page with a local portrait preview and explicit
  selected/loaded names. Built-in Ren plus validated managed imports remain
  discoverable after restart, independently of draft publication.
- Enumerate every motion (group + index), expression and actual MOC parameter.
  Show individual play/test buttons, parameter sliders/min/default/max, a
  cancellable range test, and Stop/reset. Speaking motion alone does not move
  Raven's beak; expose its declared mouth parameter directly.
- Use the existing Cubism renderer, managed protocol and native import picker.
  Preview controls are opt-in and cannot modify the Mirror, acquire the mic,
  publish drafts or change character/voice settings.
- Keep a stable canvas during model replacement; dispose obsolete loads and
  cancel tests when replacing/unloading a model or leaving the section.
- Apply preview parameter overrides after automatic effects and mouth blending.
  Reset returns actual parameter defaults and stops motions/expressions.

## Research

RAVEN-AVATAR-HANDOFF.md: v07, seven motions, five expressions; gaze/blink/beak
need external control. Existing renderer only loads motion index zero.
Vendored CubismModel exposes parameter IDs/count/min/max/default and indexed writes.
Official references: [motions](https://docs.live2d.com/en/cubism-sdk-manual/motion/),
[expressions](https://docs.live2d.com/en/cubism-sdk-manual/expression/).
Expressions are blended separately from body motions; enumerate model exports
instead of relying on Ren's fixed lists.

## Implementation and proof

1. Add validated managed-library listing and Console-only IPC; test restart
   discovery, missing/corrupt assets, unsafe roots and sender/payload rejection.
2. Extend renderer with indexed motion loading and opt-in preview controls;
   test enumeration, clamping, unknown IDs and reset/cancellation behavior.
3. Add page and controls, focused tests, typechecks and production build.
4. Preserve current unsaved draft before restarting canonical Electron. Use
   native computer use to select/load Ren and Raven, exercise actions and
   inspect framing/status; retain a focused Windows evidence report.

No phase promotion. Physical voice/tracking acceptance is outside these local
rig tests. Invariants 1, 8, 9, 10, 12 and managed-file/sender boundaries apply.

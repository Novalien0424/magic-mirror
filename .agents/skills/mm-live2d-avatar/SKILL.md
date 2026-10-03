---
name: mm-live2d-avatar
description: "Implement or review Magic Mirror Cubism rendering, motion/expression control, lip sync, framing or presentation media."
---

# Cubism and presentation

Use the vendored Framework/Core and current model importer contract. Motion, expression, physics and mouth writes are order-dependent; inspect the update loop before changing it.

- Model loading, safe asset references, motions, actual MOC parameters and silent Console preview: [rendering/preview](references/rendering-preview.md).
- Output-audio lip sync, layout/resize, async rig disposal or scene/dormant media: [audio/presentation](references/audio-presentation.md).
- Character intent, restrained acting, parameter ownership, AI references and motion acceptance: [performance audit](references/performance-audit.md). Use for unnatural movement or a new performance version; establish the state brief before changing curves.

Console preview does not publish a character or switch the live Mirror. Preserve operator drafts. Actual output audio drives the mouth; generation/transcript/mic input is not the speaking clock. The shared processed output is the sole audible path.

Framing preserves model height fit and explicit Layout; draw/resize compose MVP without mutating the model matrix. Writable MOC IDs and ready status do not prove visible artwork. Use focused ownership checks and [UI QA](../mm-ui-qa/SKILL.md) for actual visual changes; distinguish Windows render evidence from physical sound, artistic acceptance and Mac readiness.

Do not report “natural”, “flawless” or visually accepted from JSON ranges, unit tests, generated stills or historical screenshots. State exactly which current rendering was inspected and which rig/artwork limitations remain.

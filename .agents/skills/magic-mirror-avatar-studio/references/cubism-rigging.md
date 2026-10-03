# Cubism rigging router and parameter contract

Start from a PSD that actually imports correctly. Preserve the source PSD and `.cmo3`; choose a target supported by the actual initialized Core before authoring. Newer Editor files are not necessarily editable in older versions; target selection is not a lossless source downgrade.

| Work | Guide |
|---|---|
| Mesh, hierarchy, Head XY and repair | [modeling practice](cubism-modeling-practice.md) |
| Blink, mouth, interpolation and optional Motion-sync | [eyes/mouth](cubism-eyes-mouth.md) |
| Physics, motions, expressions, atlas and export | [animation/export](cubism-animation-export.md) |
| Missing feature knowledge | [learning map](cubism-learning-map.md) |
| Product-specific mapping and compatibility | [project contract](magic-mirror-contract.md) |

## Standard parameters

Preserve standard ranges in the model. Smaller initial animation amplitudes are authoring choices, not instructions to change runtime clamps.

| IDs | Min / default / max | Initial motion amplitude, if suitable |
|---|---|---|
| `ParamAngleX/Y/Z` | -30 / 0 / 30 | X ±25, Y -18..20, Z ±12 |
| `ParamEyeLOpen`, `ParamEyeROpen` | 0 / 1 / 1 | Full range |
| `ParamEyeLSmile`, `ParamEyeRSmile` | 0 / 0 / 1 | Full range |
| `ParamEyeBallX/Y`, `ParamBrowLY/RY` | -1 / 0 / 1 | Full range |
| `ParamMouthForm` | -1 / 0 / 1 | Full range |
| `ParamMouthOpenY` | 0 / 0 / 1 | Full range |
| `ParamCheek` | 0 / character-specific / 1 | Default 0 when appropriate |
| `ParamBodyAngleX/Y/Z` | -10 / 0 / 10 | X/Z ±8, Y ±6 |
| `ParamBreath` | 0 / 0 / 1 | Small visible breath |
| `ParamHairFront/Side/Back` | -1 / 0 / 1 | Physics-driven |

Parameter group names are organizational suggestions, not importer requirements. Positive head X/Z and gaze X screen directions are distinct from anatomical L/R; verify both. Source: [standard parameters](https://docs.live2d.com/en/cubism-editor-manual/standard-parameter-list/).

## Ownership

Inspect the current runtime update chain and explicit model profile. Eye-open expressions need intentional Add/Multiply behavior with blink; do not add a second blink controller. Remote output RMS drives `ParamMouthOpenY`: the default blend is 0.8; Raven V11 uses full replacement for reliable closure. Expressions, state motions and physics must not leave upstream mouth-open values. Silence still needs actual closure verification. Expression owns MouthForm/brows/cheek; physics owns designated outputs only when enabled by the profile. Head motion does not imply tracking support. See [performance ownership](performance-ownership.md).

Deliver meaningful `Dormant`, `Waking`, `Listening`, `Thinking`, `Speaking`, `Scene`, `Suspending` motions and `exp_01`…`exp_05` references. Record parameter owners, first motion file, fades, loop intent, completion behavior, physics normalization/order/FPS and actual Viewer reload. Editor/Viewer looping is separate from product runtime behavior.

The bundle contains `.model3.json`, genuine `.moc3`, textures, physics, motions and expressions, plus referenced optional pose/display/user data. Source `.cmo3`/`.can3` and `paramctrl3` are not embedded substitutes. Advanced blend/offscreen features require compatible Core and Framework/renderer; replacing Core alone is insufficient. ArtPath `SDK(N/A)` is not Web support.

Verify neutral/extreme/combined forms, masks, physics decay and actual Viewer reopen. Default acceptance ends with bundle validation and normal Magic Mirror import/display. Product speech, interruption, reload and performance checks belong only to separately authorized `product-integration`. See [acceptance](acceptance-resume.md).

The [external API](https://docs.live2d.com/en/cubism-editor-manual/external-application-integration-api/) has permission, transient UID and buffering limits; it is not a full authoring/export API. Consult current schema before using it. [Target versions](https://docs.live2d.com/en/cubism-editor-manual/target-version-selection/), [embedded export](https://docs.live2d.com/en/cubism-editor-manual/export-moc3-motion3-files/).

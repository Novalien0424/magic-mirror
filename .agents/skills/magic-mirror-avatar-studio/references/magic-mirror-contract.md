# Magic Mirror integration contract

This is a maintainable repository snapshot, not authority over current AGENTS/code. The original survey was 2026-09-07; processed-output guidance follows the 2026-09-09 implementation.

| Boundary | Owner |
|---|---|
| Bundle validation | `src/main/avatar/model-bundle.ts` |
| Safe import/copy | `src/main/avatar/model-import.ts` |
| Render/update chain | `src/renderer/avatar/cubism-avatar.ts` |
| Default model/state mapping | `src/renderer/avatar/avatar-model-source.ts` |
| UI/canvas | `src/renderer/avatar/AvatarCanvas.tsx` |
| Output clock | `src/renderer/realtime/` |
| Vendored SDK and bundled art | `src/vendor/live2d/SDK_VERSION`, `resources/avatar/Ren/`, `scripts/prepare-avatar-assets.mjs` |

## Compatibility and bundle

Raven's versioned masters are indexed in [resources/avatar/Raven/README.md](../../../../resources/avatar/Raven/README.md): canonical editable source is `v10/cubism/raven-lord-v09.cmo3`; V11 changes performance on V10's MOC. New authoring gets a new `vN/`.

SDK labels and `.d.ts` declarations are not initialized binary evidence. Core APIs such as `csmGetVersion`, `csmGetLatestMocVersion`, `csmGetMocVersion` and Framework `getMocVersionFromBuffer` can establish actual compatibility through a supported runtime check. Select the matching Editor target; do not upgrade Core or overwrite source with a downgrade merely to satisfy a label.

Native validation requires Version 3, Moc, nonempty Textures and Expressions, Physics, Parameter groups named EyeBlink/LipSync with nonempty IDs, and at least one file in each required motion group. Extra motion groups are allowed. Lifecycle uses the first motion; Console may expose all indices.

| Group | Intended action | Historical default expression |
|---|---|---|
| Dormant | Quiet idle | exp_03 |
| Waking | Gentle engagement | exp_01 |
| Listening | Stable attention | exp_01 |
| Thinking | Small thinking pose | exp_05 |
| Speaking | Head/shoulder motion | exp_01 |
| Scene | Scene posture | exp_02 |
| Suspending | Relaxed finish | exp_03 |

Use current per-model/config mapping if it differs. The direct-compatible profile provides `exp_01`…`exp_05` including Console-only exp_04; native minimum validation alone does not enforce this profile. Do not copy Ren's values and claim they fit a new rig.

Both `ParamEyeLOpen/ROpen` belong to EyeBlink when both eyes exist; `ParamMouthOpenY` belongs to LipSync, normally 0 closed to 1 open. IDs must exist and deform in the actual MOC. State motion excludes live mouth/effect curves; [performance ownership](performance-ownership.md) owns Raven's overrides and blink mixing.

## Paths and import

Relative POSIX references only: no dot/traversal segments, backslashes, absolute URLs or symlinks. In the importer snapshot, path components begin with ASCII alphanumeric/underscore, contain only those plus hyphen/space/dot, never end with space/dot, and total path length is at most 256. Limits: manifest 1 MiB, each asset 128 MiB, bundle 512 MiB, up to 255 referenced files; current validator owns exact limits. Referenced Pose/UserData/DisplayInfo must also resolve. Keep PSD/CMO/evidence outside runtime.

Use current Console import controls; do not rely on old navigation labels. Imported copies reside under managed userData `assets/avatars/model-{uuid}` and load through the Main allowlist protocol `magic-mirror-media://avatar/{id}/{file}`. Do not edit managed copies directly or publish unrelated drafts. Repository asset placement alone does not activate a rig; the build copy remains explicitly configured.

## Product integration only when scoped

Default `avatar-import-display` stops after valid bundle, normal import and observed display of this new model. Voice/wake/reload/performance are out of scope unless explicitly requested.

Use the [output audio clock](../../mm-live2d-avatar/references/audio-presentation.md#output-audio-is-the-speaking-clock) and [performance ownership](performance-ownership.md) for speech integration. Avatar failure degrades visibly without gating speech.

Use [validate-bundle.mjs](../scripts/validate-bundle.mjs) for static checks and [acceptance](acceptance-resume.md) for observed display. Static success is not Core compatibility, visible deformation or human acceptance.

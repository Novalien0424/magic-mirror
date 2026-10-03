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

Both `ParamEyeLOpen/ROpen` belong to EyeBlink when both eyes exist; `ParamMouthOpenY` belongs to LipSync, normally 0 closed to 1 open. IDs must exist and deform in the actual MOC. State motion excludes live mouth/effect curves. Authored eyelids require explicit state ownership that disables automatic blink, as in Raven V11 sleep/wake states; expressions use intentional blink mixing. Meaningful seven-state motion is not seven renamed empty files.

## Paths and import

Relative POSIX references only: no dot/traversal segments, backslashes, absolute URLs or symlinks. In the importer snapshot, path components begin with ASCII alphanumeric/underscore, contain only those plus hyphen/space/dot, never end with space/dot, and total path length is at most 256. Limits: manifest 1 MiB, each asset 128 MiB, bundle 512 MiB, up to 255 referenced files; current validator owns exact limits. Referenced Pose/UserData/DisplayInfo must also resolve. Keep PSD/CMO/evidence outside runtime.

Use current Console import controls; do not rely on old navigation labels. Imported copies reside under managed userData `assets/avatars/model-{uuid}` and load through the Main allowlist protocol `magic-mirror-media://avatar/{id}/{file}`. Do not edit managed copies directly or publish unrelated drafts. Repository asset placement alone does not activate a rig; the build copy remains explicitly configured.

## Product integration only when scoped

Default `avatar-import-display` stops after valid bundle, normal import and observed display of this new model. Voice/wake/reload/performance are out of scope unless explicitly requested.

Remote output RMS/envelope is the mouth clock, never transcripts or room microphone. Current `processed-audio-output.ts` mutes the SDK receiver and sends one shared graph to AudioContext.destination. Use its analysers and processed-tail completion, preserving mouth reset on interruption/disconnect. Preserve profile-specific ownership: default mouth blend 0.8, Raven V11 full replacement. No second mic/audio owner. Private content remains RAM-only with audio history/tracing disabled. Avatar failure degrades visibly without gating speech.

Use [validate-bundle.mjs](../scripts/validate-bundle.mjs) for static checks and [acceptance](acceptance-resume.md) for observed display. Static success is not Core compatibility, visible deformation or human acceptance.

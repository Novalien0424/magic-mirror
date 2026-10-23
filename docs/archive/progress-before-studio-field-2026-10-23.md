# Magic Mirror — current handoff, 2026-10-23

Latest delivery on `field/macmini-deploy`: six-key Neo profile **Magic Mirror
copy 1**, selected/default. **STUDIO** replaces the clipped label; top-right
**DESKTOP** shows the portrait macOS desktop, suspends voice/wake/camera/media and
preserves Console edits. START/STUDIO/PLAY LOOP/CONSOLE return to their selected
functions. Every visible control checks Mac T749 orientation 90°; Android remains
`user_rotation=2`. STOP retains black HDMI, TV standby, process/mouse cleanup and
Jabra output 70% read-back.

Default soul art is now **modern minimalist multicolour vector-style illustration**.
Published Raven **v21** and code default match. Only the style/version changed;
unrelated saved draft edits and the previous active config were preserved.

Final runtime: normal Electron **stopped**, T749 black cover active, TV standby,
mouse released, matching task-entry state. Jabra output reads **70.08%**, unmuted;
Jabra remains default input/output. The temporary QA audio guard lost the initial
internal Mac speaker volume after device IDs changed; its final value is **1%**.
The guard was repaired and the native rerun restored its captured values; the
original internal-speaker level is unknown. No input-gain changes were made.

Canonical build **17:11:31 Taipei**: source `b71a30bdc7a71f12`, output
`0605c6026f90f125`. Build verification passes. Six signed wrappers and the updated
native helper are installed; next start uses this build. No extra restart owner.

## Evidence

- **269 distinct focused tests**, node/web typecheck, syntax and build checks pass.
- Real isolated Electron operator journey **24/24**, exit 0, 17 captures.
  Desktop hides both windows/media, retains unsaved edits and returns through all
  mode buttons. Desktop status/Return to Avatar visually reviewed.
- Deployed Mac/TV sequence **10/10**, exit 0: Desktop interleaved with START,
  STUDIO, PLAY LOOP, CONSOLE and final STOP. Expected mode/window counts, TV awake
  or standby, portrait 1080×1920, mouse and black/audio read-backs passed.
- Connected Neo editor shows readable STUDIO/DESKTOP and the correct Desktop app
  target. Physical new-key press and human-microphone acceptance remain separate.

[Desktop journey, failures, preservation and QA](../testing/stream-deck-desktop-2026-10-23.md) ·
[Full failures](../testing/stream-deck-desktop-failures-2026-10-23.txt) ·
[Prior Studio/STOP delivery](progress-before-desktop-2026-10-23.md).

The preceding USB camera check enumerated Arducam but received zero frames in
40-second minimum-mode and 20-second 1080p captures (`camera_frames_missing`).
That hardware/runtime issue remains unresolved and was not retested here.

## Cleanup and next action

Three owned QA runs were reviewed and cleaned: **252 files / 37,182,094 bytes**,
excluding markers. Task scratch files are cleaned; failure metadata stays linked
above. Existing soul deliverables and AI_Stuff/AI_Avatar Drive upload are
preserved. No implementation remains for Desktop/label/style. Operator can start
with the Neo and may publish their preserved unrelated draft when ready.
Printing remains the requested deferred/no-op skill. [TODO](../../TODO.md) owns unrelated
acceptance; [DECISIONS](../../DECISIONS.md) owns other rulings. No phase promotion.

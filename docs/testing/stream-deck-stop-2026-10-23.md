# Stream Deck STOP: black HDMI and Jabra output

Requested operator journey (2026-10-23): press STOP from Conversation, Studio or
Loop Video; T749 HDMI becomes black before Electron windows close, the existing
TV standby and process cleanup complete, and Jabra Speak2 75 output returns to
70%. Pressing STOP again retains the same state. START, LOOP, STUDIO or CONSOLE
removes the black surface only after the app is ready and Main acknowledges the
requested mode. The operator monitor stays available.

Cause: the former sequence slept the TV and unloaded Electron, leaving the Mac
HDMI desktop behind it. It contained no output-volume reset.

Self-review: cover the HDMI receiver only, never all screens; keep the existing
LaunchAgent as Electron's sole restart owner. Run screen, TV, app, mouse and audio
cleanup independently so one failed adapter cannot skip the others. Target Jabra
output directly, verify its scalar, and preserve mute, input gain and default
devices. The native black helper owns no microphone or credentials, uses one
process lock and exits when its cover marker is cleared. Missing hardware produces
metadata failure instead of silently modifying a fallback device.

Changes: `stop-state.swift` and its signed per-user installer,
`mirror-stop-state.mjs`, existing button wiring/sequence and operator docs.
Focused checks: 115 button/TV tests passed; native compile/sign verification passed.
Fresh Mac evidence at approximately 16:25 Taipei:

- Installed the ad-hoc signed helper under the existing per-user `MagicMirror/ops`
  directory. The Stream Deck installer now installs it alongside the wrappers.
- Native cover reported one T749 display. CUA screenshot showed a completely black
  1080×1920 HDMI surface, without desktop, menu bar, Dock, captions or cursor.
- Ran the production `operateMirrorControl` actions with the same real button,
  native cover, TV and mouse IO, under the Electron lease. The completion chime was
  omitted so testing the 70% postcondition produced no high-volume test sound.
  First STOP: `stopped`, `tv_standby`, `blackout_covered`, `mouse_stopped`,
  `jabra_output_70`. Second STOP: `already_off` with the same successful device
  postconditions. No retries were required.
- CoreAudio read-back: **0.7007718682** (70.08%, device representation of 70%).
  Jabra input gain, other input gains and default input/output devices match the
  captured pre-test values. Output mute was restored and independently checked.
  During restoration, setting macOS output to 1% had also muted Jabra; this QA-only
  side effect was detected, repaired and added to the restoration guard. A direct
  reset at 70% preserved the restored mute state.
- Restarted through the same sequence: `studio_ready`, then `loop_playing`;
  both TV wake and mode acknowledgements passed. The black helper exited after
  clear. Production UI confirms Interactive Studio mode, Loop Video playing,
  published v20; saved operator draft/config hashes are unchanged. Jabra is left
  at the requested 70%, with its original unmuted state.

The installed STOP wrapper still calls the canonical stop script. The physical
Stream Deck key was not pressed by a human in this check; its existing mapping and
production handler were checked separately. The Mac screenshot and Android power
state are evidence for their respective boundaries, not an external camera or
HDMI signal-analyser measurement. No phase promotion.

# Stream Deck layout, global STOP and Console — 2026-10-17

Owner revision: fix PLAY LOOP overflow; move STOP to the Neo's bottom-right
key, label it exactly STOP and apply it to all Magic Mirror programs; add a
control to bring Console onto the mirror display.

Installed layout: START `(0,0)`, CONSOLE `(1,0)`, PLAY LOOP `(2,0)`, STOP `(3,1)`.
PLAY LOOP now uses two short lines and the artwork has additional padding above
the title. The generated SVG was rasterized and inspected; device label settings
and icon hashes were verified after Stream Deck relaunched. The original profile
root/default page was preserved. A backup of the pre-change Magic Mirror profile
is under the local MagicMirror backups directory outside the repository.
AppKit measurements using system bold and Arial bold also put every title line
inside a 64-pixel safe width on the 72-pixel key; actual device rendering remains
a separate physical observation.

CONSOLE uses the same serialized queue, private fixed-command mailbox and
LaunchAgent. It waits for the existing Console renderer, positions it in the
mirror display's work area and raises it one native window level above Mirror.
It preserves current playback and unsaved edits; repeated presses show/focus.
START/PLAY LOOP hide Console and return to the mirror view. Hidden Console keeps
its window level so reopening through the existing keyboard shortcut remains
visible above Mirror. No new IPC privilege, daemon, dependency or restart owner.

STOP retains the full application shutdown/process-family release path and TV
standby. It does not enumerate media types: every current or future mode owned
by Magic Mirror must participate in Main's existing shutdown. It does not close
unrelated Mac applications. Standby remains Android Asleep/display OFF, not mains
power-off.

## Verification

- 137 queue/client/TV tests passed; 65 Main/mailbox tests passed: **202 focused
  tests, 5 files**, all exit 0. Node typecheck and stamped build pass. Renderer
  source was unchanged; prior web typecheck evidence is retained.
- Profile generator and shell syntax checks passed, including fixed executable
  Console chain, exact four positions/titles, stable existing action/profile
  IDs, padded SVGs, missing-app rejection and default-profile preservation.
  Initial worker fixture failure was macOS `/var` versus `/private/var` alias
  normalization; corrected fixture passed. No product failure was hidden.
- First real Electron run: **14/14 cases, 10 captures, exit 0**.
  [Run](../../.artifacts/phase4-qa/2026-10-17T08-18-07-096Z).
  Console was visible/focused/always-on-top on the portrait Mirror display.
  Repeated show preserved an unsaved 43% volume edit and the same loop generation;
  video decoded 60 more frames with none dropped while Console was overlaid.
  Existing loop playback, independent music, one reload, repeated-failure black
  and saved-avatar return cases also passed. Console capture inspected.
- Final real Electron run after retaining the hidden Console's window level:
  **14/14 cases, 10 captures, exit 0**. Final stamped build verified.
  [Final run](../../.artifacts/phase4-qa/2026-10-17T08-23-56-001Z).

Actual installed signed `.app` wrappers were launched through macOS `open`, the
same targets as the Neo Open actions. This verifies the assigned launch path,
not a mechanical press. [Field results](../../.artifacts/operator-controls-2026-10-17/field-results.jsonl):

| Case | Elapsed | Result |
| --- | ---: | --- |
| CONSOLE from app off / TV standby | 3,789 ms | App started, Console shown on Mirror, TV Awake/ON, avatar intent preserved |
| PLAY LOOP from Console | 3,310 ms | Inputs released, selected loop acknowledged, Console hidden |
| CONSOLE during loop | 1,805 ms | Same Main, loop intent preserved, zero media reloads |
| START from Console over loop | 2,334 ms | Normal avatar intent, Console hidden |
| PLAY LOOP again | 2,819 ms | Playback acknowledged, one load |
| CONSOLE again during loop | 1,798 ms | Same Main, loop intent preserved, zero reloads |
| STOP with loop and Console open | 4,324 ms | TV standby, app stopped, job unloaded, intent avatar |

Every operation confirmed the active-avatar configuration hash was unchanged.
Native CoreGraphics window metadata independently confirmed Console at layer
1001 with bounds `1936,16,1048,1888`, above Mirror at layer 1000 with bounds
`1920,0,1080,1920`. After START/PLAY LOOP, only Mirror remained onscreen.
No private Console screenshot, transcript, audio, credential or memory content
was captured; the inspected Console screenshot uses isolated synthetic QA data.

[Installation metadata](../../.artifacts/operator-controls-2026-10-17/installed-controls.json)
verifies Neo connected, all four exact app targets/titles/positions, signatures,
icon hashes and unchanged profile root. Full logs are in
[task evidence](../../.artifacts/operator-controls-2026-10-17/).

Mechanical key presses, physical text rendering on the key, USB reconnect and
cold-login behavior were not newly observed. The field tests establish app/window
placement, playback continuity and full shutdown; they do not claim new acoustic
or provider-dialogue acceptance. Existing loop music selection remains unchanged.

Final state at **16:25 Taipei**: 30,448 ms with no restart, field LaunchAgent
unloaded, zero canonical app processes, normal avatar intent, TV Asleep/display
OFF. [Metadata](../../.artifacts/operator-controls-2026-10-17/final-state.json).
Changes remain uncommitted; no phase acceptance advanced.

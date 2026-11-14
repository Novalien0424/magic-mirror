# VIDEO LOOP from STOP: short sound first, and a TV without picture — 2026-11-14

Owner, 17:05: VIDEO LOOP "still has the very short audio first, then it plays later", and the
physical TV showed nothing while remote desktop showed the video. Metadata only; raw sound
was kept on a RAM disk and deleted. **Neither item is fixed; no code was changed.**

## TV without picture (16:57–17:07)

- The app rendered correctly. The HDMI link from the Mac to the mirror board was down: the
  board's receiver logged `hdmi rxphy power on failed` ~52/min and `timing err` ~160/min from
  16:57 to 17:07:14, then locked (`rx initial done`), and the picture returned. The Mac listed
  the display without its name from 16:58 (`MIRROR_DISPLAY_SELECTED reason=unnamed_target`)
  until 17:09:19 (`target_returned`). START and VIDEO LOOP still reported `tv_awake`.
- Mac-side HDMI re-plugs (`Processing hotplug`, display 3): none in the 56 h before; 15 at
  16:26:04–16:27:24, one at 16:57:09, four at 17:09:03–17:09:17, one at 17:26:40.
  The first burst began the second the agent opened System Information (left open until
  17:13), the second the second `system_profiler SPAudioDataType` started. A
  `system_profiler SPDisplaysDataType` at 17:06:58 caused none, and the 17:26:40 one came with
  both closed and recovered at once (41 of 41 later starts found the named display). So the
  system-report tools are the likely trigger of the bursts, not proven; the 10 min without
  lock after 16:57:09 is the board receiver's behaviour (TV was in standby at that moment).
- Rule until proven otherwise: do not run System Information or `system_profiler` on this Mac.
- Open: the control path cannot see a dead link (it reports `tv_awake`). The board's kernel
  log shows it (`rxphy power on failed` without `rx initial done`).

## VIDEO LOOP start sound

Measured 17:25–17:46 with the owner's approval at normal volume (the owner then asked for
1% only; no further sound tests were run). 17 starts: 16 from STOP, one on a running app.

Established:
- The app's own output (recorded digitally at Airfoil's input) is continuous from the moment
  the loop plays, 3.6–3.9 s after the press, in every start. The fault is after the app.
- A1 and the Edifiers (Jabra muted in Airfoil, raw cross-correlation, 2 clean starts): silent
  until ~2.0–2.3 s after the app's output starts, then at a lag of 2.25–2.45 s, steady. In one
  start the first 1.5 s ran at 2.6 s and then moved to 2.3 s. No early burst from them.
- With the Jabra playing, its microphone gates to −72 dB while its speaker is active. That
  gate begins 1.0–1.5 s after the app's output starts (9 starts), about 1 s before the other
  speakers are heard.

Not established:
- What the Jabra itself plays in the first 2 s. The reading that fits the owner's description
  is that the Jabra starts about 1 s ahead and is then moved into sync, but its own microphone
  cannot observe it, and the gate showed no pause in 4 quiet-room starts.
- Whether the running-app start differs (one start, room too quiet at the moment to tell).

Measurement traps found:
- The key-result chime plays on the Jabra ~0.4 s after the result (about 7 s after the press
  for VIDEO LOOP) and gates the Jabra microphone for ~1 s: it looks like a dropout of every
  speaker and is not one.
- A recorder must restart after the app rebuilds its audio devices at start, or it stops
  after ~3.5 s. Recorders ran as children of a second Electron instance (microphone
  permission) beside the production app without disturbing it.
- AppleScript: `set (volume of s) to 0`; without the parentheses it is a syntax error that a
  silenced loop hides.

Next step (needs the owner): one of
1. a microphone that is not the Jabra's (a phone recording of two VIDEO LOOP starts from STOP
   is enough), or
2. three starts at normal volume recorded through the A1's microphone with A1 and the
   Edifiers muted, so only the Jabra is heard.

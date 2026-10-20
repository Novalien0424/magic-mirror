# Operator Loop Video — 2026-10-17

Approved appliance mode, independent of avatar-requested media. The top row is
START, STOP, PLAY LOOP. The Console has a separate Loop Video tab; saved video
and optional separate music come from the shared/Common folder. Owner selected
`3_worlds_loop.mp4` plus `天使_intro.mp3` (contain, 70% initial volume).

Main blocks wake/manual Realtime activation, ends any current session, releases
the camera and native wake microphone, then publishes one playback generation.
The renderer mounts only the loop player. Separate music and muted video own
independent loop timelines; embedded audio uses only the video element. Both
use the saved output router without dormant attenuation or avatar ambience.
Actual successive video frame/time and selected audio progress acknowledge
PLAY LOOP. One 8-second stall recovery reloads both sources; a second failure
stays black. Return/START waits for media release before wake listening resumes.
Desired mode survives a crash; deliberate START/TERM STOP clears loop intent.

The existing LaunchAgent remains the only Electron restart owner. Fixed local
mailbox commands are UUID-bound, expiring, sender-independent operator actions;
they accept no media paths, scripts, model text or profile IDs. Renderer IPC
checks the current tracked window/main frame and validates bounded payloads.

## Checks and failures retained

- 317 focused tests passed across controller, mailbox, UI, player, lifecycle,
  camera and Stream Deck/TV controls. Both TypeScript checks passed.
- First unit run: 189 passed, one test fixture failed because replacing a mock
  also removed its order-recording side effect. Corrected fixture; no control
  ordering change required.
- First real Electron run: stale authoring-status selector failed after saving
  succeeded. Corrected the harness to the current `.console__scene-result`.
- Second real run: 4 cases passed, then a real integration failure: the released
  wake worker remained alive, but the new code incorrectly required child exit.
  Corrected it to require the explicit microphone-release acknowledgement.
- Third real run: **12/12 cases, 9 captures, exit 0**, portrait 1080×1920.
  [Artifacts](../../.artifacts/phase4-qa/2026-10-17T04-04-50-498Z).
  Real Console authoring/reload, muted preview, protocol range reads, embedded
  decoding, independent loops, duplicate PLAY, saved-avatar return, one reload,
  second failure held exact black, and isolated production-mailbox START pass.
  Independent sample: video 2 wraps, audio 4 wraps, 149 decoded/0 dropped frames,
  36 distinct pixel samples. Final failed surface: zero nonblack pixels.
- Full-suite first run: 2,329 passed, 6 failed, 1 skipped. Main's mailbox setup
  unnecessarily awaited filesystem initialization before creating windows.
  Made the independent adapter non-blocking; affected 63 regressions pass.
- Visual inspection found an incorrect microphone warning during intentional
  Loop mode. The status strip now says voice, wake listening and camera are off.
- Final full suite: **193 files passed, 1 skipped; 2,335 tests passed, 1 skipped**,
  exit 0. The subsequent output-device listener change passed web typecheck,
  25 focused renderer tests and a fresh stamped build.
- Final real Electron run after those changes: **12/12 cases, 9 captures, exit 0**.
  [Artifacts](../../.artifacts/phase4-qa/2026-10-17T04-09-52-540Z).
  Independent timelines wrapped video twice and music four times; 149 decoded
  frames, one dropped, 35 distinct pixel samples. Recovered playback decoded
  59 frames with none dropped. The second-failure surface remained exact black
  for 8,678 ms; Console accurately described released voice/wake/camera inputs.
- Final test isolation: mocked Main used a Windows-looking relative userData
  path on macOS and left the new mailbox adapter real. It created test files in
  the checkout. The harness now uses cleaned OS temporary directories, mocks
  the independent mailbox adapter and asserts its shutdown. The 64 affected
  Main/mailbox tests and node typecheck pass; verified synthetic leftovers were
  removed. Production behavior did not change.

Full commands, outputs and subsequent field results are under
[task evidence](../../.artifacts/operator-loop-2026-10-17/).
Initial Electron failures remain at
[first](../../.artifacts/phase4-qa/2026-10-17T04-03-18-009Z) and
[second](../../.artifacts/phase4-qa/2026-10-17T04-04-07-537Z).

## Installation and evidence boundary

The installer rebuilt and signature-verified all three local Open-action app
wrappers. Desktop automation failed twice (`Sky Computer Use native pipe
startup failed`). The live Magic Mirror profile was backed up outside the repo,
Stream Deck was stopped, and only the unused third key and its icon were added
to its offline profile. The original START/STOP actions were preserved. Stream
Deck relaunched and rewrote the profile with all three assignments intact.
The original Default Profile was not changed.

Synthetic renderer captures prove UI/decoding and application ordering, not
physical sound, a mechanical Neo press, or provider dialogue. No raw microphone
audio, conversation, private memory, credentials or operator screenshots are retained.

## Actual Mac / TV field checks

The assigned signed `.app` wrappers were launched through macOS `open`; this
exercises the same target as each Neo Open action, without claiming a physical
key press. Every operation checks the saved active-avatar configuration hash
is unchanged, Main's mode intent, LaunchAgent state and Android display power.
Results: [metadata JSONL](../../.artifacts/operator-loop-2026-10-17/field-results.jsonl).

- Cold PLAY LOOP: 4,167 ms, app started, explicit wake/camera release observed,
  advancing video/music acknowledged before TV Awake/ON.
- Repeated PLAY LOOP: 1,648 ms, same Main PID, zero media reloads.
- Forced Main exit while playing: LaunchAgent alone restarted it and restored
  persisted loop playback in 1,672 ms. Cold restore did not configure a wake
  microphone; camera release completed before playback.
- An initial continuity measurement failed because the QA operator started the
  deliberate crash case before its 56-second interval finished. This is a test
  sequencing error, not an unexplained playback stall; the failure is retained.
- Clean continuity rerun: 56,494 ms with the same Main PID and continuously
  satisfied video/music progress watchdog, exceeding the selected video's
  44.37-second duration. No recovery or stall was reported.
- START while looping: 2,671 ms, same Main, media released before normal mode
  acknowledged; saved active-avatar configuration unchanged.
- PLAY LOOP from the running normal app: 2,632 ms, input release acknowledged,
  one media load and successful playback acknowledgement.
- STOP from loop: 3,683 ms, TV standby and clean app stop, job unloaded, intent
  reset to avatar. A further 30,374 ms confirmed no restart, zero canonical
  processes and TV Asleep/display OFF at **12:17 Taipei**.
  [Final state](../../.artifacts/operator-loop-2026-10-17/final-state.json).

Final [installation metadata](../../.artifacts/operator-loop-2026-10-17/installed-controls.json)
verifies Neo connected, Stream Deck running, exact three key positions and all
three local app signatures. CoreAudio reports Jabra as default output, unmuted,
with approximately 75% device volume (independent of the saved 70% loop gain).

An optional aggregate-only Node microphone meter returned all-zero samples both
before and during playback, including on Jabra. That capture route is unusable
as acoustic evidence; it neither proves physical silence nor proves music was
audible. No audio was retained. Physical picture/sound confirmation was requested
from the owner; mechanical third-key, USB reconnect and cold-login acceptance
remain separate from the automated checks.

All executable QA completed; the observation request remains unanswered. The
app and TV were left stopped/in standby. Changes remain uncommitted; the existing
saved avatar/model settings and phase acceptance were not changed.

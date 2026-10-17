# Magic Mirror — current handoff, 2026-10-17

Latest owner revision: Neo top row is **START / CONSOLE / PLAY LOOP**; **STOP**
is bottom right `(3,1)`. PLAY LOOP has padded artwork and a two-line title.
CONSOLE brings the existing editor above the mirror display without interrupting
the current program or losing unsaved edits. START/PLAY LOOP hide Console.
STOP is global to the whole Magic Mirror application and its owned processes,
including loop/media and future modes; it also puts the TV in standby.
[Latest changes and QA](docs/testing/operator-controls-2026-10-17.md).

Delivered earlier today: separate operator **Loop Video** mode. Console has a
separate tab for shared-folder video, embedded or separate music, fit, volume,
muted preview, scoped Save, Play and Return to Avatar. Owner-selected preset:
`3_worlds_loop.mp4` + `天使_intro.mp3`, contain, 70%.

Loop releases Realtime, native wake microphone and camera; only operator
controls end it. START returns to the saved active avatar's normal Dormant mode.
STOP sleeps the TV and cleans up the app. Actual advancing video/music must
acknowledge before HDMI wake. Duplicate LOOP does not reload. One stalled-player
reload is allowed; repeated failure stays black with a Console reason. Existing
LaunchAgent alone restores persisted loop intent after a crash.

Latest checks: **202 focused tests across 5 files**, node typecheck, final stamped
build and real Electron QA **14/14 cases, 10 captures**, all pass. Real installed
Console/loop/START/STOP wrapper and TV checks all pass. Native window metadata
confirms Console at layer 1001 above the portrait Mirror at 1000; START/LOOP leave
only Mirror onscreen. Every field operation preserved the active avatar config.

Earlier feature evidence: full suite **2,335 passed, 1 skipped**; both typechecks,
25 renderer tests and 12-case Electron QA pass. Test-isolation cleanup passed
64 Main/mailbox tests and node typecheck. Actual installed wrapper/TV
checks passed cold loop, duplicate loop, 56-second continuity, crash restoration,
saved-avatar return, loop from running app and STOP. Avatar configuration stayed
unchanged. Initial failures and fixes are retained in the
[QA ledger](docs/testing/operator-loop-2026-10-17.md).

Current runtime at **16:25 Taipei**: Magic Mirror stopped, LaunchAgent unloaded,
zero canonical app processes, TV **Asleep / display OFF**, verified through a
30-second no-restart interval. Loop settings remain saved; intent is
normal avatar. Stream Deck is running, Neo connected, all four signed app
assignments and layout persistence verified.
[Final metadata](.artifacts/operator-controls-2026-10-17/final-state.json) ·
[controls](deploy/macos/stream-deck.md).

Evidence limits: new physical key presses, on-key label rendering and physical
picture/music observation have not been confirmed. Assigned app launch paths, real renderer media progress,
TV power and selected unmuted Jabra output are verified. A separate aggregate
microphone meter returned all-zero samples before and during playback, so it cannot
prove acoustic output. USB reconnect and cold-login acceptance remain manual.
No provider dialogue was needed for this operator mode. No phase acceptance changes.

Delivery branch is `field/macmini-deploy`, following baseline `9197676`.
Owner requested commit/push and is beginning physical testing; leave runtime
and device state under the owner's control.
The earlier mist/gradual-reveal fix is included in that baseline and preserved.
[Earlier handoff](docs/archive/progress-before-operator-loop-2026-10-17.md) ·
[reflective motion evidence](docs/testing/reflective-motion-2026-10-17.md).

Earlier model/camera limitations remain outside this feature:
[open issues](docs/testing/open-issues-2026-10-13.md) and
[latest prior review](docs/testing/review-fixes-2026-10-14.md).
Next acceptance: physical Neo layout/Console/STOP/PLAY LOOP confirmation; any
field failure should start from the current operator-controls ledger.

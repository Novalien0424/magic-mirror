# Remote Console on the main display — 2026-10-18

Owner request: a way to check the Console over Chrome Remote Desktop while the
avatar stays on the portrait TV, without changing the Neo CONSOLE key, which
must keep opening the Console over the avatar (used often with the TV mouse).
The app goes on the macOS Desktop. Ruling: DECISIONS 2026-10-18 "Remote Console
on the main display". Evidence is metadata only.

## What changed

- **Main** (`src/main/index.ts`): new operator action `show_console_main` places
  the same Console window on the main display (the primary display when it is not
  the mirror's, otherwise any other display), inset 16 px in its work area, at the
  normal window level, and focuses it. It clears the over-the-mirror flag, so display
  changes do not pull it back. With no display other than the mirror it fails
  (`console_main_display_missing`) and never covers the avatar. `show_console` (the Neo
  key and Console app) keeps its placement code; only the shared "wait until the
  Console renderer is ready" loop moved into `consoleWhenReady()`.
- **Mailbox** (`operator-control.ts`, `scripts/operator-command.mjs`): the fixed
  action set gains `show_console_main`.
- **Desktop app**: `deploy/macos/install-remote-console.sh` builds
  `~/Desktop/Remote Console Magic Mirror.app` (`com.magicmirror.control.remote-console`,
  ad-hoc signed, replaces only its own earlier copy). It runs
  `deploy/macos/magic-mirror-remote-console.sh`, which checks that the LaunchAgent
  is running and sends `show_console_main`. It does not use the button queue, so it
  makes no venue sound and never starts the app or touches the TV, TV mouse or
  Mirror mode. Failures show as an alert on the remote screen.
- **Stream Deck**: unchanged (installer, five apps and profile untouched).
- **QA**: `--operator-loop` gains `operator_console_remote_main_then_deck`: with a
  loop playing and an unsaved draft, Remote Console puts the Console on a display
  other than the mirror's, not always-on-top, mirror still visible; then CONSOLE puts
  it back over the mirror (always-on-top, focused, on the mirror display) with the
  program and the unsaved draft unchanged. The existing `operator_console_on_mirror`
  checks still run first, unchanged.

## Results

| Check | Result |
| --- | --- |
| Focused unit tests (`operator-control`, `operator-command`, `raven-button`) | pass, 136 tests |
| `npm run typecheck:node` | pass |
| `zsh -n` both new scripts | pass |
| Desktop app installed by `install-remote-console.sh` | pass: bundle id, strict signature, applet script checked |
| Remote Console script with Magic Mirror stopped | pass: "Magic Mirror is not running…" alert text, exit 1, nothing opened |
| Live production app (stamped 21:49 build, includes this commit; `qa-build --verify` pass) | pass, see below |
| `--operator-loop` with the new case | **not run**: another session was stopping and restarting the production app at the time |

Live check, 22:43–22:44 Taipei, real displays (virtual main id 5, T749 id 3), no
sound and no provider calls:

1. Remote Console script → `CONSOLE_ON_MAIN display_id=5 … 1888×1048 on_main=true`.
2. `operator-command.mjs show_console` (the CONSOLE key's app command, without its
   TV wake and mouse steps) → `CONSOLE_ON_MIRROR display_id=3 … 1048×1888 on_mirror=true`.
3. Remote Console again → `CONSOLE_ON_MAIN … on_main=true`.

Screens were captured and viewed locally, then deleted. After step 2 the TV showed
the Console over the mirror; after step 3 the TV showed only the (Dormant, black)
mirror and the main display showed the Console. The capture triggered a macOS
privacy prompt asking to let tmux record the screen; it was not granted. Avoid
`screencapture` from agent shells. 22:44:04 the production app received SIGTERM
(`APP_EXIT reason=operator_stop`, no button press) and restarted 22:45:04 from
another session; the operator-loop run was deferred so as not to disrupt it.

## Not covered

An owner remote session: open the Desktop app over Chrome Remote Desktop, check
the Console on the main display and the uncovered avatar on the TV, then press the
Neo CONSOLE key and check the Console returns over the avatar (TODO).

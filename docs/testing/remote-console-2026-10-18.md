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
| `--operator-loop` with the new case | not run that evening; run 2026-10-19, see below |

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

## Full QA and user journeys, 2026-10-19

Owner request: run the operator-loop QA while the app is free, write every QA
case from real user journeys, test the final output thoroughly, with real-API
QA authorized. Journeys: [O8 in user journeys](user-journeys-2026-10-18.md#o8-check-in-from-away-remote-console).
The production app was stopped for the Electron runs. Sound-producing runs used
the Jabra at 1 %, pinned by its CoreAudio device UID rather than the default
output, then set to the normal 69 %.

### New QA cases

`--operator-loop` gains five cases (22 in all), run with `MIRROR_DISPLAY=T749`
like the field LaunchAgent so Main watches display changes. All use the real
displays (virtual main 1920×1080, T749 portrait), the production mailbox and
isolated data. A shared helper (`src/main/operator-command-qa.ts`) checks
placement from Electron's own window state: visible, focused, level, display,
work area, and how many app windows overlap the mirror's display.

| Case | Journey | Checks |
| --- | --- | --- |
| `operator_remote_console_beside_avatar` | Look in on a quiet mirror | From hidden: in front on main, not always-on-top, exactly the main work area inset 16 px; no app window over the TV; mirror bounds, avatar rendering, published settings and Mirror mode file unchanged; same Console renderer (a page marker survives) |
| `operator_remote_console_repeat_restores_window` | Open again, minimized, maximized | Same bounds each time; minimized and maximized windows come back inset on main |
| `operator_remote_console_display_change` | TV reconnects, remote resizes display | Real Main re-home on a display event: CONSOLE's Console moved off the mirror goes back over it; Remote Console stays beside |
| `operator_remote_console_no_main_display` | Virtual display missing | Fault injection (only the mirror display reported): the reply is `failed` (the Desktop app's alert), the Console stays hidden, nothing covers the avatar; works again when the display returns |
| `operator_remote_console_venue_keys` | Staff press keys while you watch | INTERACTIVE STUDIO, PLAY LOOP and START each hide it; Remote Console then shows **Interactive Studio** pressed, or **Loop video playing.** with frames still decoding; START leaves Conversation |
| `operator_console_remote_main_then_deck` (extended) | Loop playing, unsaved edit | Uses the shared checks and samples decoded loop frames while the Console is beside the mirror |

The live `portrait_studio` scenario gains three steps on the real provider:
`studio_remote_console` (Remote Console during the questions),
`studio_deck_console_painting` (CONSOLE while the picture paints) and
`studio_remote_console_reveal` (Remote Console after the reveal). Each checks
the placement, an unchanged session ID, the lifecycle, the studio step and that
the wake listener has not taken the microphone. The visitor's next spoken turn
must still succeed.

### Defect found and fixed

| Found by | Defect | Fix |
| --- | --- | --- |
| `operator_remote_console_venue_keys`, first run | After INTERACTIVE STUDIO (or START from the studio) while asleep, the Console kept showing **Conversation** and “Listening for 「魔鏡阿魔鏡」”. Its mode was only re-read on load, on a lifecycle change or while in a conversation. This affected the CONSOLE key too, not only Remote Console | The Mirror mode switch and the studio sign-in chip re-read the status whenever the Console is shown or focused (`StudioStatusPanel.tsx`); rerun passed with the switch on **Interactive Studio** |

`placeConsoleOnMain` now picks its display through the pure
`selectConsoleMainDisplay` (`portrait-display.ts`, unit tested); behavior is
unchanged.

### Results (stamped build, `qa-build --verify` pass)

Built from the shared canonical checkout, which also held another session's
uncommitted camera changes; none of them touch the Console or its placement.

| Check | Result |
| --- | --- |
| Focused units (`operator-command-qa` new, `portrait-display`, `operator-control`, `operator-command`, `raven-button`) | pass, 147 |
| Typechecks (node, web) | pass |
| `--operator-loop` first run | **failed** at `operator_remote_console_venue_keys` (the defect above): `2026-10-19T13-26-06-732Z` |
| `--operator-loop` after the fix | pass, 22 cases, 16 screenshots: `2026-10-19T13-29-01-541Z` |
| `npm test` (includes Electron smoke) | pass, 2645 tests, 94 s |
| `--console` | pass, 38 checks: `2026-10-19T13-32-18-835Z` |
| `--studio-journey` | pass, 14 checks: `2026-10-19T13-32-57-531Z` |
| Live `portrait_studio` run 1 (real provider and ChatGPT pictures) | every visit step passed, including the three console steps; the run **failed** its provider-error gate on one Realtime `error` event whose code the probe did not keep: `2026-10-19T13-33-07-908Z` |
| Live runs 2 and 3 (probe now keeps error codes and the QA step, metadata only) | pass, 20/20 each, 0 provider errors: `2026-10-19T13-38-50-260Z`, `2026-10-19T13-44-00-496Z` |

Live samples: the three console steps passed 9/9 across three visits, each
followed by the visitor's next turn in the same session (placement markers:
main, then the TV while painting at 1048×1888, then main). Pictures took
22–25 s; the reveal painted normally while the Console covered the mirror. One
of three visits had the unidentified provider error, which did not recur.

Screenshots reviewed: the Console at the main display's full size on the
Avatars page, with Loop Video playing and an unsaved edit, in Interactive Studio
mode after the venue key, and with the loop playing after PLAY LOOP. The result
line could still show an earlier action's result (“Back to the avatar…”) after a
venue key started a loop, and the header warned “Check the microphone” during a
normal wake listener restart; both were fixed later the same evening and are
asserted by `operator_remote_console_venue_keys`
([studio stories](interactive-studio-stories-2026-10-19.md)).

### Final output on the real install (production app, 21:49–21:50 Taipei)

The actual Desktop app and the actual Stream Deck apps, with window placement
read from macOS (CGWindowList: owner, level, bounds; no titles or pixels; no
screen capture). Jabra at 1 % for the deck sounds, then 69 %.

1. App stopped: **Remote Console Magic Mirror** showed its alert on the main
   display (alert level); no Electron process started. The alert was closed by
   ending the applet.
2. App restarted; the TV showed only the mirror (level 1000).
3. Remote Console, the first press after the restart: the Console was created
   and placed in about one second, `CONSOLE_ON_MAIN … 1888×1048 focused=true`,
   level 0 on the main display; the TV still showed only the mirror.
4. The CONSOLE key's app (`Console Magic Mirror.app`, the full deck path):
   `console_shown`, TV awake, mouse started; the Console was at level 1001 over
   the mirror on the TV.
5. Remote Console again: back to level 0 on main; the TV showed only the mirror.
6. The START key's app: `already_on`, Conversation; the Console hid; only the
   mirror remained.

The app was left running and Dormant (wake listener listening), Console hidden,
Conversation mode, Jabra 69 % (input unchanged). The CONSOLE press left the TV
mouse attached, as it always does until STOP.

## Not covered

An owner remote session: open the Desktop app over Chrome Remote Desktop, check
the Console on the main display and the uncovered avatar on the TV, then press the
Neo CONSOLE key and check the Console returns over the avatar (TODO). The
physical key itself (its app was run directly), ⌘⇧D on the main display, a
renderer crash while the Console is on main, and a human visit.

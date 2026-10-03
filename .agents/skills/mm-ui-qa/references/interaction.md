# Host and production UI interaction

Repository implementation reference; installed code, current DECISIONS and focused contract tests outrank historical SDK/version observations. Follow AGENTS for execution policy.

## Host and interaction boundaries

Launch Electron only from `C:\Project\magic-mirror`. Verify the two exact-path
Private firewall rules described in AGENTS.md before the first run. Do not run
two Electron QA sessions or interfere with an operator's manual test session.
Full `npm test` also launches Electron smoke; run it separately. Check for
unsaved Console edits before stopping/reloading the normal app.

Visual modes require an OS-reported portrait display and verify the actual
Mirror window's display. `PHASE4_QA_DISPLAY` records the selection and display
dimensions. A physically rotated panel still needs the correct Windows display
orientation. Ask which panel and whether to change orientation if Windows
reports all panels as landscape; do not guess. Editor-only work can continue.

The Console harnesses in `src/main/phase4-console-qa.ts` and
`src/main/cubism-console-qa.ts` drive rendered DOM controls
through Electron's `executeJavaScript`. It substitutes only the native file
picker's return value inside the isolated process, restoring it in `finally`.
Import, decode, React edits, IPC, validation, and publication remain production
paths. Read-only bridge assertions may check saved state. Do not mutate config
through the bridge to claim that the editor authored it. Native picker interaction
itself remains outside this automation.

Wait for the next control to be enabled, not just for success/failure text:
React can render the message before an async refresh clears the busy state.
Keep playback thresholds strict. Measure elapsed time alongside frame counts
and use metadata-only probes to distinguish a stalled video from a slow host.
Do not turn a diagnostic decoder flag or altered media source into a QA pass
for the normal production path.

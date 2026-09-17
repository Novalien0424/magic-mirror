# Wake recovery and explicit restart failures — Windows, 2026-09-16

## Observed cause

The normal session started at 12:08 Taipei and acquired audio successfully.
At 17:21:53 the native capture emitted `wake_microphone_device_failed`.
Its one automatic replacement acquired at 17:21:55, then stopped delivering
audio at 17:22:31 (`wake_audio_stalled`). The replacement exited and the
bounded restart policy stopped further automatic restarts.

At 18:12, repeated Start live test requests released the absent worker, which
overwrote failure with a successful released status, then sent configuration to
that absent worker. Configuration failed with `wake_worker_unavailable`.
Restoration repeated the same path. This is the reproduced cause of repeated
Start failure; it is unrelated to the phrase or sensitivity settings.

The native error identifies device/driver failure but does not distinguish
unplugging, driver reset, reconfiguration or another Windows audio event.
No audio was saved. The historical device failure cannot be reconstructed.

## Research and implementation

- [Microsoft WASAPI recovery guidance](https://learn.microsoft.com/en-us/windows/win32/coreaudio/recovering-from-an-invalid-device-error)
  specifies releasing the failed device and reopening the default or explicitly
  selected device. Our inference is that replacing the isolated worker after
  confirmed exit is an appropriate release/reopen boundary for this application.
- [Decibri Node API](https://decibri.com/docs/apis/node) documents runtime device
  failures on the error event and idempotent capture stop. The installed 5.7.0
  source maps device errors to `DEVICE_FAILED`; the adapter retains fixed codes.
- [Electron utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process)
  documents that exit fires after process termination. Recovery waits for this
  event, preserving one microphone owner. Spawning alone is not audio recovery.

The existing single automatic retry remains bounded. Recovery is successful
only after valid audio blocks arrive. Failed/restarting/recovered state, the
failure reason and cumulative listener restart attempts now survive cleanup and
appear in Console. Failures are visible on every Console page, with detail in
System microphone diagnostics and live calibration. Terminal failure explicitly
says to check the microphone, save edits, and close and restart Magic Mirror.
The app does not silently relaunch itself or introduce another restart owner.

An explicit Start live test now starts a fresh worker when configuration reports
that the old worker is absent, after release and a fresh ownership/cancellation
check. It does not bypass release, change devices or alter published settings.
The stopped panel polls read-only health without taking a session or renewing
the test lease. Cleanup no longer erases the exhausted failure. Main keeps the
wake module failed/degraded until audio actually resumes.

Changed boundaries: `wake/calibration.ts`, `wake/supervisor.ts`, Main's wake
status projection, shared wake health/command types, and Console recovery/test
status. Focused tests cover retry after exhausted recovery, ownership cancellation,
retained failure, read-only lease behavior and explicit restart instructions.

## Verification

- Regression first failed: exhausted-worker Start returned `failed` instead of
  `testing`. New health-state tests also failed before implementation.
- `npx vitest run tests/main/wake tests/unit/wake-score-ui.test.ts tests/unit/console-ipc.test.ts`:
  exit 0, **125 tests / 16 files**.
- `npm run typecheck:web`: exit 0. `npm run typecheck`: exit 1 only for the known
  preexisting TS7016 in `tests/unit/qa-artifacts.test.ts:6` importing
  `scripts/qa-artifacts.mjs`; no new Node type errors were reported.
- `npm run build`: exit 0. `git -c core.safecrlf=false diff --check`: exit 0.
- Real canonical Windows Electron fault injection, 18:23 and 18:25: terminated
  only the uniquely identified wake utility child. First exit produced
  `wake_worker_restarting`, then `wake_audio_recovered` with real microphone
  blocks. Second exit exhausted automatic recovery; Console displayed the
  failure reason, attempt count and explicit close/restart instruction.
- At 18:26, clicked the production Start live test control after exhaustion.
  It started a fresh child, retained two restart attempts, resumed live audio
  (-42.2 dBFS at observation) and advanced to decoder step 30 with numerical
  score 0.000 and 0/9 tokens in quiet input. Stop restored the published settings;
  Start became enabled and no test alert remained. Published v17 remained
  Up to date / No changes.
- Windows UI Automation verified the global failure text but could not click
  because of `coordinate input geometry is unavailable`. The Start/Stop checks
  used a temporary localhost CDP connection to our app's production controls.
  That connection and debug process were closed before the final normal launch.

This validates process-failure recovery, the original dead-worker retry defect,
real microphone resumption and visible errors. It does not certify physical
unplug/replug, Windows sleep/resume, long-run driver reliability, wake accuracy,
or Mac behavior. No phase promotion or dependency/model change.

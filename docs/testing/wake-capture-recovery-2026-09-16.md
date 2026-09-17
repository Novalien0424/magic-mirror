# Wake capture recovery — Windows, 2026-09-16

## Outcome

Fixed the persistent stalled-listener behavior identified in the
[RCA](wake-rca-2026-09-16.md). No wake phrase, selected device, model or
sensitivity setting was changed.

- Acquisition is now `acquiring`, not `listening`, until Main receives the first
  nonempty audio-block report. The worker reports that first block immediately.
- Three seconds without further blocks triggers a visible `wake_audio_stalled`
  fault and the existing bounded worker restart. Main waits for process exit
  before creating the replacement, so native microphone ownership cannot overlap.
  If the replacement also fails, the Console shows failure instead of a healthy
  listener or an endless retry loop. Real silent blocks count as healthy input.
- Release and shutdown cancel monitoring. Recovery checks current ownership
  intent before reacquiring, fixing a reproduced race that could reopen the
  wake mic after a conversation requested its release. Old worker messages and
  old capture callbacks cannot change the new owner's state.
- Capture now detects unexpected stream end/close and retains allowlisted native
  failure codes. Native messages, audio and transcripts are not diagnostic output.
- Console distinguishes waiting, recovering and failed input. Missing audio is
  displayed as an unavailable peak; actual quiet levels are retained rather
  than being replaced with zero.

These are source changes applied on every app launch and each wake acquisition,
not a one-time device reset. The native Windows fault from the original run
cannot be reconstructed because the former code discarded its details. This
repair addresses the confirmed failure to detect and recover missing capture;
it does not claim to repair a particular Windows driver.

## Changed boundaries

- `src/main/wake/{capture,worker,supervisor}.ts`: native errors, first-block
  reporting, watchdog, process/capture generations and release/recovery ordering.
- `src/main/index.ts`, `src/shared/wake-input.ts`,
  `src/renderer/console/App.tsx`: acquiring/recovering/failed status and real levels.
- Focused capture/worker/supervisor tests. An explicit JSX return type in
  `AvatarCharacterEditor.tsx` resolves the unused React import reported by the
  typecheck, preserving the existing test-time React import.

## Evidence

New regression tests failed before implementation for missing-block recovery,
false listening status, recovery reopening after release, stale capture
callbacks and lost stream error/end diagnostics.

All following focused checks exited 0:

```powershell
npx vitest run tests/main/wake tests/unit/boot-runtime.test.ts tests/unit/boot-ipc.test.ts tests/unit/console-ipc.test.ts tests/unit/realtime-privacy-cleanup.test.ts
# 169 tests / 17 files
npx vitest run tests/unit/wake-tuning-ui.test.ts tests/main/wake/supervisor.test.ts tests/main/wake/capture.test.ts tests/main/wake/worker.test.ts
# 19 tests / 4 files (overlapping focused coverage)
npm run typecheck:web
npm run build
git diff --check
```

Full Node typecheck still exits 1 for the pre-existing TS7016 at
`tests/unit/qa-artifacts.test.ts:6` importing `scripts/qa-artifacts.mjs`.
No new Node type errors remain.

### Real Windows microphone and Electron ownership

With normal Electron stopped, a short aggregate-only native capture check
received 24 blocks. The production worker also received real microphone blocks
in an isolated Electron run. No audio was saved.

A standalone verification then used the production supervisor bundled from
source and built `out/main/wake-worker.js`, with the installed keyword package
and the unchanged Windows default microphone. It passed six checks on **two
separate Electron launches**, each exit 0:

1. Fresh startup receives audio (12 reported blocks at the checkpoint).
2. Conversation release remains inactive beyond the watchdog interval.
3. Return-to-sleep acquisition receives audio (11–12 blocks).
4. Release/configuration update/acquire receives audio (11 blocks).
5. Injected missing audio-block delivery triggers replacement and real audio
   resumes (12 blocks). This injection tests the recovery boundary; it is not a
   reproduction of the original native driver failure.
6. Shutdown removes the worker.

Both runs assert **maximum one live wake worker** and verify waiting for old
process exit before replacement. Evidence and standalone verification code:
[run 1](../../.artifacts/wake-rca-2026-09-16/recovery-run-1.json),
[run 2](../../.artifacts/wake-rca-2026-09-16/recovery-run-2.json),
[harness](../../.artifacts/wake-rca-2026-09-16/recovery-check.cjs).
This harness is separate from the app and leaves no diagnostic hook enabled.

## Runtime and limits

Normal development app restarted from canonical checkout in session **19424**;
Main and both renderers ready, Mirror shown. Operator config preserved. Native
UI connection remains unavailable, so no fresh visual screenshot is claimed.
Normal-app metadata confirms `wake_worker_acquiring` at **09:57:21.511** and
`wake_worker_listening` at **09:57:21.667 Asia/Taipei**. With the new contract,
that listening event confirms receipt of an actual nonempty audio-block report.

Physical wake-phrase accuracy, overnight Windows sleep/resume and actual device
disconnect/reconnect remain operator/hardware checks. BGM confirms output only;
the checks above independently verify the wake input path. Windows evidence
does not establish Mac behavior or phase acceptance.

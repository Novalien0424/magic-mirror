# Wake greeting and recovery failure reporting — Windows, 2026-09-16

## Incident and diagnosis

The operator reported hearing the configured farewell immediately after stopping
live wake calibration and waking Ren. Current metadata records calibration
restoration at 19:33:00–01 Taipei, wake activation at 19:33:05, Realtime ready at
19:33:09, and SLEEP_REQUESTED after output playback at 19:33:13. The 300-second
idle timer had just started; this was not an idle timeout. Published greeting
and farewell were distinct and correctly assigned.

The adapter's sleep tool arms the return-to-Dormant transition, but greeting
requests used unrestricted SDK sendMessage: an application cue became a user
message followed by an automatic response with the sleep tool available. This
allowed a greeting response to invoke sleep. The original provider response and
visitor audio were not retained, so their exact content and the model's reason
for invoking sleep cannot be reconstructed. Calibration timing alone does not
establish calibration as the cause.

## Changes

- `realtime-session-adapter.ts`: send application speech with automatic response
  disabled, then explicitly request a response with `tool_choice: none`. Applies
  to wake greetings and scene speech. The session still offers the sleep tool
  for visitor commands; scene cancellation/playback tracking is preserved.
- `wake/supervisor.ts`: timer-creation and command-send failures now publish a
  failed recovery state. Previously a replacement could remain visibly stuck
  on Restarting with its promise already failed. Existing Console failure UI
  now displays the reason and explicit close/restart instruction for these cases.
- Focused regression assertions cover both boundaries. The live lifecycle
  harness checks greeting request policy, absence of premature tool calls and
  farewell, and remaining Active after greeting. Its avatar-switch selectors
  now use the current Mirror controls.

## Fresh verification

- Regression first: four speech-policy assertions failed before the adapter
  change; two replacement-failure cases failed before the supervisor change.
- `npx vitest run tests/main/wake tests/unit/wake-score-ui.test.ts tests/unit/console-ipc.test.ts tests/unit/realtime-session-adapter.test.ts tests/unit/realtime-session-start-bridge.test.ts tests/unit/avatar-prompt.test.ts`:
  exit 0, **189 tests in 19 files**.
- `npm run typecheck:web`: exit 0. `npm run build`: exit 0.
- `npm run typecheck:node`: exit 1 solely for existing TS7016 at
  `tests/unit/qa-artifacts.test.ts:6`, missing declarations for `qa-artifacts.mjs`.
- `node scripts/run-phase4-qa.mjs --lifecycle-live`: exit 0, **4 checks**:
  two real-provider greetings without sleep, followed by two explicit sleep
  commands with exact farewell comparison, output completion and track release.
  [Build and run artifacts](../../.artifacts/phase4-qa/2026-09-16T11-39-11-986Z).
- `git -c core.safecrlf=false diff --check`: exit 0.

The live checks used synthetic text commands and silent input in isolated
Windows Electron, with provider speech and playback boundaries. They do not
prove the operator's physical microphone stop-calibration/wake sequence or
general model intent accuracy. Operator settings were preserved. No phase
promotion, runtime-model change, or credential inspection.

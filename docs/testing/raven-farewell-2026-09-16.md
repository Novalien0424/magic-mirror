# Raven farewell speech — Windows, 2026-09-16

## Report and cause

The operator spoke Raven's configured sleep command and heard an unwanted
invitation to keep chatting. Published settings correctly separated the sleep
phrase `恭送渡鴉大人` from farewell `如你所願，再會`. Runtime metadata confirmed
SLEEP_REQUESTED at 20:09:54 Taipei; the original audio/transcript was not saved.

The previous sleep tool returned a prose instruction. The installed SDK then
automatically generated an unrestricted conversational follow-up. Additionally,
its interrupt method clears remote audio without emitting the application's
local voice-effects interruption signal. Prompt compliance and remote clearing
alone did not control all audible output around sleep.

## Change

- Keep the shared prompt compact: a directed sleep command has one silent tool
  action; the application supplies farewell audio. Remove the farewell text
  from the conversational prompt. No linguistic regex or phrase blacklist added.
- Return the SDK's `backgroundResult` so tool completion does not automatically
  generate a conversational reply. After the committed tool-end event, request
  a single response with the exact performance cue, no conversation input, and
  `tool_choice: none`, retaining the avatar's speaking style and configured voice.
- On the sleep function-call event, explicitly clear the local processed output.
  Only the matching farewell response may reopen it. Suppression emits a fixed
  metadata reason. Response IDs distinguish old speech from farewell playback.
- Wait for that response's playback and processed tail before requesting sleep;
  interruption/close during the tail cannot trigger a delayed sleep transition.

Files: `src/shared/avatar-prompt.ts`, `src/shared/realtime-events.ts`,
`src/renderer/realtime/realtime-session-adapter.ts`,
`src/renderer/realtime/realtime-runtime-dependencies.ts`, focused tests and the
existing lifecycle QA harness/isolated fixtures. Operator configuration untouched.

## Evidence

- Regression tests failed first for unrestricted tool results and missing local
  output interruption. Tests now cover silent results, one farewell request,
  unrelated response exclusion, local output suppression, and tail/close/interrupt.
- `npx vitest run tests/unit/realtime-session-adapter.test.ts tests/unit/realtime-runtime-dependencies.test.ts tests/unit/realtime-session-start-bridge.test.ts tests/unit/realtime-privacy-cleanup.test.ts tests/unit/avatar-prompt.test.ts tests/renderer/mirror/spell-announcement.test.ts tests/unit/realtime-runtime-owner.test.ts`:
  exit 0, **112 tests / 7 files**.
- Web typecheck, final build and diff whitespace checks passed. Node typecheck
  still reports only the existing TS7016 in `tests/unit/qa-artifacts.test.ts:6`.
- Final `node scripts/run-phase4-qa.mjs --lifecycle-live`: exit 0, four lifecycle
  checks across the host and Raven persona/sleep phrase fixture. Both exact
  farewells, greeting isolation and track release passed. Speaker-output graph
  taps sampled the interval before the controlled farewell: host 172 samples,
  peak 0.000031; Raven 143 samples, peak 0.000122; both below 0.001.
  [Final build and run evidence](../../.artifacts/phase4-qa/2026-09-16T12-28-58-085Z).
- Preserved failed runs: [initial extra speech](../../.artifacts/phase4-qa/2026-09-16T12-20-24-975Z),
  [prompt-only follow-up](../../.artifacts/phase4-qa/2026-09-16T12-22-19-457Z),
  [initial output measurement](../../.artifacts/phase4-qa/2026-09-16T12-27-14-713Z).
  The final measurement waits for greeting-tail silence before starting the
  sleep-command interval and distinguishes generated text from speaker output.

This is bounded real-provider speech/playback evidence using synthetic text
input, not certification of every future model turn or physical microphone
recognition. Raven's public persona, sleep phrase and speaking style were tested
on the built-in QA rig; this does not certify Raven's own Cubism assets. Audio
samples and provider text remained RAM-only; artifacts contain comparisons and
metadata. No dependency/model change or phase promotion.

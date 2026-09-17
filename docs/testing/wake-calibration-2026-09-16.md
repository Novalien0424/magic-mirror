# Live wake calibration — Windows, 2026-09-16

## Delivery

Avatars → Persona → Wake sensitivity tuning → **Start live test** opens a
temporary detector session for the named avatar and phrase. The panel starts
from the actual effective draft values, displays the applied detector values,
and applies threshold, keyword score and trailing-blank changes after a short
debounce. Microphone level and wake triggers have separate meters. A real match
lights the trigger meter for two seconds and increments the count; counts reset
when detector settings change. Repeated matches keep listening without waking
the Mirror. The installed detector API does not expose continuous match
confidence, so the UI does not manufacture a confidence percentage.

**Use in draft**, then **Save all changes → Publish all changes**, persists the
tested values through the existing per-avatar configuration. Testing alone
does not publish or alter the operator's settings. Lower threshold makes a
trigger easier; higher keyword score gives the phrase more weight. Physical
positive and negative trials are still needed to choose suitable values.

Main owns the temporary session and serializes release/configure/acquire.
Stopping, leaving the panel, hiding the Console, losing its heartbeat, starting
a conversation or publishing restores the published configuration. A handoff
cancels pending reacquisition. Pending restoration remains visible to config
refresh so an overlapping refresh cannot leave the wake microphone released.
The worker suppresses normal wake activation only during the temporary test.
Audio and transcripts do not cross calibration IPC or enter diagnostics.

Main implementation: `src/main/wake/calibration.ts`, worker/supervisor and Main
wiring; renderer: `src/renderer/console/WakeCalibrationPanel.tsx`; strict shared
commands: `src/shared/wake-calibration.ts` with Console-only IPC/preload access.

## Reported misses: what the evidence establishes

The 09:57 normal app launch verified incoming audio blocks. The following
10:05–10:07 session contains no capture stall or failure event. Therefore the
earlier zero-block capture defect does not explain the observed misses in this
session. Published Ren tuning was threshold **0.45**, keyword score **1**,
trailing blanks **1**. No automatic tuning changes were made.

Metadata from the three reported rain attempts, local Asia/Taipei time:

| Time | Observed behavior |
| --- | --- |
| 10:05:39.474 | Final transcript failed normalized exact spell matching; ordinary reply followed. |
| 10:05:57.287–58.820 | A spell announcement started, then was cancelled before its playback completed. |
| 10:06:12.605–12.616 | Announcement completed; spell command was accepted and rain ran. |

The first failed transcript was RAM-only and is no longer available; its exact
recognition error cannot be reconstructed. The second event previously used a
generic cancellation reason, so visitor interruption versus output interruption
cannot be determined retrospectively. Those now have separate metadata reasons
(`spell_announcement_visitor_speech`, `spell_announcement_output_interrupted`).
Exact matching and speech-before-effect ordering remain enforced. This change
does **not** establish that spoken wake or spell accuracy is fixed.

## Verification

- `npx vitest run tests/main/wake tests/unit/console-ipc.test.ts tests/unit/wake-tuning-ui.test.ts tests/renderer/mirror/spell-announcement.test.ts tests/renderer/mirror/scene-transcript-controller.test.ts tests/unit/boot-runtime.test.ts`: exit 0, **139 tests / 19 files**.
- `npm run typecheck:web`: exit 0.
- `npm run build`: exit 0.
- `npm run typecheck:node`: exit 1, only the pre-existing TS7016 at
  `tests/unit/qa-artifacts.test.ts:6` for `scripts/qa-artifacts.mjs`.
- Electron profile QA uses isolated synthetic data and production controls/IPC.
  Live microphone delivery, threshold updates, Dormant state and published-config
  preservation are checked. Physical utterance detection is not simulated by
  this UI check; worker tests verify repeated detections without activation.

Failed QA evidence is preserved under `.artifacts/phase4-qa/`:
`2026-09-16T02-22-40-766Z` exposed screenshot visibility ending calibration;
`2026-09-16T02-26-46-413Z` and `2026-09-16T02-31-53-647Z` exposed the test's broad
status selector reading the new trigger status instead of save status. The
capture helper now preserves hidden state for the calibration screenshot and
the save selector targets the publication bar.

Final `npm run test:phase4:qa:profiles`: **exit 0, 33 checks, 31 screenshots**.
[Evidence](../../.artifacts/phase4-qa/2026-09-16T02-33-35-492Z/evidence.json) and
[live calibration screenshot](../../.artifacts/phase4-qa/2026-09-16T02-33-35-492Z/screenshots/profile-live-wake-calibration.png).
The screenshot was visually inspected: avatar and phrase are explicit; Start,
Stop and Use in draft are above the tuning controls; microphone and trigger
meters are separate and visible together. Avatar CRUD/save/reload also passed.
`git diff --check` exited 0.

Normal app restarted from canonical checkout with `npm run dev`, session
**99555**, at **10:35 Asia/Taipei**. Main and both renderers reported ready.
`wake_worker_listening` at **10:35:02.327** confirms actual audio-block delivery.
Operator configuration is preserved. Leave this app running for user testing.

Windows evidence does not establish Mac behavior, physical speech accuracy or
phase acceptance.

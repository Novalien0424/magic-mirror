# Phase 1 Physical Realtime Exit Implementation Plan

**Goal:** Complete the remaining real P1-D1, P1-D2, and P1-D5 evidence on the
actual mirror audio path, while preventing a live run from silently loading the
wrong Electron user-data/configuration source.

**Status:** Next Phase 1 plan. This document is not demo evidence, a phase-exit
decision, or authorization to start Phase 2.

**Product sources:**

- `docs/Magic_Mirror_PRD_v0.3.md` — US-VOICE-001 and principles 5.1–5.3.
- `docs/Magic_Mirror_Implementation_Plan_v0.3.md` — Phase 1 P1-D1, P1-D2,
  P1-D5, and exit criteria.
- `docs/Realtime_Voice_Implementation_Guide_2026-08-26.md` on remote `main`,
  SHA-256 `32eaad537b74df51bf7034ee3d30117d1451131a8172117619bdc3323b105251`.
- `DECISIONS.md` and `PROGRESS.md` — current credential, model, phase, and
  evidence rulings.

## Applicable constraints

- Apply invariants 1, 8, 9, 10, 11, and 12. Evidence is metadata-only; no
  transcript, audio, prompt, private context, or credential value is recorded.
- Electron Main alone loads the ignored root `.env` key. The renderer receives
  only a short-lived Realtime credential.
- Runtime model IDs, voice, reasoning, and turn-detection settings come only
  from versioned config and the frozen `SessionModelSnapshot`; there is no
  environment-model override, alternate-key path, or silent model fallback.
- Retain one renderer Realtime owner and the SDK/WebRTC path already accepted.
  Do not add a second protocol, recovery, interruption, or audio-owner state
  machine.
- Execute directly. Use focused tests for changed boundaries and broaden to the
  physical demos/full regression only at the explicit exit step.

## Finding folded into this plan: prove configuration provenance first

The 2026-08-26 live failures were misdiagnosed as provider/model-access
failures. The Phase 1 smoke flag had not selected its isolated Electron
`userData`, so ConfigService loaded a normal-user `active.json` containing the
test-only `mock-realtime-dialogue-v1`. Both project keys and
`gpt-realtime-2.1` were valid. The corrected isolated run passed.

Every live/demo harness must therefore prove these facts before the provider
connect begins:

1. `app.getPath('userData')` equals the harness-created directory for that run.
2. Main's resolved Active snapshot matches the expected config version,
   fingerprint, Realtime model, transcription model, voice, and SDK version.
3. A mismatch terminates with the bounded metadata-only reason
   `config_provenance_mismatch`; it is never classified as a provider,
   credential, or model-entitlement failure.
4. The terminal marker reports only the provenance status and safe snapshot
   metadata. It never reports configuration contents, environment contents, or
   credential material.

## Guide applicability boundary

The Reachy guide is evidence for physical timing and test categories, not a
drop-in architecture. Reachy is an always-on/no-wake-word device; Magic Mirror
is wake-gated and its PRD explicitly avoids a duplicate Realtime state machine.

Use now:

- actual-output playback completion rather than generation completion;
- real interruption, backchannel, side-conversation, and background-speech
  observations on the deployed microphone/speaker path;
- control phrases before short-utterance filtering;
- one setting change at a time, backed by physical evidence.

Do not add in this plan:

- Reachy's boot greeting gate, party/addressee gate, camera gate,
  `wait_for_user` tool, pause/rollback barge state machine, or broad env-knob
  surface;
- a different transcription/model fallback when a configured ID fails;
- camera, voiceprint, speaker diarization, or Phase 2 wake behavior;
- new acceptance gates beyond the PRD's existing P1-D1, P1-D2, and P1-D5.

If a physical demo exposes a specific false-interruption or ambient-response
defect, stop and write one bounded defect plan from the captured metadata. Do
not pre-build the entire Reachy cascade.

---

### Task 1: Make live configuration provenance executable

**Observable outcome:** The live smoke refuses to call the provider unless its
isolated user-data directory and resolved session configuration are the ones
the runner expected.

**Files:**

- Modify `src/main/boot.ts` only to expose a frozen Main-only diagnostic
  `SessionModelSnapshot`; do not expose it through renderer IPC.
- Modify `src/main/phase1-live-smoke.ts` to run a supplied provenance check
  before its model probe or `manualStart()`.
- Modify `src/main/index.ts` to compare the expected smoke user-data directory
  with `app.getPath('userData')` and provide the resolved snapshot check.
- Modify `scripts/run-phase1-live-smoke.mjs` to validate the bounded provenance
  fields in the one terminal marker.
- Test `tests/unit/phase1-live-smoke.test.ts`,
  `tests/unit/phase1-live-smoke-runner.test.ts`, and
  `tests/integration/realtime-contract.test.ts`.

**Required behavior:**

- Add one result shape with `status: 'passed' | 'failed'` and the fixed failure
  reason `config_provenance_mismatch`.
- Run it after Main/config readiness and before the availability probe and
  conversation start.
- On mismatch, emit exactly one failed terminal result, make zero calls to the
  model probe and `manualStart()`, and complete normal process-tree cleanup.
- On match, preserve the current start → Active → stop → Dormant sequence.
- Keep all error details out of the marker; report safe identifiers only.

**Focused checks:**

```powershell
npm test -- tests/unit/phase1-live-smoke.test.ts tests/unit/phase1-live-smoke-runner.test.ts tests/integration/realtime-contract.test.ts
npm run typecheck:node
npm run test:phase1:live
```

The live result is acceptable only when `status=passed`, provenance is passed,
cleanup is passed, and orphan count is zero.

### Task 2: Run the physical audio baseline before tuning

**Observable outcome:** P1-D1 and P1-D2 run through the real microphone,
speaker, SDK session, and actual-output playback path with operator-observed
results.

**Preconditions:** Task 1 passes; Console shows the intended model snapshot;
the physical input/output device is selected and not busy; analyser activity
tracks audible output.

**P1-D1 execution:**

- Complete 20 directed Traditional-Chinese or mixed Chinese/English turns.
- Include short Mandarin answers and normal pauses; do not change VAD settings
  during the run.
- Observe, without adding new exit gates, at least one backchannel, one nearby
  side conversation, and one background-speech sample from the guide's test
  categories. Record only aggregate outcome counts and bounded reasons.

**P1-D2 execution:**

- Interrupt audible output 10 times across early, middle, and tail playback.
- Include a one-character Mandarin stop/control phrase so a future short-turn
  filter cannot make the device unsilenceable.
- Each accepted interruption must stop audible output and allow the new turn to
  receive an answer. Record counts and timings only.

**Decision rule:** If the PRD demos pass, make no turn-taking code change. If a
repeatable defect occurs, preserve the metadata-only reproduction and stop this
plan; the next change targets only that defect and one implicated setting or
component.

### Task 3: Run the real P1-D5 configuration contract

**Observable outcome:** Draft/Publish/new-session behavior proves that the
provider session uses the exact versioned settings shown by Main, and an invalid
Draft cannot replace Active.

**Execution:**

1. Run a real Draft contract test for Realtime Dialogue and Input
   Transcription.
2. Publish the tested Draft through the existing whole-config confirmation.
3. Confirm the current session retains its frozen snapshot.
4. Start the next session and confirm its config version, fingerprint,
   requested model IDs, voice, and SDK version match Published Active.
5. Test an invalid Draft and confirm the test fails while Active and the live
   session remain unchanged.

No source or environment model override is permitted. A rejected configured
ID remains a visible failure; do not retry with a different model or
transcription model.

### Task 4: Record truthful evidence and decide Phase 1 exit

**Observable outcome:** The repository records real results without promoting
automated or mock evidence, and advances only if every existing Phase 1 exit
criterion passed.

**Files:**

- Modify `PROGRESS.md` with exact metadata-only P1-D1/P1-D2/P1-D5 results.
- Modify `DECISIONS.md` only if the physical evidence creates a durable product
  ruling; routine timings and outcomes stay in `PROGRESS.md`.
- Use the existing Main-owned phase-test recorder for the real demo records.

**Exit checks:**

```powershell
npm test
npm run typecheck
npm run build
npm run test:phase1:live
git diff --check
```

Phase 1 may be accepted and tagged only when P1-D1, P1-D2, and P1-D5 have real
passed evidence, the prior P1-D3/P1-D4/P1-D6 records remain valid, cleanup has
no orphan process or retained RAM transcript/audio, and the full regression is
green. Otherwise record the exact pending/failed boundary and stop; Phase 2
does not start.

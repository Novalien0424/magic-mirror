# Console Stop/Abort and automatic Save/check — Windows, 2026-09-15

## Delivery

- Scene/action/step tests expose Abort during startup; Main invalidates queued starts and stops active scene resources. Developer avatar tests have a shared Stop control.
- Presentation Stop unmounts video/audio/avatar preview resources. Cubism Stop cancels loading or resets active motion, expression and parameter timers; loading can be restarted.
- Voice Stop cancels pending Main reservations/provider requests and serializes renderer cleanup before the next preview acquires output.
- Avatar **Save all changes** saves a snapshot and automatically checks it. Saving/checking/failure are visible, checking can be aborted, newer edits remain local, and only a current successful check enables the separate Publish action. Saving does not publish or activate an avatar.
- Scene dialogue cancellation tracks its tagged provider response; an unrelated output completion cannot release the pending cue. The raw receiver is muted and the processed graph is interrupted/drained; canceled output-start events cannot reopen it. Only the matching response completion and buffer-clear acknowledgement release cancellation. Missing acknowledgements or transport failure trigger visible session recovery after at most eight seconds. Finished cue controllers are released.

## Evidence

Artifacts below are relative to `.artifacts/phase4-qa/`. Each completed run retains build provenance, evidence JSON and screenshots.

| Command | Result | Artifact run |
| --- | --- | --- |
| `node scripts/run-phase4-qa.mjs --profiles` | Exit 0; 25 checks, 25 screenshots, including valid/invalid save, in-flight edits, abort and local/generated voice restart | `2026-09-15T11-32-08-143Z` |
| `node scripts/run-phase4-qa.mjs --audio` | Exit 0; 3 checks, 3 screenshots, including all manual avatar controls and Stop | `2026-09-15T11-38-13-662Z` |
| `node scripts/run-phase4-qa.mjs --console` | Exit 0; 38 checks, 32 screenshots; scene/action/step startup Abort and restart, presentation/media Stop, responsive/readability checks | `2026-09-15T11-52-19-794Z` |
| `node scripts/run-phase4-qa.mjs --cubism` | Exit 0; 181 checks, 15 motions, 10 expressions, 3 screenshots; startup abort/reload, all Core parameter defaults, timer cancellation and page-leave cleanup | `2026-09-15T11-54-05-270Z` |

Focused `npx vitest run` covered voice lease/broker, Console IPC/config, bridge projection, probes, scene composer/runtime, profiles, avatar media and Realtime adapter/owner: **166 tests in 13 files, exit 0**. `npm run typecheck:web` and `npm run build` passed. Full Node typecheck exits 1 solely for the pre-existing TS7016 import of `scripts/qa-artifacts.mjs` in `tests/unit/qa-artifacts.test.ts`.

Visual review confirmed the accessible scene Abort button, single Save layout, retained newer edits with Publish disabled, and Cubism canvas. QA identified and repaired three small volume-description fonts; decorative hidden help icons are excluded from readable-text measurements. Cubism's sweep incorrectly treated the live slider reading as the Core default: the harness now reads the declared Core default explicitly.

## Retained unsuccessful evidence

- `2026-09-15T11-28-38-126Z`: generated voice startup cancellation exposed a retained Main reservation; fixed and profile run passed.
- `2026-09-15T11-32-54-434Z`: interrupted runner; excluded from passing evidence.
- `2026-09-15T11-33-33-046Z`, `2026-09-15T11-38-31-646Z`: readability findings; repaired and Console run passed.
- `2026-09-15T11-36-54-341Z`: developer controls tested under developer-disabled mode; dedicated audio mode enables the intended test controls.
- `2026-09-15T11-41-03-647Z`, `2026-09-15T11-42-38-592Z`: Cubism default-expectation mismatch; startup Abort/restart passed, broader sweep required corrected expectation.

## Limits

These are Windows automated UI and focused deterministic checks. Scene dialogue's queued provider cancellation is regression-tested with a controlled transport; physical speech/audio, live provider timing, microphone wake accuracy, Raven sound/echo, hardware adapters and long-run acceptance still require the operator checks in TODO. No phase promotion, operator config publication, or avatar activation was performed. Earlier profile/audio runs precede the final response-cancellation hardening and are evidence for their unchanged boundaries.

## Final checks and runtime

Final focused command (exit 0, 166 tests):

```powershell
npx vitest run tests/unit/voice-preview-lease.test.ts tests/unit/client-secret-broker.test.ts tests/unit/console-ipc.test.ts tests/unit/mirror-projection.test.ts tests/unit/console-config-ui.test.ts tests/renderer/console/visual-asset-probe.test.ts tests/renderer/console/scene-composer.test.ts tests/unit/profile-workspace.test.ts tests/renderer/avatar/avatar-media-controller.test.ts tests/main/scenes/scene-runtime.test.ts tests/unit/realtime-session-adapter.test.ts tests/unit/realtime-runtime-owner.test.ts tests/unit/voice-effects.test.ts
```

Final web typecheck/build and `git diff --check` passed. Node typecheck retained only the known TS7016 above. An independent bounded review identified queued dialogue ownership, processed-output gating, clear-event correlation, transport failures and controller cleanup; all were addressed with focused regression checks. The response-ID matching follows the installed SDK schema and [official server event definition](https://platform.openai.com/docs/api-reference/realtime-server-events); full documentation retrieval hit the tool's content-length limit.

Normal `npm run dev` launched from the canonical checkout as session 54364 at `http://localhost:5173/`. QA is shut down. Dev overwrites `out/`; rebuild stamped output before future QA. Operator config was preserved.

At 20:01 Asia/Taipei, Main and both renderers reported ready, and the normal Mirror window was shown. Wake quality and physical audio are not inferred from startup readiness.

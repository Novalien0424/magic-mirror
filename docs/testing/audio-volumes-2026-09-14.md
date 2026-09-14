# Independent audio volumes — Windows, 2026-09-14

Delivered locally in Console → System → Devices → Volume. The three 0–100% sliders apply immediately and save automatically for every avatar. Zero mutes the selected category. Controls work with developer mode disabled; diagnostic commands retain their developer restriction.

| Control | Playback scope |
| --- | --- |
| BGM | Scene music, sleep ambience, music-library previews |
| Avatar audio | Realtime conversation, recorded speech, local/generated Voice Studio auditions |
| Sound effects | Embedded scene-video audio |

Standalone audio assets still belong to the existing music path. This change does not introduce a new sound-effect asset/action type. Scene-authored gains, Voice Studio output trim/level matching and speech ducking remain multiplicative. Category changes do not reroute speakers or acquire a microphone. The processed Realtime graph retains interruption ownership and the muted SDK receiver.

Main persists the optional `volumes: { bgm, avatar, effects }` object in the existing `audio-devices.json`, using the existing atomic save and sender-validated IPC. Legacy preferences remain valid and imply 100% for all categories. Malformed, nonfinite and out-of-range values are rejected before saving. Main returns the saved preferences to Console so delayed Mirror reports cannot move a slider back to an old value.

Implementation: `src/shared/audio-devices.ts`, `src/main/ipc.ts`, `src/renderer/audio-devices.ts`, `src/renderer/avatar/audio/avatar-media-controller.ts`, `src/renderer/avatar/PresentationStage.tsx`, and the Console App, MediaLibrary and voice-preview modules. Regression coverage extends the audio preferences/router/media-controller tests and the existing Console QA driver/runner.

## Fresh verification

- `npx vitest run` targeting audio-preferences, audio-devices, avatar-media-controller, console-ipc, console-ui, realtime-audio-ownership, realtime-runtime-dependencies, voice-effects and voice-preview-lease: **93 tests / 9 files, exit 0**. New persistence/router/audio-routing assertions were observed failing before implementation, then passing.
- Final focused `npx vitest run tests/unit/console-ui.test.ts tests/renderer/avatar/audio/music-ducking.test.ts`: **19 tests / 2 files, exit 0**; includes the Console tests rerun after the operator-mode repair.
- `npm run build`: **exit 0**, completed stamped build. `npm run typecheck:web`: **exit 0**. `node --check scripts/run-phase4-qa.mjs`: **exit 0**.
- `npm run typecheck`: **exit 1**, existing `tests/unit/qa-artifacts.test.ts:6` TS7016: no declaration for `../../scripts/qa-artifacts.mjs`. A temporary config extending `tsconfig.node.json` and excluding only that test passed `npx tsc --noEmit -p tsconfig.audio-volume-check.json`, **exit 0**; the temporary config was removed. The unrelated declaration issue is not repaired here.
- `node scripts/run-phase4-qa.mjs --audio`: **exit 0, 2 checks, 2 screenshots**. Production DOM controls set BGM 30%, Avatar 70%, Effects 0%; saved preferences and Mirror voice gain were checked, Console was reloaded, all values were restored, and controls were returned to 100% in isolated QA data. [Run and build provenance](../../.artifacts/phase4-qa/2026-09-14T06-34-06-452Z/), [large capture](../../.artifacts/phase4-qa/2026-09-14T06-34-06-452Z/screenshots/console-volume-controls.png), [1024 capture](../../.artifacts/phase4-qa/2026-09-14T06-34-06-452Z/screenshots/console-volume-controls-1024.png). Both layouts were visually inspected: labels, percentages, sliders and mute state are readable without overlap.
- With `MIRROR_VOICE_QA=1` and `MIRROR_VOICE_QA_LIVE=0`, `node scripts/run-phase4-qa.mjs --editor`: **exit 0, 6 checks**, including decoded local fixture looping, Original/Processed switching and Stop. [Run](../../.artifacts/phase4-qa/2026-09-14T06-34-47-515Z/). A GPU teardown message appeared after the passed result; no provider audition or physical listening acceptance is claimed.

## Retained failures and limits

- [First QA run](../../.artifacts/phase4-qa/2026-09-14T06-29-15-505Z/): exit 1 (child 2), new harness attempted the Devices subtab before React committed System navigation; repaired.
- [Second QA run](../../.artifacts/phase4-qa/2026-09-14T06-30-00-943Z/): exit 1 (child 2), sliders inherited developer-mode disabling; repaired and verified in normal operator mode.
- [Broader editor run](../../.artifacts/phase4-qa/2026-09-14T06-31-29-588Z/): new audio checks and presentation preview passed; exit 1 (child 2) later at `console_mixed_batch_and_previews`. Its failure screenshot remained on Advanced config after the existing rejected-edit/navigation sequence. That broader harness issue remains outside this audio change; no full editor pass is claimed. The focused `--audio` mode provides independent audio-control evidence.

Both persistent Private Electron firewall rules were verified against the canonical executable before launch. QA used isolated synthetic user data and did not overlap normal Electron. No Electron process remained in the final direct process check. Existing local harness edits were preserved; no commit, push, phase promotion or Mac readiness claim. Physical speaker balance and live-provider listening remain operator checks.

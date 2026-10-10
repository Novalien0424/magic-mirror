# QA modes and current-build verification

Choose the evidence boundary needed for the task. Mode names such as `live`
describe provider use, not necessarily a physical microphone. Read the selected
runner/probe before claiming audio coverage.

## Audio evidence and permissions

| Input route | Coverage | Remaining evidence |
|---|---|---|
| Synthetic text (`--lifecycle-live`, `--spells-live`) | Prompt/tools, application controls and provider output sequencing | Input ASR, native capture, human/acoustic quality and physical effects |
| Synthesized PCM -> virtual microphone -> WebRTC (Raven conversation QA) | Real provider ASR/VAD, dialogue/tools, IPC and processed playback on fixture audio | Native microphone/TCC, speaker-to-mic delivery and representative human acceptance |
| Speaker -> native wake capture (Raven acoustic cases) | Acoustic wake route if fresh native input and a detection are observed | A playback callback or `signal`/`silent` wait alone does not prove the stimulus was heard; no-event results need delivery evidence |
| Human -> selected production microphone | Actual route and representative recognition/interruption behavior | Acceptance covers only the tested conditions; mock adapters cannot prove physical hardware |

[Raven probe](../../../../src/main/raven-conversation-probe.ts) substitutes
`getUserMedia` with `createMediaStreamDestination`; its acoustic playback option
instead goes to an output device for native wake capture. A single run can mix
these routes. [Raven runner](../../../../scripts/run-raven-conversation-qa.mjs)
adds an isolated fixture spell/scene with mock hardware, so a fixture pass does
not establish that the ordinary published avatar has enabled spells/scenes.

The [failed-run baseline](../../../../.artifacts/wake-spell-rca-2026-10-10/results.json)
skipped the normal Mac microphone request for Phase 4 QA. Current
[Main permission setup](../../../../src/main/index.ts) uses
[the policy/helper](../../../../src/main/wake/microphone-permission.ts) to include
Raven native-wake QA; inspect eligibility for the chosen mode. The helper's
`granted` result when `required` is false remains a skip, not an OS status
measurement. Acoustic or human-microphone QA must exercise the real
permission/status path and report any bypass explicitly. Neither a source fix
nor silent PCM proves a TCC outcome. Follow
[physical wake RCA](../../mm-wake-word/references/handoff-platform.md) for native
freshness/energy, route, delivery, detector and lifecycle evidence.

## Choose the evidence needed

- `npm run test:phase4:qa:lifecycle-live`: synthetic host/Raven greeting, follow-up
  and sleep with the real provider. Checks native prompt windows, wire tool
  definitions/structured results and processed output silence before farewell.
  Retain failures; a tool-call pass does not prove pre-tool silence or mic ASR.

- `node scripts/run-phase4-qa.mjs --spells-live`: synthetic text with real
  provider speech; compares no-coaching behavior and exact prefix playback
  before one scene. Stores comparison flags only. Does not prove microphone ASR.
- `node scripts/run-phase4-qa.mjs --video-fades`: focused Console import,
  fade editing, Save/Publish and portrait playback with computed opacity and
  embedded-video gain samples. Does not prove physical speaker output.

- `npm run test:phase4:qa:profiles`: new Avatar journey plus local Voice QA,
  independent persona/rig/voice/scenes, draft retention, invalid Save, guarded
  navigation/reload, saved scope after reload, Publish and Dormant activation.
  Captures 1440x900 and 1024x768 Console states. Active-conversation switch
  denial remains separate Main/unit evidence; this mode makes no provider call.

- `npm run test:phase4:qa:cubism`: dedicated Live2D Cubism page, every motion
  index/expression/actual MOC parameter, reset/cancellation and rig replacement.
  Mirror stays hidden; no portrait, speech or scene-playback claim. Built-in
  Ren and managed Ren with a second Scene clip are always covered. Set
  `MIRROR_CUBISM_QA_MODEL` to an external manifest to cover that rig too; an
  omitted value does **not** test Raven. Read the [Cubism rerun handoff](../../../../docs/testing/cubism-console-2026-09-08.md#independent-qa-handoff)
  for the supplied Raven fixture, expected evidence and native checks.
- `npm run test:phase4:qa:editor`: real Console import, authoring, validation,
  Test/Publish and failure cases. Mirror stays hidden. No portrait or playback
  evidence is claimed by this mode.
- `npm run test:phase4:qa:console`: the editor journey plus actual finite-video
  playback and Avatar return on the portrait monitor.
- `npm run test:phase4:qa`: all exported Cubism motions/expressions, legacy
  Scenes, still/finite/loop/embedded-audio/replacement/failure cases.
- `npm run test:phase4:qa:live`: configured-provider/output integration.
  [Its setup](../../../../src/main/phase4-qa.ts) substitutes a silent virtual
  microphone; the mode name does not claim physical conversation or ASR quality.
- `node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario sleep_spells`: canonical-Mac
  Raven fixture with synthesized visitor audio and real WebRTC ASR/tools.
  Other scenarios include acoustic wake playback. Use only when that runtime
  and provider work is authorized; inspect route-specific results and exclusions.
  `--scenario wake_diagnostic` measures the native speaker/capture/detector route
  without opening Realtime. `--scenario wake_replay` releases the worker, captures
  bounded RAM-only PCM through the same implementation in Main, and compares live,
  identical replay, gain, keyword bias and clean-source recognition. Its successful
  exit means the diagnostic completed; inspect detection results separately.
  Neither mode establishes human acceptance. `--launch-agent` uses a temporary one-shot job with
  `KeepAlive: false`, matching the deployed launch context without another restart
  owner. Direct-spawn QA remains available by omitting that flag; a permission
  result in one launch context does not prove another's capture access.

Raven probe response counts based on `output_audio_buffer.started` describe
provider output, not final processed speaker audibility. Distinguish generated
dialogue, response ownership, processed output/tail completion and physical sound.
Request fields and server-echoed transcription fields are separate evidence:
missing echo alone does not prove a hint was ignored.

Run `npm run build` after code changes before Electron QA; the runners execute
`out/`, not the source tree. The Phase 4 runner requires a completed build stamp
and verifies input/output content hashes before launching. Missing, interrupted,
stale or altered builds must be rebuilt, not bypassed. Each run retains the
hashes and build time in `build.json`; credentials/user data are never inputs.
Both runners require the canonical host checkout; Raven conversation QA is
Mac-only. Prefer a named npm mode, or pass one supported flag directly to the
Phase 4 Node runner; npm/PowerShell argument forwarding can consume flags.
Unknown/combined modes are rejected. Fixture fields such as `windowsDecode`
are schema/provenance labels, not proof of Mac decoding or physical acceptance.

# QA modes and current-build verification

Repository implementation reference; installed code, current DECISIONS and focused contract tests outrank historical SDK/version observations. Follow AGENTS for execution policy.

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
- `npm run test:phase4:qa:live`: configured-provider conversation and audible
  output integration. Use only when live provider/microphone work is in scope.

Run `npm run build` after code changes before Electron QA; the runners execute
`out/`, not the source tree. The Phase 4 runner requires a completed build stamp
and verifies input/output content hashes before launching. Missing, interrupted,
stale or altered builds must be rebuilt, not bypassed. Each run retains the
hashes and build time in `build.json`; credentials/user data are never inputs.
Use one named npm mode on PowerShell: extra flags can be consumed by npm instead
of reaching the runner. Unknown/combined modes are rejected.

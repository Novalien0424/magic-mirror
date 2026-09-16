# Magic Mirror — Current handoff

## Raven V11 performance candidate — 2026-09-16

Built on `7072a1c` in the isolated cloud checkout, branch `raven-v11-calm-performance`. Seven restrained state motions, explicit per-model ownership/loop policy, full blink closure, crossfade/cancellation fixes and updated `mm-live2d-avatar` skill are delivered as a candidate. V10 remains byte-identical; MOC/atlas/Layout are preserved. [Acting plan and runtime](resources/avatar/Raven/v11/README.md), [audit and open acceptance gates](resources/avatar/Raven/v11/AUDIT.md).

Focused Linux checks passed 92 tests / 9 files, web typecheck, skill validation and actual Core structural inspection (27 parameters, 22 drawables). Current rendered QA is **blocked**: no Windows desktop connection, and cloud browser policy rejected local/file preview URLs. No Windows/Electron or visual naturalness acceptance is claimed. The existing Windows runtime and operator drafts were not accessed or changed; previous runtime statements below are historical. Use the new code plus separate V11 import for canonical Windows QA; no automatic model activation, merge or phase promotion.

Remote delivery completed after the user explicitly approved the 30-file payload: [draft PR #1](https://github.com/Novalien0424/magic-mirror/pull/1), branch `raven-v11-calm-performance`. The uploaded candidate tree was verified identical to the reviewed local tree. The initial HTTPS-credential failure and automatic approval rejection remain historical evidence in the audit. The existing Git bundle is the pre-upload checkpoint. Live activation and Windows visual acceptance remain separate.

## Clock-in and field-help delivery — 2026-09-14, Asia/Taipei

Resumed and completed the paused Console tooltip task in canonical `C:/Project/magic-mirror`, branch `main`, starting from `3b20c81`. All 82 input/select/textarea source locations now have field-specific accessible help, including conditional scene controls, dynamic Cubism parameters and Voice Studio's local-file chooser. Hover, Tab focus, Enter/Space, click pinning, Escape and outside dismissal are covered. Existing audio and harness/document edits are preserved. No phase promotion. [Implementation, fresh checks, screenshots and retained failures](docs/testing/field-help-2026-09-14.md).

Commit/push follow-up: the operator requested committing and pushing the completed work. The earlier harness compaction and the audio/field-help delivery are packaged as separate commits on `main`. Fresh pre-commit validation passed 77 tests / 15 files and web typecheck; staged whitespace checks passed. Product source is unchanged from the running development session below, which is preserved to avoid losing new operator edits. Earlier reports' no-commit/no-push statements describe their original delivery time.

Fresh Windows evidence: 62 tests / 11 files passed; field-help Electron QA passed 20 checks with 6 screenshots; local Voice Studio QA passed 6 checks with 3 screenshots. Stamped build, web typecheck and scoped Node check (182 files) passed. Full Node typecheck still has the existing missing `qa-artifacts.mjs` declaration. Screenshots were visually inspected, including 1024/768 window widths and Ren's rig parameters. Physical touch/screen-reader acceptance and live-provider listening were not performed.

The detached `.worktrees/field-help` checkout remains a preserved historical partial copy; the completed implementation is in canonical. Its older audio baseline was not transferred. [Original paused handoff](docs/testing/field-help-handoff-2026-09-14.md).

Runtime: after isolated QA exited and a process/port check found no running Electron or port-5173 listener, canonical `npm run dev` was restarted as requested. Session `79343` reported `MAIN_READY`, both windows loaded and both renderers ready; Vite serves `http://localhost:5173/`. The app is left running for operator testing. Preserve any new unsaved Console edits before future reload/restart. `out/` now contains a development build; rebuild a stamped bundle before another Electron QA run.

The preceding independent BGM / Avatar audio / Sound effects controls remain delivered locally; Sound effects currently covers embedded scene-video audio. [Audio implementation and earlier Windows evidence](docs/testing/audio-volumes-2026-09-14.md). The broader editor QA's earlier config/navigation failure remains outside these focused passes.

## Previous harness work — 2026-09-13

Task: apply OpenAI's GPT-6 Astra skill/prompt guidance to all six personal Codex skills and compact the related user/project harness. Local instruction changes only; no product implementation, publication or phase promotion.

Clock-in checkout: canonical `C:/Project/magic-mirror`, branch `main`, HEAD `3b20c81` (`Mark QA artifacts and add reviewed scoped cleanup`); working tree was clean. No Electron process was found in the task's direct process check. Runtime was not launched or restarted. Older PIDs in archived handoffs are historical.

Harness change scope, validation and local backup: [audit](docs/testing/harness-compaction-2026-09-13.md). Current task edits remain local; this record does not claim a commit or push.

## Current Windows delivery and evidence

- Audio volumes: persistent 0–100% controls, operator-mode access, independent music/speech/embedded-video gains, retained ducking and preview level matching. [Fresh 2026-09-14 evidence](docs/testing/audio-volumes-2026-09-14.md).
- Profile Console: Mirror / Avatars / System; avatar-owned Persona, Appearance, Voice and Spells/scenes; explicit shared-resource scope and separate publish/activation. [Delivery/runbook](docs/testing/profile-console-2026-09-09.md), [actual-image review](docs/testing/profile-console-reviews-2026-09-09.md). Prior evidence: 942 tests / 103 files; editor 26, profile journey 16 and Cubism including Raven 224 checks, exit 0. These were not rerun during harness work.
- Voice Studio: shared processed Realtime output, per-avatar provider and DSP controls, frozen sessions, default/Raven presets. [Implementation and acoustic gates](docs/testing/voice-studio-implementation-2026-09-09.md), [delivery](docs/testing/voice-studio-delivery-2026-09-09.md). Prior measured added p95 149.333 ms, interruption stale/muted RMS 0; human sound and hardware acceptance remain open.
- Cubism: reusable managed rig library, names/versions, persistent discovery and looping Console motions. [Loop preview](docs/testing/cubism-loop-preview-2026-09-09.md), [labels](docs/testing/avatar-library-labels-2026-09-09.md), [framing](docs/testing/avatar-framing-2026-09-08.md). Current Raven master: [v10 storage](resources/avatar/Raven/README.md), [v10 handoff](RAVEN-V10-EXPRESSION-FIX-HANDOFF.md). Large ignored editable/QA assets require separate backup.
- QA artifact ownership and reviewed cleanup are delivered at HEAD: [workflow and 21-test proof](docs/testing/qa-artifact-cleanup.md). New marked runs use the scoped tool; older unmarked artifacts cannot be adopted by fabricating markers.

## Blockers and next product work

- Phases 0–3 remain accepted Windows checkpoints; Phase 4 remains active, unaccepted and untagged. Pulled-forward avatar/Console work does not start Identity or Memory. Phases 5→6→7 and the later Mac port remain sequential.
- First-boot wake remains unresolved. Capture actual speech on a failing boot with the RAM-only wake meter; synthetic probes did not reproduce it. [Wake evidence](docs/testing/wake-first-boot-2026-09-06.md).
- Human default/Raven sound tuning, physical speaker/echo and interruption, operator scenes/media, physical adapters and long-run performance remain. [Phase 4 checklist](docs/testing/phase4-scene-media-windows-checklist.md), [scene evidence](docs/testing/scene-editor-usability-2026-09-06.md). Phase 7 retains offline wake, multi-speaker/19-of-20 live-wake and 30-minute ambient/TV negative evidence.
- Cleanup of the profile task's 12 QA runs plus one temporary review directory was repeatedly denied by tool policy, last recorded 2026-09-10; exact paths are in the profile delivery report. User authority already exists, but historical denial is not proof that today's tool policy permits deletion. This harness task did not retry it.
- The Claude-in-Codex launcher repair has prior fresh-MCP proof; adopting it required a new connection/session. [Repair evidence](docs/testing/claude-in-codex-windows-repair-2026-09-09.md). No fresh connection or review claim here.

For requested fresh UI QA, follow [mm-ui-qa](.agents/skills/mm-ui-qa/SKILL.md), preserve operator drafts, use a matching stamped build, and explicitly supply the current Raven manifest when testing Raven. Inspect new screenshots and record fresh results. No startup or publication is implied by this handoff.

## History

[Pre-compaction handoff](docs/archive/progress-before-harness-2026-09-13.md) retains all earlier delivery states, failures, exact artifact links and runtime observations. Its linked older archives remain available. [AGENTS](AGENTS.md) owns execution policy; [DECISIONS](DECISIONS.md) owns durable rulings.

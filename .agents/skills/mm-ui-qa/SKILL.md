---
name: mm-ui-qa
description: "Run, extend or audit Magic Mirror Electron QA on the canonical Mac or Windows host; distinguish visual, synthetic provider and physical audio evidence."
---

# Electron QA and evidence boundaries

Use current [PROGRESS](../../../PROGRESS.md) evidence/runbook links to choose cases. A previous pass is not fresh QA. Mac is the canonical deployment target at `/Users/novalien0424/magic-mirror`; Windows development uses `C:/Project/magic-mirror`. Apply [AGENTS](../../../AGENTS.md) host and execution safeguards. For a static/no-launch audit, inspect source and existing metadata without starting QA.

| Task | Read |
|---|---|
| Select visual/text/virtual-mic/physical evidence, permission coverage and build | [modes](references/modes.md) |
| Extend rendered controls, native-picker substitution or display assertions | [interaction](references/interaction.md) |
| Inspect captured images, framing, motion, media or failure evidence | [visual evidence](references/visual-evidence.md) |
| User-requested disposal of owned QA artifacts | [artifact cleanup](references/artifact-cleanup.md) |

Runners execute stamped `out/`; rebuild changed source rather than bypassing hashes. Use isolated synthetic fixtures and production UI paths; bridge mutation cannot claim operator authoring. Keep operator data, transcripts, credentials and unrelated desktop content out of captures.

Require exit 0 plus expected executed cases for a pass; inspect the relevant screenshots. Built-in Ren does not prove Raven, Console-only does not prove portrait display, and pixels do not prove physical sound, smoothness or fog/lights. External rig coverage must identify its manifest.

Identify each audio route explicitly. Synthetic WebRTC ASR tests provider and
application integration; speaker-to-native-mic wake and real human speech have
separate signal/permission/delivery requirements. Real microphone QA must not
silently inherit a synthetic permission bypass. A playback callback or running
input process is insufficient physical audio evidence.

Fix observed failures and rerun the affected mode within scope. Preserve failed evidence and actual manual exclusions. Cleanup requires task ownership, completion/review markers and current authority; do not fabricate markers or bypass policy rejection. Record command, exit, cases, build/artifact links, visual findings and remaining manual checks. QA does not advance phases.

---
name: mm-ui-qa
description: "Run, extend or audit Magic Mirror Electron QA runners and screenshots; separate visual, synthetic-provider, acoustic and human-microphone evidence."
---

# Electron QA and evidence boundaries

Use current [PROGRESS](../../../PROGRESS.md) evidence/runbook links to choose cases. A previous pass is not fresh QA. For a static/no-launch audit, inspect source and existing metadata without starting QA.

| Task | Read |
|---|---|
| Select visual/text/virtual-mic/physical evidence, permission coverage and build | [modes](references/modes.md) |
| Extend rendered controls, native-picker substitution or display assertions | [interaction](references/interaction.md) |
| Inspect captured images, framing, motion, media or failure evidence | [visual evidence](references/visual-evidence.md) |
| User-requested disposal of owned QA artifacts | [artifact cleanup](references/artifact-cleanup.md) |

Runners execute stamped `out/`; rebuild changed source rather than bypassing hashes. Use isolated synthetic fixtures and production UI paths; bridge mutation cannot claim operator authoring. Keep operator data, transcripts, credentials and unrelated desktop content out of captures.

Require exit 0 plus expected executed cases for a pass; inspect the relevant screenshots. Built-in Ren does not prove Raven, Console-only does not prove portrait display, and pixels do not prove physical sound, smoothness or fog/lights. External rig coverage must identify its manifest.

Identify each audio route explicitly; each proves only its own boundary. Provider dialogue is probabilistic: one pass or failure is a sample, so report rates over repeated runs ([prompt evidence](../roleplay-control-prompts/SKILL.md)).

Fix observed failures and rerun the affected mode within scope. Preserve failed evidence and actual manual exclusions. Record command, exit, cases, build/artifact links, visual findings and remaining manual checks. QA does not advance phases.

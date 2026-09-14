---
name: mm-ui-qa
description: "Run or extend real Windows Electron visual QA for Magic Mirror Console, Cubism or portrait scene playback."
---

# Windows UI QA

Use current [PROGRESS](../../../PROGRESS.md) evidence/runbook links to choose cases. A previous pass is not fresh QA. Run only from canonical `C:/Project/magic-mirror` with AGENTS firewall/unsaved-edit safeguards; never overlap normal Electron, another QA run or full `npm test`.

| Task | Read |
|---|---|
| Select profile/Cubism/editor/portrait/live mode and verify the build | [modes](references/modes.md) |
| Extend rendered controls, native-picker substitution or display assertions | [interaction](references/interaction.md) |
| Inspect captured images, framing, motion, media or failure evidence | [visual evidence](references/visual-evidence.md) |
| User-requested disposal of owned QA artifacts | [artifact cleanup](references/artifact-cleanup.md) |

Runners execute stamped `out/`; rebuild changed source rather than bypassing hashes. Use isolated synthetic fixtures and production UI paths; bridge mutation cannot claim operator authoring. Keep operator data, transcripts, credentials and unrelated desktop content out of captures.

Require exit 0 plus expected executed cases for a pass; inspect the relevant screenshots. Built-in Ren does not prove Raven, Console-only does not prove portrait display, and pixels do not prove physical sound, smoothness or fog/lights. External rig coverage must identify its manifest.

Fix observed failures and rerun the affected mode within scope. Preserve failed evidence and actual manual exclusions. Cleanup requires task ownership, completion/review markers and current authority; do not fabricate markers or bypass policy rejection. Record command, exit, cases, build/artifact links, visual findings and remaining manual checks. QA does not advance phases.

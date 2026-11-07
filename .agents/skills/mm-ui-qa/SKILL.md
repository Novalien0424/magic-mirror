---
name: mm-ui-qa
description: "Run, extend or audit Magic Mirror Electron QA runners and screenshots; separate visual, synthetic-provider, acoustic and human-microphone evidence."
---

# Electron QA and evidence boundaries

Use [PROGRESS](../../../PROGRESS.md) to select relevant cases/evidence; open an unresolved issue when applicable. Do not load completed ledgers by default. A previous pass is not fresh QA; a static/no-launch audit starts no QA.

| Task | Read |
|---|---|
| Select visual/text/virtual-mic/physical evidence, permission coverage and build | [modes](references/modes.md) |
| Extend rendered controls, native-picker substitution or display assertions | [interaction](references/interaction.md) |
| Inspect captured images, framing, motion, media or failure evidence | [visual evidence](references/visual-evidence.md) |
| User-requested disposal of owned QA artifacts | [artifact cleanup](references/artifact-cleanup.md) |

Runners execute stamped `out/`; rebuild changed source rather than bypassing hashes, and do not edit `src`/`resources` while a batch runs (later runs refuse the stale stamp). Use isolated synthetic fixtures and production UI paths; bridge mutation cannot claim operator authoring. Keep operator data, transcripts, credentials and unrelated desktop content out of captures.

Require exit 0 plus expected executed cases for a pass; inspect the relevant screenshots. Built-in Ren does not prove Raven, Console-only does not prove portrait display, and pixels do not prove physical sound, smoothness or fog/lights. External rig coverage must identify its manifest.

Identify each audio route explicitly; each proves only its own boundary. Provider dialogue is probabilistic: one pass or failure is a sample, so report rates over repeated runs ([prompt evidence](../roleplay-control-prompts/SKILL.md)).

Owner sound directive (2026-10-17, clarified 2026-10-23/31, 2026-11-07): **outputs at 1%
during QA are intentional; after QA every external speaker returns to its calibrated normal level
(Jabra 80%, A1 65%, Edifier 50% since the owner's 11-07 tuning: `ops/music-device/speaker-levels.json`), even if its captured
starting volume was lower.** Before sound-producing QA, capture output/mute by
device identity and use the minimum output level (tested Mac system route: 1%).
On success, failure or cancellation, first finish/release owned test playback,
then restore every external output (Jabra and Bluetooth speakers) to its normal level, unmuted
(owner 2026-10-31/11-07) with the installed native helper
`"$HOME/Library/Application Support/MagicMirror/ops/stop-state" --reset-output` and
verify with `--output-status`. The helper accepts hardware rounding within 1.5
percentage points. The Mac mini speaker returns to its captured level and mute;
never change input gain. Protect any alternate output selected by the test too.
In field button QA, START/STOP/MUSIC LOOP reset to the normal levels, Dance raises the Jabra to 90%
(others keep their offsets) after its welcome and leaving Dance restores them: re-quiet after each.
Use guaranteed cleanup, not a success-only restore; report a failed reset/read-back
instead of claiming restoration. Mark acoustic evidence as minimum-volume; do not
silently raise volume to satisfy an acoustic threshold.

Speaker sync (2026-11-01): music reaches the speakers through Airfoil and runs
≈2.15 s behind the source; AirPlay speakers follow the Jabra's level with their offset
(5% floor, never above the Jabra), so 1% QA on the Jabra quiets them too. Judge sync by measurement, never by ear: STOP, then
`deploy/macos/speaker-sync/measure.sh <mic-uid>` (runbook "Airfoil music route").
A Jabra mic cannot hear another Jabra. Two attached Jabras make the normal-level reset
refuse (`jabra_output_ambiguous`): report it, do not work around it.

Electron QA holds the operator lease, so venue Stream Deck presses fail with
`electron_owner_busy` meanwhile: tell the owner before a long batch. Acoustic wake
uses the Mac mini speaker as the synthetic visitor; at its normal 1% venue level a
miss is an environment limit, not a product failure.

Fix observed failures and rerun the affected mode within scope. Preserve failed evidence and actual manual exclusions. Record command, exit, cases, build/artifact links, visual findings and remaining manual checks. QA does not advance phases.

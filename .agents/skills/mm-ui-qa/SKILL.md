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
In field button QA, START/STOP/MUSIC LOOP/VIDEO LOOP reset to the normal levels, Dance raises the Jabra to 90%
(others keep their offsets) after its welcome and leaving Dance restores them: re-quiet after each.
Use guaranteed cleanup, not a success-only restore; report a failed reset/read-back
instead of claiming restoration. Mark acoustic evidence as minimum-volume; do not
silently raise volume to satisfy an acoustic threshold.

Speaker sync (2026-11-08): music reaches the speakers through Airfoil ≈2.15 s behind the
source; AirPlay speakers follow the Jabra's level with their offset (5% floor, never above
the Jabra), so 1% QA on the Jabra quiets them too. Judge sync by measurement, never by ear:
STOP, Jabra at 100%, run `deploy/macos/speaker-sync/measure-continuous.sh` through the
Electron lease into a fresh RAM-disk directory (usage in its header); it records one
continuous mic, scans 0–30 s, deletes raw audio and resets/read-checks levels. Jabras: A1
mic with `no-a1`; A1: Jabra mic with `group` (a Jabra mic cannot hear a Jabra; A1's mic
switches A1 to HFP). Compare speakers within one capture. Wait ≥2 min after an Edifier
connect; A1 glides ~6 min (starts ~130 ms late) after its own connect **or a Computer
(Jabra) join**, not after an Edifier join. End as STOP does: Computer and A1 connected,
only the Edifier released; after reconnecting either, wait 6.5 min before START. Never
select the Edifier in macOS Sound settings; relaunch Airfoil only in authorized tests.
A loop pressed from STOP must start after `music_output_route_settled` (11-09); check that
order in `app.out.log`. A 1% cold-loop check on the production app: quiet with
`deploy/macos/qa-output-volume.swift`, bootstrap the LaunchAgent, send
`scripts/operator-command.mjs play_loop|music_loop`, end with the STOP key, then restore.
Wait for `RENDERER_READY` before sending, as the key does, or the start is doubled.
Root cause of the 11-08 2 s echo: the old music device was both what apps played into and
what Airfoil listened to, so its 2.081 s picture delay (`mmlt`) leaked into Airfoil's
timing for the Jabra and A1 whenever coreaudiod loaded it. Producers now use output-only
**Magic Mirror Music**; Airfoil reads input-only **Magic Mirror Capture** (zero). Never
point Airfoil at a device that reports latency. Evidence:
`docs/testing/airfoil-sync-2026-11-08-followup.md`.
Exclusion rule (11-08 misdiagnosis): a test rules a variable out only if it resets the
layer that caches it (Core Audio reads `mmlt` at driver load; an Airfoil relaunch proves
nothing: restart `coreaudiod` with the app stopped and Airfoil quit). Prefer A/B/A and
isolate one change per run; a gap equal to a configured value (2081 ms = 99888 frames)
stays the prime suspect. Test controllable variables before blaming opaque ones
(encrypted AirPlay, firmware); check the runner does not undo the condition; a run
contaminated by an earlier trigger is not a pass.
Two attached Jabras make the normal-level reset
refuse (`jabra_output_ambiguous`): report it, do not work around it.

Electron QA holds the operator lease, so venue Stream Deck presses fail with
`electron_owner_busy` meanwhile: tell the owner before a long batch. Acoustic wake
uses the Mac mini speaker as the synthetic visitor; at its normal 1% venue level a
miss is an environment limit, not a product failure.

Fix observed failures and rerun the affected mode within scope. Preserve failed evidence and actual manual exclusions. Record command, exit, cases, build/artifact links, visual findings and remaining manual checks. QA does not advance phases.

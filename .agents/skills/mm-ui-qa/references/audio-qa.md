# Audio QA on the deployed Mac

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
Inside an `electron-owner.mjs` lease the STOP key is refused (`electron_owner_busy`, 11-14): the
music then kept playing while the levels were restored. Release the lease, press STOP, check
`APP_EXIT`, and only then restore the levels.
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

Edifier missing from Airfoil (11-14): if Airfoil lists only "Computer" (no A1 either), macOS
is refusing its Local Network access (after an upgrade; runbook "Edifier not listed"): the
owner presses Allow. Otherwise suspect the Mac's Wi-Fi link before the speaker. It can
stop receiving Bonjour group traffic after days while unicast works. Check
`/Library/Logs/MagicMirror/net-watch.log` (`state=blind`), `curl http://<ip>:7000/info`, and
`MUSIC_OUTPUT music_output_bonjour_group_blind` / `_airplay_proxied`; runbook "Edifier not
listed". Airfoil merges a second Bonjour record for a visible speaker, so the local-record
fallback cannot be exercised on a healthy network. Measure the second Edifier with block `F`.
The unified log keeps about two days, so a fault older than that has no onset evidence: the
watch log is the record. Airfoil's AirPlay offset slider is not 1:1; iterate and re-measure.

Room recordings (11-14): the Jabra microphone gates to about −72 dB while the Jabra's own
speaker plays, including the ~1 s key-result chime, so it cannot observe the Jabra and shows
false dropouts; mute "Computer" in Airfoil (`set (volume of s) to 0`, parentheses required) to
hear the other speakers, and use another microphone for the Jabra. A recorder must restart
when the app rebuilds its audio devices at start. Sound tests run at 1% unless the owner
allows more for that test, and levels are restored. Never run System Information or
`system_profiler` on this Mac: HDMI re-plug bursts began with them and the board then failed
to lock for 10 min ([record](../../../../docs/testing/video-loop-start-2026-11-14.md)).

Electron QA holds the operator lease, so venue Stream Deck presses fail with
`electron_owner_busy` meanwhile: tell the owner before a long batch. Acoustic wake
uses the Mac mini speaker as the synthetic visitor; at its normal 1% venue level a
miss is an environment limit, not a product failure.


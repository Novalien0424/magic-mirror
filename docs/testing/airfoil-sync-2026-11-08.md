# Airfoil holds the Jabra and A1 ~2 s behind the Edifier — 2026-11-08 (open)

> **Superseded: fixed and deployed 11-08.** The cause was the old duplex device's `mmlt` (2081 ms)
> applied at Core Audio driver load, not the Edifier; the `mmlt` exclusion and the options below are
> obsolete. See the [follow-up](airfoil-sync-2026-11-08-followup.md).

Research brief for the owner. Status at writing: **not fixed**; the venue runs the calibrated settings, so music
through Airfoil is out of sync whenever the Edifier plays. Step-by-step process, mistakes and state
changes: [debug log](airfoil-sync-2026-11-08-debug-log.md).

## Symptom

Since 11-08 (in sync on the 11-07 night re-tune), whenever the Edifier (AirPlay) is in Airfoil's
group, Airfoil plays its Mac-side outputs (the Jabra as "Computer", and A1 over Bluetooth) about
2 s after the Edifier. The owner hears it as an echo. Rogue Amoeba's model is that AirPlay needs
~2 s, Computer ~0 s and Bluetooth up to ~2 s, and "Airfoil will delay all playback to match the
highest delay required" ([KB](https://rogueamoeba.com/support/knowledgebase/?showArticle=AudioDelaysAndSync)).
Here Airfoil schedules for ~4.2 s while the Edifier plays at its normal ~2.2 s.

## Versions (11-08)

| Part | Version | Update available |
| --- | --- | --- |
| macOS | 27.0.1 (26A434) | **27.2** (`softwareupdate -l`; restart; not installed, owner decision) |
| Airfoil | 5.13.0 | none; 5.13.0 (2026-09-25) is the latest ([notes](https://rogueamoeba.com/support/releasenotes/?product=Airfoil+for+Mac); nothing on sync/latency since 5.10) |
| Edifier M330 Ⅱ | fw p20.55.0, build 55.0 of 2025-10-23, AirPlay SDK 2.0.10, AirTunes 366.0 | unknown: check in the Edifier Connect app (owner) |
| Jabra Speak2 75 | Jabra Direct 8.3.26701 installed | unknown: check in Jabra Direct (Jabra is ruled out below) |

## Measurements (app stopped)

Delay = chirp scheduled into Magic Mirror Music → heard. Mic: A1's call mic, or the USB Jabra's mic
for A1 (a Jabra mic never hears the Jabras). Readings with the Edifier connected, ≥2 min after connect:

| Condition | Jabra | A1 | Edifier |
| --- | --- | --- | --- |
| 11-07 night re-tune (reference) | Edifier + 8 ms | Edifier − 4 ms | 2.15 s |
| Before the reboot, Airfoil up since 11-07 20:07 | **9.85 s** | — | 2.16 s |
| After an Airfoil relaunch / after the Mac reboot | **4.20–4.25 s** | **4.10–4.13 s** | 2.15–2.25 s |
| A1 disconnected from Airfoil | 4.20 s | — | 2.15 s |
| Edifier's Bluetooth disconnected from its other source | 4.22 s | — | 2.17 s |
| Edifier not in Airfoil | 2.47 s (linked Jabra 2.52 s) | 2.61 s | — |
| Jabra direct (no Airfoil) | 0.16 s | — | — |

- Right after any AirPlay connect Airfoil holds the Mac-side outputs **13–15 s**, then drops to the
  steady value within ~2 min. It does the same while a connect is pending to a receiver that never
  answers (the offline Edifier, this Mac's own receiver), and falls back to ~2.5 s when it gives up.
- Re-tested since: Airfoil offset Computer 2.33 s (written with Airfoil quit) is **ignored** (the
  Jabra moved to 4.50 s = offset 0). Sliders allow Computer/Bluetooth +1 s delay and AirPlay ±1 s;
  the best combination still leaves the Jabra ~0.23 s late.

## Ruled out (each changed nothing)

Mac reboot; Airfoil relaunch; Edifier power cycle; A1 in or out of the group and its microphone;
Airfoil's local output switched from the Jabra to the Mac mini speaker (A1 still 4.10 s); `mmlt`
(Magic Mirror Music reported latency) set to 0 before an Airfoil relaunch; firewall (off);
clock sync (the Edifier's timing requests to Airfoil UDP 6003 are all answered, ~1/s); Bonjour
(restored, no change); the app (all tests with it stopped); Jabra/music device rates (48 kHz,
Jabra latency 50 + safety 50 frames).

## Side findings

- After the reboot the Edifier stopped answering Bonjour queries (cached name only) and took
  ~13 min after its power cycle to announce itself; a freshly launched Airfoil cannot list it then.
  It moved from 10.0.0.4 to 10.0.0.41 (Orbi DHCP). A temporary `dns-sd -P` proxy with its real TXT
  (`GET /info` with qualifier `txtAirPlay`) let Airfoil connect; same 2 s hold.
- The Edifier refuses unpaired RAOP sessions (`ANNOUNCE` → 403) and its unpaired `/info` has no
  `audioLatencies`, so its reported latency (the likely cause) cannot be read; Airfoil's own session
  is encrypted.
- macOS Sound settings can select the Edifier, but `audio-prefer` returns the default output to the
  Jabra within ~2 s by design (Raven's voice), and that macOS session also takes the Edifier from
  Airfoil: do not select it there.
- This Mac's Bluetooth connect to the Edifier times out while the Edifier is on its Wi-Fi input.

## Options (owner decision pending)

1. Edifier over Bluetooth from this Mac, like A1 (switch its input, pair): no AirPlay hold;
   6.5 min settle after each fresh connect, ±20 ms wander, range.
2. Jabra + A1 only until AirPlay is fixed (tune A1 to the Jabra and `mmlt` to ~2.5 s).
3. Ask Rogue Amoeba ([contact](https://rogueamoeba.com/support/contactUs.php)) why Airfoil 5.13
   schedules local outputs ~2 s after this AirPlay SDK 2.0.10 receiver, and whether its latency can
   be overridden; check Edifier firmware first. Unread lead: an old hidden Airfoil "Sync Adjustment"
   window opened by holding Option at launch ([Indigo forum](https://forums.indigodomo.com/viewtopic.php?f=5&t=10766), 403 to us).
4. macOS 27.2: unrelated to the start of the fault (no OS change between good and bad), may still
   be worth installing at a quiet time.

## App change (11-08)

Main reports `music_output_airplay_unreachable` (listed, not connecting) or
`music_output_airplay_not_found` (not listed) once after 30 s without an AirPlay speaker, and
`music_output_airplay_restored` when one plays. Unit-tested and built; not yet seen in production.

## How to measure

STOP; Jabra at 100%; `zsh deploy/macos/speaker-sync/measure-a1.sh <dir> "J E J E" 150` (A1 mic) or
`MM_SYNC_MIC='AppleUSBAudioEngine:Unknown Manufacturer:Jabra Speak2 75:9842AB51A9700254000:2'
zsh … "A E A E" 150`; `python3 -I deploy/macos/speaker-sync/scan.py <dir>/b1J <dir>/b1J.play.json b1J`
(0–30 s search); then `stop-state --reset-output` and delete the recordings (room sound).

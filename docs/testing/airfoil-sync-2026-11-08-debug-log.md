# Debug log — Airfoil sync fault, 2026-11-08

> **Superseded diagnosis.** The measurements below stand, but §4 items 5–7 and §6 are wrong: the
> [follow-up](airfoil-sync-2026-11-08-followup.md) proved the cause is `mmlt` itself (the old duplex
> device's 99888 frames = 2081 ms, applied when Core Audio loads the driver) and fixed it with a
> split playback/capture driver. The 16:53 `mmlt` test only relaunched Airfoil, and the 15:31 A1 test
> ran `measure-a1.sh`, which reconnects A1; neither excluded anything. See the last lesson in §7.

Full process behind the [research brief](airfoil-sync-2026-11-08.md): what was tried, in what order,
what each step showed, and the mistakes made. Times are Taipei (CST). "Delay" = time from a chirp
scheduled into the Magic Mirror Music device to the sound heard by a microphone. All tests ran with
Magic Mirror stopped, except where noted.

## 1. Situation

- **Route:** Every music source plays into the virtual device "Magic Mirror Music". Airfoil 5.13.0
  reads it and plays it on three outputs: the Jabra Speak2 75 ("Computer"; a second Jabra is linked
  to it), A1 (Bluetooth) and the Edifier M330 Ⅱ (AirPlay, Wi-Fi).
- **Good state (11-07 night re-tune):** the Jabra pair was +6..+15 ms from the Edifier, and A1 was
  −4 ms. The Edifier played about 2.15 s after the click.
- **Bad state (11-08):** the owner hears an echo between the Jabra and the Edifier. After the 15:15
  reboot, VIDEO LOOP played only on the Jabra.
- **Status at the end of the day:** not fixed. The venue is back on its calibrated settings and an
  owner decision is pending (see section 6).

## 2. Before the reboot (earlier session, 11-08 afternoon)

| Time | Step | Result |
| --- | --- | --- |
| ~14:00 | Measured through A1's mic, with the old analyzers widened | Jabra **9.85 s**, Edifier 2.16 s; the Jabra direct 0.16 s; the Jabra without the Edifier 2.46 s |
| 14:41 | Relaunched Airfoil | Jabra **4.21 s**, the same after 3 Edifier reconnects |
| 15:07 | Owner power-cycled the Edifier | no change |
| 15:11 | Set `mmlt` to 0 for one block, Airfoil still running | no change. This test was later judged invalid: Airfoil may read the latency only when it opens its source (redone properly at 16:53) |
| 15:15 | Owner rebooted the Mac mini | — |

Also checked before the reboot: the offsets, the source, `mmlt`, no stray microphone, ping to the
Edifier, and the device sample rates (48 kHz). bluetoothd had restarted on 11-07 at 20:37, after
Airfoil's launch. Airfoil had been up since 11-07 20:07.

## 3. After the reboot (this session)

### 3.1 Why only the Jabra played (15:16–15:20)

The owner pressed START at 15:16, STOP at 15:18:30 and LOOP at 15:18:38.

- **App log:** `music_output_airfoil_ready speakers=2 airplay=0 bluetooth=1`. The Edifier never
  reconnected before the next STOP. In the previous run it had joined 10 s after ready.
- **A1:** the reboot made it a fresh connect, so the app's 6.5 min Bluetooth hold ran from 15:16:22
  to 15:22:52. A1 was connected at Airfoil volume 0. This is by design.
- **Edifier:** it was off the network. Ping to its old address 10.0.0.4 failed, and Bonjour could not
  resolve it.
- **Conclusion:** the Edifier was rejoining the network, and A1 was silent by design.

### 3.2 First measurements

| Time | Step | Result | Conclusion |
| --- | --- | --- | --- |
| 15:20 | `measure-a1.sh "J E J E"`; the script asks Airfoil to connect the Edifier | J **12.92 s** (first read as 11.9 s at the 12 s edge of `scan.py`; widened the search to 30 s), E silent, then J **2.48 s** | a pending connect to an unreachable Edifier holds the Jabra ~10 s; when Airfoil gives up, it returns to ~2.5 s |
| 15:25 | `"J J J"`; the Edifier reconnected meanwhile (~15:26, new address 10.0.0.41) | J **4.22 s** | the same +2 s seen after the relaunch before the reboot |
| 15:29 | `"E J"` | E 2.155 s, J 4.20 s | gap 2.05 s, so the reboot did not fix it |
| 15:31 | Disconnected A1 from Airfoil, then `"J E J"` | J 4.20 s, E 2.15 s | A1 and its microphone play no part |

### 3.3 The offset attempt that lost the Edifier

| Time | Step | Result |
| --- | --- | --- |
| 15:36 | Quit Airfoil, wrote Computer offset 2.29 s, relaunched it | The relaunched Airfoil **no longer listed the Edifier**, so the test measured the Jabra alone (2.46 s). Invalid test |
| 15:40–15:58 | Investigated the Edifier | It answers ping at 10.0.0.41 (found via `lsof` on Airfoil's sockets; `arp` shows nothing here) and port 7000 is open. Its Bonjour name stays cached, but its SRV/TXT records never resolve |
| 15:43–15:58 | Asked the owner for a power cycle; waited 15 min | The owner was away |
| ~15:59 | `GET /info` on port 7000 | firmware 55.0, built 2025-10-23; AirPlay SDK 2.0.10; no `audioLatencies`. Not an overnight update |
| 16:00 | Restored Computer 0.246 (quit and relaunched Airfoil); reconnected A1 muted | — |

### 3.4 App change and the state without the Edifier

| Time | Step | Result |
| --- | --- | --- |
| 16:01 | Added `music_output_airplay_unreachable` / `_not_found` / `_restored` to `src/main/airfoil-route.ts`, with a test | 13/13 tests pass, typecheck passes, build done |
| 16:07 | No Edifier in Airfoil; measured the Jabra with A1's mic, and A1 with the Jabra's mic | Jabra 2.47 s (linked Jabra 2.52 s), A1 2.61 s |
| 16:11 | Restored the stopped state | — |

### 3.5 Owner back: power cycle, proxy, Bonjour

| Time | Step | Result | Conclusion |
| --- | --- | --- | --- |
| 16:24 | Owner power-cycled the Edifier | Not in Bonjour or Airfoil after 5 min. The owner sees it in macOS Sound settings | — |
| 16:31 | Scanned 10.0.0.0/24 for AirPlay (`GET /info`) | Edifier at 10.0.0.41. A Shelly switch's Bonjour reaches the Mac over Wi-Fi | the fault is the Edifier's Bonjour (or how the Orbi passes it), not the Mac's |
| 16:32 | `GET /info` with qualifier `txtAirPlay` | got its real AirPlay TXT record | — |
| 16:33 | Announced a temporary `dns-sd -P` proxy for `_raop` and `_airplay` pointing at 10.0.0.41 | Airfoil lists the Edifier under its normal ID | — |
| 16:33 | Measured through the proxy | J 4.25 s, E 2.16 s | reproduced; the proxy works as a test bed |
| 16:37 | Quit Airfoil, Computer **2.33 s**, relaunched | The real Edifier re-announced itself at 16:37:28, so the proxy was renamed "… (2)" and the test connected that copy. J 14.9 s, then **4.50 s** = what offset 0 gives | **offsets beyond 1 s are ignored** |
| 16:42 | Stopped the proxy, restored offsets, ran my own RAOP handshake | `ANNOUNCE` → **403** (pairing required) | the Edifier's reported latency cannot be read; Airfoil's session is encrypted |
| 16:44 | Relaunched Airfoil; it lists the real Edifier | J 14.7 s, then **4.25 s**; E 2.16 s | restoring Bonjour changes nothing |

### 3.6 Isolating the cause

| Time | Hypothesis | Test | Result | Verdict |
| --- | --- | --- | --- | --- |
| 16:49 | Is the hold specific to the Edifier? | Connect the TV board's AirPlay receiver instead | the receiver never connected (board in standby); J 2.48–2.51 s | inconclusive |
| 16:53 | The 2.08 s `mmlt` matches the gap | `mmlt` = 0, then relaunch Airfoil | J 14.69 s, then 4.25 s; E 2.17 s | ruled out; restored 99888 |
| 17:01 | Is only the Jabra held? | A1 against the Edifier through the Jabra's mic (A1 stays in normal music mode) | A1 **4.10 s**, E 2.24 s | every Mac-side output is held |
| 17:03 | Jabra device properties | CoreAudio dump | 48 kHz, latency 50, safety offset 50 frames | normal |
| 17:05 | Firewall blocks the Edifier's clock requests | `socketfilterfw` | firewall off | ruled out |
| 17:05 | Clock sync fails | `nettop` on Airfoil | UDP 6003 (timing) in = out, ~1 exchange/s; audio streams to the Edifier | clock sync works |
| 17:06 | The Jabra as Airfoil's local output | Local output switched to the Mac mini speaker (prefs, relaunch), then A1 vs Edifier | A1 4.10–4.13 s, E 2.25 s | Jabra ruled out; restored the Jabra |
| 17:13 | Other Edifier services or modes | port scan | only 7000 open | — |
| 17:14 | Any AirPlay receiver causes it | Connect this Mac's own AirPlay receiver | never connected: J 12.9 s while pending, then 2.48 s | inconclusive; confirms the pending-connect hold |
| 17:19 | Bluetooth route | IOBluetooth connect to the Edifier (paired, 6C:16:29:77:29:EC) | timeout | the Edifier won't take Bluetooth on its Wi-Fi input |
| 18:20–18:29 | (owner) Edifier selected in macOS Sound settings | `audio-prefer` log | output returned to the Jabra within ~2 s each time | by design, not the fault |
| 18:33 | The Edifier's Bluetooth link to another source | Owner disconnected it, then `"J E J E"` | J 4.22 s, E 2.17 s | ruled out (it was also connected while things were in sync) |
| 18:39 | Bluetooth route again | IOBluetooth connect | timeout | — |

### 3.7 Research and updates (18:40–18:48)

- macOS 27.2 is available (`softwareupdate -l`); not installed.
- Airfoil 5.13.0 is the latest. Its release notes since 5.10 say nothing about sync or latency.
- Rogue Amoeba's sync article documents only the ±1 s sliders: Computer and Bluetooth can only add
  delay, AirPlay can move ±1 s. It gives no fix for a larger gap and points to support.
- An Indigo forum thread describes a hidden Airfoil "Sync Adjustment" window, opened by holding
  Option at launch. The page returned 403, so it is unread.
- Edifier firmware updates go only through the Edifier Connect app. Jabra Direct 8.3 is installed.

## 4. What is known

1. With the Edifier on AirPlay, Airfoil plays the Jabra and A1 at ~4.1–4.25 s. The Edifier plays at
   its normal ~2.15–2.25 s.
2. The hold is ~13–15 s right after any AirPlay connect, or while a connect is pending, and settles
   within ~2 min.
3. Before the reboot it had grown to 9.85 s over a session of almost a day.
4. Without the Edifier, Airfoil is normal: the Jabra at 2.47 s, A1 at 2.61 s.
5. Ruled out: the Mac reboot, an Airfoil relaunch, the Edifier's power cycle, A1, the Jabra, `mmlt`,
   Bonjour, the firewall, clock sync, the Edifier's Bluetooth link, the app, and the sample rates.
6. The likely cause is the latency the Edifier reports to Airfoil in their paired, encrypted AirPlay
   session, or how Airfoil uses it. We cannot read or override it, and Airfoil ignores offsets
   beyond ±1 s.
7. Unexplained: why the 11-07 night was in sync with the same firmware and the same Airfoil. That
   reading tracked a 60 ms offset change correctly, so it was genuine.

## 5. Changes made today

| Change | Persists | State now |
| --- | --- | --- |
| `airfoil-route.ts`: reports a missing AirPlay speaker (+ unit test) | yes, after commit/deploy; built into `out/` | uncommitted, not yet seen live |
| `scan.py` 0–30 s; `measure-a1.sh` A1 blocks + `MM_SYNC_MIC`; `analyze.py` removed | repo | uncommitted |
| Skill `mm-ui-qa`, runbook, PROGRESS, TODO, brief, this log, project memory | repo / memory | uncommitted |
| Airfoil `syncOffsets` (2.29, 2.33 tests), local output (Mac mini), `mmlt` 0 | test only | all restored: Computer 0.246, A1 0, Edifier −0.108; Jabra; 99888 |
| `dns-sd -P` proxy | test only | stopped |
| Jabra at 100% for the measurements | test only | `stop-state --reset-output`: Jabra 80%, A1 65% |
| Recordings (room sound), Airfoil preferences backup (holds the license) | scratch | deleted |

## 6. Open decisions

1. Owner checks the Edifier firmware in the Edifier Connect app; if there's an update, re-measure.
2. Owner decides whether to install macOS 27.2 at a quiet time.
3. Route:
   - the Edifier over Bluetooth from this Mac, like A1 (switch its input, pair);
   - Jabra + A1 only (tune A1 to the Jabra, `mmlt` ~2.5 s);
   - Rogue Amoeba support (contact page in the brief; also ask about the hidden sync window).

## 7. Mistakes and lessons

- **Search window too narrow:** the first analyzer window (12 s) mis-read a 12.9 s hold as 11.9 s.
  `scan.py` now searches 0–30 s, and the narrow `analyze.py` is removed.
- **Invalid mid-session `mmlt` test:** setting `mmlt` while Airfoil runs proves nothing. Change it,
  then relaunch Airfoil.
- **Relaunching Airfoil with the owner away lost the Edifier** (no Bonjour) and wasted the offset
  test. Never relaunch Airfoil remotely. A `dns-sd -P` proxy with the real TXT can stand in, but stop
  it before the real device returns (name conflict → "(2)").
- **Measure after the connect phase:** wait ≥2 min after any Airfoil connect; the first ~2 min read
  13–15 s.
- **A1 vs the Jabra:** A1's 6.5 min hold after a reboot looks like "A1 not playing"; check
  `bluetooth-settle.json` and the `music_output_bluetooth_settling` marker first.
- **macOS Sound settings:** never select the Edifier there. `audio-prefer` reverts to the Jabra by
  design, and the macOS session steals the Edifier from Airfoil.
- **Finding the Edifier:** `arp` shows nothing in this environment. Find its address with
  `lsof -nP -i | grep Airfoil` or an AirPlay `GET /info` scan. `dns-sd` output needs a pty.
- **Airfoil preferences contain the license code:** filter `Code`/`Name` when reading them (one read
  printed it locally).
- **Safe deletes:** delete with `"${W:?}"/…`, never a bare variable path.
- **False exclusion (the main error):** `mmlt` was "ruled out" by a test that never reset the layer
  that caches it. Core Audio reads device latency at driver load; an Airfoil relaunch keeps it. The
  gap matched `mmlt` exactly (2.08 s) and was dismissed, and the cause was then pinned on the
  unreadable AirPlay session. Rule: restart the caching layer (`coreaudiod`) and run A/B/A before
  writing "ruled out"; test controllable variables before blaming opaque ones; check that the runner
  does not undo the condition under test.

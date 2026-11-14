# Sound system investigation — 2026-11-14

Owner request (11-14, after a Mac reboot that brought both Edifiers back): keep both Edifier
M330 II in Airfoil's synced group, explain why A1 is silent after every reboot, find why the
Edifiers disappear after a few days while their IPs still answer, and make the sound system
persistent. This file is the working record; it is evidence, not an instruction source.
Metadata only: no network names, hardware addresses or keys.

## Status

| Item | State |
| --- | --- |
| 1. Both Edifiers in Airfoil, in sync | Done: second Edifier calibrated (−0.130 s), measured 6–13 ms behind the first |
| 2. A1 silent after a reboot | Explained: designed 6.5 min sync hold; it joined by itself |
| 3. Edifiers disappear after days | Mechanism known; root trigger (router vs Mac) not yet caught. Fallback deployed, watch installed; neither proven in a fault |
| 4. Persistent system, records | Deployed 15:49; survives reboots (app build, Airfoil prefs, system daemon) |

## Setup observed 11-14 11:47–12:15 (after the reboot)

- Mac mini: macOS 27.0.1, Wi-Fi `en1` on the router's main network, 6 GHz channel 69 /
  160 MHz, 802.11be, WPA3 Personal, multi-link (two links, 5 GHz + 6 GHz) before the reboot.
  `en0` (wired) is the private link to the TV board (192.168.77.x), not the LAN.
- Router: NETGEAR Orbi RBE771, firmware V10.5.20.10 (`http://10.0.0.1/currentsetting.htm`).
- Speakers: `EDIFIER M330 Ⅱ 8D58` (10.0.0.41, calibrated) and `EDIFIER M330 Ⅱ 621E`
  (10.0.0.176), both firmware 55.0, AirPlay SDK 2.0.10, both answering `:7000/info`.
- Airfoil 5.13 lists and has connected Computer (Jabra), A1 and both Edifiers; source
  "Magic Mirror Capture". `dns-sd -B _raop._tcp` lists both Edifiers.

## 2. A1 silent after a reboot — explained

A reboot restarts Airfoil, so A1 is freshly connected. A fresh A1 starts ~130 ms late and
glides into sync over ~6 min (measured 11-07), so Main holds it at Airfoil volume 0 for 6.5 min
(`BLUETOOTH_SETTLE_MS`). The Jabra also sits out while its microphone is open (wake listener).
So for the first 6.5 min only the Edifiers play.

Evidence, this boot: `music_output_bluetooth_settling speakers=1 seconds=390` at 11:47:48,
`music_output_bluetooth_joined speakers=1` at 11:54:25; Airfoil then showed A1 at volume 1.
Nothing was changed. Not a fault; the only way to shorten it is to accept A1 out of sync for
those minutes (owner ruling 11-07 chose silence).

## 3. Edifiers disappear after days

### What is established

- 11-14 09:05 (Mac Wi-Fi link up 5 d 18 h): Airfoil listed neither Edifier
  (`music_output_airplay_not_found`). Both pinged, answered `:7000/info`, and answered a Bonjour
  question whose reply returns unicast (question sent from a non-5353 port). A 45 s listen on
  the Bonjour group heard nothing from any other device. So unicast worked both ways and the
  Mac's own group traffic went out, but **no group (multicast) traffic reached the Mac**.
  Airfoil finds AirPlay speakers only through Bonjour group replies.
- A Mac reboot (new Wi-Fi association) cured it at once: at ~12:00 a 30 s capture on `en1` saw
  group/broadcast traffic from 7 other hosts, the router and both Edifiers included.
- The speakers were never the fault: no power cycle or speaker change was involved.

### What the logs could and could not show

- The unified log reaches back only to 11-12 08:38; the fault began before that, so the moment
  it started is not recorded.
- `airportd` logged no group-key, deauth or link-change event in that window, only paired
  "roamed" events 10 min apart (11-12 10:32/10:42, 12:32/12:42, 18:32/18:42; 11-14 02:03/02:13,
  11:13/11:23). Their meaning is not established.
- The Wi-Fi quality counters (`rxDataMcast` vs `rxBeaconMbss`, every 5 s) differ on average by
  ~0 while broken and by ~+11 after the reboot, but they are too noisy to date the onset.
  `rxUndec` (undecryptable frames) read 0 in both states, so it does not separate the causes.

### Research (sources in the session report; anecdotes marked)

- No vendor has confirmed this exact fault for the Orbi, macOS or the Edifier.
- Same pattern elsewhere: unicast fine, group frames dead until re-association after a
  group-key renewal (Fire OS 8, hostapd/mt76 list, a confirmed Qualcomm ath11k firmware race).
- Orbi Wi-Fi 7 (RBE97x, forum anecdotes 2026): Bonjour group traffic dropped for clients on the
  main network's 5/6 GHz while a client on the 2.4 GHz IoT network still sees devices; a router
  reboot restores it; toggling IGMP proxying made no difference. A GL.iNet Wi-Fi 7 router shows
  a related cross-band multi-link fault acknowledged by its vendor's chipset partner.
- Airfoil has no add-by-address; discovery is Bonjour only.

### Candidate causes, ranked, and the test that separates them

1. Router stops delivering group frames to the Mac's 5/6 GHz multi-link association.
   Test in a fault: does another 6 GHz client (an iPhone) still see the speakers?
2. Group-key mismatch on the Mac's link after a key renewal. Test: only the Mac is blind and
   the onset falls on a fixed interval.
3. macOS Bonjour/local-network fault: unlikely (the raw listener heard nothing either).

Either way a new Wi-Fi association fixes it, and a wired LAN connection for the Mac avoids it.

## 1. Second Edifier (`621E`)

- It needs no setup: Main drives every AirPlay speaker whose name starts with EDIFIER, and at
  11:47:51 it connected both (`music_output_airfoil_speaker_reconnected speakers=2`), each at
  the Edifier level (0.499).
- Before: Airfoil's `syncOffsets` had an entry only for `8D58` (−0.108 s), so `621E` played
  at offset 0.
- `speaker-sync/measure-continuous.sh` now has block `F` for `621E` (`E` stays `8D58`), and its
  cleanup restores every Edifier.
- Measured 15:30–15:44, app stopped, Jabra microphone, `group` mode, settle 130 s, blocks
  `E F E F`, 12/12 chirps each, per-chirp medians, `621E` minus `8D58` within one capture:

  | `621E` offset | Block pair 1 | Block pair 2 |
  | --- | --- | --- |
  | 0 (as found) | +112.3 ms | +111.8 ms |
  | −0.112 s | +16.2 ms | +20.8 ms |
  | −0.130 s (kept) | +6.0 ms | +12.7 ms |

- Limits: `621E` is quieter at the Jabra microphone (score about a third of `8D58`'s) and its
  per-chirp spread is about ±5 ms; the slider did not act 1:1. The residual is inside the
  band the route already treats as in sync (Jabra pair vs Edifier +6..+15 ms on 11-07). Not
  heard by a person. Recorded in `ops/music-device/calibration.json` (`secondEdifier20261114`).
- Airfoil was quit to write each value; raw captures were on a RAM disk and are deleted;
  levels read back at the defaults (Jabra 80%, A1 65%).

## Fixes 11-14 (deployed 15:49)

1. **App fallback** (`src/main/airplay-bonjour.ts`, wired into `airfoil-route.ts`): when Airfoil
   lists no Edifier, Main asks for AirPlay speakers both ways (0.7 s when healthy, 4 s when
   not). Speakers that answer only by the direct path are announced to the Mac's own Bonjour
   service with their own unchanged records (`dns-sd -P`), so Airfoil lists and connects them.
   A start waits for them as it does for a normally listed Edifier. Announcements are withdrawn
   when a speaker stops answering twice, moves address, or the app stops; leftovers of a crashed
   run are ended at start. Markers: `music_output_bonjour_group_blind`,
   `music_output_airplay_proxied speakers=`, `music_output_airplay_proxy_withdrawn`,
   `music_output_bonjour_group_restored`.
   - Proven: unit tests (31 in the three music-output files), typecheck; live probe finds both
     Edifiers by both paths; Airfoil listed a locally announced test record within 1 s and
     dropped it within 1 s of withdrawal (12:12, test name not matched by Main).
   - Deployed: built with the app stopped; START 15:48:57 joined both Edifiers and settled the
     route in 2.2 s with no fallback marker (healthy network, as intended).
   - Not proven: Airfoil connecting and playing through such a record, and the whole path in
     a real or simulated fault. With the real record visible Airfoil merges a second record
     for the same speaker into it within seconds (three tries), so this cannot be shown on a
     healthy network. Also unknown: whether AirPlay 2 playback itself needs group traffic
     (its clock sync); 11-14 never got as far as a connection.
2. **LAN watch** (`deploy/macos/net-watch.swift`, `install-net-watch.sh`): a root LaunchDaemon,
   every 5 min, classifies the link `ok` / `blind` / `quiet` / `offline` and logs changes plus an
   hourly heartbeat to `/Library/Logs/MagicMirror/net-watch.log`. On `blind` it records how many
   Wi-Fi "roamed" events fell in the last 30 min, which dates the onset to ±5 min and tests the
   roam theory. With `--heal` (off by default) it re-joins Wi-Fi when `blind`, only while the
   app is not running, at most hourly; the result line (`heal=wifi_rejoined result=`) shows
   whether a re-join alone cures the fault.
   - Installed 15:27 with `--heal` (owner's choice): first line
     `state=ok group_hosts=2 unicast_hosts=2`.
   - `blind` and the heal path have not been exercised; whether a Wi-Fi re-join alone cures
     the fault is unknown until the log shows it.

## Open, in order

1. Prove the fallback in a simulated fault: a temporary firewall rule that drops incoming
   group traffic on Wi-Fi, then watch the app announce, connect and play the Edifiers, and
   measure one block. Needs admin and the owner's go-ahead (not asked yet); it also answers
   whether playback survives without group traffic.
2. Next real fault: read `/Library/Logs/MagicMirror/net-watch.log` for the onset, the roam
   count and the heal result; check whether another 6 GHz client sees the speakers. That
   separates router from Mac.
3. Durable prevention is a router or wiring matter: a wired LAN port for the Mac (its only
   wired port is the TV-board link, so it needs a second adapter), moving the Mac off the 6 GHz
   multi-link network, or a router firmware fix.

## Work log

- 11:53 clock-in; read-only checks above. Web research delegated; logs mined.
- ~12:00 baseline capture of healthy group traffic; probe prototype finds both Edifiers by
  both paths.
- 12:05–12:14 fallback and watch written and tested as above.
- 12:11 stopping the production app and installing the watch were refused by the session's
  permission system; asked the owner.
- 15:26 owner approved both (watch with self-heal). STOP; watch installed; build; three
  measurement runs with Airfoil quit between them; START 15:48:57 on the new build.

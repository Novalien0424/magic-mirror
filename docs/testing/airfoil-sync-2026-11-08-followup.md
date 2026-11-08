# Airfoil sync — follow-up investigation, 2026-11-08

Status: **the two-second fault is fixed and deployed on the venue Mac**. The old duplex
virtual device's persisted video-compensation latency shifted Airfoil's Mac-side outputs
after a fresh Core Audio/driver load. Separate playback and capture endpoints remove that
shift while retaining video compensation. Two fresh loads passed; final Jabra–Edifier
block differences are 1–5 ms, and settled A1–Edifier differences are 4–7 ms.

This continues the [earlier debug log](airfoil-sync-2026-11-08-debug-log.md), preserving
its observations while testing its exclusions independently. Times below are Taipei.

## Root cause in plain English

- **The old setup:** "Magic Mirror Music" was one virtual device with two sides. Music apps
  play into its output side, and Airfoil listened to its input side and sent that sound
  to every speaker.
- **The delay setting:** the output side tells apps "this sound comes out 2.081 s later"
  (`mmlt`). Videos hold their pictures back by that much, so they stay in step with the
  speakers. That number is correct and still needed.
- **What went wrong:** whenever macOS's audio system (`coreaudiod`) loaded the old device
  with 2.081 s saved, that delay also ended up in Airfoil's timing for the speakers attached
  to the Mac (Jabra and A1). They played at about 2.15 + 2.08 ≈ 4.2 s. The Edifier gets its
  sound over Wi-Fi and kept playing at 2.15 s. That two-second gap was the echo.
- **What is proven:** with 0 saved, a reload of the audio system removed exactly 2.081 s.
  With 2.081 s saved, the next reload brought it back. The test ran zero, then nonzero.
  Which component inside macOS or Airfoil adds the delay is not visible to us.
- **Why the first debug log missed it:** it changed the value and relaunched only Airfoil.
  The audio system reads the value when it loads the device, and relaunching Airfoil does
  not reload it, so the test showed "no effect". Why 11-07 was still in sync is not proven.
- **The fix:** two devices now share the same sound. "Magic Mirror Music" is output-only
  and keeps the 2.081 s for the pictures. "Magic Mirror Capture" is input-only, reports
  zero, and is the device Airfoil listens to, so the delay can no longer reach Airfoil.
  The driver lives in `/Library/Audio/Plug-Ins/HAL` and its saved value survives restarts.
- **Re-check:** at 21:00–21:07 the Jabra was 2–4 ms from the Edifier, five hours after the
  last cold load (19:59) with 2.081 s saved.

## A1 after START (fixed 22:25)

Plain words: A1 (Bluetooth) needs ~6 min to line up after Airfoil starts feeding it. That
restart happens not only when A1 connects but also whenever the **Jabra ("Computer") joins
Airfoil** while A1 stays connected. STOP released the Jabra, so every START made A1 play
~130 ms late (an echo) for ~6 minutes, although the 11-07 ruling assumed it stayed in sync.

Measured with the Jabra microphone, A1 settled first, app stopped (A1 − Edifier, per-block
medians, 12/12 chirps; minutes after the reconnect):

| Reconnected | 0 | 1.3 | 2.6 | 3.9 | 5.2 | 6.5 min |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Jabra + Edifier (old START), 21:22 | +134 | +104 | +74 | +44 | +14 | +10 ms |
| none (control), 21:30 | +10 | −11 | | | | |
| Edifier only, 21:36 | +8 | +6 | +9 | +9 | +3 | −12 ms |
| Jabra only, 21:45 | +115 | +107 | +51 | +23 | −4 | +2 ms |

Fix (`src/main/airfoil-route.ts`): STOP keeps Computer and Bluetooth speakers connected
and releases only AirPlay speakers. If Computer joins anyway (Airfoil relaunch, Jabra
replug), each connected Bluetooth speaker sits out 6.5 min at Airfoil volume 0, reported as
`music_output_bluetooth_resync_computer_joined`. Unit test fails on the old code, passes now.

Proof with the real route and `out/native/music-loop --shared-output` against live Airfoil
(the production START steps without Electron), from the new STOP state with A1 settled:
START sent no re-settle and Edifier joined 10 s later; A1 − Edifier was **−1, +21, +17,
−21 ms** at 0.1/1.4/2.7/4.0 min (A1's normal ±20 ms Bluetooth wander, no glide). The
helper's brief direct group before the flag did not disturb A1. Jabra − Edifier right after
an Edifier rejoin with Computer kept: +0.0 / +3.8 ms. A live Computer drop/rejoin produced
the re-settle marker. One uninstrumented 21:58 start saw A1 or Computer disconnected (not
identifiable; Airfoil logs nothing) and correctly held A1; the instrumented rerun saw none.
Not yet seen: a real Stream Deck START with the production app.

## Evidence

All measurements use generated irregular chirp trains and host-clock timestamps. Magic Mirror is stopped. Subsequent tests hold one physical microphone continuously across alternating speaker blocks. Audio is captured only on a temporary RAM disk; durable evidence contains numbers and settings, never room recordings. The established sync-probe levels are used (Jabra 100% during measurement); cleanup restores Jabra 80%, A1 65%, Edifier 50%.

| Test | Jabra delay | Edifier delay | Finding |
| --- | ---: | ---: | --- |
| Original procedure, 19:03–19:05 | 4.217 s settled; first block 14.661 s | 2.166–2.168 s | Reproduces the fault. Initial transient excluded. |
| A1 transmission explicitly off; continuous A1 microphone, 19:07–19:10 | 4.216 s | 2.160–2.161 s | A1's participation in the output group is not necessary. |
| Reconnect only Computer during the same recording, 19:08:49 | 4.216 s | 2.161 s | Local reconnect/order does not clear it. |
| Hidden local playback latency = 0; ordinary offsets unchanged, 19:13–19:15 | 2.475 s | 2.155–2.159 s | A possible compensation, not a root-cause fix. |
| `mmlt` = 0, Airfoil relaunched, default local latency; settled confirmation 19:22–19:24 | 4.213 s | 2.159 s | Changing the property and relaunching Airfoil is insufficient. Player metadata verifies zero. |
| Hidden local playback latency = 0.5, `mmlt` restored, 19:27–19:29 | 2.712 s (pattern estimate) | 2.159 s | Confirms independent control of Mac-side delay. |
| **Restart Core Audio and the virtual driver with persisted `mmlt` = 0**, Airfoil defaults, 19:32–19:35 | **2.134 s** | **2.156 s** | **The extra approximately 2.081 s disappears.** |
| Restore `mmlt` = 99888 live, without restarting Core Audio, 19:36–19:39 | 2.135 s | 2.158 s | The correct state survives restoring video compensation live. |
| **Restart Core Audio/driver again, now with 99888 persisted**, 19:42–19:45 | **4.214 s** | **2.159 s** | **The fault returns. The controlled difference is 2081 ms.** |
| Split driver, fresh load with 99888 persisted, original offsets, 19:56–19:58 | 2.133 / 2.136 s | 2.157 / 2.159 s | Extra delay removed while retaining video compensation; 12/12 chirps per block. |
| Split driver, **second cold load**, Computer 0.222, 20:01–20:04 | 2.159 / 2.161 s | 2.160 / 2.156 s | Jabra–Edifier block differences −0.8 / +5.1 ms; 12/12 chirps per block. |

Except where marked as pattern estimates, delays are per-chirp medians. Each continuous block contains 12 chirps. The late source-zero confirmation runs after the Edifier is established; the first attempted connection in that experiment did not complete and was retried once. An additional chirp attempt after that earlier capture's end is excluded.

This A/B/A control establishes the trigger: the old duplex device's output latency at
Core Audio/driver initialization. An Airfoil relaunch does not rebuild those processes.
The earlier `mmlt` exclusion did not cover that state. The exact internal division
between Core Audio and Airfoil's cached timing is an inference, not a claim from their source.

## Implemented correction

The pinned [BlackHole v0.7.1 source](https://github.com/ExistentialAudio/BlackHole/blob/e2b22aaaba4e507a097131704bf96dabc004d9cf/BlackHole/BlackHole.c)
already supports a second device sharing its ring buffer. The build now exposes:

- `Magic Mirror Music` / `MagicMirrorMusic_UID`: output only, 48 kHz, reports the existing
  99888 frames (2081 ms). Music producers and video compensation retain this endpoint.
- `Magic Mirror Capture` / `MagicMirrorMusic_2_UID`: input only, 48 kHz, zero latency in
  both scopes. Airfoil and the measurement scripts select this endpoint.

The input stream's owner is corrected to the capture device. Live HAL inspection after
installation verifies one stream in each intended direction, no stream in the opposite
direction, matching stream owners, and the expected latency values. The source change
and driver must be deployed together. The installer now requires both names to appear.
The original installed driver is retained locally under
`ops/music-device/rollback-2026-11-08/MagicMirrorMusic.driver`.

No hidden Airfoil latency override remains. Calibration at the start of validation was
Computer 0.246, A1 0, Edifier −0.108; video compensation is 99888 frames. After the first
split-driver pass, Computer was adjusted to 0.222 to correct its measured 24 ms early
arrival. The second cold load validates that setting. The Jabra block p10–p90 ranges
were 2156.8–2180.4 and 2158.2–2184.0 ms; Edifier's were 2146.2–2160.7 and
2154.4–2156.8 ms. These are acoustic measurements at the test microphone, not a
claim of sample-exact alignment at every position in the room.

A1 was then connected normally, with **Jabra's microphone** continuously open and
Jabra playback muted. After 410 seconds of settling, alternating A1/Edifier blocks
at 20:11–20:14 gave:

| Block | Median | p10–p90 | Chirps |
| --- | ---: | ---: | ---: |
| A1 first | 2233.4 ms | 2231.7–2250.1 ms | 12/12 |
| Edifier first | 2240.6 ms | 2239.9–2241.9 ms | 12/12 |
| A1 second | 2237.6 ms | 2229.8–2255.0 ms | 12/12 |
| Edifier second | 2241.3 ms | 2240.2–2242.3 ms | 12/12 |

A1 is 7.2 and 3.7 ms early in those paired blocks; no offset adjustment is needed.
The absolute readings differ between microphone paths, so compare speakers within
the same capture, using Edifier as the common reference. A1's normal Bluetooth spread
remains; its existing 6.5-minute hold is retained.

## Checks

- `zsh deploy/macos/music-device/build.sh`: exit 0 after the correction below;
  installed driver passes `codesign --verify`.
- `npm run typecheck`: exit 0 (Node and renderer).
- `npx vitest run tests/unit/airfoil-route.test.ts`: 13/13 pass after the mock correction.
- `npm run build`: exit 0; deployed `out/main/index.js` selects `Magic Mirror Capture`.
  Existing Swift deprecation, JSON import-attribute and large-bundle warnings remain.
- Shell syntax, Python compilation and Node syntax checks: exit 0.
- Both completed split-driver acoustic runs: exit 0, 48/48 chirps each, normal levels
  restored and raw capture removed. Invocation:

  ```sh
  node scripts/electron-owner.mjs airfoil-sync-investigation \
    zsh deploy/macos/speaker-sync/measure-continuous.sh \
    /Volumes/MMSyncRAM/<fresh-run> no-a1 C2-60-12-F8-D1-A5:input 130 'J E J E'
  ```

  The second run first quit Airfoil, changed only Computer's offset, restarted
  `coreaudiod`, verified a new Core Audio/driver process and persisted 99888 frames,
  then reopened Airfoil. The RAM disk is created separately; the runner refuses a
  capture path outside a mounted `ram://` image.
- A1 validation used the same runner with `group`, Jabra input UID,
  `410 'A E A E'`: exit 0, 48/48 chirps, cleanup passed.
- Real `createAirfoilRoute`, isolated from the rest of Main: exit 0, selected Capture,
  reported `music_output_airfoil_ready speakers=3 airplay=1 bluetooth=1`, and raised
  the production route flag. Built `out/native/music-loop --shared-output` created the
  public music route with `outputs=1 airfoil=1`. Closing it removed the aggregate;
  route STOP removed the flag, disconnected Computer/Edifier and kept A1 connected (before the A1 fix).
- Recorder cancellation through Electron, using a silent fake recorder: exit 0;
  SIGTERM released the owned child and Electron process and removed ownership metadata.

## Delivery and limits

Installed/staged driver binaries match; ad hoc signature verification passes. The
matching application build is deployed in `out/`. Final Airfoil source is Capture,
offsets are **Computer 0.222, A1 0, Edifier −0.108**, and `mmlt` remains **99888**.
The machine-local calibration record includes these measurements and the prior record
is retained beside the driver rollback. The app remains stopped. Normal levels are
restored (Jabra 80%, A1 65%, Edifier 50%; Mac mini 1%). Since the A1 fix (22:25) STOP
keeps Computer and A1 connected and releases only the Edifier; the venue is left so.
All test processes and the Electron lease are released. The RAM disk was ejected;
no room recording is retained. Final syntax/whitespace checks pass. Source changes
remain uncommitted, preserving the pre-existing work in this checkout.

This verifies Core Audio/driver cold loads, actual pairwise sound timing, and the
production route/helper. It is not an overnight or full-macOS-reboot endurance test.
The TV's earlier 67 ms picture measurement was not repeated; its compensation remains
unchanged because the audio path returned to its original approximately 2.15 s delay.
Secondary correlation peaks remain visible (roughly +70 ms for Jabra, +51 ms for
Edifier). They were not independently attributed to a physical linked unit, reflection
or microphone processing; the dominant arrival is used consistently. This does not
independently certify the timing between the two linked Jabra units.

## Other hypotheses checked

- **Network clock:** timing-only UDP capture showed receiver-to-Mac timestamps within roughly 4–6 ms and prompt replies. This is stronger than counting packets, and does not explain a two-second difference. No audio payload or pairing data was captured.
- **AirPlay timing:** observed unencrypted synchronization headers; no attempt to extract pairing credentials or decrypt audio.
- **Device properties:** Jabra output 48 kHz, latency/safety 50/50 frames; music input latency 0, output 99888 frames, 48 kHz. The alternate zero-latency runs verify output 0 both through the setter and player metadata. A1's microphone switches its device to 8 kHz HFP, so A1 playback must be measured with the Jabra microphone instead.
- **Hidden Airfoil control:** Rogue Amoeba documents [Local playback latency](https://rogueamoeba.com/support/knowledgebase?product=Airfoil%20for%20Mac&showArticle=Misc-DebuggingWindow), separately from the normal sync sliders. Read-only inspection of the installed 5.13 binary corroborates the `localSpeakerLatency` preference and its use for Mac-side outputs when a remote output is present. These experimental overrides were removed before the Core Audio tests.
- **Normal sliders:** [Rogue Amoeba's sync guidance](https://rogueamoeba.com/support/knowledgebase?showArticle=Airfoil-AudioLatency) is about constant corrections. A compensating calibration alone would not establish why the previously correct route acquired the extra delay.

## Measurement corrections

- `measure-a1.sh` reconnects A1 at startup. Disconnecting A1 and then invoking it is not a valid A1-output exclusion. The new continuous runner selects `group` or `no-a1` explicitly and waits for Edifier readiness before starting the settle interval.
- Continuous capture avoids repeatedly opening/closing the Bluetooth call path between blocks.
- The old max-pool constructed one full recording copy per tolerance sample. At 32 kHz this could require tens of GB. The replacement is linear in recording length; 40 randomized/boundary comparisons pass. Existing baseline score/delay are unchanged.
- The scanner now reports per-chirp median/p10/p90 after locating the broad 0–30 s pattern. Its pooled maximum has a ±6 ms plateau and should not be treated as an exact calibration value. Five synthetic 12-chirp fixtures at 137, 2156, 4216, 14700 and 29100 ms are recovered within 0.2 ms.
- The recorder previously reported input latency from the default device even with `--device` set to A1. It now reports the selected device. Correlation timing did not use that diagnostic field, so this metadata bug did not cause the measured gap.
- The Electron recorder wrapper publishes an owned child PID for cancellation and releases that child when terminated. The continuous runner requires the Electron lease and a RAM disk, deletes raw capture during cleanup, and checks the restored speaker levels.

## Failures and exclusions retained

- The initial scratch cleanup had an AppleScript `set volume` syntax error. Native output reset succeeded; the Airfoil volume expression was corrected and restoration completed before continuing.
- An initial timing capture selected `en0`; the route is on `en1`. It captured no relevant packets and was stopped. The corrected capture contains only timing/synchronization headers.
- `AudioDeviceGetCurrentTime` did not produce usable clock samples for the unregistered probe client. Nominal/actual rate properties alone are not a clock-drift proof.
- The first split-driver build failed because the patch used `inDeviceObjectID` where
  the function parameter is `inObjectID`. Corrected and rebuilt successfully; seven
  upstream format-extra-args warnings remain.
- A focused route test failed because a finite two-failure mock could recover before
  its negative assertion. It now holds failures until the assertion, then enables
  recovery. The focused file passes all 13 tests after that correction.
- The first post-install capture left no valid recording metadata and no surviving
  recorder. Its output was unavailable after the tool-session transition, so it is
  excluded rather than assigned a latency. The isolated retry is logged separately.
- No OS or firmware update, Bluetooth re-pairing, license access, support message, or production Electron launch has been used for these tests.

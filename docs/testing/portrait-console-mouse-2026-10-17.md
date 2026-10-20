# Portrait Console mouse — 2026-10-17

## Result and scope

The owner confirmed **one working pointer, correct direction and working Console
clicks** after the installed solution was left connected. The USB receiver remains
inside the TV as required. Current runtime at 17:24 Taipei: Magic Mirror PID 8488
still running, Console on the portrait display, TV Awake/display ON, forwarded
mouse present in macOS and zero Xiaomi input interfaces remaining in Android.
The application was not reloaded or restarted; unsaved Console edits were preserved.

The original problem was ownership: Android received the physical mouse, while
the Console was on the Mac HDMI image. Android's mouse was not orientation-aware.
Changing a Mac mouse preference could not rotate that Android input or make it
click the Mac Console. The temporary probe was disconnected during installation;
the owner's two-pointer/wrong-direction report belongs to that interval. The later
explicit physical pass above supersedes it.

## Installed design

- Android 11 ZC-3568D / Rockchip RK3568 board: existing
  `su 0` runs official native ARM64 VirtualHere server **4.8.8**. No rooting,
  SELinux change, firmware change or Android APK is part of this installation.
- macOS: signed/notarized normal GUI client **6.0.3**, vendor Team ID
  `N8C8ZTN347`. No paid client service, kernel extension or reduced security.
- Exactly the Xiaomi Wireless Mouse Lite 3 (`2717:50d1`) is shared. mDNS is off.
  The direct IPv4 listener on TCP 7575 has a scoped INPUT reject rule for all
  sources except Mac `192.168.77.1`. ADB stays on its existing localhost port 5038.
- CONSOLE ensures the server, exact dedicated GUI client and receiver ownership
  after Console/HDMI readiness. STOP attempts mouse cleanup even after app/TV
  failure. START/PLAY LOOP do not change mouse ownership. No persistent polling,
  pointer remapping, event recording, or additional Electron restart owner.
- A short native CoreGraphics helper moves the pointer to the sole portrait
  display only if it is currently outside it. It then exits.
- Accepted display pairing remains macOS T749 90° at `(1920,0,1080,1920)` and
  Android `accelerometer_rotation=0`, `user_rotation=2`. Virtual main stays main.

Setup and operational instructions are in [stream-deck.md](../../deploy/macos/stream-deck.md#tv-connected-mouse-and-remote-desktop).

## Fresh verification

| Check | Evidence / result |
| --- | --- |
| Official artifacts | Installer completed on actual Mac/board; SHA-256 pins and Mac signature/notarization passed. |
| Native ownership | VirtualHere confirmed exact receiver in use by this client; macOS IOHID has VID 10007/PID 20689, mouse usage 2; Android Xiaomi input count 0. Rechecked 17:24. |
| Already connected start | `mouse_started`, 278 ms. |
| Real mouse-only stop | `mouse_stopped`, 5,644 ms; dedicated client exited and board cleanup succeeded. |
| Fresh GUI-client reconnect | `mouse_started`, 2,964 ms, using the shipped `/usr/bin/open -gj -a` route. |
| Installed CONSOLE app | At 17:19:14, real installed app wrapper logged `mouse_started`, then `console_shown mouse=mouse_started`. |
| Physical direction/click | Owner explicitly confirmed one pointer, correct movement and Console clicks. |
| Focused regressions | 114 tests in 3 files passed at 17:18:50. Covers exact device/client ownership, bounded failures, shared single startup retry, delayed exit, cleanup and existing button/TV behavior. |
| Static checks | Three Node syntax checks, zsh/sh syntax checks and native Swift compilation passed. |

Commands used:

```sh
node --check scripts/mirror-mouse-control.mjs
node --check scripts/mirror-tv-control.mjs
node --check scripts/raven-button.mjs
zsh -n deploy/macos/install-mirror-mouse.sh
sh -n deploy/macos/board-mouse-control.sh
node node_modules/vitest/vitest.mjs run tests/unit/mirror-mouse-control.test.ts tests/unit/mirror-tv-control.test.ts tests/unit/raven-button.test.ts
```

Swift was compiled by the actual installer. No normal Electron/QA overlap,
provider dialogue, full suite or app rebuild was needed for these deployment scripts.
The combined global STOP was not rerun while the owner was editing; mouse-only
stop/reconnect has real evidence, combined cleanup ordering has focused coverage.
Physical USB reconnect, cold Mac login and board cold boot remain untested.
CONSOLE is the recovery action after the board/network becomes available again.

## Integration failures retained

1. Initial server log target `/proc/self/fd/2` failed with
   `ERROR, Cannot write to log file /proc/self/fd/2, error 6 (No such device or address)`.
   A bounded metadata logfile resolved it.
2. Initial installer process matching included worker prompt arguments and
   falsely returned `MOUSE_INSTALL_CLIENT_RUNNING`. Matching executable metadata
   before reading only the matching client's argv resolved it.
3. First normal GUI launch waited behind a hidden macOS Local Network prompt.
   The ordinary Allow button for VirtualHereUniversal was activated once. No TCC
   database edit or permission automation is shipped.
4. ADB TCP forwarding could list devices but USB USE timed out with
   `FAILED: API Timeout 3 sec`, including after permission was granted. That route,
   temporary forward, firewall exceptions and fixtures were removed. The direct
   wired TCP route passed.
5. The actual 6.0.3 API returns successful replies on stderr, uses
   `/tmp/vhclient_ipc/socket`, and reports ownership as `(In-use by you)`.
   Treating stdout alone as the response produced `mouse_readiness_timeout` while
   already connected. The parser now handles the actual response in RAM only.
6. Twenty 100 ms exit polls were too short: the first real stop returned
   `mouse_client_exit_unverified` / `mouse_stop_failed` at about 5,148 ms, although
   the GUI subsequently exited. Exit verification now uses the existing seven
   second client deadline, reserving three seconds for remote cleanup. The next
   real stop and cold reconnect passed with the timings above.
7. A stale test assertion still limited exit polls to twenty (18 passed/1 failed).
   It was removed while retaining bounded elapsed-time and cleanup checks; the
   final three-file run passed all 114 tests.

## Remote desktop compatibility

Chrome Remote Desktop host **155.0.8059** is installed and running. Its host/service
and agent broker remained running alongside the forwarded USB mouse; the system
broker is enabled and running. No remote host configuration, credentials,
permissions or display layout were changed. The mouse scripts do not intercept
remote events or remap global axes. Opening the installed CONSOLE app works through
the same route from a remote desktop as from the Neo.

An owner remote movement/click check has been requested separately. It is pending;
host liveness and code compatibility alone are not end-to-end remote acceptance.

Read-only research on Chromium main revision `5f27b2840e2d` (checked October 17):
the [coordinate converter](https://chromium.googlesource.com/chromium/src/+/5f27b2840e2dacd302826efbcc9cbe1960c8dbc2/remoting/protocol/coordinate_converter.cc)
maps a remote pointer into the selected display's bounds and adds its desktop
origin. [Mac display geometry](https://chromium.googlesource.com/chromium/src/+/5f27b2840e2dacd302826efbcc9cbe1960c8dbc2/remoting/host/desktop_display_info_loader_mac.mm)
comes from NSScreen logical coordinates. The
[Mac injector](https://chromium.googlesource.com/chromium/src/+/5f27b2840e2dacd302826efbcc9cbe1960c8dbc2/remoting/host/input_injector_mac.cc)
uses normal macOS input APIs and preserves hardware input. There is no extra
rotation transform to add to our mouse scripts. **Inference:** ordinary forwarded
USB HID should coexist without altering the remote coordinate mapping; no extra
code change is justified by this research.

The current Chromium [local-input priority filter](https://chromium.googlesource.com/chromium/src/+/5f27b2840e2dacd302826efbcc9cbe1960c8dbc2/remoting/host/remote_input_filter.cc)
blocks remote input for 2,000 ms after local activity. Leave the physical mouse
still for a few seconds before a remote check. CONSOLE can also cause one pointer
jump when its helper places the cursor on the portrait display. Neither is an
axis-mapping failure. This source review is not a binary-level verification of
the installed host or a vendor guarantee for VirtualHere.

Remaining acceptance: select T749/all displays remotely; check movement, tab
click alignment, drag/scroll and keyboard input; move the physical mouse, leave
it still, and verify remote control resumes. Repeat after a remote reconnect.
No remote session was opened by automation, no new remote access was provisioned,
and no remote desktop credentials or host configuration contents were read.

## Primary sources

- [VirtualHere server](https://www.virtualhere.com/usb_server_software) and
  [OEM FAQ](https://www.virtualhere.com/oem_faq): native server and one-device use.
- [Mac client](https://www.virtualhere.com/usb_client_software),
  [client API](https://www.virtualhere.com/client_api) and
  [client configuration](https://www.virtualhere.com/client_configuration_faq).
- [Server configuration](https://www.virtualhere.com/configuration_faq): device
  allowlist and discovery controls.
- [Android boot-mouse limitation](https://www.virtualhere.com/node/3827): explains
  why the normal Android USB framework route was unsuitable; our native route was
  tested on the actual board.
- [macOS display rotation](https://support.apple.com/guide/mac-help/rotate-the-image-on-your-display-mh11534/mac)
  and [Android input capabilities](https://source.android.com/docs/core/interaction/input/getevent).

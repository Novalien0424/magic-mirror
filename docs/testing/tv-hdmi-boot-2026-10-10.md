# TV boot-to-HDMI investigation — 2026-10-10

## Current outcome

The user selected AnyLauncher to replace Quickstep as the TV's default HOME,
forward HOME to the Rockchip HDMI viewer, and keep Quickstep as an escape.
**Installation is pending:** the first install attempt returned `device offline`
before transfer; a subsequent 60-second ADB wait did not recover. No TV startup
properties, HOME selection, firmware or application data were changed.

Official AnyLauncher **1.13**, versionCode **14**, was downloaded and inspected:

- [Author's project](https://github.com/tumuyan/AnyLauncher).
- [Pinned APK release](https://github.com/tumuyan/AnyLauncher/releases/tag/1.13),
  published 2024-02-27; latest release returned by the author's API today.
- Package `com.tumuyan.fixedplay`; HOME `.MainActivity`; configuration
  `.SettingActivity`. APK size 850,016 bytes, SHA256
  `1a38b894bf77f326b6c99aca714358c8f3afe7571cac0fc927ca458cc2755759`.
- Local download: `.artifacts/tv-hdmi-2026-10-10/AnyLauncher-1.13.apk`
  (ignored artifact; hash matches the original `/tmp/mm-tv-survey` download).
- Declared permissions: Internet and external-storage write. No optional
  permission was granted; the APK is not installed.
- Source supports selecting an app, bringing it forward, and a secondary
  launcher through rapid repeated HOME presses. Actual remote usability must
  be tested on this board; source inspection is not runtime acceptance.

The Mac watchdog was restored at 19:48, then unloaded again at **19:56** for
the user's reboot/network capture. Raven remains stopped/unloaded. Do not
launch it for TV setup. The watchdog changes in commit `b98102e` remain deployed.

## Verified board and startup behavior

ZC-3568D, RK3568, Android 11, firmware build dated 2024-09-03.
Wi-Fi MAC `74:24:ca:f1:db:d9`, IPv4 `10.0.0.4`, ADB TCP port 5555.
The Mac uses ADB server port **5038**, with mDNS disabled. Current stock HOME is
`com.android.launcher3/.uioverrides.QuickstepLauncher`; HDMI input is
`com.android.rockchip.camera2/.RockchipCamera2`.

The installed vendor APKs were read successfully after connection returned at
19:32. DEX inspection of `witsappservices.apk` established native boot hooks:

- `WitsBootReceiver.onReceive(BOOT_COMPLETED)` calls `bootLauncherApp()` and
  `autoOpenApp()` once during boot.
- The former reads `persist.sys.zcBootAutoEnable` and
  `persist.sys.zcBootAutoPackage`; the latter reads
  `persist.zc.enableAutoOpenApp` and `persist.zc.autoOpenAppName`. Both resolve
  the configured package's launch intent and start it. All four were unset.
- Separate `TouchTask` logic reads `persist.sys.zcGuardEnable` and
  `persist.sys.zcHdmiin` for repeated foreground recovery. Those were unset and
  were not enabled; they could interfere with deliberate Settings use.
- No corresponding boot-app controls were identified in Settings.apk's
  preference resources. The user subsequently chose AnyLauncher, so these
  native properties remain untouched rather than adding a second launch path.

## Reboot and network evidence

The assistant issued **no TV reboot command** during this investigation.
Device boot history recorded reboots at **19:31:22** and **19:34:01** Taipei
time. At 19:38, boot_count was 45. Previous-boot kernel evidence says
`init: Received sys.powerctl='reboot,shell' from pid: 7214 (reboot)`.
This establishes a requested reboot, not who requested it.

Settings.apk's `ZcAdbEnablePreferenceController` explains the observed prompt:
changing **Connect to the computer** opens **Reboot in effect**; accepting OK
writes `persist.sys.adb_enable` then runs `Runtime.exec("reboot")`. Reading or
refreshing the checkbox does not take that path. This is consistent with the
recorded reboot, but the exact 19:34 caller/confirmation is not proven.

After recovery, ordinary and root ping both passed, TCP 5555 accepted, and ADB
worked. Five samples from 19:39:22 through 19:40:43 passed TCP and ADB, with
boot_count remaining 45. Power was Awake/ON; screen_off_timeout was 2147483647
and wifi_sleep_policy was 2. The operator also reported the screen remained on.

At about 19:42, access failed again before AnyLauncher installation. Unlike
the earlier event, another reboot has **not** been established for this loss.
Targeted metadata-only packet inspection showed outgoing ICMP requests and
TCP SYNs without replies. A fresh ARP exchange returned the TV's expected MAC.
The Mac's gateway continued answering ping. IPv6 neighbor discovery also found
the same TV MAC, but a TCP 5555 probe on its link-local address timed out.

The same IPv4 TCP failure occurred from a one-shot root launchd service. macOS
packet filter and application firewall were disabled; no system extensions
were listed. A temporary TV-only route through the gateway also failed and was
removed immediately. The one-shot probe service exited and is no longer
loaded. These checks narrow the problem but **do not establish whether the
remaining fault is the TV or the intervening network**. An ARP reply alone does
not prove ADB or the whole OS is responsive.

The operator subsequently reported no action at the latest dropout, that the
screen remained in Android, and that both Wi-Fi reconnection and a normal
reboot with Connect to the computer enabled failed to restore access. The
operator then chose to toggle that setting off/on. These are operator reports;
ADB has not returned to verify the new boot count or settings.

A bounded reconnection watcher started at **19:59:12**, with the Mac watchdog
unloaded. At **19:59:54–20:00:05**, a header-only capture observed outgoing mDNS
traffic from `10.0.0.4` and 480 ARP requests from that address across the local
subnet. A follow-up capture at **20:01:25–20:01:47** showed the Mac's unicast
TCP/ICMP requests addressed to the expected board MAC, without replies; all
three ping requests timed out. This establishes some outgoing network activity,
not healthy unicast connectivity or a specific culprit. The scoped vendor APK
inspection did not identify a subnet-scanning implementation.

The existing Mac watchdog log already contains TV connection failures on
**2026-10-09**, including 01:52:32 and 19:40:11. HDMI display/audio use the
cable, whereas ADB control uses the LAN. Successful Raven display over days
therefore does not establish continuous ADB connectivity.

The gateway's HTTP page at `10.0.0.1` identifies **NETGEAR Router RBE771**.
Installed router firmware, the TV's current Wi-Fi network, and peer-isolation
settings have not been verified; no router settings were changed. The Mac USB
device tree showed no Android/ADB device, so there is no connected USB fallback.

Local metadata-only captures: `.artifacts/tv-hdmi-2026-10-10/reboot-watch.txt`,
`network-headers-200034.txt`, and `network-ether-headers.txt`. A prepared watcher
captures boot history, selected vendor properties, interface/routes, power state,
configuration-file metadata and filtered system/network logs when ADB returns.
No new TV logs were obtainable during the outage.

The watcher ended at **20:14:17** without an ADB recovery. A fresh neighbor
check at **20:06:37** had received an ARP reply for `10.0.0.4` from the expected
board MAC after clearing only that target's Mac ARP entry; TCP still timed out.
The operator later reported ping **request timeout while the TV is on**, versus
**destination unreachable while off**. This is consistent with neighbor
resolution working while on and failing while off; the sender/error details
of the operator's unreachable response were not captured. It does not identify
whether the unicast failure is in the TV, access point or return path.
Metadata capture: `.artifacts/tv-hdmi-2026-10-10/fresh-neighbor-check.txt`.

[Apple documents root/daemon local-network exemptions](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy).
[Android distinguishes ADB offline from device power state](https://developer.android.com/tools/adb).
Do not report a failed probe as proof that the TV is powered off.

## Vendor root-cause candidates: code verified, incident unproven

Read-only DEX inspection of the TV's actual `witsappservices.apk` found these
conditional paths. None has yet been tied to the observed outage; do not change
their properties speculatively.

- `NetUtils.checkWifiethCoExist` acts when `persist.sys.wifiEth4g=70` and
  `sys.zc.wifiEthflag=0`. With `persist.sys.ethernet_enable=true` (its default),
  the first timer tick disconnects `eth0`; the third reconnects it and sets
  `sys.zc.wifiEthflag=1`. This is an Ethernet bounce, not proof of Wi-Fi failure.
- `persist.zc.ethWorkEnable=1` (default 0) enables periodic gateway probes.
  `persist.zc.ethWorkDetect` defaults to `192.168.1.1`; failed probes disconnect
  Ethernet, wait 500 ms and reconnect. `persist.zc.ethWorkTime` defaults to
  15 seconds with a 10-second minimum. Capture actual values before attributing
  this behavior to the incident.
- `NetUtils.getWifiMac` disables Wi-Fi when `persist.sys.zcgetwifimac=1`;
  the default value 2 does not enable this path. `NetworkReceiver` also handles
  `zc.intent.action.wifiEnable`, whose missing boolean extra defaults to false.
- Each one-second `TouchTask` tick can call
  `ChangeProperties.setZckjProperties`. A new/changed `ZckjProperties.prop`
  on shared storage or mounted SD can apply vendor settings and request a
  reboot. The cached file is `/cache/recovery/last_ZckjProperties.prop`;
  `persist.zc.hasProperties` participates in cache reapplication. The helper
  sends `android.intent.action.REBOOT`, so this code alone does not identify
  the caller of the earlier `reboot,shell` event. Inspect only file presence,
  size, timestamp and hash: configuration contents may include credentials.
  Separately, `SystemReceiver` accepts `com.zc.zcCmd` and passes a supplied
  command to `su`/`yls`; no internal scheduled sender of literal `reboot` was
  found in this APK. This is a possible command path, not attribution evidence.

On recovery, prioritize boot count/reason, these property values, `wlan0`/`eth0`
addresses and policy routes, and filtered Wi-Fi/kernel logs before launcher
changes. [AOSP describes Wi-Fi driver/firmware diagnostic buffers](https://source.android.com/docs/core/connect/wifi-debug);
availability on this vendor firmware still requires a live check.

## Resume and acceptance

1. Recover stable ADB access and capture the reboot/network evidence. The
   operator now also reports failed ping. Check whether the TV itself can use
   the Internet to distinguish general connectivity from peer access failure.
   Accepting the Connect to the computer dialog reboots the board.
2. Pause the Mac HDMI watchdog, install the pinned APK, select the HDMI viewer
   using AnyLauncher's app-forward mode, and configure Quickstep as secondary.
3. Set `com.tumuyan.fixedplay/.MainActivity` as HOME. Verify HOME opens HDMI,
   rapid HOME presses reach the fallback, and Settings remains usable.
4. Reboot the TV with the Mac watchdog unloaded. Verify boot count increases,
   AnyLauncher remains HOME, and HDMI is foreground without a Mac launch call.
5. Test standby/wake and Settings escape. ADB-injected power keys do not prove
   the physical remote's behavior. Leave Raven stopped.
6. After passing independent boot, disable the Mac HDMI watchdog persistently
   so it does not compete with Quickstep escape. Keep a documented rollback to
   Quickstep and the existing watchdog.

No screenshots, raw conversations, audio or credentials are retained. Project
invariants 9/10 and the stopped-runtime boundary were preserved. No phase or
physical-remote acceptance claim is made.

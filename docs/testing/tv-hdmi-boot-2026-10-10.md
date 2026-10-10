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
- Local download: `/tmp/mm-tv-survey/AnyLauncher-1.13.apk`.
- Declared permissions: Internet and external-storage write. No optional
  permission was granted; the APK is not installed.
- Source supports selecting an app, bringing it forward, and a secondary
  launcher through rapid repeated HOME presses. Actual remote usability must
  be tested on this board; source inspection is not runtime acceptance.

The Mac watchdog was paused during investigation and restored at the end
(root LaunchDaemon PID 93141). Raven remains stopped/unloaded. Do not launch it
for TV setup. The watchdog changes in commit `b98102e` remain deployed.

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

[Apple documents root/daemon local-network exemptions](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy).
[Android distinguishes ADB offline from device power state](https://developer.android.com/tools/adb).
Do not report a failed probe as proof that the TV is powered off.

## Resume and acceptance

1. Recover stable ADB access; identify whether the operator's successful ping
   originated on this Mac or another device. Avoid toggling Connect to the
   computer casually because accepting its dialog reboots the board.
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

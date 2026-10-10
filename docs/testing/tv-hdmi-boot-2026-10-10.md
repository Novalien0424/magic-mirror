# TV boot-to-HDMI investigation — 2026-10-10

## Current outcome

The user selected AnyLauncher to replace Quickstep as the TV's default HOME,
forward HOME to the Rockchip HDMI viewer, and keep Quickstep as an escape.
**Installed and configured over direct Ethernet.** Default HOME is now
`com.tumuyan.fixedplay/.MainActivity`, primary app HDMI-IN in `r2` mode, secondary
Quickstep with its checkbox enabled. Ordinary HOME opens HDMI. Injected rapid
HOME presses did not demonstrate the secondary escape; explicit ADB Settings
and Quickstep launch remain available. No vendor auto-start/guard properties or
firmware were changed.

The first controlled reboot at about 21:16 increased boot count **49→50**,
preserved static Ethernet and HOME, and opened HDMI without a Mac launch call.
The old Mac watchdog was unloaded throughout and is now persistently disabled.
Android `user_rotation=2`, accelerometer rotation off, combined with Mac rotation
90°, is **operator-confirmed upright**. Rotation 1 was sideways; rotation 0 was
upside down. Do not reapply the old watchdog's rotation 1.

### Persistent direct Ethernet

- Mac `en0`: **192.168.77.1/24**, persistent SystemConfiguration IPv4 Manual,
  no Router key. Prior persistent configuration was DHCP. Rollback is
  `sudo networksetup -setdhcp Ethernet`.
- TV `eth0`: **192.168.77.2/24**, static via its Settings UI. Vendor validation
  requires a gateway/DNS value: gateway is 192.168.77.1; DNS placeholders
  0.0.0.0 result in no active DNS addresses. The Mac does not forward/NAT traffic.
  The user explicitly does not need Android Internet. Rollback: Ethernet IP
  mode → DHCP, with a DHCP server available.
- Mac Internet/default route remains Wi-Fi `en1`, gateway 10.0.0.1.
- Temporary bootpd PID 95152 was stopped. Ping passed 3/3 afterward; Ethernet
  address and ADB returned after reboot. No custom DHCP service is needed.
- Evidence: `.artifacts/tv-ethernet-2026-10-10/persistence-check.txt` and
  `boot-network-baseline.txt`. The first ADB reconnect saw `offline` during boot;
  this was not classified as a Wi-Fi failure.

### HDMI identity and image evidence

The first reboot caused macOS to see **Generic Display**, vendor/product 0,
1280×720@50, while BetterDisplay marked cached T749 disconnected. This changed
identity defeated the app's deliberate `MIRROR_DISPLAY=T749` selection. An
unnamed display was not silently accepted as the intended TV.

The TV's RK628 V4L2 EDID remained valid: 256 bytes, both checksums valid,
T749-fHD720 name, SHA256
`4fdfe9291c3eb4eb1c80b9f6c51ec7d07d29356866de38277521d8e6a25f6a8d`.
Rewriting the same EDID and a two-second HPD interval did not restore Mac
identity. BetterDisplay reinitialize did not resolve it; software disconnect
returned `Failed`. Applying those **unchanged bytes** through BetterDisplay's
custom-EDID API immediately recovered T749, 1080×1920@60 and rotation 90°.
The fallback connection record (BetterDisplay tag 6, UUID
`6CEE019F-ED5C-4AB4-8476-A02AA78321DD`) now auto-applies that EDID. The second
agent-requested reboot at **21:30:18** passed: boot count **50→51**, static TV
address and rotation 2 persisted, HDMI was foreground, and macOS retained
T749 at 1080×1920@60 to the right of Virtual Main. ADB was initially offline
and became usable at about two minutes. This is a TV-reboot test, not a Mac
cold-boot or power-removal acceptance test.
Rollback: disable that record's `autoApplyCustomEDID`, then apply factory EDID.
The precise firmware/DDC failure is unproven; this is a verified host recovery.

Permanent `displayctl unmirror`, TV mode, and `main Virtual` preserve the
user's layout: Virtual 16:9 Main `(0,0)`, T749 right `(1920,0)`. Earlier changes
were intentionally session-only. Native Mac CUA initially failed; it later
captured the actual Raven Mirror successfully. The Mac image is upright portrait.
Android `screencap` also captured the HDMI image successfully while Raven was
active; the temporary PNG was inspected and deleted. A prior black capture
does not prove HDMI is always excluded as a hardware overlay.

Primary references: [BetterDisplay CLI](https://betterdisplay.pro/guide/integration/cli-reference/)
documents custom EDID and auto-application; the
[Rockchip 4.19 RK628 driver](https://github.com/rockchip-linux/kernel/blob/develop-4.19/drivers/media/i2c/rk628_csi.c)
documents V4L2 EDID/HPD behavior. These explain mechanisms, not this firmware's
exact failure cause.

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
  permission was granted.
- Source supports selecting an app, bringing it forward, and a secondary
  launcher through rapid repeated HOME presses. Actual remote usability must
  be tested on this board; source inspection is not runtime acceptance.

The Mac watchdog was restored at 19:48, then unloaded again at **19:56** for
the user's reboot/network capture. It remains unloaded and disabled. The user subsequently
requested Raven launch for an HDMI check; current runtime is described below.
The watchdog changes in commit `b98102e` remain deployed.

## User-requested Raven / HDMI check — earlier state

The existing user LaunchAgent was bootstrapped, starting Raven PID **94357**.
Main and both renderers reported Ready, with no new startup stderr. The Mac
initially exposed only its sleeping virtual display. After user-activity wake,
the HDMI display appeared as a duplicate of the virtual desktop at 4K/30 Hz;
Main was waiting for its separately named `T749` target.

Session-only display changes removed duplication and set the TV to portrait
1080×1920 at 60 Hz. The **Virtual 16:9 desktop stayed Main**, origin `(0,0)`;
**T749-fHD720 is extended to the right**, origin `(1920,0)`, rotation 90°.
The user explicitly confirmed that this is the intended arrangement. Main
then logged `MIRROR_DISPLAY_REHOMED display_id=3 label=T749-fHD720
reason=target_returned`. At 20:37 the app remained on its first launch.

At that earlier check, physical HDMI picture was **not yet verified**: the operator reported Android
home/Settings remains on the TV. The installed HDMI viewer's verified app
label is **HDMI-IN**; open it through the TV's app drawer. The 20:37 TCP 5555
check still timed out, so no remote input-switch command could run. A native
Mac UI inspection request also timed out; renderer-ready logs do not establish
the avatar's rendered pixels. No screenshot or conversation data was retained.

## Verified board and startup behavior

ZC-3568D, RK3568, Android 11, firmware build dated 2024-09-03.
Wi-Fi MAC `74:24:ca:f1:db:d9`, prior IPv4 `10.0.0.4`, ADB TCP port 5555.
The Mac uses ADB server port **5038**, with mDNS disabled. Original stock HOME was
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

The assistant issued **no TV reboot command during the earlier Wi-Fi outage**.
Later explicitly announced wired-persistence test reboots are recorded above.
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
ADB had not returned then to verify the new boot count or settings.

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

## Clean app shutdown and current conversation evidence

The held stop after PID 2465 exited left no Magic Mirror Electron/wake workers,
removed its Jabra input/output assertions, and recorded LaunchAgent exit 0.
The operator confirmed BGM stopped. The earlier near-immediate restart resumed
the configured Dormant ambience; it was not evidence of an orphan audio player.
PID 2967 subsequently started at 21:23, entered Dormant, detected wake at
21:23:41 and became Active at 21:23:46. Mac and TV captures showed Raven, and
the operator confirmed physical orientation after rotation 2 was applied.

The operator reported off-topic YouTube speech. Metadata shows
`media_discovery_no_match` at 21:24:17 and `media_source_restricted` at 21:25:56.
No retained spoken text exists, so the earlier utterance/answer cannot be
reconstructed from disk. Do not call that complaint resolved or guess its cause.
During the subsequent user loop test, repeated `media_playing` events continued
through the assistant's 21:30 TV reboot. The operator reported blackouts; the
assistant acknowledged interrupting that test with TV/HDMI operations and then
stopped state-changing TV/app work. At **21:32:11**, wake detection stopped
media, released wake input and began activation; Active followed at 21:32:15.
This is one actual operator-session handoff success, not comprehensive audible
loop-wake or conversation-quality acceptance.

The user then approved further tests. Normal Raven was cleanly stopped before
two isolated real-Raven runs using synthetic visitor PCM through real WebRTC
ASR. Both exited 2 on quality, with no provider errors:

- `2026-10-10T13-34-26-028Z`: default local-first lookup → YouTube search →
  playback passed, as did once-completion/return and a relevant unrelated
  follow-up (all three quality scores 4/4). The first playback request failed
  `tool_preamble` and `wrong_language`. This did not reproduce the operator's
  exact off-topic incident.
- `2026-10-10T13-37-11-042Z`: three of four empathy/context turns passed quality;
  the date-correction turn failed with `wrong_language`. All four audio turns
  completed and mic release passed. The avatar-only screenshot was inspected
  and shows Raven upright in portrait.

Evidence is under `.artifacts/phase4-qa/<run>/raven-results.json` and
`evidence.json`. Transcripts and audio were not retained. Synthetic visitor
audio is not physical human-microphone acceptance. Existing prompt rules already
require same-turn language and silent tool invocation; these failures alone do
not establish a missing rule or justify speech regex filters.

## Persistent ADB server and standby check

Installed `system/com.magicmirror.board-adb` from
`deploy/macos/com.magicmirror.board-adb.daemon.plist` using the new installer.
It runs a root-owned copy of ADB at `/Library/Application Support/MagicMirror/adb`,
binds only **127.0.0.1:5038**, disables mDNS, and preserves the existing trusted
root ADB identity. It owns neither HDMI polling nor Electron. AnyLauncher and
the existing user app LaunchAgent retain those separate responsibilities.
The obsolete HDMI daemon remains disabled and unloaded.

Initial configuration with `-L tcp:127.0.0.1:5038` failed: this ADB release
reported that listening on a specified hostname is unsupported and aborted.
The deployed configuration uses supported `-P 5038` instead; `lsof` verified
loopback-only binding. Plist lint and zsh syntax passed, source/installed plist
and binary hashes matched, and both installed files are root:wheel-owned.
The service remained on its first successful run, PID 4320, during verification.

The first standby attempt exposed a stale transport in the old ADB server.
TCP 5555 still accepted connections; replacing the host server restored access
while the TV was **Asleep / display OFF**, with unchanged boot count 51. A
single Wake-on-LAN probe did not wake it. Explicit keyevent 224 then returned
Awake / ON and HDMI launched successfully. The exact stale-transport cause is
unproven; it was not evidence of a TV reboot or dead Ethernet link.

A second standby/wake cycle with the installed server passed without restart:
at 21:41:30, after more than 20 seconds asleep, ADB read Asleep / OFF; at
21:41:40, keyevent 224 and HDMI launch returned `Status: ok`, Awake / ON,
boot count 51. T749 remained portrait/right and Virtual remained Main.
Evidence: `.artifacts/tv-ethernet-2026-10-10/standby-check.txt`.
This proves wired standby/wake, not wake after full Android shutdown or power
removal. No future Bluetooth button has been installed or accepted.

## Wi-Fi findings after Ethernet recovery

Wired ADB proves a functioning daemon/authentication path; its TCP listener is
wildcard `*:5555`, not Ethernet-only. Firewall inspection as shell UID 2000
returned permission denied. Wi-Fi remains enabled but disconnected. The exact
configured-network section contains three saved networks, all selection-enabled
with autojoin allowed. The latest retained scan attempt reports Wi-Fi enabled,
screen on and **WifiConnectivityManagerEnabled=false**. Its external-autojoin
flag and trusted/untrusted request counts were not exposed by the vendor dump;
normal wired arbitration versus abnormal suppression remains unresolved.
[Android 11 implementation](https://android.googlesource.com/platform/frameworks/opt/net/wifi/+/refs/tags/android-11.0.0_r1/service/java/com/android/server/wifi/WifiConnectivityManager.java)
is the mechanism reference, not incident attribution.

Eleven HAL link-statistics calls returned ERROR_UNKNOWN; this does not prove
unsupported statistics or packet-path failure. A locally generated reason-3
disconnect at 20:56:34 preceded an RSSI-stop error by 16 ms; the latter is
consistent with teardown. No initiating caller was retained. Current vendor
flags are wifiEth4g=0, zcgetwifimac=2, Ethernet enabled; periodic Ethernet probe
and native boot/guard flags are unset. The cached property file is permission
denied, not verified absent. No speculative vendor-property changes were made.

## Remaining acceptance and rollback

Normal Raven was restored through its sole LaunchAgent at **21:43:58**, PID
4658, both renderers Ready, T749 selected/full-screen, wake listening at
21:43:59. A fresh native screenshot shows the expected black reflective-Dormant
portrait screen. The user can now perform the physical TV power-cycle check.

- User will perform a physical TV power-down/reboot after the assistant's work.
  Verify automatic HDMI, upright picture and wired ADB afterward. Two software
  reboots and wired standby/wake already passed; hard power removal is distinct.
- Verify rapid-HOME Quickstep escape physically. Explicit rollback is
  `cmd package set-home-activity --user 0 com.android.launcher3/.uioverrides.QuickstepLauncher`.
  Settings remains accessible by ADB. Do not restore the old watchdog without
  correcting its obsolete Wi-Fi target and rotation 1.
- Mac cold boot, hard TV power cycle, physical remote and future Bluetooth
  button integration remain untested. No button has been installed.
- The exact earlier off-topic response remains unattributed. Controlled Raven
  QA found language and tool-preamble failures; preserve those failed results.

Only avatar-only QA screenshots and metadata are retained; temporary operator
captures were deleted. No raw conversations, audio or credentials are retained.
Project invariants 1/8/9/10/11/12 were preserved; Raven was launched only after
the user's later explicit request. No phase or physical-remote acceptance claim
is made.

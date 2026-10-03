#!/bin/zsh
# Magic Mirror field ops: keep the HAOCROWN mirror board (ZC-3568D, RK3568 + RK628D)
# showing its HDMI input after every board boot.
#
# - Finds the board by Wi-Fi MAC (DHCP may move it off 10.0.0.4).
# - Starts adb with mDNS off: adb 37.0.1 aborts on macOS 27 in its discovery path.
# - Relaunches the Rockchip HDMI-in viewer only when the board sits on its launcher,
#   so an operator using Settings on the glass is never interrupted.
# - Re-applies landscape rotation (the HDMI picture is 1920x1080 on a portrait panel).
# Metadata-only log; installed as LaunchAgent com.magicmirror.board-hdmi.

export PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
export ADB_MDNS=0 ADB_MDNS_AUTO_CONNECT=0

BOARD_MAC="74:24:ca:f1:db:d9"
BOARD_IP_DEFAULT="10.0.0.4"
HDMI_ACTIVITY="com.android.rockchip.camera2/.RockchipCamera2"
LAUNCHER_PKG="com.android.launcher3"
INTERVAL=20

ts() { date '+%Y-%m-%dT%H:%M:%S%z'; }
say() { print -r -- "$(ts) $*"; }

board_ip() {
  # arp prints MAC octets without leading zeros; normalise both sides.
  local norm=$(print -r -- "$BOARD_MAC" | sed -E 's/(^|:)0([0-9a-f])/\1\2/g')
  local ip=$(arp -an | awk -v m="$norm" '$4==m {gsub(/[()]/,"",$2); print $2; exit}')
  print -r -- "${ip:-$BOARD_IP_DEFAULT}"
}

last_state=""
note() { [[ "$1" != "$last_state" ]] && say "$1" && last_state="$1"; }

say "BOARD_KEEPALIVE_START mac=$BOARD_MAC interval=${INTERVAL}s"
while true; do
  adb start-server >/dev/null 2>&1
  ip=$(board_ip); target="$ip:5555"

  if ! adb devices | grep -q "^${target}[[:space:]]*device"; then
    out=$(adb connect "$target" 2>&1)
    if ! print -r -- "$out" | grep -q "connected to"; then
      note "BOARD_UNREACHABLE target=$target reason=$(print -r -- "$out" | tr -s ' \n' ' ' | cut -c1-80)"
      sleep $INTERVAL; continue
    fi
    say "BOARD_CONNECTED target=$target"
  fi

  top=$(adb -s "$target" shell "dumpsys activity activities | grep -m1 mResumedActivity" 2>/dev/null | awk '{print $4}')
  case "$top" in
    "$HDMI_ACTIVITY"|com.android.rockchip.camera2/*)
      note "HDMI_VIEW_ACTIVE target=$target" ;;
    ""|"$LAUNCHER_PKG"/*)
      adb -s "$target" shell "settings put system accelerometer_rotation 0; settings put system user_rotation 1" >/dev/null 2>&1
      adb -s "$target" shell am start -n "$HDMI_ACTIVITY" >/dev/null 2>&1
      say "HDMI_VIEW_LAUNCHED target=$target previous=${top:-none}"
      last_state="" ;;
    *)
      note "HDMI_VIEW_DEFERRED target=$target reason=operator_app_in_front app=${top%%/*}" ;;
  esac
  sleep $INTERVAL
done

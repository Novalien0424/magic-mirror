#!/bin/zsh
# Magic Mirror field ops: keep the HAOCROWN mirror board (ZC-3568D, RK3568 + RK628D)
# showing its HDMI input after every board boot.
#
# - Finds the board by Wi-Fi MAC (DHCP may move it off 10.0.0.4).
# - Starts adb with mDNS off: adb 37.0.1 aborts on macOS 27 in its discovery path.
# - Relaunches the Rockchip HDMI-in viewer only when the board sits on its launcher,
#   so an operator using Settings on the glass is never interrupted.
# - Re-applies landscape rotation (the HDMI picture is 1920x1080 on a portrait panel).
# Metadata-only log; installed as LaunchDaemon com.magicmirror.board-hdmi.

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

  # An absent foreground activity can mean standby or an interrupted ADB read.
  # Neither is permission to wake the panel or start an activity.
  if ! power=$(adb -s "$target" shell dumpsys power 2>/dev/null); then
    note "HDMI_VIEW_DEFERRED target=$target reason=power_query_failed"
    sleep $INTERVAL; continue
  fi
  if ! print -r -- "$power" | grep -q 'mWakefulness=Awake'; then
    note "HDMI_VIEW_DEFERRED target=$target reason=not_awake"
    sleep $INTERVAL; continue
  fi
  if ! activities=$(adb -s "$target" shell dumpsys activity activities 2>/dev/null); then
    note "HDMI_VIEW_DEFERRED target=$target reason=activity_query_failed"
    sleep $INTERVAL; continue
  fi
  top=$(print -r -- "$activities" | awk '/mResumedActivity/ {print $4; exit}')
  case "$top" in
    "$HDMI_ACTIVITY"|com.android.rockchip.camera2/*)
      note "HDMI_VIEW_ACTIVE target=$target" ;;
    "")
      note "HDMI_VIEW_DEFERRED target=$target reason=no_resumed_activity" ;;
    "$LAUNCHER_PKG"/*)
      if ! adb -s "$target" shell "settings put system accelerometer_rotation 0 && settings put system user_rotation 1" >/dev/null 2>&1; then
        note "HDMI_VIEW_DEFERRED target=$target reason=rotation_failed"
        sleep $INTERVAL; continue
      fi
      if ! launch=$(adb -s "$target" shell am start -W -n "$HDMI_ACTIVITY" 2>/dev/null) ||
          ! print -r -- "$launch" | grep -q '^Status: ok'; then
        note "HDMI_VIEW_DEFERRED target=$target reason=launch_failed"
        sleep $INTERVAL; continue
      fi
      say "HDMI_VIEW_LAUNCHED target=$target previous=$top"
      last_state="" ;;
    *)
      note "HDMI_VIEW_DEFERRED target=$target reason=operator_app_in_front app=${top%%/*}" ;;
  esac
  sleep $INTERVAL
done

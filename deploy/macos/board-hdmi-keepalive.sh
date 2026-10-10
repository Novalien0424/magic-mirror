#!/bin/zsh
# Retired legacy watchdog. AnyLauncher owns HDMI-IN on the board; the wired
# board-ADB service owns only its ADB server. Never poll, wake the TV, or restart
# Electron from this historical LaunchDaemon entry point.
export PATH=/usr/bin:/bin:/usr/sbin:/sbin
print -r -- 'BOARD_KEEPALIVE_RETIRED reason=legacy_watchdog_disabled'
exit 0

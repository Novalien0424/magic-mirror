#!/bin/zsh
# Install the mirror-board HDMI watchdog as a root LaunchDaemon.
# Root daemons are exempt from macOS Local Network privacy, which blocks the
# per-user LaunchAgent with "No route to host". Run with: sudo zsh <this file>
set -euo pipefail
[[ $EUID -eq 0 ]] || { print -u2 "run with sudo"; exit 1; }

SRC="${0:A:h}"
DEST="/Library/Application Support/MagicMirror"
PLIST="/Library/LaunchDaemons/com.magicmirror.board-hdmi.plist"

launchctl bootout system/com.magicmirror.board-hdmi 2>/dev/null || true
install -d -o root -g wheel -m 755 "$DEST" /Library/Logs/MagicMirror
# Root executes this script, so it must not stay user-writable.
install -o root -g wheel -m 755 "$SRC/board-hdmi-keepalive.sh" "$DEST/board-hdmi-keepalive.sh"
install -o root -g wheel -m 644 "$SRC/com.magicmirror.board-hdmi.daemon.plist" "$PLIST"
plutil -lint "$PLIST"
launchctl bootstrap system "$PLIST"
sleep 8
launchctl print system/com.magicmirror.board-hdmi | grep -E '^\s+(state|pid) ='
tail -3 /Library/Logs/MagicMirror/board-hdmi.log
print "INSTALLED. Remove with: sudo launchctl bootout system/com.magicmirror.board-hdmi && sudo rm $PLIST"

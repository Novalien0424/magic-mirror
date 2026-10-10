#!/bin/zsh
# Own only the localhost ADB server. AnyLauncher owns TV boot; the user
# LaunchAgent alone owns Electron. Run with sudo from the canonical checkout.
set -euo pipefail
[[ $EUID -eq 0 ]] || { print -u2 'run with sudo'; exit 1; }
src="${0:A:h}"
dest='/Library/Application Support/MagicMirror'
plist='/Library/LaunchDaemons/com.magicmirror.board-adb.plist'
adb_source='/opt/homebrew/bin/adb'
[[ -x "$adb_source" ]] || { print -u2 'ADB_BINARY_MISSING'; exit 1; }
/usr/bin/plutil -lint "$src/com.magicmirror.board-adb.daemon.plist"
# Refuse an unrelated listener before changing services. Port 5037 is untouched.
listeners=$(/usr/sbin/lsof -nP -t -iTCP:5038 -sTCP:LISTEN || true)
for pid in ${(f)listeners}; do
  owner=$(/bin/ps -p "$pid" -o uid= | tr -d ' ')
  executable=$(/bin/ps -p "$pid" -o comm=)
  [[ "$owner" == 0 && "${executable:t}" == adb ]] || {
    print -u2 'ADB_PORT_HAS_UNEXPECTED_OWNER'; exit 1
  }
done
/bin/launchctl disable system/com.magicmirror.board-hdmi
/bin/launchctl bootout system/com.magicmirror.board-hdmi 2>/dev/null || true
/bin/launchctl bootout system/com.magicmirror.board-adb 2>/dev/null || true
if [[ -n "$listeners" ]]; then
  ADB_MDNS=0 ADB_MDNS_AUTO_CONNECT=0 "$adb_source" -P 5038 kill-server
fi
/usr/bin/install -d -o root -g wheel -m 755 "$dest" /Library/Logs/MagicMirror
# launchd must not execute the user-writable Homebrew binary as root.
/usr/bin/install -o root -g wheel -m 755 "$adb_source" "$dest/adb"
/usr/bin/install -o root -g wheel -m 644 "$src/com.magicmirror.board-adb.daemon.plist" "$plist"
/bin/launchctl enable system/com.magicmirror.board-adb
/bin/launchctl bootstrap system "$plist"
print 'BOARD_ADB_INSTALLED port=5038 bind=127.0.0.1'

#!/bin/zsh
# Install the venue LAN watch (net-watch.swift) as a root LaunchDaemon that runs every 5 min.
# Root needs no Local Network consent and executes only the installed copy.
#   sudo zsh deploy/macos/install-net-watch.sh          watch and log only
#   sudo zsh deploy/macos/install-net-watch.sh --heal   also re-join Wi-Fi when group traffic is
#                                                       dead and Magic Mirror is not running
# Log: /Library/Logs/MagicMirror/net-watch.log (state changes + hourly heartbeat, counts only).
set -euo pipefail
[[ $EUID -eq 0 ]] || { print -u2 'run with sudo'; exit 1; }
[[ $# -eq 0 || ( $# -eq 1 && "$1" == --heal ) ]] || { print -u2 'usage: install-net-watch.sh [--heal]'; exit 2; }
src="${0:A:h}"
dest='/Library/Application Support/MagicMirror'
label='com.magicmirror.net-watch'
plist="/Library/LaunchDaemons/$label.plist"
build=$(/usr/bin/mktemp -d)
trap '/bin/rm -rf "${build:?}"' EXIT
/usr/bin/swiftc -O "$src/net-watch.swift" -o "$build/net-watch"
/usr/bin/install -d -o root -g wheel -m 755 "$dest" /Library/Logs/MagicMirror
/usr/bin/install -o root -g wheel -m 755 "$build/net-watch" "$dest/net-watch"
heal=''; [[ "${1:-}" == --heal ]] && heal='<string>--heal</string>'
/bin/cat > "$build/$label.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key><array>
    <string>$dest/net-watch</string>
    $heal
  </array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>300</integer>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>/Library/Logs/MagicMirror/net-watch.log</string>
  <key>StandardErrorPath</key><string>/Library/Logs/MagicMirror/net-watch.log</string>
</dict></plist>
PLIST
/usr/bin/plutil -lint "$build/$label.plist"
/bin/launchctl bootout "system/$label" 2>/dev/null || true
/usr/bin/install -o root -g wheel -m 644 "$build/$label.plist" "$plist"
/bin/launchctl enable "system/$label"
/bin/launchctl bootstrap system "$plist"
print "NET_WATCH_INSTALLED heal=${${heal:+on}:-off} interval_s=300"

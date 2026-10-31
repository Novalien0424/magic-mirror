#!/bin/zsh
# Install the per-user board keep-awake tick: every two minutes, re-apply the TV board's
# standby wakelock through the trusted root ADB server (see scripts/board-keep-awake.mjs).
# It never starts, stops or restarts Electron. Run as the operator user (no sudo).
set -euo pipefail
[[ $EUID -ne 0 ]] || { print -u2 'run as the operator user, not root'; exit 1; }
repo=/Users/novalien0424/magic-mirror
LABEL=com.magicmirror.board-keep-awake
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
[[ -x /opt/homebrew/bin/node ]] || { print -u2 'Node is missing'; exit 1; }
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs/MagicMirror"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/opt/homebrew/bin/node</string><string>$repo/scripts/board-keep-awake.mjs</string></array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>120</integer>
  <key>ProcessType</key><string>Background</string>
  <key>LowPriorityIO</key><true/>
</dict>
</plist>
EOF
plutil -lint "$PLIST"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
print "BOARD_KEEP_AWAKE_INSTALLED interval=120s"

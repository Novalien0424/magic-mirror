#!/bin/zsh
# Install the preferred-audio helper as a per-user LaunchAgent: the Jabra (or the
# device named by $1) becomes default input + output + system output whenever it
# is connected. Run as the logged-in operator (no sudo): zsh install-audio-prefer.sh [name]
set -euo pipefail
[[ $EUID -ne 0 ]] || { print -u2 "run as the operator user, not root (audio defaults are per user)"; exit 1; }

NEEDLE="${1:-Jabra}"
SRC="${0:A:h}"
BIN_DIR="$HOME/Library/Application Support/MagicMirror/ops"
LOG_DIR="$HOME/Library/Logs/MagicMirror"
LABEL="com.magicmirror.audio-prefer"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

mkdir -p "$BIN_DIR" "$LOG_DIR" "$HOME/Library/LaunchAgents"
swiftc -O "$SRC/audio-prefer.swift" -o "$BIN_DIR/audio-prefer"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$BIN_DIR/audio-prefer</string><string>$NEEDLE</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$LOG_DIR/audio-prefer.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/audio-prefer.log</string>
</dict>
</plist>
EOF
plutil -lint "$PLIST"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
sleep 3
launchctl print "gui/$(id -u)/$LABEL" | grep -E '^\s+(state|pid) =' | head -2
tail -3 "$LOG_DIR/audio-prefer.log"
print "INSTALLED. Remove with: launchctl bootout gui/\$(id -u)/$LABEL && rm $PLIST"

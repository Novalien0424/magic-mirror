#!/bin/zsh
# Install the staged "Magic Mirror Music" driver (from build.sh) and restart Core Audio.
# Needs admin: sudo zsh install.sh. Stop Magic Mirror first (STOP): coreaudiod restarts
# drop every open audio stream. Uninstall: sudo rm -rf /Library/Audio/Plug-Ins/HAL/MagicMirrorMusic.driver
# and sudo killall coreaudiod.
set -euo pipefail
[[ $EUID -eq 0 ]] || { print -u2 "run with sudo"; exit 1; }
OPERATOR="${SUDO_USER:?run through sudo from the operator account}"
HOME_DIR=$(dscl . -read "/Users/$OPERATOR" NFSHomeDirectory | awk '{print $2}')
STAGED="$HOME_DIR/Library/Application Support/MagicMirror/ops/music-device/MagicMirrorMusic.driver"
TARGET=/Library/Audio/Plug-Ins/HAL/MagicMirrorMusic.driver
[[ -d "$STAGED" ]] || { print -u2 "no staged driver: run build.sh first"; exit 1; }
if pgrep -f "magic-mirror/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron /Users/" >/dev/null; then
  print -u2 "Magic Mirror is running: press STOP first"; exit 1
fi
codesign --verify "$STAGED"
rm -rf "$TARGET"; cp -R "$STAGED" "$TARGET"; chown -R root:wheel "$TARGET"; chmod -R go-w "$TARGET"
killall coreaudiod 2>/dev/null || true
for i in {1..20}; do sleep 1; system_profiler SPAudioDataType 2>/dev/null | grep -q "Magic Mirror Music:" && break; done
system_profiler SPAudioDataType 2>/dev/null | grep -q "Magic Mirror Music:" \
  && print "INSTALLED: Magic Mirror Music is present" || { print -u2 "driver copied but the device did not appear"; exit 1; }

#!/bin/zsh
# Measure each Airfoil speaker's real playout delay (Magic Mirror Music -> Airfoil -> speaker
# -> microphone), all speakers connected, one audible at a time. Chirps with irregular spacing
# are scheduled on the host clock; a second Jabra Speak2 75 (or any non-echo-cancelling mic)
# records them. Run as the operator with Magic Mirror stopped (STOP).
#   zsh measure.sh <mic-input-uid> [count]      e.g. the 2nd Jabra's ...:2 input UID
# Output: one line per speaker with the median delay (ms). Compare speakers with each other;
# the Jabra itself cannot be measured by another Jabra (they cancel each other's sound).
# Airfoil sync offsets live in `defaults read com.rogueamoeba.Airfoil syncOffsets` (seconds):
# Computer/Bluetooth positive = earlier; AirPlay positive = later. Airfoil applies changes
# 30-60 s after connecting, so this script plays a soft bed for 60 s before measuring.
set -euo pipefail
[[ $EUID -ne 0 ]] || { print -u2 "run as the operator user"; exit 1; }
MIC="${1:?mic input UID}"; COUNT="${2:-30}"
SRC="${0:A:h}"; WORK=$(mktemp -d); trap 'pkill -f "mmsync-play.*$WORK/bed" 2>/dev/null; rm -rf "$WORK"' EXIT
ELECTRON=/Users/novalien0424/magic-mirror/node_modules/electron/dist/Electron.app
if pgrep -f "magic-mirror/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron /Users/" >/dev/null; then
  print -u2 "Magic Mirror is running: press STOP first"; exit 1
fi
swiftc -O "$SRC/probe-play.swift" -o "$WORK/mmsync-play"
swiftc -O "$SRC/probe-record.swift" -o "$WORK/mmsync-rec"
speakers=$(osascript -e 'tell application "Airfoil"
set linked volume to false
set current audio source to (first device source whose name is "Magic Mirror Capture")
set out to ""
repeat with s in every speaker
set i to id of s
if i is "com.rogueamoeba.airfoil.LocalSpeaker" or i ends with ":output" or (name of s) starts with "EDIFIER" then
if not (connected of s) then connect to s
set out to out & i & linefeed
end if
end repeat
return out
end tell')
"$WORK/mmsync-play" --out "$WORK/bed.json" --device MagicMirrorMusic_UID --lead 900 --count 0 --bed 0.03 >/dev/null 2>&1 &
sleep 60
for id in ${(f)speakers}; do
  osascript - "$id" <<'OSA' >/dev/null
on run argv
  tell application "Airfoil"
    repeat with s in (every speaker whose connected is true)
      if (id of s) is (item 1 of argv) then
        set (volume of s) to 0.75
      else
        set (volume of s) to 0.0
      end if
    end repeat
  end tell
end run
OSA
  sleep 3
  name="m$RANDOM"; secs=$(( COUNT * 11 / 10 + 14 ))
  open -n -a "$ELECTRON" --args "$SRC/record-under-electron.js" --mm-rec "$WORK/mmsync-rec" --device "$MIC" --seconds $secs --out "$WORK/$name"
  sleep 2.5
  "$WORK/mmsync-play" --out "$WORK/$name.play.json" --device MagicMirrorMusic_UID --lead 3 --count $COUNT --period 1.0 --bed 0.0 >/dev/null
  while pgrep -f "mmsync-rec.*$name" >/dev/null; do sleep 0.5; done
  python3 -I "$SRC/track.py" "$WORK/$name" "$WORK/$name.play.json" "$id" | head -1
done
# Leave the speakers to Magic Mirror: its Airfoil route reconnects them with their volumes.
for id in ${(f)speakers}; do osascript - "$id" <<'OSA' >/dev/null 2>&1 || true
on run argv
  tell application "Airfoil" to disconnect from (first speaker whose id is (item 1 of argv))
end run
OSA
done

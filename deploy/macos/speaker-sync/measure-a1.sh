#!/bin/zsh
# Speaker delays through Airfoil from a scheduled chirp train into Magic Mirror Music. Blocks alternate
# one audible speaker: J = Jabra ("Computer"), E = Edifier, A = A1. A soft bed keeps the stream running.
# Mic: A1's own call mic (HFP, 8 kHz; hears the Jabras and the Edifier) unless MM_SYNC_MIC names another
# input UID, e.g. the USB Jabra's ...:2 input for A and E blocks (a Jabra mic never hears the Jabras).
# Recording runs through an Electron child (Electron holds the Microphone permission). Run with Magic
# Mirror stopped (STOP), Jabra at 100% (`osascript -e 'set volume output volume 100'`), and afterwards
# `stop-state --reset-output`. Settle >= 120 s after any Airfoil connect (an AirPlay connect holds the
# Mac-side outputs ~13-15 s at first). Delete the recordings afterwards (room sound).
#   zsh measure-a1.sh <workdir> "J E J E" [settleSeconds]
# Then: python3 -I scan.py <workdir>/b1J <workdir>/b1J.play.json b1J   (top line per block)
set -uo pipefail
W="$1"; BLOCKS=(${=2}); SETTLE="${3:-30}"
SRC="${0:A:h}"; ELECTRON=/Users/novalien0424/magic-mirror/node_modules/electron/dist/Electron.app
MIC="${MM_SYNC_MIC:-C2-60-12-F8-D1-A5:input}"; COUNT=25
mkdir -p "$W"
if pgrep -f "magic-mirror/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron /Users/" >/dev/null; then print "Magic Mirror is running: press STOP first"; exit 1; fi
[[ -x "$W/mmsync-play" ]] || swiftc -O "$SRC/probe-play.swift" -o "$W/mmsync-play"
[[ -x "$W/mmsync-rec" ]] || swiftc -O "$SRC/probe-record.swift" -o "$W/mmsync-rec"
osascript -e 'tell application "Airfoil"
set linked volume to false
set current audio source to (first device source whose name is "Magic Mirror Capture")
repeat with s in every speaker
if (id of s) is "com.rogueamoeba.airfoil.LocalSpeaker" or (id of s) is "C2-60-12-F8-D1-A5:output" or (name of s) starts with "EDIFIER" then
if not (connected of s) then connect to s
end if
end repeat
end tell' >/dev/null
"$W/mmsync-play" --out "$W/bed.json" --device MagicMirrorMusic_UID --lead 900 --count 0 --bed 0.03 >/dev/null 2>&1 &
BED=$!; trap 'kill $BED 2>/dev/null' EXIT
sleep "$SETTLE"; n=0
for blk in $BLOCKS; do
  n=$((n+1))
  if [[ $blk == J ]]; then target="com.rogueamoeba.airfoil.LocalSpeaker" vol=1.0; elif [[ $blk == A ]]; then target="C2-60-12-F8-D1-A5:output" vol=1.0; else target="6C1629028D58@EDIFIER M330 Ⅱ 8D58" vol=0.45; fi
  osascript - "$target" "$vol" <<'OSA' >/dev/null
on run argv
  tell application "Airfoil"
    repeat with s in (every speaker whose connected is true)
      if (id of s) is (item 1 of argv) then
        set (volume of s) to ((item 2 of argv) as real)
      else
        set (volume of s) to 0.0
      end if
    end repeat
  end tell
end run
OSA
  sleep 3
  name="b$n$blk"; secs=$(( COUNT * 11 / 10 + 14 ))
  open -n -a "$ELECTRON" --args "$SRC/record-under-electron.js" --mm-rec "$W/mmsync-rec" --device "$MIC" --seconds $secs --out "$W/$name"
  sleep 2.5
  "$W/mmsync-play" --out "$W/$name.play.json" --device MagicMirrorMusic_UID --lead 3 --count $COUNT --period 1.0 --bed 0.0 >/dev/null
  while pgrep -f "mmsync-rec.*$name" >/dev/null; do sleep 0.5; done
  python3 -I "$SRC/scan.py" "$W/$name" "$W/$name.play.json" "$(date +%T) $name" | head -1
done

#!/bin/zsh
# Measure how long the TV takes to show a Mac frame (Mac draw -> board composition), the picture
# half of lip-sync. Shows a Gray-coded Mac clock on T749 (pattern.swift), records it on the board
# with `screenrecord --bugreport` (each frame stamped with the board clock), reads both clocks per
# frame (analyze.swift, Vision OCR) and corrects the board-Mac clock offset (offset.py, persistent
# adb shell). Needs the TV awake on HDMI (after START); silent; ~30 s. Board time zone: +08:00.
#   zsh deploy/macos/speaker-sync/tv-picture/measure.sh     -> "... delay_ms ... median=NN"
# Reported latency of Magic Mirror Music = audio delay - picture delay (calibration.json), set with
#   swiftc -O deploy/macos/music-device/latency.swift -o /tmp/mm-latency && /tmp/mm-latency <frames@48k>
set -euo pipefail
SRC="${0:A:h}"; WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
export ADB_MDNS=0 ADB_MDNS_AUTO_CONNECT=0
adb=('/Library/Application Support/MagicMirror/adb' -H 127.0.0.1 -P 5038 -s 192.168.77.2:5555)
swiftc -O "$SRC/pattern.swift" -o "$WORK/pattern"
swiftc -O "$SRC/analyze.swift" -o "$WORK/analyze"
"$WORK/pattern" 16 >/dev/null & sleep 3
"${adb[@]}" shell screenrecord --bugreport --time-limit 8 --size 960x540 --bit-rate 16000000 /data/local/tmp/mm-sync.mp4
"${adb[@]}" pull /data/local/tmp/mm-sync.mp4 "$WORK/rec.mp4" >/dev/null
"${adb[@]}" shell rm -f /data/local/tmp/mm-sync.mp4
wait
offset=$(python3 "$SRC/offset.py" | sed -E 's/.*median\)=([-0-9.]+).*/\1/')
mkdir "$WORK/frames"; ffmpeg -v error -i "$WORK/rec.mp4" -fps_mode passthrough "$WORK/frames/%04d.png" 2>/dev/null || true
"$WORK/analyze" "$WORK/frames" > "$WORK/rows.csv"
print "clock offset (board - Mac) ms: $offset"
python3 "$SRC/delay.py" "$WORK/rows.csv" "$offset"

#!/bin/zsh
set -euo pipefail
# Continuous physical-microphone capture. Audio exists only on a caller-owned RAM disk.
# Usage (canonical checkout, app stopped):
# node scripts/electron-owner.mjs speaker-sync zsh deploy/macos/speaker-sync/measure-continuous.sh \
#   /Volumes/MMSyncRAM/run no-a1 C2-60-12-F8-D1-A5:input 130 'J E J E'
# For A1, use "group", the Jabra input UID, and >=390 s after a fresh connection.
# Leaves connections intact between measurements; final operator cleanup releases Jabra/Edifier.
[[ $# == 5 && -n "${MIRROR_ELECTRON_OWNER_TOKEN:-}" ]] || { print -u2 'usage: run through electron-owner.mjs; RAM-dir group|no-a1 mic-UID settle-seconds "J E ..."'; exit 2; }
W="${1:A}"; LABEL="${W:t}"; MODE="$2"; MIC="$3"; SETTLE="$4"; BLOCKS=(${=5})
ROOT="${0:A:h:h:h:h}"; SRC="${0:A:h}"; BIN="$W/bin"
[[ "$MODE" == group || "$MODE" == no-a1 ]] || exit 2
[[ "$SETTLE" == <-> && ${#BLOCKS} -gt 0 ]] || exit 2
for blk in $BLOCKS; do
  [[ "$blk" == J || "$blk" == E || "$blk" == A ]] || exit 2
  if [[ "$blk" == A && ( "$MODE" != group || "$MIC" == C2-60-12-F8-D1-A5:input ) ]]; then print -u2 'A1 needs group mode and a separate microphone'; exit 2; fi
  if [[ "$blk" == J && "$MIC" == *Jabra* ]]; then print -u2 'The Jabra microphone cannot measure the Jabras'; exit 2; fi
done
if pgrep -f '/Electron.app/Contents/MacOS/Electron' >/dev/null; then print -u2 'Electron is already running'; exit 1; fi
mkdir -p "$W"
python3 - "$W" <<'RAM'
import pathlib,plistlib,subprocess,sys
path=pathlib.Path(sys.argv[1]).resolve()
info=plistlib.loads(subprocess.check_output(['hdiutil','info','-plist']))
mounts=[pathlib.Path(e['mount-point']).resolve() for i in info.get('images',[]) if i.get('image-path','').startswith('ram://') for e in i.get('system-entities',[]) if 'mount-point' in e]
if not any(path.is_relative_to(m) for m in mounts): raise SystemExit('capture_requires_ram_disk')
RAM
[[ ! -e "$W/continuous.json" && ! -e "$W/continuous.f32" ]] || { print -u2 'Use a new measurement directory'; exit 2; }
mkdir -p "$BIN"
swiftc -O "$SRC/probe-play.swift" -o "$BIN/mmsync-play"
swiftc -O "$SRC/probe-record.swift" -o "$BIN/mmsync-rec"
"$HOME/Library/Application Support/MagicMirror/ops/stop-state" --output-status
BED=''; PLAY=''; OWNER="$W/continuous.owner.json"
SECONDS_TOTAL=$((SETTLE + ${#BLOCKS} * 39 + 20))
cleanup() {
  local result=$? failed=0
  set +e
  [[ -z "$PLAY" ]] || { kill "$PLAY" 2>/dev/null; wait "$PLAY" 2>/dev/null; }
  [[ -z "$BED" ]] || { kill "$BED" 2>/dev/null; wait "$BED" 2>/dev/null; }
  if [[ -e "$OWNER" ]]; then
    local child=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["childPid"])' "$OWNER")
    [[ "$child" == <-> ]] && kill -TERM "$child" 2>/dev/null
    for i in {1..30}; do [[ ! -e "$OWNER" ]] && break; sleep 0.1; done
    if [[ -e "$OWNER" ]]; then
      [[ "$child" == <-> ]] && kill -KILL "$child" 2>/dev/null
      print -u2 'recorder_release_required_kill'; failed=1
    fi
  fi
  rm -f "${W:?}/continuous.f32"
  "$HOME/Library/Application Support/MagicMirror/ops/stop-state" --reset-output || failed=1
  "$HOME/Library/Application Support/MagicMirror/ops/stop-state" --output-status || failed=1
  osascript -e 'tell application "Airfoil"
    set (volume of (first speaker whose id is "com.rogueamoeba.airfoil.LocalSpeaker")) to 0
    set (volume of (first speaker whose name is "A1")) to 0
    set (volume of (first speaker whose name starts with "EDIFIER")) to 0.5
  end tell' || failed=1
  (( result != 0 )) && exit "$result"
  exit "$failed"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
osascript - "$MODE" <<'OSA'
on run argv
 tell application "Airfoil"
 set linked volume to false
 set current audio source to (first device source whose name is "Magic Mirror Capture")
 repeat with s in every speaker
  if (id of s) is "com.rogueamoeba.airfoil.LocalSpeaker" or (name of s) starts with "EDIFIER" then
   if not (connected of s) then connect to s
  end if
  if name of s is "A1" then
   if item 1 of argv is "no-a1" then
    disconnect from s
   else if not (connected of s) then
    connect to s
   end if
  end if
  if (id of s) is "com.rogueamoeba.airfoil.LocalSpeaker" or (name of s) is "A1" or (name of s) starts with "EDIFIER" then set (volume of s) to 0
 end repeat
 return {name, connected, volume} of every speaker
 end tell
end run
OSA
python3 - <<'READY'
import subprocess,time
query='tell application "Airfoil" to get connected of (first speaker whose name starts with "EDIFIER")'
start=time.monotonic(); retried=False
while time.monotonic()-start<60:
 r=subprocess.run(['osascript','-e',query],capture_output=True,text=True,timeout=5)
 if r.returncode==0 and r.stdout.strip()=='true':
  print('airplay_ready seconds='+str(round(time.monotonic()-start)),flush=True);break
 if not retried and time.monotonic()-start>30:
  subprocess.run(['osascript','-e','tell application "Airfoil" to connect to (first speaker whose name starts with "EDIFIER")'],capture_output=True,timeout=5);retried=True
 time.sleep(2)
else: raise SystemExit('airplay_not_ready_after_one_retry')
READY
osascript -e 'set volume output volume 100'
"$BIN/mmsync-play" --out "$W/bed.json" --device MagicMirrorMusic_UID --lead "$((SECONDS_TOTAL + 30))" --count 0 --bed 0.015 >/dev/null 2>&1 &
BED=$!
open -n -a "$ROOT/node_modules/electron/dist/Electron.app" --args "$SRC/record-under-electron.js" --mm-rec "$BIN/mmsync-rec" --device "$MIC" --seconds "$SECONDS_TOTAL" --out "$W/continuous"
for i in {1..50}; do [[ -e "$OWNER" ]] && break; sleep 0.2; done
[[ -e "$OWNER" ]] || { print -u2 'recorder_did_not_start'; exit 1; }
sleep "$SETTLE"
n=0
for blk in $BLOCKS; do
 n=$((n+1))
 if [[ $blk == J ]]; then target="com.rogueamoeba.airfoil.LocalSpeaker" vol=1.0; elif [[ $blk == A ]]; then target="C2-60-12-F8-D1-A5:output" vol=1.0; else target="6C1629028D58@EDIFIER M330 Ⅱ 8D58" vol=0.45; fi
 osascript - "$target" "$vol" <<'OSA' >/dev/null
on run argv
 tell application "Airfoil"
 repeat with s in every speaker
 if (id of s) is (item 1 of argv) then
  if not (connected of s) then error "target disconnected"
  set (volume of s) to ((item 2 of argv) as real)
 else if (id of s) is "com.rogueamoeba.airfoil.LocalSpeaker" or (name of s) is "A1" or (name of s) starts with "EDIFIER" then
  set (volume of s) to 0
 end if
 end repeat
 end tell
end run
OSA
 sleep 2
 print "$(date +%T) $LABEL block$n$blk started"
 "$BIN/mmsync-play" --out "$W/b$n$blk.play.json" --device MagicMirrorMusic_UID --lead 2 --count 12 --period 1 --bed 0 >/dev/null &
 PLAY=$!; wait "$PLAY"; PLAY=''
 sleep 18
done
while [[ -e "$OWNER" ]]; do sleep 0.5; done
[[ -s "$W/continuous.json" ]] || { print -u2 'recorder_failed'; exit 1; }
for p in "$W"/b*.play.json; do python3 -I "$SRC/scan.py" "$W/continuous" "$p" "$LABEL ${p:t}"; done
osascript -e 'tell application "Airfoil" to get {name, connected, volume} of every speaker'

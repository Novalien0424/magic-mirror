#!/bin/zsh
# Owner-run field checks for Raven on this Mac mini. Run them in your own Terminal
# window, not over SSH or inside an agent's tmux: macOS gives microphone access
# only to apps in your login session.
#
#   zsh deploy/macos/owner-check/owner-check.sh             screen lock off, then the wake test
#   zsh deploy/macos/owner-check/owner-check.sh screenlock  turn the login screen lock off
#   zsh deploy/macos/owner-check/owner-check.sh wake-media  audible wake-during-media test (~12 min)
#   zsh deploy/macos/owner-check/owner-check.sh boot        read-only snapshot after a power-cut test
#
# Results are metadata only, in ~/Library/Logs/MagicMirror/owner-check/.
set -euo pipefail

here=${0:A:h}
repo=${here:h:h:h}
if [[ -z ${MIRROR_ELECTRON_OWNER_TOKEN:-} ]]; then
  exec node "$repo/scripts/electron-owner.mjs" owner-check /bin/zsh "$0" "$@"
fi
target=gui/$(id -u)/com.magicmirror.launchagent
logs=$HOME/Library/Logs/MagicMirror/owner-check
stamp=$(date +%Y%m%d-%H%M%S)
mkdir -p $logs

work=$HOME/Library/Caches/MagicMirror/owner-check
out=''
restart=0

raven_running() { [[ $(launchctl print $target 2>/dev/null) == *'state = running'* ]] }
electron_running() { pgrep -f 'magic-mirror/node_modules/electron' >/dev/null }

# Runs on every exit, including Ctrl-C: stop test audio, delete it, restart Raven if the test stopped it.
cleanup() {
  pkill -f "$work/play " 2>/dev/null || true
  rm -rf $work/audio
  if [[ -n $out && -x $work/audiodev ]]; then $work/audiodev > $out/devices_after.json 2>/dev/null || true; fi
  if (( restart )); then
    restart=0
    launchctl kickstart $target && print 'Raven restarted.'
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

screenlock() {
  print '\n== Screen lock: off =='
  print 'macOS asks for your Mac login password.'
  if sysadminctl -screenLock off -password -; then
    sysadminctl -screenLock status 2>&1 | tail -1
  else
    print 'Screen lock was not changed.'
  fi
}

wake_media() {
  local src=$here/wake-media rc=0
  out=$logs/wake-media-$stamp

  print '\n== Wake during media: audible test =='
  print 'For about 12 minutes, the Jabra, the Mac mini speaker and possibly the TV play'
  print 'speech, music and tones. Raven stops for the test and restarts afterwards.'
  print 'Keep the room quiet, do not speak, and do not touch the Jabra or the volume.'
  read -r '?Press Return to start, or Ctrl-C to cancel. '

  if [[ -n ${TMUX:-} || -n ${SSH_CONNECTION:-} ]]; then
    print 'Note: tmux or SSH detected. If the microphone check fails, run this from a new Terminal window.'
  fi

  mkdir -p $work $out

  print 'Building helpers...'
  swiftc -O $src/play.swift -o $work/play
  swiftc -O $src/audiodev.swift -o $work/audiodev
  $repo/node_modules/.bin/esbuild $src/lib.ts --bundle --platform=node --format=cjs \
    --log-level=warning --outfile=$work/lib.cjs

  $work/audiodev > $out/devices_before.json
  local defaults
  defaults=$(node -e 'const d=require(process.argv[1]); console.log(d.defaultInput+"|"+d.defaultOutput)' $out/devices_before.json)
  if [[ $defaults != 'Jabra Speak2 75|Jabra Speak2 75' ]]; then
    print "ABORT: the Jabra must be the default input and output (now: $defaults)."
    return 1
  fi
  local cells=(C0 C1 C2 C3 C4 C5 C6)
  if grep -q 'T749-fHD720' $out/devices_before.json; then
    cells+=(TVPROBE C7)
  else
    print 'TV audio device not present (TV off?): the TV cells are skipped.'
  fi

  print 'Generating test audio (silent)...'
  export MM_REPO=$repo MM_WAKE_WORK=$work MM_WAKE_OUT=$out
  node $src/gen.cjs

  if raven_running; then
    restart=1
    print 'Stopping Raven...'
    launchctl kill TERM $target
  fi
  for i in {1..30}; do electron_running || break; sleep 1; done
  if electron_running; then
    print 'ABORT: Raven is still running.'
    return 1
  fi

  print "Running cells: ${cells[*]}"
  node $src/live.cjs $cells || rc=$?

  print "\nResults: $out"
  node -e '
    const fs = require("fs"), p = require("path"), dir = process.argv[1]
    for (const f of fs.readdirSync(dir).filter(f => /^cell_C\d\.json$/.test(f)).sort()) {
      const c = JSON.parse(fs.readFileSync(p.join(dir, f))), s = c.summary
      const bed = c.bed ? `${c.bed.device} ${c.bed.file} x${c.bed.gain}` : (c.mixRatioDb != null ? "mixed in file" : "none")
      console.log(`${c.cell}  wake ${s.posDetected}/${s.posTotal}  false ${s.falseWakes}/${s.negTotal}  bed: ${bed}`)
    }' $out
  print 'Send this folder path to Codex or Claude. It holds metadata only; no audio is kept.'
  return $rc
}

boot_evidence() {
  setopt local_options no_err_exit no_pipe_fail
  local f=$logs/boot-$stamp.txt
  export ADB_MDNS=0 ADB_MDNS_AUTO_CONNECT=0
  {
    print "== $(date '+%F %T')  boot: $(sysctl -n kern.boottime)"
    print '\n== Power'; pmset -g | grep -E 'autorestart|^ sleep|displaysleep'
    print '\n== Raven LaunchAgent'
    launchctl print $target 2>&1 | grep -E '^\s*(state|pid|runs|last exit code) =' | head -4
    local pid=$(launchctl print $target 2>/dev/null | awk '/^\tpid = /{print $3}')
    [[ -n $pid ]] && print "\tstarted = $(ps -o lstart= -p $pid)"
    print '\n== App log (latest start)'
    grep -E 'MAIN_READY|RENDERER_READY|MIRROR_DISPLAY|TV_PRESENCE|presence_' \
      $HOME/Library/Logs/MagicMirror/app.out.log 2>/dev/null |
      awk '/MAIN_READY/{b=""} {b=b $0 "\n"} END{printf "%s", b}'
    print '\n== BetterDisplay'; pgrep -x BetterDisplay >/dev/null && print running || print 'NOT running'
    print '\n== Karabiner button prerequisites'
    pgrep -x karabiner_grabber >/dev/null && print 'grabber running' || print 'grabber unavailable'
    systemextensionsctl list 2>/dev/null | grep -i 'Karabiner' || print 'Karabiner driver extension unavailable'
    print '\n== Displays'
    system_profiler SPDisplaysDataType 2>/dev/null | grep -E '^ {8}\S.*:$|Resolution|Rotation|Main Display'
    print '\n== Audio defaults'
    system_profiler SPAudioDataType 2>/dev/null | grep -E '^ {8}\S.*:$|Default (Input|Output) Device'
    print '\n== Network'; scutil --nwi | grep -E 'Network interfaces|address|reach' | head -6
    print '\n== TV (ADB)'
    adb -P 5038 connect 192.168.77.2:5555 2>&1 | head -1
    adb -P 5038 -s 192.168.77.2:5555 shell 'echo boot_count=$(settings get global boot_count);
      dumpsys power 2>/dev/null | grep -m1 mWakefulness=;
      dumpsys activity activities 2>/dev/null | grep -m1 mResumedActivity' 2>&1 | sed 's/^ *//'
  } 2>&1 | tee $f
  print "\nSaved: $f"
}

case ${1:-all} in
  screenlock) screenlock ;;
  wake-media) wake_media ;;
  boot) boot_evidence ;;
  all) screenlock; wake_media ;;
  *) print "usage: zsh ${0:t} [screenlock|wake-media|boot|all]"; exit 2 ;;
esac

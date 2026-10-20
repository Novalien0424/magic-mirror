#!/bin/zsh
set -eu
zmodload zsh/system
root=$HOME/Library/Caches/MagicMirror/button
mkdir -p "$root"
: >> "$root/queue.lock"
# The kernel releases this mutex after a crash or reboot.
zsystem flock -t 0 -f button_lock "$root/queue.lock" || exit 0
MIRROR_BUTTON_WORKER_LOCK=1 /opt/homebrew/bin/node /Users/novalien0424/magic-mirror/scripts/raven-button.mjs --worker || true
zsystem flock -u "$button_lock"
# Cover an enqueue between the last queue read and releasing the mutex.
pending=("$root"/queue/*.json(N))
if (( ${#pending} )); then
  /opt/homebrew/bin/node /Users/novalien0424/magic-mirror/scripts/raven-button.mjs --wake
fi

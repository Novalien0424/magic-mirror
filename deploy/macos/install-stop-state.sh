#!/bin/zsh
# User-owned native STOP helper. No LaunchAgent or permission changes.
set -euo pipefail
task_source=${0:A:h}
task_ops="$HOME/Library/Application Support/MagicMirror/ops"
mkdir -p "$task_ops"
task_stage=$(mktemp -d "$task_ops/.stop-state.XXXXXX")
trap 'rm -rf -- "$task_stage"' EXIT
/usr/bin/swiftc -O "$task_source/stop-state.swift" -o "$task_stage/stop-state"
/usr/bin/codesign --force --sign - "$task_stage/stop-state"
/usr/bin/codesign --verify --strict "$task_stage/stop-state"
mv "$task_stage/stop-state" "$task_ops/stop-state"
print 'stop_state_installed'

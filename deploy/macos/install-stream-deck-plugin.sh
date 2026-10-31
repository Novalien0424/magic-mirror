#!/bin/zsh
# Install the Magic Mirror Controls Stream Deck plugin (Music page folder keys titled with
# the MusicLoop subfolders) and restart Stream Deck so it loads. Replaces only
# com.magicmirror.controls.sdPlugin; never edits Stream Deck's profiles. Run as the operator.
set -euo pipefail
src=${0:A:h}/stream-deck-plugin
plugins="$HOME/Library/Application Support/com.elgato.StreamDeck/Plugins"
dest="$plugins/com.magicmirror.controls.sdPlugin"
[[ -d "$plugins" ]] || { print -u2 'Stream Deck plugin folder is missing'; exit 1; }
stage=$(mktemp -d "$plugins/.magicmirror.XXXXXX")
trap 'rm -rf -- "$stage"' EXIT
bundle="$stage/com.magicmirror.controls.sdPlugin"
mkdir -p "$bundle/Images"
/usr/bin/swiftc -O "$src/magic-mirror-deck.swift" -o "$bundle/magic-mirror-deck"
/usr/bin/codesign --force --sign - "$bundle/magic-mirror-deck"
/usr/bin/python3 -m json.tool "$src/manifest.json" > /dev/null
cp "$src/manifest.json" "$bundle/"
cp "$src/Images/folder.svg" "$bundle/Images/"
# Stream Deck loads plugins at launch: quit it, swap the folder, start it again.
/usr/bin/osascript -e 'tell application id "com.elgato.StreamDeck" to quit' >/dev/null 2>&1 || true
for _ in {1..40}; do pgrep -x 'Stream Deck' >/dev/null || break; sleep 0.25; done
rm -rf -- "$dest"
mv "$bundle" "$dest"
/usr/bin/open -b com.elgato.StreamDeck
print 'STREAM_DECK_PLUGIN_INSTALLED'

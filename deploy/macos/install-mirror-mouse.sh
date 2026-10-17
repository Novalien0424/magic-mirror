#!/bin/zsh
# Install the tested normal-user USB client and one-device board server.
# This does not install VirtualHere's paid client service or change Mac security.
set -euo pipefail
[[ $(uname -s) == Darwin ]] || exit 1
script_dir=${0:A:h}
support="$HOME/Library/Application Support/MagicMirror/mouse"
client=/Applications/VirtualHereUniversal.app
adb='/Library/Application Support/MagicMirror/adb'
export ADB_MDNS=0 ADB_MDNS_AUTO_CONNECT=0
board=("$adb" -H 127.0.0.1 -P 5038 -s 192.168.77.2:5555)
if /bin/ps -axo comm= | /usr/bin/grep -q '/VirtualHereUniversal\.app/Contents/MacOS/VirtualHereUniversal$'; then
  print -u2 'MOUSE_INSTALL_CLIENT_RUNNING: exit VirtualHere before updating it'; exit 1
fi
work=$(mktemp -d "${TMPDIR:-/tmp}/mm-mouse-install.XXXXXX")
stage="/data/local/tmp/mm-mouse-install-$$"
mounted=0
cleanup() {
  (( ! mounted )) || /usr/bin/hdiutil detach "$work/mount" >/dev/null
  "${board[@]}" shell rm -rf "$stage" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT
curl --fail --location --max-time 60 --silent --show-error \
  https://www.virtualhere.com/sites/default/files/usbserver/vhusbdarm64 -o "$work/vhusbdarm64"
curl --fail --location --max-time 60 --silent --show-error \
  https://www.virtualhere.com/sites/default/files/usbclient/VirtualHereUniversal.dmg -o "$work/client.dmg"
[[ $(shasum -a 256 "$work/vhusbdarm64" | cut -d ' ' -f 1) == 09deced5586ed37b8b3db7a6187d84029f65d487c3c2b24a949b993b3d582077 ]] || { print -u2 MOUSE_SERVER_VERSION_CHANGED; exit 1; }
[[ $(shasum -a 256 "$work/client.dmg" | cut -d ' ' -f 1) == edfbba188187711a3707929aefff68a9b0c260224f28831d1103aa4c325aa437 ]] || { print -u2 MOUSE_CLIENT_VERSION_CHANGED; exit 1; }
mkdir "$work/mount"
/usr/bin/hdiutil attach -readonly -nobrowse -mountpoint "$work/mount" "$work/client.dmg" >/dev/null
mounted=1
source_app="$work/mount/VirtualHereUniversal.app"
/usr/bin/codesign --verify --deep --strict "$source_app"
/usr/sbin/spctl --assess --type execute "$source_app"
[[ $(/usr/bin/codesign -dv "$source_app" 2>&1 | sed -n 's/^TeamIdentifier=//p') == N8C8ZTN347 ]] || exit 1
/usr/bin/ditto "$source_app" "$client"
mkdir -p "$support"
chmod 700 "$support"
/usr/bin/swiftc -O "$script_dir/mirror-cursor.swift" -o "$support/mirror-cursor"
/usr/bin/codesign --force --sign - "$support/mirror-cursor"

"${board[@]}" shell mkdir -m 700 "$stage"
"${board[@]}" push "$work/vhusbdarm64" "$stage/vhusbdarm64" >/dev/null
"${board[@]}" push "$script_dir/board-mouse-control.sh" "$stage/control.sh" >/dev/null
"${board[@]}" push "$script_dir/board-mouse.ini" "$stage/config.ini" >/dev/null
if "${board[@]}" shell su 0 test -f /data/local/tmp/mm-mouse/control.sh; then
  "${board[@]}" shell su 0 sh /data/local/tmp/mm-mouse/control.sh stop
fi
"${board[@]}" shell su 0 mkdir -p /data/local/tmp/mm-mouse
"${board[@]}" shell su 0 chmod 700 /data/local/tmp/mm-mouse
for name in vhusbdarm64 control.sh config.ini; do
  "${board[@]}" shell su 0 cp "$stage/$name" "/data/local/tmp/mm-mouse/$name"
done
"${board[@]}" shell su 0 chmod 700 /data/local/tmp/mm-mouse/vhusbdarm64 /data/local/tmp/mm-mouse/control.sh
"${board[@]}" shell su 0 chmod 600 /data/local/tmp/mm-mouse/config.ini
print 'MOUSE_INSTALLED client=6.0.3 server=4.8.8 receiver=2717:50d1; press CONSOLE to connect'

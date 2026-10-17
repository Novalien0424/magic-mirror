#!/bin/zsh
# Install four quiet LaunchServices entry points for Stream Deck's built-in Open action.
set -eu
umask 077

repo=/Users/novalien0424/magic-mirror
controls="$HOME/Applications/Magic Mirror Controls"
[[ "$(uname -s)" == Darwin ]] || { print -u2 'macOS is required'; exit 1; }
[[ -x /opt/homebrew/bin/node ]] || { print -u2 'Node is missing'; exit 1; }
for action in start stop loop console; do
  [[ -x "$repo/deploy/macos/magic-mirror-$action.sh" ]] || { print -u2 "Missing executable $action script"; exit 1; }
done
mkdir -p "$controls"
stage=$(mktemp -d "$controls/.install.XXXXXX")
trap 'rm -rf -- "$stage"' EXIT

for action in start stop loop console; do
  case "$action" in
    start) label='Start Magic Mirror' ;;
    stop) label='Stop Magic Mirror' ;;
    loop) label='Play Loop Magic Mirror' ;;
    console) label='Console Magic Mirror' ;;
  esac
  bundle="$stage/$label.app"
  destination="$controls/$label.app"
  identifier="com.magicmirror.control.$action"
  # Only replace an app previously installed by this script.
  if [[ -e "$destination" ]]; then
    existing=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$destination/Contents/Info.plist" 2>/dev/null || true)
    [[ "$existing" == "$identifier" ]] || { print -u2 "Refusing to replace unrelated app: $destination"; exit 1; }
  fi
  /usr/bin/osacompile -o "$bundle" -e "do shell script \"/bin/zsh $repo/deploy/macos/magic-mirror-$action.sh\""
  /usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string $identifier" "$bundle/Contents/Info.plist"
  /usr/libexec/PlistBuddy -c 'Add :LSUIElement bool true' "$bundle/Contents/Info.plist"
  /usr/bin/codesign --force --sign - "$bundle"
  /usr/bin/codesign --verify --strict "$bundle"
  if [[ -e "$destination" ]]; then mv "$destination" "$stage/previous-$action.app"; fi
  if ! mv "$bundle" "$destination"; then
    [[ ! -e "$stage/previous-$action.app" ]] || mv "$stage/previous-$action.app" "$destination"
    exit 1
  fi
  print "$destination"
done
/usr/bin/python3 "$repo/scripts/prepare-stream-deck-profile.py" "$controls"

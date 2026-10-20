#!/bin/zsh
# Install the Remote Console app on the Desktop for remote desktop checks. It is not
# a Stream Deck key and leaves the five control apps and the profile alone.
set -eu
umask 077

repo=/Users/novalien0424/magic-mirror
script="$repo/deploy/macos/magic-mirror-remote-console.sh"
label='Remote Console Magic Mirror'
destination="$HOME/Desktop/$label.app"
identifier=com.magicmirror.control.remote-console
[[ "$(uname -s)" == Darwin ]] || { print -u2 'macOS is required'; exit 1; }
[[ -x /opt/homebrew/bin/node ]] || { print -u2 'Node is missing'; exit 1; }
[[ -x "$script" ]] || { print -u2 'Missing executable remote console script'; exit 1; }
# Only replace an app previously installed by this script.
if [[ -e "$destination" ]]; then
  existing=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$destination/Contents/Info.plist" 2>/dev/null || true)
  [[ "$existing" == "$identifier" ]] || { print -u2 "Refusing to replace unrelated app: $destination"; exit 1; }
fi
stage=$(mktemp -d "${TMPDIR:-/tmp}/remote-console.XXXXXX")
trap 'rm -rf -- "$stage"' EXIT

bundle="$stage/$label.app"
# A failure (app not running, no answer) is shown on the remote screen, not as a sound
# at the venue.
/usr/bin/osacompile -o "$bundle" \
  -e 'try' \
  -e "  do shell script \"/bin/zsh $script\"" \
  -e 'on error errorText' \
  -e '  activate' \
  -e '  display alert "Remote Console" message errorText as warning' \
  -e 'end try'
/usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string $identifier" "$bundle/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Add :LSUIElement bool true' "$bundle/Contents/Info.plist"
/usr/bin/codesign --force --sign - "$bundle"
/usr/bin/codesign --verify --strict "$bundle"
if [[ -e "$destination" ]]; then mv "$destination" "$stage/previous.app"; fi
if ! mv "$bundle" "$destination"; then
  [[ ! -e "$stage/previous.app" ]] || mv "$stage/previous.app" "$destination"
  exit 1
fi
print "$destination"

#!/bin/zsh
# Remote desktop only: show the Console on the main (virtual) display beside the
# avatar on the TV. It never starts the app or changes the TV, mouse, mirror mode
# or sound; the Neo CONSOLE key still opens the Console over the avatar.
set -u
if ! /bin/launchctl print "gui/$(/usr/bin/id -u)/com.magicmirror.launchagent" 2>/dev/null \
  | /usr/bin/grep -Eq '^[[:space:]]*pid = [0-9]+'; then
  print -u2 'Magic Mirror is not running. Start it with START or INTERACTIVE STUDIO, then try again.'
  exit 1
fi
if ! /opt/homebrew/bin/node /Users/novalien0424/magic-mirror/scripts/operator-command.mjs show_console_main >/dev/null 2>&1; then
  print -u2 'Magic Mirror did not open the Console. Try again in a moment; app.out.log in ~/Library/Logs/MagicMirror has the reason.'
  exit 1
fi

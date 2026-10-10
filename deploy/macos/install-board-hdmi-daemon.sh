#!/bin/zsh
# The obsolete Wi-Fi/rotation watchdog must stay disabled and unloaded.
export PATH=/usr/bin:/bin:/usr/sbin:/sbin
print -u2 -r -- 'BOARD_KEEPALIVE_INSTALL_REJECTED reason=legacy_watchdog_retired'
exit 1

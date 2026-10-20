#!/system/bin/sh
# Invoked through the existing trusted ADB connection, with the board's existing su.
# Only the installed Xiaomi receiver is shared; no Android setting is changed.
set -eu
PATH=/system/bin:/system/xbin
base=/data/local/tmp/mm-mouse
binary=$base/vhusbdarm64

owned_pids() {
  for pid in $(pidof vhusbdarm64 2>/dev/null || true); do
    first=$(tr '\000' '\n' < "/proc/$pid/cmdline" 2>/dev/null | head -n 1) || continue
    [ "$first" != "$binary" ] || echo "$pid"
  done
}

firewall() {
  iptables "$1" INPUT ${2:+$2} -p tcp --dport 7575 ! -s 192.168.77.1 \
    -m comment --comment mm-mouse-usb -j REJECT
}

stop_server() {
  for pid in $(owned_pids); do kill "$pid" 2>/dev/null || true; done
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    [ -n "$(owned_pids)" ] || break
    sleep 0.1
  done
  for pid in $(owned_pids); do kill -9 "$pid" 2>/dev/null || true; done
  for attempt in 1 2 3 4 5; do
    [ -n "$(owned_pids)" ] || break
    sleep 0.1
  done
  if [ -n "$(owned_pids)" ]; then echo mouse_server_stop_failed; return 1; fi
  if firewall -C 2>/dev/null; then firewall -D; fi
}

case "${1:-}" in
  start)
    [ -x "$binary" ] && [ -r "$base/config.ini" ] || { echo mouse_server_not_installed; exit 1; }
    if [ -n "$(owned_pids)" ]; then
      firewall -C 2>/dev/null || firewall -I 1
      echo mouse_server_running
      exit 0
    fi
    if ss -lnt | grep -q ':7575 '; then echo mouse_server_port_in_use; exit 1; fi
    firewall -C 2>/dev/null || firewall -I 1
    # Server metadata only; never log USB reports, button events, or keystrokes.
    if [ -f "$base/server.log" ] && [ "$(wc -c < "$base/server.log")" -gt 65536 ]; then
      mv "$base/server.log" "$base/server.log.1"
    fi
    if ! "$binary" -b -c "$base/config.ini" -r "$base/server.log" >/dev/null 2>&1; then
      stop_server
      echo mouse_server_start_failed
      exit 1
    fi
    for attempt in 1 2 3 4 5 6 7 8 9 10; do
      if [ -n "$(owned_pids)" ] && ss -lnt | grep -q ':7575 '; then
        echo mouse_server_started
        exit 0
      fi
      sleep 0.1
    done
    stop_server
    echo mouse_server_start_timeout
    exit 1
    ;;
  stop)
    stop_server
    echo mouse_server_stopped
    ;;
  *) echo mouse_action_invalid; exit 2 ;;
esac

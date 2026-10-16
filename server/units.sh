#!/bin/bash
# BF2 Round Replay: put this repository's systemd units, update.sh and the Caddy config in place (only what changed), and the daily
# download time from /etc/bf2replay.conf (BF2R_FETCH_AT=HH:MM) as a drop-in for bf2replay-fetch.timer.
# Run as root by install.sh and, every minute, by update.sh: a unit changed in GitHub, or a new BF2R_FETCH_AT,
# takes effect without running install.sh again.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
LIB=/usr/local/lib/bf2replay
reload=0 timers=()

for f in "$HERE"/systemd/bf2replay-*; do
  dst=/etc/systemd/system/$(basename "$f")
  if ! cmp -s "$f" "$dst"; then
    install -m 644 "$f" "$dst"; reload=1; echo "unit updated: $(basename "$f")"
    case $f in *.timer) timers+=("$(basename "$f")") ;; esac
  fi
done

# the download time: BF2R_FETCH_AT=HH:MM (by the server's clock); empty = the timer's own 05:30
at=$({ sed -n 's/^BF2R_FETCH_AT="\{0,1\}\([^"#]*\)"\{0,1\}\s*$/\1/p' /etc/bf2replay.conf 2>/dev/null || true; } | tail -1 | tr -d ' ')
drop=/etc/systemd/system/bf2replay-fetch.timer.d/time.conf want=
if [ -n "$at" ]; then
  if [[ $at =~ ^([01]?[0-9]|2[0-3]):[0-5][0-9]$ ]]; then want=$(printf '[Timer]\nOnCalendar=\nOnCalendar=*-*-* %s:00\n' "$at")
  else echo "BF2R_FETCH_AT=$at is not HH:MM (e.g. 05:30): the timer keeps its own time"; fi
fi
if [ -n "$want" ] && [ "$want" != "$(cat "$drop" 2>/dev/null)" ]; then
  install -d -m 755 "$(dirname "$drop")"; printf '%s\n' "$want" > "$drop"; reload=1; timers+=(bf2replay-fetch.timer); echo "demos downloaded daily at $at"
elif [ -z "$want" ] && [ -f "$drop" ]; then
  rm -f "$drop"; reload=1; timers+=(bf2replay-fetch.timer); echo "demos downloaded daily at the timer's own time"
fi

# update.sh itself (a new file, renamed in place: the copy that is running now keeps reading the old one)
install -d -m 755 "$LIB"
if ! cmp -s "$HERE/update.sh" "$LIB/update.sh"; then
  install -m 755 "$HERE/update.sh" "$LIB/update.sh.new" && mv -f "$LIB/update.sh.new" "$LIB/update.sh"; echo "update.sh updated"
fi

# the site's Caddy config (only where install.sh set Caddy up): Caddyfile.in with the domain from /etc/bf2replay.conf;
# a new one that doesn't validate is not used
CF=/etc/caddy/bf2replay.caddy
if [ -f "$CF" ] && command -v caddy >/dev/null 2>&1; then
  dom=$({ sed -n 's/^BF2R_DOMAIN="\{0,1\}\([^"#]*\)"\{0,1\}\s*$/\1/p' /etc/bf2replay.conf 2>/dev/null || true; } | tail -1 | tr -d ' ')
  tmp=$(mktemp)
  sed "s|__SITE__|${dom:-:80}|" "$HERE/Caddyfile.in" > "$tmp"
  if ! cmp -s "$tmp" "$CF"; then
    cp "$CF" "$CF.bak"; install -m 644 "$tmp" "$CF"
    if caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 && systemctl reload caddy; then echo "web server config updated"
    else cp "$CF.bak" "$CF"; echo "the new web server config was not taken (caddy validate failed): the old one stays"; fi
  fi
  rm -f "$tmp"
fi

if [ "$reload" = 1 ]; then
  systemctl daemon-reload
  systemctl enable --quiet bf2replay-ingest.path bf2replay-ingest.timer bf2replay-update.timer bf2replay-fetch.timer
  # (a timer restarted after a change runs on its new schedule; units.sh is called from bf2replay-update.service, so
  # that one is never restarted from here: its new timer is picked up by the daemon-reload)
  for t in $(printf '%s\n' "${timers[@]}" | sort -u); do [ "$t" = bf2replay-update.timer ] || systemctl restart "$t"; done
  systemctl start bf2replay-ingest.path bf2replay-ingest.timer bf2replay-update.timer bf2replay-fetch.timer
fi

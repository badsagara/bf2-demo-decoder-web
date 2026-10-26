#!/bin/bash
# BF2 Round Replay: put this repository's systemd units, update.sh and the Caddy config in place (only what changed).
# (How often to look for new demos: fetch.mjs itself since v210 - each page its own on the admin page, else
# BF2R_FETCH_EVERY=minutes, 0 = once a day at BF2R_FETCH_AT=HH:MM; the timer runs every minute.)
# Run as root by install.sh and, every minute, by update.sh: a unit changed in GitHub, or a new BF2R_FETCH_AT,
# takes effect without running install.sh again.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
LIB=/usr/local/lib/bf2replay
reload=0 timers=()

admin=0
for f in "$HERE"/systemd/bf2replay-*; do
  dst=/etc/systemd/system/$(basename "$f")
  if ! cmp -s "$f" "$dst"; then
    install -m 644 "$f" "$dst"; reload=1; echo "unit updated: $(basename "$f")"
    case $f in *.timer) timers+=("$(basename "$f")") ;; *bf2replay-admin.service) admin=1 ;; esac
  fi
done

# the admin page (bf2replay-admin.service, as bf2replay) may start these services through sudo, and stop the decoding
# ones (v163: ingest, reprocess, rebuild), nothing else:
# /etc/sudoers.d/bf2replay-admin (checked with visudo before it is put in place)
if [ -x /usr/bin/systemctl ]; then SC=/usr/bin/systemctl; else SC=/bin/systemctl; fi
SU=/etc/sudoers.d/bf2replay-admin
want=$(printf '# BF2 Round Replay: the admin page (bf2replay-admin.service) may start these services and stop the decoding ones, nothing else (written by units.sh)\nbf2replay ALL=(root) NOPASSWD:'
  sep=' '; for u in ingest reprocess rebuild fetch update backup hints; do printf '%s%s start --no-block bf2replay-%s.service' "$sep" "$SC" "$u"; sep=', '; done
  for u in ingest reprocess rebuild; do printf '%s%s stop --no-block bf2replay-%s.service' "$sep" "$SC" "$u"; done)
if [ -d /etc/sudoers.d ] && command -v visudo >/dev/null 2>&1 && [ "$want" != "$(cat "$SU" 2>/dev/null)" ]; then
  tmp=$(mktemp); printf '%s\n' "$want" > "$tmp"
  if visudo -cf "$tmp" >/dev/null 2>&1; then install -m 440 -o root -g root "$tmp" "$SU"; echo "admin page: may start the services (sudoers)"
  else echo "admin page: the sudoers rule did not check out: not put in place"; fi
  rm -f "$tmp"
fi

# how often to look for new demos: (v210) the timer runs every minute and fetch.mjs reads each page at its own time (the
# admin page; else BF2R_FETCH_EVERY / BF2R_FETCH_AT, read by fetch.mjs itself) - the drop-in of before (the timer's own
# time from BF2R_FETCH_EVERY) goes
drop=/etc/systemd/system/bf2replay-fetch.timer.d/time.conf
if [ -f "$drop" ]; then
  rm -f "$drop"; rmdir "$(dirname "$drop")" 2>/dev/null || true; reload=1; timers+=(bf2replay-fetch.timer)
  echo "the demo pages: the timer every minute now, each page at its own time (the admin page; BF2R_FETCH_EVERY for the rest)"
fi

# update.sh itself (a new file, renamed in place: the copy that is running now keeps reading the old one)
install -d -m 755 "$LIB"
if ! cmp -s "$HERE/update.sh" "$LIB/update.sh"; then
  install -m 755 "$HERE/update.sh" "$LIB/update.sh.new" && mv -f "$LIB/update.sh.new" "$LIB/update.sh"; echo "update.sh updated"
fi

# the status command: bf2replay-status (the site's version, how far decoding again is, the services, the last log lines)
if ! cmp -s "$HERE/status.sh" /usr/local/bin/bf2replay-status 2>/dev/null; then
  install -m 755 "$HERE/status.sh" /usr/local/bin/bf2replay-status; echo "bf2replay-status updated"
fi

# the site's Caddy config (only where install.sh / caddy-attach.sh set Caddy up): Caddyfile.in with the domain from
# /etc/bf2replay.conf. A new one is checked with the whole config Caddy runs (BF2R_CADDYFILE, default
# /etc/caddy/Caddyfile, other sites included; with the service's own environment - caddylib.sh, v245) and is not used
# if Caddy wouldn't take it; Caddy is reloaded (not restarted), only if it runs
CF=/etc/caddy/bf2replay.caddy
if [ -f "$CF" ] && command -v caddy >/dev/null 2>&1; then
  cval() { { sed -n "s/^$1=\"\{0,1\}\([^\"#]*\)\"\{0,1\}\s*\$/\1/p" /etc/bf2replay.conf 2>/dev/null || true; } | tail -1 | tr -d ' '; }
  dom=$(cval BF2R_DOMAIN); MAIN=$(cval BF2R_CADDYFILE); MAIN=${MAIN:-/etc/caddy/Caddyfile}
  # shellcheck disable=SC2034  # (read by caddylib.sh)
  BF2R_CADDY_UNIT=$(cval BF2R_CADDY_UNIT)
  # shellcheck source=caddylib.sh
  . "$HERE/caddylib.sh"
  tmp=$(mktemp)
  sed "s|__SITE__|${dom:-:80}|" "$HERE/Caddyfile.in" > "$tmp"
  if ! cmp -s "$tmp" "$CF"; then
    exec 9>"$CADDY_LOCK"
    if flock -w 60 9; then
      cp -p "$CF" "$CF.bak"; install -m 644 "$tmp" "$CF"
      if caddy_run validate --config "$MAIN" --adapter caddyfile >/dev/null 2>&1 &&
         { ! systemctl is-active --quiet "$CADDY_UNIT" || caddy_reload "$MAIN"; }; then echo "web server config updated"
      else cp -p "$CF.bak" "$CF"; echo "the new web server config was not taken (Caddy refused it): the old one stays"; fi
      flock -u 9
    else echo "web server config: another change of Caddy's files is running (caddy-attach.sh) - next time"; fi
  fi
  rm -f "$tmp"
fi

if [ "$reload" = 1 ]; then
  systemctl daemon-reload
  systemctl enable --quiet bf2replay-ingest.path bf2replay-ingest.timer bf2replay-update.timer bf2replay-fetch.timer bf2replay-backup.timer bf2replay-hints.timer bf2replay-digest.timer bf2replay-admin.service
  # (a timer restarted after a change runs on its new schedule; units.sh is called from bf2replay-update.service, so
  # that one is never restarted from here: its new timer is picked up by the daemon-reload)
  for t in $(printf '%s\n' "${timers[@]}" | sort -u); do [ "$t" = bf2replay-update.timer ] || systemctl restart "$t"; done
  systemctl start bf2replay-ingest.path bf2replay-ingest.timer bf2replay-update.timer bf2replay-fetch.timer bf2replay-backup.timer bf2replay-hints.timer bf2replay-digest.timer
  # (the admin page: started, or restarted when its unit changed; a new admin.mjs restarts itself)
  if [ "$admin" = 1 ]; then systemctl restart bf2replay-admin.service; else systemctl start bf2replay-admin.service; fi
fi

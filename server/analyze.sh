#!/bin/bash
# BF2 Round Replay: the analysis of many rounds (server/analyze.mjs, v175; todo 146) - one command on the VPS:
#   sudo bash /srv/bf2replay/repo/server/analyze.sh start    the first time installs Playwright and its Chromium (a few
#                                                             minutes, ~400 MB in /srv/bf2replay/analyze), then runs
#                                                             analyze.mjs in the background (systemd unit
#                                                             bf2replay-analyze: low priority, survives logging out);
#                                                             started again, it goes on from where it stopped
#   sudo bash .../analyze.sh status                           how far it is; when it is done, the archive and how to
#                                                             copy it to the Mac
#   sudo bash .../analyze.sh stop                             stops after the rounds being done
#   sudo bash .../analyze.sh pack                             the archive of what is done so far
# Anything after "start" goes to analyze.mjs: --jobs 2, --limit 500, --maps strike_at_karkand, --min-players 6,
# --since 2026-10-01, --fresh (see the top of analyze.mjs).
set -euo pipefail
cv() { { sed -n "s/^$1=\"\{0,1\}\([^\"#]*\)\"\{0,1\}\s*$/\1/p" /etc/bf2replay.conf 2>/dev/null || true; } | tail -1 | tr -d ' '; }
ROOT=$(cv BF2R_ROOT); ROOT=${ROOT:-/srv/bf2replay}
DIR=$ROOT/analyze OUT=$ROOT/analysis UNIT=bf2replay-analyze PW=1.63.0
NODE=$(command -v node || echo /usr/bin/node)
[ "$(id -u)" = 0 ] || { echo "run it with sudo: sudo bash $0 ${1:-start}"; exit 1; }
setup() {
  if [ -f "$DIR/node_modules/playwright/package.json" ] && ls -d "$DIR"/browsers/chromium* >/dev/null 2>&1; then return; fi
  echo "Installing Playwright $PW and its Chromium into $DIR (once: a few minutes, ~400 MB)"
  install -d -o bf2replay -g bf2replay "$DIR"
  cd "$DIR"; [ -f package.json ] || echo '{ "private": true }' > package.json
  npm install --no-audit --no-fund --loglevel=error "playwright@$PW"
  PLAYWRIGHT_BROWSERS_PATH="$DIR/browsers" npx --yes playwright install --with-deps chromium
  chown -R bf2replay:bf2replay "$DIR"
}
count() { ls "$OUT/rounds" 2>/dev/null | grep -c '\.json\.gz$' || true; }
case "${1:-start}" in
  start)
    shift || true; setup; install -d -o bf2replay -g bf2replay "$OUT"
    if systemctl is-active --quiet "$UNIT"; then echo "Already running. How far: sudo bash $0 status"; exit 0; fi
    systemctl reset-failed "$UNIT" 2>/dev/null || true
    systemd-run --quiet --unit="$UNIT" --description="BF2 Round Replay: analysis of many rounds" --uid=bf2replay --gid=bf2replay \
      --nice=15 -p IOSchedulingClass=idle -p CPUWeight=20 -p MemoryMax=80% -p KillMode=mixed -p TimeoutStopSec=600 \
      -E BF2R_ROOT="$ROOT" --working-directory="$DIR" "$NODE" "$ROOT/repo/server/analyze.mjs" "$@"
    sleep 5; journalctl -u "$UNIT" -n 5 -o cat --no-pager || true
    echo; echo "Started in the background (it goes on after you log out). How far: sudo bash $0 status" ;;
  status)
    if systemctl is-active --quiet "$UNIT"; then echo "Running - $(count) rounds done so far:"; else echo "Not running - $(count) rounds done:"; fi
    journalctl -u "$UNIT" -n 12 -o cat --no-pager 2>/dev/null || true
    t=$(ls -t "$OUT"/bf2-analysis-*.tar 2>/dev/null | head -1 || true)
    if [ -n "$t" ] && ! systemctl is-active --quiet "$UNIT"; then
      echo; echo "Archive: $t ($(du -h "$t" | cut -f1)). To the Mac (in Terminal there):"
      echo "  scp 'root@$(hostname -I 2>/dev/null | awk '{print $1}'):$t' ~/Downloads/"
    fi ;;
  stop) systemctl stop "$UNIT" && echo "Stopped (the rounds being done were finished first). Again from there: sudo bash $0 start" ;;
  pack) install -d -o bf2replay -g bf2replay "$OUT"; sudo -u bf2replay env BF2R_ROOT="$ROOT" "$NODE" "$ROOT/repo/server/analyze.mjs" --pack ;;
  *) sed -n '2,15p' "$0"; exit 1 ;;
esac

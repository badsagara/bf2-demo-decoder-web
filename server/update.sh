#!/bin/bash
# BF2 Round Replay: pull the repository; when it changed, publish its site/ folder. Then decode again any round made by an
# older decoder (ingest.mjs --reprocess: nothing to do when the decoder did not change). Run by bf2replay-update.timer.
set -euo pipefail
: "${BF2R_ROOT:=/srv/bf2replay}" "${BF2R_BRANCH:=main}"
cd "$BF2R_ROOT/repo"
git fetch --quiet origin "$BF2R_BRANCH"
new=$(git rev-parse "origin/$BF2R_BRANCH")
if [ "$new" != "$(git rev-parse HEAD)" ] || [ ! -f "$BF2R_ROOT/site/index.html" ]; then
  git reset --quiet --hard "$new"
  # (all changed files are put in place together at the end)
  rsync -a --delete --delay-updates "$BF2R_ROOT/repo/site/" "$BF2R_ROOT/site/"
  echo "site updated to $(git log -1 --format='%h %s')"
fi
exec /usr/bin/flock -w 7200 "$BF2R_ROOT/data/.ingest.lock" /usr/bin/node "$BF2R_ROOT/repo/server/ingest.mjs" --reprocess

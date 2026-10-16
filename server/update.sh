#!/bin/bash
# BF2 Round Replay: pull the repository; when it changed, publish its site/ folder. Then have any round made by an
# older decoder decoded again (bf2replay-reprocess.service: ingest.mjs --reprocess, nothing to do when the decoder did
# not change) - on its own, so this is over in seconds and the next look at GitHub comes a minute later even while that
# runs (after a decoder change it can take an hour). Run by bf2replay-update.timer (every minute), as root.
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
# the systemd units and this script from the repository, and the daily download time (BF2R_FETCH_AT) from
# /etc/bf2replay.conf: only what changed is put in place
bash "$BF2R_ROOT/repo/server/units.sh" || echo "units.sh failed: the units stay as they were"
# (git runs as root, with the deploy key the repository names in core.sshCommand; the decoding runs as bf2replay; a
# start while it is still running from the last time does nothing - it comes round again a minute later)
systemctl start --no-block bf2replay-reprocess.service || echo "bf2replay-reprocess.service could not be started"

#!/bin/bash
# BF2 Round Replay: start the site's rounds over - download again every demo the demo pages (BF2R_FETCH_URLS) still
# list and decode it from scratch. Three steps, run as root on the VPS:
#
#   sudo bash /srv/bf2replay/repo/server/redownload.sh             1. look only (changes nothing): how many demos the
#                                                                     pages list, how much that is, how much room there is,
#                                                                     and which rounds on the site the pages no longer list
#                                                                     (those would be lost: data/redownload-lost.txt)
#   sudo bash /srv/bf2replay/repo/server/redownload.sh --go        2. stop downloading and decoding, move the demos and
#                                                                     the decoded rounds aside (data/old-<date>), start
#                                                                     again: everything is downloaded and decoded anew
#                                                                     (refused while step 1 finds rounds that would be
#                                                                     lost - add --lose-them to go on anyway)
#   sudo bash /srv/bf2replay/repo/server/redownload.sh --drop-old  3. once the site looks right: delete data/old-*
#
# Kept as they are: data/logs (the round logger's files), /etc/bf2replay.conf. Shared links (/r/<round>) keep working for
# every round that comes back, as a round's address is its demo's name.
set -euo pipefail
: "${BF2R_ROOT:=/srv/bf2replay}"
DATA="$BF2R_ROOT/data" FETCH="$BF2R_ROOT/repo/server/fetch.mjs"
MOVE=(demos rounds rounds.json .rounds-full.json heat .kills stats .stats.json share www empty bad reprocess.json .fetched.json .fetch-last.json)
UNITS_T=(bf2replay-update.timer bf2replay-fetch.timer bf2replay-ingest.path bf2replay-ingest.timer)
UNITS_S=(bf2replay-fetch.service bf2replay-ingest.service bf2replay-reprocess.service)
[ "$(id -u)" = 0 ] || { echo "run it as root: sudo bash $0 $*"; exit 1; }
mode=check; lose=0
for a in "$@"; do case $a in --go) mode=go ;; --drop-old) mode=drop ;; --lose-them) lose=1 ;; -h|--help) sed -n '2,19p' "$0"; exit 0 ;; *) echo "unknown option: $a"; exit 1 ;; esac; done

if [ "$mode" = drop ]; then
  shopt -s nullglob; old=("$DATA"/old-*); [ ${#old[@]} -gt 0 ] || { echo "nothing to delete: no $DATA/old-*"; exit 0; }
  du -sh "${old[@]}"; read -r -p "delete these for good? [y/N] " ok; [ "$ok" = y ] || [ "$ok" = Y ] || { echo "kept"; exit 0; }
  rm -rf -- "${old[@]}"; echo "deleted"; df -h "$DATA" | tail -1; exit 0
fi

# 1. what the pages list now (with an empty list of what was downloaded: in a scratch folder, so nothing is touched)
T=$(sudo -u bf2replay mktemp -d)
echo "asking the demo pages what they list (one request per demo: a few minutes for thousands)..."
# shellcheck disable=SC2024  # (root writes the scratch file: fine)
sudo -u bf2replay env BF2R_ROOT="$T" node "$FETCH" --list > "$T/page.txt" 2>&1 || { tail -5 "$T/page.txt"; echo "could not read the pages"; exit 1; }
grep -o 'would download [^ ]*\.bf2demo[^ ]*' "$T/page.txt" | cut -d' ' -f3 | sort -u > "$T/page_names.txt" || true
node -e 'try { for (const r of require(process.argv[1]).rounds) console.log(r.name) } catch (e) {}' "$DATA/rounds.json" | sort -u > "$T/site_names.txt"
comm -23 "$T/site_names.txt" "$T/page_names.txt" > "$DATA/redownload-lost.txt"
nPage=$(wc -l < "$T/page_names.txt"); nSite=$(wc -l < "$T/site_names.txt"); nLost=$(wc -l < "$DATA/redownload-lost.txt")
echo "rounds on the site now:        $nSite ($(du -sh "$DATA/demos" 2>/dev/null | cut -f1) of demos)"
echo "demos the pages list:          $nPage"
grep -E 'would download [0-9]+ demos' "$T/page.txt" | tail -1 | sed 's/^[^ ]* /pages: /'
echo "on the site but not listed:    $nLost  (these rounds would be lost: $DATA/redownload-lost.txt)"
df -h "$DATA" | tail -1 | awk '{print "free on the disk:              " $4}'
echo "(the old data stays on the disk in data/old-<date> until step 3: the downloads need room next to it)"
rm -rf "$T"
[ "$mode" = go ] || { echo; echo "nothing changed. To start over: sudo bash $0 --go"; exit 0; }

if [ "$nLost" -gt 0 ] && [ "$lose" != 1 ]; then echo; echo "not going on: $nLost rounds would be lost (see the file above). If that is fine: sudo bash $0 --go --lose-them"; exit 1; fi

# 2. stop, move aside, start again
OLD="$DATA/old-$(date +%Y-%m-%d-%H%M)"
echo "stopping downloads and decoding..."
systemctl stop "${UNITS_T[@]}" || true
systemctl stop "${UNITS_S[@]}" || true
mkdir "$OLD"
for f in "${MOVE[@]}"; do [ -e "$DATA/$f" ] && mv "$DATA/$f" "$OLD/"; done
chown bf2replay:bf2replay "$OLD"
echo "moved aside: $OLD"
systemctl start "${UNITS_T[@]}"
systemctl start --no-block bf2replay-fetch.service
echo
echo "downloading and decoding everything again (hours for thousands of demos). Watch it:"
echo "  journalctl -u bf2replay-fetch -u bf2replay-ingest -f"
echo "  sudo bf2replay-status"
echo "when the site looks right: sudo bash $0 --drop-old"

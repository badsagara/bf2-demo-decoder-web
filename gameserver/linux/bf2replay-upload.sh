#!/bin/bash
# BF2 Round Replay - on the BF2 server (Linux): send every finished demo (and round logger file) to one or more replay
# servers over SFTP. Run it every 2 minutes from cron; each file goes to each target once (marks in state/sent.N/).
# Settings: bf2replay-upload.conf next to this script.
set -u
DIR=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=/dev/null
. "${BF2R_UPLOAD_CONF:-$DIR/bf2replay-upload.conf}"
: "${DEMO_DIR:?set DEMO_DIR in bf2replay-upload.conf}" "${KEY:?set KEY in bf2replay-upload.conf}"
MIN_AGE=${MIN_AGE:-60}; MIN_BYTES=${MIN_BYTES:-0}; SINCE=${SINCE:-}; STATE=${STATE:-$DIR/state}
mkdir -p "$STATE"
exec 9>"$STATE/.lock"; flock -n 9 || exit 0          # (one run at a time)
log() { echo "$(date '+%F %T') $*" >> "$STATE/upload.log"; }
now=$(date +%s)
shopt -s nullglob
for f in "$DEMO_DIR"/*.bf2demo "$DEMO_DIR"/round_*.json; do
  name=$(basename "$f")
  [ $(( now - $(stat -c %Y "$f") )) -lt "$MIN_AGE" ] && continue          # still being written (the round is on)
  [ -n "$SINCE" ] && [[ "$(date -r "$f" +%F)" < "$SINCE" ]] && continue     # older than SINCE
  [[ $name == *.bf2demo ]] && [ "$(stat -c %s "$f")" -lt "$MIN_BYTES" ] && continue
  for i in "${!TARGETS[@]}"; do
    mark="$STATE/sent.$i/$name"; [ -e "$mark" ] && continue
    mkdir -p "$STATE/sent.$i"
    t=${TARGETS[$i]}; host=${t%:*}; port=22; [[ $t =~ :[0-9]+$ ]] && port=${t##*:} || host=$t
    # (under a .part name first, renamed when complete: the replay server never takes half a file)
    # (chmod: the replay server's decoder runs as another user and must be able to read the file)
    if err=$(sftp -b - -i "$KEY" -P "$port" -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 "$host" \
         2>&1 >/dev/null <<SFTP
-rm "incoming/$name.part"
put "$f" "incoming/$name.part"
chmod 644 "incoming/$name.part"
rename "incoming/$name.part" "incoming/$name"
SFTP
    ); then touch "$mark"; log "sent $name to $host"
    else log "FAILED $name to $host (tried again in a few minutes): $(echo "$err" | grep -v 'No such file' | tail -3 | tr '\n' ' ')"; fi
  done
done
# keep the log short
[ -f "$STATE/upload.log" ] && [ "$(wc -l < "$STATE/upload.log")" -gt 5000 ] && tail -n 2000 "$STATE/upload.log" > "$STATE/upload.log.tmp" && mv "$STATE/upload.log.tmp" "$STATE/upload.log"
exit 0

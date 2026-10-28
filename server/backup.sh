#!/bin/bash
# BF2 Round Replay: a weekly copy of what the demos can't give back - rounds.json and .rounds-full.json (the list: when
# each round came, its server, its players' lines), the round logs (data/logs), what was downloaded (.fetched.json), the settings (/etc/bf2replay.conf; and the
# admin page's: .fetch-sources.json, .notify.json, .ingest.json; v224: .access.json, .admin-users.json, .demos.json, the
# admins' review .admin/review; v227: the hints' thresholds .admin/hint-thresholds.json, hint-mine.json (v254: and the hints in
# shadow, hint-shadow.json); v239: what each
# account keeps of the map, .prefs - the backup folder is root's, 750) - and,
# with BF2R_BACKUP_ROUNDS=1, the decoded rounds too (data/rounds: ~3 MB a round; the only copy of a round whose demo is
# gone). Into /srv/bf2replay/backup/bf2replay-YYYY-MM-DD.tar.gz; the last BF2R_BACKUP_KEEP (default 6) are kept.
# Run by bf2replay-backup.timer (Sundays 04:40) or by hand: sudo systemctl start bf2replay-backup
# The copy is on the same disk: to keep one off the VPS, from the Mac:
#   scp 'root@VPS:/srv/bf2replay/backup/bf2replay-*.tar.gz' ~/Downloads/
set -euo pipefail
cv() { { sed -n "s/^$1=\"\{0,1\}\([^\"#]*\)\"\{0,1\}\s*$/\1/p" /etc/bf2replay.conf 2>/dev/null || true; } | tail -1 | tr -d ' '; }
ROOT=$(cv BF2R_ROOT); ROOT=${ROOT:-/srv/bf2replay}
KEEP=$(cv BF2R_BACKUP_KEEP); [[ ${KEEP:-} =~ ^[0-9]+$ ]] && [ "$KEEP" -ge 1 ] || KEEP=6
ROUNDS=$(cv BF2R_BACKUP_ROUNDS)
MINFREE=$(cv BF2R_MIN_FREE_GB); [[ ${MINFREE:-} =~ ^[0-9]+$ ]] || MINFREE=3
DATA=$ROOT/data OUT=$ROOT/backup
install -d -m 750 "$OUT"
files=()
# (v224: and who may open what - the guests' parts and the accounts with their rights, scrypt hashes only -, the demos to
# keep, the admins' review: marks, notes, trusted players)
for f in rounds.json .rounds-full.json reprocess.json .fetched.json .fetch-sources.json .notify.json .ingest.json .access.json .admin-users.json .demos.json .admin/review .admin/hint-thresholds.json .admin/hint-mine.json .admin/hint-shadow.json .prefs logs; do [ -e "$DATA/$f" ] && files+=("data/$f"); done
[ "$ROUNDS" = 1 ] && [ -d "$DATA/rounds" ] && files+=(data/rounds)
# (enough room for it: its size plus BF2R_MIN_FREE_GB must stay free)
need=$(du -sk --apparent-size "${files[@]/#/$ROOT/}" 2>/dev/null | awk '{s+=$1} END {print s+0}')
free=$(df -Pk "$OUT" | awk 'NR==2 {print $4}')
if [ $((free - need)) -lt $((MINFREE * 1024 * 1024)) ]; then echo "backup skipped: not enough room on the disk (${free} KB free, ~${need} KB needed, BF2R_MIN_FREE_GB ${MINFREE})"; exit 0; fi
name=bf2replay-$(date +%F).tar.gz tmp=$OUT/.$name.part
tar -C "$ROOT" -czf "$tmp" "${files[@]}" -C / etc/bf2replay.conf
mv -f "$tmp" "$OUT/$name"
echo "backup: $OUT/$name ($(du -h "$OUT/$name" | cut -f1)): ${files[*]} etc/bf2replay.conf"
# the oldest beyond BF2R_BACKUP_KEEP go
ls -1t "$OUT"/bf2replay-*.tar.gz 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r f; do rm -f "$f"; echo "old backup removed: $(basename "$f")"; done

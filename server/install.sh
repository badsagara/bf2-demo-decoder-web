#!/bin/bash
# BF2 Round Replay - one-time setup of the web server (Ubuntu 22.04 / 24.04). Run as root, from this folder:
#
#   sudo BF2R_REPO=git@github.com:YOU/bf2-round-replay.git BF2R_DOMAIN=replay.example.com \
#        BF2R_FETCH_URLS=http://demos.example.org/bf2/ bash install.sh
#
# BF2R_REPO    the GitHub repository with site/ and server/ (git@... for a private one: a read-only deploy key is made
#              and shown; https://... for a public one)
# BF2R_GIT_KEY the deploy key's file (default /root/.ssh/GitHub_bf2_repo; made if missing, an existing one is used)
# BF2R_DOMAIN  the site's name (HTTPS certificate from Let's Encrypt, automatic); empty = plain http on the IP
# BF2R_BRANCH  default main
# BF2R_FETCH_URLS   where the demos are (space separated): pages that list them, or game servers' IPs (asked for
#                   their demo page): new demos are downloaded once a day, rounds with players decoded, empty ones dropped
# BF2R_FETCH_AT     HH:MM, when (server clock; default 05:30)
# BF2R_FETCH_SINCE  YYYY-MM-DD: don't download demos recorded before this day (empty = all the page lists)
# BF2R_FETCH_MAX    at most so many downloads a day (default 0 = no limit)
# BF2R_WEB     caddy (default: installs Caddy, automatic HTTPS) or none (another web server already runs here: set it up
#              yourself from nginx-example.conf)
#
# It installs Node.js 22 (if needed), Caddy, git and rsync; makes the users bf2replay (runs everything) and bf2upload
# (SFTP only, into /srv/bf2replay/upload/incoming, for game servers that send their demos themselves); clones the repository; sets up Caddy and
# the systemd timers that download and decode new demos and pull site updates. Running it again is safe (it keeps data
# and keys; on a second run, values not given are taken from /etc/bf2replay.conf, and the ones given replace them).
set -euo pipefail
# a second run: what isn't given comes from the first run's settings
confval() { [ -f /etc/bf2replay.conf ] && sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}\$/\1/p" /etc/bf2replay.conf | tail -1; true; }
REPO=${BF2R_REPO:-$(confval BF2R_REPO)}
[ -n "$REPO" ] || { echo "Set BF2R_REPO to the git URL of the repository (see INSTALL.md)."; exit 1; }
DOMAIN=${BF2R_DOMAIN-$(confval BF2R_DOMAIN)}
BRANCH=${BF2R_BRANCH:-$(confval BF2R_BRANCH)}; BRANCH=${BRANCH:-main}
FETCH_URLS=${BF2R_FETCH_URLS:-}
# (these replace the settings only when given; BF2R_FETCH_SINCE= given empty clears the date)
FETCH_KEYS=(BF2R_FETCH_SINCE BF2R_FETCH_MAX BF2R_FETCH_AT BF2R_FETCH_MIN_BYTES)
WEB=${BF2R_WEB:-caddy}
GIT_KEY=${BF2R_GIT_KEY:-$(confval BF2R_GIT_KEY)}; GIT_KEY=${GIT_KEY:-/root/.ssh/GitHub_bf2_repo}
ROOT=/srv/bf2replay
HOMEDIR=/var/lib/bf2replay
HERE=$(cd "$(dirname "$0")" && pwd)
[ "$(id -u)" = 0 ] || { echo "Run as root (sudo)."; exit 1; }
say() { printf '\n== %s\n' "$*"; }

say "Ports 80 / 443"
if [ "$WEB" = caddy ] && ss -ltnp 2>/dev/null | grep -E ':(80|443)\s' | grep -vq caddy; then
  ss -ltnp | grep -E ':(80|443)\s' || true
  echo "Another web server already listens on port 80 or 443. Stop it, or run again with BF2R_WEB=none and serve the"
  echo "site with that web server (nginx-example.conf; INSTALL.md)."
  exit 1
fi

say "Packages"
if ! apt-get update -q; then
  echo
  echo "apt-get update failed: one of the package sources above is broken (see the E: lines). Fix it or switch it off"
  echo "(INSTALL.md, 'apt-get update fails'), then run this again."
  exit 1
fi
apt-get install -y -q git rsync curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -   # Node.js 22 LTS from NodeSource (Ubuntu ships 12 / 18)
  apt-get install -y -q nodejs
fi
if [ "$WEB" = caddy ] && ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q && apt-get install -y -q caddy
fi
echo "node $(node -v)"; [ "$WEB" = caddy ] && echo "caddy $(caddy version | head -1 | cut -d' ' -f1)"

say "Users and folders"
getent group bf2replay >/dev/null || groupadd --system bf2replay
id bf2replay >/dev/null 2>&1 || useradd --system --gid bf2replay --home-dir "$HOMEDIR" --create-home --shell /usr/sbin/nologin bf2replay
id bf2upload >/dev/null 2>&1 || useradd --system --gid bf2replay --home-dir / --no-create-home --shell /usr/sbin/nologin bf2upload
usermod -p '*' bf2upload   # (no password, but not "locked": sshd refuses even keys for a locked account)
# the upload chroot and the folders above it must belong to root and not be writable by others (sshd checks)
install -d -o root -g root -m 755 "$ROOT" "$ROOT/upload"
install -d -o bf2upload -g bf2replay -m 2775 "$ROOT/upload/incoming"
# repo/ and site/ are root's (git runs as root with root's deploy key); data/ is bf2replay's (it decodes the demos)
install -d -o root -g root -m 755 "$ROOT/repo" "$ROOT/site"
install -d -o bf2replay -g bf2replay -m 755 "$ROOT/data"

say "Settings: /etc/bf2replay.conf"
# (a setting is changed where it stands; a new one goes at the end)
setconf() { awk -v k="$1" -v v="$2" 'index($0, k "=") == 1 { if (!d) print k "=" v; d = 1; next } { print } END { if (!d) print k "=" v }' \
  /etc/bf2replay.conf > /etc/bf2replay.conf.new && mv /etc/bf2replay.conf.new /etc/bf2replay.conf; }
if [ ! -f /etc/bf2replay.conf ]; then
  cat > /etc/bf2replay.conf <<EOF
# BF2 Round Replay settings (read by the systemd units and server/ingest.mjs)
BF2R_ROOT=$ROOT
BF2R_REPO=$REPO
BF2R_BRANCH=$BRANCH
BF2R_DOMAIN=$DOMAIN
# the deploy key install.sh / update.sh read GitHub with (as root)
BF2R_GIT_KEY=$GIT_KEY
# keep demos of rounds nobody played (in data/empty): 0 / 1
BF2R_KEEP_EMPTY=0
# a round with fewer players than this on the field is not listed (2: a soldier alone on an empty server is left out)
BF2R_MIN_PLAYERS=2
# delete a demo itself after so many days, keeping its decoded round (0 = keep all)
BF2R_RAW_KEEP_DAYS=0
# pages that list a game server's demos, space separated (a plain folder listing works); empty = only uploads
BF2R_FETCH_URLS="$FETCH_URLS"
# when to download them, once a day (HH:MM by the server's clock)
BF2R_FETCH_AT=05:30
# YYYY-MM-DD: don't download demos recorded before this day (empty = all the page lists)
BF2R_FETCH_SINCE=
# at most so many downloads a day (0 = no limit); skip demos smaller than so many bytes (0 = all: empty rounds,
# ~400 KB, are downloaded and dropped after decoding); seconds between two downloads
BF2R_FETCH_MAX=0
BF2R_FETCH_MIN_BYTES=0
BF2R_FETCH_PAUSE=1
# stop downloading when the disk has less free space than this (GB)
BF2R_MIN_FREE_GB=3
EOF
else
  setconf BF2R_REPO "$REPO"; setconf BF2R_BRANCH "$BRANCH"; setconf BF2R_DOMAIN "$DOMAIN"; setconf BF2R_GIT_KEY "$GIT_KEY"
  if [ -n "$FETCH_URLS" ]; then setconf BF2R_FETCH_URLS "\"$FETCH_URLS\""; fi
  # (settings added by later versions get their defaults; the downloads are daily now)
  sed -i 's/^# at most so many downloads per run (every 10 minutes);.*/# at most so many downloads a day (0 = no limit); skip demos smaller than so many bytes (0 = all)/' /etc/bf2replay.conf
  grep -q '^BF2R_FETCH_AT=' /etc/bf2replay.conf || setconf BF2R_FETCH_AT 05:30
  grep -q '^BF2R_MIN_FREE_GB=' /etc/bf2replay.conf || setconf BF2R_MIN_FREE_GB 3
  grep -q '^BF2R_MIN_PLAYERS=' /etc/bf2replay.conf || setconf BF2R_MIN_PLAYERS 2
fi
for k in "${FETCH_KEYS[@]}"; do
  if [ -n "${!k+x}" ]; then setconf "$k" "${!k}"; fi
done
chmod 644 /etc/bf2replay.conf

say "Repository"
# GitHub is read as root with the deploy key $GIT_KEY (made here if missing; an existing key is used as it is, and must
# have no passphrase); the repository remembers the key (core.sshCommand), so update.sh needs nothing else
# (-F /dev/null: root's own ~/.ssh/config is not read - e.g. a config copied from a Mac with UseKeychain stops ssh)
SSHCMD="ssh -F /dev/null -i $GIT_KEY -o IdentitiesOnly=yes -o BatchMode=yes"
if [[ $REPO == git@* || $REPO == ssh://* ]]; then
  install -d -o root -g root -m 700 /root/.ssh
  [ -f "$GIT_KEY" ] || ssh-keygen -q -t ed25519 -N '' -C "bf2replay@$(hostname)" -f "$GIT_KEY"
  chmod 600 "$GIT_KEY"   # (an existing key keeps its owner: root can read a key in another user's ~/.ssh too)
  # the automatic pull can't type a passphrase; the public half (for GitHub) is made from the key if it's missing
  if ! ssh-keygen -y -P '' -f "$GIT_KEY" > "$GIT_KEY.pub.new" 2>/dev/null; then
    rm -f "$GIT_KEY.pub.new"
    echo "$GIT_KEY has a passphrase (or is not a private key). The git pull every minute can't type it."
    echo "Remove the passphrase (old one, then Enter twice):  ssh-keygen -p -f $GIT_KEY   - then run this again."
    exit 1
  fi
  if [ -s "$GIT_KEY.pub" ]; then rm -f "$GIT_KEY.pub.new"; else mv "$GIT_KEY.pub.new" "$GIT_KEY.pub"; fi
  chown --reference="$GIT_KEY" "$GIT_KEY.pub"; chmod 644 "$GIT_KEY.pub"
  touch /root/.ssh/known_hosts && chmod 644 /root/.ssh/known_hosts
  if ! ssh-keygen -F github.com -f /root/.ssh/known_hosts >/dev/null; then
    ssh-keyscan -t ed25519 github.com >> /root/.ssh/known_hosts 2>/dev/null || echo "(could not reach github.com on port 22 to read its host key)"
  fi
fi
chown -R root:root "$ROOT/repo" "$ROOT/site"   # (from an older install, when bf2replay read GitHub)
if [ ! -d "$ROOT/repo/.git" ]; then
  until git -c core.sshCommand="$SSHCMD" clone --quiet --branch "$BRANCH" "$REPO" "$ROOT/repo"; do
    echo
    echo "Could not read the repository. For a private one add this key in GitHub: the repository -> Settings ->"
    echo "Deploy keys -> Add deploy key (title: bf2replay VPS, leave 'Allow write access' off). The key ($GIT_KEY.pub):"
    echo
    cat "$GIT_KEY.pub" 2>/dev/null || echo "($GIT_KEY.pub is missing)"
    echo
    echo "Check: ssh -F /dev/null -i $GIT_KEY -o IdentitiesOnly=yes -T git@github.com   (should say: Hi <you>/<repository>!)"
    read -r -p "Press Enter to try again (Ctrl+C to stop) " _
    rm -rf "${ROOT:?}/repo/"* "$ROOT/repo/".[!.]* 2>/dev/null || true
  done
fi
git -C "$ROOT/repo" remote set-url origin "$REPO"
if [[ $REPO == git@* || $REPO == ssh://* ]]; then git -C "$ROOT/repo" config core.sshCommand "$SSHCMD"; else git -C "$ROOT/repo" config --unset core.sshCommand || true; fi
rsync -a --delete --delay-updates "$ROOT/repo/site/" "$ROOT/site/"

say "Game servers' upload (SFTP only)"
install -d -o root -g root -m 755 /etc/ssh/bf2replay_keys
[ -f /etc/ssh/bf2replay_keys/bf2upload ] || install -o root -g root -m 644 /dev/null /etc/ssh/bf2replay_keys/bf2upload
install -o root -g root -m 644 "$HERE/sshd_bf2upload.conf" /etc/ssh/sshd_config.d/60-bf2replay.conf
sshd -t
systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || systemctl restart ssh

if [ "$WEB" = caddy ]; then
say "Caddy"
SITE_ADDR=${DOMAIN:-:80}
sed "s|__SITE__|$SITE_ADDR|" "$HERE/Caddyfile.in" > /etc/caddy/bf2replay.caddy
if [ -f /etc/caddy/Caddyfile ] && grep -q 'import bf2replay.caddy' /etc/caddy/Caddyfile; then :;
elif [ -f /etc/caddy/Caddyfile ] && grep -qv '^\s*#\|^\s*$' /etc/caddy/Caddyfile && ! grep -q 'root \* /usr/share/caddy' /etc/caddy/Caddyfile; then
  echo 'import bf2replay.caddy' >> /etc/caddy/Caddyfile   # (keeps the sites Caddy already serves)
else
  echo 'import bf2replay.caddy' > /etc/caddy/Caddyfile     # (the package's placeholder page goes)
fi
install -d -o caddy -g caddy -m 755 /var/log/caddy
# (the log file must be Caddy's: one left owned by root, e.g. by caddy run as root, stops Caddy from loading the site)
[ -f /var/log/caddy/bf2replay.log ] || install -o caddy -g caddy -m 644 /dev/null /var/log/caddy/bf2replay.log
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
chown -R caddy:caddy /var/log/caddy
systemctl enable caddy >/dev/null 2>&1 || true
if systemctl is-active --quiet caddy; then systemctl reload caddy; else systemctl restart caddy; fi || {
  echo; echo "Caddy did not start. Its log:"; journalctl -u caddy -n 40 --no-pager -o cat; exit 1; }
else
  say "Web server: not touched (BF2R_WEB=$WEB); serve $ROOT/site and $ROOT/data as in nginx-example.conf"
fi

say "Timers"
# (units.sh puts the units, update.sh and the download time in place; update.sh runs it again every minute)
bash "$HERE/units.sh"
systemctl daemon-reload
systemctl enable --now bf2replay-ingest.path bf2replay-ingest.timer bf2replay-update.timer bf2replay-fetch.timer
# (both in the background: with many demos waiting, decoding them takes hours, and install.sh must not wait for it)
systemctl start --no-block bf2replay-ingest.service || true
systemctl start --no-block bf2replay-fetch.service || true

say "Done"
echo "Site:      ${DOMAIN:+https://$DOMAIN/}${DOMAIN:-http://$(hostname -I | awk '{print $1}')/}"
# shellcheck source=/dev/null
echo "Demos:     downloaded from: $(. /etc/bf2replay.conf; echo "${BF2R_FETCH_URLS:-(none: set BF2R_FETCH_URLS in /etc/bf2replay.conf)}")"
echo "           daily at $(. /etc/bf2replay.conf; echo "${BF2R_FETCH_AT:-05:30}") (next: $(systemctl show -P NextElapseUSecRealtime bf2replay-fetch.timer 2>/dev/null)); the first run starts now"
echo "Uploads:   sftp bf2upload@${DOMAIN:-$(hostname -I | awk '{print $1}')} into incoming/  (add each sender's public key"
echo "           as a line in /etc/ssh/bf2replay_keys/bf2upload)"
echo "Logs:      journalctl -u 'bf2replay-*' -f"

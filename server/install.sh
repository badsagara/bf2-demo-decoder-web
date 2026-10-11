#!/bin/bash
# BF2 Round Replay - one-time setup of the web server (Ubuntu 22.04 / 24.04). Run as root, from this folder:
#
#   sudo BF2R_REPO=git@github.com:YOU/bf2-round-replay.git BF2R_DOMAIN=replay.example.com \
#        BF2R_FETCH_URLS=http://demos.example.org/bf2/ BF2R_FETCH_SINCE=2026-10-01 bash install.sh
#
# BF2R_REPO    the GitHub repository with site/ and server/ (git@... for a private one: a read-only deploy key is made
#              and shown; https://... for a public one)
# BF2R_DOMAIN  the site's name (HTTPS certificate from Let's Encrypt, automatic); empty = plain http on the IP
# BF2R_BRANCH  default main
# BF2R_FETCH_URLS   pages that list a game server's demos (space separated): new demos are downloaded every 10 minutes
# BF2R_FETCH_SINCE  YYYY-MM-DD: don't download demos recorded before this day
# BF2R_WEB     caddy (default: installs Caddy, automatic HTTPS) or none (another web server already runs here: set it up
#              yourself from nginx-example.conf)
#
# It installs Node.js 20 (if needed), Caddy, git and rsync; makes the users bf2replay (runs everything) and bf2upload
# (SFTP only, into /srv/bf2replay/upload/incoming, for game servers that send their demos themselves); clones the repository; sets up Caddy and
# the systemd timers that download and decode new demos and pull site updates. Running it again is safe (it keeps data
# and keys; BF2R_FETCH_URLS / BF2R_FETCH_SINCE given again replace the ones in /etc/bf2replay.conf).
set -euo pipefail
REPO=${BF2R_REPO:?set BF2R_REPO to the git URL of the repository}
DOMAIN=${BF2R_DOMAIN:-}
BRANCH=${BF2R_BRANCH:-main}
FETCH_URLS=${BF2R_FETCH_URLS:-}
FETCH_SINCE=${BF2R_FETCH_SINCE:-}
WEB=${BF2R_WEB:-caddy}
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
apt-get update -q
apt-get install -y -q git rsync curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -   # Node.js 20 from NodeSource (Ubuntu 22.04 ships 12)
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
install -d -o bf2replay -g bf2replay -m 755 "$ROOT/repo" "$ROOT/site" "$ROOT/data"
install -d -o bf2replay -g bf2replay -m 700 "$HOMEDIR/.ssh"

say "Settings: /etc/bf2replay.conf"
if [ ! -f /etc/bf2replay.conf ]; then
  cat > /etc/bf2replay.conf <<EOF
# BF2 Round Replay settings (read by the systemd units and server/ingest.mjs)
BF2R_ROOT=$ROOT
BF2R_REPO=$REPO
BF2R_BRANCH=$BRANCH
BF2R_DOMAIN=$DOMAIN
# keep demos of rounds nobody played (in data/empty): 0 / 1
BF2R_KEEP_EMPTY=0
# delete a demo itself after so many days, keeping its decoded round (0 = keep all)
BF2R_RAW_KEEP_DAYS=0
# pages that list a game server's demos, space separated (a plain folder listing works); empty = only uploads
BF2R_FETCH_URLS="$FETCH_URLS"
# YYYY-MM-DD: don't download demos recorded before this day (empty = all the page lists)
BF2R_FETCH_SINCE=$FETCH_SINCE
# at most so many downloads per run (every 10 minutes); skip demos smaller than so many bytes (empty rounds ~400 KB)
BF2R_FETCH_MAX=20
BF2R_FETCH_MIN_BYTES=0
EOF
else
  setconf() { { grep -v "^$1=" /etc/bf2replay.conf; echo "$1=$2"; } > /etc/bf2replay.conf.new && mv /etc/bf2replay.conf.new /etc/bf2replay.conf; }
  if [ -n "$FETCH_URLS" ]; then setconf BF2R_FETCH_URLS "\"$FETCH_URLS\""; fi
  if [ -n "$FETCH_SINCE" ]; then setconf BF2R_FETCH_SINCE "$FETCH_SINCE"; fi
fi
chmod 644 /etc/bf2replay.conf

say "Repository"
if [[ $REPO == git@* || $REPO == ssh://* ]]; then
  [ -f "$HOMEDIR/.ssh/id_ed25519" ] || sudo -u bf2replay ssh-keygen -q -t ed25519 -N '' -C "bf2replay@$(hostname)" -f "$HOMEDIR/.ssh/id_ed25519"
  sudo -u bf2replay sh -c "ssh-keyscan -t ed25519 github.com >> '$HOMEDIR/.ssh/known_hosts' 2>/dev/null; sort -u -o '$HOMEDIR/.ssh/known_hosts' '$HOMEDIR/.ssh/known_hosts'"
fi
if [ ! -d "$ROOT/repo/.git" ]; then
  until sudo -u bf2replay git clone --quiet --branch "$BRANCH" "$REPO" "$ROOT/repo"; do
    echo
    echo "Could not read the repository. For a private one add this key in GitHub: the repository -> Settings ->"
    echo "Deploy keys -> Add deploy key (title: bf2replay VPS, leave 'Allow write access' off):"
    echo
    cat "$HOMEDIR/.ssh/id_ed25519.pub" 2>/dev/null || true
    echo
    read -r -p "Press Enter to try again (Ctrl+C to stop) " _
    rm -rf "${ROOT:?}/repo/"* "$ROOT/repo/".[!.]* 2>/dev/null || true
  done
fi
sudo -u bf2replay rsync -a --delete --delay-updates "$ROOT/repo/site/" "$ROOT/site/"

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
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
systemctl enable --now caddy >/dev/null 2>&1 || true
systemctl reload caddy
else
  say "Web server: not touched (BF2R_WEB=$WEB); serve $ROOT/site and $ROOT/data as in nginx-example.conf"
fi

say "Timers"
install -d -m 755 /usr/local/lib/bf2replay
install -m 755 "$HERE/update.sh" /usr/local/lib/bf2replay/update.sh
install -m 644 "$HERE"/systemd/bf2replay-* /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now bf2replay-ingest.path bf2replay-ingest.timer bf2replay-update.timer bf2replay-fetch.timer
systemctl start bf2replay-ingest.service || true
systemctl start --no-block bf2replay-fetch.service || true

say "Done"
echo "Site:      ${DOMAIN:+https://$DOMAIN/}${DOMAIN:-http://$(hostname -I | awk '{print $1}')/}"
# shellcheck source=/dev/null
echo "Demos:     downloaded from: $(. /etc/bf2replay.conf; echo "${BF2R_FETCH_URLS:-(none: set BF2R_FETCH_URLS in /etc/bf2replay.conf)}")"
echo "Uploads:   sftp bf2upload@${DOMAIN:-$(hostname -I | awk '{print $1}')} into incoming/  (add each sender's public key"
echo "           as a line in /etc/ssh/bf2replay_keys/bf2upload)"
echo "Logs:      journalctl -u 'bf2replay-*' -f"

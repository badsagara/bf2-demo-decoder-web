#!/bin/bash
# BF2 Round Replay (v245): serve the site from the Caddy on this machine, also when that Caddy already serves other
# sites. install.sh runs it; it can also be run by itself, as root, from this folder:
#
#   sudo bash caddy-attach.sh --check                                 # only look and check: changes nothing
#   sudo BF2R_DOMAIN=replay.example.com bash caddy-attach.sh          # add the site (run again: updates it)
#   sudo bash caddy-attach.sh --remove                                # take the site out of Caddy again
#
# BF2R_DOMAIN       the site's name (default: from /etc/bf2replay.conf). With other sites in Caddy it is required and must
#                   be a name no other site there uses.
# BF2R_CADDY_UNIT   the systemd service that runs Caddy (default caddy)
# BF2R_CADDYFILE    Caddy's main config (default: what the service runs with, --config in its ExecStart)
#
# What it changes: its own file /etc/caddy/bf2replay.caddy (the site, from Caddyfile.in), and one "import" line it adds at
# the end of Caddy's main config. Not a line of the other sites changes. Only when that config is still the package's
# placeholder page (or empty) is it replaced by the import line, as install.sh always did.
# Every change is checked before it is made: the whole new config (yours plus the site) is validated as a copy, with the
# service's own environment, while the files Caddy runs from stay as they are. Then Caddy is reloaded, not restarted (the
# other sites go on without a break); if anything fails, the files go back as they were and Caddy keeps the old config.
# What it changed is copied first into /etc/caddy/bf2replay-backup/<date-time>/.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=caddylib.sh
. "$HERE/caddylib.sh"

MODE=attach
case "${1:-}" in
  ''|--attach) ;;
  --check) MODE=check ;;
  --remove) MODE=remove ;;
  -h|--help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;;
  *) echo "Unknown option: $1 (--check, --remove, or nothing)"; exit 1 ;;
esac

ROOT=/srv/bf2replay
SITEF=/etc/caddy/bf2replay.caddy
CONF=/etc/bf2replay.conf
MARK='# BF2 Round Replay (caddy-attach.sh): the site is in /etc/caddy/bf2replay.caddy'
SELF=$ROOT/repo/server/caddy-attach.sh; [ -f "$SELF" ] || SELF=$HERE/caddy-attach.sh   # (install.sh may run it from a copy in /tmp)
say() { printf '\n== %s\n' "$*"; }
die() { printf '\n%s\n' "$*" >&2; exit 1; }
note() { printf '  ! %s\n' "$*"; }
confval() { [ -f "$CONF" ] && sed -n "s/^$1=\"\{0,1\}\([^\"#]*\)\"\{0,1\}\s*\$/\1/p" "$CONF" | tail -1 | tr -d ' '; true; }
setconf() {   # (a setting is changed where it stands; a new one goes at the end)
  [ -f "$CONF" ] || return 0
  awk -v k="$1" -v v="$2" 'index($0, k "=") == 1 { if (!d) print k "=" v; d = 1; next } { print } END { if (!d) print k "=" v }' \
    "$CONF" > "$CONF.new" && chmod --reference="$CONF" "$CONF.new" && mv "$CONF.new" "$CONF"
}

[ "$(id -u)" = 0 ] || die "Run as root (sudo)."
[ -n "${BF2R_CADDY_UNIT:-}" ] || CADDY_UNIT=$(confval BF2R_CADDY_UNIT); CADDY_UNIT=${CADDY_UNIT:-caddy}
if [ -n "${BF2R_DOMAIN+x}" ]; then DOMAIN=$BF2R_DOMAIN; else DOMAIN=$(confval BF2R_DOMAIN); fi
DOMAIN=$(printf '%s' "$DOMAIN" | tr -d ' ' | tr 'A-Z' 'a-z'); DOMAIN=${DOMAIN#http://}; DOMAIN=${DOMAIN#https://}; DOMAIN=${DOMAIN%/}
[[ -z $DOMAIN || $DOMAIN =~ ^[a-z0-9.-]+$ ]] || die "BF2R_DOMAIN=$DOMAIN is not a host name (like replay.example.com)."

TMP=$(mktemp -d /tmp/bf2r-caddy.XXXXXX); chmod 755 "$TMP"
trap 'rm -rf "$TMP"' EXIT

# ---------------------------------------------------------------------------------------------------------------- what is here
say "Caddy"
command -v caddy >/dev/null || die "Caddy is not installed here (install.sh installs it; or BF2R_WEB=none for another web server)."
command -v node >/dev/null || die "Node.js is needed (install.sh installs it)."
VER=$(caddy version 2>/dev/null | head -1 | cut -d' ' -f1); V=${VER#v}
if [[ $V =~ ^[0-9]+\.[0-9]+ ]] && [ "$(printf '%s\n' 2.5.1 "${V%%-*}" | sort -V | head -1)" != 2.5.1 ]; then
  die "Caddy $VER is too old: the site needs 2.5.1 or newer (forward_auth). Update Caddy first."
fi
echo "caddy $VER"

if [ "$(systemctl show "$CADDY_UNIT" -p LoadState --value 2>/dev/null)" != loaded ]; then
  ss -ltnp 2>/dev/null | grep -E ':(80|443)\s' || true
  die "There is no systemd service '$CADDY_UNIT' here. If Caddy runs in Docker (docker-proxy above) or as another service,
see INSTALL.md §10: Caddy in Docker gets the site block by hand; another service name: BF2R_CADDY_UNIT=<name>."
fi
START=$(systemctl show "$CADDY_UNIT" -p ExecStart --value 2>/dev/null | sed -n 's/.*argv\[\]=\([^;]*\);.*/\1/p' | head -1)
[[ " $START " == *" --resume "* ]] && die "Caddy here keeps its config itself (--resume: the config API / caddy-api service), not in a
Caddyfile. Add the site through the API yourself (caddy adapt Caddyfile.in), or switch the service to a Caddyfile."
CF=${BF2R_CADDYFILE:-$(confval BF2R_CADDYFILE)}
ADAPTER=caddyfile
if [ -z "$CF" ]; then
  read -r -a A <<< "$START"
  for ((i = 0; i < ${#A[@]}; i++)); do
    case "${A[i]}" in
      --config) CF=${A[i+1]:-} ;; --config=*) CF=${A[i]#--config=} ;;
      --adapter) ADAPTER=${A[i+1]:-} ;; --adapter=*) ADAPTER=${A[i]#--adapter=} ;;
    esac
  done
  wd=$(systemctl show "$CADDY_UNIT" -p WorkingDirectory --value 2>/dev/null || true)
  [ -n "$CF" ] || CF=Caddyfile   # (no --config: Caddy takes a Caddyfile in its working folder)
  [[ $CF == /* ]] || CF=${wd:-/}/$CF; CF=${CF//\/\//\/}
fi
[[ $CF == /* ]] || CF=$PWD/$CF   # (BF2R_CADDYFILE given relative)
[[ $ADAPTER == caddyfile && $CF != *.json ]] || die "Caddy here runs a JSON config ($CF), not a Caddyfile: add the site to it yourself (caddy adapt
--config $HERE/Caddyfile.in gives its JSON)."
[ -f "$CF" ] || die "Caddy's config $CF is missing (the service '$CADDY_UNIT' runs: $START)."
# (CF as the service names it - Caddy reads its relative imports from there; CFW the file itself, when CF is a symlink:
# the changes are written into it, and the symlink stays)
CFW=$(readlink -f "$CF")
CUSER=$(systemctl show "$CADDY_UNIT" -p User --value 2>/dev/null); CUSER=${CUSER:-root}
id "$CUSER" >/dev/null 2>&1 || CUSER=root
CGROUP=$(id -gn "$CUSER")
ACTIVE=no; systemctl is-active --quiet "$CADDY_UNIT" && ACTIVE=yes
echo "service: $CADDY_UNIT ($( [ $ACTIVE = yes ] && echo running || echo not running ), as $CUSER), config: $CF$( [ "$CFW" = "$CF" ] || echo " (-> $CFW)" )"

# (Node does the reading: the import lines, the placeholder page, the sites in Caddy's own JSON of the config)
cat > "$TMP/look.mjs" <<'JS'
import fs from 'node:fs';
import path from 'node:path';
const [cmd, a, b, c, d] = process.argv.slice(2);
const strip = s => s.split('\n').map(l => l.replace(/(^|\s)#.*$/, '')).join('\n');
if (cmd === 'stock') {             // the package's placeholder page (or nothing at all)?
  const t = strip(fs.readFileSync(a, 'utf8')).replace(/\s+/g, ' ').trim();
  console.log(t === '' ? 'empty' : t === ':80 { root * /usr/share/caddy file_server }' ? 'placeholder' : 'other');
} else if (cmd === 'imports') {    // does the config take in file b through its import lines (globs too) - or would, once b is there?
  // (as Caddy reads them: a relative import from the folder of the file as it was named, a symlink not followed)
  const real = f => { try { return fs.realpathSync(f); } catch (e) { return path.resolve(f); } };
  const want = path.resolve(b), wantR = real(b), seen = new Set(), snippets = new Set();
  const re = p => new RegExp('^' + p.replace(/[.+^${}()|\\[\]]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]') + '$');
  const glob = p => {              // filepath.Glob as Caddy uses it: * and ? within a path element
    const parts = p.split('/'); let cur = [parts[0] === '' ? '/' : parts[0]];
    for (const seg of parts.slice(1)) {
      if (!seg) continue;
      if (!/[*?]/.test(seg)) { cur = cur.map(c => path.join(c, seg)); continue; }
      const r = re(seg);
      cur = cur.flatMap(c => { try { return fs.readdirSync(c).filter(n => r.test(n)).map(n => path.join(c, n)); } catch (e) { return []; } });
    }
    return cur.filter(f => { try { return fs.statSync(f).isFile(); } catch (e) { return false; } });
  };
  const scan = (f, depth) => {
    const r = real(f);
    if (seen.has(r) || depth > 10) return false;
    seen.add(r);
    let t; try { t = strip(fs.readFileSync(f, 'utf8')); } catch (e) { return false; }
    for (const m of t.matchAll(/^\s*\(([^)\s]+)\)/gm)) snippets.add(m[1]);
    for (const m of t.matchAll(/(?:^|[\s{])import\s+("[^"]+"|\S+)/gm)) {
      const p = m[1].replace(/^"|"$/g, '');
      if (snippets.has(p)) continue;
      const abs = path.resolve(path.dirname(f), p), wild = /[*?]/.test(p);
      if (wild ? re(abs).test(want) : (abs === want || real(abs) === wantR)) return true;
      for (const g of (wild ? glob(abs) : [abs])) if (scan(g, depth + 1)) return true;
    }
    return false;
  };
  console.log(scan(a, 0) ? 'yes' : 'no');
} else if (cmd === 'sites') {      // the sites in the JSON Caddy makes of the config: HOSTS, OURS (served from /srv/bf2replay)
  const j = JSON.parse(fs.readFileSync(a, 'utf8')), http = (j.apps || {}).http || {}, hosts = new Set(), ours = new Set();
  let off = false, catchall = false;
  for (const [, s] of Object.entries(http.servers || {})) {
    if (s.automatic_https && s.automatic_https.disable) off = true;
    for (const r of s.routes || []) {
      const h = (r.match || []).flatMap(m => m.host || []);
      const mine = JSON.stringify(r).includes('"/srv/bf2replay/');
      if (!h.length && !mine && (s.listen || []).some(l => /:80$/.test(l))) catchall = true;
      h.forEach(x => hosts.add(x.toLowerCase()));
      if (mine) h.forEach(x => ours.add(x.toLowerCase()));
    }
  }
  console.log('HOSTS=' + [...hosts].join(' '));
  console.log('OURS=' + [...ours].join(' '));
  console.log('AUTOHTTPS_OFF=' + (off ? 1 : 0));
  console.log('CATCHALL80=' + (catchall ? 1 : 0));
  console.log('HTTP_PORT=' + (http.http_port || ''));
  console.log('HTTPS_PORT=' + (http.https_port || ''));
} else if (cmd === 'unimport') {   // file a without our lines (the mark with the empty line above it, import lines naming b) -> d
  const want = path.resolve(b), dir = path.dirname(a), out = [];
  for (const l of fs.readFileSync(a, 'utf8').split('\n')) {
    if (l.trim() === c) { if (out.length && out[out.length - 1].trim() === '') out.pop(); continue; }
    const m = l.match(/^\s*import\s+("[^"]+"|\S+)\s*(#.*)?$/);
    if (m && path.resolve(dir, m[1].replace(/^"|"$/g, '')) === want) continue;
    out.push(l);
  }
  fs.writeFileSync(d, out.join('\n'));
}
JS
look() { node "$TMP/look.mjs" "$@"; }
sites() {   # $1 = a config: its sites into HOSTS, OURS, ... (in this shell)
  local out
  out=$(caddy_run adapt --config "$1" --adapter caddyfile 2>"$TMP/adapt.err") || return 1
  printf '%s' "$out" > "$TMP/adapt.json"
  while IFS='=' read -r k v; do printf -v "$k" '%s' "$v"; done < <(look sites "$TMP/adapt.json")
}
check() {   # $1 = a config: does Caddy take it? (the reason, if not, in $TMP/check.err)
  caddy_run validate --config "$1" --adapter caddyfile >"$TMP/check.out" 2>"$TMP/check.err"
}
why() { { grep -v '^\s*$' "$TMP/check.err" | grep -viE '"level":"(info|warn)"' | tail -4 | sed 's/^/    /'; } || true; }

say "Caddy's config as it is now"
if ! check "$CF"; then
  why
  die "Caddy's config doesn't validate as it is now ($CF), before any change. Nothing was changed: fix it first
(caddy validate --config $CF --adapter caddyfile shows why)."
fi
sites "$CF" || die "caddy adapt failed on $CF: $(tail -3 "$TMP/adapt.err")"
STOCK=$(look stock "$CF")
INC=$(look imports "$CF" "$SITEF")
OTHER=()
for h in $HOSTS; do [[ " $OURS " == *" $h "* ]] || OTHER+=("$h"); done
echo "valid; sites: ${OTHER[*]:-(none)}${OURS:+; this site: $OURS}$( [ "$CATCHALL80" = 1 ] && echo '; a catch-all site on port 80' )"
case $STOCK in empty) echo "(the config is empty)" ;; placeholder) echo "(the config is still the package's placeholder page)" ;; esac
[ "$INC" = yes ] && echo "(it already takes in $SITEF$( [ -f "$SITEF" ] || echo ", once it is there" ))"

# ---------------------------------------------------------------------------------------------------------------- --remove
if [ "$MODE" = remove ]; then
  say "Taking the site out"
  [ "$INC" = yes ] || [ -f "$SITEF" ] || { echo "The site is not in Caddy's config: nothing to do."; exit 0; }
  NEWCF=$CFW.bf2r-new
  look unimport "$CF" "$SITEF" "$MARK" "$NEWCF"
  if [ "$(look stock "$NEWCF")" = empty ] && [ "$STOCK" != empty ] && [ -d /usr/share/caddy ]; then
    # (Caddy served only this site: the package's placeholder page comes back)
    printf '# The Caddyfile (the BF2 Round Replay site was taken out: caddy-attach.sh --remove)\n\n:80 {\n\troot * /usr/share/caddy\n\tfile_server\n}\n' > "$NEWCF"
  fi
  chmod --reference="$CF" "$NEWCF"; chown --reference="$CF" "$NEWCF"
  check "$NEWCF" || { why; rm -f "$NEWCF"; die "Without the site Caddy's config doesn't validate (above). Nothing was changed."; }
  exec 9>"$CADDY_LOCK"; flock -w 120 9 || die "Another change of Caddy's files is running (units.sh?): try again in a minute."
  BK=/etc/caddy/bf2replay-backup/$(date +%Y%m%d-%H%M%S); install -d -m 755 "$BK"
  cp -p "$CFW" "$BK/"; [ -f "$SITEF" ] && cp -p "$SITEF" "$BK/"
  mv "$NEWCF" "$CFW"; rm -f "$SITEF"
  if [ $ACTIVE = yes ] && ! caddy_reload "$CF"; then
    cp -p "$BK/$(basename "$CFW")" "$CFW"; [ -f "$BK/bf2replay.caddy" ] && cp -p "$BK/bf2replay.caddy" "$SITEF"
    journalctl -u "$CADDY_UNIT" -n 15 --no-pager -o cat 2>/dev/null | sed 's/^/    /' || true
    die "Caddy refused the config without the site (above): the files went back as they were, Caddy runs as before."
  fi
  echo "The site is out of Caddy's config; the other sites run on. What was there: $BK"
  echo "(units.sh no longer puts the site back: it only updates $SITEF when it exists. Again: sudo bash $SELF)"
  exit 0
fi

# ---------------------------------------------------------------------------------------------------------------- what to do
if [ "$INC" = yes ]; then ACTION=update
elif [ "$STOCK" != other ]; then ACTION=replace
else ACTION=add; fi

if [ "$ACTION" != replace ] && [ -z "$DOMAIN" ] && { [ ${#OTHER[@]} -gt 0 ] || [ "$CATCHALL80" = 1 ]; }; then
  die "Caddy here already serves other sites (${OTHER[*]:-a catch-all on port 80}). The site needs a name of its own:
BF2R_DOMAIN=replay.example.com (a DNS A record of that name -> this machine), then run this again."
fi
if [ -n "$DOMAIN" ] && [[ " ${OTHER[*]} " == *" $DOMAIN "* ]]; then
  die "Caddy here already has a site named $DOMAIN (in $CF or a file it imports). Nothing was changed. Give the replay site
another name (BF2R_DOMAIN=replay.<your domain>), or take that site out of Caddy's config first."
fi
if [ "$INC" = no ] && [ -n "$DOMAIN" ] && [[ " $OURS " == *" $DOMAIN "* ]]; then
  die "Caddy here already serves the replay site as $DOMAIN from a block written by hand (it serves /srv/bf2replay). Nothing
was changed. Take that block out of $CF (or the file it is in) and run this again, or keep it as it is."
fi
for h in "${OTHER[@]}"; do
  if [[ $h == \*.* && -n $DOMAIN && $DOMAIN == *.* && ${DOMAIN#*.} == "${h#\*.}" ]]; then
    note "the site $h covers $DOMAIN too; Caddy answers $DOMAIN with this site (the exact name wins)"
  fi
done
[ "${AUTOHTTPS_OFF:-0}" = 1 ] && note "Caddy's global options turn automatic HTTPS off (auto_https off): the site answers on http:// only,
    unless you give it a certificate yourself"
[ -n "${HTTP_PORT:-}${HTTPS_PORT:-}" ] && note "Caddy's global options move its ports (http_port ${HTTP_PORT:-80}, https_port ${HTTPS_PORT:-443}): the site is on
    those ports too"
if [ -n "$DOMAIN" ]; then
  ips=$({ getent ahostsv4 "$DOMAIN" 2>/dev/null || true; } | awk '{print $1}' | sort -u | tr '\n' ' ')
  mine=" $(hostname -I 2>/dev/null || true) "
  if [ -z "$ips" ]; then note "$DOMAIN doesn't resolve yet: Caddy gets its certificate once its DNS A record points here"
  else ok=0; for ip in $ips; do [[ $mine == *" $ip "* ]] && ok=1; done
    [ $ok = 1 ] || note "$DOMAIN points to ${ips% } - not one of this machine's addresses (${mine# }); behind NAT that is fine,
    otherwise Caddy gets no certificate until the A record points here"
  fi
fi

# the site's file as it will be, and the config Caddy would run with - checked as a copy, nothing live is touched
sed "s|__SITE__|${DOMAIN:-:80}|" "$HERE/Caddyfile.in" > "$TMP/bf2replay.caddy"
chmod 644 "$TMP/bf2replay.caddy"
case $ACTION in
  replace) printf 'import %s\n' "$TMP/bf2replay.caddy" > "$TMP/Caddyfile" ;;
  add)     printf 'import %s\nimport %s\n' "$CF" "$TMP/bf2replay.caddy" > "$TMP/Caddyfile" ;;
  update)  : ;;   # (the config already takes in the site's file: it is checked in place below, with the old one kept)
esac
say "The new config, checked as a copy"
case $ACTION in
  replace) echo "Caddy's config is $( [ "$STOCK" = empty ] && echo empty || echo "the package's placeholder page" ): it becomes one line, import $SITEF" ;;
  add)     echo "One import line (and a comment above it) goes at the end of $CF: import $SITEF  (its $(grep -c '' "$CF") lines stay as they are)" ;;
  update)  echo "$CF already takes in $SITEF: only that file is written anew$( cmp -s "$TMP/bf2replay.caddy" "$SITEF" && echo ' (it is the same: nothing to change)')" ;;
esac
echo "the site: ${DOMAIN:-:80 (no domain: plain http on the IP)}"
if [ "$ACTION" != update ]; then
  if ! check "$TMP/Caddyfile"; then
    why
    die "Caddy would not take the config with the site (above). Nothing was changed."
  fi
  sites "$TMP/Caddyfile" || die "caddy adapt failed on the new config: $(tail -3 "$TMP/adapt.err")"
  for h in "${OTHER[@]}"; do [[ " $HOSTS " == *" $h "* ]] || die "With the site, Caddy would lose the site $h. Nothing was changed."; done
  echo "valid: the other sites stay (${OTHER[*]:-none}), the site is added (${OURS:-:80})"
fi

if [ "$MODE" = check ]; then
  echo; echo "Only a check (--check): nothing was changed. To do it: sudo ${DOMAIN:+BF2R_DOMAIN=$DOMAIN }bash $SELF"
  exit 0
fi

# ---------------------------------------------------------------------------------------------------------------- doing it
exec 9>"$CADDY_LOCK"; flock -w 120 9 || die "Another change of Caddy's files is running (units.sh?): try again in a minute."
if [ "$ACTION" = update ] && cmp -s "$TMP/bf2replay.caddy" "$SITEF"; then CHANGE=no; else CHANGE=yes; say "Changing Caddy's files"; fi
BK=
if [ $CHANGE = yes ]; then
  BK=/etc/caddy/bf2replay-backup/$(date +%Y%m%d-%H%M%S); install -d -m 755 "$BK"
  cp -p "$CFW" "$BK/"; [ -f "$SITEF" ] && cp -p "$SITEF" "$BK/"
fi
rollback() {
  cp -p "$BK/$(basename "$CFW")" "$CFW"
  if [ -f "$BK/bf2replay.caddy" ]; then cp -p "$BK/bf2replay.caddy" "$SITEF"; else rm -f "$SITEF"; fi
}

# the log file: Caddy's own (one owned by root stops a Caddy that runs as caddy from loading the site)
[ -d /var/log/caddy ] || install -d -o "$CUSER" -g "$CGROUP" -m 755 /var/log/caddy
if [ ! -f /var/log/caddy/bf2replay.log ]; then install -o "$CUSER" -g "$CGROUP" -m 644 /dev/null /var/log/caddy/bf2replay.log
elif [ "$(stat -c %U /var/log/caddy/bf2replay.log)" != "$CUSER" ]; then chown "$CUSER:$CGROUP" /var/log/caddy/bf2replay.log; fi

if [ $CHANGE = yes ]; then
  install -m 644 "$TMP/bf2replay.caddy" "$SITEF"
  case $ACTION in
    replace)
      printf '# The Caddyfile: the BF2 Round Replay site (the package'"'"'s placeholder page that was here: %s)\n\n%s\nimport %s\n' \
        "$BK/$(basename "$CFW")" "$MARK" "$SITEF" > "$CFW.bf2r-new" ;;
    add)
      { cat "$CFW"; [ -z "$(tail -c1 "$CFW")" ] || echo; printf '\n%s\nimport %s\n' "$MARK" "$SITEF"; } > "$CFW.bf2r-new" ;;
  esac
  if [ -f "$CFW.bf2r-new" ]; then
    chmod --reference="$CFW" "$CFW.bf2r-new"; chown --reference="$CFW" "$CFW.bf2r-new"; mv "$CFW.bf2r-new" "$CFW"
  fi
  if ! check "$CF"; then
    why; rollback
    die "Caddy's config with the site didn't validate in place (above): the files went back as they were, nothing else changed."
  fi
fi

if [ $CHANGE = yes ] || [ $ACTIVE = no ]; then
  if ! caddy_reload "$CF"; then
    journalctl -u "$CADDY_UNIT" -n 15 --no-pager -o cat 2>/dev/null | sed 's/^/    /' || true
    if [ $CHANGE = yes ]; then
      rollback
      if [ $ACTIVE = yes ]; then die "Caddy refused the config with the site (above): the files went back as they were; Caddy runs on with
its old config, the other sites without a break."; fi
    fi
    die "Caddy did not start (above)."
  fi
  [ $ACTIVE = no ] && note "Caddy was not running: it is started now"
fi
systemctl enable --quiet "$CADDY_UNIT" 2>/dev/null || true

# settings the updates need (units.sh writes the site's file anew after each update and checks this same config)
setconf BF2R_DOMAIN "$DOMAIN"
if [ "$CF" != /etc/caddy/Caddyfile ] || [ -n "$(confval BF2R_CADDYFILE)" ]; then setconf BF2R_CADDYFILE "$CF"; fi
if [ "$CADDY_UNIT" != caddy ] || [ -n "$(confval BF2R_CADDY_UNIT)" ]; then setconf BF2R_CADDY_UNIT "$CADDY_UNIT"; fi

say "Done"
case $ACTION in
  replace) echo "Caddy serves the site${DOMAIN:+ as $DOMAIN} (its config was the placeholder page: copied to $BK)." ;;
  add)     echo "Caddy serves the site as $DOMAIN, the other sites as before (${OTHER[*]}). One line was added to $CF;"
           echo "what was there before: $BK" ;;
  update)  if [ $CHANGE = yes ]; then echo "The site's file was written anew and Caddy reloaded (the old one: $BK)."
           else echo "Nothing to change: Caddy already serves the site as it should."; fi ;;
esac
if [ -n "$DOMAIN" ] && command -v curl >/dev/null; then
  code=$(curl --noproxy '*' -s -o /dev/null -w '%{http_code}' -m 5 -H "Host: $DOMAIN" "http://127.0.0.1:${HTTP_PORT:-80}/" 2>/dev/null || true)
  case $code in
    30[0-9]) echo "Caddy answers $DOMAIN (http -> https; a new certificate takes a minute or so)" ;;
    200)     echo "Caddy answers $DOMAIN" ;;
    *)       note "a test request to $DOMAIN through 127.0.0.1 gave ${code:-no answer}: see journalctl -u $CADDY_UNIT -n 30" ;;
  esac
fi
echo "Take the site out again: sudo bash $SELF --remove"

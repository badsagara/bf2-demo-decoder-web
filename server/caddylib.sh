# shellcheck shell=bash
# BF2 Round Replay (v245): what caddy-attach.sh and units.sh share about the Caddy that serves the site. Sourced, not run.
#
# CADDY_UNIT  the systemd service that runs Caddy (BF2R_CADDY_UNIT; default caddy)
# caddy_run   runs the caddy command with the service's own environment (its Environment= and EnvironmentFile= lines), so
#             that a config using {$VAR} is read here exactly as the service reads it
# caddy_reload  reloads the running Caddy (the other sites keep running: a config Caddy refuses leaves the old one
#             running, and the command fails); starts it if it isn't running

CADDY_UNIT=${BF2R_CADDY_UNIT:-caddy}
# (caddy-attach.sh and units.sh never change Caddy's files at the same time)
# shellcheck disable=SC2034
if [ -d /run/lock ]; then CADDY_LOCK=/run/lock/bf2replay-caddy.lock; else CADDY_LOCK=/tmp/bf2replay-caddy.lock; fi

caddy_env() {
  local v f l k
  v=$(systemctl show "$CADDY_UNIT" -p Environment --value 2>/dev/null || true)
  # (systemd prints them space separated, a value with spaces in quotes: xargs splits them the same way)
  [ -n "$v" ] && printf '%s\n' "$v" | xargs -n1 printf '%s\n' 2>/dev/null | grep -E '^[A-Za-z_][A-Za-z0-9_]*=' || true
  systemctl show "$CADDY_UNIT" -p EnvironmentFiles --value 2>/dev/null | while read -r f _; do
    f=${f#-}; [ -r "$f" ] || continue
    while IFS= read -r l || [ -n "$l" ]; do
      l=${l#"${l%%[![:space:]]*}"}; l=${l#export }
      [[ $l =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] || continue
      k=${l%%=*}; v=${l#*=}
      if [[ $v == \"*\" || $v == \'*\' ]]; then v=${v:1:${#v}-2}; fi
      printf '%s=%s\n' "$k" "$v"
    done < "$f"
  done
}

caddy_run() {
  ( while IFS= read -r kv; do [ -n "$kv" ] && export "${kv?}"; done < <(caddy_env)
    exec caddy "$@" )
}

caddy_reload() {
  if systemctl is-active --quiet "$CADDY_UNIT"; then
    if [ -n "$(systemctl show "$CADDY_UNIT" -p ExecReload --value 2>/dev/null)" ]; then systemctl reload "$CADDY_UNIT"
    else caddy_run reload --config "$1" --adapter caddyfile; fi
  else
    systemctl start "$CADDY_UNIT"
  fi
}

# BF2 Round Replay

A web site that replays Battlefield 2 rounds from their `.bf2demo` files on the map: who ran where, who killed whom,
flags, vehicles, tickets, and who could see whom. A small VPS downloads new demos from the game servers' demo pages,
decodes them and publishes rounds, player pages, maps, records and statistics; it can post each round to Discord and
Telegram and gives the servers' admins private tools for checking suspicious play.

This repository is the whole site together with the scripts for the server:

```
site/         the site itself: index.html + assets/ (maps, icons, wall and terrain data for "who could see whom",
              vehicle models, pictures for link previews: assets/og)
server/       for the VPS: install.sh (installs everything in one run), fetch.mjs (takes demos from the servers' pages),
              ingest.mjs (decodes demos), update.sh (updates from GitHub), units.sh (systemd timers and Caddy),
              notify.mjs / digest.mjs / alerts.mjs (posts, summaries, admin alerts), admin.mjs + admin.html (the admin
              page), analyze.sh / analyze.mjs (analysis of many rounds; in the background — the hints over all of a
              player's rounds), glitch.mjs (the grid of where soldiers stood, for Glitch spot), demos.mjs (which old demos
              to remove), roundsidx.mjs (the format of rounds.json), systemd/, Caddyfile.in, INSTALL.md
src/          the page's source: `node server/splitpage.mjs` builds site/index.html and server/admin-round.js
gameserver/   optional: a script for a game server that sends its demos itself (if you have access to the server)
docs/         documentation: installing, the admin page, for players, the particulars of each feature
```

How it all works:

```
the game server's demo page  ──(fetch.mjs, each page at its own interval)──►  VPS: upload/incoming
(e.g. 85.17.145.41/karkand/demos)                                              │ ingest.mjs: demo → decoded round (.bfr, ~6× smaller);
                                                                               │ rounds without players, or with one, are dropped
                                                                               ▼
                         data/rounds.json (the list, light) + data/rounds/*.bfr (the rounds)
                         + data/stats/ (numbers over all rounds) + data/www/ (plain pages, RSS)
                         + data/share/r|p/*.html (link previews /r/<round>, /p/<player>)
                                                                               │ Caddy (HTTPS)
                                                                               ▼
                                              the browser: the round list; a round opens in 1–3 s
GitHub (this repository)  ──(every minute, update.sh: git pull)──►  site/ on the VPS
```

## Documentation

| | |
|---|---|
| [docs/install.md](docs/install.md) | installing and configuring the VPS, updating, backups, troubleshooting |
| [docs/admin-guide.md](docs/admin-guide.md) | the admin page `/admin`, posts and summaries, a round's admins' page (Review), review |
| [docs/admin-hints.md](docs/admin-hints.md) | what each hint for admins means (**for admins only**) |
| [docs/user-guide.md](docs/user-guide.md) | for players and visitors: watching rounds, players, records, statistics, clips |
| [docs/features.md](docs/features.md) | how each feature works and where its limits are |
| [server/INSTALL.md](server/INSTALL.md) | the detailed server notes, section by section, with the version that brought each part |
| [gameserver/README.md](gameserver/README.md) | a game server that uploads its demos itself |
| [CHANGELOG.md](CHANGELOG.md) | what each version changed |

## Installing

The full guide is [docs/install.md](docs/install.md). In short:

1. **What you need**: an Ubuntu 22.04 / 24.04 VPS (2 GB of RAM or swap; a few GB of disk a month), ports 22, 80, 443
   open, a domain for HTTPS (free: [duckdns.org](https://www.duckdns.org)), and this repository on GitHub
   ([below](#once-make-the-repository)).
2. **DNS and firewall**: an **A** record `replay.your-domain` → the VPS's IP (before installing: Caddy asks for the
   certificate at once); then on the VPS:

   ```bash
   sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable
   ```

3. **Install**: copy the `server` folder to the VPS and run `install.sh` as root:

   ```bash
   scp -r bf2-round-replay/server YOU@VPS_IP:/tmp/bf2r-server        # from the folder that holds your clone
   ssh YOU@VPS_IP
   cd /tmp/bf2r-server
   sudo BF2R_REPO=git@github.com:YOUR_LOGIN/bf2-round-replay.git \
        BF2R_DOMAIN=replay.your-domain \
        BF2R_FETCH_URLS=http://85.17.145.41/karkand/demos/ \
        bash install.sh
   ```

   The script installs Node.js 22, Caddy, git and rsync, makes the users `bf2replay` and `bf2upload`, clones the
   repository into `/srv/bf2replay/repo`, writes `/etc/bf2replay.conf` and sets up the services and timers. For a private
   repository it makes a read-only deploy key and stops to show it: paste it into the repository on GitHub → Settings →
   Deploy keys → Add deploy key (don't allow write access), then press Enter. The first download starts at once.
4. **The admin password** (asked twice, not shown):

   ```bash
   sudo node /srv/bf2replay/repo/server/admin.mjs --set-password
   ```

   Then open `https://replay.your-domain/admin`: add more demo pages or game servers (*Where demos come from*), set up
   posts to Discord / Telegram (*Posts about new rounds*), and who may open the site — open to everyone, or closed in
   whole or in part with an account per person (*Users and access*).
5. **Background analysis** (the hints for admins) — install its browser once:
   `sudo bash /srv/bf2replay/repo/server/analyze.sh start`.

Every setting is in `/etc/bf2replay.conf` ([docs/install.md §6](docs/install.md#6-settings-etcbf2replayconf)); the
admin page holds the rest. Another web server on 80/443: `BF2R_WEB=none` and `server/nginx-example.conf`
([§13](docs/install.md#13-another-web-server-nginx)).

## Once: make the repository

1. On github.com: **New repository** → name `bf2-round-replay` → **Private** → no README → **Create**.
2. In a terminal, in the folder with the files of this repository:

   ```bash
   git init -b main
   git add .
   git commit -m "BF2 Round Replay"
   git remote add origin git@github.com:YOUR_LOGIN/bf2-round-replay.git
   git push -u origin main
   ```

   (If `git push` asks for a password or says "Permission denied (publickey)", add your SSH key to GitHub: Settings →
   SSH and GPG keys; or use GitHub Desktop: File → Add local repository → Publish.)
3. The VPS reads the repository with a read-only **deploy key** (`/root/.ssh/GitHub_bf2_repo` on the VPS) — `install.sh`
   makes it (or takes the one already there) and shows what to paste into the repository: Settings → Deploy keys → Add
   deploy key (leave "Allow write access" off).

## Updating the site

The VPS looks at GitHub every minute. When a new commit is there, it updates `site/` and the server scripts, and if the
decoding of demos changed, decodes every round again from its demo (5–15 s a round, several at once — as many as the
cores and memory allow — in the background service `bf2replay-reprocess`; how far it is: `sudo bf2replay-status` on the
VPS and "Updating rounds 25% · ~40 min" in the site's header on every page, refreshed every 30 s). The site keeps
working meanwhile, and the next version from GitHub is pulled too, without waiting for the end. So **publishing a new
version = `git push`**.

A release can come as one archive of the whole repository, `bf2-round-replay-vNN.zip` (the files at its top level, with
the exact collision shapes of the maps `site/assets/geo`, the maps' trees `site/assets/los/*.veg.js` and the sharp
minimaps `site/assets/maps_hd`). Unpack it over your clone and push:

```bash
V=v244                                   # the version in the archive's name
rm -rf /tmp/bf2-round-replay-$V && unzip -q -o bf2-round-replay-$V.zip -d /tmp/bf2-round-replay-$V
rsync -a --delete --exclude .git /tmp/bf2-round-replay-$V/ path/to/your/clone/
cd path/to/your/clone && git add -A && git commit -m "$V" && git push
```

Within ≤ 1 minute the new version is on the site. Not to wait even a minute: `sudo systemctl start --no-block
bf2replay-update` on the VPS (after `git push`). Check: `journalctl -u bf2replay-update -n 20`.

In the browser: the page, its files (`assets/`) and `version.json` are never taken from the cache without checking, so a
plain reload (F5) shows the new version. A tab already open looks at `version.json` every 2 minutes (and each time you
come back to it) and, if a newer version is there, shows the bar **A new version is out: vNN · Reload** — Reload opens the
same moment of the round with the same soldier, in the new version.

**Rolling back**, if a new version broke something: `git revert HEAD && git push` — within a minute the previous one is
back.

### Trying it locally before a push

```bash
cd site && python3 -m http.server 8000
```

and open http://localhost:8000 — without `data/` the site works as a plain viewer (Tools ▾ → "Open .bf2demo").

## Credits and third-party code

Thanks to:
- **Kakarotto22** — for [bf2-replay-viewer](https://github.com/Kakarotto22/bf2-replay-viewer) (MIT): the layouts of the
  demo's records the decoder is built on (details below);
- **Deine-Augen** — for [High Definition Minimap](https://www.moddb.com/addons/high-definition-minimap) (ModDB): the
  Battlefield 2 minimaps at 8192 px from which the site's sharp map pictures are made (details at the end of this
  section).

Since v132 part of the decoder (the player's scoreboard from his Player ghost, the spotter in the UnitSpotted message, the
KilledBy layout, the template ids of the rest of the aircraft: Mi-28, Su-30MKK, MiG-29, Su-34, Mi-17, F-15E) has been
taken from [Kakarotto22/bf2-replay-viewer](https://github.com/Kakarotto22/bf2-replay-viewer) — field layouts its author
worked out from the game's binaries. Checked on 9 rounds: the scoreboard 176 of 176 players, the kill feed 2319 of 2319,
spotters 843 of 843.
Since v133 — the layouts of all 63 game events (each packet read to its end: 43154 of 43154), 16-bit ids of objects and
records, getting into vehicles / onto a parachute, who fired each projectile (MissileInit), revives by the "man down"
flag, assists (316 of 316), picked-up kits, kicks, commanders, medals, squad names.
Since v135 — the server's settings block (ServerInfo / MapInfo), the records of flags and spawn groups (ControlPoint,
SpawnGroup: changes of flag owners 845 of 845) and the rest of the Player ghost fields (fire buttons, time outside the
combat area, the time when he may respawn, the chosen spawn point).
Since v136 — the template numbering on the Armored Fury maps (booster_global), the events StickyProjectile,
IssueSquadOrder and the ticket-loss flag in ScoreManager.
Since v140 — the soldier's full record (SoldierNetworkable: free fall, swimming, ladder; 100 % of the records of 4
rounds).
Since v142 — the layout of the game's HUD (the Tab scoreboard and the top bar of time and tickets from
HudElementsScoreboard.con / HudElementsMap.con) and the measured font colours; the textures and bitmap fonts themselves
are taken from the game's files (Menu_client.zip, Fonts_client.zip).
Since v156 — the template numbering of Euro Force (the level vehicles) and Special Forces (xpack) from the same template
table.
Since v170 — the objects' own records (SimpleObject: a vehicle's place, turn, hit points with the field's width and the
wreck by template; the commander's crates; GenericProjectile — where a missile's nose points; OverheadCamera — the
commander's camera), the health (8 bits) and sprint stamina fields in the soldier's record, the vehicle template table
(maxHitPoints / wreckHitPoints).
Since v174 — the Special Forces maps: the map's size (`assets/world_sizes.json`), the maps' names (HUD_LEVELNAME), the
flags' names from the ControlPoint templates of each mode and size (the xpack template table; the demo's flags are matched
to the block of these templates, as in their `TemplateDB.align_level`) and the rotation data block sent during the round.
Their licence:

```
MIT License

Copyright (c) 2026 Kakarotto

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

The sharp minimaps (since v144, `site/assets/maps_hd/*.webp`, 2048 px) are scaled down from the pack
[High Definition Minimap](https://www.moddb.com/addons/high-definition-minimap) by Deine-Augen (ModDB, 2023: Battlefield 2
minimaps at 8192 px). The plain 512 px minimaps (`site/assets/maps`) are from the game's own files; for the 8 Special
Forces maps (since v174) they too are scaled down from that pack (the SF level files are not here, so those maps have no
walls, relief or lines of sight).

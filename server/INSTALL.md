# Installing on a VPS (Ubuntu 22.04 / 24.04) — detailed notes

The short, topic-by-topic guide is [docs/install.md](../docs/install.md) (and [docs/admin-guide.md](../docs/admin-guide.md)
for the admin page). This file is the detailed reference: every part of the server, with the notes of the version that
brought it.

Nothing is needed or installed on the game server: the VPS itself downloads new demos from the web page where the server
publishes them (the same page you would download demos from by hand).

What runs on the VPS:

| What | How often | Where to look |
|---|---|---|
| the site through Caddy, its HTTPS certificate by itself (Let's Encrypt) | always | `systemctl status caddy` |
| `fetch.mjs`: new demos from the demo page → `upload/incoming` | each page at its own interval (admin page; 10 min by default, `BF2R_FETCH_EVERY`) | `journalctl -u bf2replay-fetch`, `bf2replay-status` |
| `backup.sh`: a copy of the round list, the round logs and the settings → `/srv/bf2replay/backup` | Sundays at 04:40 | `journalctl -u bf2replay-backup` |
| `analyze.mjs --auto`: Glitch spot and the hints over all of a player's rounds (§20) | 5 min after the previous run ends | `journalctl -u bf2replay-hints` |
| `ingest.mjs`: demo → decoded round, the round list (rounds without players are dropped) | as soon as a file arrives (and every 2 min) | `journalctl -u bf2replay-ingest` |
| `update.sh`: `git pull` from GitHub, updates the site | every minute | `journalctl -u bf2replay-update` |
| `ingest.mjs --reprocess`: decodes the rounds again after the decoder changed (started by `update.sh`, apart from it) | after an update | `journalctl -u bf2replay-reprocess` |
| the SFTP drop box `bf2upload` (for servers that send their demos themselves) | — | optional, §8 |

Everything lives in `/srv/bf2replay`: `repo/` (the clone of GitHub), `site/` (what people get), `data/` (demos and
rounds), `upload/incoming/` (incoming). Settings: `/etc/bf2replay.conf`.

## 0. What you need

- **RAM:** decoding the biggest demo (45 min, 64 players) takes ~600 MB. With less than 2 GB on the VPS, add swap (§3).
- **Disk:** a round with players = its demo, 10–25 MB, + the decoded round, 2–4 MB. Empty rounds (~400 KB, nobody
  played) are dropped. 4 live rounds a day ≈ 2–3 GB a month. To keep less, old demos can be removed while their rounds
  stay: the admin page, "Demos: what to keep" (§21).
  When less than 3 GB is left on the disk (`BF2R_MIN_FREE_GB`), `fetch.mjs` stops and says so in its log. So that it
  doesn't come to that, `ingest.mjs` already below 5 GB (`BF2R_MIN_FREE_GB` + 2) removes the oldest demos (the decoded
  rounds stay) until 5 GB are free (`BF2R_RAW_AUTOCLEAN=0`: don't remove).
- **Node.js 22, Caddy, git, rsync** — `install.sh` installs them.
- **Ports 22, 80, 443** open (in `ufw`, and in the hoster's firewall if its panel has one).
- **A domain** for HTTPS. Free: https://www.duckdns.org → your own `something.duckdns.org` → the VPS's IP.
  It works without a domain too, but only as `http://IP`.

## 1. DNS

In the domain's DNS: an **A** record `replay.your-domain` → the VPS's IP (or DuckDNS as above). Check from your
computer: `dig +short replay.your-domain` must print the VPS's IP. Do this **before** `install.sh`: Caddy asks for the
certificate at once.

## 2. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
```

## 3. Swap (if RAM < 2 GB)

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 4. Running install.sh

The repository must be on GitHub first (README.md in the root, "Once: make the repository").
Copy the `server` folder from your computer to the VPS and run it:

```bash
# on your computer, from the folder that holds your clone
scp -r bf2-round-replay/server YOU@VPS_IP:/tmp/bf2r-server

# on the VPS
cd /tmp/bf2r-server
sudo BF2R_REPO=git@github.com:YOUR_LOGIN/bf2-round-replay.git \
     BF2R_DOMAIN=replay.your-domain \
     BF2R_FETCH_URLS=http://85.17.145.41/karkand/demos/ \
     bash install.sh
```

GitHub is read as root with the key **`/root/.ssh/GitHub_bf2_repo`** (another path: `BF2R_GIT_KEY=…`). If that file
doesn't exist, the script makes the key, stops at the step "Repository" and shows its public half
(`/root/.ssh/GitHub_bf2_repo.pub`, the line `ssh-ed25519 AAAA… bf2replay@…`). If the key exists, it is used (it must
have no passphrase; the script sets its permissions to 600 itself, and makes the `.pub` from the key if it is missing).
The script doesn't read your own `/root/.ssh/config` for GitHub (it may hold options from another machine, such as
`UseKeychain`). Put the public key into GitHub: the repository → Settings → Deploy keys → Add deploy key, title
`bf2replay VPS`, **don't** tick "Allow write access" → Add key. Then press Enter in the script's window — it goes on.
Check the key by itself:

```bash
sudo ssh -F /dev/null -i /root/.ssh/GitHub_bf2_repo -o IdentitiesOnly=yes -T git@github.com   # Hi LOGIN/bf2-round-replay! ...
```

The `git pull` every minute also runs as root with this key (it is written into `/srv/bf2replay/repo/.git/config`,
`core.sshCommand`); decoding and downloading run as the user `bf2replay`.

At the end it prints the site's address. The first download starts right after the installation (it takes everything
on the page, newest first; rounds appear on the site one by one, as soon as each is decoded), then every 10 minutes.

`install.sh` can be run again: data and keys stay. The variables can then be left out — they are taken from
`/etc/bf2replay.conf`; those given replace the old ones (e.g. `sudo BF2R_DOMAIN=new.domain bash install.sh`).

## 5. Where the demos come from (BF2R_FETCH_URLS)

The =FL= Strike at Karkand server publishes its demos here: **http://85.17.145.41/karkand/demos/** (a plain file
list). Every 10 minutes (`BF2R_FETCH_EVERY`; `0` — once a day at `BF2R_FETCH_AT`) `fetch.mjs` takes every link to
`*.bf2demo` from that page and downloads each **once** (the list of what was downloaded: `data/.fetched.json`), newest
first, with a 1 s pause between files. A file still being written (changed < 3 min ago — the round is on) is taken next
time, so a round shows up on the site a few minutes after it ends. A run that found nothing new writes nothing to the
log (when it last looked: `bf2replay-status`, the line "Demo pages").

(v210) **Each page at its own interval.** The admin page, card **Where demos come from**: next to each page / server a
list **read**: *as all* (`BF2R_FETCH_EVERY`, 10 min by default), *every minute*, 2, 3, 5, 10, 15, 30 min, 1, 3, 6, 12 h,
*once a day* (at `BF2R_FETCH_AT`) or *off* (not read); next to it, when it was last read. The timer `bf2replay-fetch`
now runs every minute, and `fetch.mjs` reads only the pages whose time has come (when it read which:
`data/.fetch-due.json`); a run with nothing due ends at once and writes nothing. **Fetch now** (card Services) reads all
of them but those *off*. A round reaches Discord like this: the round ends → the demo is ready → the next read of the
page → download → decoding (~15 s) → the post. A demo after which the page already has the next one (the server started
writing a new round) is taken 30 s after its last change instead of 3 min — so with *every minute* the post comes about
1–3 min after the round ends. The page's last demo (the round still on, or the server empty) is taken, as before, after
3 min without changes. "Still being written" about the same demo goes into the log once, not every minute. The page is
not overloaded: only the file list is read (one small page), and each demo is downloaded once.
`ingest.mjs` decodes each demo: a round where at least two played (`BF2R_MIN_PLAYERS`) shows up on the site; an empty one
(~400 KB, nobody joined or nobody spawned) and a round with one player are deleted. Several pages: separated by spaces.

See what it would download, downloading nothing (how many files, how many MB, and how much is free on the disk):

```bash
sudo -u bf2replay node /srv/bf2replay/repo/server/fetch.mjs --list | tail -3
```

Be polite and tell the =FL= admins that the site takes demos from their page: the file list is read every 10 minutes
(one small page), each demo is downloaded once, 10–25 MB a live round (empty ones ~400 KB).

### Several servers

`BF2R_FETCH_URLS` takes, separated by spaces, both pages and **just the IPs of game servers**:

| What to write | What `fetch.mjs` does |
|---|---|
| `http://1.2.3.4/demos/` | reads this page (a file list, HTML or an XML index) |
| `1.2.3.4` | asks the game server itself (a GameSpy query, UDP 29900) where its demos are: in the BF2 settings that is `sv.demoIndexURL` / `sv.demoDownloadURL`; it takes the server's name too. No answer — it tries `http://1.2.3.4/` |
| `1.2.3.4:16567` | the same (16567 is the game port; the query goes to 29900) |
| `1.2.3.4:29901` | another query port (several servers on one machine) |

First check where each address leads — this downloads and writes nothing:

```bash
sudo -u bf2replay node /srv/bf2replay/repo/server/fetch.mjs --probe 1.2.3.4 5.6.7.8 9.10.11.12:29901
# 1.2.3.4 (=XX= Server name) -> http://1.2.3.4/demos/ - 120 demos listed (newest: auto_2026_10_15_21_00_00.bf2demo)
```

Then add them to `/etc/bf2replay.conf` (one line, in quotes):

```bash
BF2R_FETCH_URLS="http://85.17.145.41/karkand/demos/ 1.2.3.4 5.6.7.8 9.10.11.12:29901"
```

and take them at once, not waiting for the next run: `sudo systemctl start --no-block bf2replay-fetch`. Nothing needs
restarting.

A server that keeps its demos by month (`.../archive/s01/2026-10/`): write the month as `{YYYY-MM}` —
`http://137.74.26.182/archive/s01/{YYYY-MM}/` — and `fetch.mjs` reads the current and the previous month by itself.

**Careful with the first run.** Big archives (lost-soldiers lists the last 1,000 demos per server, up to 70 MB each)
with an empty `BF2R_FETCH_SINCE` are tens of GB and hours of decoding. Better limit it:

```bash
BF2R_FETCH_SINCE=2026-10-01     # nothing older
BF2R_FETCH_MAX=50               # at most 50 at a time (the rest next time)
```

(How many days to keep the demos themselves: the admin page, §21.)

First all pages are read, then the demos are downloaded from the newest — from all servers mixed, so each server's
fresh rounds come first. What is happening now:

```bash
journalctl -u bf2replay-fetch -u bf2replay-ingest -f     # what it downloads and what it decodes
ls /srv/bf2replay/upload/incoming | wc -l                # how many demos wait to be decoded
df -h /srv/bf2replay                                     # disk space
```

If the `--probe` line says *its settings name no demo page*, the server doesn't publish its demos (or *does not record
demos*: it doesn't record them); then you need the page's address from its admins. No answer over UDP and no page at
`http://IP/` — ask the admins too where the demos are.

Which server a round is from is in the demo itself (the server's name), so nothing needs labelling. If two servers
started a round in the same second (the same file name), the second is saved with its address in front
(`1.2.3.4_auto_...bf2demo`). In the list of rounds ("▾ all rounds") the site shows a **Server** choice (when there is more
than one server): it filters the list, and "Players · all rounds" then counts only that server's rounds; the server's
name is also in the current round's line and in "Rounds CSV".

### The same demo on two pages (v182)

Some demos are on two pages at once (2F4Y's demos also on the page of 137.74.26.182, Lost-Soldiers' also on
demos.lost-soldiers.org). Before v182 `fetch.mjs` downloaded both: the round was on the site twice, and so were its kills
in the players' numbers (in the analysis, §19, 1,095 such of 2,714 rounds). Since v182:

- `fetch.mjs` doesn't download a demo when one with the same name and the same size is already there from another page
  (or was sent by a server). In the log: `the same demo as … already fetched from another page … not downloaded again`.
- `ingest.mjs` (its very first run after the update) looks for rounds listed twice (the same server, map, start to the
  second, length, soldiers, kills, tickets), keeps one — without an address in its name — and moves the copy (demo and
  decoded round) into `data/.copies`; it deletes nothing. The players' numbers are worked out again by themselves; old
  links to the copy (`/r/…`, `#round=…`) open the same round. In the log: `… rounds listed twice … moved to data/.copies`.

```bash
journalctl -u bf2replay-ingest --since today | grep -i "listed twice\|same round"
ls /srv/bf2replay/data/.copies | wc -l          # files (demos and .bfr)
du -sh /srv/bf2replay/data/.copies              # how much room they take
```

To free the room (if you like; the list of copies stays in `data/.copies.json`, so the links keep working):
`sudo rm -r /srv/bf2replay/data/.copies` (since v186: the Remove button on the admin page, §21). Removing one of the
pages from `BF2R_FETCH_URLS` is not needed — there are no more extra downloads.

## 6. Settings: /etc/bf2replay.conf

| Setting | What it does | Default |
|---|---|---|
| `BF2R_FETCH_URLS` | where to take demos from, separated by spaces: pages or IPs of game servers (§5) | empty |
| `BF2R_FETCH_EVERY` | how often to look at the demo pages, in minutes (`60` — hourly; `0` — once a day at `BF2R_FETCH_AT`) — for those that have no interval of their own on the admin page (v210) | 10 |
| `BF2R_FETCH_AT` | when to download with `BF2R_FETCH_EVERY=0`, `HH:MM` by the VPS's clock | 05:30 |
| `BF2R_FETCH_SINCE` | `YYYY-MM-DD`: don't take demos recorded earlier | empty = all the page lists |
| `BF2R_FETCH_MAX` | how many demos at a time (the rest next time) | 0 = no limit |
| `BF2R_FETCH_MIN_BYTES` | don't download smaller ones (an empty round is ~400 KB; without this, decoding drops them) | 0 |
| `BF2R_FETCH_PAUSE` | seconds between two files | 1 |
| `BF2R_MIN_FREE_GB` | don't download when less than this many GB are free on the disk | 3 |
| `BF2R_MIN_PLAYERS` | a round with fewer players on the field doesn't show up on the site (`2`: one player on an empty server — no) | 2 |
| `BF2R_KEEP_EMPTY` | `1` = keep the demos of empty rounds (and of rounds with too few players) in `data/empty` | 0 |
| `BF2R_RAW_KEEP_DAYS` | after N days (from when the round was played) delete the demo itself; the decoded round stays. Better set on the admin page (§21): above 0 here wins over it | 0 = as on the admin page |
| `BF2R_RAW_AUTOCLEAN` | `1`: with less than `BF2R_MIN_FREE_GB` + 2 GB free, delete demos until that much is free — the least needed first (§21); the rounds stay; `0`: no | 1 |
| `BF2R_BACKUP_KEEP` | how many weekly copies to keep in `/srv/bf2replay/backup` | 6 |
| `BF2R_BACKUP_ROUNDS` | `1`: the decoded rounds go into the copy too (`data/rounds`, ~3 MB a round; the only copy of a round whose demo is gone) | 0 |
| `BF2R_JOBS` | how many demos to decode at once — new ones and again (since v162); each takes up to ~1.2 GB of RAM. Set here, the admin page can't change it (§16) | 0 = as chosen on the admin page, else as many as the CPU cores and memory allow, at most 4 |
| `BF2R_HINTS` | `0`: turn off the background analysis (`bf2replay-hints`: Glitch spot and the hints over all of a player's rounds, §20) | 1 |

More settings: posts and summaries (`BF2R_TELEGRAM_TOKEN`, `BF2R_NOTIFY_MIN_PLAYERS`, `BF2R_DIGEST_AT`,
`BF2R_DIGEST_TZ`) in §15; the full list in [docs/install.md §6](../docs/install.md#6-settings-etcbf2replayconf).

Nothing needs restarting after a change — the next run takes the new values (a new `BF2R_FETCH_EVERY` / `BF2R_FETCH_AT`
within ≤ 1 min, set by `update.sh`; check: `systemctl list-timers bf2replay-fetch`).
A round without its demo stays as it was decoded after a decoder update — unless its demo is still on the page it came
from: then it is downloaded again and decoded again (§21).

## 7. Useful commands

```bash
sudo bf2replay-status                                     # the site's version, how many rounds were decoded again by the new decoder (%), how many are left, the services, the last log lines
watch -n 10 sudo bf2replay-status                         # the same, refreshed every 10 s (Ctrl+C - quit)
journalctl -u bf2replay-reprocess -f                      # decoding again, live: "round … [45/480 9%, ~1 h 10 min left]"
systemctl list-timers 'bf2replay-*'                       # when each ran and when it runs next
journalctl -u 'bf2replay-*' -f                             # the live log of everything
sudo systemctl start --no-block bf2replay-fetch           # take new demos now, not waiting 10 min
sudo systemctl start bf2replay-backup                     # make a copy now (into /srv/bf2replay/backup)
scp 'root@VPS:/srv/bf2replay/backup/bf2replay-*.tar.gz' .   # (on your computer) take the copies off the VPS
journalctl -u bf2replay-fetch -n 30 --no-pager            # what it downloaded last time (the line "fetched N demos" at the end)
sudo systemctl start bf2replay-update                     # pull GitHub now
ls -lh /srv/bf2replay/data/rounds /srv/bf2replay/data/demos

# a demo downloaded by hand (e.g. copied with scp into /tmp):
sudo install -o bf2replay -g bf2replay -m 644 /tmp/auto_….bf2demo /srv/bf2replay/upload/incoming/
# (only what is in upload/incoming is decoded: a demo put straight into data/demos doesn't become a round by itself)

# demos that didn't decode ("could not read" in the log - they wait in data/bad), again after an update:
sudo mv -n /srv/bf2replay/data/bad/*.bf2demo* /srv/bf2replay/upload/incoming/
sudo chown bf2replay:bf2replay /srv/bf2replay/upload/incoming/*.bf2demo*
journalctl -u bf2replay-ingest -u bf2replay-reprocess -f  # both decode new demos (in turn)

# decode everything again from the demos (e.g. if something went wrong):
sudo -u bf2replay flock /srv/bf2replay/data/.ingest.lock node /srv/bf2replay/repo/server/ingest.mjs --rebuild

# start from scratch: download again whatever the demo pages still have and decode it all anew (v136)
sudo bash /srv/bf2replay/repo/server/redownload.sh             # 1. just look: how many demos, how much room, which rounds would be lost
sudo bash /srv/bf2replay/repo/server/redownload.sh --go        # 2. move the old data aside into data/old-<date>, download and decode anew
sudo bash /srv/bf2replay/repo/server/redownload.sh --drop-old  # 3. once the site is fine: delete data/old-*
```

Backup: `/srv/bf2replay/data/demos` is enough (everything else comes back from the demos with `--rebuild`), plus
`/etc/bf2replay.conf`.

`install.sh` waits long at `== Timers` (versions before v80): it waited until every demo already in the queue was
decoded (with several servers, hours). Nothing hung: `Ctrl+C` is safe — downloading and decoding go on as services.
Since v80 `install.sh` starts them in the background and finishes at once.

## 8. Optional: demos the servers send themselves

If there is ever a game server of your own (or the =FL= admins want to send their demos themselves), the script from the
`gameserver/` folder goes onto it (see its README), and here you add its public key, one line per server:

```bash
echo 'ssh-ed25519 AAAA… bf2-server-1' | sudo tee -a /etc/ssh/bf2replay_keys/bf2upload
```

The user `bf2upload` can only put files into `incoming/` over SFTP: no shell, no access to the rest of the disk, no
tunnels.

## 9. apt-get update fails (the VPS already has other package sources)

`install.sh` stops if `apt-get update` prints `E: …`. Most often it is an old Webmin source
(`download.webmin.com/download/repository sarge`, with a DSA-1024 key Ubuntu 24.04 no longer accepts):

```bash
grep -rn webmin /etc/apt/sources.list /etc/apt/sources.list.d/        # where the old source is
sudo sed -i 's|^deb .*download.webmin.com/download/repository.*|# &|' /etc/apt/sources.list /etc/apt/sources.list.d/*.list
curl -o /tmp/webmin-setup-repo.sh https://raw.githubusercontent.com/webmin/webmin/master/webmin-setup-repo.sh
sudo sh /tmp/webmin-setup-repo.sh                                    # Webmin's new source with its new key
sudo apt-get update                                                   # must pass without E:
```

Webmin listens on port 10000; if you use it, after `ufw enable` open it only to your own IP:
`sudo ufw allow from YOUR_IP to any port 10000 proto tcp`.

## 10. If the VPS already has nginx (or another web server on 80/443)

`install.sh` notices it and stops. Then run it with `BF2R_WEB=none` (Caddy is not installed) and connect the site to
nginx following `nginx-example.conf` (with the command for HTTPS through certbot). (v182: the example got the line
`charset utf-8;` — if your nginx was set up from the old example, add it inside `server { … }`: without it a browser
may read the page's text in the wrong encoding. Caddy does this by itself.)

## 11. Links with previews (round, player)

The **Copy link** button gives a link like `https://your-domain/r/auto_2026_10_11_20_17_46?t=466&p=…` (the round at
that moment, following that player) and `https://your-domain/p/puika_mk3` (the player's page over all rounds).
Telegram, Discord, Slack and WhatsApp show under such a link the map and the date, who won and with what score, how many
players and kills, the best player (for a player: his rounds, kills and deaths, K/D) and the map's picture. The opened
link leads straight on to the site.

These small pages are written by `ingest.mjs` into `data/share/` (together with the rounds); Caddy serves them at `/r/*`
and `/p/*` (`Caddyfile.in`; its fresh version is put in place by itself: `units.sh` on every `update.sh`). Pictures and
links in previews need `BF2R_DOMAIN` (without a domain some messengers show the preview without a picture). With nginx,
the block `location ~ ^/([rp])/` from `nginx-example.conf` has to be added by hand.

(v200) All rounds are a page of their own, `https://your-domain/#rounds=1` (the **Rounds** button at the top, or a click
on the round's line over the map): server, map, days, players from, length from, find a player, sorting; the filters are
in the link itself (`&srv=…&rmap=…&from=2026-10-01&to=…&min=32&len=15&q=…&sort=players&dir=-1`), so it can be sent on,
and the browser's Back returns to the list with the same filters. Nothing is needed on the server for it (the same
`data/rounds.json`).

For a long list of rounds the kill points were moved out of `data/rounds.json` into `data/heat/<map>.json`: the list
the site loads is ~8 times smaller, and the points are loaded only for the heat map of all rounds and for the players'
pages.

## 12. Installed earlier: switching to the daily download from =FL=

The timers now update themselves from GitHub (`units.sh`, called by `update.sh`), but the `update.sh` already installed
on an old VPS can't do that yet — so once, by hand:

```bash
# 1. after git push: pull the new version now (not within ≤ 1 min) and check
sudo systemctl start bf2replay-update && journalctl -u bf2replay-update -n 5 --no-pager

# 2. see what would be downloaded: how many demos, how many MB, how much is free on the disk (downloads nothing)
sudo -u bf2replay env BF2R_FETCH_URLS=http://85.17.145.41/karkand/demos/ BF2R_FETCH_SINCE= \
     node /srv/bf2replay/repo/server/fetch.mjs --list | tail -3

# 3. turn it on: the =FL= page, all demos (no date), no limit per run; the timer every 10 min; the first download at once
cd /srv/bf2replay/repo/server
sudo BF2R_FETCH_URLS=http://85.17.145.41/karkand/demos/ BF2R_FETCH_SINCE= BF2R_FETCH_MAX=0 bash install.sh

# 4. watch it download and decode (Ctrl+C - quit; it goes on)
journalctl -u bf2replay-fetch -u bf2replay-ingest -f
systemctl list-timers 'bf2replay-*'          # bf2replay-fetch: the next run within ≤ 10 min
```

Less often: `BF2R_FETCH_EVERY=30` (minutes) or once a day: `BF2R_FETCH_EVERY=0` and `BF2R_FETCH_AT=HH:MM` in
`/etc/bf2replay.conf` (or in the command of step 3).

## 13. Pages for search engines, and RSS

The site itself shows rounds and players with a script (`#round=…`, `#player=…`), and search engines don't see them. So
`ingest.mjs` also writes plain pages into `data/www/`, and Caddy serves them at:

- `/rounds/` — the last 100 rounds and an archive by month; `/rounds/<round>.html` — a round: the sides, players,
  scores, kills, the button "Watch the round on the map";
- `/players/` — all players (v193: with a search by name; `/players/#nick` — with him at once); `/players/<nick>.html`
  — a player and his rounds;
- `/maps/` and `/maps/<map>.html` — the rounds on a map and who kills most there;
- `/records/` — records (since v120): the best in one round (kills, streak, longest kill, headshots, kills from
  vehicles, revives, repairs, score, K/D) and who did most — for 7 days, 30 days and all time;
  (v204) per weapon group too — for each the longest kill and the most kills in a round: hand-held weapons (no sniper
  rifles), sniper rifles (longest), hand-held anti-tank rockets (SRAW, Eryx, RPG-7), TOW / HJ-8 on a stand and tank
  cannons (M1A2, T-90, Type 98, Challenger 2, Leopard 2A6) — each apart (v205), vehicles (without tank cannons and
  anti-air), anti-air guns (Tunguska, Type 95 AA, M6 Linebacker, Phalanx), anti-air rockets from the ground (Igla /
  Stinger, M6 Stinger, SA-19, QW-2, Sea Sparrow), air-to-air missiles (Sidewinder, Archer, Eurofighter);
  (v201) a server choice at the top: `/records/` — all servers, `/records/<server>.html` — only its rounds (the Records
  button on the site leads to the page of the server picked on the All rounds page);
- `/rss.xml` — the 50 newest rounds (RSS: in a news reader or a Telegram bot with RSS every new round shows up);
- with `BF2R_DOMAIN`: `/sitemap.xml` and `/robots.txt` (in Google Search Console you can add `https://domain/sitemap.xml`).

Files are rewritten only when they changed; pages of rounds no longer there are deleted. The new addresses in
`Caddyfile.in` are put in place by themselves (`units.sh` on every `update.sh`); with nginx, the blocks
`/rounds|players|maps` and `rss.xml / sitemap.xml / robots.txt` from `nginx-example.conf` have to be added by hand. The
pages first appear after the first run of `ingest.mjs` (a new round, or a site update: `sudo systemctl start
bf2replay-update`).

## 14. The admin page: /admin (v150)

`https://domain/admin` — with a password. What it has:

- how many rounds are on the site, how many were made by an older decoder;
  (v206) there also the button **Recalculate all records**: every round is summed up again from its decoded file (no
  decoding, ~0.5 s a round) — the kills, their distances, the totals for the posts, the records; then Records, the
  players' and maps' pages and the numbers over all rounds are rewritten. `ingest.mjs` does it at its next run (the
  button starts it; `data/.resum-request.json`); while it runs — "working: N / M rounds", then "last time … : N rounds in
  … min". Stopped halfway (a site update), it goes on with the rest next time.
- how many demos wait to be decoded in `upload/incoming`, how decoding again goes (how many done and how many left),
  which demos didn't decode (`data/bad`);
- the services (state, last time and next time) with buttons: decode new demos now, decode old rounds again, decode
  everything again, download new demos now, update from GitHub, make a copy; "Try them again" — put the demos from
  `data/bad` back into the queue;
- where demos come from: the list from `BF2R_FETCH_URLS` (changed in `/etc/bf2replay.conf`) and those added here (the
  field at the bottom: a page or a game server's IP; "Check" — see where it leads, downloading nothing; "Remove" — take
  no more from it, what was downloaded stays); "What would be downloaded?" = `fetch.mjs --list`;
- (v186) Demos: what to keep — how much room each thing takes, which old demos to remove (the rounds stay), §21;
- the services' log, disk space, settings;
- (v162) how many demos to decode at once, and how fast it went with each number (§16);
- (v163) what is being decoded now and what waits its turn, a **Stop** button for decoding (§17).

None of this deletes demos or rounds.

The **password** is set once on the VPS (it asks twice, nothing shows on screen):

```bash
sudo node /srv/bf2replay/repo/server/admin.mjs --set-password
```

Only its hash (scrypt) is kept, in `/etc/bf2replay-admin.json` (root:bf2replay, 640) — not in the repository. To change
it — the same command, nothing needs restarting. A login lasts 12 h (2 h without visiting the page); 5 wrong passwords
from one address — a 15 min pause, 30 an hour from everyone — a pause for all.

The rest is installed by itself with the update (`units.sh`, a minute after `git push`): the service `bf2replay-admin`
(Node on `127.0.0.1:8781`, as `bf2replay`), `bf2replay-rebuild`, the rule `/etc/sudoers.d/bf2replay-admin` (it lets the
page only `systemctl start --no-block` the bf2replay services, and stop the decoding ones), `/admin` in Caddy. Check:

```bash
systemctl status bf2replay-admin --no-pager     # active (running)
journalctl -u bf2replay-admin -n 20             # logins, wrong passwords, what was started
```

With nginx, the block `location /admin` from `nginx-example.conf` has to be added by hand. Without `sudo` on the VPS
(`apt install sudo`) the page shows everything, but the services' buttons answer "could not start".

## 15. Posts about new rounds in Discord / Telegram (v153; v194 — each server apart; v207 — scoreboard, new records; v208 — the table; v209 — summaries)

After each new round — a post in a Discord channel and / or a Telegram chat: the map and the time, who won and the
tickets, how long it lasted, players and kills, the best three by score, the server and a link to the round (the chat
shows the map's picture under it — the preview of §11). Set up on the admin page, card **Posts about new rounds**.

(v194) **Each game server — its own channel.** A round is posted only where its server (the server's name from the
demo) is set up: its own Discord webhook and / or Telegram chat, its own parts of the post. A server not set up is not
posted at all — it is just in the list (with its rounds in the last 30 days) until it is set up. There is no common
channel.

- **Telegram bot** (at the top, one for all servers): @BotFather → `/newbot` → the token → **Save the bot**. Add the bot
  to each group (to a channel as an administrator).
- **Servers** — a block for each server (a click on its name opens it):
  - **Discord** — the tick "post" and the webhook: the channel's settings (gear) → Integrations → Webhooks → New Webhook
    → Copy Webhook URL → paste it, **Save** (the tick turns on by itself); **Remove** — drop the webhook;
  - **Telegram** — the tick and the chat: `@name` for a public channel, for a group its id (write in the group, open
    `https://api.telegram.org/bot<token>/getUpdates`, take `"chat":{"id":-100…}`) → **Save**;
  - **Rounds with … players or more** — its own minimum of players (empty — as for all, the field above the list, 6);
  - which parts go to Discord and Telegram — the ticks in the table of the editor **The post** (below);
  - **Preview** — the post about this server's newest round with the ticks as they are now (sends nothing); **Send a
    test post** — a trial post into its channels; **Post its newest round** — its last round once more;
  - **Stop posting this server** — forget its webhook, chat and parts (its rounds are no longer posted).
- (v195) **The post** — the editor of this server's post:
  - **Discord as**: *classic* (as it was: the parts in groups, only the ticks count — the default until changed),
    *a card with a table* (a Discord card: a stripe in the winning side's colour or your own, the title a link to the
    round, the parts as the fields of a table, the map's picture big at the bottom or small at the top right, a line at
    the bottom), (v208) *a card with a table: a row each* (see below) or *text from the table* (a plain message: "Name:
    value", up to 3 parts a line);
  - (v208) **a card with a table: a row each** — one row — one kind of kill. (v211) **Numbers**: *bold, a | before
    them* (the default) — the name and the player in monospace, each padded to the longest, a `|` after each; then the
    number in **bold** and what goes with it (the weapon, "was", who killed whom):
    `` `On foot        | =SWE= =BRANDONMARTIN= |` **20** `` — so both `|` stand at the same place in every row, and the
    numbers start at one level. The player column is as wide as the longest nick (v217: plus one space), up to 26
    characters (a tie: as many nicks as fit, then "+N").
    *exact columns, not bold* — the whole table in one monospace block with `|` between the columns (exact to the
    character, but no bold: Discord has no bold in such a block, and coloured ANSI blocks don't work on phones). In the
    monospace layout, when a row is wider than the card (~55 characters), the weapon or the second name goes onto the
    next line under the player column. (v218) **First blood** and **Last killed** take two lines: the first — who killed
    (First blood) or who was killed (Last killed) and the round time; the second, under it — whom he killed / who killed
    him and with what. Short row names — your own (the name field in the editor's table; empty — the standard short one,
    shown as a hint); (v213) the standard short ones: Veh, Hs, AT on inf, GL, Far AT, Far Gun, Far Sniper,
    Far kill, AT, TOW, Far TOW, Tank, Far Tank, Veh weap, AA gun, Far AA, SAM, Far SAM, Air2Air, Far Air2Air, Inf
    Spree, Veh Spree (v214: Far Veh); the same in the day / week / month summaries. (v213) The map's picture in this
    style is always big at the bottom: a small one at the top right narrows the card's text, and long rows wrapped.
    **New records** — a table of its own (record, now, was, player; under "All time / Last 30 days / Last 7 days").
    Best three and Server — as text where they stand in the order; the scoreboard — under the text, a side a column
    (Discord puts a card's fields after its text). The stripe, the map picture, Title / Under it / At the bottom — as in
    the card; "In a row" and "Own row" don't apply here. Telegram — text, as for the card;
  - **Title / Under it / At the bottom** — texts with the placeholders `{map}` `{when}` `{date}` `{time}` `{result}`
    `{winner}` `{loser}` `{tickets}` `{length}` `{players}` `{kills}` `{server}` `{link}` and each part's own
    placeholder (`{foot}`, `{best}`…);
  - **the table**: ↑ ↓ — the order, the part's own name (empty — the standard one), the ticks Discord and Telegram,
    **Own row** — the part over the full width (in a card — a row of its own, in text — a line of its own); **In a
    row** — up to 3 or up to 2 side by side;
  - **Own text instead of the table** — a text entirely your own (Discord as text, and Telegram): placeholders by a
    click, `**bold**` `*italic*` `__underlined__` `~~struck through~~` `` `code` ``; a line in which every placeholder
    is empty (e.g. there were no knife kills) drops out; the link is added at the end by itself if `{link}` is nowhere;
  - Telegram (it has no cards): the same order, names and texts; **Save the post**, **Back to classic**;
  - **Template** — save the post as a template (**Save as a template**), take a template into the editor (**Use it**),
    remove it; **or copy from** — take another server's post; **Use on all servers** — this post on every server set up
    (their channels stay theirs);
  - **Preview** shows how it will be: the card as Discord draws it (the fields by rows), Telegram as text.
- The parts of the post: the best three, the server; most kills on foot, from vehicles, headshots, with the knife,
  claymores, mines, launchers on infantry, run over by a vehicle, (v210, instead of "Explosives") hand grenades, the
  grenade launcher, C4; the longest kill with a launcher, a hand-held weapon (not a sniper rifle), a sniper rifle and
  anything; the longest streak on foot and in vehicles, the best K/D (from 10 kills); most revives, heals, repairs,
  flags; first blood and who was killed last (the same on the site: Round stats → Highlights). Ties — up to three names.
  Some show only when the round had such a thing. The map, time, winner, players, kills and the link — always. These
  numbers are worked out by `ingest.mjs` together with the round's summary.
- (v207) **Scoreboard** — the end-of-round scoreboard: each side (the winner first) and its best five by score with
  kills and deaths, `1. nick 64 (18–14)`. In a card — two columns, in text and Telegram — a line per player. On at once.
- (v207) **New records** — the server's records the round broke, as on the Records page: "Most kills: nick 99 -
  all-time record (was 49)"; all time, 30 days and 7 days (of the three — the biggest), up to 6 lines. Only when a
  record was broken, and only when this server already had at least 20 rounds (all time), 10 (30 days), 5 (7 days) — so
  that a new server's first rounds don't "break records" every time. On at once.
- (v207) **Weapon groups**, as in Records: most kills and the longest kill — hand-held weapons (no sniper rifles),
  hand-held AT (SRAW, Eryx, RPG-7), AT on a stand (TOW, HJ-8), tank cannons, other vehicles, AA guns, AA rockets from the
  ground, air-to-air missiles (14 parts). **Off** until ticked in **The post** (so that the post doesn't double in length
  by itself). A new part in a saved order (card / text) goes to the end — ↑ to raise it.

### Summaries for the day, week, month (v209)

A separate post with the server's summary — into the same channels as the round posts (its Discord / Telegram). Turned
on in the server's block on the admin page: **Summaries at 10:00** — the ticks **Day**, **Week**, **Month** (all off
until ticked). Next to them: pick a summary → **Preview the summary** (how it will be, sends nothing) or **Post it now**
(the last finished one — into the channels now); under it — **last summaries**: what went out and when.

- **Day** — for yesterday, every day at 10:00; **Week** — for last week (Monday–Sunday), on Monday at 10:00; **Month** —
  for last month, on the 1st at 10:00. Bratislava time (`BF2R_DIGEST_AT=10:00`, `BF2R_DIGEST_TZ=Europe/Bratislava` in
  `/etc/bf2replay.conf`, if it should be otherwise).
- The period's rounds — by the round's time in the demo (the game server's clock), only with N+ players (the server's
  minimum, as for the round posts). No rounds — no post.
- A newly ticked summary starts with the next 10:00 (it doesn't send at once the one already past). Failed to send — again
  at the next checks, up to 6 times; a channel turned off — that period is skipped.
- In the post (Discord — cards with monospace tables, as in v208; Telegram — as text):
  - **the server's summary**: rounds, different players, kills, hours; maps (how many rounds on each);
  - **Top 10 by score**: score, kills–deaths, K/D, rounds (a player by his nick without the clan tag, with his newest
    name);
  - **Leaders**: the period's total for each kind of kill (on foot, vehicles, headshots, knife, claymores, mines, AT on
    infantry, run over, grenades, grenade launcher, C4, weapon groups), revives, heals, repairs, flags; the period's K/D —
    from 20 / 50 / 100 kills (day / week / month); a tie — up to three names;
  - **Best in one round**: the best of one round in the period — kills, score, streak, K/D (from 10 kills), the longest
    kills by weapon group (the weapon, the map if there are several, and the day).
- The card's title is a link to the page of all rounds with this server and these dates. Checked and sent by
  `bf2replay-digest.timer` (every 10 min; `units.sh` installs it by itself after the update). From the console:

```bash
sudo -u bf2replay node /srv/bf2replay/repo/server/digest.mjs --show week '=FL= First-Legion - Strike at Karkand'   # show, don't send
sudo -u bf2replay node /srv/bf2replay/repo/server/digest.mjs --post day '=FL= First-Legion - Strike at Karkand'    # send now
journalctl -u bf2replay-digest | grep summary                                                                       # what went out
```

The move from v193 (one webhook, one chat, one set of parts for all): at the first run of v194 these settings were copied
once into every server that had rounds in the last 30 days — that is, where it used to post. New servers after that are
"not posted" until set up. A server is known by its name from the demo: if its admins rename it, the new name shows up
in the list as a new server.

Only rounds with 6+ players (or the server's own minimum), recorded in the last 12 h (not old demos downloaded in a
batch), and not clips, are posted. Links — only with `BF2R_DOMAIN`. Webhooks and the token are kept only on the VPS —
`data/.notify.json` (600, owner bf2replay; the web server doesn't serve the files `data/.*`), the page shows only their
last 4 characters. In `/etc/bf2replay.conf` the main ones are `BF2R_TELEGRAM_TOKEN` and `BF2R_NOTIFY_MIN_PLAYERS`;
`BF2R_DISCORD_WEBHOOK` and `BF2R_TELEGRAM_CHAT` are taken since v194 only into that first copy (the admin page shows that
they can be removed). From the console:

```bash
sudo -u bf2replay node /srv/bf2replay/repo/server/notify.mjs --test '=FL= First-Legion - Strike at Karkand'   # a test post of this server
sudo -u bf2replay node /srv/bf2replay/repo/server/notify.mjs --test                                           # into the channels of every server set up
journalctl -u bf2replay-ingest | grep 'round post'                                                            # what was posted and what wasn't
```

### Discord settings for the summaries (v220)

In the server's block, under **Summaries** (the ticks Day / Week / Month), the summaries now have settings of their own:

- **Discord** — on / off and the channel: a webhook of its own (a separate channel for summaries) or, without one, the
  round posts' channel — even when the round posts to Discord are off. The admins' channel webhook is not accepted here
  (summaries are public).
- **Telegram** — on / off, into the round posts' chat.
- **The summary** — the title, the line under it, **Text above** (a message above the cards — only there does a mention
  really ping: `@here`, `@everyone` or a role `<@&id>`; round posts ping nobody), the bottom line, the stripe's colour,
  which parts (numbers, maps, player of the period, top, leaders, best in a round, map picture, link), how many in the top
  (3–20), which rows of leaders and bests, and the look of those tables: **exact columns** (a monospace table, as it was)
  or **bold numbers, a | before them** (as the round posts' table — narrower, fewer wraps on a phone). Placeholders
  `{kind} {period} {server} {rounds} {players} {kills} {hours} {pow} {min} {link}`.
- **Preview the summary** shows the editor as it is (saved or not) and where it would go; **Post it now** — with the
  saved settings.
- While nothing is saved — as before v220: where the round posts go, the standard look.

### Records: weapons and distances that could not have been (v221)

In a kill message the game at times names not what killed, but what the killer holds (17.10 Dragon Valley: T2000.BE's
mine under a Type 98, named "SRAW", while he flew an F-35B 900 m up — the record "907 m SRAW"). Now (both on the round's
page and in the server's summaries — one function, killFix):

- his mine / claymore / C4 going off by the victim in the same second, while the hand-held weapon named could not have
  done it (he is in a vehicle, the victim is in a vehicle, or he is farther than 60 m) — the kill is recorded as the mine
  / claymore / C4, without a distance;
- a hand-held weapon while the killer is in a vehicle, or a vehicle's weapon when he is already on foot — no distance (not
  a shot from there);
- farther than the bullet or rocket flies (timeToLive × speed from the game files: AK-101 500 m, SRAW and Eryx 450, a
  grenade 120, the knife 10) — no distance;
- an air-to-air missile — from where he launched it (his press before the kill from which the missile could have
  arrived), not from where his aircraft was at the moment of the kill (that gave 2121 m);
- a hand-held weapon beyond the map's fog — the distance is shown, but it doesn't go into the records (it is the Beyond
  fog hint for admins);
- **Most repairs** — as the game counts it (its "repair" points), not the repairs the page recognised: those credited an
  engineer with a nearby vehicle that repaired itself (747 in a round).

Nothing to do after the update: the summaries are version 16 (`ingest` sums up every round again, `summing up N rounds
again (summary version 16 ...)`; the Records page and the players' pages are rewritten), the hint rules version 6
(Beyond fog and Long shot don't take such kills).

### Explanations on the admin page (v220)

Under the title of each card — a short description of what it is and what its buttons do; in **Background analysis** and
**Servers** — the fold-outs "What the buttons do" / "What each setting of a server does"; at the bottom — the card **How
to use this page** (every day, a new server, after an update, when something is wrong, safe keeping).

### Milestones and the player of the period (v215)

In the round post a new part, **Milestones** (on by default): a player who with this round passed 1,000 / 2,500 / 5,000 /
10,000 / 25,000 / 50,000 kills or 100 / 250 / 500 / 1,000 / 2,000 rounds on this server. In the day, week, month
summaries — the line **Player of the day / week / month**: the most score a round among those who played 2 / 3 / 5 rounds
or more (with K/D, duels and damage, when the rounds are summed up by v215).

### The admins' channel (v214)

Each server's block has the line **Admin channel**: the webhook of a **private** Discord channel of this server's admins
(not the one the round posts go to — the admin page won't accept that). When the background analysis (§20) has gone over
a new round of this server (played in the last 2 days), one message goes there: the round's hints For admins — the
player, what exactly, and a link to the moment. The choice: **strong hints** (only the strong ones) or **strong and
ordinary** (the ordinary ones too; the minor ones — team kills, claymores, rules — never). A round goes there once
(data/.admin/alerts.json); old rounds the analysis goes over again with new rules are not sent. **Send a test** — a test
message to the channel. The same from the console:

```bash
cd /srv/bf2replay/repo/server && sudo -u bf2replay node alerts.mjs --test "Server name"
```

Hints show up here only when the server has worked them out: the background analysis is on (§20) and Chromium is
installed (`sudo bash server/analyze.sh start`).

## 16. How many demos to decode at once (v162)

The server decodes several demos at once, each in a thread of its own: both new ones (for example a batch `fetch.mjs`
downloaded) and again after a decoder update. How many exactly is chosen on the admin page, card **Being decoded** →
**Demos at once**: `automatic` (CPU cores and memory at ~1.2 GB per demo, at most 4) or 1–16. The choice is kept in
`data/.ingest.json`, and `ingest.mjs` reads it again after each demo and every 5 s. So a change takes effect within
seconds, even in the middle of decoding.

How to find the best number for the VPS:

1. Pick a number, for example 1, and start a batch: **Decode old rounds again** (or **Decode every round again**), or
   wait until many new demos are downloaded.
2. Look at the table under the choice: **MB a min** — how many megabytes of demos are decoded a minute, **Each took** —
   how long one demo took. The higher MB a min, the faster.
3. Pick the next number and repeat. The fastest measured is green.

More than the cores usually doesn't help: each demo then takes longer. If the number × 1.2 GB is more than the free
memory, the page warns you: the system may stop a decoding thread, or even all of `ingest`. Such a demo is not lost: it
stays in the queue (`upload/incoming`) and is decoded at the next run.

The measurements are in `data/.ingest-stats.json`. Only demos decoded all the time next to the chosen number of others
count. If the VPS's number of cores or memory changes, the measurements start again; the **Clear** button clears them by
hand.

`BF2R_JOBS` in `/etc/bf2replay.conf` (if set, not 0) wins. The page then shows the number tagged `BF2R_JOBS`, and to
choose on the page the line has to be removed from the config.

## 17. Decoding again is "running", but the old rounds don't get fewer (v163)

Only one service at a time can decode demos: `bf2replay-ingest` (new demos), `bf2replay-reprocess` (again after an
update) or `bf2replay-rebuild` (everything anew) — they share one lock (`data/.ingest.lock`). While one works, another
stands in the state **running** and waits up to 2 h for the lock, doing nothing. The admin page (card **Being decoded**)
shows what exactly is working, since when, and who waits.

Before v163 this happened: `bf2replay-ingest` started decoding a big batch of demos with the old code, and then an update
came. It went on with the old decoder for up to 2 h, and the new code's `bf2replay-reprocess` waited all that time. On the
page it looked like this: all rounds "made by an older decoder", "0 by this one", and nothing changes. To check:

```bash
ps -eo pid,etime,args | grep -E '[i]ngest\.mjs'     # who works (node) and who waits (flock with no node under it)
journalctl -u bf2replay-ingest -u bf2replay-reprocess -n 30 --no-pager
```

What to do: wait (the old run ends by itself at most 2 h after it started) or stop it. For that there is the **Stop**
button on the admin page, or the command:

```bash
sudo systemctl stop bf2replay-ingest
```

What it didn't get to is not lost: the demos stay in `upload/incoming`, and the round it was writing at that moment the
next run finds in `data/demos` and puts into the list. Then `bf2replay-reprocess` with the new code gets the lock: rounds
the new decoder reads the same it only marks (seconds), the rest it decodes anew.

Since v163 this doesn't happen again:

- a run that saw a site or `ingest.mjs` update takes no more new demos: it finishes those it has started and ends;
- on `systemctl stop` (and on the service's time limit) it first writes the round list, then exits;
- a demo in `data/demos` without a round in the list is decoded again by the next run;
- with thousands of rounds the full write of the list (heat maps, link previews) took ~3 s after each demo, longer than
  decoding several at once. Now after each demo only `rounds.json` is written, and the heat maps and previews every 30 s
  and at the end.

## 18. The numbers over all rounds are worked out by the server (v165)

The player pages, the comparison of two players, the maps and the tab "Players · all rounds" used to be worked out in
the visitor's browser. For that it loaded `rounds.json` and the kill lists of all rounds (`data/heat`, with thousands of
rounds over 100 MB). Now `ingest.mjs` works them out and puts them into `data/stats`:

- `players/<nick>.json` — the player's rounds, what he killed with and whom, who killed him, how he dies, with whom and
  against whom he played;
- `maps/<map>.json` — who killed most on the map and with what;
- `table.json` and `table/<server>.json` — the table "Players · all rounds" (all servers and each apart);
- `names.json` — the latest name of each nick.

It is the same code as the page's: `ingest.mjs` takes it from `site/index.html` (between `// @agg-begin` and
`// @agg-end`), as it takes the decoder. So the numbers are the same. After each new round only the files of its players
and its map are rewritten (together with the full write of the list, every 30 s and at the end of the run). Everything is
written anew when this code changed (it shows in the log: `stats: … written in N s`). The page loads only the file it
needs, so a player's page opens from one file of a few dozen KB.

`Open folder` on your own computer works it out, as before, in the browser, with the same code.

**v166: a light `rounds.json`.** It now has only a short line per round (date, map, server, length, players, kills, score,
who won, the best), without the players' list: ~0.5 KB a round instead of ~5. The full list is in
`data/.rounds-full.json`, and all kills in `data/.kills/` (before v166 this was the public `data/heat`; the first run of
v166 moved it by itself). Both are needed only by the server, and the web server doesn't serve them. A player search in
the round list goes through `stats/names.json`: with up to 5 matches the round list is filtered by their files; with
more it stays whole and the matches show as buttons to pick the player.

**v176: `rounds.json` three times smaller again.** A round is an array instead of an object (the column names are in the
file itself, `compact`), the server and teams are numbers into shared lists of the file (`servers`, `teams`), the length
whole seconds. What the page can work out itself is not written: where the demo is (`demos/<name>`), the decoded round
(`rounds/<name>.<decoder>.bfr`) and the decoder (the one in the file). The rest only in the round's last element, when
it is not as usual (the demo removed, the round still by an old decoder). The file sizes and when the round came are now
only in `data/.rounds-full.json`. For 6,000 rounds that is ~3.1 MB → ~0.9 MB, and over the network (zstd / gzip) ~400 →
~160 KB. The format is described in `server/roundsidx.mjs`. The page reads both the old and the new format.
`bf2replay-status`, the admin page, `redownload.sh` and `analyze.mjs` take the full list (`.rounds-full.json`). Your own
scripts that read `data/rounds.json` — there too, or expand it with `expandIndex` from `server/roundsidx.mjs`.

If `data/.rounds-full.json` is ever lost (and `rounds.json` stays), the round list has no players' lists. `ingest.mjs`
then won't overwrite `data/stats` with empty ones, but writes in the log that every round must be decoded again:
`sudo systemctl start bf2replay-rebuild`. The weekly copy (`backup.sh`) keeps both files.

**v183: the round summaries once more, without decoding again.** Each kill's summary now has where the last shot hit
(head / body / arm-leg), and a weapon where the game doesn't name one (a crew that died with its vehicle: SRAW, a mine,
the killer's missile or his vehicle). The first run of `ingest.mjs` after the update works out every round's summary
again from the decoded files `data/rounds/*.bfr` — the demos are not decoded again (~0.2 s a round: a few thousand
rounds — 10-20 min), then all of `data/stats` once. In the log: `summing up … rounds again …`, every 250 how many are
left. Stopped (a site update, `systemctl stop`) — it goes on at the next run.

```bash
journalctl -u bf2replay-ingest --since today | grep -i "summ\|stats:"
```

### More statistics (v215)

After the update the server itself **sums up every round again** from the decoded files (SUM_V 13, without decoding the
demos again — minutes for hundreds of rounds) and rewrites data/stats. What was added:
- **for each player** (the card on his page and the columns "Duels & teamwork" in the Players table): a rating (Elo by
  the sides' wins, adjusted by the score a minute; start 1500, "?" — fewer than 10 rounds), duels (kills and deaths when
  both saw each other — the view sector, without walls), ambushes, damage (each drop of an enemy's health — to whoever was
  firing at that moment looking at him, or whose blast it was), assists, kills "stolen" and "set up", time near the squad
  leader, spawns on the squad, time in the flags' zones, revive speed, nemesis and favourite victim, his vehicles (time,
  kills, deaths), a **heat map** (where he kills and where he dies, on each map);
- on a map's page — a heat map of everyone's kills and deaths;
- the **Stats** button at the top of the site: **Clans** (by the tag in front of the nick: players, rounds, wins, K/D,
  clan against clan), **Vehicles** (each vehicle: time, kills, the best by kills an hour), a **server**'s page (when they
  play — hour and day of the week, maps with the sides' wins, round length, the flags that decide the round), **Search
  moments** (every kill of a map: who, with what, how far, headshot, from a vehicle — a result opens the round at that
  moment).
Files: data/stats/clans.json, vehicles.json, servers.json, server/<server>.json (and _all.json), find/<map>.json (a few
MB for a big map — Caddy serves it compressed).

## 19. Analysing many rounds (v175)

The thresholds of the "For admins" hints were first picked on 9 rounds. To pick them on all of a server's rounds,
`analyze.mjs` opens each decoded round in the site's own page (headless Chromium on the VPS, with no domain or web
server: it serves the site's files to the browser itself on 127.0.0.1) and takes the numbers out of it:

- every kill: where the killer looked in the 2 s before it (how many degrees past the victim, every 0.1 s), the
  distance, whether there was a line of sight and how long it was missing before the kill, when he saw the victim, when
  he pressed fire, fog, smoke;
- every hint, as the page makes it now, with its numbers;
- every stretch of a flag capture, steps on foot of 4 m+ per record, spots, vehicle speeds, each soldier's totals;
- what the decoder couldn't name (vehicles, weapons), flags against the map's layout.

One file per round in `/srv/bf2replay/analysis/rounds` (~10 KB), at the end an archive
`/srv/bf2replay/analysis/bf2-analysis-<date>.tar` (~50 MB for 5,000 rounds). It goes to Claude: with it the thresholds
are picked without a new run.

Starting it is one command (the first time it installs Playwright and Chromium into `/srv/bf2replay/analyze`, a few
minutes, ~400 MB):

```bash
sudo bash /srv/bf2replay/repo/server/analyze.sh start
```

The analysis runs in the background (the service `bf2replay-analyze`, at low CPU and disk priority: the site and the
decoding of new demos come first) and doesn't stop when you leave SSH. Rounds with 6+ soldiers, newest first, 1-3 at once
(by cores and memory: ~1.5 GB each). 5-30 s a round, so 5,000 rounds take a few hours. Best started when decoding again
after an update is done (`sudo bf2replay-status`): otherwise rounds being decoded again end up in `failed.json` and go
into the next run.

```bash
sudo bash /srv/bf2replay/repo/server/analyze.sh status   # how many done, the last lines; at the end - the archive and how to copy it
sudo bash /srv/bf2replay/repo/server/analyze.sh stop     # stop (rounds in progress are finished)
sudo bash /srv/bf2replay/repo/server/analyze.sh start    # go on from where it was
sudo bash /srv/bf2replay/repo/server/analyze.sh pack     # an archive of what is already there
```

After `start` you can add `analyze.mjs`'s options: `--jobs 2`, `--limit 500`, `--maps strike_at_karkand`,
`--min-players 6`, `--since 2026-10-01`, `--fresh` (do again rounds already done, e.g. after a new version of the page).

v178 works out differently who sees whom (the eyes' height as in the game, 3 more body points) and has new walls on
Operation Road Rage and Midnight Sun. In the analysis this changes the kills' visibility columns (`react`, `eng`, `losK`,
`losX`, `pitchErr`) and the hints that rest on them; the aim (`err`), flags, spots, speeds and the rest are the same. If
the site updated while the analysis ran, the rounds after the update are already by v178 (how many of which: `pages` in
`summary.json`). To have all visibility by v178: when the first run is done and the archive taken, once more on part of
the rounds, e.g. the newest 600: `sudo bash /srv/bf2replay/repo/server/analyze.sh start --fresh --limit 600`, and these
two maps apart: `sudo bash /srv/bf2replay/repo/server/analyze.sh start --fresh --maps operationroadrage,midnight_sun`.

v182: after the end of a run the process no longer waits up to 15 min more (because of that `stop` ended with `State
'stop-sigterm' timed out. Killing`), and after `stop` it makes an archive of what is done by itself. Copies of rounds
(§5) don't go into the archive. On the first archive (1,619 different rounds) the thresholds of five hints were picked
(CHANGELOG, v182). The visibility hints (No line of sight, Fired at a wall, Wall tracking, Floating) in it are still from
v175–v177 — for them a new run with v182:
`sudo bash /srv/bf2replay/repo/server/analyze.sh start --fresh --limit 800` (~2 h), then `pack`.

The archive to your computer — since v193 easier from the admin page: card Background analysis → Make the archive, then
Download (see §20). Or in a terminal on your computer (`status` shows the VPS's address):

```bash
scp 'root@VPS:/srv/bf2replay/analysis/bf2-analysis-*.tar' .     # on your computer
```

## 20. The hints over all of a player's rounds and "Glitch spot" — in the background (v185)

A new service, `bf2replay-hints.timer` (installed and turned on by itself with the update, `units.sh`). 5 min after the
end of each of its runs it starts `analyze.mjs --auto` at low priority, one round at a time:

1. **Glitch spot** (`server/glitch.mjs`, no browser needed). 150 newly decoded rounds (`data/rounds/*.bfr`, ~0.5 s a
   round) go into each map's grid: where living soldiers stood on foot, cells 2 × 2 m and 2.5 m high, and who exactly.
   The hint — when a soldier stands 20 s or more where, in all of the map's rounds, nobody but him has stood, while right
   above or under him (5-40 m) 3+ other players stood: under a floor, in a rock or a wall, on a roof nobody climbs onto.
   A hill nobody happens to go to is not a hint (nobody above or under it either). Only for maps whose grid already has
   30+ rounds. The page takes the ready list from `data/.admin/glitch/<map>.json` (since v196 — for admins only); where
   the map has shapes (as for No line of sight), the hint also says where he was: chest inside an object, under the
   ground, in the air — or on a roof / ledge nobody else got onto (then, if all the others are only under him — as a list
   of its own, for information). The first time all rounds at once (a few thousand — ~40 min, the site keeps working):
   ```bash
   sudo bash /srv/bf2replay/repo/server/analyze.sh glitch
   ```
2. **40 rounds in the page** (as `analyze.sh start`, so Playwright is needed: if `start` has never run, this step is
   skipped with a line in the log). First those not yet in `analysis/rounds`, then those done by older hint rules
   (`HINTS_V` in the page), newest first. A round that failed with this version of the page is not tried again until the
   next site update.
3. **The card "Hints over his rounds"** on the player's page: each hint, in how many of his rounds it was, against the
   share of all soldier-rounds, and the chance of it by luck (the least likely in red), with links to the rounds. The
   files `data/.admin/hints.json` and `data/.admin/hints/<nick>.json` (since v196 — for admins only). Only rounds done by
   the current rules count.

In the page 10-30 s a round, so 40 rounds take 10-20 min, and all of a few thousand — 1-2 days in the background. Faster —
once `sudo bash /srv/bf2replay/repo/server/analyze.sh start --fresh` (1-3 at once; the background service waits while it
runs).

```bash
journalctl -u bf2replay-hints -n 20 --no-pager           # what the last run did
systemctl list-timers bf2replay-hints.timer              # when the next one is
sudo bash /srv/bf2replay/repo/server/analyze.sh hints    # the players' cards anew, now
```

(v192) How far it is — on the admin page, card **Background analysis**: how many rounds are done by the current rules
(and how many by older ones / not yet), the last run, when it will all be done, how many maps already have 30+ rounds in
the Glitch spot grid.

(v193) Control it there too (the settings — `analysis/.auto-set.json`, `analyze.mjs --auto` reads it before each round):

- **Run now** — a run now, not waiting for the timer (if paused — lifts the pause).
- **All rounds now** — without the 40-round limit, several at once (as `analyze.sh start`: by cores and memory, up to 3),
  at the same low priority. A run takes new rounds for up to 95 min (the service has a 2 h limit), the next one 5 min
  later, and so on until everything is done; then back to 40 a run. **Back to 40 a run** — go back at once.
- **Pause** / **Go on** — the rounds in progress are finished, then nothing until Go on (the timer starts a run, and it
  exits at once).
- The line "running now: 12 of 40 rounds", and what the last run did (`analysis/auto-note.json`): how many rounds, how
  many left, whether it waited for `analyze.sh start`, whether Playwright is missing, whether everything is done. **Its
  log** — the service's log below.

**Archive for Claude**: Make the archive builds an archive in the background (`analyze.mjs --pack`, a few minutes — it
reads every round's file). Its name has the version of the site that made it: `bf2-analysis-<date>-<version>.tar`; next
to it `….tar.json` — what is in it. In the table: size, rounds, which page versions went over the rounds (`pages`) and
which hint rules (`hv`), the buttons **Download** (the browser downloads it as a normal file; a broken download resumes)
and **Remove**. The archive takes as much room as `analysis/rounds`: with less free room (+1 GB to spare) the admin
page says so and doesn't start. The archive now has Glitch spot too: `glitch/stays.json`, `glitch/summary.json`, the
maps' grids (if together up to 300 MB), `.admin/glitch/`, `.admin/hints.json`. When the bar is near 100% — the archive,
and Claude (todo 227).

`analyze.sh status` now shows the background service's own lines (not only "Deactivated successfully"), what the last run
did and whether it is paused. A manual `analyze.sh start` ("Not running" in `status`) and the background service are
different things: "Not running" is only about the manual run.

To turn the background off completely — `BF2R_HINTS=0` in `/etc/bf2replay.conf` (the cards and Glitch spot stay as they
were); for a while — Pause on the admin page.

### The suspicion score (v214)

The card **Hints over his rounds** on the player's page (for admins) now starts with the **Suspicion score**: for each kind
of hint he had — how improbable his share of rounds with it is against all players (log10 of the chance, as in the card's
rows, at most 10 per kind; kinds with a chance worse than 1 in 10 and rule hints don't count), added up. Next to it — above
how many percent of the players with 10+ analysed rounds he stands, which kinds give the most, and by month: how many of
his rounds had a hint. The list of the highest scores — on the admin page, card **Background analysis** ("Highest
suspicion scores"). The score is for the review queue, not a verdict: it counts only rounds analysed with the current
hint rules.

### Field of view 90° (v216)

A soldier now sees **90°** across (45° to each side; up and down, as before, 63°) instead of 79° (a 4:3 screen). Nothing
to do after the update: the hint rules are version 4 — the background analysis goes over every round again by itself
(while it runs, the cards "Hints over his rounds" and the suspicion score count only rounds already gone over, so there
are fewer at first); the round summaries are version 14 — `ingest` sums up every round again from the decoded ones
(`summing up N rounds again (summary version 14 ...)` in the log, without decoding the demos again; 13 s for 25 rounds).
What changes: the view sector on the map, "In view" / "Seen by", who saw whom first, "Didn't see his killer", Wide view
(the band 47.5–67.5°), Reaction, Pre-aim.

### Field of view 16:9, the exact frame, the sights (v219)

A soldier sees what a **16:9** screen shows (since the 1.5 patch the game widens the picture with the screen's width):
**95°** across, 63° up and down. The view is the screen's exact frame (less is seen up and down at the edge of the
picture; looking down — wider near him). **Through the sights — narrower**, by weapon from the game files (pistols 80°,
rifles 63–72°, L85A1 43°, SVD / QBU-88 33°, M24 / L96A1 / M95 22°, a scope is round) plus 10° to spare on each side; not
for the one he is shooting at himself. Wide view — the band 50–70°; a player with a 21:9 (111°) or 32:9 monitor gets it
honestly, and the hint says so. Nothing to do after the update: the hint rules are version 5 (the background analysis
goes over every round by itself), the round summaries version 15 (`ingest` sums up every round again from the decoded
ones, `summing up N rounds again (summary version 15 ...)`; 39 s for 25 rounds). In the server's summaries the sights are
taken by kit and slot (a sniper with his rifle — the scope, a pistol — 0.8, the rest — 0.65), because only the page knows
the weapon in his hands.

## 21. Old demos: what to keep so that there is room (v186)

A round on the site lives in its decoded file (`data/rounds/*.bfr`, 5-7 MB): the map, the statistics, the hints, the
players' pages. The demo (`data/demos`, 20-35 MB — ~80% of a round's room) is needed for only two things: to decode the
round again when the decoder changed (as the SF rounds in v185), and to cut a clip for the game. So old demos can be
removed — the rounds stay and open as before (the page then offers to cut a game clip from the visitor's own demo).
Compressing the demos themselves harder doesn't work: xz gives −15-19%, zstd −10-12%.

(v202) Every round on the site has the button **⬇ Demo** (in the round's line over the map) and the link **Download the
demo** on its page `/rounds/<round>.html`: the demo from `data/demos/`. If the demo has already been removed — **Demo at
its source ↗**: a link to where it was downloaded from (`ingest.mjs` takes it from `data/.source-list.json` — the source
page still has it — or from `data/.fetched.json` — where it was downloaded from; it may no longer be there). A demo the
game server sent itself (§8) and that was then removed — the button "Demo removed".

Everything is on the admin page, card **Demos: what to keep**:

- how much room each thing takes: demos, decoded rounds, copies of rounds (`data/.copies`, the **Remove** button — these
  are the same demos already on the site, from a second page, §5), the analysis, the analysis browser, backups;
- **Keep the demos of the last N days** — the demos of rounds played in the last N days stay; older ones go (0 — none
  goes by age);
- **Demos may take at most N GB** — above that the least needed go: first those the source page still offers (they can
  come back), then the oldest (0 — no limit);
- **Keep the demos of rounds with hints for admins** — the demos of rounds with "suspicious" hints don't go (by the
  background analysis, §20; while it runs, a round it hasn't seen yet waits for it);
- **When the decoder changes, download a removed demo again…** — after a decoder update, `fetch.mjs` downloads again the
  rounds without a demo that the source page still has (so many at a time), `ingest.mjs` decodes them again, and the demo
  goes again;
- **What would go?** — what would go with these settings, before saving (how many, how many GB, which exactly); **Save**;
  **Remove now** — apply it now (otherwise within ≤ 2 min, with the next run of `ingest.mjs`);
- **Keep these demos** — rounds whose demo stays whatever the settings (a name, a link `…/r/<round>` or an id).

Never removed: a demo on the Keep list and the demo of a round still to be decoded again. When the disk is nearly full
(`BF2R_MIN_FREE_GB` + 2 GB, `BF2R_RAW_AUTOCLEAN`), fresh ones and those with hints go too — in the same order, until there
is room.

New service files in `data/`: `.demos.json` (the settings), `.demos-last.json` (what went last time and in all),
`.source-list.json` (which demos each page offers now), `.refetch.json` / `.refetch-done.json` (what to download again),
`.hint-rounds.json` (rounds with hints from the analysis). The web server doesn't serve `data/.*`.

```bash
journalctl -u bf2replay-ingest --since today | grep -i "demos removed\|decode again"
journalctl -u bf2replay-fetch --since today | grep -i "again"
```

## 22. The Admin tab of a round, and the servers' admins (v196; v197 — the parts; v198 — review)

Nothing for admins is visible to players any more: the tab **For admins**, the card **Hints over his rounds** and the
headshot chances on the player's page were taken off the public page — and **the code itself** of the hints (the rules and
thresholds of looking for cheats). It is now a separate file, `server/admin-round.js`, which `admin.mjs` hands out only
after logging in; the page runs it inside itself. The analysis data for admins — `data/.admin/` (the players' hint cards,
Glitch spot, headshot chances); the web server doesn't serve `data/.*`, the files go through `admin.mjs` after logging in.
The old public `data/stats/hints*` and `data/stats/glitch` were moved there by `ingest.mjs` itself at the first run of v196
(deleting nothing).

**Logging in.** Every round has the tab **Admin** (under the map, next to Round stats): a name and a password.
(v199) You can also log in from the main page: the **Admin** button at the top right (next to Tools) opens a login window;
it is on every page of the site when `admin.mjs` answers. After logging in the button says **Admin ✓**, and the window shows
who you are, **This round's Admin tab**, for you also the **Admin page** (`/admin`, the same login) and **Log out**. The
password: a field with dots; it is sent only by a POST request to `/admin/api/login` (even without a script — never in an
address), the field is cleared right after sending and when the window closes; it is not in the address, in localStorage
or in the page; the login cookie is HttpOnly (the page's scripts don't see it), SameSite=Strict, over https — Secure. If
the site is not opened over https, the window warns that the password would cross the network unencrypted.
- You (the site's owner): the name empty, the password — the admin page's one (`admin.mjs --set-password`). You see all
  servers. If you are already logged into the admin page, the tab opens at once.
- The servers' admins: on the admin page, the card **Servers' admins** — a name, a password (8+ characters) and ticks for
  the servers whose rounds he sees. There too — change the servers, a new password (it logs him out), **Remove**. The
  accounts — `data/.admin-users.json` (600, scrypt hashes only). The admin page (`/admin`) shows such accounts nothing.
- A login lasts 12 h (2 h without any activity); after an update of `admin.mjs` (a restart) — log in again.

**The Admin tab:** the round's hints (as For admins, the same list) with filters:
- **Player** (with his number of hints), **Side** (the team of the one the hint is about, at that moment);
- **Strength**: *all*; *without the minor ones* (the default: no team kills, claymores, AFK, spot spam, leaving the map);
  *strong only* — what normal play can't give (a teleport, speed, through a wall, beyond reach, a rate of fire or of flag
  capture, a guided missile, Glitch spot; No line of sight with the exact shapes and hidden 1 s+), or a share
  (headshots, reaction, triggerbot, pre-aim, wide view) that chance gives less often than once in 10,000;
- **Weapon**: small arms, sniper rifles, launchers, grenades and explosives, vehicles, emplacements, not a kill;
- **From / to** (mm:ss), **Players with N+ hints**; chips of the kinds with their counts.
A click — the moment on the map (Battle), ⟂ — the side view. A server's admin sees only the rounds of his servers (on
others — a note). Next to the map the tab **For admins** — also for admins only.

(v197) The Admin tab has four parts: **Hints** (above), **Players**, **Kills**, **The round**.
- **Players** — each soldier of the round: K, D, team kills; the hints about him (without the minor ones), of them the
  strong ones, of which kinds; **headshots** — his heads / small-arms kills with a known hit, his share, and what the same
  weapons would give anyone (red — by chance rarer than once in a million); **reaction** — the average from the first
  look at the victim to the kill (and how many faster than 0.25 s); **aim** — how far past the victim he looked at the
  moment of the kill; **without line of sight** — kills with no clear line at that moment; distance (average and
  longest), ping. Sorting by each column. **History** — his rounds on the site (when, on which servers), other names (clan
  tags), the hint card over all his rounds; the name — his page.
- **Kills** — every kill with the analysis numbers (the same as in the archive for Claude): time, killer and victim (with
  vehicles), weapon, distance and height difference, where it hit, line of sight (clear / how long it was missing), who
  saw whom first, reaction, aim, from the press to the kill, distance against the fog, smoke, ping, this kill's hints.
  Filters: player (killer / victim / either), weapon, distance from–to, time, team kills (with / without / only), only
  small arms on foot, only with hints. Sorting, **CSV** (every column), a click on the time — the kill on the map, ⟂ — the
  side view.
- **The round** — from the demo: server, map, time, length, soldiers and vehicles, records per second, **gaps in the
  recording**, what the decoder didn't recognise, who **joined later** (first spawn after 2:00), who **was gone before the
  end**, who **changed sides**; the **server's settings** from the demo (TK punishment, autobalance, spawn time and so on).
  From the server: when the round came onto the site, the demo (there / removed / goes at the next cleaning / on the
  "keep" list), when and from where it was downloaded, whether the page still lists it, copies, which decoder made it,
  the analysis (when, by which rules, whether it failed).
  (`admin.mjs`: `GET /admin/api/round?name=…`; a server's admin — only his servers.)

(v198) The fifth part — **Review**. Next to each hint in **Hints** three buttons: **✓** checked, nothing there; **✗** a
false alarm; **⚑** suspicious (it asks what you saw — that goes into the report). Clicking the same button again clears
the mark. The filter **Review**: all / *not reviewed, not trusted* (without the reviewed and without the trusted) / without
the trusted / only suspicious / reviewed. A mark is kept by the kind of hint, the player, the second and the victim — so it
stays when the round is worked out anew by new rules (if the hint is no longer there — it is in Review marked "not a hint
now", with what it said).
- **Players**: **★** by the name — a trusted player (it asks why). His hints stay, but not highlighted, and the filter
  "not reviewed, not trusted" hides them. Your ★ — on all servers; a server admin's ★ — only on his servers. It can be
  removed by the one who set it, or by you. **✎N** — notes about the player; in **History** — the list and a field for a new
  one (notes about a player are over all his rounds; every admin of the site sees them).
- **Review**: the marked hints (suspicious first; ▶ — the moment, a clip, × — clear), how many strong ones nobody has
  marked yet (a button — show them), notes on the round (seen by this round's admins; deleted by the author or by you), the
  trusted players of this round. **A report for the servers' admins**: ticks (suspicious, false, checked, strong unmarked,
  notes on the round and the players, links to the moments) — a text for Discord (**Copy**) or a page **Download .html**.
- Kept on the server in `data/.admin/review/` (`rounds/<round>.json`, `players/<nick>.json`, `trusted.json`); the web
  server doesn't serve it. The API of `admin.mjs` (POST, any admin, only his servers' rounds): `review-get`,
  `review-mark`, `review-note`, `trusted`.

(v224) The card **Servers' admins** is now **Users and access** (§23): the same accounts, each with its rights; the
accounts made before v224 keep what they had (they may watch everything and have the Admin tab of their servers).

For development: the page is built from `src/index.html` with `node server/splitpage.mjs` (the parts between
`// @admin-begin` and `// @admin-end` go into `server/admin-round.js`); Claude does it before each release; `analyze.mjs`
gives the admins' part to its browser itself.

## 23. Who may open the site: guests, accounts, the login (v224)

The site can be closed, as a whole or in parts, to visitors who are not logged in, and each person gets an account with
what he may open. Everything is on the admin page, card **Users and access** (the owner's only; the full description:
[docs/admin-guide.md](../docs/admin-guide.md#users-and-access), how it works: [docs/features.md](../docs/features.md#who-may-open-what)).

- **Guests** — ticks for the parts of the site: Watch rounds, All rounds, Players and maps, Records, Stats, Download demos,
  Video clips, and Link previews (the cards chat apps show under a link, and the map pictures of the round posts). All
  ticked: open, as before. Some unticked: those need a login. None: every page goes to the login page `/login`.
- **Accounts** — a name and a password, and in its row: the parts of the site (on top of the guests'), the **Admin tab**
  (hints and review of the rounds of **his servers**), and **cards of the admin page** he may see and use (Posts: his
  servers only; Users and access and Settings stay the owner's). A new account may watch everything but the demos.
- **One login** for the site, the Admin tab and the admin page: `/login`, the site's **Log in** button (it shows the name
  once logged in), the Admin tab, the admin page (a Name field: empty for the owner). 12 hours (2 without a visit), or
  with **Keep me logged in** 30 days (14 without a visit); the admin powers in any login last 12 hours (2 without a step),
  then the password again. The logins survive updates: `data/.sessions.json` (600, only the tokens' hashes); the cookie
  `bf2r_s` (HttpOnly, SameSite=Lax, Secure over https) on the whole site.

How the web server checks it: while some part is closed to guests, `admin.mjs` keeps the file `data/.access-gate`, and
Caddy asks `admin.mjs` about every request of the site before it answers (`forward_auth` to `/admin/api/gate`, with the
address the visitor asked for): a page he may not open goes to `/login?next=…` (after the login, back to it, with its
`#round=…`), a file gets 401 / 403. With the site open the file is not there and Caddy asks nothing. The new Caddy config
comes by itself with the update (`units.sh`; checked with `caddy validate` first). With nginx: the gate's blocks from
`nginx-example.conf` (`auth_request`, `/login`, the `map` line) have to be added by hand — nginx asks on every request.

New files in `data/`: `.access.json` (the guests' rights), `.access-gate` (the flag for Caddy), `.sessions.json` (the
logins); the accounts' rights are in `.admin-users.json`. The weekly copy (`backup.sh`) now has `.access.json`,
`.admin-users.json`, `.demos.json` and the admins' review `.admin/review/`. The login page is `server/login.html`.

```bash
ls -la /srv/bf2replay/data/.access-gate             # there: a part of the site is closed to guests
journalctl -u bf2replay-admin -n 30 --no-pager      # logins, "access for guests: …", accounts changed
curl -sI https://your-domain/data/rounds.json       # a guest: 200 open, 401 closed
```

Locked out (the owner's password forgotten): `sudo node /srv/bf2replay/repo/server/admin.mjs --set-password`. To open the
whole site from the console: `sudo rm /srv/bf2replay/data/.access.json` (guests then may open everything; the flag goes
within a minute).

# Installing and running the VPS

For the site's owner. Everything runs on one Ubuntu VPS; nothing is installed on the game servers (the VPS downloads
their demos from the web pages where they already publish them). Commands are for Ubuntu 22.04 / 24.04, run as a user
with `sudo`.

Contents: [1 What you need](#1-what-you-need) · [2 The GitHub repository](#2-the-github-repository) ·
[3 Prepare the VPS](#3-prepare-the-vps) · [4 Run install.sh](#4-run-installsh) ·
[5 Where demos come from](#5-where-demos-come-from) · [6 Settings](#6-settings-etcbf2replayconf) ·
[7 The admin password](#7-the-admin-password) · [8 Services and timers](#8-services-and-timers) ·
[9 Files on the VPS](#9-files-on-the-vps) · [10 Updating the site](#10-updating-the-site) ·
[11 Background analysis](#11-background-analysis-hints-for-admins) · [12 Posts and summaries](#12-posts-to-discord-and-telegram) ·
[13 Another web server (nginx)](#13-another-web-server-nginx) · [14 Game servers that upload](#14-game-servers-that-upload-their-demos) ·
[15 Disk space and old demos](#15-disk-space-and-old-demos) · [16 Backups](#16-backups) ·
[17 Everyday commands](#17-everyday-commands) · [18 Troubleshooting](#18-troubleshooting) ·
[19 Trying the site locally](#19-trying-the-site-locally)

## 1. What you need

| | |
|---|---|
| **VPS** | Ubuntu 22.04 or 24.04. Decoding the biggest demo (45 min, 64 players) takes ~600 MB of RAM; each demo decoded side by side takes up to ~1.2 GB. With less than 2 GB of RAM, add swap (§3). |
| **Disk** | a round with players = its demo (10–35 MB) + its decoded round (2–7 MB). Empty rounds (~400 KB) are dropped. Four live rounds a day ≈ 2–3 GB a month. Old demos can be removed while their rounds stay (§15). |
| **Ports** | 22, 80 and 443 open — in `ufw` and in the hoster's own firewall, if its panel has one. |
| **A domain** | for HTTPS and link previews. Free: [duckdns.org](https://www.duckdns.org) → `something.duckdns.org` → the VPS's IP. Without a domain the site works on `http://IP` only, and link previews lack pictures. |
| **GitHub** | a (private) repository with this folder; the VPS pulls updates from it. |
| **Software** | Node.js 22, Caddy, git, rsync — `install.sh` installs them. The background analysis adds Playwright + Chromium (~400 MB) on first use (§11). |

## 2. The GitHub repository

Once, on your computer:

1. On github.com: **New repository** → name `bf2-round-replay` → **Private** → no README → **Create**.
2. In a terminal, in the folder with the repository's files:

   ```bash
   git init -b main
   git add .
   git commit -m "BF2 Round Replay"
   git remote add origin git@github.com:YOUR_LOGIN/bf2-round-replay.git
   git push -u origin main
   ```

   If `git push` asks for a password or says *Permission denied (publickey)*, add your SSH key to GitHub (Settings → SSH
   and GPG keys), or use GitHub Desktop (File → Add local repository → Publish).
3. The VPS reads the repository with a read-only **deploy key**; `install.sh` makes it and tells you where to paste it (§4).

## 3. Prepare the VPS

**DNS** — before `install.sh` (Caddy asks for the certificate at once): an **A** record `replay.your-domain` → the VPS's
IP. Check from your computer: `dig +short replay.your-domain` prints the IP.

**Firewall:**

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
```

**Swap**, if the VPS has less than 2 GB of RAM:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 4. Run install.sh

Copy the `server` folder to the VPS and run the script as root:

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

| Variable | |
|---|---|
| `BF2R_REPO` | the repository: `git@github.com:…` for a private one (a deploy key is used), `https://…` for a public one. Required on the first run. |
| `BF2R_DOMAIN` | the site's name; Caddy gets its HTTPS certificate from Let's Encrypt by itself. Empty: plain `http://IP`. |
| `BF2R_FETCH_URLS` | where the demos are (§5). Can be left empty and filled in on the admin page later. |
| `BF2R_GIT_KEY` | the deploy key's file (default `/root/.ssh/GitHub_bf2_repo`). |
| `BF2R_BRANCH` | the branch to follow (default `main`). |
| `BF2R_WEB` | `caddy` (default) or `none` when another web server already uses ports 80/443 (§13). |

**The deploy key.** If `/root/.ssh/GitHub_bf2_repo` doesn't exist, the script makes it, stops at the step
*Repository* and prints the public half (`ssh-ed25519 AAAA… bf2replay@…`). In the repository on GitHub: Settings → Deploy
keys → Add deploy key, title `bf2replay VPS`, **don't** tick *Allow write access* → Add key. Then press Enter in the
script. An existing key is used as it is (it must have no passphrase). The script ignores `/root/.ssh/config`. Check the
key by itself:

```bash
sudo ssh -F /dev/null -i /root/.ssh/GitHub_bf2_repo -o IdentitiesOnly=yes -T git@github.com   # Hi YOUR_LOGIN/bf2-round-replay! ...
```

What the script does: installs Node.js 22, Caddy, git and rsync; makes the users `bf2replay` (runs everything) and
`bf2upload` (SFTP only, for game servers that upload, §14); clones the repository into `/srv/bf2replay/repo`; writes
`/etc/bf2replay.conf`; sets up Caddy and the systemd services and timers (§8). At the end it prints the site's address.
The first download starts at once (everything the demo pages list, newest first; rounds appear one by one as they are
decoded).

Running `install.sh` again is safe: data and keys stay. Values you don't give are taken from `/etc/bf2replay.conf`;
values you give replace them (`sudo BF2R_DOMAIN=new.domain bash install.sh`).

After that, set the admin password (§7) and open `https://replay.your-domain/admin`.

## 5. Where demos come from

The easiest place to manage sources is the admin page, card **Where demos come from** ([admin-guide.md](admin-guide.md#where-demos-come-from)).
`BF2R_FETCH_URLS` in `/etc/bf2replay.conf` holds the sources set on the VPS; the admin page adds its own.

A source can be:

| Written as | What `fetch.mjs` does |
|---|---|
| `http://1.2.3.4/demos/` | reads this page (a file list, HTML or an XML index) and takes every `*.bf2demo` link |
| `1.2.3.4` | asks the game server itself (GameSpy query, UDP 29900) where its demos are (`sv.demoIndexURL` / `sv.demoDownloadURL`) and its name; no answer: tries `http://1.2.3.4/` |
| `1.2.3.4:16567` | the same (16567 is the game port; the query goes to 29900) |
| `1.2.3.4:29901` | another query port (several servers on one machine) |
| `http://host/archive/s01/{YYYY-MM}/` | a page per month: the current and the previous month are read |

Several sources go on one line, separated by spaces, in quotes:
`BF2R_FETCH_URLS="http://85.17.145.41/karkand/demos/ 1.2.3.4 5.6.7.8:29901"`. No restart is needed.

Check where an address leads, downloading nothing:

```bash
sudo -u bf2replay node /srv/bf2replay/repo/server/fetch.mjs --probe 1.2.3.4 5.6.7.8:29901
# 1.2.3.4 (=XX= Server name) -> http://1.2.3.4/demos/ - 120 demos listed (newest: auto_2026_10_15_21_00_00.bf2demo)
sudo -u bf2replay node /srv/bf2replay/repo/server/fetch.mjs --list | tail -3     # what would be downloaded, how many MB, free disk
```

If `--probe` says the server names no demo page, or doesn't record demos, ask its admins for the address of the page.

How downloading works:

- Each page is read at its own interval (the admin page: from every minute to once a day, or off; default
  `BF2R_FETCH_EVERY`, 10 min). Only the file list is read; each demo is downloaded **once** (`data/.fetched.json`), newest
  first, from all servers mixed, with a pause between files (`BF2R_FETCH_PAUSE`).
- A demo still being written is left for later: the last demo of a page waits until it hasn't changed for 3 min; a demo
  followed by a newer one waits 30 s. With *every minute*, a round's post arrives ~1–3 min after the round ends.
- The round's server is read from the demo itself, so nothing needs labelling. Two servers' demos with the same file
  name: the second is saved with its address in front (`1.2.3.4_auto_….bf2demo`).
- The same demo on two pages (a clan's page and the server's own) is downloaded once (same name and size). Copies that
  are already there are moved to `data/.copies` and out of the statistics; links to them open the same round.
- `ingest.mjs` keeps a round only if at least `BF2R_MIN_PLAYERS` (2) were on the field; empty rounds and one-player rounds
  are dropped (kept in `data/empty` with `BF2R_KEEP_EMPTY=1`).

**Careful with big archives on the first run** (some pages list 1,000 demos of up to 70 MB per server): limit it with
`BF2R_FETCH_SINCE=2026-10-01` (no older demos) and `BF2R_FETCH_MAX=50` (at most 50 per run; the rest next time).

It's polite to tell the game server's admins that the site reads their demo page: one small page every few minutes,
each demo downloaded once.

## 6. Settings: /etc/bf2replay.conf

One `NAME=value` per line (quotes for values with spaces). Nothing needs restarting: the next run of each job reads the
new values (a new `BF2R_FETCH_EVERY` / `BF2R_FETCH_AT` within a minute). Settings marked **admin page** are better made
there; a value set here wins over the page.

**Downloading**

| Setting | What it does | Default |
|---|---|---|
| `BF2R_FETCH_URLS` | demo pages and game servers, space separated (§5) | empty |
| `BF2R_FETCH_EVERY` | minutes between reads of a page that has no interval of its own on the admin page; `0` = once a day at `BF2R_FETCH_AT` | 10 |
| `BF2R_FETCH_AT` | `HH:MM` (VPS clock) for once a day | 05:30 |
| `BF2R_FETCH_SINCE` | `YYYY-MM-DD`: don't download demos recorded earlier | empty = all |
| `BF2R_FETCH_MAX` | at most so many downloads per run | 0 = no limit |
| `BF2R_FETCH_MIN_BYTES` | skip smaller files (an empty round is ~400 KB) | 0 |
| `BF2R_FETCH_PAUSE` | seconds between two downloads | 1 |
| `BF2R_MIN_FREE_GB` | stop downloading when less than this is free | 3 |

**Decoding and keeping**

| Setting | What it does | Default |
|---|---|---|
| `BF2R_MIN_PLAYERS` | rounds with fewer players on the field are not published | 2 |
| `BF2R_KEEP_EMPTY` | `1` = keep the demos of dropped rounds in `data/empty` | 0 |
| `BF2R_JOBS` | demos decoded side by side (**admin page**: *Demos at once*) | 0 = admin page / automatic (cores and memory, ≤ 4) |
| `BF2R_RAW_KEEP_DAYS` | remove demos older than N days (**admin page**: *Demos: what to keep*) | 0 = as on the admin page |
| `BF2R_RAW_AUTOCLEAN` | `1`: below `BF2R_MIN_FREE_GB` + 2 GB free, remove the least needed demos until there is room (rounds stay) | 1 |
| `BF2R_HINTS` | `0` = no background analysis (§11) | 1 |

**Posts and summaries** (the rest is on the admin page)

| Setting | What it does | Default |
|---|---|---|
| `BF2R_TELEGRAM_TOKEN` | the Telegram bot's token (wins over the one saved on the admin page) | empty |
| `BF2R_NOTIFY_MIN_PLAYERS` | the default minimum of players for a round to be posted | 6 |
| `BF2R_DIGEST_AT` | when the day / week / month summaries go out | 10:00 |
| `BF2R_DIGEST_TZ` | the time zone of `BF2R_DIGEST_AT` | Europe/Bratislava |
| `BF2R_DISCORD_WEBHOOK`, `BF2R_TELEGRAM_CHAT` | old (before v194) single channel: copied once into the servers that had rounds, then not used | — |

**Backups**

| Setting | What it does | Default |
|---|---|---|
| `BF2R_BACKUP_KEEP` | weekly copies kept in `/srv/bf2replay/backup` | 6 |
| `BF2R_BACKUP_ROUNDS` | `1` = the decoded rounds (`data/rounds`) go into the copy too | 0 |

**Set by install.sh** (change them by running `install.sh` again): `BF2R_ROOT` (`/srv/bf2replay`), `BF2R_REPO`,
`BF2R_BRANCH`, `BF2R_DOMAIN`, `BF2R_GIT_KEY`.

**Rarely needed** (environment of the services): `BF2R_ADMIN_PORT` (the admin server's port on 127.0.0.1, 8781),
`BF2R_ADMIN_PASS_FILE` (`/etc/bf2replay-admin.json`), `BF2R_ADMIN_SYSTEMCTL`, `BF2R_ADMIN_SUDO`, `BF2R_ADMIN_JOURNALCTL`
(paths of those tools), `BF2R_CHROMIUM` (a browser for the analysis instead of Playwright's).

## 7. The admin password

Set on the VPS, once (asked twice, not shown on screen); the same command changes it, nothing needs restarting:

```bash
sudo node /srv/bf2replay/repo/server/admin.mjs --set-password
```

Only its scrypt hash is kept, in `/etc/bf2replay-admin.json` (root:bf2replay, 640) — never in the repository; a new one
logs the owner out everywhere. The same password with an empty name logs you in everywhere: the admin page, the site's
**Log in**, the Admin tab of every round, `/login`. A login lasts 12 hours (2 without a visit), or 30 days with "keep me
logged in"; the admin powers in it 12 hours (2 without a step). Five wrong passwords from one address pause logins from
it for 15 min; after 30 wrong ones an hour from everywhere, the addresses that got one wrong wait too.

**Who may open the site** — open to everyone (as installed), or closed, whole or in parts, to visitors who are not logged
in, with an account (name, password, what it may open) for each person: the admin page, card **Users and access**
([admin-guide.md](admin-guide.md#users-and-access)). Nothing to set up on the VPS for it with Caddy (`units.sh` puts the
gate into its config); with nginx see §13. How it works: [features.md](features.md#who-may-open-what).

## 8. Services and timers

All are systemd units, installed and kept up to date by `units.sh` (run by every update). Decoding runs as `bf2replay`;
`git pull` runs as root with the deploy key.

| Unit | When | What |
|---|---|---|
| `caddy` | always | the web server, HTTPS, `/admin` proxy |
| `bf2replay-admin` | always | the admin server (`admin.mjs`, Node on 127.0.0.1:8781) |
| `bf2replay-fetch.timer` | every minute | reads the demo pages that are due, downloads new demos to `upload/incoming` |
| `bf2replay-ingest.path` / `.timer` | when a file arrives; every 2 min | decodes new demos, publishes rounds, statistics, pages; posts rounds |
| `bf2replay-update.timer` | every minute | `git pull`; a new commit → publishes `site/`, updates units, starts reprocess |
| `bf2replay-reprocess` | after an update | decodes again the rounds made by an older decoder |
| `bf2replay-rebuild` | by hand | decodes every kept demo from scratch |
| `bf2replay-hints.timer` | 5 min after each run ends | background analysis: Glitch spot, rounds in the page, players' hint cards, admin alerts |
| `bf2replay-digest.timer` | every 10 min | sends the day / week / month summaries that are due |
| `bf2replay-backup.timer` | Sundays 04:40 | the weekly backup |
| `bf2replay-analyze` | by hand (`analyze.sh start`) | the analysis of many rounds at once (§11) |

Only one decoding job runs at a time (`ingest`, `reprocess` and `rebuild` share the lock `data/.ingest.lock`); the
others wait in the state *running*. A decoding run that sees a site update finishes the demos it has started and ends,
so the new code takes over. A sudoers rule (`/etc/sudoers.d/bf2replay-admin`) lets the admin page only
`systemctl start --no-block` these services (and stop decoding).

## 9. Files on the VPS

```
/etc/bf2replay.conf            settings (§6)
/etc/bf2replay-admin.json      the admin password's hash
/srv/bf2replay/
  repo/                        the clone of GitHub
  site/                        what visitors get (repo/site, published by update.sh)
  upload/incoming/             demos waiting to be decoded (downloads and uploads)
  data/
    demos/                     the demos of the rounds on the site
    rounds/                    decoded rounds (<round>.<decoder>.bfr)
    rounds.json                the light list of rounds (public); .rounds-full.json — the full one (server only)
    stats/                     numbers over all rounds: players/, maps/, table*.json, clans, vehicles, servers, find/
    www/                       static pages: /rounds/ /players/ /maps/ /records/, rss.xml, sitemap.xml, robots.txt
    share/                     link previews /r/<round> and /p/<player>
    heat/  .kills/             kill points per map (heat maps)
    bad/                       demos the decoder could not read
    empty/                     dropped rounds (only with BF2R_KEEP_EMPTY=1)
    .copies/                   the second copies of demos listed on two pages
    .admin/                    admin-only: hints cards, Glitch spot, review marks and notes, alerts sent
    .notify.json               posts, summaries, webhooks, bot token (600)
    .admin-users.json          accounts: scrypt hashes, servers, rights (600)
    .access.json               what guests may open (600); .access-gate - there while a part is closed to them
    .sessions.json             the logins (600: hashes of the tokens)
    .fetched.json .fetch-sources.json .fetch-due.json .source-list.json   downloading
    .demos.json .demos-last.json .refetch*.json .hint-rounds.json         which demos to keep
    .ingest.json .ingest-stats.json .resum-request.json                   decoding settings and measurements
  analysis/                    the background analysis: rounds/, archives bf2-analysis-*.tar, .auto-set.json
  analyze/                     Playwright + Chromium for the analysis
  backup/                      weekly copies (§16)
```

The web server never serves `data/.*`, `data/logs`, `data/empty` or `data/bad`; the admin-only files go out only through
`admin.mjs` after logging in.

## 10. Updating the site

The VPS looks at GitHub every minute, so **publishing a new version = `git push`**. Within a minute `update.sh` pulls
it, publishes `site/` and updates the services. Don't want to wait: `sudo systemctl start --no-block bf2replay-update`.

A release can come as one archive `bf2-round-replay-vNN.zip` (the whole repository). Unpack it over your clone and push:

```bash
V=v228   # the version in the archive's name
rm -rf /tmp/bf2-round-replay-$V && unzip -q -o bf2-round-replay-$V.zip -d /tmp/bf2-round-replay-$V
rsync -a --delete --exclude .git /tmp/bf2-round-replay-$V/ path/to/your/clone/
cd path/to/your/clone && git add -A && git commit -m "$V" && git push
```

What happens after an update, by itself:

| What changed | What the server does | Where to watch |
|---|---|---|
| the decoder (its hash) | every round that still has its demo is decoded again (5–15 s a round, several at once); the site works meanwhile; "Updating rounds 25% · ~40 min" in the site's header | admin page *Being decoded*, `sudo bf2replay-status` |
| the round summaries (`SUM_V`) | every round is summed up again from its `.bfr` (no decoding; ~0.2–0.5 s a round), then the statistics, Records and pages are rewritten | `journalctl -u bf2replay-ingest \| grep -i summ` |
| the hint rules (`HINTS_V`) | the background analysis goes over every round again (hours to a day or two); since v225 also each round once it has been decoded again by a new decoder | admin page *Background analysis* |

Open pages notice a new version (they check `version.json` every 2 min) and show **A new version is out · Reload**;
Reload reopens the same moment of the same round.

**Rolling back**: `git revert HEAD && git push` — the previous version is back within a minute.

## 11. Background analysis (hints for admins)

The admin hints, the players' hint cards, the suspicion score, Glitch spot and the alerts to the admins' Discord channel
are worked out by `analyze.mjs`, which opens each round in the site's own page in a headless Chromium. Install it once
(Playwright + Chromium into `/srv/bf2replay/analyze`, a few minutes, ~400 MB) by starting one run:

```bash
sudo bash /srv/bf2replay/repo/server/analyze.sh start      # the first time installs Playwright; then analyses rounds
sudo bash /srv/bf2replay/repo/server/analyze.sh status     # how far; the last lines; the archive and how to copy it
sudo bash /srv/bf2replay/repo/server/analyze.sh stop       # stop (rounds in progress finish; an archive is made)
sudo bash /srv/bf2replay/repo/server/analyze.sh glitch     # Glitch spot over all rounds at once (~40 min for thousands)
sudo bash /srv/bf2replay/repo/server/analyze.sh hints      # rebuild the players' hint cards now
sudo bash /srv/bf2replay/repo/server/analyze.sh pack       # an archive of what is done (for tuning the thresholds)
```

Options after `start`: `--jobs 2`, `--limit 500`, `--maps strike_at_karkand`, `--min-players 6`, `--since 2026-10-01`,
`--fresh` (do again rounds already done). A manual run uses 1–3 browsers at once (~1.5 GB each), at low CPU and disk
priority; each round takes 5–30 s.

After that the timer `bf2replay-hints` keeps going by itself: Glitch spot over 150 new rounds, then 40 rounds in the page
(new ones first, then those made by older hint rules), then the players' cards — every 5 minutes after the last run
ended. It is controlled on the admin page (*Background analysis*: Run now, All rounds now, Pause / Go on, archive for
Claude). `BF2R_HINTS=0` turns it off for good.

## 12. Posts to Discord and Telegram

Everything is set on the admin page, card **Posts about new rounds** ([admin-guide.md](admin-guide.md#posts-about-new-rounds)).
On the VPS only two things matter: the site needs `BF2R_DOMAIN` for links and pictures in posts, and the webhooks and
the bot token are kept only in `data/.notify.json` (600, owner `bf2replay`). From the console:

```bash
sudo -u bf2replay node /srv/bf2replay/repo/server/notify.mjs --test 'Server name'      # a test post of this server
sudo -u bf2replay node /srv/bf2replay/repo/server/digest.mjs --show week 'Server name' # show a summary, don't send
sudo -u bf2replay node /srv/bf2replay/repo/server/digest.mjs --post day 'Server name'  # send a summary now
cd /srv/bf2replay/repo/server && sudo -u bf2replay node alerts.mjs --test 'Server name' # a test to the admins' channel
journalctl -u bf2replay-ingest | grep 'round post'                                     # what was posted and why not
```

## 13. Another web server (nginx)

If something already listens on 80/443, `install.sh` stops. Run it with `BF2R_WEB=none` (Caddy is not installed) and
set nginx up from `server/nginx-example.conf`: the site root, `/data/` (with its private paths returning 404), the link
previews `/r/` and `/p/`, the static pages `/rounds|players|maps|records`, `rss.xml`, `sitemap.xml`, `robots.txt`, and
the proxy for `/admin` and `/login` to `127.0.0.1:8781`, and (v224) the gate: `auth_request /_bf2r_gate` with its
`location`, `error_page 401 / 403` to the login, and the `map $http_sec_fetch_mode` line in the http block. HTTPS:
`certbot --nginx -d replay.your-domain`. Keep `charset utf-8;` in the `server { }` block. With Caddy all of this is done
and kept up to date by `units.sh`; with nginx, new blocks in future versions have to be added by hand.

With nginx every request of the site asks `admin.mjs` first (Caddy asks only while the site is closed in part): while
the site is open the answer is "yes" at once, but if `admin.mjs` is down, nginx answers 500 until it is back (systemd
restarts it at once).

## 14. Game servers that upload their demos

Not needed when a server publishes its demos on a web page. For a server you control, `gameserver/` has a script
(Linux cron or a Windows scheduled task) that every 2 minutes sends new `.bf2demo` files over SFTP to one or more sites,
each file once, under a temporary `.part` name first. See [gameserver/README.md](../gameserver/README.md).
On the VPS, add the server's public key, one line per server:

```bash
echo 'ssh-ed25519 AAAA… bf2-server-1' | sudo tee -a /etc/ssh/bf2replay_keys/bf2upload
```

The user `bf2upload` can only put files into `incoming/` (no shell, no tunnels, nothing else on the disk). A demo you
have yourself can be added by hand too:

```bash
sudo install -o bf2replay -g bf2replay -m 644 /tmp/auto_….bf2demo /srv/bf2replay/upload/incoming/
```

## 15. Disk space and old demos

A round lives in its decoded file; the demo is needed only to decode the round again after a decoder change and to cut a
clip for the game. So old demos can go while the rounds stay on the site. Set it on the admin page, card **Demos: what to
keep** ([admin-guide.md](admin-guide.md#demos-what-to-keep)): keep the last N days, a GB limit, keep rounds with admin
hints, a list of demos to keep always, and download a removed demo again when the decoder changes (if its page still has
it). A demo no page lists any more doesn't go for its age (only the GB limit or a nearly full disk removes it): its round
could not be decoded again without it. Compressing demos doesn't pay (xz −15–19 %, zstd −10–12 %).

Safety nets: below `BF2R_MIN_FREE_GB` (3 GB) free, downloading stops; below 3 + 2 GB, `ingest.mjs` removes the least
needed demos until 5 GB are free (`BF2R_RAW_AUTOCLEAN=0` turns that off). A demo on the Keep list, and a demo whose round
still needs decoding again, never goes.

## 16. Backups

`bf2replay-backup` (Sundays 04:40, or `sudo systemctl start bf2replay-backup`) writes
`/srv/bf2replay/backup/bf2replay-YYYY-MM-DD.tar.gz` with what the demos can't give back: `rounds.json`,
`.rounds-full.json`, the round logs, `.fetched.json`, the admin page's settings (`.fetch-sources.json`, `.notify.json`,
`.ingest.json`, `.demos.json`), who may open what (`.access.json`, the accounts `.admin-users.json`), the admins' review
(`.admin/review/`) and `/etc/bf2replay.conf` — and with `BF2R_BACKUP_ROUNDS=1` the decoded rounds (the only copy of a round
whose demo is gone). The last `BF2R_BACKUP_KEEP` copies are kept; a copy that wouldn't leave `BF2R_MIN_FREE_GB` free is
skipped.

The copy is on the same disk — keep one elsewhere: `scp 'root@VPS:/srv/bf2replay/backup/bf2replay-*.tar.gz' .` (on your computer).
Not in the weekly copy: the admin password (`/etc/bf2replay-admin.json`; set it again with `--set-password`) and the
logins (everyone logs in again). Everything else (statistics, pages, previews) is rebuilt from the demos and rounds (`ingest.mjs --rebuild`).

## 17. Everyday commands

```bash
sudo bf2replay-status                                   # site version, decoding again (%), services, last log lines
watch -n 10 sudo bf2replay-status                       # the same, every 10 s
systemctl list-timers 'bf2replay-*'                     # when each job ran and runs next
journalctl -u 'bf2replay-*' -f                          # everything, live
journalctl -u bf2replay-fetch -u bf2replay-ingest -f    # downloading and decoding, live
journalctl -u bf2replay-reprocess -f                    # decoding again: "round … [45/480 9%, ~1 h 10 min left]"
sudo systemctl start --no-block bf2replay-fetch         # download new demos now
sudo systemctl start --no-block bf2replay-update        # pull GitHub now
ls /srv/bf2replay/upload/incoming | wc -l               # demos waiting
df -h /srv/bf2replay                                    # disk
```

Most of this is also on the admin page (cards *Services*, *Being decoded*, *Disk*, *Log*).

## 18. Troubleshooting

**`install.sh` stops at `apt-get update` (`E: …`).** Usually an old Webmin source with a key Ubuntu 24.04 no longer
accepts:

```bash
grep -rn webmin /etc/apt/sources.list /etc/apt/sources.list.d/
sudo sed -i 's|^deb .*download.webmin.com/download/repository.*|# &|' /etc/apt/sources.list /etc/apt/sources.list.d/*.list
curl -o /tmp/webmin-setup-repo.sh https://raw.githubusercontent.com/webmin/webmin/master/webmin-setup-repo.sh
sudo sh /tmp/webmin-setup-repo.sh && sudo apt-get update
```

(Webmin listens on 10000: after `ufw enable` allow it only from your IP: `sudo ufw allow from YOUR_IP to any port 10000 proto tcp`.)

**Demos that failed** ("could not read" in the log; they wait in `data/bad`): after an update, admin page → *Being
decoded* → **Try them again**, or:

```bash
sudo mv -n /srv/bf2replay/data/bad/*.bf2demo* /srv/bf2replay/upload/incoming/
sudo chown bf2replay:bf2replay /srv/bf2replay/upload/incoming/*.bf2demo*
```

**Decoding again shows *running*, but the old rounds don't get fewer.** Another decoding job holds the lock (for example
`ingest` with a big batch); it ends within 2 hours, or stop it (admin page **Stop**, or `sudo systemctl stop
bf2replay-ingest`). Nothing is lost: demos stay in the queue.

**A service failed.** Admin page → *Log* → that service; or `journalctl -u bf2replay-NAME -n 50 --no-pager`. Then its
button on *Services* (or `sudo systemctl start --no-block bf2replay-NAME`).

**Records or players' numbers look wrong.** Admin page → *Rounds* → **Recalculate all records** (every round summed up
again from its decoded file, no decoding).

**`data/.rounds-full.json` lost.** The players of the round list are missing; `ingest.mjs` won't overwrite the statistics
with empty ones and says so in the log. Decode everything again: `sudo systemctl start bf2replay-rebuild`.

**Decode everything from the demos:**

```bash
sudo -u bf2replay flock /srv/bf2replay/data/.ingest.lock node /srv/bf2replay/repo/server/ingest.mjs --rebuild
```

**Start again from the demo pages** (download whatever they still list and decode from scratch):

```bash
sudo bash /srv/bf2replay/repo/server/redownload.sh             # 1. just look: how many demos, how much room, which rounds would be lost
sudo bash /srv/bf2replay/repo/server/redownload.sh --go        # 2. move the old data to data/old-<date>, download and decode again
sudo bash /srv/bf2replay/repo/server/redownload.sh --drop-old  # 3. once the site is fine: delete data/old-*
```

**Admin page buttons answer "could not start".** `sudo` is missing on the VPS (`apt install sudo`) or the sudoers rule
didn't install (see `journalctl -u bf2replay-update`).

**Posts don't arrive.** The server's block on the admin page says why under *last post*; *Send a test post*; posts go only
for rounds with enough players, played in the last 12 h, and never for clips.

## 19. Trying the site locally

```bash
cd site && python3 -m http.server 8000      # in your clone
```

Open http://localhost:8000 — without `data/` the site is a plain viewer (**Tools ▾ → Open .bf2demo**).

For development: the page is built from `src/index.html` with `node server/splitpage.mjs` (the parts between
`// @admin-begin` and `// @admin-end` go into `server/admin-round.js`, served only to logged-in admins).

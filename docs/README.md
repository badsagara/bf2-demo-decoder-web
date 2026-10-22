# BF2 Round Replay — documentation

BF2 Round Replay is a web site that replays Battlefield 2 rounds from their `.bf2demo` files (the game's Battle
Recorder). It shows the round on the map: where every soldier and vehicle went, who killed whom and from where, flags,
tickets, and who could see whom. A small VPS downloads new demos from the game servers' demo pages, decodes them, and
publishes rounds, player pages, maps, records and statistics. It can also post each round to Discord and Telegram, and
it gives the servers' admins a private set of tools for checking suspicious play.

This folder documents version **v223**. [CHANGELOG.md](../CHANGELOG.md) has what every version changed, and
[server/INSTALL.md](../server/INSTALL.md) has the detailed notes on each part of the server.

## Which document to read

| You are… | Read |
|---|---|
| the site's owner, setting up or running the VPS | [install.md](install.md): install, configure, update, back up, fix |
| the owner or an admin of a game server | [admin-guide.md](admin-guide.md): the admin page `/admin`, posts and summaries, the Admin tab of a round, review |
| an admin who needs to know what each hint means | [admin-hints.md](admin-hints.md) (**for admins only** — don't share it with players) |
| a player or a visitor | [user-guide.md](user-guide.md): watching rounds, player pages, records, statistics, clips |
| anyone who wants to know how a number is worked out, and where its limits are | [features.md](features.md): what a demo holds, visibility, distances, records, statistics, posts, hints, demo storage |

## The parts

```
site/         the web site: index.html (the replay viewer and all its pages) + assets/ (map pictures, game icons,
              wall and terrain shapes for "who could see whom", vehicle models, link-preview pictures)
server/       the VPS: install.sh (installs everything in one run), fetch.mjs (downloads demos), ingest.mjs (decodes
              and publishes), notify.mjs / digest.mjs / alerts.mjs (posts, summaries, admin alerts), admin.mjs +
              admin.html (the admin page), analyze.mjs / glitch.mjs (background analysis), demos.mjs (which old demos
              to remove), update.sh / units.sh (updates from GitHub, systemd units, Caddy), backup.sh, status.sh
src/          the page's source; `node server/splitpage.mjs` builds site/index.html (public) and
              server/admin-round.js (the admins' part, served only after logging in)
gameserver/   optional: a script for a game server that uploads its demos itself (Linux or Windows)
docs/         this documentation
```

## How it works

```
game server's demo page ──(fetch.mjs, each page at its own interval)──► VPS: upload/incoming/
(a web folder of .bf2demo files)                                         │
                                                                         │ ingest.mjs: decode with the page's own
                                                                         │ decoder → .bfr (≈6× smaller), summary,
                                                                         │ statistics, static pages, link previews;
                                                                         │ rounds without players are dropped
                                                                         ▼
          data/rounds.json + data/rounds/*.bfr + data/stats/ + data/www/ + data/share/
                 │                    │                      │
                 │ Caddy (HTTPS)      │ notify.mjs           │ analyze.mjs --auto (background)
                 ▼                    ▼                      ▼
     browser: the site        Discord / Telegram post   admin hints, Glitch spot, players' hint cards,
     (a round opens in 1–3 s)  (+ digest.mjs summaries)  alerts to the admins' Discord channel

GitHub repository ──(update.sh: git pull every minute)──► site/ on the VPS; a changed decoder → every round decoded again
```

The decoder, the statistics and the hints are one code base: the server runs the same JavaScript as the page (it takes
the decoder and the statistics code out of `site/index.html`, and opens the page in a headless browser for the hints).
So the numbers on the site, in the posts and in the admin tools always agree.

Without a server, `site/index.html` is also a plain viewer: open it in a browser and use **Tools ▾ → Open .bf2demo**
(see [user-guide.md](user-guide.md#on-your-own-computer)).

## Words used in these documents

| Word | Meaning |
|---|---|
| demo | a `.bf2demo` file the game server records for every round |
| demo page | a web folder where a game server publishes its demos (for example `http://85.17.145.41/karkand/demos/`) |
| round | one decoded demo on the site; its name is the demo's name, e.g. `auto_2026_10_11_20_17_46` |
| `.bfr` | a decoded round (`data/rounds/<round>.<decoder>.bfr`); the site loads it instead of the demo |
| summary | each round's numbers (players, kills, highlights), worked out from the `.bfr`; its version is `SUM_V` |
| decoder hash | when the decoder changes, every round with a demo is decoded again by itself |
| hint | an admin-only mark on a moment worth a closer look (possible cheating or a rule break); not proof |
| hint rules version | `HINTS_V`; when it changes, the background analysis goes over every round again |
| the owner | the person who runs the VPS and logs into `/admin` |
| server admin | an account the owner makes for a game server's admins: it sees the Admin tab of that server's rounds |

## Credits

The decoder's record layouts build on [Kakarotto22/bf2-replay-viewer](https://github.com/Kakarotto22/bf2-replay-viewer)
(MIT); the sharp map pictures are scaled down from Deine-Augen's
[High Definition Minimap](https://www.moddb.com/addons/high-definition-minimap). Details and the licence are in the main
[README](../README.md#credits-and-third-party-code).

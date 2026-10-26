# Admin guide

For the site's owner and for the admins of the game servers. Part 1 is the admin page `/admin` (the owner's; an account
sees the cards it was given), including **who may open the site** ([Users and access](#users-and-access)). Part 2 is what
admins see on the site itself after logging in: each round's **admins' page** (**Review ↗** in the header — v243; it
holds what were the Admin tab and the For admins tab next to the map), and the hint cards on players' pages. Part 3 is how to work with hints. What every hint means is in
[admin-hints.md](admin-hints.md); how the numbers behind them are worked out is in [features.md](features.md).

> Admin tools and hints are deliberately not visible to players: the hint rules and thresholds are not in the public
> page at all. Keep this guide and `admin-hints.md` among admins.

Contents: [Part 1 — the admin page](#part-1--the-admin-page-admin) · [Users and access](#users-and-access) · [Part 2 — admins on the site](#part-2--admins-on-the-site) ·
[Asking the statistics](#asking-the-statistics-v244) · [Part 3 — working with hints](#part-3--working-with-hints) · [Security](#security)

---

## Part 1 — the admin page (/admin)

`https://your-domain/admin`: the owner logs in with an empty name and the password set on the VPS
([install.md §7](install.md#7-the-admin-password)); an account given cards of this page logs in with its own name and
sees only those cards ([Users and access](#users-and-access)). It shows the state of the VPS, starts its jobs and holds every setting that isn't in `/etc/bf2replay.conf`. Nothing on
it deletes rounds. Each card has a short explanation under its title; the card **How to use this page** at the bottom
lists the usual tasks. The page refreshes itself.

### Rounds

How many rounds the site has, how many were made by an older decoder (they are decoded again by themselves after an
update), the rounds of each game server, and the newest round with when it came.

**Recalculate all records** sums every round up again from its decoded file (no decoding, ~0.5 s a round; the site stays
up) and then rewrites Records, the players' and maps' pages and the numbers over all rounds. Use it when Records or a
player's numbers look wrong. While it runs: "working: N / M rounds"; then "last time …: N rounds in … min". If an update
stops it halfway, the next decoding run goes on with the rest.

### Being decoded

- the demos waiting in `upload/incoming`, and after an update how far **decoding again** is (done / left, time left);
- what is being decoded right now, since when, and which jobs wait for their turn; **Stop** ends a decoding run (what it
  hasn't done waits for the next run, nothing is lost);
- **Failed demos**: those the decoder could not read (`data/bad`). **Try them again** puts them back in the queue —
  worth it after each update;
- **Demos at once**: how many demos are decoded side by side — *automatic* (CPU cores and ~1.2 GB of memory each, at most
  4) or 1–16. The change takes effect within seconds. The table under it shows what was measured on this VPS with each
  number: **MB a min** (higher is faster) and **Each took**; the fastest is green. To find the best number: pick one,
  start **Decode old rounds again** (or wait for a batch of new demos), read the table, try the next number. More than
  the CPU cores rarely helps; if number × 1.2 GB exceeds the free memory the page warns you. **Clear** forgets the
  measurements. `BF2R_JOBS` in the config, if set, wins (the page then shows it with that tag).

### Disk, last download

Free space and when the demo pages were last read. When the disk is nearly full, the least needed demos go first (see
the next card); rounds always stay.

### Demos: what to keep

How much room each thing takes (demos, decoded rounds, copies of rounds, the analysis, the analysis browser, backups),
and which old demos to remove. A removed demo's round stays on the site and opens as before; only decoding it again and
cutting a game clip need the demo (and the clip can then be cut from the visitor's own copy).

- **Keep the demos of the last N days** — older ones go (0: none goes by age).
- **Demos may take at most N GB** — above that the least needed go: first those the source page still offers (they can
  come back), then the oldest (0: no limit).
- **Keep the demos of rounds with hints for admins** — rounds with "suspicious" hints keep their demo (from the
  background analysis; a round it hasn't seen yet waits for it).
- **Whatever the days, keep a demo no page lists any more** (on by default) — a demo that can't be downloaded again
  doesn't go for its age: without it its round could never be decoded again after a decoder change. Only the GB limit
  (oldest first) or a nearly full disk removes it.
- **When the decoder changes, download a removed demo again…** — rounds without a demo whose source page still has it
  are downloaded again (so many at a time), decoded again, and the demo goes again. A round whose demo is gone and that
  no page lists any more stays as it was (card **Rounds** counts these apart).
- **What would go?** shows what these settings would remove (how many, how many GB, which) before you save; **Save**;
  **Remove now** applies them at once (otherwise within 2 minutes, with the next decoding run).
- **Keep these demos** — rounds whose demo stays whatever the settings: a round's name, its link `…/r/<round>` or id.
- **Copies of rounds** → **Remove**: second copies of demos listed on two pages (the same rounds are on the site).

Never removed: a demo on the Keep list and a demo whose round still has to be decoded again.

### Services

Each job of the VPS with its state (*running*, *idle* — waiting for its next time — or *failed*: then look at its lines
in **Log**), its last run and next run, and a button that starts it now:

| Service | Button | What it does |
|---|---|---|
| Decode waiting demos | Decode now | the new demos in the queue (also runs by itself when a demo arrives, and every 2 min) |
| Decode old rounds again | Start | the rounds an older decoder made (starts by itself after each update) |
| Decode every round again | Start | every kept demo from scratch — hours with many rounds |
| Download new demos | Fetch now | reads every demo page and game server now (each is also read at its own interval) |
| Update from GitHub | Update now | the site and the server scripts (it looks every minute by itself) |
| Back up | Back up now | the round list, logs and settings into `/srv/bf2replay/backup` (Sundays by itself) |
| Hints over all rounds | Run now | Glitch spot, a few rounds in the page, the players' hint cards |

### Background analysis

How far the analysis is: rounds done with the current hint rules (and how many with older rules or not yet), the last
run, when everything will be done, how many maps already have 30+ rounds in their Glitch spot grid. "running now: 12 of
40 rounds" and what the last run did (rounds done, left, whether it waited for a manual `analyze.sh start`, whether
Playwright is missing, whether everything is done).

- **Run now** — a run at once instead of waiting 5 minutes (it also lifts a pause).
- **All rounds now** — no 40-round limit, several rounds at once (up to 3, by cores and memory), run after run until all
  are done — after an update that changes the hint rules. **Back to 40 a run** ends it.
- **Pause** / **Go on** — the rounds in progress finish, then nothing until Go on (e.g. while the VPS is busy decoding).
- **Its log** — its lines in the Log card.
- **Highest suspicion scores** — the players to look at first, with links to their pages and to the Admin tab of their
  rounds (see [Part 3](#suspicion-score)).
- **Archive for Claude** — every analysed round's numbers in one file, used to tune the hints' thresholds. **Make the
  archive** (in the background, a few minutes), then **Download** (resumes if interrupted) and **Remove** it here
  afterwards. The table shows its size, rounds, and which page versions and hint rules made them. It needs as much free
  room as `analysis/rounds` plus 1 GB.

The page part of the analysis needs Playwright, installed by one `analyze.sh start` ([install.md §11](install.md#11-background-analysis-hints-for-admins)).

### Hint thresholds

(v227) Whether the site uses our recommended thresholds for the hints or its own: "all 148 recommended", or how many are
changed and which hints are off, by whom and when, each changed one with its recommended value beside it, and the hint
rules now (`7` while all are recommended, `7.<code>` with the site's own). **Open the editor** opens it in the site's
page (see [Part 3](#thresholds-the-sites-and-your-own)). The owner's card, or an account's with the right *Hint
thresholds: the site's* (and the Admin tab).

### Where demos come from

The demo pages and game servers new demos are downloaded from: those from `BF2R_FETCH_URLS` (changed in
`/etc/bf2replay.conf`) and those added here.

- **read** — how often each is looked at: *as all* (`BF2R_FETCH_EVERY`, 10 min by default), *every minute*, 2, 3, 5, 10,
  15, 30 min, 1, 3, 6, 12 h, *once a day* (at `BF2R_FETCH_AT`) or *off*; next to it, when it was last read.
- The field at the bottom: a page's address or a game server's IP (`1.2.3.4`, `1.2.3.4:29901`). **Check** reads it now
  and says what is there (the server's name, its demo page, how many demos, the newest) — downloads nothing. **Add**.
- **Remove** — no more downloads from it; its rounds stay.
- **What would be downloaded?** — the new demos on every page, how many MB, and the free disk.

### Posts about new rounds

After each new round, a post in a Discord channel and / or a Telegram chat: map and time, who won and the tickets, how
long, players and kills, the best three, the server, a link to the round (the chat shows the map picture under it).
**Each game server has its own channels and its own post**; a server that isn't set up is not posted at all — it is
just listed (with its rounds in the last 30 days) until you set it up.

At the top:

- **Telegram bot** (one for all servers): in Telegram, @BotFather → `/newbot` → copy the token → **Save the bot**. Add the
  bot to each group (to a channel as an administrator). `BF2R_TELEGRAM_TOKEN` in the config wins over it.
- **Rounds with … players or more** — the default minimum (6).

Click a server's name to open its block:

- **Discord** — on / off and the webhook: in Discord, the channel's settings (gear) → Integrations → Webhooks → New
  Webhook → Copy Webhook URL → paste → **Save** (it switches on by itself); **Remove** forgets it.
- **Telegram** — on / off and the chat: `@name` for a public channel; for a group its id (write in the group, open
  `https://api.telegram.org/bot<token>/getUpdates`, take `"chat":{"id":-100…}`) → **Save**.
- **Rounds with … players or more** — this server's own minimum (empty: the default). Smaller rounds are neither posted
  nor counted in its summaries.
- **Preview** — the post about its newest round as it would look (nothing is sent); **Send a test post**; **Post its
  newest round** — for real, again.
- **Stop posting this server** — forgets its channels, post and summaries; its rounds stay on the site.
- **last post** — what was posted last, or why a round was not.

**The post** — the editor of this server's post:

- **Discord as**:
  - *classic* — the parts in groups, only the ticks count (the default until you change it);
  - *a card* — a Discord card: a stripe in the winning side's colour (or your own), the title links to the round, the
    parts as the card's fields (**In a row**: up to 3 or 2 side by side; **Own row**: full width), the map picture big at
    the bottom or small at the top right, a line at the bottom;
  - *a card with a table: a row each* — one row per kind of kill, aligned in columns (see below);
  - *text from the table* — a plain message, "Name: value", up to 3 parts a line.
- **The table of parts**: ↑ ↓ order, an own name for each part (empty: the standard one), ticks for Discord and Telegram,
  Own row, In a row.
- **Title / Under it / At the bottom** — texts with placeholders: `{map}` `{when}` `{date}` `{time}` `{result}`
  `{winner}` `{loser}` `{tickets}` `{length}` `{players}` `{kills}` `{server}` `{link}`, and each part's own placeholder
  (`{foot}`, `{best}`, …).
- **Own text instead of the table** — a text entirely your own (Discord as text, and Telegram): click placeholders in;
  `**bold**` `*italic*` `__underline__` `~~strike~~` `` `code` ``. A line whose placeholders are all empty (no knife
  kills, say) drops out; the link is added at the end if `{link}` is nowhere.
- **Template** — **Save as a template**, **Use it** (into the editor), remove; **or copy from** another server's post;
  **Use on all servers** (their channels stay their own).
- **Save the post**, **Back to classic**. **Preview** draws the card the way Discord does, and Telegram as text.

In *a card with a table: a row each*:

- **Numbers**: *bold, a | before them* (the default) — the row's name and the player in monospace, each padded to the
  longest, a `|` after each, then the number in **bold** and what goes with it (weapon, who). Every `|` lines up and the
  numbers start at one level. The player column is as wide as the longest nick (up to 26 characters) plus one space; a
  tie shows as many nicks as fit, then "+N". *exact columns, not bold* — the whole table in one monospace block (exact
  to the character; Discord can't do bold inside it). When a row is wider than the card (~55 characters), the weapon or
  the second name goes to the next line under the player column.
- **First blood** and **Last killed** take two lines: first who killed (or who was killed) and the round time; under it
  whom he killed with what (or who killed him with what).
- Short row names: your own in the name field; empty — the standard short ones (Veh, Hs, AT on inf, GL, Far AT, Far Gun,
  Far Sniper, Far kill, AT, TOW, Far TOW, Tank, Far Tank, Veh weap, AA gun, Far AA, SAM, Far SAM, Air2Air, Far Air2Air,
  Inf Spree, Veh Spree…).
- The map picture is always big at the bottom (a small one narrows the card and long rows wrap). **New records** is a
  table of its own. In a row / Own row don't apply.

**The parts of a post**: best three, server; most kills on foot, from vehicles, headshots, with the knife, claymores,
mines, launchers on infantry, run over, hand grenades, grenade launcher, C4; longest kill with a launcher, a hand-held
weapon (no sniper rifles), a sniper rifle and anything; longest streak on foot and in vehicles; best K/D (10+ kills);
most revives, heals, repairs, flags; first blood and the last killed — the same as **Round stats → Highlights** on the
site. Ties: up to three names. A part shows only if the round had it. Map, time, winner, players, kills and the link are
always there. Also:

- **Scoreboard** (on by default) — each side (the winner first) and its best five by score with kills and deaths.
- **New records** (on by default) — the server's records this round broke, as on the Records page: all time, last 30
  days, last 7 days (the biggest of the three), up to 6 lines. Only when the server already had at least 20 rounds (all
  time), 10 (30 days), 5 (7 days) — so a new server's first rounds don't "break records" every time.
- **Milestones** (on by default) — a player who passed 1,000 / 2,500 / 5,000 / 10,000 / 25,000 / 50,000 kills or 100 /
  250 / 500 / 1,000 / 2,000 rounds on this server with this round.
- **Weapon groups** (off until ticked) — most kills and longest kill for hand-held weapons (no sniper rifles),
  hand-held anti-tank, anti-tank on a stand, tank cannons, other vehicles, AA guns, AA rockets from the ground,
  air-to-air missiles.

Rules for every post: only rounds with enough players (the server's minimum), recorded in the last 12 hours (not old
demos downloaded in a batch), and never clips. Links need `BF2R_DOMAIN`. Mentions in round posts never ping anyone.

#### Summaries (day, week, month)

A post with the server's summary, at 10:00 (`BF2R_DIGEST_AT`, time zone `BF2R_DIGEST_TZ`, Europe/Bratislava by default):

- **Day** — yesterday, every day; **Week** — last week (Monday–Sunday), on Mondays; **Month** — last month, on the 1st.
  Tick each to have it (all off at first). A newly ticked summary starts with the next 10:00, not the one already past.
- Rounds count by the round's time in the demo (the game server's clock), only those with the server's minimum of
  players. No rounds — no post. A failed send is tried again up to 6 times.
- Contents: the server's numbers (rounds, different players, kills, hours) and maps; **Player of the day / week / month**
  (most score a round among those who played 2 / 3 / 5 rounds or more); **Top 10 by score** (score, kills–deaths, K/D,
  rounds; a player by his nick without the clan tag, shown with his newest name); **Leaders** — the period's totals per
  kind of kill, revives, heals, repairs, flags, and K/D from 20 / 50 / 100 kills; **Best in one round** — the period's
  best single-round kills, score, streak, K/D (10+ kills) and longest kills by weapon group. The card's title links to the
  All rounds page with this server and these dates.
- **Discord** — on / off and the channel: a webhook of its own (a separate channel for summaries) or, without one, the
  round posts' channel — even if the round posts to Discord are off. The admins' channel is refused here (summaries are
  public). **Telegram** — on / off, into the round posts' chat.
- **The summary** — the title, the line under it, **Text above** (a message above the cards: the only place where a
  mention pings — `@here`, `@everyone` or a role `<@&id>`), the bottom line, the stripe's colour, which parts (numbers,
  maps, player of the period, top, leaders, bests, map picture, link), how many in the top (3–20), which leader and best
  rows, and the tables' layout: **exact columns** or **bold numbers, a | before them** (narrower, fewer wraps on phones).
  Placeholders: `{kind} {period} {server} {rounds} {players} {kills} {hours} {pow} {min} {link}`.
- **Preview the summary** shows the last period with the editor as it is now (saved or not) and where it would go;
  **Post it now** sends the last finished period with the saved settings. **last summaries**: what went out and when.
- Until anything is saved, summaries go where the round posts go, in the standard look.

#### Admin channel

A webhook of a **private** Discord channel of this server's admins (the round posts' channel is refused). When the
background analysis has gone over a new round of this server (played in the last 2 days), one message goes there: the
round's hints for admins — the player, what, and a link to the moment. Choose **strong hints** or **strong and ordinary**
(minor ones — team kills, claymores, server rules — never). Each round goes once; old rounds analysed again with new
rules are not sent. **Send a test**. Hints only come when the background analysis runs and Chromium is installed.

### Users and access

Who may open what (v224; before it this card was *Servers' admins*). The owner's only.

**Guests** — everyone who is not logged in. One tick per part of the site:

| Part | What it opens |
|---|---|
| Watch rounds | the site's page: a round on the map, its Round stats and Weapons; a round's plain page `/rounds/<round>.html` |
| All rounds | the list: the Rounds page, ‹ Newer / Older ›, `/rounds/` and its months, RSS. Without it, a round opens only from a link to it |
| Players and maps | players' pages and comparisons, Players · all rounds, maps' pages and heat maps; `/players/`, `/maps/` |
| Records | `/records/` |
| Stats | clans, vehicles, the servers' pages, search moments |
| Download demos | ⬇ Demo, and game videos (the kits for BF2) |
| Video clips | the Clip button (a video or GIF made in the browser) |
| Link previews (guests only) | the cards Discord / Telegram show under a link to a round or player, and the map pictures of the round posts — chat apps never log in |

All ticked: the site is **open** (as before v224; the web server asks nothing). Some unticked: **closed in part** —
those parts need a login. None ticked: **closed** — every page goes to the login page `/login`. **Tick all** / **Untick
all**, then **Save** (it asks before closing).

**Sign-up** (v239) — *visitors may make their own account* (on at first): **Log in → Sign up** on the site and on
`/login` make an account with a name and a password. It may open what guests may — nothing more until you tick it in its
row (tagged **signed up**) — and keeps that visitor's map settings (Show ▾: switches, pins, presets) in his profile
(`data/.prefs/<name>.json`, 32 KB at most), so they are the same on any computer he logs in on. He can change his
password and delete his own account (with its settings). Limits: 3 new accounts an hour from an address, 30 an hour in
all, 5000 accounts at most; a name is taken whatever its case. Untick and **Save** to stop new ones (those made stay;
**Remove** takes one away with its settings). On a site closed to guests a signed-up account opens nothing until you
tick parts for it.

**Accounts** — **Add** (a name: 2–32 letters, digits, `. _ -`; a password: 8+ characters). A new account may watch
everything but the demos (Watch rounds, All rounds, Players and maps, Records, Stats, Video clips); open its row to change
that:

- **The site** — the parts above. An account may always open what guests may, plus what is ticked here.
- **Admin tab** — the Admin tab of the rounds of **his servers** (hints, players, kills, the round, review), the For
  admins tab and the hint cards on players' pages.
- **His servers** — the game servers of the Admin tab, and of the Posts card below.
- **This page** — cards of the admin page he may see and use: Rounds, Being decoded, Disk, Demos: what to keep, Services,
  Background analysis, Where demos come from, **Posts about new rounds** (his servers only — not the Telegram bot, the
  default minimum of players, templates or "Use on all servers", which stay the owner's), Log, **Hint thresholds: the
  site's** (v227: may change the thresholds the whole site uses; with the Admin tab). *Users and access* and *Settings*
  are always the owner's.
- **Save his rights**; **Set** a new password (logs him out everywhere); **Remove** (logs him out).

The row shows when he last logged in, whether he is logged in now, and **signed up** for an account he made himself. Accounts made before v224 (server admins) keep what
they had: they may watch everything and have the Admin tab of their servers.

**Logins.** One login for everything — the site, the Admin tab and this page — at `/login`, the site's **Log in** button,
the Admin tab, or this page. A login lasts 12 hours (2 without a visit); with **Keep me logged in on this computer**, 30
days (14 without a visit). An admin's powers (the Admin tab, this page) last 12 hours from the login and 2 hours without a
step, whatever "keep" says — then the password again. The logins survive an update of the site (kept in
`data/.sessions.json`, only their hashes). A new owner's password logs the owner out everywhere.

How it works and its limits: [features.md, "Who may open what"](features.md#who-may-open-what).

### Log

What the services wrote (the VPS's journal), newest at the bottom. Pick a service and how many lines; *every 10 s* keeps
it fresh. The first place to look when a service failed, a demo didn't decode or a post didn't arrive.

### How to use this page (the usual tasks)

- **Every day** nothing needs doing: Rounds grows, Being decoded empties, Disk has room, Services shows no *failed*.
- **A new game server**: Where demos come from → its page or address → Check → Add (rounds appear within minutes). Posts
  about new rounds → its block → webhook / chat → The post → Preview → Send a test post. Summaries: tick Day / Week /
  Month, choose the channel, Preview the summary. Its admins: an Admin channel, and accounts under Users and access
  (the Admin tab with their servers; the Posts card if they set up their posts themselves).
- **Close the site**: Users and access → untick the parts guests may not open (or all) → Save; then an account per
  person, with what he may open.
- **After an update** the old rounds are decoded and analysed again by themselves — watch Being decoded and Background
  analysis.
- **When something is wrong**: a failed service → Log → its button; failed demos → Try them again; a full disk → Demos:
  what to keep; a missing post → the server's *last post* line, then Send a test post; wrong records → Recalculate all
  records.

---

## Part 2 — admins on the site

### Logging in

The **Log in** button at the top right of any page (next to Tools), the **Admin** tab of a round (under the map, next
to Round stats), or the page `/login` (where a closed site sends you). Enter a name and the password:

- the owner: an **empty name** and the admin page's password — sees every server; already logged into `/admin` means
  already logged in here;
- an account with the Admin tab: its name — sees only its servers' rounds (others say so).

After logging in the button shows your name (the owner: **Admin ✓**); its window shows who you are and what you may
open, **This round's Admin tab**, **Admin page** (the owner, and accounts with cards of it), and **Log out**. A login lasts
12 hours (2 without a visit) or, with **Keep me logged in**, 30 days; the admin powers in it last 12 hours (2 without a
step) — then the window and the Admin tab ask for the password again. The password goes only in a POST request, is
cleared from the field at once, and never appears in an address, in the page or in the browser's storage; the login
cookie is HttpOnly, SameSite=Lax, Secure over https. On a non-https address the window warns that the password would
cross the network unencrypted.

### The admins' page of a round (Review)

(v243) Logged in as an admin, the header has **Review ↗** on every round: the round's own page for judging it.
**Player view ↗** goes back to the players' page at the same moment. A link to it: `…/#round=<round>&review=1` (the old
`tab=admin` links come here too); it is not shown to anyone else — players' pages have no admins' parts.

- **On the left**: the admins' pane (its five parts below — what was the Admin tab under the map) — **Hints** first;
  its filters are folded under **Filters ▾** (it says how many are on).
- **Click a hint**: the map goes to its moment and plays it **again and again, from 5 s before to 2 s after, at 1×**
  (the speed you had comes back when you leave the page; your own seek stops the loop — *Play it again* restarts it);
  for a kill, its **side view** opens (beside the map on a wide screen, under it on a narrow one); and under it:
  - what the hint says, its strength, its mark if it has one;
  - **your verdict**: **⚑ Suspicious**, **✗ A false alarm**, **✓ Checked: nothing there** (the same marks as ✓ ✗ ⚑ in
    the list; the same button again clears it), with **a note for the other admins** (it goes with the mark, and in
    the report when suspicious);
  - **‹ Previous hint** / **Next hint ›** through the list as filtered, and **his page** over all rounds.
- On a phone or a narrow window: one column, the list first; a hint picked scrolls to the map.

Its five parts:

**Hints** — every hint of the round with filters: **Player** (with his number of hints), **Side** (of the one the hint
is about, at that moment), **Strength** (*all*; *without the minor ones* — the default: no team kills, claymores, AFK,
spot spam, leaving the map; *strong only* — see [Part 3](#what-a-hint-is)), **Weapon** (small arms, sniper rifles, launchers, grenades and explosives,
vehicles, emplacements, not a kill), **From / to** (mm:ss), **Players with N+ hints**, **Review** (below), and chips of
the kinds with counts. Click a hint: its moment, played again and again (above); ⟂: the side view of the kill. Next to
each hint the review buttons ✓ ✗ ⚑.

**Players** — every soldier of the round: K, D, team kills; his hints (without the minor ones), the strong ones, of which
kinds; **headshots** (his heads / small-arms kills with a known hit, his share, and what the same weapons would give
anyone — red when chance would give it less than once in a million); **reaction** (the average from first seeing the
victim to the kill, and how many were faster than 0.25 s); **aim** (how far off the victim he looked at the kill); kills
**without line of sight**; distance (average and longest); ping. Sort by any column. **History** — his rounds on the
site (when, on which servers), other names (clan tags), notes, and the hints card over all his rounds; the name opens
his page. **★** marks a trusted player; **✎N** — notes about him.

**Kills** — every kill with the analysis numbers: time, killer and victim (with vehicles), weapon, distance and height
difference, where it hit, line of sight (clear / how long it was blocked), who saw whom first, reaction, aim, from the
fire press to the kill, distance against the fog, smoke, ping, the kill's hints. Filters: player (killer / victim /
either), weapon, distance from–to, time, team kills (with / without / only), only small arms on foot, only with hints.
Sort, **CSV** (every column), click the time — the kill on the map, ⟂ — the side view.

**The round** — from the demo: server, map, time, length, soldiers and vehicles, records per second, **gaps in the
recording**, what the decoder did not recognise, who **joined late** (first spawn after 2:00), who **was gone before the
end**, who **changed sides**, the **server's settings** (team-kill punishment, autobalance, spawn time…). From the server:
when the round came to the site, its demo (there / removed / goes at the next cleaning / on the Keep list), when and
from where it was downloaded, whether the page still lists it, copies, which decoder made it, the analysis (when, with
which rules, whether it failed).

**Review** — the marked hints (suspicious first; ▶ the moment, a clip, × clear the mark), how many strong hints nobody
has marked yet (a button shows them), notes on the round (seen by this round's admins; deleted by their author or the
owner), the trusted players of this round, and **A report for the servers' admins**: ticks (suspicious, false, checked,
strong unmarked, notes on the round and players, links to the moments) → **Copy** (text for Discord) or **Download .html**.

### Marks, trusted players and notes

- Next to each hint: **✓** checked, nothing there; **✗** false alarm; **⚑** suspicious (asks what you saw — it goes into
  the report). Clicking the same button again clears it. A mark is tied to the kind of hint, the player, the second and
  the victim, so it survives when the round is analysed again with new rules (if the hint is gone, Review shows it as
  *not a hint now* with what it said).
- The **Review** filter: all / *not reviewed, not trusted* / not trusted / only suspicious / reviewed.
- **★** next to a player in Players: a trusted player (asks why). His hints stay but are not highlighted, and *not
  reviewed, not trusted* hides them. The owner's ★ counts on all servers, a server admin's on his servers only. The one who
  set it, or the owner, can remove it.
- Notes about a player (**✎**, the field in History) belong to him over all his rounds and are seen by every admin of the
  site; notes on a round are seen by that round's admins.
- All of this is kept in `data/.admin/review/` on the VPS (not served to the web).

### For admins next to the map (until v242)

The tab **For admins** in the panel beside the map listed the same hints as a feed while the round played. Since v243
the players' page has no admins' parts: the hints are on the admins' page (Review ↗).

### On a player's page

Logged-in admins also see:

- **Suspicion score** — for each kind of hint he had: how unlikely his share of rounds with it is against all players
  (log10 of the chance, at most 10 per kind; kinds with a chance worse than 1 in 10 and rule hints don't count), added
  up. Next to it: above what share of players with 10+ analysed rounds he stands, which kinds give the most, and per month
  how many of his rounds had a hint.
- **Hints over his rounds** — each hint kind: in how many of his rounds, against the share of all soldier-rounds, and the
  chance of it by luck (the least likely in red), with links to the rounds.
- **Headshots against his weapons** — his share of head kills against what his weapons give everyone (from 30 such
  kills; red when far above, under 1 in a million).

Only rounds analysed with the current hint rules count, so after an update that changes the rules these cards start
smaller and fill up as the background analysis goes on.

### Asking the statistics (v244)

A page where **you put the question**: which player, what of him, which parameter, how to judge it, with which weapon,
over which days — and get his number against everyone else's. Open it from:

- **Ask about him…** on a player's page, or **Ask about him →** in the Review panel under a hint (with the hint's weapon);
- **Ask the statistics** in the head of the admins' pane (the soldier you follow, if any);
- the **Ask** tile on the Statistics page; a link `#astats=1&qn=<nick>&…` (every question has one: **Copy link**).

The form:

| Field | What it does |
|---|---|
| **Player** | a nick as the site's statistics merge names (the clan tag dropped); suggestions as you type |
| **Of him** | *his kills*, *the kills of him* (his deaths), *his rounds*, *his presses of the trigger* (per round and weapon; rounds analysed by v214 or later) |
| **Weapon** | one weapon, or empty for all; for kills, deaths and presses. **Everyone else is then on the same weapon** |
| **Parameter** | of a kill: distance, height over the victim, where the shot hit, reaction, who saw whom first, the aim off the victim at the kill and 0.5 s before, aim height, press-to-kill, no clear sight before the kill, fog, the victim crossing his view, speeds, stances, ping, the victim's health, smoke, team kill, vehicles, the kind of weapon; of a round: kills, deaths, K/D, team kills, small-arms kills, headshots and their share, spots, time alive, kills per minute, distance on foot, ping; of presses: presses, seconds held, held per press, bullets (an estimate from the magazine's count), bullets per press, presses per minute |
| **Judge it by** | how many, how many per round, the share that … (a value: *= head*, *≥ 100 m* …), the average, the median, the 10th / 90th percentile, the smallest, the largest, the sum — what fits the parameter |
| **From / To** | the days (or 7 / 30 / 90 days, All) |
| **Server, Map** | one of them, or all |
| **Only where…** | up to 4 conditions on other parameters (e.g. *killer in a vehicle = no*, *distance ≥ 50 m*) |
| **Rank him among players with at least** | how many kills (deaths, rounds) a player needs to be in the comparison list |
| **Their list** | the highest first, or the lowest |

**Show** answers with:

- **Him** and **Everyone else** (all the other players' values together, under the same filters), **His place** among
  the players with enough of them (and above what share of them), and for a share **By chance** — how often a player
  who does as everyone else would reach his count (*once in N*; red when under 1 in 1000). One look at one player:
  among hundreds of players a few get far off by luck — a reason to watch, not proof.
- **The spread** of his values against everyone else's (each as a share of its own; the categories as bars), **week by
  week** (a hollow dot: a week with under 5 of his), **the highest** (or lowest) players — a name asks the same about
  him — and **his events**, the newest first: a row opens the round **in Review at that moment, following him**
  (rounds gone from the site are greyed).

Where the numbers come from: the background analysis's files (`analysis/rounds/`), read by the admin server into memory
at the first question (some seconds; then kept, new files added as they come, let go after 30 minutes unused). Only
analysed rounds count; bots are left out. A server's admin sees only his servers' rounds and their players.

---

## Part 3 — working with hints

### What a hint is

A hint marks a moment that is worth watching: something normal play can't do, or a number far above everyone else in
the same round. **It is not proof.** Lag, the demo's 0.1 s steps, a wrong guess about where a soldier looked, a map's
odd spot — all of these can make one. Always watch the moment, its side view and the seconds before it.

Strength:

- **minor** — server rules or plain information (team kills, claymores, AFK, spot spam, leaving the map);
- **hint** — worth a look;
- **strong** — something normal play can't do (a teleport, speed, through a wall, beyond reach, rate of fire or of flag
  capture, a guided missile, Glitch spot; no line of sight confirmed by the exact shapes and hidden for 1 s+), or a share
  (headshots, reaction, triggerbot, pre-aim, wide view) that luck gives less than once in 10,000.

The kinds fall into groups (55 in all):

| Group | Hints |
|---|---|
| Visibility and walls | No line of sight, Through thin walls, Wall tracking, Fired at a wall, Through smoke, Beyond fog, Wide view, Spots unseen, Glitch spot |
| Aim and shooting | Aim snaps, Reaction, Headshots, Triggerbot, Smooth aim, Target switch, Pre-aim, No spread, No trigger |
| Movement | Speed, Stamina, Teleport, Through walls, Floating, Under the map, Parachute, Vehicle speed, Outside the map, Idle |
| Spawning | Spawn, Early spawn |
| Weapons and ammo | Melee reach, Fire rate, Ammo, Damage, Guided missiles, Artillery |
| Flags and score | Fast flag, Kill farming, Spot spam |
| Macros and scripts | Clicker, Bullet rate, Spot rhythm, Anti-AFK script, Prone spam, Bunny hop |
| More cheat signs | Lag switch, One-hit kills, Silent aim, Aim lock, Spin |
| Server rules (minor) | Team kills, Claymore at a flag, Claymore kills, Side switch, TK + revive |

Each is described, with its conditions and examples, in [admin-hints.md](admin-hints.md).

### Thresholds: the site's and your own

(v227) A hint fires past its thresholds: a time, an angle, a distance, a count in a round, odds. Ours are **recommended** —
set on thousands of real rounds so that honest play stays under them — and they are what the site uses until it is told
otherwise. The editor opens from the **Thresholds** button on a round's admins' page (Review), **Hint thresholds** in the Log in
dialog (once logged in), the admin page's card, or `/#thresholds`. Its table has, for each hint (and *Every hint* for
what they share), each threshold with what it means, its name, the recommended value and two columns:

- **The site's** — what the background analysis, the players' hint cards, the suspicion score and the alerts use. Only
  the owner and the accounts with the right change it. **Save the site's** asks first: every round is then gone over
  again in the background (it can take hours or a day — the Background analysis card shows how far; until then the
  players' cards count only the rounds already done). **The site's: all recommended**, then Save, goes back to ours.
- **Mine** — every admin's own, over the site's, for the rounds **he** opens (the Admin tab, the For admins list, the
  marks on the map). It changes nothing for anyone else and nothing in the background analysis. **Use mine in the rounds
  I open** turns it on and off without losing it; **Save mine**; **Clear mine**.

An empty box means "as the column to its left" (yours: the site's; the site's: the recommended). Each hint's row has an
**on** tick in both columns: untick it to turn that hint off — for the site, or only for you (or tick it to have for
yourself a hint the site turned off). **Find** filters by a hint's or threshold's name; **advanced** adds the game's own
figures (weapon fire rates, reach, speeds) and measured shares that are better left alone; **only the changed** shows
what differs from the recommended. A value outside its bounds is refused with the bounds; odds are written as a share:
0.001 = 1 in 1,000, 1e-6 = 1 in a million.

Tips: change one threshold at a time and watch what it does on a few rounds with *Mine* before changing the site's; a
looser threshold gives more hints and more false ones.

### A suggested routine

1. Open the round → **Review ↗** → **Hints**, **Filters ▾**: Strength *strong only*, Review *not reviewed, not trusted*.
2. Click the first hint: its moment plays again and again, with the side view of the kill. **Camera ▾ → His view**
   shows what he could know. Use **Kills** to see his other kills in numbers.
3. Your verdict under it — ⚑, ✗ or ✓, with a note — then **Next hint ›**.
4. In **Players → History** check his other rounds and his hints card; add a note if useful; ★ a player you know is
   clean.
5. **Review → A report for the servers' admins** → Copy into the admins' Discord, or Download .html.

### Suspicion score

The score adds up how improbable a player's hint rate is across his rounds. It is for ordering the queue ("whom to look at
first"), not a verdict: it needs enough analysed rounds (players with fewer than 10 are not compared), it counts only
rounds analysed with the current rules, and a few players will always be at the top by chance. The admin page lists the
highest ones under *Background analysis*.

### Glitch spot

A soldier who stays 20 s or more where, in all rounds of the map, nobody but him has stood, while 3+ other players have
stood right above or below him (5–40 m) — under a floor, in a rock or wall, on a roof nobody reaches. A hill where nobody
goes is not a hint (nobody above or below it either). Only on maps whose grid has 30+ rounds. Where the map has exact
shapes, the hint also says where he was (chest in an object, under the ground, in the air, on a roof).

---

## Security

- The admin page and the Admin tab are served by `admin.mjs` on 127.0.0.1:8781 behind Caddy; the admins' code
  (`server/admin-round.js`) and data (`data/.admin/`) go out only to an account with the Admin tab, while its admin
  powers last.
- Passwords: only scrypt hashes on the VPS (`/etc/bf2replay-admin.json`, `data/.admin-users.json`); never in the
  repository. Logins are rate-limited: 5 wrong from one address → 15 minutes; 30 an hour from all → a pause for the
  addresses that got one wrong (someone with no mistake still gets in). (v239) Sign-ups: 3 an hour from an address, 30
  an hour in all, 5000 accounts at most, a field only robots fill refused; a signed-up account gets no more than guests.
  The accounts' map settings (`data/.prefs/`) are never served by the web server (all of `data/.*` is closed).
- A closed site: every request (but the login's and the admin page's) is checked by `admin.mjs` before the web server
  answers; a page goes to `/login`, a file gets 401 / 403.
- Webhooks and the bot token stay on the VPS (`data/.notify.json`); the page shows only their last 4 characters.
- The admin page can start only the bf2replay services (a sudoers rule); it can't run anything else.
- Log out on a shared computer.

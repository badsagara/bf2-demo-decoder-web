# User guide

For players and visitors: how to watch a round, follow a soldier, read the statistics, find a player, see the
records, and make a clip to share. Everything here works in any modern browser, on a computer or a phone. How the
numbers are worked out (and what a demo can't tell) is in [features.md](features.md).

Contents: [The site at a glance](#the-site-at-a-glance) · [Logging in](#logging-in) · [Watching a round](#watching-a-round) ·
[Following a soldier](#following-a-soldier) · [What the map shows (Filters)](#what-the-map-shows-filters) ·
[The panels and tabs](#the-panels-and-tabs) · [Clips](#clips-video-gif-or-a-game-video) ·
[All rounds](#all-rounds) · [A player's page](#a-players-page) · [A map's page](#a-maps-page) · [Records](#records) ·
[Stats](#stats) · [Links, previews, RSS](#links-previews-rss) · [On your own computer](#on-your-own-computer) ·
[Keys](#keys-and-mouse) · [Questions](#questions)

## The site at a glance

The page opens on the newest round. At the top:

| Button | |
|---|---|
| **Rounds** | every round of the site: by server, map, day, player ([All rounds](#all-rounds)) |
| **Records** | the best in one round and who did most: last 7 days, 30 days, all time ([Records](#records)) |
| **Stats** | clans, vehicles, the servers, search moments ([Stats](#stats)) |
| **Tools ▾** | open a demo of your own, and what the decoder reads from the demo file ([On your own computer](#on-your-own-computer)) |
| **Log in** | for the site's users and admins ([Logging in](#logging-in)); logged in, it shows your name |
| the theme button | light or dark colours (remembered in this browser) |

Over the map, the **round bar**: the map, day and time, length, players, the server, who won and the tickets. Click it
for **All rounds ›**; **‹ Newer** / **Older ›** step to the next or previous round; **Map page** opens the map over all
rounds; **⬇ Demo** downloads the round's demo (or links to where it came from, if the site no longer has it).

When a new version of the site comes out while you watch, a bar says **A new version is out · Reload**; Reload brings you
back to the same moment with the same soldier.

## Logging in

A site can be open to everyone, or closed — as a whole or in parts — to visitors who are not logged in. On a closed
site any page you may not open sends you to the login page (`/login`), and after the login you are back where you
were going (the same round and moment). On an open site the **Log in** button at the top right does the same.

- **Name and password**: as the site's owner gave them to you.
- **Keep me logged in on this computer**: 30 days (14 without a visit) instead of 12 hours (2 without a visit). Don't
  tick it on a shared computer.
- Logged in, the button shows your name; its window says what your account may open, and has **Log out**.
- What your account may not open is not shown: for example without "All rounds" there is no Rounds button and no
  ‹ Newer / Older › — a round opens from its link; without "Download demos" there is no ⬇ Demo.
- "This account may not open that page" on the login page: ask the site's owner, or log in with another account.

## Watching a round

- **Play** / Space — play and pause. The speed slider (or `+` / `−`) goes up to many times real time.
- **The timeline** under the map: drag to any moment; its marks are kills in each side's colour, ▼ flags captured,
  ▽ neutralised. `←` / `→` jump 10 s back or on.
- **The map**: scroll to zoom, drag to move. The zoom slider shows how many metres the map shows across.
- **Buttons over the map**: **His view** (`V`, v228: only what the soldier you follow knew — see below), **Aim line**
  (`X`, v230: his aim line, while you follow someone — see below), **Full screen** (`F`), **Scoreboard** (hold `Tab`, or click to keep it open — the game's own
  scoreboard at this moment, both sides by squad), **Bigger map**, **Lock camera** (`K`, keeps the soldier you follow in
  the middle; dragging unlocks), **Fit action** (zoom to the part of the map the round was played on), **Whole map**, **Copy link** (a link to
  this round at this moment, following the soldier you follow), **Controls left** (these buttons in a column left of the
  map so its bottom stays free).
- **The bar at the top of the map**: tickets and time left, as in the game. **Legend ▾** says what each mark means (only
  for the layers switched on).
- **Quick buttons**: Icons / Models (`M`, vehicles as map icons or 3D models seen from above), Buildings (`B`), Relief
  (`H`), **Next 20 s** (`A`, see below), 1st / 3rd person for a vehicle seat (`C`).

On a phone the page is laid out for the narrow screen: the map first, with **Play**, **−10 s** and a seek bar under it;
**Map ↑** brings you back to the map from the tables.

## Following a soldier

Click a soldier on the map, his row on the scoreboard, or his name anywhere. Then:

- **Selected soldier now**: name, team, status, score, kit, what he holds, stance and how he moves, grid square and
  position, his vehicle and seat, kills / deaths and headshots so far, his last kill, longest kill and last death,
  medic or engineer work, who is **in view** and who has him in sight (**Seen by**). **Stop following** ends it.
- **The whole round** card: his score (or **≈ Score**, see [Questions](#questions)), K–D, headshots, best streak, longest
  kill, time alive and in vehicles, revives, heals, repairs, team kills; **Lives** — a strip of his lives with ● kills and
  ✕ deaths (faint: revived), click to go there; **Killed with**, **Killed most**, **Killed by**; **All his rounds ›**
  opens his page.
- `N` / `P` — his next / previous moment (a kill, a death, a revive…).
- **His view** (`V`; the **His view** button with an eye on the map, next to Filters, or the one in his card) — only what he knew
  in the game: his side, the enemies he had in sight (faded for a few seconds where he last saw one), his side's spots,
  and every empty vehicle (v228; a burning wreck only where he could see it). The map's button is filled while it is on;
  pressed with nobody followed, it waits (dashed) for the next soldier you click. For a vehicle, **Crew's view**: what
  its crew knew. The **Sounds** of shots and
  explosions he could hear show as rings (an arrow at the map's edge for those off it); the speaker in his tag turns
  them on or off.
- **Aim line** (`X`; v230: the **Aim line** button on the map, next to His view, or the one in his card) — a yellow line
  from him (or his vehicle's guns) to where his crosshair meets something: a soldier, a vehicle, a wall or the ground;
  dashed into the sky, out to the fog limit. The map's button works while you follow a soldier or a vehicle (dimmed
  otherwise) and turns yellow while the line is on; the setting is remembered.
- **Next N s** (`A`, while paused) — where he goes in the next 1–30 s: a dashed path with a dot every 5 s, a ring where
  he is at the end, a cross where he dies (and how many seconds on). `−` / `+` by the button (or the mouse wheel over it)
  change the seconds; **For him** / everyone.
- **The view** layer shows his field of view (95° across, as a 16:9 screen; narrower through sights or a scope; out to the
  fog limit).
- **Side view ⟂** of a kill (from the kill feed, Highlights or his card): the ground, walls and the line of sight between
  killer and victim, and who saw whom first. **Go to the kill** brings you back to that moment.

## What the map shows (Filters)

**Filters ▾** (`L`) lists every layer; the number on the button is how many are on.

| Layer | |
|---|---|
| **Vehicles: Icons / Models** | the game's map icons in the colour of the team in them, or the 3D models from above, to scale, the turret turning where the gun points |
| **Soldiers: Game / Figures** | the game's minimap mark (squad leader with his squad's number, the commander's star, your squad in green), or a figure showing stance and movement (standing, crouched, prone; walking, running, sprinting; jumping, falling, parachute, ladder). A white dot at the nose while aiming down the sights |
| **Scoreboard & text: Game / Page** | the game's own scoreboard, bar and font, or the page's plain ones |
| **Cursor: Off / Height / Grid** (`G`) | the ground's height under the pointer (and how much above or below the soldier you follow), or the grid square, metres from the middle and the distance and direction from the soldier you follow |
| **Kill feed** | the last kills, revives and flag captures in the top right corner |
| **Kill lines** | a line from killer to victim, and +1 by the killer |
| **Spots** | enemies spotted by each side |
| **Explosions** | grenades (with how far they were thrown) and rockets in flight, blasts, tank and APC shell hits, placed C4, claymores (and the way they face), AT mines, smoke |
| **Firing** | a flash at the gun of everyone holding a fire button (the demo has the button going down and up, not each shot) |
| **Emplacements** | machine guns, TOW / HJ-8, Igla / Stinger and artillery on the map |
| **Squad orders** | each squad's order (attack, defend, move) where its leader put it, for 3 minutes or until the next |
| **Spawn points** | where each flag's soldiers spawn, in the colour of the side that can spawn there |
| **Medic** | revives, heals, repairs, health bars, dropped ammo and medic bags, and calls for a medic, ammo, a repair or a revive |
| **Bodies** | the bodies of those who died, as the game's ragdoll had them: how each fell and where it lies, head this way — until the game uses that soldier again for a spawn (often minutes later; the game keeps a fixed set of soldiers) or a medic revives him |
| **View** | the field of view of the soldier you follow and who is in it |
| **Aim line** | as above (`X`) |
| **Buildings** (`B`) | houses, walls, fences, containers and rocks a soldier can't walk through, from the game's files; trees and bushes as green discs |
| **Heights** | soldiers on a roof, upper floor, tower, bridge or deck lifted over a shadow, with the height when 12 m or more |
| **Sounds** | in His view: the shots and explosions he could hear |
| **Relief** (`H`) | hill shading and contour lines with heights; **Shading**; **Higher than his eyes** — ground above the eyes of the soldier you follow, hatched |
| **Next N s** | the paths ahead while paused, for the soldier you follow or for everyone |
| **Front line** | which side holds which part of the map, from where its soldiers were over the last 30 s and its flags — a rough picture, not the game's own |
| **Legend** | the box that explains the marks |

**Names ▾** chooses which names and labels the map shows (the soldier you follow always has his). **Map size (m)** is for
maps the site doesn't know. `?` lists the keys.

## The panels and tabs

**Battle** (the default tab):

- **Tickets & flags** — each side's tickets over the round and the flags.
- **Kill feed · Highlights** — next to the map (or under it on a narrow screen). **Kill feed**: every kill, revive and
  capture; click one to jump there. **Highlights**: the moments worth watching (below). A filter for both: **Killer…**,
  **Victim…** (⇄: either way round), **Any weapon**, near a flag; ✕ clears it. **Hide ▴** folds the panel to a strip;
  `J` folds the kill feed over the map.
- **Team 1 / Team 2** — the scoreboard of each side.

**Round stats** — the whole round:

- **Highlights**: most kills on foot, from vehicles, headshots, knife, claymores, mines, launchers on infantry, run over,
  grenades, grenade launcher, C4; longest kills (launcher, hand-held, sniper, anything); streaks on foot and in vehicles;
  best K/D; most revives, heals, repairs, flags; first blood and the last killed. A click goes to the player or the kill.
  Below them, the moments: multi-kills, long shots, from above, through a gap, from behind, vehicles destroyed, ambushes
  on armour, vehicle duels, flags, revives under fire.
- **Both sides**, the **server settings** (as the demo has them: spawn time, time limit, team kills, commander, vehicles…),
  **Tickets lost by cause**.
- **The players table**: score, teamwork, assists, K–D, headshots, team kills; more column groups — **Vehicles**, **Medic
  & engineer**, **Streaks & range** (remembered in this browser). Sort by any column; a row opens his card.
- **Players CSV** and **Kills CSV** — the tables as files for a spreadsheet.

**Weapons** — kills by weapon, and **Where the killing shot hit** (head / body / limbs) for weapons with 3+ such kills.

**Players · all rounds** — every player over all the site's rounds (or one server's, when one is picked on the All
rounds page): rounds, score, kills, deaths, K/D and more; column groups including **Duels & teamwork**; **Find a player**
(Enter on a single match opens his page); **Players CSV**.

## Clips: video, GIF or a game video

**Clip** (under the map) opens the clip bar. Mark the stretch with **Start here** / **End here** (`I` / `O`), or drag the
ends of the yellow band on the timeline.

- **File**: **Video (MP4)** (up to 2 minutes of video), **GIF** (plays everywhere, also in chats without video; 600 px, 10
  frames a second, up to 20 s), or **Game video (BF2 renders it)** — below.
- **Size**: 720p, 1080p, Square, Vertical. **Speed**: 0.5× to 16×. **Sound**: shots, rockets and explosions made from
  the demo (up to 2×). **Camera**: **Follow** the soldier you follow, or **As on screen**.
- **Make video** — the clip is made in your browser (faster than real time where the browser has a video encoder);
  then **Save video**, **Share…** (on phones), **Discard**.
- The clip shows the map with the layers you have on, the round clock, tickets and kills.

### Game video: the moment filmed by Battlefield 2 itself

A kit for the game on your PC (Windows, Battlefield 2 installed): the game plays the round's demo and films it — the
real game picture, not the map. Follow a soldier first; tick the views you want:

- **His eyes** — what he saw (in a vehicle, from his seat);
- **Behind him** — the game's camera 7 m behind him and above, turning with him;
- **From the side** — 5 m from his side;
- **Still** — one camera over the place, the shooter and his target in it.

**Make the kit** packs a `.zip` (a few hundred KB): the round's demo, with the part of the round before the clip packed
into a short stretch so the game gets there fast; a camera for each view; and `make-videos.bat`. Unpack the zip into the
game's folder (its folder goes next to `BF2.exe`) and run `make-videos.bat`: the game opens, films one view (1280×720,
30 frames a second) and closes by itself, then the next. With [ffmpeg](https://ffmpeg.org) (in PATH, in the kit's folder
or the game's) each film is cut to the clip and made an MP4 (`mods\bf2\Demos\…_eyes.mp4` and so on); without it, the
films stay large AVI files. `watch-in-game.bat` plays the demo in the game with your own camera instead. The game shows
no HUD or crosshair in a demo.

The quickest way: the **game video** button (a play sign in a film frame) by a kill in the kill feed, in a highlight or
in an admin's hint — it sets the clip 8 s before the kill and 3 s after, following the killer, with the views you ticked
last time; then **Make the kit**.

A kit needs the round's demo (Download demos and Video clips, when the site is closed in part). If the site no longer
has it, the Clip bar asks for **Open my copy…** — your own `.bf2demo` of that round (checked to be the same round).

## All rounds

**Rounds** (or a click on the round bar) opens the list of every round: **Server** (buttons with counts), **Map**, the
days **from–to**, **players from**, **length from**, **Find a player** (his rounds, and his page). Sort by any column;
200 rows at a time (**Show 200 more**, **Show all**); **Rounds CSV**. Each round is a link (open it in a new tab if you
like). The filters are part of the address, so you can send the list as it is, and the browser's Back returns to it.

## A player's page

Open it from a name anywhere, **All his rounds ›**, or the address `…/#player=<nick>`. A player is known by his **nick
without the clan tag** (`=FL= puika_mk3` and `puika_mk3` are one player); he is shown with his newest name.

- His totals: rounds, time on the field, score, kills and deaths (also per round), K/D, headshots, kills from vehicles,
  longest kill, best streak, revives / heals / repairs, team kills; **rating** (Elo, see [features.md](features.md#rating-elo));
- **Killed with**, **Killed most**, **Killed by**; how he gets killed (how often he didn't see his killer, from which side,
  how far, what with, where on each map);
- **Played with** / **Played against**, won and lost together; **Maps**; his rounds (newest first, each a link);
- **His best in one round** (records), **duels, ambushes, damage, assists**, kills set up and stolen, time near his squad
  leader, spawns on the squad, time at the flags, revive speed, **nemesis** and **favourite victim**, **His vehicles**
  (time, kills, deaths), and a **heat map** of where he kills and dies on each map;
- **Compare with…** — him and another player side by side (rounds together, against each other, when they met, what each
  killed the other with); **⇄ Swap**; **Copy link**. `‹ Back` (or `Esc`) returns to the round.

There is also a plain page for every player at `/players/<nick>.html`, and `/players/` lists everyone (with a search).

## A map's page

**Map page** (on the round bar) or `…/#map=<map>`: its rounds, who kills most there and with what, where they die most,
**Records on this map**, and a heat map of everyone's kills and deaths.

## Records

`/records/` (the **Records** button): for the last **7 days**, **30 days** and **all time**, the best in one round and who
did most — most kills (also on foot, from vehicles), headshots, streaks on foot and in vehicles, longest kill, knife,
claymores, mines, launchers on infantry, run over, grenades, grenade launcher, C4, revives, heals, repairs, flags, best
score, best K/D (10+ kills) — and per **weapon group** the longest kill and most kills in a round: hand-held weapons (no
sniper rifles), sniper rifles, hand-held anti-tank rockets, launchers on a stand (TOW, HJ-8), tank cannons, other
vehicles, anti-air guns, anti-air rockets from the ground, air-to-air missiles. At the top: all servers or one server
(`/records/<server>.html`). Which kills can't be records (and why) is in [features.md](features.md#records).

## Stats

**Stats** opens **All statistics**:

- **Clans** — by the tag in front of the nick: players, rounds, wins, K/D, and clan against clan.
- **Vehicles** — each vehicle: time used, kills, the best players by kills an hour.
- **A server's page** — when it is played (by hour and day of the week), its maps with each side's wins, round lengths,
  the flags that decide rounds.
- **Search moments** — every kill of a map: filter by who, what with, how far, headshot, from a vehicle; a result opens
  the round at that moment.

## Links, previews, RSS

- **Copy link** gives `https://site/r/<round>?t=466&p=…` — the round at that moment, following that soldier — and a
  player's page link `https://site/p/<nick>`. Telegram, Discord, Slack and WhatsApp show the map, date, winner and score,
  players and kills, the best player (for a player: his rounds, kills, deaths, K/D) and the map's picture under the link.
- Plain pages that search engines can read: `/rounds/` (the last 100 rounds and a monthly archive; each round with
  **Watch the round on the map** and **Download the demo**), `/players/`, `/maps/`, `/records/`.
- `/rss.xml` — the 50 newest rounds, for a news reader or a Telegram RSS bot.
- Some game servers' rounds are also posted to their Discord or Telegram after each round, with day, week and month
  summaries.

## On your own computer

**Tools ▾** shows the file buttons:

- **Open .bf2demo** — any demo from your game's demos folder; it is decoded in your browser (nothing is uploaded) and
  replayed like the site's rounds.
- **Open folder** — all the demos in a folder (an evening of rounds): a list of the rounds and the players' numbers over
  all of them.
- **Open timeline .json** — a round in the page's own JSON format (see *Timeline JSON format* at the bottom of the page).
- **Map picture** — a picture for a map the page doesn't have (PNG / JPG, the game's `ingameMap.dds`, or the level's
  `client.zip`).
- **Demo file** card — the demo's header and what the decoder read from its stream.

The same `index.html` works without a server (open it from a local web server such as `python3 -m http.server`).

## Keys and mouse

| Key | |
|---|---|
| `Space` | play / pause |
| `+` `−` | speed |
| `←` `→` | 10 s back / on |
| `N` `P` | next / previous moment of the soldier you follow (or highlight) |
| `I` `O` | clip start / end |
| `Tab` (hold) | scoreboard |
| `F` | full screen |
| `L` | what the map shows (Filters ▾) |
| `M` | vehicles: icons / models |
| `B` | buildings' outlines |
| `K` | lock the camera on the soldier you follow |
| `V` | his view (a vehicle: its crew's) |
| `X` | his aim line |
| `J` | fold / unfold the kill feed over the map |
| `G` | cursor: height / grid / nothing |
| `H` | relief |
| `A` | the next N s (paused): for him or for everyone |
| `C` | view from a vehicle seat: 1st / 3rd person |
| `Esc` | back from a player's or map's page to the round |
| click | follow a soldier (on the map or his row on the timeline) |
| scroll / drag | zoom / move the map |

## Questions

**Why "≈ Score"?** When the demo has no scoreboard for a player, the score is worked out by the game's rules from what
the demo shows.

**Why does a kill have no distance?** The game sometimes names the wrong weapon (what the killer holds, not what killed),
or the killer was in a vehicle while the weapon is hand-held. Such kills keep no distance, so they can't make a false
record. See [features.md](features.md#kill-distances-and-the-weapon).

**Why does "in view" not mean "he saw him"?** The view is the screen's frame; walls, hills and trees are checked
separately with the map's shapes (and only on the 22 maps whose files the site has).

**The round I played isn't there.** Rounds appear a few minutes after they end, once the server has published the demo.
Rounds with fewer than 2 players on the field are not kept. Ask the site's owner whether your server is a source.

**Is anything stored about me?** Only what the game server's demo records (names, positions, kills, scores) and the
numbers worked out from it. Your theme, column and clip choices are remembered in your own browser only.

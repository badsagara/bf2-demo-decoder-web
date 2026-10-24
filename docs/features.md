# Features and their particulars

How each feature works, what it is based on, and where its limits are. For players, admins and the owner alike; the
admin-only hint rules are in [admin-hints.md](admin-hints.md).

Contents: [What a demo holds](#what-a-demo-holds--and-what-it-doesnt) · [Decoding](#decoding-and-what-is-kept) ·
[Maps](#maps) · [Who could see whom](#who-could-see-whom) · [Kill distances and the weapon](#kill-distances-and-the-weapon) ·
[Score](#score-teamwork-assists) · [Highlights](#highlights) · [Records](#records) ·
[Statistics over all rounds](#statistics-over-all-rounds) · [Rating (Elo)](#rating-elo) · [Clips](#clips) ·
[Posts and summaries](#posts-and-summaries) · [Hints for admins](#hints-for-admins) ·
[Keeping demos](#keeping-demos) · [Pages, previews, RSS](#pages-previews-rss) · [Who may open what](#who-may-open-what) · [Privacy and security](#privacy-and-security) ·
[Speed and size](#speed-and-size)

## What a demo holds — and what it doesn't

A `.bf2demo` is the game server's Battle Recorder file: the network stream it sends to a spectator. The site reads all
63 kinds of game event and every object record in it.

**In the demo:**

- every soldier's position, where he looks (yaw and pitch), stance and movement **10 times a second** (one step = 0.1 s);
  health, sprint stamina, the kit, the weapon in his hands, the vehicle and seat;
- where a soldier looks is **the way his body faces plus how far his head is turned from it** — the demo has both.
  Standing, the mouse turns only the head, up to 40° either way; past that, or walking, the body follows at 120°/s and
  the head turns back as much. (Before v225 the site took the body's way for the view: up to 40° off while a soldier
  stood or lay and looked round — the aim at a kill was 3.3° off in the middle, now 0.6–0.9°);
- **bodies**: a soldier who dies falls as a ragdoll — the demo has his hips and shoulders 30 times a second while he
  falls (3–5 s), then where he lies. The body stays until the game uses that soldier again for a spawn — the game keeps
  a fixed set of soldiers, so a body can lie for a few seconds or for minutes (the Bodies layer);
- the fire buttons going **down and up** (not each shot), with the rounds in the magazine at each press, and presses
  shorter than a game tick;
- vehicles: position, turning, hit points; projectiles in flight (rockets, missiles, grenades, shells) and who fired
  them; placed C4, claymores and mines; blasts;
- each kill as the game's kill message: killer, victim, the **weapon the game names**, and the material the killing
  shot hit (head / body / limbs); kill assists;
- revives (the "man down" flag), heals, repairs, resupply, kits picked up, flags (owner changes, capture zones), spawn
  groups, spots, squad orders, commanders, kicks, medals, squad names;
- the scoreboard (each player's score, teamwork, kills, deaths), tickets, the HUD's time bar;
- the server's settings (name, spawn time, time limit, team-kill punishment, autobalance, vehicles, …).

**Not in the demo** (so the site has to guess, or leave it out):

- the player's **screen** (4:3, 16:9, 21:9 — so his field of view) and whether he played a vehicle in **1st or 3rd
  person**;
- where a **driver or pilot turns his head**, and sometimes where a vehicle's gun pointed when it fired;
- a soldier on an **emplacement** sends no positions, and getting on one is often missing;
- "joined" and "left": a soldier dead at the end of the round looks the same as one who left;
- the **starting tickets** (taken from the level's files);
- each bullet: only the button, so rate of fire and hits are worked out, not read;
- the weapon the game names is at times **what the killer holds, not what killed** (see [below](#kill-distances-and-the-weapon)).

## Decoding and what is kept

- The decoder is JavaScript inside `index.html`; the server runs the very same code (`ingest.mjs` takes it out of the
  page), so a demo opened in your browser and a round on the site read the same.
- A decoded round is a `.bfr` file (about 6× smaller than the demo) named after the decoder's hash. When the decoder
  changes, every round that still has its demo is decoded again by itself (the site works meanwhile).
- **Movement between the records.** The demo has a moving soldier or vehicle about 30 times a second. Each 0.1 s step
  of the round holds where it was at that very moment, as the game itself shows it: between the two records either
  side, when they are less than 0.5 s apart, else the last one (the game's own rule; before v225 always the last record —
  up to 1/30 s old: a jet 4–6 m behind one time in ten, a jeep up to 0.8 m). Between the steps the page draws it in a
  straight line.
- Each round's **summary** (players, kills with their positions and weapons, highlights, the extra statistics) is
  worked out from the `.bfr`. When that code changes (`SUM_V`), every round is summed up again from its `.bfr` without
  decoding — minutes for thousands of rounds — and Records, players' pages and the statistics are rewritten.
- Rounds with fewer than 2 players on the field (`BF2R_MIN_PLAYERS`) are dropped; empty rounds (~400 KB) too.
- **The same demo on two pages** is downloaded once; copies already there are taken out of the list and the statistics
  (kept in `data/.copies`), and their old links open the same round. A round counts once.
- Special Forces rounds keep both sides apart (so their kills are not "team kills").

## Maps

- **22 maps** have the game's files on the site: the exact **collision shapes** (houses, walls, fences, containers,
  rocks), the **materials** (what bullets pass through), **trees and bushes**, the **heightmap** (relief, line of sight
  over hills), the flags, spawn points and fog distance. These are Dalian Plant, Daqing Oilfields, Dragon Valley, Fushe
  Pass, Great Wall, Gulf of Oman, Highway Tampa, Kubra Dam, Mashtuur City, Midnight Sun, Operation Blue Pearl, Operation
  Clean Sweep, Operation Harvest, Operation Road Rage, Operation Smoke Screen, Road to Jalalabad, Sharqi Peninsula,
  Songhua Stalemate, Strike at Karkand, Taraba Quarry, Wake Island 2007, Zatar Wetlands.
- **8 Special Forces maps** have only their picture and flag names: no walls, relief or line of sight there (the level
  files are not on the site), so visibility features and the hints that need walls don't work on them.
- Map pictures: 512 px from the game, and sharp 2048 px ones scaled down from Deine-Augen's High Definition Minimap.

## Who could see whom

Used by the View layer, His view, "In view" / "Seen by", who saw whom first, "Didn't see his killer", duels and
ambushes, Highlights, and many admin hints.

- **Field of view: 95° across, 63° up and down** — what a **16:9** screen shows (since the 1.5 patch the game widens
  the picture with the screen up to 16:9: 4:3 79°, 16:10 89°, 16:9 95°; a 21:9 or 32:9 screen is not wider — about 92° /
  90°, the game keeps it near 16:9's width; v234). The demo doesn't record the screen, so 16:9 is assumed for everyone;
  players with 4:3 or 16:10 screens see less than the site assumes.
- It is the **exact frame** of the screen, not width and height taken apart: less is seen up and down at its edges, and
  looking down, the ground near him is seen wider.
- **Through the sights the view is narrower**, by weapon (from the game files): pistols, shotguns and SMGs 74–78°, most
  rifles and machine guns 58–66°; a scope is round, as high as the screen: L85A1 23°, SVD and QBU-88 17°, M24, L96A1 and
  M95 11.5° (v234: the weapon's zoom factor is the view's height itself — up to v233 10% wider) — plus 10° to
  each side because the demo's view is sometimes slightly off. The narrow view counts for those he could miss, never for
  the man he is shooting at. (The server's summaries, which don't know the weapon in his hands at every moment, use the
  kit: a sniper with his rifle — the scope, a pistol 0.8, the rest 0.65.)
- (v237) **A TOW or HJ-8 gunner looks through its sight**: 34° high (58° across on 16:9 — the launcher's own camera),
  not a man's 63°. The demo turns his view with the launcher's; the gunner is the nearest soldier of its crew's side
  within 2.5 m. (An attack helicopter's gunner switches between two cameras the demo doesn't record: his view stays a
  man's.)
- **Line of sight**: lines from the eyes (where the game's camera is: straight over his position, 0.47 / −0.05 / −0.63 m
  standing / crouching / lying, 0.3 swimming (v237: the game's swimming pose, not the stance he had on land) — v233 put it 0.1 m in front, v234 back: the game drops that part) to the target's head, chest, shoulders
  and hips; blocked by the map's shapes, the relief and tree trunks. **Thin walls** (wooden boards, thin metal, plastic,
  cloth) don't stop bullets: a kill only through such things is "through thin walls", not "no line of sight".
- **Fog**: nothing is seen beyond the map's view distance (Karkand 140 m, Blue Pearl 90, Sharqi 195, Mashtuur 200,
  Songhua 250, Jalalabad 270, Fushe Pass and Gulf of Oman 400, Wake and Kubra 600, …). (v235) Inside it the map's
  fog, worked out as the game draws it, hides a man sooner: on Karkand nothing of him is left past 99.5 m, on Mashtuur
  past 155 m, on Songhua 204 m, Highway Tampa 305 m — unless he stands against the sky, which has no fog. (v236) On the
  map his field of view fades the same way, with a dashed fog line where nothing of a man is left.
- **Ticket bleed** (v235): a side loses tickets while the other side's flags weigh 100 or more (each flag's weight comes
  from the level's files) and more than its own — 10 a minute for each 100 of difference. On Karkand the 8 flags weigh
  104 and on Wake the 6 weigh 100, so there a side bleeds only while the other holds every flag. Round stats count the
  bleed this way; "Other" is what neither the deaths nor the bleed explain. **Smoke** from grenades and
  vehicles' launchers blocks for as long as it lasts.
- "**In view**" means inside the frame; whether walls were in between is checked separately (and only on the 22 maps).
- **His view** keeps an enemy faded for a few seconds where he was last seen, and adds what his side spotted; **Crew's
  view** does the same for everyone in a vehicle. An enemy vehicle counts as seen when its hull is in sight (its middle,
  roof, nose or tail; v228 — before, its own hull was mostly taken for a wall, so it was seen mainly through someone in it), and
  every empty vehicle is shown: nobody is in it to know of (a burning wreck only where he could see it).
- **Who saw whom first** (for kills on foot with small arms or an AT launcher): over the 6 s before the kill, every
  0.2 s — *first* (the killer saw him 0.3 s+ before he was seen), *even*, *second* (the victim saw him first and lost),
  *ambush* (the victim never had him in view), *blind* (no clear sight for the killer: through foliage or a gap the grid
  misses).

## Kill distances and the weapon

A kill's distance is from where the killer was to where the victim was — or, for a thrown or fired projectile (a
grenade, a rocket, a missile, a shell), from where it started, when the killer was there. Small arms never take a
projectile's start (that once gave a shotgun kill 502 m).

Because the game's kill message sometimes names what the killer holds rather than what killed, every kill is checked
(the same check on the round page and in the server's summaries):

- **A charge of his went off by the victim**: his AT mine, claymore or C4 blew up within 12 m of the victim within 1 s
  of the kill, while the hand-held weapon named could not have done it (he was in a vehicle, the victim was, or he was
  60 m+ away) → the kill is the charge's, with no distance. *Example: the "907 m SRAW" on Dragon Valley was his AT mine
  under a Type 98 while he flew an F-35B.*
- **A hand-held weapon while he sat in a vehicle**, or **a vehicle's weapon after he was on foot** → no distance (it
  wasn't a shot from where he was).
- **Farther than the bullet or rocket flies** (its life × its speed, from the game files: AK-101 500 m, SRAW and Eryx
  450 m, hand grenade 120 m, knife and defibrillator 10 m, grenade launcher 260 m) → no distance.
- **Air-to-air missiles**: from where he fired it — his latest weapon press before the kill that a missile could have
  flown from (at most 400 m/s, 12 s) — not from where his jet was at the kill; none possible → no distance.
- **A hand-held kill past the map's fog limit (+10 %)**: the distance is shown, but it is not a record (nobody sees that
  far; admins get the Beyond fog hint).
- The **commander's artillery** never counts as a player's longest kill.
- A kill with no weapon named (a crew that died with its vehicle) is named after what destroyed it (SRAW, a mine, a
  missile) or the killer's vehicle.

**Where the shot hit** comes from the kill message (the material of the killing shot): head, body, limbs. Grenades,
explosions and run-overs have none.

## Score, teamwork, assists

- **Score** is the game's own, from the scoreboard in the demo. When a player has no scoreboard line (rounds decoded
  before v132), it is **≈ Score**: worked out by the game's rules from what the demo shows.
- **Teamwork**: the game's teamwork points (assists, revives, heals, repairs, resupply, flags, commander; team kills and
  suicides take some off). **Assists**: the game's +1 at a team mate's kill.
- **Repairs** in records and posts are the game's own repair points, not every repair the page sees (a vehicle that
  repaired itself next to an engineer was once counted as 747 repairs).
- **Streaks**: enemy kills in a row without dying, **on foot** and **in vehicles** apart — a kill of the other kind
  doesn't break a streak, a death does, a revive keeps it going.

## Highlights

Moments worth watching, found in the events of the whole round (Round stats → Highlights, the Highlights tab, and the
round posts):

| Kind | Rule |
|---|---|
| Multi-kills | enemy kills by one soldier, each within 5 s of the one before |
| Long shots | on foot, small arms or an AT launcher, past 45 % of the map's view distance and at least 60 m |
| From above | a kill on foot from 4 m+ over the victim, standing 2.5 m+ over the ground (roof, upper floor, tower) |
| Through a gap | small arms, 8 m+, only 1 or 2 of the 9 lines from the killer's eye to the victim's head, chest and hips clear |
| From behind | the victim on foot faced 135°+ away from the killer at the kill, and 120°+ a second before |
| Vehicles | vehicles destroyed and who did it (when a kill tells: someone in it killed then, or a kill next to it) |
| Ambushes on armour, vehicle duels | vehicles caught unawares, and vehicle-against-vehicle fights |
| Flags | captures |
| Revives | revives under fire (an enemy within 20 m, or a kill within 20 m in the 5 s before or after) |

The "most" lines (most kills on foot, headshots, knife, claymores, mines, launchers on infantry, run over, grenades,
grenade launcher, C4, longest kills, streaks, K/D from 10 kills, revives, heals, repairs, flags, first blood, last killed)
show up to three names on a tie, and only when the round had such a thing.

## Records

- Worked out from every round's summary — the best value of each soldier in one round — for the last 7 days, 30 days and
  all time, for all servers and per server. A tie: the earlier round first. Unnamed slots ("Player 27") don't count.
- Categories: most kills (all, on foot, from vehicles), headshots, streaks on foot and in vehicles, longest kill, knife,
  claymores, mines, launchers on infantry, run over, hand grenades, grenade launcher, C4, revives, heals, repairs, flags,
  best score, best K/D (10+ kills); and for each **weapon group** its longest kill and its most kills in a round:
  hand-held weapons (no sniper rifles), sniper rifles, hand-held anti-tank rockets (SRAW, Eryx, RPG-7), launchers on a
  stand (TOW, HJ-8), tank cannons (M1A2, T-90, Type 98, Challenger 2, Leopard 2A6), other vehicles, anti-air guns
  (Tunguska, Type 95 AA, M6 Linebacker, Phalanx), anti-air rockets from the ground (Igla / Stinger, M6 Stinger, SA-19,
  QW-2, Sea Sparrow), air-to-air missiles.
- **Not records**: kills without a distance (the weapon check above), hand-held kills beyond the fog, the commander's
  artillery.
- **"New record"** in a round post needs history: the server must already have had 20 rounds (all time), 10 (30 days) or
  5 (7 days).
- When the rules change, the server recalculates by itself; the owner can also start it (*Recalculate all records*).

## Statistics over all rounds

- Worked out on the server (`data/stats/`) with the page's own code, after each new round only for its players and map.
- A **player** is his nick without the clan tag (the last word of his name), shown with his newest name; one player
  under several tags is one row.
- His page adds up his rounds; "how he gets killed" uses who saw whom first.
- **Duels** won / lost: kills of a man who had him in view in the 3 s before / deaths with the killer in view (the
  view sector, no walls). **Ambush kills**: the victim never had him in view. **Deaths blind**: he never had the
  killer in view.
- **Damage**: each drop of an enemy's health (10 times a second) goes to the enemies firing then with their view on
  him within 10° (on foot), firing from a vehicle within 400 m, or whose blast it was (shared when several).
- **Kills stolen**: his kills of a man who had lost under 30 % of the health he lost in the 10 s before to him and 50 %+
  to another; **kills set up**: the other way round.
- **Squad**: spawns on his squad, seconds within 50 m of his squad leader; **flag zones**: seconds in a flag's zone (not
  the main bases); **revive speed**: from a man's fall to his revive; **vehicles**: seconds, kills and deaths in each
  kind (10 s or more).
- **Heat maps**: where he (or everyone, on a map's page) kills and dies.
- **Clans**: by the tag in front of the nick. **Vehicles**: time, kills, kills an hour. **A server's page**: by hour and day
  of the week (the game server's clock), maps with each side's wins, round lengths, the flags that decide rounds.
- The extra numbers (duels, damage, …) exist for rounds summed up since v215 — the server summed up every older round
  again by itself.

## Rating (Elo)

Over the rounds in the order they were played, for rounds with a winner and 2+ men a side. Each side's strength is its
men's ratings, weighed by how much of the round each was on the field (20 % or more to count). Each man moves by the
result against what the strengths expected (K = 40 for his first 10 rated rounds, then 24), and a little (up to 8) by his
score a minute against his side's. Everyone starts at 1,500; "?" means fewer than 10 rated rounds.

## Clips

- Made **in your browser**: each frame is drawn off screen, 30 a second, and handed to the browser's video encoder
  (WebCodecs) — faster than real time: H.264 in MP4 where the browser has it (Chrome, Edge, Safari, Firefox on Windows /
  macOS), else VP9 in MP4; without WebCodecs it is filmed in real time (WebM or MP4). Up to 120 s of video.
- The picture is laid out for a 720 px high screen and scaled, so names and icons keep their size; the camera stays put
  or follows the soldier (a cut when he respawns). Sound is made from the demo: shots while a fire button is held,
  rockets leaving their launcher, explosions — louder near the middle, panned left or right.
- **GIF**: 10 frames a second, at most 20 s, 600 px on the longer side.
- **Game video** (v229): a kit for the game rather than a file — Battlefield 2 films the moment itself. The kit holds:
  - **the demo**, packed: the game can't jump in a demo, so the round before the clip is packed into a short stretch
    (each object's newest state, the events merged into large blocks, in the order the game needs), then the last 3 s
    before the clip and the clip as recorded, with the ticks and event blocks renumbered;
  - **a camera track per view** (`.bf2cam`): His eyes (a free camera at his eyes, a little in front of them so the body
    stays out of the picture; in a vehicle, its seat's view), Behind him / From the side (the game's camera on his
    player slot, turned with him, 7 m / 5 m, twice as far in a vehicle), Still (one camera over the shooter and his
    target);
  - **`make-videos.bat`**: the game films each view at 1280×720, 30 frames a second, and quits at the track's end; ffmpeg,
    when found, cuts the film to the clip and makes it an MP4 (H.264, the AVI deleted).
  The kit is made in the browser in seconds; it needs the round's demo (the server's, or your own copy).
- **Names as the game shows them** (v237, OpenBF2's name tags, read for knowledge): in his eyes an enemy's name only
  while he is the one under the crosshair (300 m at most, a clear line), a team mate's within 120 m; **Every name** puts
  one over everyone in the picture, as before.
- **Over the game videos** (v232, the idea from DemoAnalyzer, 2008, which draws in the game itself): an `.ass` file a
  view (shapes and text at each frame's time) that ffmpeg burns in. Every camera is one the page made — its place, yaw
  and pitch at every tick, 95° across — so each point of the round lands on the picture where it is: labels over the
  soldiers and manned vehicles within the fog limit (name, health, distance from him; faded where the map's He sees him
  says he couldn't), a ring round the one he aims at (the map's aim), in his eyes the crosshair with its distance, in the
  other views his aim line. Through his sights (`viewZoom`, the weapon's zoom from the game's files) his eyes are
  rendered again at that narrower view (`renderFieldOfView`, up to two zooms a clip) and ffmpeg puts that film in for
  those seconds; a scope (zoom 0.4 and under) gets the game's round sight, black round it. Behind him and From the side
  became free cameras made the same way as the game's (7 m / 5 m) for this.

## Posts and summaries

- **Round posts** go per game server, only to its own channels; a server not set up is never posted. Only rounds with the
  server's minimum of players (6 by default), recorded in the last 12 hours (not old demos downloaded in a batch), never
  clips. The post comes ~1–3 min after the round when its demo page is read every minute.
- Every number in a post is the round's summary — the same as Round stats → Highlights on the site.
- **Milestones**: 1,000 / 2,500 / 5,000 / 10,000 / 25,000 / 50,000 kills, or 100 / 250 / 500 / 1,000 / 2,000 rounds on the
  server. **New records**: as above.
- **Summaries** (day / week / month, at 10:00 Bratislava): rounds by the game server's clock, with the server's minimum
  of players; no rounds, no post; player of the period needs 2 / 3 / 5 rounds; period K/D needs 20 / 50 / 100 kills.
- Mentions ping only in a summary's **Text above**; round posts never ping anyone.
- **Admin channel**: after the background analysis of a new round (played in the last 2 days), its admin hints go to
  the server admins' private channel, once per round.

## Hints for admins

- Hints are worked out by the page itself (in the admins' part, not in the public page), on the server by the
  background analysis (a headless browser), and live in a round's Admin tab.
- **Thresholds** were tuned on archives of all rounds (1,619 rounds in v182, 2,779 in v213). Places where the game itself
  does what a hint looks for (teleports on Dragon Valley and Gulf of Oman, fast stretches, BTR-90 roads on Kubra Dam,
  spawn points missing from the layouts) are left out.
- (v227) **They are settable**: our tuned values are the *recommended* ones; the site can have its own set (used by the
  background analysis — a new set sends every round through it again) and each admin his own over it, for the rounds he
  opens — or a hint turned off. Both are kept on the server (`data/.admin`), never in the public page.
- **Field of view** for hints is the same 95° / scope model as above; Wide view looks at 50–70° off — a 21:9 or 32:9
  screen does not reach it (the game keeps those near 16:9's width; v219–v233 said it did).
- **Prone**: when a soldier lies down the demo seems to record where his body points, not where he looks — aim hints for
  a prone shooter need care.
- **Strength**: minor / hint / strong; a "chance" compares him with everyone in the same round (how often luck would give
  it). **Suspicion score** adds up how unlikely his hint rates are over his analysed rounds (players with 10+ rounds).
- **Glitch spot** uses a grid (2 × 2 m, 2.5 m high) of where living soldiers stood on foot in all rounds of a map; it
  needs 30+ rounds of the map.
- A hint is a reason to watch, never proof; see [admin-hints.md](admin-hints.md) for each one.

## Keeping demos

- A round stays on the site without its demo. Without the demo, it can't be decoded again when the decoder changes (it
  stays as it was decoded) — unless its source page still has the demo, then it is downloaded again (if the owner allows
  it) — and a game clip needs the visitor's own copy.
- Which demos go is set on the admin page (days, a GB limit, keep rounds with admin hints, a Keep list); the ones the
  source still offers go first. Below 5 GB free, the least needed demos go until there is room again.
- **⬇ Demo** on a round: from the site; if removed, **Demo at its source ↗** (the page it was downloaded from); a demo a
  game server uploaded and that was then removed: *Demo removed*.

## Pages, previews, RSS

- The site itself is one page that draws rounds with a script. For search engines and chats the server also writes
  plain pages (`/rounds/`, `/players/`, `/maps/`, `/records/`), `rss.xml` (the 50 newest rounds), `sitemap.xml` and
  `robots.txt` (with a domain), and small link-preview pages `/r/<round>` and `/p/<player>` that lead straight on to the
  site. They are rewritten only when they change; pages of rounds no longer there are removed.
- `rounds.json` is a light list (~0.5 KB → 0.15 KB a round); the full list and all kills stay on the server.

## Who may open what

Set on the admin page, card **Users and access** ([admin-guide.md](admin-guide.md#users-and-access)).

- **Guests** (not logged in) and **accounts** have the same parts of the site to tick: Watch rounds, All rounds, Players
  and maps, Records, Stats, Download demos, Video clips; guests also Link previews. An account may open what guests may
  plus its own ticks; the owner may open everything. Accounts may also have the Admin tab (of their servers) and cards
  of the admin page.
- **Where it is checked.** While some part is closed to guests, `admin.mjs` keeps `data/.access-gate`, and Caddy asks it
  about every request of the site (`forward_auth` to `/admin/api/gate`) before answering: the visitor's login against
  the part of the site the address belongs to. A page goes to `/login` (and back after the login, with its `#round=…`); a
  file gets 401 (not logged in) or 403 (logged in, not his). With every part open there is no file, and Caddy asks
  nothing — the open site never waits for `admin.mjs`. (nginx asks on every request; the answer is "yes" at once while
  the site is open.)
- **What decides a request**: the page itself, its version and `data/reprocess.json`, the decoded rounds — Watch rounds;
  `rounds.json`, `/rounds/` and its months, `rss.xml`, `sitemap.xml` — All rounds; `data/stats/players|maps|table`,
  `names.json`, `data/heat/`, `/players/`, `/maps/` — Players and maps; `data/stats/clans|vehicles|servers|server/|find/` —
  Stats; `/records/` — Records; `data/demos/` — Download demos; `/r/<round>` — Link previews or Watch rounds; `/p/<player>`
  — Link previews or Players and maps; the pictures and icons in `/assets/` — any part at all; `robots.txt`, `/login`,
  `/admin` — always.
- **The page hides** what a visitor may not open: Rounds, Records, Stats, ⬇ Demo, the Players tab, Map page, ‹ Newer /
  Older ›, the Clip button, players' pages. Its header button reads **Log in**, or the account's name.
- **Without All rounds** an account watches the rounds it gets a link to (a round's link, a player's page): the page
  asks `admin.mjs` for that round alone (`/admin/api/round-ref`). Round names follow their time
  (`auto_2026_10_18_20_28_05`), so this hides the list, not the rounds themselves.
- **Video clips** is the only part checked by the page alone: a clip is drawn in the browser from what the page shows, so
  there is no file to refuse. (A game video needs the demo, and so Download demos too.)
- **Closed link previews**: Discord, Telegram and the others never log in, so with Link previews unticked (and Watch
  rounds closed to guests) a link shows no card and the round posts show no map picture.
- **If `admin.mjs` is down** while the site is closed, Caddy can't ask, and the closed parts answer with an error until
  it is back (systemd restarts it at once). An open site doesn't depend on it.
- **Logins**: one cookie for the whole site (`bf2r_s`, HttpOnly, SameSite=Lax, Secure over https); 12 hours, or 30 days
  with "keep me logged in"; the admin powers of any login 12 hours (2 without a step). Kept in `data/.sessions.json` by
  the hash of each token, so an update logs nobody out.

## Privacy and security

- Visitors' choices (theme, columns, clip settings, layers) are kept only in their own browser.
- The admins' code, the hint rules and all admin data are not in the public page or folders; they are served only to an
  account with the Admin tab. Its servers' rounds only.
- The site can be closed to visitors who are not logged in, as a whole or in parts ([above](#who-may-open-what)).
- Passwords exist only as scrypt hashes on the VPS; logins are rate-limited; the login cookie is HttpOnly, SameSite=Strict
  and Secure over https. Webhooks and the bot token never leave the VPS.
- The web server never serves the server's private files (`data/.*`, logs, failed and dropped demos).

## Speed and size

- A round opens in 1–3 s (its `.bfr` is a few MB). A player's page loads one file of a few dozen KB.
- Decoding takes 5–15 s a round on the VPS (several side by side); summing up again ~0.2–0.5 s a round; the analysis
  5–30 s a round in the headless browser.
- A demo is 10–35 MB, a decoded round 2–7 MB; the analysis keeps ~10 KB a round.

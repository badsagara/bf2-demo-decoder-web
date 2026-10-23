# Changelog

What each version changed, newest first. "§N" points to a section of [server/INSTALL.md](server/INSTALL.md). After an
update the server does by itself whatever a version needs: decoding again when the decoder changed (its hash), summing
every round up again when the round summaries changed (`SUM_V`), and the background analysis going over every round again
when the hint rules changed (`HINTS_V`).

## v227

**The hints' thresholds: the site's own, and each admin's own** (Sagara: every admin can set what he needs himself,
with our recommended thresholds kept):

- **New: the thresholds editor**, in the site's page — the **Thresholds** button in a round's Admin tab, **Hint
  thresholds** in the Log in dialog, or `/#thresholds`. Every threshold of the hints — 148 of 50 hints: times, angles,
  distances, counts in a round, odds — with what it means, its name and our **recommended** value, and an on/off tick for
  each of the 56 hints. Find, *advanced* (the game's own figures and measured shares), *only the changed*.
- **The site's set** (the owner, or an account with the new right *Hint thresholds: the site's*): what the background
  analysis, the players' hint cards, the suspicion score and the alerts use. Saving it sends every round through the
  background analysis again (the hint rules become `7.<code>` while the set differs from the recommended). Kept in
  `data/.admin/hint-thresholds.json` — only what differs; *all recommended* removes the file.
- **Each admin's own set**, over the site's, for the rounds he opens (the Admin tab, For admins, the marks on the map),
  with *Use mine* to switch it on and off; it never touches the background analysis or anyone else. Kept in
  `data/.admin/hint-mine.json`; removed with the account.
- **New card on the admin page, Hint thresholds**: recommended or how many changed, which hints are off, by whom and
  when, each changed value against the recommended, the hint rules now, and a button to the editor.
- Both files are in the weekly copy (`backup.sh`). The server and the page clean a set the same way (a threshold a new
  version renames or drops is left out), so they always agree on the hint rules.

With the recommended thresholds nothing changes: the hint rules stay 7, no round is analysed again
([server/INSTALL.md §20](server/INSTALL.md#the-hints-thresholds-the-sites-and-each-admins-own-v227)).

## v226

**Rounds that can't be decoded again, and keeping the demos they need** (a site's report: 289 rounds stayed on an older
decoder for a day after an update):

- **Why they stayed:** their demo had been removed for its age (*Keep the demos of the last 30 days*) and their page no
  longer lists it — a game server's page lists only its recent demos — so there is nothing to decode them again from.
  They open as before, made by the older decoder.
- **Card Rounds** now counts them apart: "… by an older decoder that can't be decoded again (demo gone, no page lists
  it)"; the warning is left for rounds still to be decoded again (with how many are downloaded again from their page
  first).
- **New, card Demos: *Whatever the days, keep a demo no page lists any more*** (on by default): the days no longer
  remove a demo that can't be downloaded again (its page no longer lists it, or it was sent rather than downloaded), so
  its round can be decoded again after the next decoder change. Only *Demos may take at most N GB* (the oldest of them
  first) or a nearly full disk removes such demos — with no GB limit they stay until the disk is nearly full, so set a
  limit if the disk is small. *What would go?* and the plan show them as "no page lists (older than the days)".
- The decoding log no longer says "289 rounds with no demo left: kept as they were" every minute: once, when the number
  changes, with how many can be downloaded again and how many can't.

Nothing is decoded again (the decoder is unchanged).

## v225

**Where a soldier looks, bodies, and movement as the game shows it** (from the game's own networking code, as rebuilt by
the OpenBF2 project — read for its knowledge only, none of its code is in the site):

- **The view is where the head looks.** The demo sends a soldier's view in two parts: the way his body faces and how far
  his head is turned from it (up to 40° either way while he stands or lies; walking, or past that, the body follows).
  The site took the body's way for the view; now it adds the two up. At a kill the killer's aim was 3.3° off the victim
  in the middle, now 0.6–0.9° — the field of view on the map, *In view*, who saw whom first, the side view and every hint
  that asks where he looked are that much nearer the truth. *Smooth aim* has a new threshold (0.5°, 4 kills).
- **Bodies.** The demo has a dead soldier's ragdoll (his hips and shoulders) while he falls, then where he lies: the new
  **Bodies** layer shows each body, head this way, until the game uses that soldier again for a spawn (the game keeps a
  fixed set of soldiers: from seconds to minutes) or a medic revives him. A wounded man's mark now sits on his hips.
- **Movement between the records.** Each 0.1 s step holds where a soldier or vehicle was at that very moment, between
  the records either side when they are less than 0.5 s apart (the game's own rule) — not the last record, up to 1/30 s
  old: a jet was up to 4–6 m behind, a jeep up to 0.8 m.
- The decoder's notes name the rest of what the demo holds: the two unknown fields of a soldier (the head's turn and the
  turn his body still has to make), a vehicle's "flag 16" (its ammo, 0–15) and flag 7 (at rest), a soldier's ammo, and
  the "tail" of a vehicle's record (its turret, each wheel's spring and the engine: nothing the map shows).

The decoder changed: the server decodes every round again by itself, and the background analysis goes over every round
again (`HINTS_V` 7) — also each round decoded again by a new decoder, which it did not do before. The `.bfr` files are
2–5% bigger.

## v224

**Who may open the site.** On the admin page the card *Servers' admins* became **Users and access**: ticks for what
guests (visitors not logged in) may open — watching rounds, the list of rounds, players and maps, records, stats,
downloading demos, video clips, link previews — so the site can be closed as a whole or in parts; and for each account
what it may open on top of that, the Admin tab of its servers, and which cards of the admin page it may use (posts: its
servers only). One login for the site, the Admin tab and the admin page: the page `/login` (where a closed page sends a
visitor, and back after it), the site's **Log in** button, "keep me logged in" for 30 days; the admin powers of a login
last 12 hours. The logins survive updates. Caddy asks `admin.mjs` about each request only while something is closed;
nginx: new blocks in `nginx-example.conf`. The weekly backup also keeps the accounts, the access settings and the
admins' review. Accounts made before keep what they had. (§23)

## v223

The README is in English, without paths of one particular computer, and has the installation steps; the version history
moved here (`CHANGELOG.md`, in English); `server/INSTALL.md` and `gameserver/README.md` are in English. No change to the
site's code: no decoding or summing up again.

## v222

Documentation in English in `docs/`: installing and configuring (install.md), the admin page, posts, the Admin tab and
review (admin-guide.md), the hints for admins (admin-hints.md — not for players), for players (user-guide.md), and the
particulars of each feature (features.md). No change to the site's code.

## v221

Records without impossible distances and weapons: a kill by a mine that the game named "SRAW" is now the mine; a
hand-held weapon from an aircraft, a vehicle's weapon on foot, and a kill farther than the bullet flies keep no distance;
an air-to-air missile counts from where it was launched; a hand-held kill beyond the fog is not a record; repairs as the
game counts them. SUM_V 16, HINTS_V 6 — the server recalculates everything itself (§15, "Records: weapons and distances
that could not have been").

## v220

On the admin page an explanation under each card and a guide at the bottom (How to use this page). The summaries got
Discord settings of their own: a separate channel or the round posts' one, Telegram, the title and texts, a mention above
the cards (@here, a role), the parts, the length of the top, the rows of leaders and bests, tables as "exact columns" or
"bold numbers" (§15).

## v219

The field of view as on a 16:9 screen (95°; since the 1.5 patch the game widens the picture with the screen), the exact
frame of the view, narrower through the sights by weapon (a scope — a round view), Wide view 50–70° with a note about 21:9
monitors. HINTS_V 5, SUM_V 15 — the server goes over the hints and summaries of every round itself (§20).

## v218

In the "a card with a table: a row each" post, First blood and Last killed take two lines: the first — who killed (First
blood) or who was killed (Last killed) and the round time; the second, under it — whom he killed / who killed him and with
what.

## v217

The "a card with a table: a row each" post: the player column as wide as the longest nick (one space after it); a tie — as
many nicks as fit, the rest "+N".

## v216

The soldier's field of view 90° (45° to each side; it was 79°, a 4:3 screen): the view sector on the map, "sees / saw
first", "Didn't see his killer", Wide view (the band 47.5–67.5°), Reaction, Pre-aim. HINTS_V 4 — the background analysis
goes over every round's hints again; SUM_V 14 — the server sums up every round again itself (no decoding again).

## v215

More statistics: a round's summary has each player's duels, damage, assists, squad, flags, revives and vehicles, each
kill's time and vehicle, and the round's flags (SUM_V 13 — the server sums up every round again itself, no decoding
again). A rating (Elo) and the columns "Duels & teamwork" in the Players table; on the player's page — rating, duels,
damage, nemesis, vehicles and a heat map; on the map's page — a heat map; the Stats button: clans, vehicles, the servers'
pages (when they play, maps, the flags that decide a round) and search moments. In the round post — Milestones; in the
summaries — the player of the day / week / month (§18, §15).

## v214

The decoder also reads from the demo how many rounds are in the magazine at each trigger press, and presses shorter than a
game tick (a press counter): **the decoder's hash changed — the server decodes every round again by itself**. New hints
For admins: Clicker, Bullet rate, Spot rhythm, Anti-AFK script, Prone spam, Bunny hop, Lag switch, One-hit kills, Silent
aim, Aim lock, Spin, Side switch, TK + revive, Sniper headshots; snipers' Pre-aim is compared with snipers; Through walls —
not on an aircraft carrier, Kill farming — not from aircraft. A suspicion score on the player's card and a list of the
highest on the admin page; the admins' Discord channel (alerts.mjs) — the hints of each new round after the background
analysis. The analysis archive has every press (Q, U) and the victim's health before the kill. HINTS_V 3, ANALYZE_V 2.
Short name "Far Veh".

## v213

Hints from the archive of 2,779 rounds: the places on maps where the game itself "teleports" or speeds players up (Dragon
Valley, Gulf of Oman, Kubra Dam), spawn points missing from the layouts (Mashtuur City and others), the BTR's missile 4 s,
Fired at a wall from 6 bursts, Fast flag at +2 soldiers; Beyond fog — for every weapon but mines, claymores, C4,
artillery, AA missiles and guided missiles; a "which weapon" filter in the Kill feed / Highlights / For admins; short row
names for the table post; thanks to High Definition Minimap (at the bottom of the page). HINTS_V 2 — the background
analysis goes over the rounds again.

## v212

Fixed **Make an archive** on the admin page ("Cannot access 'pageHv' before initialization": the analysis archive had not
been made since v193) and the creation of the Glitch spot folders on a new installation.

## v211

In the table post, the name and the player in monospace, each padded to the longest, with a `|` after each: the
separators stand at the same place in every row, the bold numbers start at one level (§15).

## v210

**Each demo page at its own interval** (the admin page, Where demos come from: from every minute to once a day, or off;
the timer every minute), and a demo already followed by the next one is taken after 30 s instead of 3 min: the post in
Discord 1–3 min after the round (§5). In the table post the numbers are **bold**, with `|` (or, as before, exact
monospace columns). Explosives split: **hand grenades**, **grenade launcher**, **C4** apart (mines and claymores as they
were), "Explosives" removed — in the posts, Highlights, Records and summaries; SUM_V 12.

## v209

**The server's summaries for the day, week and month** as a separate post at 10:00 (Bratislava): the server's numbers, the
top 10 by score, the period's leaders by kind of kill, the best in one round; turned on by ticks per server (§15). The new
timer `bf2replay-digest.timer` installs itself.

## v208

The Discord post **as a table**: "Discord as" → *a card with a table: a row each* — a monospace table, one row per kind of
kill (name, result, player), new records as a table of their own (§15).

## v207

The Discord / Telegram post at the end of a round: the **scoreboard** (the best five of each side), the server's **new
records** the round broke (all time / 30 / 7 days), and the weapon-group parts as in Records (off until turned on); SUM_V
11 (§15).

## v206

On the admin page (card Rounds) the button **Recalculate all records**: every round is summed up again from its decoded
file, the records and pages are written anew (§14).

## v205

Anti-tank apart: hand-held (SRAW, Eryx, RPG-7), on a stand (TOW, HJ-8) and tank cannons (apart from vehicles); SUM_V 10.

## v204

**Records by weapon group** (the longest kill and the most kills): hand-held weapons without sniper rifles, sniper rifles,
anti-tank rockets (hand-held and on a stand), vehicles, AA guns, AA rockets from the ground, air-to-air missiles. And
above all: kill distances are now worked out anew for **old** rounds too — a round's decoded file (.bfr) had the
distances of the code that decoded it, and v201–v203 didn't change them (so the site still showed 910 m); SUM_V 9.

## v203

A player's "Longest kill" (the table Players · all rounds, the card, Round stats, CSV) without the commander's artillery
(the shell flies from the gun: on Wake 18 Oct 18:52 — 1353 m and 1038 m), as in Records; SUM_V 8 — the round summaries
once more.

## v202

The button **⬇ Demo** for each round (and on its page `/rounds/…`): the demo from the server, and if it was removed — a
link to where it was downloaded from (§21).

## v201

**Kill distances fixed**: a small-arms kill no longer counts from someone else's throw or projectile (it was: a DAO-12 at
point blank — 502 m, an L96A1 from 148 m — 910 m); the rounds are summed up again (SUM_V 7) without decoding again, the
records and posts with the right distances. **Records with a server choice** (`/records/<server>.html`). The site on a
phone — a mobile layout (`<meta name="viewport">`). The **Aim line** toggle is in Filters ▾ too.

## v200

**All rounds on a page of their own** (the Rounds button at the top or a click on the round's line; instead of the
drop-down list): server (buttons with counts), map, days from–to, players from, length from, find a player (and his
page), sorting by columns, 200 rows at a time (Show 200 more / Show all), a CSV of those picked; each round a link (it can
open in a new tab), the filters in the address (§11).

## v199

Logging in for admins from the main page too: the **Admin** button at the top (a window with name and password; after
logging in — Admin ✓, the way to the round's Admin tab, the admin page, log out). The password is never shown and never
gets into an address or the browser's storage (§22).

## v198

**Review** in the Admin tab: marks on hints (✓ checked, ✗ false, ⚑ suspicious), the filter "without the reviewed and
trusted", trusted players (★, not highlighted), notes on the round and on the player, a report for the servers' admins (a
text for Discord or an .html with links to the moments). Kept in `data/.admin/review/` (§22).

## v197

In the Admin tab also **Players** (each soldier: hints, headshots against the expected with the chance, reaction, aim,
kills without line of sight, distance, ping; History — his rounds, servers, other names, the hints card), **Kills** (every
kill with the analysis numbers, filters, sorting, CSV) and **The round** (gaps in the recording, who joined / left /
changed sides, the server's settings; where and when the demo came from, copies, the decoder, the analysis).

## v196

Everything for admins taken off the public page (the For admins tab, the player's hint card, the headshot chances — and
the hints' code itself): every round has the **Admin** tab, logging in with a password. You — with an empty name and the
admin page's password; the servers' admins — with their own accounts (admin page → Servers' admins), they see only their
servers' rounds. Hint filters: player, side, strength, weapon, time, players with N+ hints (§22). The page is now built
from `src/index.html` (`node server/splitpage.mjs`: the public `site/index.html` and the admins' part
`server/admin-round.js`).

## v195

An editor of the post for each server (admin page, The post): the classic post, a Discord card with a table (fields 1-3 in
a row, a colour, the map's picture, a line at the bottom) or text; the order of the parts, their own names, own title and
lines with placeholders ({map}, {foot}…), an entirely own text; Telegram — with the same order and names; templates for
every server.

## v194

Posts to Discord / Telegram for each game server apart: its own webhook and / or chat (one Telegram bot), its own parts,
its own minimum of players if wanted; rounds of a server not set up are not posted. The old common settings were copied
once into the servers with rounds in the last 30 days (§15).

## v193

Find a player in the tab Players · all rounds and on the page /players/: the rows whose name (or nick) has what was typed;
Enter with one match opens his page. On the admin page, card Background analysis: the buttons Run now, All rounds now
(without the 40-round limit, several at once, run after run until all are done), Pause / Go on; what the run does now and
what the last one did. There too — the archive for Claude: Make the archive and Download, its name with the site's
version (`bf2-analysis-<date>-v193.tar`), and in the table which page versions and hint rules the rounds went through.

## v192

Records over many rounds with the same categories as Highlights (streaks on foot and in vehicles, the longest kills with
a launcher / hand-held / sniper rifle, knife, claymores, mines, run over, explosives, flags…): the Records page (/records/,
7 days / 30 days / all), "His best in one round" on the player's page, "Records on this map" on the map's page. On the
admin page — the card Background analysis: how many rounds the background analysis has done, when it will finish, how the
Glitch spot grids are doing. The round summaries are worked out again from `.bfr`, the statistics written anew.

## v191

The Kill feed panel left of the map (not in full screen) folds into a narrow vertical strip the full height of the map,
and the map moves up to it; a click on the strip unfolds it. Under the map (a narrow window, a phone) — as before, down to
the tabs.

## v190

Kill streaks apart: on foot and from vehicles (a kill of the other kind doesn't break the streak, a death does) — in
Highlights on the site and in the post (two ticks on the admin page instead of one). The round summaries are worked out
again from `.bfr`.

## v189

The Hide button is easier to see (on the strip over the map, top right), and the Kill feed / Highlights / For admins panel
(left of the map or under it) folds too with its own Hide button, down to its tabs.

## v188

Round stats of each round has a Highlights block: the same as in the post (most kills on foot, from vehicles, headshots,
knife, claymores, mines, launchers on infantry, run over, explosives; the longest kills; streak, K/D, revives, heals,
repairs, flags; first blood and the last killed) — a click goes to the player or to the kill. The Kill feed over the map
folds with a button on it (or J). Mines were added to the post too; the round summaries are worked out again from `.bfr`.

## v187

What the post about a new round (Discord / Telegram) holds can be chosen on the admin page, for each one apart: most
kills on foot, from vehicles, headshots, knife, claymores, launchers on infantry, run over; the longest kills (launcher,
hand-held weapon, sniper rifle, anything); streak, K/D, revives, heals, repairs, flags; first blood and the last killed;
with a preview. After the update the round summaries are worked out again once from `.bfr`, without decoding the demos
again (§15).

## v186

On the admin page the card "Demos: what to keep": how much room each thing takes and which old demos to remove (the rounds
stay and open as before): older than N days, above N GB, except the rounds with hints for admins and the Keep list; first
those the source page still offers. When the decoder changes, a removed demo the page still has is downloaded again,
decoded again and goes again. Copies of rounds (`data/.copies`) — by a button. No decoding again (§21).

## v185

On the player's page the card "Hints over his rounds": each "For admins" hint over all his rounds against the share of
everyone, with the chance of it by luck and links to the rounds; a new hint, Glitch spot — 20+ s where in all of the map's
rounds nobody but him stood, while others stood right above or under him (under a floor, in a rock or wall, on a roof).
Both are worked out by the new background service `bf2replay-hints` (§20; the first time faster: `analyze.sh glitch`).
Special Forces rounds (Mass Destruction, Surge) no longer put everyone into one team (not every kill a "team kill").
Floating — from 8 s, Fast flag on Kubra Dam — Bridge Base counts those under the bridge, Speed — not for two carried by
something together, Beyond fog — only 2+ in a round. In the selected soldier's card — the Aim line button (the X key): a
line from him to where his crosshair looks. Decoding again only of rounds on the Euro Force and Special Forces maps.

## v184

Thresholds of five more hints from the second analysis archive (675 rounds with v182 / v183 visibility): No line of sight
and Through smoke — only for one who has 2+ such kills in a round; Fired at a wall — only 4+ bursts at a hidden enemy (not
one long one); Guided missiles — against the share of hits of all TV gunners (38%), not a few in a round; Speed — not in
the first 10 s of the round. "Suspicious" hints ~0.9 a round (it was 2.1; before v182 — 4.6). No decoding again.

## v183

On the player's page headshots compared with what his weapon gives everyone (over all his rounds; red when chance doesn't
give it so often); kills for which the game names no weapon (a crew that died with its vehicle — 8% of all) named by the
weapon that destroyed it (SRAW, a mine, a missile) or the killer's vehicle; Damage no longer fires on the exposed gunner of
a tank or an AA vehicle; Spawn — not on the round's first spawns. After the update `ingest.mjs` works out every round's
summary again once from the decoded files, without decoding the demos again (§18).

## v182

The same demo from two pages (the clan's page and the game server's own) no longer becomes two rounds: `fetch.mjs`
doesn't download it a second time, and the copies already there `ingest.mjs` takes off the list and the statistics into
`data/.copies` (links to them open the same round; §5). The thresholds of the "For admins" hints picked on 1,619 rounds of
analysis (§19): Vehicle speed (boats), Stamina, Aim snaps, Headshots, Fast flag. The analysis ends by itself after `stop`
and makes an archive. No decoding again.

## v181

In "His view" the sounds of shots and explosions (rings; off screen — arrows at the map's edge; how far each carries from
the game's sound files), a speaker button in the tag over the map and Filters ▾ Sounds. No footsteps yet.

## v180

The game's material table (Common_server.zip): bullets pass through boards, thin metal, plastic, cloth; a kill only
through such things is not "No line of sight" but "Through thin walls"; Fired at a wall and Wall tracking are checked with
the exact shapes. The files assets/geo updated (all 22 maps). No decoding again.

## v179

"Crew's view" for vehicles (what its crew saw), soldiers on a roof / upper floor / deck lifted over their shadow (Filters ▾
Heights), a used medic bag disappears from the map when picked up. No decoding again.

## v178

Who sees whom, more exactly: the eyes' height as the game's camera, 3 more body points (shoulders and hips), the sights
stop at the exact shapes of walls; on Operation Road Rage and Midnight Sun the walls of the market stalls appeared
(fibreglass counted as glass). No decoding again (the same decoder); for the analysis see §19 about v178.

## v176

`rounds.json` three times smaller again: a round as an array, server and teams as numbers (6,000 rounds: 3.1 → 0.9 MB;
§18).

## v175

The analysis of all of a server's rounds for the hints' thresholds: `sudo bash /srv/bf2replay/repo/server/analyze.sh
start`, in the background for a few hours, then an archive for Claude (§19).

## v166

`rounds.json` — a short line per round (~0.5 KB instead of ~5), the full data only on the server (§18).

## v165

The numbers over all rounds (the player's pages, the comparison, the maps, the players table) are worked out by the server
in `data/stats`, and the site loads only the file it needs (§18).

## v163

What is being decoded now and what waits its turn, the Stop button; a run that met an update ends by itself (§17).

## v162

How many demos the server decodes at once (new ones and again), and how fast it went with each number, to find the best
one for the VPS (§16).

## v153

Posts about new rounds in Discord / Telegram (a webhook or a bot; §15).

## v150

The admin page `https://domain/admin`, with a password: the server's state (rounds, the demo queue, decoding again,
services, disk, log), the buttons "decode now / decode again / download now / update / copy", the list of servers to take
demos from (add, check, remove). The password is set once on the VPS — `sudo node /srv/bf2replay/repo/server/admin.mjs
--set-password`; it is not in the repository. The rest installs itself with the update (§14).

Earlier versions: see the git history.

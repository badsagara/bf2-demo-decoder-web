# Changelog

What each version changed, newest first. "§N" points to a section of [server/INSTALL.md](server/INSTALL.md). After an
update the server does by itself whatever a version needs: decoding again when the decoder changed (its hash), summing
every round up again when the round summaries changed (`SUM_V`), and the background analysis going over every round again
when the hint rules changed (`HINTS_V`).

## v261

**Faster to open your own demos; the zoom's wide view measured** (todo 190 and 213; Sagara: «Давай 19 і 20»). No decoder
change (`777ef24786`), hint rules unchanged (22) - the server does nothing again.

- **Decoded before - kept in this browser**: a demo opened from your computer is kept decoded in the browser (IndexedDB,
  the server's `.bfr` layout - about a sixth of the demo; packed by the decoder's worker while the map is drawn) and
  comes back from it when the same file (name, size, date) is opened again with the same decoder: a 27-minute round of
  62 players (42 MB) 13.9 s -> 1.3 s, a folder of 4 rounds 23 s -> 1.7 s (this test machine; the same round, every column alike).
  The Demo file card says so and has *Forget them*; the 80 last opened are kept, at most 600 MB.
- **The map first**: the admins' hint list is worked out after the map is drawn - a big round's map 2-3 s sooner for an
  admin (Gulf of Oman 03.10: 14.7 s -> 11.9 s).
- **A folder of demos**: as many at once as the computer has room for - half its cores, at most 4, ~2 GB each (2 where
  the browser doesn't say its memory).
- **Wide view through the sights** (todo 213): looked at and not added. The view narrows with the zoom of the weapon in
  his hands since v234 / v255 (the sector, His view, In view, who saw whom first); a turn to an enemy who came outside
  the zoomed view (16-47° through a scope, 39-47° through iron sights): 16 demos, 112 such chances in all, honest players
  took 20-21 % of them - as many as the plain Wide view's band, and too few chances a round for a hint.

## v260

**What the cheats Sagara sent can do, against the demo** (todo 326: SummitSense's features, a hook that widens the
view; Sagara: «Так даю згоду. Давай 1,2,4»). **The decoder changes** (`777ef24786`): the server decodes every round
again by itself; hint rules version 22.

- **The view's pitch read right** (the decoder): in ~2 % of the records it was read from a bit offset of the old layout
  and jumped to 65-70° up for 0.2-6 s (19,435 such jumps in 4.3 million records on foot in 16 demos; 5 % of small-arms
  kills looked 20°+ off the victim up or down). Now each record's own angle: Karkand 09.10 1,130 jumps -> 44, such
  kills 68 -> 1. Who saw whom first changed in 51 of 6,849 kills, the K column's pitch error in 470; no hint more or
  less but the one below.
- **Anti-Aim - new, in shadow**: 3 or more kills (as Silent aim counts them) with the view 30°+ off the victim up or
  down at the kill and 0.1 s before (honest: 0 of 1,339), or 20 or more jitters in a round - the pitch 30°+ (the
  heading 60°+) one way and straight back the next 0.1 s (honest: at most 8 and 3). Silent aim looked across only.
  Made up: 39 of 39 kills; 30 jitters - hints.
- **Guided missiles: the last second too** - 3 or more hits on a moving target with the missile within 0.5° of it at
  the middle of each hit's last second (a cheat's "Smoothness" with "the final approach stays precise"). Honest gunners
  are no finer at the end: 1.8-2° at the middle, the lowest gunner 0.94°. Made up: 0.11° - a hint.
- **Wide view 70-90° and Enemy behind - new, in shadow**: Wide view's turn to an enemy who came into the band, for
  70-90° off where he looks (a view hooked wider) and behind him (90°+: a cheat's "enemy nearby" warning), each against
  the round's others' own share (honest: 16.6 % and 7.6-11 % taken). 16 demos: one hint, Volund 8 of 14 at 70-90°
  (Karkand 18.10); made up: 8 of 9 and 6 of 6 - hints.
- Measured, nothing to add (claude/measure-326.md): aircraft - bombs are not decoded as projectiles and honest pilots
  hold the nose within ~1.3° of the target at gun kills anyway; a TV missile's air burst - its height is not kept.
  Eleven new thresholds (201 in all).

## v259

**What the v258 archive showed** (Sagara: "роби 259-ту версію"). No decoder change; hint rules version 21 (the server
looks at every round again by itself).

- **Inside an object - a new hint, in shadow** (`inside`): kills by a man whose eye was inside a solid collision shape
  (a wall, a rock) at the kill and a second before it, **2** or more in a round. A bullet leaves a shape from inside,
  so he shoots out while nobody can hit him. Each kill: three rays from his eye, a little off the axes, each crossing
  the shape's faces an odd number of times. In the v258 archive two men near-blocked No line of sight that way; their
  demos: ZdarovaByli (Karkand, SiC, 06.10 10:16) lay inside the old city wall `stnwalls_50m_up` (50 x 7.1 x 4.1 m,
  solid) for **34** kills; and on the 16 test demos one more - 8964 MisterLok (Road to Jalalabad, 01.10 18:33) lay
  inside `rockpile_1`, his eye 0.2-0.6 m under the rock's top, 13 kills (10 with an L96A1 at 26-137 m; v257's "a
  sniper lying on a rock pile" - he was in it). Nobody else: in 6,730 kills one more man had one kill so (MrRubert, the
  same wall) and two men a single moment. Slizka_DK (Karkand's cargo wagons) was not inside: he stood 0.2 m beside a
  wagon, his eye 8 cm under its floor - shooting under it (No line of sight as before). One new threshold (190 in all).
- **Beyond fog: not at a spotted man - only spotted** (v258 left out the UAV ring too: 125 of the archive's hints went
  that had no spot at all). The UAV shows men on the minimap, not through the fog on the screen. 16 test demos: 4 hints
  back (MicrosoftExcel, Karkand 13.10).
- **The object he lies or stands on**: looked for in five spots - under him and 0.6 m round him (between two cargo
  wagons, at a wall's edge), not only straight under him. And **a man lying down, the ground in his first 6 m** blocks
  a line only 0.5 m or more over it (not 0.15 m): a sniper lying on a hill's crest sees down over it (the archive:
  Dragon Valley, 72McBrew and 1offFour - no demo of it among the test ones). 16 test demos: no hint more or less; who
  saw whom first changed in 71 of 6,849 kills, the reaction time in 80.

## v258

**What the v254 archive still showed** (Sagara: "Давай з першого по третій пункт"). No decoder change; hint rules
version 20 (the server looks at every round again by itself).

- **The object a man lies or stands on, in every check of whether he could see**: v257 left it out of the first 6 m of
  a killer's lines in No line of sight; now the same in Wall tracking, Fired at a wall, Pre-aim, Ready for contact, who
  saw whom first and His view - a man lying on a roof or a rock sees over its edge. Ready for contact is checked again
  with the exact shapes too (hidden on the 25 cm grid, but in sight with the exact shapes: not a coming out). 14 test
  demos: no hint more or less; who saw whom first changed in 153 of 5,733 kills, mostly from "even" to "first" or
  "second".
- **Aim lock, Aim snaps and Target switch against the round's others** - they came mostly from one server, SiC's
  infantry-only Karkand (Aim lock 44 of 50, snaps 47 of 66, switches 38 of 73 in the v254 archive), where the same
  things happen as often per kill as everywhere (snaps 0.7-0.9 % of kills; a quick double kill swings 40 deg or more
  6-8 % of the time; honest kills within 0.2 deg of the chest's height 29-36 %) - there are just more kills and more
  close fights. Now each also needs so many of his kills that the odds at the round's others' share are small: Aim lock
  (within 0.2 deg) 1 in 10,000, snaps and switches 1 in 1,000; switches one hint a man, 2 or more. On the archive's
  numbers: Aim lock SiC 3, 2F4Y 1, Lost-Soldiers 1; snaps SiC 5, 2F4Y 1; switches 2 (two men with 6 in a round). Made
  up: Aim lock 35 of 35, snaps 5 of 43 - hints. Five new thresholds (189 in all).
- **Beyond fog: not at a spotted man** - his side had him spotted in the 6 s before, or in its UAV ring: the game
  draws the spot's mark through the fog, and men fire at the mark (20 of the archive's 262 hints).
- Looked at, nothing to change: Beyond fog on 2F4Y is no server setting - small-arms kills past the view distance are
  as rare there as on SiC (snipers 0.13 %), it just has more vehicle maps; vehicles' kills past it 0.13 % of 196,894
  (Blue Pearl's 90 m: kills fall away sharply after 100 m - right).

## v257

**The decoder (Sagara: "Даю так на зміну декодера") and the v254 archive's findings.** The decoder changes
(`36b9346419`): the server decodes every round again by itself. Hint rules version 19.

- **Soldiers the demo never showed a spawn for** (alive in its opening snapshot, or a spawn message not read): their
  records had no owner and the man no soldier - 2F4Y 10-09 21:31: Simflera, alive from the start to 6:21, a TOW, a Kord,
  medic bags, three kills, and nowhere on the map. The decoder now gives such a soldier to the man whose own acts were
  where it stood - his throws (grenades, bags, charges: the game's MissileInit names him) within 2 m of it, his
  hand-weapon kills along whose bullet it stood - 2 or more, 80 % of them, nobody else's; each stretch of it with no
  spawn of his own in it and no soldier of his own beside it. 14 test demos: Simflera (0:00-6:22), STEELDOG842,
  derB0ehseMann (their first minute or so), Shukrija (Gulf of Oman, 0:00-2:57: charges and grenades at the start), no
  one else; their kills are measured now (Simflera's two Beyond fog hints went: he was in range).
- **Grappling ropes as they were**: the rope's own events (each of its particles; where the man on it is, ~30 times a
  second) - the map draws the rope's real shape (from the hook over the edge, hanging down) and a man climbing goes up
  it, not 6 m in one step at the top (Mass Destruction: 10 of its 19 ropes with their shape).
- **No line of sight: not the object he lies on** - the first 6 m of the killer's lines leave out the object right
  under him. The v254 archive: 149 of its 204 hints were lines that met an object within 6 m of the killer, 95 of them
  men lying on it; Road to Jalalabad's rock piles alone 63 - one sniper lying on top of one, 45 hints in 13 rounds
  (his demo: 11 kills, the line clipping the rock 1-5 m in front of him, all gone).
- **Beyond fog: not the carriers' Phalanx** (an AA gun): 74 of the archive's 336 fog hints, men on foot 640-960 m
  away, 70 of them one player on Gulf of Oman and Wake - in his demo the hits came from every side, not from him: its
  shells burst where they come down, he fired across the sea at the enemy's flag.
- **Ready for contact** (in shadow): not while a sniper rifle is in his hands - 90 of the archive's 113 hints were
  snipers, all 9 of the strongest (a scoped sniper holds a doorway as a matter of course). rambow2 and MicrosoftExcel,
  the 49 demos' two, were snipers too. A made-up wallhacker (a rifleman): 21 of 32 - still a hint.
- **Recoil script** (in shadow): the archive's 7 hints were the data, not scripts (an ammo bag's "61 shots"; 4 with
  the view not moving at all, not even sideways). Now only the gun of his kit's rifle slot, no more shots than its
  magazine ever held in the round, his view moving sideways in some steps. Made up: 3 of 3, 4 of 4 - a hint.
- 14 test demos against v256: every other hint the same (11 No line of sight, 7 + 2 Beyond fog, 2 Ready for contact
  gone; nothing new); 7 demos the same in every number.

## v256

**The admin page's Remove, the analysis' failed rounds** (Sagara: Remove of an archive did nothing - "без підтвердження,
хай відразу видаляється"). No decoder change, nothing summed up or looked at again.

- **Remove an analysis archive at once**: no question first (in his browser the page's question never showed, so the
  click did nothing). Download it before, if it is still needed.
- **Rounds that "failed" while the server decoded again**: the v254 archive had 673 rounds marked failed - 670 with
  `....18e8999d15.bfr: 404`: the background run went on with the list it had while every round got decoded again (the
  decoded file gets a new name), and a failed round waited for the site's next update. Now such a round is opened again
  in a new page (with the list as it is now), and if it still fails, tried again an hour later.
- From the v254 archive (3,519 rounds; not changed yet, for a next version): *Ready for contact* - 90 of its 113 hints
  are snipers (a scoped sniper holds a doorway, as Pre-aim found in v214); *Recoil script* - its 7 hints look like
  data, not scripts (an ammo bag, records with no new view); both stay in shadow. The v253 fixes hold (Spawn 1,984 -> 39,
  No recoil 1,021 -> 103, Endless ammo 124 -> 2, Shot from elsewhere 19 -> 2). Two things need a demo: Road to
  Jalalabad's `rockpile_1` (63 of the map's 85 No line of sight hints), and the carrier's Phalanx in Beyond fog
  (74 hints, men on foot 640-830 m away).

## v255

**What could be done without Sagara** (Sagara: "Давай все що можеш без мене"). No decoder change (no round is decoded
again); round summaries version 20 and hint rules version 18, both done again by the server from the decoded rounds.

- **The background analysis twice as fast**, the same hints (49 test demos, as the server runs it: 398 s -> 172 s;
  every hint as v254; 43 of them every number the analysis keeps as v254 too, the other 6 only in the flag choices and,
  in 2, the "who saw whom first" of a few kills - the zoom of his sights now read at the 0.1 s step itself). On the
  biggest round (64 players, 45 min) 41 s -> 21 s; 7 big and small rounds 206 s -> 105 s:
  - the exact shapes (who sees whom, No line of sight, His view, Flag choices): each object's faces in a tree of boxes,
    so a line looks only at the faces it can cross - the same hits, 3-9 times quicker;
  - the weapon in a soldier's hands: by halving, from his own kills, not every event of the round from its start (10-30
    times quicker), and the zoom of his sights kept per 0.1 s in an array (a map of 50,000 emptied when full was most
    of the time of the flag choices);
  - ammo bags: each soldier's life gone through once, his place worked out alone (10 times quicker).
  (v254's "Ready for contact makes the analysis a quarter to a half longer" was measured with a test harness that worked
  the whole hint list out every quarter second while it waited; as the server runs it, it is 2 s of a big round's 41.)
- **No more "from his seat in the vehicle"**: v254 measured a kill by a man with no soldier from a manned vehicle on the
  bullet's line - wrong both times it was used. Those men have soldiers in the demo after all, records it never showed a
  spawn for (alive in its opening snapshot, or a spawn message not read); found by the men's own acts (their throws made
  where they stood, their kills along whose bullet they stood) they stood 2-3 m from the victim, not in the UH-60 or the
  Vodnik 25 m back. Such a kill is not measured (49 demos: 5 kills of 2 men).
- **Looked at, nothing to change**: medals (the demo's levels are 0, most need a whole career's numbers); the game's fall
  damage (on one map dozens of honest men land at 12-20 m/s unhurt - no "No fall damage" hint); bullets' reach and their
  loss of damage with distance (in v221's reach already; only pistols and shotguns lose damage - No spread has them);
  the spread of a gun (it grows with the keys pressed and the mouse moved, which the demo doesn't have); Spawn (v247's
  test - a squad's leader made a man 200+ m away: found as in v247; on a round where the men came in by a spawn point
  too, rightly not).

## v254

**The list after v253** (Sagara: "Давай всі пункти"). The decoder changes (grappling ropes): the server
decodes every round again by itself; the round summaries become version 19 (the squad leader) and the hint rules
version 17. All of it in [docs/admin-hints.md](docs/admin-hints.md) and admin-hints.md.

- **One squad-leader rule for the whole site** — the player's card, the scoreboard, the squads on the map, Flag choices
  and the Spawn hint: of the men of his side the demo names leader of a squad, the one made leader **last**. A leader
  who left or lost the post keeps his flag in the demo for a while (orther1s led squad 2 from the round's start,
  MicrosoftExcel took it over at 3:13, both "leader" to the end). The test demos: no squad with two leaders any more; no
  Spawn hint more or less.
- **A kill from a vehicle's seat is measured from the vehicle.** The demo keeps no soldier for a gunner or a passenger,
  so such a kill was measured from his last place on foot (or the map's middle): now from a manned vehicle on the
  bullet's own line ("from his seat in Vodnik 4, 25 m"; a guess of where he was, so never a record); with none, not
  measured at all. A killer who died a moment before (traded shots, his grenade after him): from where he last stood,
  as before. The 49 test demos (7,849 kills): 2 from a seat, 3 not measured — two players. Two *Beyond fog* hints of the test demos were such kills; the map draws no kill line from a man
  the demo hasn't there.
- **The "2, 1 … 2, 1" magazine counts** (TapakaH's L96A1 in v253): in 6 of the 49 test demos, ~50 small rises each, a man
  standing still, not scoped, firing at nobody, every ~7 s. Nothing in the game's files we know of explains them; since
  v253 they are no reload, so they can no longer make *Endless ammo*.
- **Ready for contact** (new, in shadow): the crosshair already on an enemy as he steps out of cover — hidden 1.5 s or
  more, within 70° of his view, 8–150 m, not spotted, not firing; within 5° is "ready". Honest players: 25% of such
  moments (they hold corners too); the hint at 6 or more and chance < 1 in 10,000 against the round's others. The 49 test
  demos: two hints (rambow2 14 of 21 against 13%, MicrosoftExcel 20 of 37 against 23%). A made-up wallhacker aiming at
  whoever comes out next: 41 of 55. The background analysis: a quarter to a half longer
  (the 49 test demos +45%, the biggest round +27%).
- **Recoil script** (new, in shadow): a burst of an automatic weapon (1 s or more, 8 or more rounds) during which his
  view's pitch didn't move — 0.03° a 0.1 s record or less; the hand's bursts in 44 demos (152) never under 0.05°. The
  hint at 3 such bursts in a round. The test demos: none; a made-up one: 6 of 6.
- **Hints in shadow** and **what the marks say**: the thresholds editor has a *shadow* tick by each hint (the owner's,
  or the right for the site's thresholds): such a hint is worked out and kept, shown only to them ("in shadow"), no
  alert, not on the players' cards nor in the score (`data/.admin/hint-shadow.json`, in the weekly copy). By each hint
  the editor shows how the admins marked its hints (⚑ ✗ ✓) over the servers you may see. The admin page's card lists
  the hints in shadow.
- **No line of sight with the server's latency compensation** (OpenBF2's, as knowledge): the server hits the victim
  where the killer's screen had him — half the killer's ping and 0.1 s before (`LAGC_WIN`, at most 0.3 s); the lines go
  to him there. The 49 test demos (7,761 kills): 12 kills unseen without it, 11 with it — one *Through thin walls* kill
  of Vo1k[rus] was in sight from the killer's screen.
- **Grappling ropes** (OpenBF2's GrapplingHook events, as knowledge): the decoder keeps the hook thrown, each man taking
  the rope and getting off it; the map draws them (Show ▾ → *Grappling ropes*): from where it was thrown at to where the
  last man got off, with how far up. A Mass Destruction round: 19 ropes, 24 climbs. *Floating*, *Through walls* and
  *Teleport* leave a man on a rope out. (Medals: the demo's medal levels are always 0 — nothing to show.)

The thresholds: 184 of 59 hints (12 new: `LAGC_WIN`, `CT_*`, `AR_*`). The test demos: 49 (the 43 and six of the archive's
rounds); every hint as v253 but those named here.

## v253

**The new hints checked on the archive of v251 (3,449 rounds) and on five of its rounds' demos** (Sagara: "перевірити на
тисячах раундів нові підказки"). The hint rules become version 16: the background analysis goes over every round again by
itself. All of it in [docs/admin-hints.md](docs/admin-hints.md) and admin-hints.md → the archive of v251.

- **Spawn** (1,984 hints in the archive, 1,863 of them so): the demo can name two men of his side as his squad's leader
  at once (one who left, or the leader of another squad of that number); v247 took the last of them — mostly a dead or a
  far one. Now the nearest living one; with none alive the team mates' rule (the game's squad spawn point goes with its
  leader). Five demos: all 278 spawns away from the flags within 12 m of a living leader — 34 hints by v252, none now.
- **No recoil** (1,021 strong hints, 501 on SiC's Karkand Infantry Only): 324 of the 356 flat shots in the demos came
  less than 0.5 s after his last press — an SVD / Type 88 fired as fast as he clicks, a bolt-action pressed again while it
  cycles: his view still coming down from the last kick. Now only shots 0.5 s or more after his last press
  (`NOREC_GAP`): 1.8% flat there, 1.9% in the 43 demos, no hint left.
- **Endless ammo** (124 strong hints): each kit he had in a life on its own (a kit picked up from the dead brings its own
  magazines — a sniper who went on as a medic, then an assault); a reload only where the count went up to 60% of the most
  the gun held (`INF_FULL`; TapakaH's L96A1 went 2, 1 … 2, 1 every 7 s: 28 "magazines"); no press with a launch of his in
  it or at a manned emplacement (a man at a TOW the demo keeps on foot with his rifle: 1 in the count, the trigger held
  2–4 s as he guides it).
- **Shot from elsewhere** (19 hints): 15 were kills by a man the demo had not alive then — his place the map's middle, a
  shotgun's victim "1 km away": he fired from a vehicle's seat and the demo kept no soldier for him. Now only a killer
  alive there, not in a vehicle in the second before, and a victim not in a vehicle.
- **Outside the map** (12 strong hints): each life in a stretch on its own (two were men killed outside and revived — the
  round's health bears the game's rule out: 20 a second from 10 s, 80 from 20 s), and no hint when the game's damage took
  him down at last.
- **Glitch spot** (98 hints, 63 places): a soldier's stays within 25 m of each other in a round are one hint (the time
  is all of them, how many times, till when).

**Flag choices on the real data**: the placebo stays clean (0 flagged in 20 shuffles, spread 0.98); the archive has no
list of trusted players, so a stand-in — 593 ranked players with no hint at all: none at q < 0.05, 10 beyond 2 (13 by
chance), +0.03 in the middle. Nothing changed in choices.mjs.

## v252

**Flag choices: "known" is what his side knew when he set off** (Sagara sent the analysis archive of v251, 2026-10-28):

- **The rule for which enemies near a flag his side knew of** is now what it knew **when he set off**: seen by any of
  them in the 10 s before, spotted or in its UAV ring then, one who killed a man of his side in the minute before, one
  heard firing near them in the 10 s before. Up to v251 it also took what came after — sightings to 5 s after, and what
  he saw himself, spotted or had in the UAV ring until he got there. But he sees the enemies at the flag he goes to as
  he gets there: they turned "known" at his flag and stayed "hidden" at the others, and every player looked lucky. On
  the 3,449 rounds: by the new rule the honest crowd shows no lean (−0.01 a choice, was 0.25) and next to no spread
  between players (0.001, was 0.03); a radar put into 30% of a player's choices is found in 19% (was 4%), in 50% of them
  in 42% (was 10%); the placebo stays clean; 1,172 players ranked (was 737), twice the telling choices; nobody at
  q < 0.05. The crowd does not go by older sightings either (an enemy seen 10–60 s before is gone for no less than one
  nobody saw), so 10 s is enough. All of it in admin-hints.md → Flag choices.
- **Trips set off in a round's first 15 s are left out**: who is where then is the map's spawns (everyone keeps away
  from the enemy's spawn flags — the crowd's lean 0.08 a telling choice there, none after), and a regular who is there
  at every round's start would look lucky for it (`--start S` to change it).
- **choices.mjs works the counts out over E itself** (what the analysis keeps of each enemy since v251), by that rule —
  rounds analysed before v251 are left out (the background analysis did them again with v251). No new analysis is
  needed. `--known v251` (or `BF2R_CHOICES_KNOWN="v251"`) gives the old rule back; new keys `ownTo`, `ownGap` (his own
  sightings only up to some seconds after he set off, or not in the last seconds before he got there).
- **A player's card**: a hidden enemy he saw himself on the way is marked *seen by him on the way* (if he turned away
  from him, that is no luck).
- **The background analysis**: a round decoded while a run went on failed with "open: not in the list" (the page kept
  the list it was opened with) and was not tried again until the next version of the site — now a new page is opened
  for it at once, and such a failure is tried again after an hour.

## v251

**Flag choices: tuned on the server's 3 432 rounds** (Sagara sent the analysis archive of 2026-10-28; "давай"):

- **His taste in flags.** The model now learns, for each player, how much more (or less) than everyone he goes for each
  flag of a map and side — only from his choices where every flag had as many hidden enemies (a radar shows nothing
  there), so a cheater's pull to the empty flags is not taken for taste. On the archive the only player flagged on his
  server (Wake Island, beyond 3.67, q 0.009) was a liking for South Base, where enemies hardly ever are: 1.48 with his
  taste. Peeking put into 30% of telling choices is found a little more often (17% against 15%), the placebo is as clean.
  Learnt from all his choices instead, the taste ate the peeking (12%), so not that.
- **His flags on his card**: the flags he went for most unlike everyone — how often he went / was on offer, how often
  everyone's odds would have him go, how many hidden enemies are there as a rule, his taste.
- **What his side could know of each enemy is kept** (the analysis's table C, version 4: `E` for every enemy within a
  flag's zone + 60 m — when his side last saw him, when it saw him next, when he himself saw him on the way, spots, the
  UAV ring, killed one of his side, fired within 150 / 300 m of his side). The counts are the page's rule over it, as
  before (the same on our demos, row by row). `choices.mjs --known seen=10,hear=0,...` works the counts out again by
  another rule — with `--check` to see whether it finds more — and `BF2R_CHOICES_KNOWN` in /etc/bf2replay.conf makes
  the background run use it (§20, Flag choices). **The background analysis goes over every round once more** for it (the hint rules
  are the same: no new hints; a round takes ~10% longer).
- The daily check is worked out again at once when the model or the rule for "known" changed (right after this update
  too), not kept for a day from the one before.
- The **Placebo** tile turns red only when the shuffles flag someone more often than chance (1 shuffle in 20 does; 3 of
  10 is too many). The admin page's Background analysis card counts a round whose analysis version the index does not
  know as not done yet.
- Tried on the archive and left out (admin-hints.md → Flag choices): only the enemies on the flag itself (fewer
  players, less found), heard enemies counted as hidden (worse: players do go by sound), hidden enemies against the
  flag's usual number (worse, and a noisier placebo), only the trips that got there (nobody at q < 0.05).

## v250

**Flag choices: a page for admins** (Sagara: "let's make it a special page only admins can open", 2026-10-28):

- **Flag choices** (`#achoices=1`) — a page of the site for the admins (the Admin tab, as Review): the players ranked by
  *beyond* with tiles (ranked, worth a look at q < 0.05, the daily placebo and the trusted players — red when they are
  not 0); a plot of each ranked player's reading of the game (the known enemies he avoided) against beyond, with the
  line where q < 0.05 starts, trusted players as rings, a tap opening his choices; the table (rounds, telling choices,
  emptiest, avoided, z hid, z kn, beyond, lost, q, ★ trusted; filter by nick, only q < 0.05, also those not ranked yet);
  a player's card: what his numbers say and his most telling choices — each flag he could have gone for with its
  distance, hidden enemies on it and on the way in, known ones, his odds — with a link that opens the round 3 s
  before he set off, following him; the daily check. Opened from the admins' pane (**Flag choices**), a player's page
  (**Flag choices**), the Statistics page's tile and the admin page's Background analysis card.
- **Each server on its own**: choices.mjs works out every server with 100+ choices with its own model and its own
  spread of everyone's too. The owner sees *All servers* and each server; **a server's admin sees only his servers**,
  each on its own (`/admin/api/choices`; the raw `choices.json` is the owner's only).
- **The check once a day** in the background (placebo, split halves, peeking put in, killed on the way) — and now **the
  trusted players** (Review's ★) as a reference: hardly any of them should stand out. `choices.mjs --check` shows it too.
- **Work it out again** on the page (the owner, or an account with the card Background analysis): `analyze.mjs
  --choices` in the background.

## v249

**Flag choices: who is lucky at flags, over all his rounds** (2026-10-28, admins):

- **The background analysis keeps every flag choice** (its table C, version 3): each trip a soldier made to a flag his
  side did not hold — from his spawn, revive or the flag he left, on foot or driving (not in an aircraft), to a zone he
  stayed in 4 s or died in, or killed on the way (toward the flag he had come nearest to or was heading for: without
  them the unlucky trips would be missing) — with the flags he could have gone for (every flag his side did not hold out
  to 2 × the nearest, picked without looking at his choice) and, for each, what his side could know (distance, owner,
  the flag's height and its move, team mates there, his squad's order, and the enemies known to them: seen by his side
  around the moment he set off, seen by him or spotted or in the UAV ring on the way, who killed one of them in the
  minute before, or heard firing) and what nobody on his side knew (the other enemies there, and 20–60 m out). A squad
  member who followed his leader there is marked (the leader chose); trips killed on the way whose flag can't be told
  are kept per player. About 110 choices in a Karkand round, 1–3 s of work.
- **`server/choices.mjs`** compares the players: a model learnt from everyone's choices gives each choice its own odds
  by what he could know, fitted again to each player's own way of choosing (a back-capper meets fewer enemies of every
  kind: his way, not luck); for each player, how unlikely so few hidden enemies are (exactly), against a spread of
  everyone's that widens with how much he has played (*z hid*), the same for the known ones (*z kn*: his reading of the
  game), the first less what the second foretells (*beyond*, the ranking), and the false-discovery q over all ranked
  players; `--nick` lists his most telling choices with links to the moment; `--check` (placebo, split halves, peeking
  put into real players' choices, killed-on-the-way against the ranking) and `--selftest` (a made-up archive) say how
  far to trust it. On 12 made-up archives: 2 of 1,553 honest players at q < 0.05 (of 42 flagged); a player following a
  radar found in 18 of 23 with 60–149 telling choices (about one a round)
  ([admin-hints.md](docs/admin-hints.md#flag-choices--over-all-of-a-players-rounds-v249)).
- The background run makes `data/.admin/choices.json` (at most once an hour; `analyze.mjs --choices` at once) and goes
  over the rounds analysed before by itself — after the new ones, without changing the hint rules: the players'
  hint cards stay meanwhile; the admin page's Background analysis counts them as not done yet. Copies of other rounds
  are left out, as in the hints. Nothing decoded or summed up again.

## v248

**The background analysis: each round ~5x faster, several at once, no breaks** (Sagara: "Background analysis — can it be
made faster, or in more threads?"; the VPS: 16 cores, 31 GB) (2026-10-28):

- **Each round ~5x faster, the same results.** While the page waited for Wall tracking and the scan of the shapes it
  worked the whole list of hints out again every 400 ms — on a big round that list takes seconds, on the same thread, so
  ~90% of a round's time went into it (a Karkand round of 58 men: 17 times, 72 of its 80 s). Now it is worked out once,
  when everything it waits for is in; the two scans start as soon as the map's files are in, and in the server's page
  they run without the pauses kept for an admin who has the round open. 16 real rounds of the site, one at a time: 512 s
  with v246, 90 s now (Karkand 95 → 11 s, Dragon Valley 57 → 7 s, Wake 6 → 2 s); on top of v247 again, on a slower
  machine: 1281 → 208 s (6.2x). Every number in the files the same (only `_ff`, the admin tab's own note of the nearest
  flag, no longer slips into some hints).
- **Several rounds at once, in the background too** — the Background analysis card has **Rounds at once**: automatic
  (the cores less two, the memory at ~1.5 GB a page, at most 12 — 12 on this VPS) or 1–16, with a table of how fast each
  number went here (*Rounds a min*, *Each took*; the fastest in green), as *Demos at once* for the decoding. A change
  takes effect within seconds, also during a run. `BF2R_ANALYZE_JOBS` in `/etc/bf2replay.conf` wins; `analyze.sh start`
  takes the same number unless `--jobs`. Before: the background 1 at once, *All rounds now* up to 3.
- **No 5 minutes between batches**: a run goes through every round that needs it — batches of 40 a page, the players'
  hint cards written after each, rounds decoded meanwhile first — for up to 95 minutes; the next run starts 5 minutes
  after it ends. The card's bar moves during a run. *All rounds now* / *Back to 40 a run* are gone: every run does that
  now. A run that sees the site updated takes no more rounds (the next one is the new code).
- Together: a full pass over a few thousand rounds after a change of the hint rules — about an hour or two instead of
  1–2 days.
- On the server: nothing to do — the update brings the new `analyze.mjs` and unit; the decoder (`18e8999d15`), the round
  summaries (18) and the hint rules (15) are as in v247, so nothing is decoded or analysed again. If v247's pass over
  every round (its new hint rules) is still going, it goes on with the new code after this update — several at once,
  without the breaks: a good moment to try a few numbers on the card (§20, "Faster, several at once").

## v247

**The engine's own rules for the score, the time outside the combat area and the spawns** (Sagara: "another pass over
OpenBF2 — scoring, tickets, spawn rules, the combat area; check ours against how the engine counts and fix what
differs"; the engine's code read for knowledge only, then checked on 43 demos):

- **Outside the map** — now by the game's own rule: it counts a man's seconds outside the combat area while he is
  alive (a man down too); after the map's allowed time (10 s on every map) it takes **20** health a second off the man
  himself — in a vehicle too — and four times that after 20 s (Highway Tampa: 5), so a man with full health is dead at
  **15 s**. The hint: alive **on his feet** outside longer than that, plus what he was healed, plus 10 s — no damage
  came off him. A man down is no longer counted as alive (before: 8 s up and 13 s down made 21 s, close to the old
  25 s). Now **strong** (before: minor). In 43 demos: every man on his feet back by 10 s, pilots dead at 14–17 s.
- **The map's OUT ring** counts down the seconds he has left (10 → 1), as the game does — it used to count up while
  its tooltip said "left" — then shows the health the game takes off him a second (−20/s, −80/s after 20 s); over the
  ring for the soldier you follow, where the weapon plate no longer hides it.
- **Spawn** — the game's squad spawn rides on the squad leader, is offered only to the squad's other men, and scatters
  them **3–9 m** round him (654 of 663 squad spawns on foot within 9 m): away from his side's spawn points only **his
  own squad leader within 12 m** explains a spawn now, not any team mate within 25 m (rounds without squads: as before).
  New threshold *SPAWN_SQ* (12 m) — 170 thresholds of 57 hints.
- **The score** — the game's is **2 a kill + teamwork** (+ a commander's points): exactly so for 418 of 438 players,
  16 of the other 20 commanders. A soldier's card now breaks his teamwork down by the game's rules — assists +1,
  revives +2, heal and repair points, flags +2 / +1, team kills −4, suicides −2 — and the **rest** the demo doesn't
  show (ammo given, defending a flag, spotting), and a commander's points.
- **Heal and repair points as the game pays them**: +1 each time what he healed of his team mates (in % of their
  health, all his heals summed) or repaired of their vehicles passes 100 more — not +1 a heal of 25+ or +1 a repair.
  Against the teamwork the game gave during heals and repairs in 43 demos: 33 points off instead of 59 (heals), 60
  instead of 347 (repairs). In the card and the ≈ Score of rounds without the game's scoreboard.
- **Tickets and spawn times** already matched the engine: the bleed (fractional, whole tickets as they add up) since
  v235, the spawn time from the demo's own "may spawn at" since v170 (the game spawns at most 0.1 s after it, never
  before).
- The hint rules become version **15**: the background analysis goes over every round again by itself. The decoder
  (`18e8999d15`), the round summaries (18) and the statistics are as in v246: nothing decoded or summed up again.

## v246

**Sagara's five: the page that jumped, the rights' ticks, the weapon plate, squad colours, the records** (2026-10-28):

- **The round page no longer jumps** (Chrome, Edge: "as if someone zooms in and out"). The map's width and the bar under
  it hung on each other the wrong way round: a map under 470 px stretches the bar's buttons into fewer rows, which left
  room for a wider map, whose bar then wrapped into more rows again — every frame (a window ~900–1010 px wide and 900 px
  high: the map 465 ↔ 515 px). A lower bar it had a moment ago is no longer taken back for the same window size. Checked:
  windows 860–2000 px wide (every 57 px) × 700–1200 high, at 100%, 125% and 150% screen scale, on the round page, in
  Review and with Bigger map, and phones and tablets - nothing keeps resizing or redrawing any more.
- **Admin page, accounts' rights** — **each tick is saved at once** (no *Save his rights* button to forget; "saved" by
  the line under his name). A part of the site open to **guests** is open to every account too, so its tick there could
  change nothing — now shown ticked and grey ("guests too"), with a line while the whole site is open; the account's own
  tick is kept and counts once that part is closed to guests. His row says **admin powers out** when he is logged in but
  his 12 h of admin powers (the Admin tab, the admin page's cards) ran out.
- **Weapon in his hands** — the plate under the soldier you follow: also in **Camera ▾** (beside Aim line) and on the
  key **W** (Show ▾ → The soldier you follow had it as *In his hands*).
- **Squad colours** — Show ▾ → Soldiers → **Colour: Side / Squad**: each side's squads 1–5 in a colour of their own (warm
  ones for the red side, cool ones for the blue — every pair told apart by colour-blind eyes too), the squad's number on
  a small disc by each man; the commander, men in no squad and squads 6–9 keep the side's colour, and every name stays in
  its side's colour. The legend shows both sides' five, the Players list a dot by the squad's number.
- **Records**: one player no longer takes two places of the same record (1st and 3rd with two rounds) — the three are
  three different players, each with his best round — on the Records pages and the maps' pages (Records on this map).
- On the server: the statistics' code changed, so the statistics and the Records pages are written again by themselves
  after the update (some minutes on a big site; the Records pages at once, not the next day). The decoder
  (`18e8999d15`), the round summaries (18) and the hint rules (14) are as in v245: nothing decoded or analysed again.

## v245

**The killing bullet's direction, the commander's UAV, two new hacks found, the game video's kill feed** (Sagara: "let's
do these points" — the list of what could be done without him, todo 295):

- **Shot from elsewhere** — a new hint (60): twice or more in a round a small-arms kill on foot from 15 m or more whose
  killing bullet came 20° or more off the line from the killer (3 m or more to the side at his distance), and not from
  where his screen had the two of them a moment before. The direction is the game's own record of the last hit (kept by
  the decoder since v235; the Side view card says it, the map draws it yellow and dashed when it is off). In 43 demos:
  645 such kills, 0.4° off in the middle, 5.1° at the 99th percentile, never two of one soldier. **Strong** from 3.
  Missiles, AA guns and kills from aircraft are no longer measured that way (their hit comes from the missile, not the
  man): no dashed line for them.
- **The commander's UAV** — while it is up (30 s) every enemy within **100 m** of the place it circles is on that whole
  side's minimap (the game's settings; the drone itself flies a 59 m circle round it — its start event is 59 m east of
  the middle, exact on 253 UAVs). The map draws the ring (dashed, the side's colour) with the UAV (Show ▾, Teamwork); **His view**
  counts the enemies in it as known; **Wall tracking**, **Fired at a wall**, **Pre-aim** and **Wide view** leave out an
  enemy his side had spotted (5 s) or had in its UAV ring — fewer false hints. About 1 enemy in 5 was in a ring while a
  UAV was up.
- **No recoil** — a new hint (61): the game's recoil of each sniper rifle (its files: 4–6° up, × 0.25 through the scope)
  against his view in the demo — honest scoped shots rise 1.39° in the middle, 2.5% less than a tenth of the kick; the
  hint from 8 scoped shots with chance < 1 in 10,000. (Automatic weapons' bursts were measured too: a steady hand holds
  them flat, so they tell nothing.)
- **Endless ammo** — a new hint (62, **strong**): in one life with one gun, 8 or more long presses that took no bullet
  from the magazine (by hand 3 at most in 1,271 lives × guns), or more magazines changed than 1.5 × those he carries
  (the game's count for the weapon, 5 for most; one more lot for each ammo bag, crate or support near him).
- **Game video**: **Kill feed & clock** over every view (the kills at the top right as the game shows them, his own
  yellow; the time left and both sides' tickets at the top); **Slow at the kill** (2 s before to 0.7 s after at a quarter
  of the speed); **All views in one** — one more MP4, `…_all.mp4`, the views in a 2 × 2 grid, each named. Checked with
  ffmpeg 6.1 on test films; the game's own rendering needs a PC with the game.
- **The archive's false places** (todo 227): Kill farming on Dragon Valley (150, −660) and Through walls on Wake
  (−690, 680) were already gone since v214 (farming from aircraft left out; the carrier's deck) — checked again.
- **What the game's files and OpenBF2 told us** (knowledge only, no code taken): the soldiers' speeds and jump were
  already in Speed, Floating, Bunny hop and Stamina (v233, v235); now the weapons' recoil, magazines, muzzle velocity
  and the UAV's rules (radius, 30 s, the circle) — in the hints above.
- The hint rules become version **14**: the background analysis goes over every round again by itself. The decoder
  (`18e8999d15`) and the round summaries (18) are as in v244: nothing decoded or summed up again, nothing to do. 169
  thresholds of 57 hints, 63 kinds.

## v244

**Asking the statistics: a constructor for admins** (Sagara: the admin picks the person, the parameter, how to judge it
and what he needs — and over which days):

- **A page of its own** (`#astats=1&qn=<nick>&…`): **Player** (suggested as you type) · **Of him**: his kills, the kills
  of him, his rounds, his presses of the trigger · **Weapon** (one; everyone else is then on the same weapon) ·
  **Parameter** (24 of a kill, 13 of a round, 6 of the presses — distance, where the shot hit, reaction, who saw whom
  first, the aim off the victim, no clear sight, fog, speeds, stances, ping, K/D, headshot share, kills per minute,
  bullets per press …) · **Judge it by**: how many, per round, the share that …, the average, the median, 10th / 90th
  percentile, min, max, sum · **From / To** (7 / 30 / 90 days, All) · **Server**, **Map** · **Only where…** (up to 4
  conditions) · the least kills (rounds) to be ranked · the list highest or lowest first.
- **The answer**: him, everyone else, his place among the players with enough (and above what share of them), for a
  share the odds of his count at everyone else's (*once in N*), the spread of his values against everyone's, week by
  week, the top 10 (a name: the same question about him) and his events — a row opens the round **in Review at that
  moment, following him**. Every question is a link (**Copy link**).
- **Opened from** a player's page (**Ask about him…**), the Review panel under a hint (**Ask about him →**, with the
  hint's weapon), the admins' pane head (**Ask the statistics**), the Statistics page's **Ask** tile.
- **The admin server answers it** (`server/statq.mjs`): the background analysis's files (`analysis/rounds/`) read into
  columns at the first question — some seconds, in a worker thread (the server keeps answering); ~90 bytes a kill
  (~80 MB for 900 000 kills); new and rewritten files added as the analysis writes them; let go after 30 minutes
  unused. Endpoints `statq-meta`, `statq-nicks`, `statq` (POST), for accounts with the Admin tab; a server's admin sees
  only his servers' rounds and players. Bots are left out.
- The admin page's unit: `MALLOC_MMAP_THRESHOLD_=131072` (big blocks of memory given back to the system when let go).
- Nothing else to do: the decoder (`18e8999d15`), the round summaries (18) and the hint rules (13) are as in v243.

## v243

**The admins' own page for a round: Review** (Sagara's two pages — the players' page was v242; the mock-up "BF2 Round
Replay — new pages"):

- **Review ↗** in the header, for an admin logged in (on the site: an account with the Admin tab right; a demo opened
  on this computer: always): the round's own page for judging it. **Player view ↗** goes back at the same moment. In the
  link: `review=1` (old `tab=admin` links come here; the login window's button too).
- **On the left**, the admins' pane — Hints · Players · Kills · The round · Review, as the Admin tab had them; the
  hints' filters fold under **Filters ▾** (it says how many are on).
- **A hint clicked**: the map goes to its moment and plays it **again and again, 5 s before to 2 s after, at 1×** (your
  own speed comes back when you leave; a seek of yours stops the loop, *Play it again* restarts it); a kill's **side
  view** opens — **beside the map** on a wide screen, so map, side view and verdict are in sight at once.
- **The verdict** under it: **⚑ Suspicious**, **✗ A false alarm**, **✓ Checked: nothing there** — the marks the list's
  ✓ ✗ ⚑ set (the same button again clears it) — with **a note for the other admins** in a field instead of a prompt;
  **‹ Previous hint** / **Next hint ›** through the list as filtered; his page over all rounds.
- **The players' page has no admins' parts any more**: no Admin tab, no For admins tab beside the map — for admins
  too; guests never see Review.
- On a phone or a narrow window: one column, the list first; a hint picked scrolls to the map.
- Fixed on the way: the page on its own (not split for the site) failed to draw the admins' pane (`ADM_V`).
- Nothing to do on the server: the decoder (`18e8999d15`), the round summaries (18) and the hint rules (13) are as in
  v242; marks and notes are kept as before (`data/.admin/review/`).

## v242

**The round page for players: one bar under the map instead of twenty buttons over it** (Sagara: "my site is overloaded
with buttons and not very logical to use" — the mock-up "BF2 Round Replay — new pages", two pages: this one for
everyone, the admins' own next):

- **Under the map, one bar** (over it in full screen): **Play**, the round time and its slider, the speed, **Camera ▾**,
  **Show ▾** and **⛶** full screen. On a narrow map the time gets a row of its own over the buttons.
- **Camera ▾**: **Follow** (a list of the soldiers, by side — or click one on the map), **His view** (`V`), **Aim
  line** (`X`), **Keep him in the middle** (`K`, was Lock camera), the seat's 1st / 3rd person (`C`), **The fight**
  (was Fit action), **Whole map**, **Bigger map**, the zoom slider, **The game's scoreboard** (or hold `Tab`).
- **Show ▾** (`L`) is the old Map ▾ — the button says which preset is on; **your quick switches** (the pins: Icons /
  Models, Buildings, Relief, Names, Next 20 s at first) are at its top instead of on the map.
- **On the map** only **+ / −** (bottom right) and the legend — now folded until you open it.
- **Share ▾** in the round bar: **Copy a link to this moment**, **Make a video clip…**, **Download the demo**, **the
  map's page** (were Copy link on the map, Clip under it, Map page and ⬇ Demo in the bar).
- **Beside the map**, on its right now: **Kill feed · Highlights · Players** — the scoreboard became the third tab;
  the killer / victim / weapon filter opens from **Filter ▾** ("Filter: on" while one is).
- Gone: the second Play and Map ▾ under the map (the bar has them), **Controls left** (one bar, under the map), the
  ADMIN tab for guests (on the site only for its admins; For admins and Admin as before for them — their own page is
  the next version), **Tools ▾** except on the Rounds page. On a phone the header's links are behind **☰**.
- 1440×900: 56 buttons and fields on the first screen before, 29 now. Every function is still there; the keys are as
  before. Nothing to do on the server: the decoder (`18e8999d15`), the round summaries (18) and the hint rules (13) are
  as in v241.

## v241

**A man lying down: his head where it is - higher and ahead of his position; going down or getting up, both
stances** (Sagara, after v240: "maybe the problem is that you can't tell which roofs and buildings they are on"):

- First the check he asked for, on Karkand 19.10 21:06: the positions and the map's shapes agree - 98.3% of on-foot
  moments have the feet within 0.15 m of the surface under them (the rest: jumps), half of them on objects, 10.5% under
  a roof; ILuminator stood on the roof of house detached 03 and on a stone wall, his victims lay on the roof of house
  double 02. What was off was the man lying down himself: every sight line took his head and chest straight over his
  position, 0.35 / 0.25 m over his feet, and his hips 0.2 m under them (in the ground).
- The shots that killed men lying down (987 small-arms kills with the hit's direction, 44 demos) say where he is: the
  head 0.34 m over his feet (median; p90 0.59) and 0.39 m ahead of his position along the way he faces, the body
  0.18 m high, 0.1 m ahead. Now: head 0.45 m high, 0.4 m ahead; chest 0.25 m, 0.1 m ahead; hips 0.2 m, 0.6 m back.
  Of 537 kills of men lying down whose shot had its way (16 demos, 9 maps) none of his 9 points was clear in 13
  before, 10 now - the best of five sets tried, and never worse in any demo. Crouching and standing stay (the shots
  agree with them).
- **Going down or getting up takes a moment**: the demo's stance turns at once, the body follows. In the first 0.2 /
  0.4 / 0.6 s after a man went from standing to lying, the shots that killed him passed 0.90 / 0.72 / 0.63 m over his
  feet (lying settled: 0.25); from crouching to standing 0.44 / 0.60 / 0.80 m (standing: 1.08) - 1398 kills, 4 demos.
  The 6 misses left in two Karkand demos were all such dives (down less than 0.35 s before). So for 0.6 s after a
  change of stance the points of both stances count; the Side view says so ("he was going down … the points of both
  count").
- Together, on 4 recent rounds (847 small-arms kills whose own shot had its way): kills where none of the victim's points
  was clear at the shot 9 -> 3 (men lying down 6 -> 1, men changing stance 4 -> 0); where the shot's line was blocked
  (29), as many with a point clear as before (22) - not more lenient where it shouldn't be.
- Every sight line takes it: who sees whom on the map, first sight, the Side view, No line of sight, Through a gap,
  Fired at a wall, Wide view and the other hints that ask whether he could be seen.
- **Side view**: the shot itself - the game's direction of the hit from the killer's eye - drawn as a yellow dashed
  line, so you see how high the bullet went over the victim; a man lying down is drawn with his head the way he faces.
- The hint rules become version 13 (the background analysis goes over every round again by itself); the decoder
  (`18e8999d15`) and the round summaries (18) are as in v240.

## v240

**No line of sight: no more hints for kills whose own shot had its way** (Sagara: false hints on Karkand 19.10 21:06 -
ILuminator's two SVD headshots, "house double 02" in the way):

- Both victims lay on a flat roof just behind its edge. The hint's 9 lines go from the killer's eye to the middle of the
  victim's head, chest and hips - for a man lying down 0.35 / 0.25 m over his feet - and all of them hit the roof's edge.
  The game's own direction of the hit (kept by the decoder since v235), drawn from the killer's eye, was clear all the way
  to him: the bullets went 0.57 and 0.48 m over his feet, over the edge. On 44 demos the shots that killed men lying down
  went 0.14 / 0.34 / 0.59 m over their feet (p10 / median / p90; 75 headshots), the head 0.4 m ahead of his position.
- So the hint now asks the kill's own shot first: its line from the killer's eye clear to the victim (passing within 1 m
  of his position, between his feet and 2.2 m over them) - no hint; clear but for things bullets go through - Through thin
  walls. A shot whose line doesn't reach the victim, or meets a wall on its way, still counts as before.
- The Side view card says so for such a kill ("the shot's own line … is clear").
- The hint rules become version 12 (the background analysis goes over every round again by itself); the decoder
  (`18e8999d15`) and the round summaries (18) are as in v239.

## v239

**What the map shows: every element, by group, kept in your profile** (Sagara: "another grouping, a way to set the
display of every element, and people keep their filters - signing up on the site, in their profile"):

- **Map ▾** (`L`; on the map and under it) replaces Filters ▾ and Names ▾: everything the map draws, in seven groups -
  Soldiers, Vehicles, Combat, Teamwork, The soldier you follow, The map, Screen - each element its own switch, **all /
  none** by each group. New switches for what was always drawn: the grid, flags, where one died, +1 / TK / HS, the shot
  direction, smoke, health bars (soldiers' and vehicles' apart), the wounded, kit icons, the sights' dot, parachute /
  ladder / water, out of bounds, empty vehicles, trees, the fog line, the eye and the behind-cover ring, the crosshair,
  what he holds, last seen, the UAV, supply crates, the commander's camera, the map's name, the top bar.
- **Pins**: a pin by any element (or group) puts it on the map as a button, in the order pinned (12 at most); a group's
  button turns it all off and back as it was. At first as before: Icons / Models, Buildings, Relief, Names (all the
  players' names, `T`), Next 20 s.
- **Presets**: Standard, Clean, Kill check, Everything, and your own (Save as… / Delete; 30 at most); a box by Map ▾ on
  the map switches them.
- **Kept**: in the browser always (all of it now - before, part of it reset at a reload); logged in, also in your
  profile on the site, the same on any computer.
- **Sign up** (Log in → Sign up, and on `/login`): a name and a password make an account that may open what guests may
  and keeps your map settings. From the Log in window: change your password, delete your own account. The site's owner
  closes sign-ups on the admin page (Users and access → Sign-up) and gives an account more in its row (tagged "signed
  up"). Limits: 3 new accounts an hour from an address, 30 in all, 5000 accounts.
- The admin server: `/admin/api/signup`, `/prefs`, `/my-password`, `/my-delete`; the settings in `data/.prefs/` (never
  served; in the weekly backup). The decoder (`18e8999d15`), the round summaries (18) and the hint rules (11) are as in
  v237.

## v238

**A Names button on the map** (Sagara: "a button on the map that turns the nicknames on and off"): next to Buildings and
Relief, and the `T` key. Off hides the players' names on the map - soldiers on foot, crew by their vehicles, the wounded,
who spotted; on brings back the ones that were on. The soldier you follow keeps his name, the kill feed keeps them all,
and **Names ▾** still sets each kind on its own (vehicles, flags, distances stay as set there). Remembered in the
browser. Only the page changed: the decoder (`18e8999d15`), the round summaries (18) and the hint rules (11) are as in
v237.

## v237

**Where the page's picture and the real data still differed - six places** (Sagara: "where else do our visuals and the
real data part ways?"):

- **Speed by stance** - a new admin hint (`stancespeed`, 59): 2 s or more crouching at 3 m/s or more, or lying at 1.6 m/s
  or more. The game moves a crouching man at 2.0 m/s at the most and a lying one at 0.8; v233 could set no limits by
  stance because the decoder lost the stance after a health change (fixed in v235). Measured on 43 demos with every
  thing that can carry a man left out (vehicles, another soldier carrying him, water, ladders, falls, blasts, spawns,
  slopes) and each second's speed taken so that one lagging step doesn't count: crouching 2.01 m/s at the 99.9th
  percentile, lying 0.82 - and never above 2.83 / 3.21, for 0.2 s at the most. No honest round in the 43 shows it.
- **A TOW or HJ-8 gunner looks through its sight**: 34 deg high (the launcher's own camera), not a man's 63 - in His view,
  who saw whom and the hints. (An attack helicopter's gunner switches between two cameras the demo doesn't record: his
  view stays a man's.)
- **A swimmer's eye at his swimming height** (the game's swimming pose, 0.3 m over his position), not the stance he had
  on land - sight lines, His view, the game video kit; the map draws him upright.
- **Names as the game shows them** in the game video kit's His eyes: an enemy's name only while he is under the
  crosshair (300 m at most, a clear line), a team mate's within 120 m (OpenBF2's name tags, read for knowledge). The new
  **Every name** option puts a name over everyone in the picture, as before.
- **His own screen's time**: the Side view card says how long the victim was on the killer's screen before the kill -
  the server's time less ~0.1 s and his ping (others reach a player's screen that late, his shot the server half his
  ping after); an estimate. The Reaction hint gives his ping too.
- **The shot's own direction** (the decoder keeps it since v235): the Side view card says whether the killing bullet
  came straight from him, to where the victim was a moment before (what his screen showed - a man running across the
  line), or from neither (lag, or not his shot); on the map a dashed line from the victim shows the way it came when it
  was 6 deg or more off the line from the killer and his screen doesn't explain it.
- The hint rules become version 11 (the background analysis goes over every round again by itself); the decoder
  (`18e8999d15`) and the round summaries (18) are as in v236.

## v236

**The field of view on the map follows the map's fog** (Sagara: "the view sector drawn by the fog of the map"):

- The followed soldier's field of view fades with distance as before and now also as the map's fog does (the same curve
  the sight lines use since v235): on Karkand it is clearly weaker by 50 m, and a dashed **fog line** across the sector
  marks 99.5 m, past which the fog leaves nothing of a man - beyond it only a faint tail (a man against the sky still
  shows). Maps with a light fog (Dalian, Kubra, Wake) look as before. Up to the fog line the shading stays readable.
- The map's legend has the fog line, and "Behind cover" says a man past it with no sky behind him is hidden too.
- Only the page changed: the decoder (`18e8999d15`), the round summaries and the hint rules (10) are as in v235.

## v235

**What OpenBattlefield2 and two other projects showed about the game, checked on our demos** (Sagara: "take from them
what we can"; OpenBattlefield2 - a new implementation of the engine, MIT - the Refractor 2 BitStream emulator and a
GameSpy emulator, read for knowledge only; 43 of our demos checked):

- **The decoder: a soldier's stance was lost when his health came in the same record.** The game sends the stance after
  the health; the decoder read it from the wrong place then - a spawn, or a man hit as he went down - and skipped or
  misread it (Karkand 21:14: ~700 of ~3900 stance records; 0.1-0.4% of the soldiers' time had the wrong stance, a man
  shown standing who was lying). Fixed. The decoder also keeps each kill's direction now (where the killing hit came
  from: within 0.5-5 deg of the killer for bullets) for later, and the game video kit packs at most 255 records in a
  packet (the game reads 256 or more as something else and would break the film). **New decoder `18e8999d15`: the server
  decodes every round that still has its demo again by itself** (`bf2replay-status` shows how far it is).
- **The fog as the game draws it.** Inside the view distance the map's fog hides a man sooner: on Karkand nothing of him
  is left past 99.5 m (drawn to 140), on Mashtuur past 155 m, Songhua 204, Jalalabad 207, Highway Tampa 305 - unless he
  stands against the sky (nothing behind him, ground or houses, up to the view distance). "He sees him", who saw whom
  first and every hint that asks whether he could see count such a man as hidden; Beyond fog also takes kills past that
  distance with no sky behind the victim.
- **Ticket bleed by the game's rule**: a side loses tickets while the other side's flags weigh 100 or more (each flag's
  weight from the level's files) and more than its own - 10 a minute for each 100 of difference. Checked on 42 demos in
  stretches where nobody of that side died (Daqing 50 against 100: 5.05 a minute, the rule 5.00). On Karkand the 8 flags
  weigh 104, on Wake the 6 weigh 100: a side bleeds there only while the other holds every flag. Round stats count the
  bleed this way, and a new row shows tickets taken all at once when a side has no flag and nobody alive (the game ends
  the round: Wake 14.10, 180 tickets in 0.8 s, counted as "Other" before). The flags' tooltips say why a side bleeds.
- **Fast flag** counts men as the game does: a man down doesn't count, and of a vehicle's crew only the first man.
- **Bunny hop**: 15 jumps in 15 s, not 20 - a jump on flat ground lasts ~0.9 s, so the game allows 16-17 there.
- **Stamina**: without vehicles the game drains the sprint half as fast, so the one-sprint rule (rounds without the
  stamina value) is 26 s on such servers.
- **Three new hints from the game's physics** (none of them in the 43 demos):
  - **Sideways sprint** - 2 s or more at sprint speed moving 60 deg or more off where he looks (the game sprints only
    forward; by hand 1.0 s at the most);
  - **Speed in the air** - twice, 4 m/s or more gained during a jump (the game adds at most 2 m/s in the air);
  - **Shot in a jump** - twice, a small-arms kill 0.15-0.55 s after he jumped (the game lets nobody fire for 0.7 s after a
    jump; by hand none in ~1700 kills).
- **Hint rules 10** (`HINTS_V`): the background analysis goes over every round again. On 11 test rounds the hints came out
  the same.
- The admins' hint pages explain what a player's own game had: the server sends each player the enemies near him and in
  his view direction (walls do not matter), the demo has everyone; others are seen ~100 ms late; a lagging man runs on
  for up to 1 s.

## v234

**The eye height, the field of view and where the sight lines start - checked by stance and in jumps** (Sagara: "is our
aim height, field of view and the sight ray's origin right - standing, lying, jumping, crouching?"; OpenBF2 read for
knowledge, the Kakarotto22 viewer - it has no eye or field-of-view model, only a direction arrow - and our demos):

- **The eye straight over his position again** (v233 put it 0.1 m in front): the game keeps only the height of the
  soldiers' `poseCameraPosition` and sets the other two parts back to 0, so the camera is 0.47 / −0.05 / −0.63 m over his
  position (which is 1 m over his feet) standing / crouching / lying, and rifles fire from it (`fireInCameraDof`, no
  start offset). Checked on 978 small-arms kills (5-80 m) of 17 rounds: with these heights the killer's aim passes the victim at
  the same height whatever the killer's stance, within ~0.15 m.
- **Jumps**: only a standing man jumps (6 m/s up); in the demos his position rises 1.37-1.43 m over the take-off, is at
  the top after ~0.45 s and lands after ~0.9 s (424 jumps, 2 rounds), and the standing eye goes with it - the demo's
  heights carry it already, nothing to change.
- **Through the sights**: the weapon's zoom factor is the view's height itself in radians (the game hands it to the
  player's field of view; 0 means the camera's own 1.1), not a share of 1.1 - every zoomed view is 10% narrower than
  before: the M4's iron sights 40° high and 66° across (were 44° / 72°), the L96A1's scope 11.5° (12.6°). This counts
  for the map's view, He sees him, who saw whom first, Reaction, Pre-aim and the kills' "didn't see his killer".
- **Wide screens**: the game widens the picture up to 16:9 only - a 21:9 screen shows about 92°, a 32:9 one 90° (not 111° /
  131° as written before). So the Wide view hint no longer says a 21:9 monitor explains it.
- **Game video**: BF2 plays a demo at (height / width) × `renderFieldOfView` up and down, so the kit's "95" was 53° high
  and 84° across, not the soldier's 95°. His eyes are now rendered at the game's own view (`renderFieldOfView` 112.05 at
  1280×720, through his sights the weapon's factor: the L96A1 20.37), so what goes over the film (names, crosshair) sits
  on the soldiers; behind / side / still stay as tested (95, 84° across), and their overlay now uses that.
- **Hint rules 9** (`HINTS_V`) and **summary version 18** (`SUM_V`): the background analysis goes over every round again,
  and every round is summed up again from its decoded file - nothing is decoded again (the decoder is as it was,
  `e3ddfc2d41`). The hints of two test rounds came out the same (23 and 13).

## v233

**Sight lines from where the game's camera is; the Speed hint checked against the game's own speeds** (Sagara, after
reading OpenBF2 for where a soldier looks and what the game counts as seen):

- **The eye 0.1 m in front of his position**: the game's soldier camera sits at the pose's `poseCameraPosition` — 0.47 /
  −0.05 / −0.63 m over his position standing / crouching / lying (as before) and, in every stance, 0.1 m ahead. Every
  sight line from a soldier on foot now starts there: He sees him and His view on the map, the aim line, the side view
  of a kill, and the hints that ask whether he could see (No line of sight, Through thin walls, Through a gap, Wall
  tracking, Pre-aim, Spots unseen…). On Strike at Karkand 21:14, 0.5% of ~98,000 soldier pairs within the fog limit
  change (as many become visible as hidden); the hints of the test rounds came out the same. The game video's eye camera
  stays exactly where it was tested.
- **Hint rules 8** (`HINTS_V`): the background analysis goes over every round again by itself.
- **Speed**: the game's own speeds (sprint 7.0, run 3.9, walk 1.5, crouch 2.0, crawl 0.8 m/s) match what the demos show
  (in 1-second stretches with one stance all through, 10 rounds: standing 6.93, crouching 1.98, lying 0.79 at the 99th
  percentile), so the hint stays as it was (8.7 m/s for 2 s). No limit by stance: the demo's stance lags behind dives to
  the ground (a man "lying" at 6.9 m/s for 3 s), and a man carried where the decoder doesn't seat him shows as crouching
  at the vehicle's speed.
- The decoder and the summaries are as they were (`e3ddfc2d41`, summary version 17): nothing is decoded or summed up again.

## v232

**Game video: names, health, the crosshair and the zoom of his sights over the films** (Sagara: in his eyes the
crosshair and the aim line; over the players in the picture their name, health and distance; zoom in when he looks
through his sights, and a sniper's black round scope — from the demo, which has when he aims):

- **New tick in the Clip bar: Names & crosshair** (on by default, remembered). The kit then holds an `.ass` file for each
  view, and `make-videos.bat` has ffmpeg burn it into the MP4:
  - **His eyes**: the crosshair in the middle, with how far it meets something (and whom); through his sights or scope
    the picture zoomed in — his eyes are rendered once more at that narrower view for each zoom of the clip (up to two),
    and ffmpeg puts that film in for those seconds; a scope (L96A1, M24, M95, SVD, QBU-88, the SUSAT) has the game's
    round sight, black round it, with its cross.
  - **Every view**: over the soldiers and manned vehicles in the picture within the fog limit (the 14 nearest) the
    name in the side's colour (his own yellow), the health and how far from him — faded where he couldn't see them
    (walls, hills, smoke, trees: the map's He sees him); a yellow ring round the one he aims at.
  - **Behind him, From the side, Still**: his aim line, as on the map, from his eye to where it meets something.
- **Behind him and From the side are now cameras the page makes** (free cameras, as His eyes and Still), placed as the
  game's were (7 m behind and 20° from above; 5 m to his right, 10°), so the drawing lands where it belongs; never under
  the ground; while he is dead they wait, and before he is alive they wait where he will be.
- An ffmpeg without libass makes the films plain (the .bat says so). The `.ass` files are deflated in the zip (a kit
  is now ~0.5 MB).
- Only the page changes; the decoder is the same (`e3ddfc2d41`).

## v231

**The players' score is back in the posts and summaries** (Sagara: in the day summary on Discord every score was 0, and
in the round post too — Best three and each side's five):

- **Fixed**: since v221 the round summaries had no score. A note added in v221 to the line before it ran on into the
  score's line and turned it into a comment, so every round summed up since — and v221 summed up every round again —
  had none: 0 in the round posts (Best three, the sides' best five), the day / week / month summaries (Top by score,
  Player of the period), the Records' Best score, the players' pages and the rounds list's "best".
- **Summary version 17**: after the update the server sums up every round again from its decoded round (`.bfr`, ~0.5 s
  a round — about half an hour for 3,600 rounds; nothing is decoded again), as for any summary version.
- **While that runs**: a new round's post compares its records only with rounds summed up as it is (else every new round
  would break the Best score record of rounds with no score yet); a day / week / month summary waits until its rounds are
  done (the log says so) and is then posted as usual. Posts already sent can't be changed.
- `SUM_V` now lives in `server/roundsidx.mjs` (digest.mjs reads it too).

## v230

**The aim line: a button on the map, and a clearer line** (Sagara: the aim line as a visible yellow line on the 2D map,
its button next to His view, usable once a soldier is picked):

- **New: the Aim line button on the map**, right after His view: on and off for the soldier or vehicle you follow (its
  guns), the same setting as `X`, the button in his card and Filters ▾ (remembered). With nobody followed it is dimmed,
  and a click says to pick a soldier first; while the line is on, the button is yellow, as the line.
- **The line is easier to see**: 3 px of yellow on a 6 px dark edge (was 1.8 on 4.2); the dashes into the sky are longer
  and less faded. The legend's sample matches.

Only the page changes; the decoder is the same as v229's (`e3ddfc2d41`): nothing is decoded or analysed again.

## v229

**Game video: Battlefield 2 films the moment itself** (Sagara: a clip from the game's own picture — his eyes, behind him
— made from the site):

- **New in the Clip bar: Game video (BF2 renders it)**, in place of the BF2 demo file. It makes a kit — a `.zip` of a
  few hundred KB — for the game on your PC: the round's demo, a camera for each view ticked, and `make-videos.bat`.
  Unpacked into the game's folder, the .bat has the game play the demo and film each view (1280×720, 30 frames a second;
  the game closes by itself at the end), and with ffmpeg (in PATH, the kit's folder or the game's) cuts each film to the
  clip and makes it an MP4. `watch-in-game.bat` plays it in the game with your own camera.
- **The views** (ticked in the Clip bar, remembered): **His eyes** (a camera at his eyes, a little in front of them so his
  head and shoulders stay out of the picture when he lies down or throws; in a vehicle, his seat's view), **Behind him**
  (7 m behind and above, turning with him), **From the side** (5 m), **Still** (one camera over the shooter and his
  target). Twice as far in a vehicle; while he is dead the camera waits where it was.
- **The demo is packed**: the game can't jump in a demo, so the round before the clip goes into a short stretch (about
  18 s for 20 minutes of round) — each object's newest state, the events merged into large blocks in the order the
  game needs — then the last 3 s before the clip and the clip as recorded. Game-tested at 2 and 20 minutes into a round:
  the vehicles and soldiers are where they were, nothing jumps after the packed part.
- **A game video button by each kill**: in the kill feed, in Highlights and in the admins' hints (the battle pane and the
  Admin tab). It sets the clip 8 s before the kill and 3 s after, following the killer.
- Shown only where the round's demo is at hand and the account may take demos and make clips. Made in the browser
  in seconds.
- **Nothing is decoded again**: the packer lives in the decoder's part of the page (it runs in its worker), so the
  decoder's hash changed (`e3ddfc2d41`), but every round comes out byte for byte the same (21 test rounds): the rounds
  are only marked as made by it. The rule is now in `server/decoders.mjs`, which the background analysis reads too —
  so it doesn't look at every round again either (before, a round marked so was analysed again).

## v228

**His view: a button on the map, and the empty vehicles** (Sagara: the button was hard to find; in one soldier's view
the empty vehicles were missing):

- **New: the His view button on the map**, next to Filters (an eye): on and off for the soldier or vehicle you follow
  (*Crew's view* for a vehicle), as `V` and the button in his card. Filled while on — it changes what the whole map
  shows; pressed with nobody followed, it waits (dashed) for the next soldier you click.
- **Empty vehicles in His view**: every vehicle nobody is in is shown — he could know of it and it hides nobody (a
  burning wreck only where he could see it, as it tells of a kill). Before, only an empty vehicle he had in sight
  showed, and seldom (below) — not even the BTR he stood by and repaired.
- **A vehicle seen by its hull**: an enemy vehicle counts as seen when its hull is in his sight — its middle, roof, nose
  or tail, with the map's walls, the exact shapes, other vehicles, trees and smoke in between. Before, the vehicle's own
  hull was mostly taken for a wall in the way, so a vehicle was seen mainly through someone in it (on Strike at Karkand, of
  empty vehicles in a soldier's field of view within 120 m: 15% seen before, 35% now — the rest behind houses and walls).

Only the page's His view changes: the hints and the background analysis are as they were (the hint rules stay 7).

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

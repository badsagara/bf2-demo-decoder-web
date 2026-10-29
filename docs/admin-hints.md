# Admin hints — what each one means and when it shows up (v260)

> **For admins only.** This file describes the hint rules and thresholds that are kept out of the public page. Don't
> share it with players. A copy of the project's `admin-hints-en.md`; back to [the docs](README.md) · [admin guide](admin-guide.md).

Hints point you to moments worth a closer look. **They are not proof.** Always watch the moment (and its side view ⟂) before you decide. Only logged-in admins see them.

## How to read them

**Strength** (shown next to each hint on a round's admins' page, Review — the Admin tab until v242):
- **minor**: server rules or plain information (team kills, claymores, AFK and so on).
- **hint**: worth a look.
- **strong**: something normal play can't do, or a result so far above everyone else that luck would give it less than once in 10,000.

**Small arms**: guns fired on foot (rifles, SMGs, pistols, shotguns, machine guns). The knife and the defibrillator don't count.

**"Chance"**: we compare the player with everyone else in the same round and ask how often pure luck would give such a result. "Chance < 1 in 1,000" means luck would do it less than once in a thousand tries.

**One step**: the demo records every player's position and view 10 times a second, so one step is 0.1 s.

**Marks (v198)**: after you look at a hint, mark it ✓ (checked, nothing there), ✗ (false alarm) or ⚑ (suspicious). Marked hints and their notes go into the report for the server's admins (Review).

**Checked on the archive (v213)**: the thresholds were checked on an archive of 2,779 rounds (2026-10-21). A few places on some maps make the game itself do what a hint looks for — the same spot, in many rounds, for many players. Hints there are switched off:
- where the game puts players after a "teleport" on Dragon Valley and Gulf of Oman;
- a stretch in the north of Dragon Valley where players run fast;
- two roads on Kubra Dam where the BTR-90 does 25 m/s;
- spawn points missing from the map layouts (Mashtuur City, Operation Clean Sweep, Dragon Valley).

**Where he looks (v225)**: the demo sends a soldier's view in two parts — the way his **body** faces and how far his **head** (and gun) is turned from it. Standing or lying, the mouse first turns only the head, up to 40° either way; past that, or walking, the body follows at 120°/s while the head turns back as much. Up to v224 the site took the body's way for the view: up to 40° off while a soldier stood or lay and looked round, and a quick look round barely showed. Now the view is the two added up. At the kill, the line to the victim against the killer's view (three rounds, 310 kills on foot, 8 m or more): **3.3° off in the middle before, 0.6–0.9° now**; 5° or less 59% → 88%. (The round logger records the body's way, so it now agrees less with the site's view — that is expected.) Every hint that asks where he looked changes with it: *Smooth aim* got a new threshold (0.5°, 4 kills — see 14), the rest kept theirs. On nine test rounds the hints stayed at 145: one *Wall tracking* more (5.2 s behind walls, the enemy turning 12.5°), one *Idle* less (he was looking round). Over the nine rounds the view-on-a-hidden-enemy runs grew by a quarter, and those long enough to be a hint went from 0 to 3 (two of them dropped by the exact shapes) — *Wall tracking* and *Fired at a wall* are the ones to watch after the server has gone over every round again (hint rules version 7; a round decoded again by a new decoder is looked at again too).

**The thresholds are settable (v227)**: every figure in this file is our **recommended** threshold. The site's owner (or an account with the right *Hint thresholds: the site's*) can change any of them, or turn a whole hint off, for the whole site — the background analysis, the players' hint cards and the alerts then use the site's set (every round is gone over again in the background). Each admin can also keep **his own** set over the site's, for the rounds he opens. The editor: the **Thresholds** button in a round's Admin tab, **Hint thresholds** in the Log in dialog, or `/#thresholds`. It lists 201 thresholds of 63 hints (and an on/off tick for each of the 69 hints) with their recommended value; "advanced" adds the game's own figures (weapon rates, distances) and the measured shares. A hint here that says "≥ 6" means "≥ 6 with the recommended thresholds".

**Field of view (v219)**: a soldier is taken to see what a **16:9 screen** shows: **95° across** (47.5° to each side of where he looks) and 63° up and down. Since the 1.5 patch the game widens the picture with the screen up to 16:9: 4:3 79°, 16:10 89°, 16:9 95°; a wider screen is not wider (v234: 21:9 about 92°, 32:9 90° — the game keeps them near 16:9's width; written here before as 111° / 131°); the demo doesn't record the player's screen. The view is the **exact frame** of the screen, not width and height taken apart: less is seen up and down at the edges, and when he looks down the ground near him is seen wider. **Through the sights the view is narrower**, by weapon (from the game files): pistols, shotguns, SMGs 74–78° across, most rifles and machine guns 58–66°; scopes are round, as high as the screen: L85A1 23°, SVD and QBU-88 17°, M24, L96A1, M95 11.5° (v234: the weapon's zoom factor is the view's height in radians — v219–v233 took it as a share of 1.1 rad, 10% wider), plus 10° to each side because the view in the demo is sometimes off. The narrower view counts for the people he could miss (a victim looking through a scope doesn't see a man coming from the side), not for the man he is shooting at. This changes Wide view (its band is now 50–70°), Reaction and Pre-aim, who saw whom first, "Didn't see his killer" in the statistics, and the view drawn on the map. On 26 test rounds the number of hints did not change (361); "didn't see his killer" went from 22.2% to 21.3%, ambushes from 288 to 274. The server goes over every round again by itself (hint rules version 5, round summaries version 15). (v216–v218: 90°; before v216: 79°.)

(v235) **The fog.** Inside the view distance the map's fog hides a man before the game stops drawing him. The game's formula (each level's Sky.con): from 35 m on Karkand only 40% of a man shows, and **past 99.5 m nothing** — though the game draws to 140 m. Elsewhere: Mashtuur 155 m (drawn to 200), Songhua 204 (250), Jalalabad 207 (270), Highway Tampa 305 (450); the open maps keep most of their range. The sky has no fog, so a man **against the sky** still shows as a dark shape. "He sees him", who saw whom first, and every hint that asks whether he could see now count a man past that distance as hidden, unless there is sky behind him (only the terrain is checked; a house behind him is not).

(v235) **What a player's own game had** (OpenBattlefield2, a new implementation of the engine). A player's game does not get every enemy: the server picks the ones near him and in the direction he looks; walls do not matter. The demo records everyone. The radius is not known, so a wallhack can still show only the enemies the server sent. A player sees others about 100 ms behind his own clock, moved on along their path (up to 1.2 s). When a player's packets stop, the server goes on with his last action for up to 1 s, then stops him: in the demo a lagging man runs on for a second and then stands (Lag switch).

**Hints in shadow (v254)**: a new detector starts **in shadow** — worked out and kept like the rest, but only the site's owner (and the accounts with the right for the site's thresholds) sees its hints, each one saying "in shadow"; no alert goes out for it and it is left out of the players' hint cards and the suspicion score. The **shadow** tick by each hint's name in the thresholds editor puts any hint in shadow or takes it out (`data/.admin/hint-shadow.json`). The editor also shows, by each hint, how the admins' marks went so far ("marked 12: ⚑2 ✗7 ✓3"). v254's *Ready for contact* (63) and *Recoil script* (64), v259's *Inside an object* (65), and v260's *Anti-Aim* (66), *Wide view 70-90°* (67) and *Enemy behind* (68), are in shadow until the archive and the marks bear them out.

**Lying down (v210–v213)**: when a soldier is prone, the demo seems to record where his body points, not where he looks. On 2,779 rounds the aim error at the kill is larger when prone: more than 45° off in 6.9% of rifle kills, against 2.9% standing. Treat aim hints for a prone shooter with care.

---

**The commander's UAV (v245)**: while it is up (30 s), every enemy within **100 m** of the place it circles is on that whole side's minimap — the server sends them to every player of that side (the game's settings, read in OpenBF2 for knowledge). The drone itself flies a 59 m circle round that place. The map draws that ring (dashed, the side's colour) with the UAV; *His view* counts the enemies inside it as known to him; and *Wall tracking*, *Fired at a wall*, *Pre-aim* and *Wide view* leave them out, as they leave out spotted enemies. In the 43 test demos with a UAV up, about 1 enemy in 5 was inside a ring.

## Visibility and walls

1. **No line of sight** (`wall`). A small-arms kill where the killer could not see the victim. We draw 9 lines from the killer's eyes to the victim's head, chest and hips, and none was clear at the kill or in the 0.6 s before it. Walls, hills and tree trunks block a line. The kill is checked again with the map's exact collision shapes, and the hint says how long the victim had been hidden (up to 5 s) and what was in the way. (v240) Not when the kill's own shot had its way: the game's direction of the hit (kept by the decoder since v235), drawn from the killer's eye, clear all the way to the victim. The 9 lines go to the middle of his head, chest and hips; a man lying down is hit 0.14–0.59 m over his feet (0.35 / 0.25 m are our points), so a man lying on a roof just behind its edge looked hidden while the bullets went over the edge (Karkand 19.10 21:06, two SVD headshots). (v241) A man lying down now has his points where those shots passed: the head 0.45 m over his feet and 0.4 m ahead of his position the way he faces, the chest 0.25 m, the hips 0.2 m and 0.6 m back (before: straight over his position, the hips in the ground); for 0.6 s after a change of stance the points of both stances count (going down or getting up, the body is still between them) — in every hint that asks whether he could be seen.
   - (v254) **The server's latency compensation** (OpenBF2's, as knowledge): the server hits the victim where the killer's own screen had him — put back by half the killer's ping and the screen's 0.1 s (`LAGC_WIN`), at most 0.3 s. The lines now go to the victim there. The 49 test demos (7,761 kills): 12 kills unseen without it, 11 with it (one *Through thin walls* kill was in sight from the killer's screen).
   - (v257) **Not the object he lies or stands on, near him**: the first 6 m of his lines leave out the object right under him (a rock pile, a roof, a cargo wagon, a wall he lies on) - his low line over its edge, the kill's own bullet over it. The v254 archive: 149 of its 204 No line of sight hints were lines that met an object within 6 m of the killer, 95 of them men lying on it; Road to Jalalabad's rock piles alone 63 (one sniper lying on top of one, 45 hints in 13 rounds). A wall or a house he shoots through from beside it still counts. (v258) The same in every check of whether he could see: Wall tracking, Fired at a wall, Pre-aim, Ready for contact, who saw whom first and His view. The 14 test demos: no hint more or less; who saw whom first changed in 153 of 5,733 kills (most from "even" to "first" or "second": a man lying on a roof or a rock saw over its edge sooner). (v259) The object under him is looked for in five spots - under his position and 0.6 m round it - so the wagon or wall edge beside him counts too (between two cargo wagons, at a wall's end); and for a man lying down the ground in his first 6 m blocks a line only when it rises 0.5 m or more over it (not 0.15 m): a sniper lying on a hill's crest sees down over it (the v258 archive: Dragon Valley's prone snipers 220–243 m down the slope). 16 test demos: no hint more or less; who saw whom first changed in 71 of 6,849 kills. A man **inside** a wall or a rock is not "on" it: Inside an object (65).
   - Shows up from **2** such kills by one player in a round.
   - **Strong** when the exact shapes confirm it and the victim was hidden for 1 s or more.
   - *Example: he kills someone who has been standing behind a concrete building for 2 seconds.*

2. **Through thin walls** (`thru`). Same as above, but the thing in the way is something bullets can pass through: thin metal, wooden boards, cloth. **Minor** (information only), because real wallbangs exist.
   - *Example: a kill through a wooden fence or a tent.*

3. **Wall tracking** (`track`). His aim follows an enemy hidden behind walls or hills. Checked every 0.2 s; all of these must be true:
   - the crosshair stays within 3° sideways and 6° up or down of the hidden enemy's head or chest;
   - the enemy is 8–150 m away and inside the fog distance;
   - it is the same enemy for at least 2 s in a row;
   - the enemy moves across the view (his direction changes by at least 10°) and the aim moves with him;
   - (v245) his side didn't know where the enemy was: no spot of him in the 5 s before (a spot's marker shows through walls), and he was not in his side's UAV ring (see below).
   - *Example: an enemy runs behind a row of houses, and the crosshair slides along the wall, staying on him the whole way.*

4. **Fired at a wall** (`wallfire`). He holds the trigger while aiming at a hidden enemy (as in Wall tracking). Conditions:
   - no visible enemy or vehicle within 8 m of where he aims;
   - he has a weapon in his hands;
   - he had not seen that enemy in the 3 s before;
   - (v245) the enemy was not spotted to his side, nor in its UAV ring.
   - Shows up from one burst of 1.4 s or more, or **6** bursts of 0.6 s or more, in a round. (v213: it was 4. On the infantry-only Karkand server that gave 1.2 hints a round, one for every hot firefight. With 6, the two players who stood out remain, each in 6 of his rounds.)
   - *Example: a long burst into a wall exactly where an unseen enemy is walking behind it.*

5. **Through smoke** (`smoke`). A small-arms kill where the line to the victim went through thick smoke during the second before. From **2** in a round.
   - *Example: two kills straight through a smoke grenade cloud.*

6. **Beyond fog** (`fog`). A kill farther away than the map lets you see, plus 10 m. The view distance comes from the map's own files: Karkand 140 m, Blue Pearl 90, Sharqi 195, Mashtuur 200, Songhua 250, Jalalabad 270, Fushe Pass and Gulf of Oman 400, Wake and Kubra 600, and so on. From **2** in a round. (v221) Kills where the game named the wrong weapon don't count either: a hand-held weapon while the killer sat in a vehicle, or a vehicle's weapon after he was already on foot — that was not a shot from where he was. A kill the game named as a hand-held weapon, though his own AT mine, claymore or C4 went off by the victim, is now recorded as the charge. (v235) Also a kill inside the view distance but past where the map's fog leaves nothing of a man (Karkand 99.5 m, Mashtuur 155, Songhua 204, Jalalabad 207, Highway Tampa 305 …), with no sky behind the victim as the killer saw him. The two kinds count together towards the 2.
   - (v213) Not only small arms: also kills from vehicles, emplacements, AT launchers, grenades and grenade launchers.
   - Not counted: mines, claymores, C4 (it goes off where it lies, or on what it is stuck to), artillery (the commander calls it), AA rockets (they lock on by themselves), guided missiles (TV or laser: the missile's camera does the looking), and a victim who was in an aircraft in the last 5 s (he dies where it comes down, far from where it was hit). (v257) Nor the carriers' **Phalanx** (an AA gun): in the v254 archive 74 of the 336 Beyond fog hints, men on foot 640–960 m away, 70 of them one player on Gulf of Oman and Wake - the hits' own direction not from him: its shells burst where they come down, he fired across the sea at the enemy's flag. (v258) Nor a victim his side had spotted in the 6 s before, or in its UAV ring: the game draws the spot's mark on the screen through the fog, and men fire at the mark (the v254 archive: 20 of its 262 hints). (v259) Spotted only: v258 left out a victim in his side's UAV ring too, and 125 of the v258 archive's hints went that had no spot at all - the UAV shows men on the minimap, not through the fog on the screen; those count again (16 test demos: 4 hints back).
   - From an aircraft, the distance is measured in 3 dimensions.
   - (v254, v255) A kill by a man the demo has no soldier for then (his place the map's middle, or where he stood last) isn't measured at all (no Beyond fog for it; the map draws no kill line for him). (v255) v254 took a manned vehicle on the bullet's line for his seat — wrong both times it was used: such men mostly have a soldier the demo never showed a spawn for (alive in its opening snapshot, or a spawn message not read), and found by their own acts (their throws made where it stood, their kills along whose bullet it stood) they stood 2–3 m from the victim, not in the UH-60 or the Vodnik 25 m back. A killer who died a moment before the kill (the two shot each other, his grenade went off after him) is measured from where he last stood. The 49 test demos (7,849 kills): 5 kills of 2 men not measured. (v257) The decoder now finds such soldiers itself (the same acts: 2 or more throws or kills of his where the soldier stood, 80 % of them, nobody else's): in the test demos Simflera (6:22 of a round), STEELDOG842, derB0ehseMann and Shukrija, no one else - their kills are measured now (Simflera's two Beyond fog hints with his Kord went: he was in range).
   - Only on maps whose view distance we know (not on custom maps).
   - *Example: he kills someone standing past the fog line, where the game doesn't draw him.*

7. **Wide view** (`fov`). A weak sign. An enemy in the open appears just outside the edge of the screen: 50–70° from where the player looks, just past the edge of a 16:9 screen (v219; v216–v218 47.5–67.5°, before that 42–62°). (v234) **A 21:9 or 32:9 monitor does not explain it**: the game keeps such screens near 16:9's width (about 92° / 90°; v219–v233 said a 21:9 player gets this hint honestly) — still a weak sign, since sound, the minimap and team calls turn honest players too; check his other rounds. Within 1.2 s the player turns onto him (to within 15°).
   - The enemy is 8–150 m away.
   - Nothing else could have told him: the enemy hadn't fired for 1.5 s, wasn't spotted for 6 s, wasn't in his side's UAV ring (v245), and hadn't hit the player in the last 2 s.
   - Shows up from **5** such cases and chance < 1 in 1,000.
   - *Example: five times in a round, an enemy walks in quietly from the side, off-screen, and the player turns straight to him with no sound or spot to warn him.*
   - (v260) Two more bands past it, each against the round's others' own share: *Wide view 70-90°* (67) and *Enemy behind* (68).

8. **Spots unseen** (`blindspot`). He spots enemies that nobody on his team could see at that moment. Shows up from **12** such spots that are also **75%** or more of all his spots.
   - *Example: he spots 20 enemies in a round, and 16 of them were behind walls where no teammate could see them.*

9. **Glitch spot** (`glitch`). He stood for 20 s or more where no other player stood in any round of that map, while 3 or more other players stood in the same spot 5–40 m higher or lower. In other words: inside the walls, under the floor, or on a roof you can't reach. (v253) A soldier's stays within 25 m of each other in a round are **one** hint — the time is all of them, with how many times and until when (archive v251: its 98 hints were 63 places, one man back at the same spot again and again).
   - Only on maps with 30+ analysed rounds.
   - "On a roof" or "on the ground under someone" is information only.
   - **Strong**.
   - *Example: he spends a minute under the floor of a building, 6 m below where everyone else walks.*

## Aim and shooting

See "Lying down" above: for a prone shooter these hints can be wrong either way.

10. **Aim snaps** (`snap`). In one step (0.1 s) the crosshair jumps from 30° or more away from the victim to within 5° of him. The victim is 5 m or more away, and it happens in the 1.5 s before the kill. From **3** in a round. (v258) **Against the round's others**: and so many of his kills that the odds at the round's others' share are under 1 in 1,000 (`SNAP_P`). In the v254 archive a snap came with 0.7–0.9 % of the kills on every server, but 47 of the 66 hints were on SiC's infantry-only Karkand - a man there just has more kills; with the round's others: SiC 5 soldier-rounds, 2F4Y 1. Made up (5 of a rifleman's 43 kills snapped 120° in 0.1 s): a hint.
    - *Example: the view flicks 90° onto an enemy in a tenth of a second, three times in a round.*

11. **Reaction** (`react`). Kills where he first saw the victim 0.25 s or less before the kill. Shows up from **4** such kills out of at least 8 measured, and chance < 1 in 1,000. (v237) The hint also gives his ping then: on his own screen each such kill was about 0.1 s + his ping quicker still.
    - *Example: again and again, an enemy steps round a corner and is dead a fifth of a second later.*

12. **Headshots** (`hs`). At least 6 kills where we know where the shot hit (sniper rifles left out), and so many headshots that, compared with everyone else in the round, luck gives that less than once in 10,000.
    - *Example: 9 headshots out of 11 rifle kills, in a round where the others get about 20%.*
    - (v214) **Sniper headshots** (`hssn`): the same for sniper rifles, against each rifle's own share (L96A1 0.47, SVD 0.37 and so on): 6 or more kills and chance < 1 in 10,000.

13. **Triggerbot** (`trigger`). The gun fires the instant the crosshair lands on an enemy:
    - the enemy is 8 m or more away;
    - the crosshair came from 5° or more away within the last second;
    - the kill comes 0.15 s or less after it lands (or the trigger is pressed between 0.05 s before and 0.12 s after).
    - Shows up from **6** such kills and chance < 1 in 1,000.
    - *Example: six times, the crosshair sweeps across an enemy and the shot goes off exactly as it touches him.*

14. **Smooth aim** (`smooth`). An enemy 10 m or more away moves across the view at 4°/s or more, and over the last second the crosshair stays on average within 0.5° of him. From **4** such kills. (Since v225 the view is where the head looks, not where the body faces: aim reads 3× more exact for everyone, so the old 1.2° and 3 kills would have caught three honest players in nine rounds.)
    - *Example: a running enemy is tracked perfectly; the crosshair is glued to him for a full second.*

15. **Target switch** (`switch`). Two kills of two different enemies 0.8 s or less apart, in directions at least 40° apart. (v258) **One hint a man, against the round's others**: 2 or more such switches (`SWITCH_N`), so many of his quick double kills (two enemies within 0.8 s) that the odds at the round's others' share are under 1 in 1,000 (`SWITCH_P`). In the v254 archive a quick double kill swung 40° or more 6–8 % of the time on every server; 38 of the 73 hints were on SiC's Karkand, which simply has more of them, nearly all one switch a man; two men had 6 in a round - now the only two.
    - *Example: he kills one enemy in front, and half a second later another one 60° to his left.*

16. **Pre-aim** (`preaim`). The victim steps out of cover after being hidden for 1 s or more, and the crosshair is already on him. From **5** such kills and chance < 1 in 1,000. (v214) Sniper rifle kills are compared with other snipers (they hold an angle: 20–22% against 7–8% for the rest), not with everyone. (v245) A victim spotted to the killer's side in the 5 s before, or in its UAV ring, isn't counted: he knew where to look.
    - *Example: five times, the crosshair waits exactly at the edge of the wall where the enemy steps out.*

17. **No spread** (`spread`). A kill farther away than the weapon's spread allows: shotgun 40 m, pistol 150 m, SMG 120 m, rifles and machine guns 250 m (sniper rifles not checked). Also a kill farther than the bullet can travel at all. **Strong**.
    - *Example: a shotgun kill at 90 m.*

18. **No trigger** (`nofire`). A bullet kill on foot, but no trigger was pressed in the 1.5 s before it. **Strong**.
    - *Example: the victim dies to his rifle, but the demo shows he never pulled the trigger.*

## Movement

19. **Speed** (`speed`). On foot, faster than 8.7 m/s every second for 2 s or more in a row (the game's top running speed is 6.93 m/s; v233: its own figures - sprint 7.0, run 3.9, walk 1.5, crouch 2.0, crawl 0.8 m/s - match the demos; no limit by stance, as the demo's stance lags behind dives to the ground). **Strong**. Not counted when:
    - he is in a vehicle, or left one less than 3 s ago;
    - he spawned or was revived less than 3 s ago;
    - he is wounded;
    - he falls or climbs more than 2 m in a second;
    - a vehicle is within 6 m;
    - an explosion went off within 15 m in the last 2 s;
    - the jump is over 40 m/s (that is a teleport, below);
    - (v213) he is on the fast stretch in the north of Dragon Valley.
    - *Example: he runs across the map at car speed, with no vehicle or explosion anywhere near.*

20. **Stamina** (`stam`). He keeps sprinting with zero stamina for 3.5 s or more, or his stamina doesn't go down for 13 s or more. In old rounds without stamina data: one sprint of 13 s or more. (v235) A full sprint bar lasts 10 s with a light kit and 8 s with a heavy one. On a server without vehicles the game drains it half as fast, so there that rule is 26 s.
    - *Example: a 20-second sprint where the stamina bar never moves.*

21. **Teleport** (`tele`). On foot, a jump of 15 m or more in one step (over 40 m/s). **Strong**. Conditions:
    - he moved normally 3 s before and 1 s after;
    - no spawn, revive or vehicle in the last 5 s;
    - no vehicle within 8 m;
    - it is not a gap in the recording;
    - (v213) it doesn't end where the game itself puts players (Dragon Valley, Gulf of Oman: the same point to the centimetre in many rounds).
    - (v254) he isn't on a Special Forces grappling rope, nor within 3 s of taking one or getting off it (see *Ropes* below).
    - *Example: one moment he's at the flag, a tenth of a second later he's 30 m away.*

22. **Through walls** (`clip`). His step of 0.4–4 m passes through solid shapes at least 0.15 m thick at knee, waist and chest height, while both ends of the step are in the open. Shows up from **15** times in a round at **10** or more places (at least 5 m apart). (v214) Not on an aircraft carrier (within 160 m of a Carrier flag): 4 of the archive's 10 hints started on Wake's carrier. **Strong**.
    - (v254) Steps while he climbs a grappling rope don't count (the rope goes up a wall).
    - *Example: he walks straight through building walls all over town.*

23. **Floating** (`fly`). His feet stay 5 m or more above whatever is under him for 8 s or more in a row. He moves sideways at 2 m/s or more and doesn't come down. No vehicle within 12 m, and he didn't leave one in the last 10 s. **Strong**.
    - (v254) Not while he hangs on a grappling rope (from taking it to 1.5 s after getting off).
    - *Example: he walks through the air over a street at rooftop height.*

    **Ropes (v254).** Special Forces' grappling hooks: the decoder now keeps the game's grappling-hook events (the hook thrown, a man taking the rope, getting off it at the top — the server decodes every round again), and the map draws each rope (Show ▾ → *Grappling ropes*, on by default) from the point it was thrown at to where the last man got off it, from the throw to 30 s after its last use, bold while someone climbs, with how far up ("Rope · 4 m up"). A Mass Destruction round had 19 ropes, 24 climbs. Floating, Through walls and Teleport leave a man on a rope out. (v257) The decoder reads the rope's own events too - each of its particles, and where on it the man is, about 30 times a second: the map draws the rope's real shape (from the hook over the edge, hanging down) and a man climbing goes up it (the demo kept his soldier where he took the rope, then 6 m higher in one step).

24. **Under the map** (`under`). Alive on foot, 1.5 m or more below the ground for 2 s or more. **Strong**.
    - *Example: he moves under the terrain and shoots up at players walking above.*

25. **Parachute** (`chute`). Under a parachute, faster than 15 m/s sideways, or rising at 1 m/s or more for a second. **Strong**.
    - *Example: a parachute that flies across the map like a plane, or goes up instead of down.*

26. **Vehicle speed** (`vspeed`). A vehicle goes faster than 1.35 × the top speed of its type for 3 s. The top speeds come from 1.6 million measurements. Not counted with an explosion within 25 m or a drop of more than 15 m, or (v213) on two roads of Kubra Dam where every BTR-90 does about 25 m/s. **Strong**.
    - *Example: a jeep doing twice its normal top speed on flat ground.*

27. **Outside the map** (`outside`). (v247) By the game's own rule (the engine's out-of-area code, read in OpenBF2 for knowledge): it counts a man's seconds outside the combat area while he is alive; after the map's allowed time (10 s on every map) it takes **20** health a second off the man himself — in a vehicle too — and four times that after 20 s (Highway Tampa: 5 a second), so a man with full health is dead at **15 s** (Tampa 22.5 s). The hint: alive **on his feet** outside longer than that, plus the health he was healed meanwhile, plus **10 s** — no damage came off him (a god-mode hack, or a server that doesn't apply it). A man down counts on in the game's count but is left out here (before v247 he counted: 8 s up and 13 s down made 21 s). 43 demos, 336 stretches: every man on his feet back inside by 10 s (or down), pilots dead at 14–17 s (one at 23 s). **Strong** (before v247: alive 25 s on end, minor). On the map the ring's **OUT** now counts down the seconds he has left (10 → 1), then shows what the game takes off him a second. (v253) Each life in a stretch on its own — a man killed outside and revived starts again (archive v251: 2 of its 12 hints were three lives in one stretch of the game's count; the round's health confirms the rule: 20 a second from 10 s, 80 from 20 s) — and no hint when the game's damage took him down at last (a kill with no weapon to it, still outside).
    - *Example: he sits past the border, where the game tells you to go back.*

28. **Idle** (`idle`). Alive on foot, hasn't moved 1 m or turned 2° for 240 s (4 minutes) or more. This is usually AFK. A commander sitting at his screen looks the same. **Minor**.
    - *Example: he left the game running and walked away.*

## Spawning

29. **Spawn** (`spawn`). He appeared more than 25 m from every spawn point on the map, from every teammate, and from every vehicle. (v247) The game's squad spawn rides on the squad leader, is offered only to the squad's other men, and scatters them **3–9 m** round him (43 demos: 654 of 663 squad spawns on foot within 9 m): with squads in the demo, away from his side's spawn points only **his own squad leader within 12 m** explains a spawn now — another team mate near him no longer does; with no leader of his squad then (or no squads in the demo), any team mate or vehicle within 25 m, as before. (v253) The demo can name two men of his side as his squad's leader at once (one who left, or a leader of another squad of that number): v247 took the last of them — mostly a dead or a far one — and the archive of v251 got **1,984** Spawn hints, 1,863 of them so. Now the **nearest living** one; none alive — the game's squad spawn point goes with its leader, so the team mates' rule. Five demos of the archive: all 278 of their spawns away from the flags within 12 m of a living leader of his squad (34 Spawn hints by v252, none now). (v254) **One rule for the squad leader on the whole site** (the player's card, the scoreboard, the squads on the map, Flag choices and Spawn): of the men of his side the demo names leader of that squad, the one made leader **last** — a leader who left or lost the post keeps his flag in the demo for a while (orther1s led squad 2 from the round's start; MicrosoftExcel took it over at 3:13, and both were "leader" until the round's end). The 49 test demos: no squad with two leaders any more, and no Spawn hint more or less than v253's rule. (v213) Not counted at spawn points the map layouts are missing: 4 on Mashtuur City, one each on Operation Clean Sweep and Dragon Valley.
    - *Example: he appears in the middle of a field with nothing there to spawn on.*

30. **Early spawn** (`respawn`). He spawned 0.5 s or more before the game allowed, judged by the respawn time the game reports when he dies.
    - *Example: the game says 15 s until respawn, and he's back after 10.*

## Weapons and ammo

31. **Melee reach** (`reach`). A knife or defibrillator kill from farther than it reaches (knife 2 m, defibrillator 2.8 m) plus 2.5 m of margin. We use the closest distance in the 0.6 s before the kill. **Strong**.
    - *Example: a knife kill from 10 m.*

32. **Fire rate** (`rate`). **Strong**. Picked-up kits are taken into account. Two cases:
    - Launches faster than the weapon can reload: grenade 0.7 s, SRAW 4 s, Eryx 4.2 s, claymore 0.6 s, APC missile 4 s, TOW / HJ-8 5 s. (v213: the APC missile was 10 s. All 29 such hints were 4.5–9.9 s apart, which is simply how fast it reloads.)
    - Kills with a single-shot weapon faster than it can fire: tank cannon 1.5 s, bolt-action sniper rifle 1 s, pump shotgun 0.6 s.
    - *Example: two SRAW rockets 1 second apart.*

33. **Ammo** (`ammo`). In one life he used more than twice what his kit carries: grenades 4, SRAW / Eryx 6, claymores 2, C4 5, mines 5. Not counted if an ammo bag was within 15 m, a commander's supply crate was there, or he picked up kits. **Strong**.
    - *Example: 12 grenades thrown in one life, with no resupply.*

34. **Damage** (`dmg`). On foot, he killed someone inside a closed vehicle (tank, APC, anti-air) with small arms, while the vehicle still had 25% or more health a second before. In tanks and anti-air vehicles only the driver counts. **Strong**.
    - *Example: he kills a tank driver with a pistol while the tank is barely scratched.*

35. **Guided missiles** (`guided`). **Strong**. Two cases:
    - A missile "sticks" to a moving target (5 m/s or more): **3** or more hits by one shooter, with the missile on average within 0.5° of the target.
    - TV-guided missiles from aircraft: 8 or more launches with so many hits that chance < 1 in 100,000 (on average 38% hit).
    - (v260) **The last second**: 3 or more hits on a moving target with the missile within **0.5°** of the target at the middle of each hit's last second of flight (`GUIDE_LAST`). A cheat's TV guidance has a *Smoothness*: the missile wanders on the way - the middle over the whole flight goes up - while "the final approach stays precise". Honest gunners are no finer at the end: 177 such hits in 16 demos, the last second 1.8–2° at the middle (a tenth under 0.33–0.6°); the lowest of a gunner with 3 hits 0.94°. Made up (one gunner's 15 hits, his missiles' noses on the target for their last second only): a hint, 0.11°.
    - *Example: every TV missile from his helicopter lands on fast-moving jeeps.*

36. **Artillery** (`arty`). Any of these. **Strong** when we know for sure who the commander was.
    - a commander's artillery strike 50 s or less after his team's previous one;
    - more than 5 shells from one gun;
    - two shells from the same gun less than 1.7 s apart.
    - *Example: artillery called down again 20 seconds after the last strike.*

## Flags and score

37. **Fast flag** (`fastcap`). For 1 s or more, a flag is captured as if at least 2 more soldiers stood in the zone than really did, or at a speed the map doesn't have at all. Not counted when every flag in the round moves at a non-standard speed (a server setting). **Strong**. (v235) Men are counted as the game counts them (its gpm_cq.py): a man down does not count, and of a vehicle's crew only the first man does. Before, everyone in the zone was counted, men down included.
    - (v213: before this, it fired already at 1 extra soldier — 91 of 103 hints. A third of them were on six flags where our zone misses one of the players capturing.)
    - *Example: one player captures a flag as fast as three would.*

38. **Kill farming** (`farm`). The same killer killed the same victim 4 or more times while the victim stood still: he moved less than 2 m and turned less than 10° in 10 s, and had been alive for 3 s or more. (v214) Not from aircraft: on Dragon Valley jets kept killing men waiting by the airfield.
    - *Example: a friend stands still at spawn so the player can farm points by killing him over and over.*

39. **Spot spam** (`spotspam`). 30 or more spots in 60 s, or 12 or more in 10 s. The commander isn't counted. **Minor**.
    - *Example: someone holding down the spot key all round.*

## Macros and scripts (v214)

From v214 the decoder keeps two more things from the demo (the server decodes every round again): with each press of the trigger, how many rounds are left in the magazine (the next press of the same weapon tells how many the last one fired), and the game's press counter, which shows presses shorter than one game tick (1/30 s) that can't be seen otherwise. The norms come from 17 rounds: 47,821 presses, 3,940 kills.

43. **Clicker** (`clicker`). Any of these:
    - 15 or more presses of one weapon, each under 0.3 s after the last, at 12 a second or more (a hand manages 10.6 at most);
    - 20 or more presses whose spacing varies 3% or less (a hand varies 5.5% or more);
    - presses shorter than a tick in 3 or more moments, 6 or more in all: a mouse wheel bound to fire, or a clicker. **Strong**.
44. **Bullet rate** (`brate`). 8 or more bullets in one press (the magazine count) at 1.5 × the weapon's own rate or more, twice in a round. Rifles fire up to 9.7 a second, SMGs and pistols up to 14.7. Machine guns and sniper rifles are left out (their count doesn't change in the data). **Strong** at 3 or more such bursts at twice the rate.
45. **Spot rhythm** (`spotbot`). 10 spots in a row, 1.5 s or more apart, varying 10% or less (by hand: 36% or more). A key on a timer.
46. **Anti-AFK script** (`afkbot`). For 180 s or more, alive on foot inside an 8 m circle, moving (so Idle misses it) and never firing, walking the same path again and again (2–60 s a turn, back to within 0.5 m). **Minor** (rules).
47. **Prone spam** (`prone`). Dropped to the ground 12 or more times in 30 s (by hand: up to 8): dolphin diving. **Minor** (rules).
48. **Bunny hop** (`bhop`). 15 or more jumps in 15 s (by hand: up to 13 in 43 demos). **Minor** (rules). (v235: 20 before — but a jump on flat ground lasts about 0.9 s, so the game allows only 16–17 in 15 s, and 20 needed slopes.)

What the demo can't show well: a recoil script on an automatic weapon. Fifteen shots a second and the hand pulling down come out netted in each 0.1 s record. (v254) Netted, but never still: in 44 demos every burst of a hand (152 of them) moved his view 0.05° a record or more — so a script that holds the view **dead still** shows, see *Recoil script* (64); one that pulls down a little unevenly, like a hand, does not. (v245) But a **sniper rifle through its scope** does kick the view in the demo, and that is checked — see *No recoil* (61). Firing a bolt-action rifle the instant it is ready also can't be told apart from a man who keeps pressing the trigger (Clicker catches the even rhythm of a script).

## More cheat signs (v214)

49. **Lag switch** (`lagsw`). Twice or more in a round, his records stand still for 0.5–3 s while he was running (2.5 m/s or more) and the others' records go on. Then he is suddenly 4 m or more further on, with a kill of his during the gap or within 1.5 s after it. His ping is under 250 ms.
50. **One-hit kills** (`onehit`). Body kills with a rifle, SMG or pistol from 15 m or more, of a man who had 95% health or more 0.2 s before. By hand this happens in 1.4% of such kills (health is recorded 10 times a second). Shows up from 4 such kills and chance < 1 in 10,000. A damage hack.
51. **Silent aim** (`silent`). Kills from 10 m or more, standing or crouching, while his view was 30° or more off the victim at the kill and 0.1 s before. By hand 5.5% (the view in the data isn't always where the bullet went). Shows up from 5 such kills and chance < 1 in 10,000. (v260) It looks across only; held up or down: *Anti-Aim* (66).
52. **Aim lock** (`vlock`). 10 or more kills at 15–150 m where his view's height on the victim's chest is right to 0.3° in the middle and 0.8° at 9 kills in 10 (by hand: 2° or more at 9 in 10). An aimbot set on the body rather than the head, which Headshots doesn't see. (v258) **Against the round's others too**: so many of his kills within 0.2° (`VLOCK_TH`) that the odds at the round's others' share are under 1 in 10,000 (`VLOCK_P`). In the v254 archive 44 of the 50 hints were on SiC's infantry-only Karkand (16 % of its rounds): on a flat map heights are alike and a hand comes close too - honest kills within 0.2°: 29–36 % on every server. With the others: SiC 3, 2F4Y 1, Lost-Soldiers 1 of 3,519 rounds. Made up (every kill of one man locked on the chest): 35 of 35 and 20 of 24 - a hint. (v260) The view's pitch is now read right in every record (the decoder: in ~2 % of them it jumped to 65–70° up for a moment) - 5 % of kills had looked 20°+ off up or down, now none; no Aim lock hint changed in the 16 test demos.
53. **Spin** (`spin`). His view turned 60° or more in 0.1 s, 28 or more times within 3 s (by hand: up to 21). A spinbot, or his view gone wrong in the data.
56. **Sideways sprint** (`sidesprint`, v235). 2 s or more on end at 4.3 m/s or more (his own velocity), on flat ground, moving 60° or more off where he looks. The game sprints only forward: it needs "forward" and drops the sideways part, so sideways or backwards nobody goes faster than 3.9 m/s. By hand in 43 demos: 1.0 s at the most, in a sharp turn (the movement follows the view a little late). Not near vehicles or explosions. A speed hack, or his view not where the demo has it. Lag can cause it, so a high ping is shown.
57. **Speed in the air** (`airspeed`, v235). Twice or more in a round, a jump on flat ground (0.6–1.2 s in the air) in which he got 4 m/s or more faster. The game keeps a jump's speed: air control adds at most 2 m/s, and only while he is slow. By hand in ~4000 jumps: +2.6 m/s at the 99.9th percentile, +3.6 once. Not near vehicles or explosions. A speed hack, or something pushed him.
58. **Shot in a jump** (`jumpfire`, v235). Twice or more in a round, a small-arms kill 0.15 s (+ the distance at 300 m/s, for a bullet fired before the jump) to 0.55 s after he took off. The game lets nobody fire for 0.7 s after a jump (fire-delay-after-jump in its data). By hand in ~1700 kills: none between 0.1 and 0.6 s; 28 came 0.6–1.2 s after a jump. A no-delay hack, or something the demo shows as a jump that was not one (a blast that lifted him is left out).
59. **Speed by stance** (`stancespeed`, v237). 2 s or more on end crouching at 3 m/s or more, or lying at 1.6 m/s or more. The game moves a crouching man at 2.0 m/s at the most and a lying one at 0.8. Measured per second, as the lower middle of its ten 0.1-s steps and no more than the whole second's (a man lagging or pushed out of a pile jumps 7 m in one step and then stands: no speed); the same stance through the second and 1 s before (a dive carries a sprint's speed); left out: in or near a vehicle (8 m), carried with another soldier, swimming, on a ladder, falling, a blast within 15 m, 3 s after a spawn or revive, sliding down a slope, the round's first 10 s. By hand in 43 demos: crouching 2.01 m/s at the 99.9th percentile (2.83 at the most), lying 0.82 (3.21 at the most), never for more than 0.2 s. (v233 had no limits by stance: the decoder lost the stance after a health change until v235.)
60. **Shot from elsewhere** (`shotfrom`, v245). Twice or more in a round, a small-arms kill on foot from 15 m or more whose killing bullet came 20° or more off the line from the killer — 3 m or more to the side at his distance — and not from where his screen had the two of them a moment before (his screen runs about 0.1 s and half his ping behind the server). The direction is the game's own record of the last hit (kept by the decoder since v235; the kill's Side view card shows it, and the map draws it dashed when it is off). In 43 demos, 645 such kills: 0.4° off in the middle, 5.1° at the 99th percentile; only two not explained by the screen (9°, and 96° — not his shot), never two of one soldier. Bullets that start somewhere else ("magic bullet"), or he was not where the server had him (lag: his ping is shown). **Strong** from 3. (v253) Only a killer the demo has **alive** at the kill, not in a vehicle in the second before, and a victim not in a vehicle: archive v251's 19 hints were 15 kills by a man the demo had not alive then — his place the map's middle, a shotgun's victim "1 km away"; he fired from a vehicle's seat and the demo kept no soldier for him — plus a Little Bird's miniguns credited to its pilot on foot and men killed in a jeep, a Black Hawk and an F-35.
61. **No recoil** (`norecoil`, v245). A sniper rifle fired through its scope kicks the view up: the game adds the weapon's recoil (its files: L96A1, M24, M95 4–5.2° up, Type 88 and SVD 4.5–6°, × 0.25 through the scope — 1.15° and 1.31°). In the demo, from 0.2 s before the press to the highest point in the 0.2 s after, honest shots rise **1.39°** in the middle (746 shots of 30 players in 43 demos; bots left out), and only **2.5%** rise less than a tenth of the kick — one player at most 4 of 29. The hint: 8 or more scoped sniper shots, so many without a kick that chance < 1 in 10,000 at 3%. A no-recoil hack, or a macro pulling the mouse down as he fires. (v253) Only shots **0.5 s or more** after his last press (`NOREC_GAP`): the archive of v251 had **1,021** such hints, 501 of them on SiC's Karkand Infantry Only — in five of its rounds' demos 324 of 356 flat shots came less than 0.5 s after his last press (an SVD or a Type 88 fired as fast as he clicks, a bolt-action pressed again while it cycles: his view still coming down from the last kick when the next goes up). Shots after a pause: 1.8% flat there, 1.9% in the 43 demos — no hint left in either.
62. **Endless ammo** (`infammo`, v245). In one life with one gun (rifles, SMGs, pistols, shotguns, sniper rifles; the magazine's count at every press, from v214's decoder): **8** or more presses of 0.3 s or more that took no bullet from the magazine (by hand: 3 at most in 1,271 lives × guns — a sprint, a reload or a switch), or **more than 1.5 ×** the magazines he carries changed (the game's own count for the weapon, 5 for most rifles; one more lot for each ammo bag, supply crate or support he came near). By hand nobody changed more magazines than he carried (AK-101: 157 bullets, 5 reloads). Machine guns (their box count doesn't change in the data) and shotgun reloads (a shell at a time) are left out. **Strong**. (v253) Each kit he had in a life on its own (a kit picked up from the dead brings its own magazines); a reload only where the count went up to **60%** of the most that gun held in the round (`INF_FULL`) — not one or two rounds more; no press with a launch of his in it or at a manned emplacement (the demo keeps a man at a TOW / HJ-8 launcher on foot with his rifle: 1 in the count, the trigger held 2–4 s as he guides it). Archive v251: 124 hints — 91 of its 100 "too many magazines" ones were such +1 / +2 steps (TapakaH's L96A1: 2, 1 … 2, 1 every 7 s — 28 "magazines"), the 24 "nothing fired" ones look like TOW / HJ-8 gunners (1 in the count, holds of 2–4 s; one checked in its demo: zielonka. at a TOW). (v254) The "2, 1 … 2, 1" counts: in 6 of the 49 test demos, about 50 small rises each, of a man standing still, not scoped, not firing at anyone, every ~7 s — nothing in the game's files we know of explains them (a reload of 1–2 rounds would need an empty magazine); since v253 they are no reload (`INF_FULL`), so they can no longer make the hint.

63. **Ready for contact** (`contact`, v254, **in shadow**). A wallhack's other habit: his crosshair already where a hidden enemy is about to step out. Each time an enemy comes out of cover in front of him — hidden from him (walls, hills, trees, smoke) **1.5 s** or more, then in the open two steps on end, within **70°** of where he looks, **8–150 m** off and inside the fog, not spotted to his side nor in its UAV ring, not firing, and he not hit in the 2 s before — how far off his crosshair the enemy was as he came out. Within **5°**: "ready". Honest players hold their sights on doors and corners too: **25%** of such moments in 49 demos (a man's own share is set against the round's others'). The hint: **6** or more ready, so many that chance < 1 in 10,000 against the others' share. Bots are left out. In the 49 test demos: two hints — rambow2, 14 of 21 against the others' 13% (chance 2 in 100 million), and MicrosoftExcel, 20 of 37 against 23% (3 in 100,000); nobody else under 2 in 10,000; neither has another hint. A made-up wallhacker who always aims at the hidden enemy who comes out next: 41 of 55 and 34 of 41 — a hint at once. One who only follows one hidden man with his crosshair isn't one (Wall tracking catches him). Every pair of enemies in his view is looked at once a second (the line to the head; hidden 1.5–2.3 s counts), and where one came out, the steps between again for the first he was out: about 2 s of a big round's analysis (v254 wrote "a quarter to a half longer" - measured with a test harness that worked the whole hint list out over and over while it waited). (v257) **Not while a sniper rifle is in his hands**: in the v254 archive (3,519 rounds) 90 of the 113 hints were snipers, and all 9 of the strongest - a scoped sniper holds his sights on a doorway or a ridge as a matter of course (Pre-aim found the same in v214); only 4 of the 113 had an aim or wall hint in the same round. rambow2 and MicrosoftExcel above were snipers too: no hint now. The made-up wallhacker (a rifleman): 21 of 32 against 23% - a hint. (v258) And checked again with the exact shapes (as Wall tracking): hidden on the 25 cm grid but in clear sight with the exact shapes in the middle of his hiding (a gap the grid closed, or the roof or rock the watcher lay on) - not a coming out. Made up: 20 of 29 - a hint.
64. **Recoil script** (`autorec`, v254, **in shadow**). A burst of an automatic weapon on foot — a press held **1 s** or more that fired **8** or more rounds (the magazine's count to the next press of that gun; sniper rifles, shotguns and emplacements left out): how much his view's pitch moved from one 0.1 s record to the next. The gun kicks every shot and the hand pulls down against it: 44 demos, **152** bursts of 105 players, **0.56°** a record in the middle, **0.05°** at the least. A burst at **0.03°** a record or less: his view held dead still while the gun fired — a recoil script (or a no-recoil hack). The hint: **3** or more such bursts in a round. Bots left out. The 49 test demos: no hint. Made up: one player's 6 bursts held still — a hint, 6 of 6. A script that copies a hand's unevenness is not caught. (v257) The v254 archive's 7 hints were the data, not scripts: an ammo bag's "61 shots", and 4 with the view not moving at all, not even sideways (the demo had no new view for him then). Now only the gun of his kit's rifle slot, no more shots than its magazine ever held in that round, and his view moving sideways in some of the steps (a recoil script holds the pitch; his hand still moves the gun across). Made up (the pitch held still in each burst): 3 of 3 and 4 of 4 - a hint.

65. **Inside an object** (`inside`, v259, **in shadow**). Kills by a man whose eye was inside a solid collision shape — a wall, a rock, a house's wall — at the kill and a second before it: **2** or more in a round (`INSIDE_N`). A bullet leaves a shape from inside (the game's shapes stop a bullet only on their way in), so he shoots out while nobody outside can hit him — glitched into a wall or a rock pile. Each kill: three rays from his eye, a little off the axes, each crossing the shape's faces an odd number of times (inside). Vehicles left out. In the v258 archive two men near-blocked No line of sight so; on their demos and the 16 test demos (6,730 kills): **ZdarovaByli** (Karkand, SiC, 06.10 10:16) lying inside the old city wall `stnwalls_50m_up` (50 × 7.1 × 4.1 m, solid) for **34** kills (the v258 archive had 8 of them as No line of sight: an RPK-74 at 4–35 m); **8964 MisterLok** (Road to Jalalabad, 01.10 18:33) lying inside `rockpile_1`, his eye 0.2–0.6 m under the rock's top, 13 kills (10 with an L96A1 at 26–137 m) — v257's "a sniper lying on a rock pile" was in it. Nobody else: one man more had one such kill (the same wall), two a single moment. Not the same as standing beside an object: Slizka_DK on Karkand stood 0.2 m beside a cargo wagon, his eye 8 cm under its floor — shooting under the wagon (No line of sight as before). Its card: how many kills, in which object; the kill list has each.

66. **Anti-Aim** (`antiaim`, v260, **in shadow**). A cheat's Anti-Aim sends the server angles held straight down or up, or jittered, while a silent aim fires the bullets elsewhere - Silent aim (51) looks across only. Either of:
    - **3** or more kills as Silent aim counts them (10 m or more, standing or crouching, no shotguns) with his view **30°** or more off the victim's chest **up or down** at the kill and 0.1 s before (`AA_VN`, `AA_VERR`). Honest players: none in 1,339 such kills of the 16 test demos (1 of 20°+). Made up (one man's view held 88° down around each of his kills): 39 of 39.
    - **20** or more jitters in a round (`AA_ZZN`): his view's pitch 30° or more one way and straight back the next record, 0.1 s later (or its heading 60°). Honest: at most 8 (pitch) and 3 (heading) a man in a round. Made up (3 s of ±40°): 30.
    - It needs the v260 decoder: before it the pitch jumped to 65–70° up in ~2 % of the records (5 % of the kills looked 20°+ off up or down). **Strong**.

67. **Wide view 70-90°** (`fov2`, v260, **in shadow**). As Wide view (7), the band 70–90° off where he looks (`FOV2_OUT`): a view hooked wider than the game's 1.1 rad (a cheat that sets the render's field of view; ~1.5 rad already sees 59° to the side on 16:9). From **5** taken and chance < 1 in 1,000 at the round's others' share (`FOV2_N`, `FOV2_P`). 16 test demos: 2,344 chances, 16.6% taken; one hint - Volund, Karkand 18.10, 8 of 14. Made up (a rifleman turning to every enemy in the open who comes into the band): 8 of 9.

68. **Enemy behind** (`behind`, v260, **in shadow**). As Wide view, an enemy in the open who comes behind him (90° or more off where he looks, `FOV2_OUT`), 8–150 m, unseen by him 1.5 s, no shot, spot, UAV or hit: he turns to him within 1.2 s. A cheat's "enemy nearby" warning. Honest players do turn to enemies behind them (they hear them): 7.6–11% in the 16 test demos - no hint. From **5** and chance < 1 in 1,000 at the round's others' share (`BEH_N`, `BEH_P`). Made up (a rifleman turning to every enemy 70°+ off): 6 of 6 against the others' 6.9%.

## Server rules (minor)

40. **Team kills** (`tk`). Every kill of a teammate, including from vehicles.
    - *Example: he runs over a teammate with a jeep.*

41. **Claymore at a flag** (`claycap`). A kill by a claymore lying inside a flag's capture zone (main bases not counted).
    - *Example: a claymore placed right at the flag pole kills a player capturing it.*

42. **Claymore kills** (`clay`). Every claymore kill. It's a list to browse, not a hint, so it isn't counted in "All".

54. **Side switch** (`teamsw`). He went over mid-round to the side that was 50+ tickets ahead and already had as many men or more. Other switches are mostly the server's balancing: 43 in 17 rounds.

55. **TK + revive** (`tkrev`). 3 or more times he killed a team mate and revived him within 30 s: points from the defibrillator.

## Flag choices — over all of a player's rounds (v249)

Not a hint of one round: a comparison of players over every analysed round, for a wallhack or radar that shows where
the enemies are. Such a player "is lucky" at flags: he goes for the flag where nobody is, when nothing he could know
said it was empty.

**What is counted.** Every trip to a flag his side did not hold: from where he spawned, was revived or left a flag zone
(he must be 25 m or more from every zone's edge and travel 6–120 s), on foot or driving (not as a passenger, not in an
aircraft, not faster than a man runs), to a flag zone where he stayed 4 s or died. **A trip that ended in his death on
the way counts too** (about 2 in 5 on Karkand): its flag is the one he had come nearest to (a third of the way, 30 m or
more, clearly more than any other), else the one his way pointed at (20° or less off, the next flag 40° or more).
Without them the unlucky trips would be missing, and a player who is often killed on the way would look lucky; those
whose flag can't be told are counted per player (*lost*) and `--check` says whether they go with the ranking. The flags
he could have gone for instead: every flag his side did not hold, out to 2 × the nearest one's distance or it + 150 m —
picked without looking at the one he chose. For each flag, at the moment he set off:
- **what his side could know**: the distance; the enemy's or nobody's; the flag's height and which way it moved over
  5 s (it blinks on the minimap); his team mates within the zone + 20 m (on his minimap); his squad's order there; and
  the enemies there **known** to them **when he set off** (v252) — seen by anyone of his side in the 10 s before
  (minimap, voice), spotted or in its UAV ring then, who killed a man of his side in the minute before (the kill
  message, the death screen — his own killer too), or who fired within 150 m of one of them in the 10 s before (heard);
- **what nobody on his side knew**: the other enemies within the zone + 20 m, and 20–60 m out of it (on the way in).

Up to v251 "known" also took what came after he set off — sightings to 5 s after, and anything he saw himself, spotted
or had in the UAV ring until he got there ("generous on purpose"). It was not generous but slanted: he sees the enemies
at the flag he goes to as he gets there, so those turned "known" at his flag and stayed "hidden" at the others — every
player looked lucky, and a radar much less so (below, "On the server's own rounds"). An enemy he saw himself on the way
and turned away from now counts as hidden: his card shows such ones as *seen by him on the way* — that is no luck.
A trip where the flags differ in **hidden** enemies is a **telling** choice (about half of all choices since v252).
(v252) Trips set off in a round's first 15 s are left out: who is where then is the map's spawns, and everyone keeps away
from the enemy's spawn flags (the crowd's lean 0.08 a telling choice there, none after 15 s) — a regular there at every
round's start would look lucky for it. A squad member whose leader went to
the same flag (from 20 s before he set off to 20 s after he arrived) is left out: that was the leader's choice. The
commander is left out. A flag is told by its name (each layer — 16, 32, 64 — has its own set).

**How players are compared.**
1. A model learns from **everyone's** choices how players choose by what they could know (each flag's odds by distance,
   owner, height, team mates, known enemies, order — and how much each map's flag draws each side).
2. **His own way of choosing.** The same weights are fitted again on each player's own choices, pulled towards
   everyone's: a player who always goes for the far flags nobody fights over (back-capping) meets fewer enemies of
   every kind, and by his own weights that is his way, not luck. Only the known part is fitted, so a cheater's pull
   away from hidden enemies stays in what is left. (v251) **His taste in flags** too: how much more (or less) than
   everyone he goes for each flag of a map and side — a player who likes a quiet flag (South Base on Wake Island, where
   enemies hardly ever are) meets few hidden enemies without knowing of any. It is learnt **only from his choices that
   tell nothing** (every flag with as many hidden enemies: a radar shows nothing there), so a cheater's pull towards
   the empty flags is not taken for his taste; pulled towards everyone's. His card shows his flags.
3. For each player: the hidden enemies his own odds foretell over his telling choices, and how many he met
   (**avoided** = the difference); how often he chose the emptiest flag, and how often his odds would (**emptiest**
   x / E). How unlikely "so few" is, **exactly** (hidden enemies are rare, so a plain bell curve would run ahead of it).
4. **z hid** — that, set against the spread of everyone's. The spread grows with how much a player has played: honest
   players differ a little per choice (game sense, a squad that talks), which adds up over many choices, so a regular
   is measured against a wider spread than a newcomer (fitted to the ranked players, the farthest 2.5% left out of the
   fit so a few cheaters don't move it). **z kn** — the same for the *known* enemies: his reading of the game.
   **beyond** — z hid less what his z kn foretells over everyone (only taken off: a good honest player avoids the
   hidden enemies a little too; a player low on the known ones gets nothing from it): **the ranking**. **q** — the
   false-discovery rate over all ranked players (Benjamini–Hochberg): q < 0.05 means that of the players at or above
   him, about 1 in 20 is there by luck.
5. Only players with **15 or more telling choices** are ranked. Fewer than 30 such players: the plain z and no q.

**How sure (a made-up archive, v249).** The flags of real decoded rounds with made-up players: 12 runs of 300 players
with 1–300 rounds each, honest ones each with his own way of choosing, his own game sense and his own bit of luck with
hidden enemies, 10% cheaters pulled away from hidden enemies. Of 1,553 honest players ranked, **2** reached q < 0.05,
of 42 flagged (5%, as q < 0.05 promises). Cheaters found at q < 0.05, by how many telling choices they had:

| each hidden enemy cuts a flag's odds | 15–59 | 60–149 | 150–299 |
|---|---|---|---|
| 4.5 × (a radar he follows) | 8 of 32 | 18 of 23 | 3 of 4 |
| 2.2 × | 2 of 35 | 3 of 26 | 4 of 8 |
| 1.5 × (now and then) | 0 of 33 | 1 of 19 | 1 of 16 |

So it finds a player who follows a radar once he has 60+ telling choices (60+ full rounds); one who peeks now and then
it does not find. Real honest players also talk (voice, squads): run `--check` on the server's own rounds — the
**placebo** (hidden enemies shuffled among choices of the same flags and side: nobody should be found, and *beyond*
should spread about ±1), **split halves** (a real trait keeps its place between his odd and even rounds), peeking put
into real players' choices, and whether *lost* goes with the ranking (it should not).

**On the server's own rounds (v251: the archive of 2026-10-28, 3,432 rounds, 172,477 choices, 39,235 telling, 737
players ranked).** Nobody stands out beyond chance: beyond is spread as pure chance would spread it (over 2: 16 players,
chance alone gives 17; under −2: 13; over 3: none, chance gives 1); it does not go with K/D (r 0.05), with how often he
is killed on the way (−0.04) or with *lost* (0.01). 82% of telling choices differ by one hidden enemy only. On each
server on its own one player was flagged (Wake Island, beyond 3.67, q 0.009): he went for South Base in 35% of the
choices it was in (everyone 17–21%; hidden enemies there 0.05–0.09 a trip) and for the Airfield less than everyone —
his taste; with it (v251) 1.48. What was tried, each with the placebo (5 shuffles) and peeking put into 20 / 30 / 50% of
real players' telling choices (found at p < 0.01):

| | found at 20 / 30 / 50% | |
|---|---|---|
| v250 | 7 / 15 / 41% | placebo clean |
| **+ his taste in flags, from the choices that tell nothing (v251)** | **8 / 17 / 43%** | placebo clean; the Wake Island player 1.48 |
| the same taste from all his choices | 6 / 12 / 34% | the taste eats the peeking |
| only the enemies on the flag itself (not 20–60 m out) | 8 / 13 / 36% | 467 players ranked, not 737 |
| heard enemies counted as hidden | 5 / 11 / 33% | players do go by sound: heard is known |
| hidden enemies against the flag's usual number | 5 / 8 / 22% | and the placebo flags 2 |
| only the trips that got there (`--arrived`) | — | 261 ranked, nobody at q < 0.05 |

So a player who follows a radar in half of his telling choices is found 4 times in 10; one who does it in a third of
them, 1 in 6 — mostly when he has 60+ telling choices. Which enemies count as known could not be tried on that archive;
the analysis keeps it from v251 on (below).

**Which enemies count as known (v252: the archive of 2026-10-28, v251 — 3,449 rounds, every one with what his side
could know of each enemy).** Each rule with the placebo (5 shuffles), split halves and two kinds of peeking put into
real players' choices: **a radar** (in a share of his choices he goes for the flag with the fewest enemies of all near
it — known or not, as a radar shows them: the rule plays no part in it) and the v251 kind (the fewest enemies hidden by
v251's rule). Found at p < 0.01 when he does it in 20 / 30 / 50% of his choices:

| rule | telling | crowd's lean · spread | radar | v251 kind |
|---|---|---|---|---|
| v251 (seen 20 s back to 5 s after; own sightings, spots, UAV until he got there) | 39,401 | 0.25 · 0.030 | 3 / 4 / 10% | 9 / 16 / 42% |
| seen 10 s back | 46,051 | 0.23 · 0.021 | 4 / 5 / 14% | 7 / 15 / 35% |
| seen 40 s back | 29,840 | 0.26 · 0.025 | 3 / 3 / 9% | 6 / 14 / 34% |
| nothing after he set off | 45,154 | 0.24 · 0.022 | 4 / 6 / 14% | 8 / 15 / 36% |
| his own sightings not counted | 47,088 | 0.08 · 0.018 | 4 / 8 / 22% | 6 / 13 / 33% |
| … only in the first 10 s | 46,255 | 0.09 · 0.014 | 4 / 8 / 19% | 6 / 13 / 33% |
| spots · the UAV only to 5 s after he set off | 42,760 · 43,765 | 0.23–0.24 · 0.019–0.024 | 3–4 / 5 / 13% | 7–8 / 15–17 / 35–41% |
| heard counted as hidden | 44,741 | 0.25 · 0.033 | 2 / 4 / 11% | 6 / 14 / 34% |
| **when he set off: seen 10 s back, spotted / UAV then, killed one in the minute before, heard 10 s back (v252)** | **85,226** | **−0.01 · 0.001** | **11 / 19 / 42%** | 4 / 6 / 13% |
| the same, seen 20 s back | 70,677 | 0.01 · 0.003 | 7 / 15 / 33% | 3 / 6 / 15% |

By what was known when he set off the honest crowd shows **no lean and next to no spread**: the model foretells their
hidden enemies as they meet them — v251's lean of 0.25 a choice was its own slant (his own sightings at his flag as he
got there: by the crowd's choices, an enemy only he saw on the way drew them to the flag, +0.94 — that is, they were at
the flag he went to). And the crowd does not go by older sightings: an enemy seen 10–20, 20–40, 40–60 s before he set
off, heard further back, or spotted earlier, is gone for no less than one nobody saw (+0.09, +0.09, −0.03, −0.03, −0.04
against −0.05), so 10 s is enough. A radar is found 4–5 times as often; the v251 kind less (it avoids what v251 called
hidden — partly enemies at his flag he would have seen anyway). Placebo clean (0 flagged), split halves r 0.06, 1,172
players ranked (737 before; the first 15 s of each round left out, as above), nobody at q < 0.05 — on the site and on
each server.

**Another rule for "known" (v251).** The analysis keeps, for every enemy within a flag's zone + 60 m, when his side last
saw him before the trip and next after, when the player himself saw him on the way, his spots, the UAV ring, a man of
his side he killed, his shots within 150 / 300 m of the side. `choices.mjs --known seen=20,own=1,...` works the counts
out by another rule (keys and limits: server/INSTALL.md → Flag choices; `v251` starts from v251's) — with `--check` to
see whether it finds more with the placebo still clean — and `BF2R_CHOICES_KNOWN` in /etc/bf2replay.conf makes the
background run (and the page) use it. Rounds analysed before v251 are left out (they have no E).

**Not in the demo**: voice. A squad that talks ("A is empty") makes its leader look lucky too — check his squad
mates' *beyond* and watch the moments. A team mate as a spectator who tells him (ghosting) looks the same as a
wallhack here.

**Where**: (v250) the site's **Flag choices** page for admins (`#achoices=1`: the admins' pane, a player's page, the
Statistics page — [admin-guide.md](admin-guide.md#the-flag-choices-page-v250)): the ranking, a plot against the reading of
the game, each player's flags (v251) and most telling choices with links to the moment, the daily check; a server's admin sees his
servers only, each on its own. On the server: `node server/choices.mjs` (the table; `--nick NAME`; `--check`;
`--selftest`). The background analysis works it out at most once an hour (`analyze.mjs --choices` at once), each
server on its own too, and runs the check once a day.

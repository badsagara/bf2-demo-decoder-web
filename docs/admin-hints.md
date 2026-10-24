# Admin hints — what each one means and when it shows up (v227)

> **For admins only.** This file describes the hint rules and thresholds that are kept out of the public page. Don't
> share it with players. A copy of the project's `admin-hints-en.md`; back to [the docs](README.md) · [admin guide](admin-guide.md).

Hints point you to moments worth a closer look. **They are not proof.** Always watch the moment (and its side view ⟂) before you decide. Only logged-in admins see them.

## How to read them

**Strength** (shown next to each hint in the Admin tab):
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

**The thresholds are settable (v227)**: every figure in this file is our **recommended** threshold. The site's owner (or an account with the right *Hint thresholds: the site's*) can change any of them, or turn a whole hint off, for the whole site — the background analysis, the players' hint cards and the alerts then use the site's set (every round is gone over again in the background). Each admin can also keep **his own** set over the site's, for the rounds he opens. The editor: the **Thresholds** button in a round's Admin tab, **Hint thresholds** in the Log in dialog, or `/#thresholds`. It lists 148 thresholds of 50 hints (and an on/off tick for each of the 56 hints) with their recommended value; "advanced" adds the game's own figures (weapon rates, distances) and the measured shares. A hint here that says "≥ 6" means "≥ 6 with the recommended thresholds".

**Field of view (v219)**: a soldier is taken to see what a **16:9 screen** shows: **95° across** (47.5° to each side of where he looks) and 63° up and down. Since the 1.5 patch the game widens the picture with the screen up to 16:9: 4:3 79°, 16:10 89°, 16:9 95°; a wider screen is not wider (v234: 21:9 about 92°, 32:9 90° — the game keeps them near 16:9's width; written here before as 111° / 131°); the demo doesn't record the player's screen. The view is the **exact frame** of the screen, not width and height taken apart: less is seen up and down at the edges, and when he looks down the ground near him is seen wider. **Through the sights the view is narrower**, by weapon (from the game files): pistols, shotguns, SMGs 74–78° across, most rifles and machine guns 58–66°; scopes are round, as high as the screen: L85A1 23°, SVD and QBU-88 17°, M24, L96A1, M95 11.5° (v234: the weapon's zoom factor is the view's height in radians — v219–v233 took it as a share of 1.1 rad, 10% wider), plus 10° to each side because the view in the demo is sometimes off. The narrower view counts for the people he could miss (a victim looking through a scope doesn't see a man coming from the side), not for the man he is shooting at. This changes Wide view (its band is now 50–70°), Reaction and Pre-aim, who saw whom first, "Didn't see his killer" in the statistics, and the view drawn on the map. On 26 test rounds the number of hints did not change (361); "didn't see his killer" went from 22.2% to 21.3%, ambushes from 288 to 274. The server goes over every round again by itself (hint rules version 5, round summaries version 15). (v216–v218: 90°; before v216: 79°.)

(v235) **The fog.** Inside the view distance the map's fog hides a man before the game stops drawing him. The game's formula (each level's Sky.con): from 35 m on Karkand only 40% of a man shows, and **past 99.5 m nothing** — though the game draws to 140 m. Elsewhere: Mashtuur 155 m (drawn to 200), Songhua 204 (250), Jalalabad 207 (270), Highway Tampa 305 (450); the open maps keep most of their range. The sky has no fog, so a man **against the sky** still shows as a dark shape. "He sees him", who saw whom first, and every hint that asks whether he could see now count a man past that distance as hidden, unless there is sky behind him (only the terrain is checked; a house behind him is not).

(v235) **What a player's own game had** (OpenBattlefield2, a new implementation of the engine). A player's game does not get every enemy: the server picks the ones near him and in the direction he looks; walls do not matter. The demo records everyone. The radius is not known, so a wallhack can still show only the enemies the server sent. A player sees others about 100 ms behind his own clock, moved on along their path (up to 1.2 s). When a player's packets stop, the server goes on with his last action for up to 1 s, then stops him: in the demo a lagging man runs on for a second and then stands (Lag switch).

**Lying down (v210–v213)**: when a soldier is prone, the demo seems to record where his body points, not where he looks. On 2,779 rounds the aim error at the kill is larger when prone: more than 45° off in 6.9% of rifle kills, against 2.9% standing. Treat aim hints for a prone shooter with care.

---

## Visibility and walls

1. **No line of sight** (`wall`). A small-arms kill where the killer could not see the victim. We draw 9 lines from the killer's eyes to the victim's head, chest and hips, and none was clear at the kill or in the 0.6 s before it. Walls, hills and tree trunks block a line. The kill is checked again with the map's exact collision shapes, and the hint says how long the victim had been hidden (up to 5 s) and what was in the way.
   - Shows up from **2** such kills by one player in a round.
   - **Strong** when the exact shapes confirm it and the victim was hidden for 1 s or more.
   - *Example: he kills someone who has been standing behind a concrete building for 2 seconds.*

2. **Through thin walls** (`thru`). Same as above, but the thing in the way is something bullets can pass through: thin metal, wooden boards, cloth. **Minor** (information only), because real wallbangs exist.
   - *Example: a kill through a wooden fence or a tent.*

3. **Wall tracking** (`track`). His aim follows an enemy hidden behind walls or hills. Checked every 0.2 s; all of these must be true:
   - the crosshair stays within 3° sideways and 6° up or down of the hidden enemy's head or chest;
   - the enemy is 8–150 m away and inside the fog distance;
   - it is the same enemy for at least 2 s in a row;
   - the enemy moves across the view (his direction changes by at least 10°) and the aim moves with him.
   - *Example: an enemy runs behind a row of houses, and the crosshair slides along the wall, staying on him the whole way.*

4. **Fired at a wall** (`wallfire`). He holds the trigger while aiming at a hidden enemy (as in Wall tracking). Conditions:
   - no visible enemy or vehicle within 8 m of where he aims;
   - he has a weapon in his hands;
   - he had not seen that enemy in the 3 s before.
   - Shows up from one burst of 1.4 s or more, or **6** bursts of 0.6 s or more, in a round. (v213: it was 4. On the infantry-only Karkand server that gave 1.2 hints a round, one for every hot firefight. With 6, the two players who stood out remain, each in 6 of his rounds.)
   - *Example: a long burst into a wall exactly where an unseen enemy is walking behind it.*

5. **Through smoke** (`smoke`). A small-arms kill where the line to the victim went through thick smoke during the second before. From **2** in a round.
   - *Example: two kills straight through a smoke grenade cloud.*

6. **Beyond fog** (`fog`). A kill farther away than the map lets you see, plus 10 m. The view distance comes from the map's own files: Karkand 140 m, Blue Pearl 90, Sharqi 195, Mashtuur 200, Songhua 250, Jalalabad 270, Fushe Pass and Gulf of Oman 400, Wake and Kubra 600, and so on. From **2** in a round. (v221) Kills where the game named the wrong weapon don't count either: a hand-held weapon while the killer sat in a vehicle, or a vehicle's weapon after he was already on foot — that was not a shot from where he was. A kill the game named as a hand-held weapon, though his own AT mine, claymore or C4 went off by the victim, is now recorded as the charge. (v235) Also a kill inside the view distance but past where the map's fog leaves nothing of a man (Karkand 99.5 m, Mashtuur 155, Songhua 204, Jalalabad 207, Highway Tampa 305 …), with no sky behind the victim as the killer saw him. The two kinds count together towards the 2.
   - (v213) Not only small arms: also kills from vehicles, emplacements, AT launchers, grenades and grenade launchers.
   - Not counted: mines, claymores, C4 (it goes off where it lies, or on what it is stuck to), artillery (the commander calls it), AA rockets (they lock on by themselves), guided missiles (TV or laser: the missile's camera does the looking), and a victim who was in an aircraft in the last 5 s (he dies where it comes down, far from where it was hit).
   - From an aircraft, the distance is measured in 3 dimensions.
   - Only on maps whose view distance we know (not on custom maps).
   - *Example: he kills someone standing past the fog line, where the game doesn't draw him.*

7. **Wide view** (`fov`). A weak sign. An enemy in the open appears just outside the edge of the screen: 50–70° from where the player looks, just past the edge of a 16:9 screen (v219; v216–v218 47.5–67.5°, before that 42–62°). (v234) **A 21:9 or 32:9 monitor does not explain it**: the game keeps such screens near 16:9's width (about 92° / 90°; v219–v233 said a 21:9 player gets this hint honestly) — still a weak sign, since sound, the minimap and team calls turn honest players too; check his other rounds. Within 1.2 s the player turns onto him (to within 15°).
   - The enemy is 8–150 m away.
   - Nothing else could have told him: the enemy hadn't fired for 1.5 s, wasn't spotted for 6 s, and hadn't hit the player in the last 2 s.
   - Shows up from **5** such cases and chance < 1 in 1,000.
   - *Example: five times in a round, an enemy walks in quietly from the side, off-screen, and the player turns straight to him with no sound or spot to warn him.*

8. **Spots unseen** (`blindspot`). He spots enemies that nobody on his team could see at that moment. Shows up from **12** such spots that are also **75%** or more of all his spots.
   - *Example: he spots 20 enemies in a round, and 16 of them were behind walls where no teammate could see them.*

9. **Glitch spot** (`glitch`). He stood for 20 s or more where no other player stood in any round of that map, while 3 or more other players stood in the same spot 5–40 m higher or lower. In other words: inside the walls, under the floor, or on a roof you can't reach.
   - Only on maps with 30+ analysed rounds.
   - "On a roof" or "on the ground under someone" is information only.
   - **Strong**.
   - *Example: he spends a minute under the floor of a building, 6 m below where everyone else walks.*

## Aim and shooting

See "Lying down" above: for a prone shooter these hints can be wrong either way.

10. **Aim snaps** (`snap`). In one step (0.1 s) the crosshair jumps from 30° or more away from the victim to within 5° of him. The victim is 5 m or more away, and it happens in the 1.5 s before the kill. From **3** in a round.
    - *Example: the view flicks 90° onto an enemy in a tenth of a second, three times in a round.*

11. **Reaction** (`react`). Kills where he first saw the victim 0.25 s or less before the kill. Shows up from **4** such kills out of at least 8 measured, and chance < 1 in 1,000.
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

15. **Target switch** (`switch`). Two kills of two different enemies 0.8 s or less apart, in directions at least 40° apart.
    - *Example: he kills one enemy in front, and half a second later another one 60° to his left.*

16. **Pre-aim** (`preaim`). The victim steps out of cover after being hidden for 1 s or more, and the crosshair is already on him. From **5** such kills and chance < 1 in 1,000. (v214) Sniper rifle kills are compared with other snipers (they hold an angle: 20–22% against 7–8% for the rest), not with everyone.
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
    - *Example: one moment he's at the flag, a tenth of a second later he's 30 m away.*

22. **Through walls** (`clip`). His step of 0.4–4 m passes through solid shapes at least 0.15 m thick at knee, waist and chest height, while both ends of the step are in the open. Shows up from **15** times in a round at **10** or more places (at least 5 m apart). (v214) Not on an aircraft carrier (within 160 m of a Carrier flag): 4 of the archive's 10 hints started on Wake's carrier. **Strong**.
    - *Example: he walks straight through building walls all over town.*

23. **Floating** (`fly`). His feet stay 5 m or more above whatever is under him for 8 s or more in a row. He moves sideways at 2 m/s or more and doesn't come down. No vehicle within 12 m, and he didn't leave one in the last 10 s. **Strong**.
    - *Example: he walks through the air over a street at rooftop height.*

24. **Under the map** (`under`). Alive on foot, 1.5 m or more below the ground for 2 s or more. **Strong**.
    - *Example: he moves under the terrain and shoots up at players walking above.*

25. **Parachute** (`chute`). Under a parachute, faster than 15 m/s sideways, or rising at 1 m/s or more for a second. **Strong**.
    - *Example: a parachute that flies across the map like a plane, or goes up instead of down.*

26. **Vehicle speed** (`vspeed`). A vehicle goes faster than 1.35 × the top speed of its type for 3 s. The top speeds come from 1.6 million measurements. Not counted with an explosion within 25 m or a drop of more than 15 m, or (v213) on two roads of Kubra Dam where every BTR-90 does about 25 m/s. **Strong**.
    - *Example: a jeep doing twice its normal top speed on flat ground.*

27. **Outside the map** (`outside`). Alive outside the battlefield border for 25 s or more in a row. **Minor**.
    - *Example: he sits past the border, where the game tells you to go back.*

28. **Idle** (`idle`). Alive on foot, hasn't moved 1 m or turned 2° for 240 s (4 minutes) or more. This is usually AFK. A commander sitting at his screen looks the same. **Minor**.
    - *Example: he left the game running and walked away.*

## Spawning

29. **Spawn** (`spawn`). He appeared more than 25 m from every spawn point on the map, from every teammate, and from every vehicle. (v213) Not counted at spawn points the map layouts are missing: 4 on Mashtuur City, one each on Operation Clean Sweep and Dragon Valley.
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

What the demo can't show: a recoil script or no recoil. The view in the demo doesn't kick with recoil: over 150 long bursts the view's pitch changed by 0° on average. Firing a bolt-action rifle the instant it is ready also can't be told apart from a man who keeps pressing the trigger (Clicker catches the even rhythm of a script).

## More cheat signs (v214)

49. **Lag switch** (`lagsw`). Twice or more in a round, his records stand still for 0.5–3 s while he was running (2.5 m/s or more) and the others' records go on. Then he is suddenly 4 m or more further on, with a kill of his during the gap or within 1.5 s after it. His ping is under 250 ms.
50. **One-hit kills** (`onehit`). Body kills with a rifle, SMG or pistol from 15 m or more, of a man who had 95% health or more 0.2 s before. By hand this happens in 1.4% of such kills (health is recorded 10 times a second). Shows up from 4 such kills and chance < 1 in 10,000. A damage hack.
51. **Silent aim** (`silent`). Kills from 10 m or more, standing or crouching, while his view was 30° or more off the victim at the kill and 0.1 s before. By hand 5.5% (the view in the data isn't always where the bullet went). Shows up from 5 such kills and chance < 1 in 10,000.
52. **Aim lock** (`vlock`). 10 or more kills at 15–150 m where his view's height on the victim's chest is right to 0.3° in the middle and 0.8° at 9 kills in 10 (by hand: 2° or more at 9 in 10). An aimbot set on the body rather than the head, which Headshots doesn't see.
53. **Spin** (`spin`). His view turned 60° or more in 0.1 s, 28 or more times within 3 s (by hand: up to 21). A spinbot, or his view gone wrong in the data.
56. **Sideways sprint** (`sidesprint`, v235). 2 s or more on end at 4.3 m/s or more (his own velocity), on flat ground, moving 60° or more off where he looks. The game sprints only forward: it needs "forward" and drops the sideways part, so sideways or backwards nobody goes faster than 3.9 m/s. By hand in 43 demos: 1.0 s at the most, in a sharp turn (the movement follows the view a little late). Not near vehicles or explosions. A speed hack, or his view not where the demo has it. Lag can cause it, so a high ping is shown.
57. **Speed in the air** (`airspeed`, v235). Twice or more in a round, a jump on flat ground (0.6–1.2 s in the air) in which he got 4 m/s or more faster. The game keeps a jump's speed: air control adds at most 2 m/s, and only while he is slow. By hand in ~4000 jumps: +2.6 m/s at the 99.9th percentile, +3.6 once. Not near vehicles or explosions. A speed hack, or something pushed him.
58. **Shot in a jump** (`jumpfire`, v235). Twice or more in a round, a small-arms kill 0.15 s (+ the distance at 300 m/s, for a bullet fired before the jump) to 0.55 s after he took off. The game lets nobody fire for 0.7 s after a jump (fire-delay-after-jump in its data). By hand in ~1700 kills: none between 0.1 and 0.6 s; 28 came 0.6–1.2 s after a jump. A no-delay hack, or something the demo shows as a jump that was not one (a blast that lifted him is left out).

## Server rules (minor)

40. **Team kills** (`tk`). Every kill of a teammate, including from vehicles.
    - *Example: he runs over a teammate with a jeep.*

41. **Claymore at a flag** (`claycap`). A kill by a claymore lying inside a flag's capture zone (main bases not counted).
    - *Example: a claymore placed right at the flag pole kills a player capturing it.*

42. **Claymore kills** (`clay`). Every claymore kill. It's a list to browse, not a hint, so it isn't counted in "All".

54. **Side switch** (`teamsw`). He went over mid-round to the side that was 50+ tickets ahead and already had as many men or more. Other switches are mostly the server's balancing: 43 in 17 rounds.

55. **TK + revive** (`tkrev`). 3 or more times he killed a team mate and revived him within 30 s: points from the defibrillator.

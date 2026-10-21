// BF2 Round Replay v210 - the admins' part of the page (server/splitpage.mjs wrote it from src/index.html: do not edit here).
// Handed over by admin.mjs only to a logged-in admin; the page runs it with its own names in sight (adminEval).
const ADM_V = 'v210';
// ---- part 1 (page line 6346) ----
// ---------- for admins ----------
// Moments an admin may want to look at - hints, not proof (the panel says so; shown to everyone, Sagara's choice, v106).
// Small-arms kills of a soldier on foot (knife and defibrillator left out) for the first three:
// - no line of sight: none of the 9 lines from the killer's eye to the victim's head, chest and hips clear (the map's
//   walls and hills, tree trunks: bodyLines) at the kill and over the 0.6 s before it; how long the victim had been out
//   of his sight (up to 5 s). The grid's candidates are checked again with the exact collision shapes (v111: geoData,
//   bodyClearExact), and what stood in the way is named. 6 Karkand rounds: the grid alone 22 (5 / 4 / 3 on =FL= 19:52 /
//   20:37 / 21:23 of ~140 small-arms kills a round), exact 2.
// - aim snap: in one step of the timeline (0.1 s) his view swung from 30 deg or more off the line to the victim to within
//   5 deg of it, 5 m or more away, in the 1.5 s before the kill. The same rounds: 0-2 a round (the fastest 75 and 119 deg);
//   the bots of test 13 none at range. (v182, todo 146: 1619 rounds of 8 servers, 116 thousand small-arms kills - one such
//   snap comes with 1.8% of kills, in 30% of rounds, and nobody has more of them over all his rounds than chance gives;
//   so only a soldier with SNAP_N or more in one round: 3 soldier-rounds of the 1619, two of them with the most unlikely
//   headshots too)
// - headshots: 6 or more kills with the hit part known (sniper rifles left out), and so many of them headshots that the
//   rate of everyone else in this round (with a 20% prior worth 10 kills) would give that many less than once in 100.
//   None in the three rounds (the highest 5 of 8, 11 of 27). (v182, todo 146: once in 100 named someone in 6% of 1619
//   rounds - with ~30 soldiers a round, chance alone does that; HS_P, once in 10,000: 14 soldier-rounds, 4 of them one
//   soldier's with 85% of his kills to the head)
// - team kills: every kill of a team mate, in a vehicle too (run over, a cannon, a charge).
// - speed (v120, todo 111, Sagara's speedhack idea): a soldier on foot faster than the game lets one run (speedRuns).
// v121 (Sagara: ways to catch the hacks of the cheat forums - nametags / ESP / minimap through walls, aimbots, unlimited
// ammo, fast fire): what they leave in a demo (cheatHints, wallTracks):
// - melee reach: a knife or defibrillator kill from further than it reaches (the game: knife 40 m/s x 0.05 s = 2 m,
//   defibrillator 80 x 0.035 = 2.8 m) + 2.5 m for the 10-a-second positions and the lag: the nearest the two were in the
//   0.6 s before. 6 rounds: 7 knife kills, the nearest 0.5-2.0 m.
// - fire rate: launches of one shooter closer together than the weapon reloads (grenade 0.7 s, SRAW 4, Eryx 4.2, an
//   APC's missile 10, a TOW / HJ-8 emplacement 5, claymore 0.6: the 6 rounds' fastest are 1.2 / 5.0 / 5.16 / 14.3 / 6.2
//   / 0.83 s), and kills by one shot weapon closer together than it fires (tank cannon 30 a minute: 1.5 s; bolt-action
//   rifles L96A1 / M24 / M95: 1 s, the rounds' fastest 3.6; pump shotguns 60 a minute: 0.6 s) - kills within 0.3 s of
//   each other are one shot (a shell, a shotgun blast).
// - ammo: more launched in one life (from a spawn to the next) than twice what the kit holds, with no ammo bag dropped
//   within 15 m of him in that life (v170: and the commander's supply crates - crateVisits; the rounds' most without a
//   bag: grenades 7, SRAW 6, Eryx 7, claymores 4, C4 5, AT mines 9).
// - through smoke: a small-arms kill whose line ran through a dense smoke cloud (smokeBlocks) for the 1 s before it.
// - beyond the fog: a small-arms kill further than the map's view distance (nobody can see that far).
// - wall tracking: his view following an enemy hidden behind walls or hills (wallTracks).
// v122 (the rest of todo 136): reaction time, stamina, teleport, spawn, damage, idle, kill farming, vehicle speed
// (moreHints), through walls and floating (geoScan).
const ADM_KINDS = [['wall', 'No line of sight'], ['thru', 'Through thin walls'], ['track', 'Wall tracking'], ['wallfire', 'Fired at a wall'], ['fov', 'Wide view'], ['snap', 'Aim snaps'], ['react', 'Reaction'], ['hs', 'Headshots'], ['smoke', 'Through smoke'], ['fog', 'Beyond fog'], ['speed', 'Speed'], ['stam', 'Stamina'], ['tele', 'Teleport'], ['clip', 'Through walls'], ['fly', 'Floating'], ['chute', 'Parachute'], ['spawn', 'Spawn'], ['respawn', 'Early spawn'], ['vspeed', 'Vehicle speed'], ['dmg', 'Damage'], ['reach', 'Melee reach'], ['rate', 'Fire rate'], ['ammo', 'Ammo'], ['farm', 'Kill farming'], ['trigger', 'Triggerbot'], ['smooth', 'Smooth aim'], ['switch', 'Target switch'], ['preaim', 'Pre-aim'], ['spread', 'No spread'], ['blindspot', 'Spots unseen'], ['under', 'Under the map'], ['glitch', 'Glitch spot'], ['guided', 'Guided missiles'], ['arty', 'Artillery'], ['fastcap', 'Fast flag'], ['spotspam', 'Spot spam'], ['idle', 'Idle'], ['tk', 'Team kills'], ['claycap', 'Claymore at a flag'], ['clay', 'Claymore kills'], ['nofire', 'No trigger'], ['outside', 'Outside the map']];
const MELEE_REACH = { 5406: ['knife', 2.0], 5386: ['defibrillator', 2.8] }, MELEE_SLACK = 2.5;
const LAUNCH_MIN = { Grenade: 0.7, SRAW: 4.0, Eryx: 4.2, Claymore: 0.6, 'LAV-25 TOW': 10, 'BTR-90 missile': 10, 'WZ551 missile': 10, TOW: 5, 'HJ-8': 5 };
const SHOT_MIN = { 5038: 1.5, 5222: 1.5, 5073: 1.5, 5400: 1.0, 5478: 1.0, 5491: 1.0, 5483: 0.6, 5380: 0.6 };
const KIT_HOLDS = { Grenade: 4, SRAW: 6, Eryx: 6, Claymore: 2, C4: 5, 'AT mine': 5 }, AMMO_X = 2;
// Kit pick-ups (v123, Sagara: "is a kit picked up nearby counted?"): a dead soldier's kit drops where he fell (not when
// he is revived) and anyone can take it - a full one, loaded. The demo doesn't say so (only the kit each man spawned
// with). 6 rounds: 69 of 1199 launches of kit-only items (SRAW / Eryx, claymores, C4, AT mines) came from a kit the man
// had not spawned with; in 28 of 33 such lives he had walked within 2 m of where a soldier carrying it died, 1-63 s
// after (a few 220-250 s: kits lie there for minutes). Which kits carry what: Kits/*/*.con (AT: no grenades). So a
// possible pick-up of an item is the moment a soldier on foot comes within PICK_R of where one carrying it died (his
// spawn kit's items and what he launched in that life) in the PICK_T s before; Ammo then allows one more kit for each
// such place, and Fire rate leaves out two SRAW / Eryx launches with one between them (a loaded launcher: no reload;
// grenades and claymores are held up by the throw itself, not by a reload).
const KIT_CARRY = { Grenade: ['Assault', 'Engineer', 'Medic', 'Sniper', 'Special ops', 'Support'], SRAW: ['Anti-tank'], Eryx: ['Anti-tank'], Claymore: ['Sniper'], C4: ['Special ops'], 'AT mine': ['Engineer'] }, PICK_R = 2.5, PICK_T = 300;
// where kits lay: { t (he died), i, items (Set), pts (where he fell, and his body 1 / 3 / 6 s on) }
function kitSpots(R) {
  if (R._kitSpots) return R._kitSpots;
  const pid = id => R.pidx.get(id), out = [], launched = new Map();
  for (const e of R.events) if (e.type === 'throw' && e.by && KIT_CARRY[e.kind]) { const i = pid(e.by); if (i === undefined) continue; if (!launched.has(i)) launched.set(i, []); launched.get(i).push([e.t, e.kind]); }
  for (const e of R.events) {
    const who = e.type === 'kill' && !e.revived ? e.victim : e.type === 'death' ? e.player : null; if (who == null) continue;
    const i = pid(who); if (i === undefined || R.players[i].vehicle || out.some(o => o.i === i && Math.abs(o.t - e.t) < 2)) continue;
    const q = playerAt(i, e.t - 0.1); if (!q.alive || q.veh || !Number.isFinite(q.x)) continue;
    const p = R.players[i], kit = kitNow(p, e.t); let s0 = 0; for (const [ts] of p.kits || []) { if (ts > e.t + 0.05) break; s0 = ts; }
    const items = new Set(Object.keys(KIT_CARRY).filter(k => KIT_CARRY[k].includes(kit)));
    for (const [lt, k] of launched.get(i) || []) if (lt >= s0 && lt <= e.t) items.add(k);
    if (!items.size) continue;
    const pts = [[q.x, q.y]]; for (const dt of [1, 3, 6]) { const b = playerAt(i, e.t + dt); if (Number.isFinite(b.x)) pts.push([b.x, b.y]); }
    out.push({ t: e.t, i, items, pts });
  }
  return (R._kitSpots = out);
}
// Ammo from others (v124): an ammo bag fills him up when he comes within 1 m of where it lies (the game's trigger radius;
// BAG_R with the 10-a-second positions) - from when it lay still until its object id went to a new one, BAG_TTL s at
// most (rounds decoded before v124 only have where it was thrown: 15 m round that, as before); a support holding his
// ammo bag (kit item, slot 5) fills up everyone within 4 m (ammo.abilityRadius) - each time one comes that near counts.
// (v170: the commander's supply crates are counted too - crateVisits)
// ---- part 2 (page line 6426) ----
function ammoBags(R, i, t0, t1) {
  let n = 0;
  for (const b of R.events) {
    if (b.type !== 'bag' || b.kind !== 'ammo' || b.t > t1) continue;
    const old = b.tl === undefined, a = Math.max(t0, old ? b.t : b.tl), e = Math.min(t1, b.gone ?? Infinity, (old ? b.t : b.tl) + BAG_TTL), r = old ? 15 : BAG_R; if (a > e) continue;
    for (let tt = a; tt <= e; tt += 0.2) { const q = playerAt(i, tt); if (q.alive && !q.veh && Number.isFinite(q.x) && Math.hypot(q.x - b.x, q.y - b.y) < r) { n++; break; } }
  }
  return n;
}
// ---- part 3 (page line 6473) ----
const slotAt = (p, tt) => { let v = null; for (const [ts, s] of p.items || []) { if (ts > tt) break; v = s; } return v; };
// (v170) the commander's supply crates (raw.crates: where each landed, until it broke or emptied): every 20 s soldier
// i spent within CRATE_R of one (the crate's radius 5 m, Weapons/Handheld/supply_crate: it refills ammo and heals,
// 500 points shared) between t0 and t1 count as a full load
const CRATE_R = 6;
function crateVisits(R, i, t0, t1) {
  let n = 0;
  for (const c of R.raw?.crates || []) {
    const a = Math.max(t0, c.t1), b = Math.min(t1, c.until); if (a > b) continue;
    let last = -1e9;
    for (let tt = a; tt <= b; tt += 0.5) { const q = playerAt(i, tt); if (!q.alive || !Number.isFinite(q.x)) continue; if (Math.hypot(q.x - c.x, q.y - c.y) <= CRATE_R && tt - last >= 20) { n++; last = tt; } }
  }
  return n;
}
function supportNear(R, i, t0, t1) {
  const sup = R.players.map((p, j) => j).filter(j => j !== i && !R.players[j].vehicle && (R.players[j].kits || []).some(k => k[1] === 'Support'));
  let n = 0, last = -Infinity;
  for (let tt = t0; tt <= t1; tt += 0.5) {
    const q = playerAt(i, tt); if (!q.alive || q.veh || !Number.isFinite(q.x)) continue;
    const near = sup.some(j => { const p = R.players[j]; if (kitNow(p, tt) !== 'Support' || slotAt(p, tt) !== 5) return false; const o = playerAt(j, tt); return o.alive && !o.veh && Math.hypot(o.x - q.x, o.y - q.y) < SUP_R; });
    if (near) { if (tt - last > 10) n++; last = tt; }
  }
  return n;
}
// how many places soldier i may have picked up a kit carrying item between t0 and t1
function kitPicks(R, i, item, t0, t1) {
  // (v133) the kits he took from the ground, from the demo (HandlePickup of a kit HandleDrop left there)
  if (R.meta.exactEvents) return (R.players[i].pk || []).filter(([tt, k]) => tt >= t0 - 0.5 && tt <= t1 && KIT_CARRY[item]?.includes(k)).length;
  let n = 0;
  for (const s of kitSpots(R)) {
    if (!s.items.has(item) || s.t > t1 || s.t + PICK_T < t0) continue;
    for (let tt = Math.max(t0, s.t + 0.2), b = Math.min(t1, s.t + PICK_T); tt <= b; tt += 0.2) {
      const q = playerAt(i, tt); if (!q.alive || q.veh || !Number.isFinite(q.x)) continue;
      if (s.pts.some(([x, y]) => Math.hypot(q.x - x, q.y - y) < PICK_R)) { n++; break; }
    }
  }
  return n;
}
function cheatHints(R) {
  const out = [], pid = id => R.pidx.get(id), ev = R.events, fog = fogRange(), DEG = Math.PI / 180;
  // melee reach
  for (const e of ev) {
    if (e.type !== 'kill' || !MELEE_REACH[e.wid] || e.killer === e.victim) continue;
    const ki = pid(e.killer), vi = pid(e.victim); if (ki === undefined || vi === undefined) continue;
    let near = Infinity; for (let k = 0; k <= 6; k++) { const tt = e.t - k * 0.1, a = playerAt(ki, tt), b = playerAt(vi, tt); if (!Number.isFinite(a.x) || !Number.isFinite(b.x)) continue; near = Math.min(near, Math.hypot(a.x - b.x, a.y - b.y, (a.h ?? 0) - (b.h ?? 0))); }
    const [nm, reach] = MELEE_REACH[e.wid];
    if (near < Infinity && near > reach + MELEE_SLACK) out.push({ t: e.t, kind: 'reach', adm: true, actor: e.killer, kill: e, what: nm, d: near, reach, x: e.x, y: e.y });
  }
  // fire rate: launches, and kills by one-shot weapons
  const lastL = new Map(), lastK = new Map();
  for (const e of ev) {
    if (e.type === 'throw' && e.by) {
      const nm = e.name || e.kind, lim = LAUNCH_MIN[nm]; if (lim == null) continue;
      const k = nm + '|' + e.by, p = lastL.get(k); lastL.set(k, e.t);
      if (p != null && e.t - p < lim && e.t - p > 0.02 && !(lim >= 2 && KIT_CARRY[e.kind] && pid(e.by) !== undefined && kitPicks(R, pid(e.by), e.kind, p - 0.5, e.t))) { const q = e.path?.[0]; out.push({ t: e.t, kind: 'rate', adm: true, actor: e.by, what: nm, gap: e.t - p, lim, launch: true, x: q ? q[1] : null, y: q ? q[2] : null }); }
    } else if (e.type === 'kill' && SHOT_MIN[e.wid] && e.killer !== e.victim) {
      const k = e.wid + '|' + e.killer, p = lastK.get(k); lastK.set(k, e.t);
      if (p != null && e.t - p > 0.3 && e.t - p < SHOT_MIN[e.wid]) out.push({ t: e.t, kind: 'rate', adm: true, actor: e.killer, kill: e, what: e.weapon, gap: e.t - p, lim: SHOT_MIN[e.wid], x: e.x, y: e.y });
    }
  }
  // ammo: launches in one life against what he had: his kit, the kits he may have picked up, the ammo bags he walked
  // over and the supports with their bag out he came near (v124: ammoBags, supportNear - each counted as a full kit)
  const lives = new Map();
  const lifeOf = (i, tt) => { let s = 0; for (const [ts] of R.players[i].kits || []) { if (ts > tt + 0.05) break; s = ts; } return s; };
  for (const e of ev) {
    if (e.type !== 'throw' || !e.by || KIT_HOLDS[e.kind] == null) continue; const i = pid(e.by); if (i === undefined) continue;
    const k = e.by + '|' + lifeOf(i, e.t) + '|' + e.kind; let L = lives.get(k); if (!L) lives.set(k, L = { i, by: e.by, kind: e.kind, t0: lifeOf(i, e.t), n: 0, first: e.t, last: e.t }); L.n++; L.last = e.t;
  }
  for (const L of lives.values()) {
    if (L.n <= KIT_HOLDS[L.kind] * AMMO_X) continue;
    // (kits: his own if it carries it, and one for each place he may have picked one up)
    const own = KIT_CARRY[L.kind].includes(kitNow(R.players[L.i], L.t0)) ? 1 : 0, picks = kitPicks(R, L.i, L.kind, L.t0, L.last);
    const bagsN = ammoBags(R, L.i, L.t0, L.last), sup = supportNear(R, L.i, L.t0, L.last), crates = crateVisits(R, L.i, L.t0, L.last), kits = Math.max(1, own + picks + bagsN + sup + crates);
    if (L.n <= KIT_HOLDS[L.kind] * AMMO_X * kits) continue;
    const q = playerAt(L.i, L.last); out.push({ t: L.first, kind: 'ammo', adm: true, actor: L.by, what: L.kind, n: L.n, holds: KIT_HOLDS[L.kind], kits, picks, bags: bagsN, sup, crates, span: L.last - L.first, x: q.x, y: q.y });
  }
  // through smoke / beyond the fog: small-arms kills
  for (const e of ev) {
    if (e.type !== 'kill' || e.killer === e.victim) continue;
    const ki = pid(e.killer), vi = pid(e.victim); if (ki === undefined || vi === undefined || R.players[ki].vehicle) continue;
    const q = playerAt(ki, e.t - 0.05), o = playerAt(vi, e.t - 0.05); if (q.veh || !Number.isFinite(q.x) || !Number.isFinite(o.x) || killCause(e, false) !== 'small' || teamOf(ki, e.t) === teamOf(vi, e.t)) continue;
    const d = Math.hypot(o.x - q.x, o.y - q.y);
    if (d > fog + 10) out.push({ t: e.t, kind: 'fog', adm: true, actor: e.killer, kill: e, d, fog, x: e.x, y: e.y });
    let smoky = true; for (let k = 0; k <= 5 && smoky; k++) { const tt = e.t - 0.05 - k * 0.2, a = playerAt(ki, tt), b = playerAt(vi, tt); if (!a.alive || !b.alive || !smokeBlocks(a.x, a.y, b.x, b.y, tt)) smoky = false; }
    if (smoky) out.push({ t: e.t, kind: 'smoke', adm: true, actor: e.killer, kill: e, d, x: e.x, y: e.y });
  }
  return out;
}
// Wall tracking: every 0.2 s, each soldier on foot whose view is known, against each enemy on foot 8-150 m away (and
// inside the fog): his view within TRACK_DEG across and TRACK_VDEG up / down of the enemy while the enemy is hidden from
// him (the lines to the enemy's head and chest both blocked by walls or hills - the sight grid), the same enemy for
// TRACK_T s or more on end, and the enemy moving across his view meanwhile (the bearing to him turning TRACK_TURN or more,
// and his view turning with it): following somebody he can't see. Worked out in the background (wallTracks; a few
// seconds a round), then added to the admin hints.
// (v153, Sagara's todo 159: "стріляв у стіну") Fired at a wall: in the same pass, his trigger held (the first fire button)
// with his view on the same hidden enemy (as above: within TRACK_DEG / TRACK_VDEG, 8-150 m, behind walls or hills), no
// enemy or vehicle he can see within WF_NEAR of his crosshair, a gun in his hands, and that enemy not seen by him (in his
// 90° and in the open) in the WF_PRE s before: shooting at somebody behind a wall he hadn't seen go there. A hint for
// one such burst of WF_T s or more, or for WF_N of WF_T0 s or more in a round (then one, with the longest). The 9 rounds
// (59 bursts of 0.4 s or more at a hidden enemy, sampled every 0.2 s): the longest 1.0 s (3), at most 2 of 0.6 s+ by one
// soldier - no hint.
const WF_T = 1.4, WF_T0 = 0.6, WF_N = 4, WF_PRE = 3, WF_NEAR = 8, WF_GUN = w => !!w && killCause({ weapon: w.name }, false) === 'small' && !/knife|defib|shock|paddle|wrench|repair|bag|binocular|designat|zipline|grappl|tear ?gas|flash|smoke|mine|C4|claymore|^tool$/i.test(w.name || '');
// (v157, Sagara's todo 140 n: "ULTRAWIDE FOV") Wide view - a weak sign: the game shows a soldier ~79° across (FOV_HALF
// each side). Each time an enemy he can see in the open comes into the band just outside that (FOV_IN-FOV_OUT° off where
// he looks), 8-FOV_FAR m away, and he had not had him within his view for FOV_FRESH s, has no other cue for him (the enemy
// fired in the 1.5 s before, his side spotted him in the 6 s before, or he himself was hit in the 2 s before: none) -
// a chance; he takes it if he turns to put him within FOV_HIT° of his aim inside FOV_REACT s. A hint when he took
// FOV_N or more and the odds of so many at the rate of the round's others are under FOV_P (sound, the minimap or a team
// mate's call turn honest players too: the others' rate is the yardstick). The 9 rounds: 555 chances, 39% taken (by the
// round's others 22-42%); the lowest odds 0.019 (7 of 10), no hint - one would take ~7 of 7 or 9 of 11 such turns.
const FOV_HALF = 39.5, FOV_IN = 42, FOV_OUT = 62, FOV_FRESH = 1.5, FOV_HIT = 15, FOV_REACT = 1.2, FOV_FAR = 150, FOV_N = 5, FOV_P = 0.001;
// (the upper tail of a binomial, in logs: n can run to hundreds here)
const binTailLog = (k, n, p) => { if (k <= 0) return 1; if (p <= 0) return 0; if (p >= 1) return 1; let lc = 0, s = 0; const lp = Math.log(p), lq = Math.log(1 - p); for (let j = 1; j <= n; j++) { lc += Math.log((n - j + 1) / j); if (j >= k) s += Math.exp(lc + j * lp + (n - j) * lq); } return Math.min(1, s); };
const TRACK_STEP = 0.2, TRACK_DEG = 3, TRACK_VDEG = 6, TRACK_T = 2, TRACK_TURN = 10;
function wallTracks(R, done) {
  const D = losData(); if (!D) { done([]); return; }
  const G = geoData(true);   // (v180: loaded before this runs - adminHints waits for it)
  const DEG = Math.PI / 180, fog = Math.min(150, fogRange()), out = [], sol = R.players.map((p, i) => p.vehicle ? -1 : i).filter(i => i >= 0);
  // (fired at a wall) each soldier's trigger presses, by start; a pointer each (the steps go forward in time)
  const trig = new Map(), tp = new Map(); for (const i of sol) { const F = (R.players[i].fire || []).filter(f => f[2] === 0).sort((a, b) => a[0] - b[0]); if (F.length) { trig.set(i, F); tp.set(i, 0); } }
  const held = (i, tt) => { const F = trig.get(i); if (!F) return false; let k = tp.get(i); while (k < F.length && F[k][1] < tt) k++; tp.set(i, k); return k < F.length && F[k][0] <= tt; };
  const seesAt = (i, j, tt, coneDeg) => {   // (j in i's view - within coneDeg of where he looks - and in the open)
    const a = playerAt(i, tt), b = playerAt(j, tt); if (!a.alive || !b.alive || a.veh || b.veh || !Number.isFinite(a.x) || !Number.isFinite(b.x) || a.h == null || b.h == null) return false;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy); if (d > fog) return false;
    if (a.yaw != null && angOff(Math.atan2(dx, dy), a.yaw) / DEG > coneDeg) return false;
    const eye = a.h + EYE_H[stanceNow(R.players[i], tt) ?? 0], st = stanceNow(R.players[j], tt) ?? 0;
    return !losBlocked(D, a.x, a.y, eye, b.x, b.y, b.h + AIM_H[st][0], tt) || !losBlocked(D, a.x, a.y, eye, b.x, b.y, b.h + AIM_H[st][1], tt);
  };
  const vehs = R.players.map((p, v) => p.vehicle ? v : -1).filter(v => v >= 0);
  const vehNear = (i, q, eye, tt) => vehs.some(v => {   // (a vehicle in the open near his crosshair: he may be shooting at it)
    const o = playerAt(v, tt); if (!o.alive || !Number.isFinite(o.x) || o.h == null) return false;
    const dx = o.x - q.x, dy = o.y - q.y, d = Math.hypot(dx, dy); if (d < 2 || d > fog || angOff(Math.atan2(dx, dy), q.yaw) / DEG > WF_NEAR) return false;
    return !losBlocked(D, q.x, q.y, eye, o.x, o.y, o.h + 1.5, tt);
  });
  const fires = new Map(), wfAll = R._wfAll = [];   // viewer -> { j, t0, t1, d, x, y }
  // (v157) wide view: per pair (viewer, enemy) when last in his view, in the band now, an open chance; per soldier chances and taken
  const fovPair = new Map(), fovBy = new Map(), spotsOf = new Map();
  for (const e of R.events) if (e.type === 'spot' && e.target != null) { const j = R.pidx.get(e.target); if (j === undefined) continue; if (!spotsOf.has(j)) spotsOf.set(j, []); spotsOf.get(j).push([e.t, e.team]); }
  const firedNear = (j, tt) => (R.players[j].fire || []).some(f => f[0] <= tt && f[1] >= tt - 1.5);
  const spottedNear = (j, tt, tm) => (spotsOf.get(j) || []).some(([ts, side]) => ts <= tt && ts >= tt - 6 && (side == null || side === tm));
  const fovStep = (tt, P) => {
    for (const [i, q] of P) {
      if (q.yaw == null) continue;
      const tm = teamOf(i, tt);
      for (const [j, o] of P) {
        if (j === i || teamOf(j, tt) === tm) continue;
        const dx = o.x - q.x, dy = o.y - q.y, d = Math.hypot(dx, dy); if (d > FOV_FAR + 10) { fovPair.delete(i * 256 + j); continue; }
        const key = i * 256 + j, off = angOff(Math.atan2(dx, dy), q.yaw) / DEG; let st = fovPair.get(key);
        if (!st) fovPair.set(key, st = { last: -1e9, band: false, ep: null });
        if (st.ep) {
          if (off <= FOV_HIT) { const B = fovBy.get(i); B.q++; if (!B.first) B.first = { t: st.ep.t0, x: q.x, y: q.y, j, off: st.ep.off, d: st.ep.d }; st.ep = null; }
          else if (tt - st.ep.t0 > FOV_REACT + 1e-6) st.ep = null;
        }
        const band = off >= FOV_IN && off <= FOV_OUT;
        if (band && !st.band && !st.ep && d >= 8 && d <= FOV_FAR && tt - st.last > FOV_FRESH) {
          const eye = q.h + EYE_H[stanceNow(R.players[i], tt) ?? 0], so = stanceNow(R.players[j], tt) ?? 0;
          const hh = o.h + AIM_H[so][0], open = (!losBlocked(D, q.x, q.y, eye, o.x, o.y, hh, tt) || !losBlocked(D, q.x, q.y, eye, o.x, o.y, o.h + AIM_H[so][1], tt)) && !vegBlocks(q.x, q.y, eye, o.x, o.y, hh) && !smokeBlocks(q.x, q.y, o.x, o.y, tt);
          const hit = (() => { const a = playerAt(i, tt - 2).hp, b = q.hp; return a != null && b != null && b < a - 1; })();
          if (open && !hit && !firedNear(j, tt) && !spottedNear(j, tt, tm)) {
            if (!fovBy.has(i)) fovBy.set(i, { n: 0, q: 0, first: null }); fovBy.get(i).n++; st.ep = { t0: tt, off, d };
          }
        }
        if (off <= FOV_HALF) st.last = tt;
        st.band = band;
      }
    }
  };
  const fovHints = () => {
    let N = 0, Q = 0; for (const B of fovBy.values()) { N += B.n; Q += B.q; }
    R._fovStat = [...fovBy].map(([i, B]) => ({ name: R.players[i].name, n: B.n, q: B.q, others: (Q - B.q + 1) / (N - B.n + 6), tail: binTailLog(B.q, B.n, (Q - B.q + 1) / (N - B.n + 6)) })).sort((a, b) => a.tail - b.tail);
    for (const [i, B] of fovBy) { if (B.q < FOV_N || !B.first) continue; const p = (Q - B.q + 1) / (N - B.n + 6); if (binTailLog(B.q, B.n, p) < FOV_P) out.push({ t: B.first.t, kind: 'fov', adm: true, actor: R.players[i].id, vs: R.players[B.first.j].id, q: B.q, n: B.n, others: p, x: B.first.x, y: B.first.y }); }
  };
  const closeF = i => { const r = fires.get(i); if (!r) return; fires.delete(i);
    const dur = Math.round((r.t1 - r.t0 + TRACK_STEP) * 10) / 10; if (dur < 0.4) return;
    const w = inHands(i, (r.t0 + r.t1) / 2); if (!WF_GUN(w)) return;
    let last = null; for (let tt = r.t0 - TRACK_STEP; tt >= r.t0 - 6; tt -= TRACK_STEP) if (seesAt(i, r.j, tt, 45)) { last = r.t0 - tt; break; }
    wfAll.push({ i, j: r.j, t: r.t0, dur, d: r.d, w: w.name, last });
    // (v180) the exact shapes: a bullet's line to him clear - past a wall's end the grid closed, or only through what
    // bullets go through (a board fence, thin metal): firing through cover at a man there, not at a wall
    if (G && dur >= WF_T0) { const tm = (r.t0 + r.t1) / 2, a = playerAt(i, tm), b = playerAt(r.j, tm); if (a.alive && b.alive && a.h != null && b.h != null && bodyClearExact(D, G, a, a.h + EYE_H[stanceNow(R.players[i], tm) ?? 0], r.j, b, tm, G.penKnown)) { wfAll[wfAll.length - 1].thin = true; return; } }
    if (dur >= WF_T0 && (last === null || last > WF_PRE)) { if (!wfBy.has(i)) wfBy.set(i, []); wfBy.get(i).push({ t: r.t0, vs: R.players[r.j].id, dur, d: r.d, w: w.name, last, x: r.x, y: r.y }); } };
  const wfBy = new Map();   // soldier -> his bursts at hidden enemies he hadn't seen (WF_T0 s or more)
  const wfHints = () => { for (const [i, B] of wfBy) {
    const top = B.reduce((a, b) => b.dur > a.dur ? b : a), h = (b, n) => ({ t: b.t, kind: 'wallfire', adm: true, actor: R.players[i].id, vs: b.vs, dur: b.dur, d: b.d, w: b.w, last: b.last, n, total: B.reduce((a, c) => a + c.dur, 0), x: b.x, y: b.y });
    // (v184, todo 146: a single long burst - 208 of 349 such hints in 675 rounds, 23% of rounds - is someone spraying
    // the cover a man went behind; WF_N bursts or more: 0.6% of soldier-rounds, and two soldiers in 6 of 24 and 7 of 48
    // of their rounds)
    if (B.length >= WF_N) out.push(h(top, B.length));
  } };
  const T0 = R.times[0] || 0, T1 = R.duration, steps = Math.floor((T1 - T0) / TRACK_STEP);
  // positions and views of all soldiers, step by step (once)
  let k = 0; const pos = new Array(steps);
  const runs = new Map();   // viewer -> { j, t0, t1, b0, b1, y0, y1, n, dmin }
  const close = i => { const r = runs.get(i); if (!r) return; runs.delete(i);
    const dur = r.t1 - r.t0, turn = angOff(r.b1, r.b0) / DEG, yt = angOff(r.y1, r.y0) / DEG;
    if (dur < TRACK_T || turn < TRACK_TURN || yt < TRACK_TURN * 0.7) return;
    // (v180) the exact shapes: hidden on the 25 cm grid, but in clear sight at 3 or more of 5 moments of the run - the
    // grid closed a gap he saw him through (bullets' materials still hide him: he can't see through boards)
    if (G) { let seen = 0; for (let k = 0; k < 5; k++) { const tm = r.t0 + dur * k / 4, a = playerAt(i, tm), b = playerAt(r.j, tm); if (a.alive && b.alive && a.h != null && b.h != null && bodyClearExact(D, G, a, a.h + EYE_H[stanceNow(R.players[i], tm) ?? 0], r.j, b, tm)) seen++; } if (seen >= 3) return; }
    out.push({ t: r.t0, kind: 'track', adm: true, actor: R.players[i].id, vs: R.players[r.j].id, dur, turn, d: r.dmin, x: r.x, y: r.y }); };
  const work = () => {
    if (R !== round) return;
    const t0 = performance.now();
    for (; k < steps && performance.now() - t0 < 25; k++) {
      const tt = T0 + k * TRACK_STEP, P = new Map();
      for (const i of sol) { const q = playerAt(i, tt); if (q.alive && !q.down && !q.veh && Number.isFinite(q.x) && q.h != null) P.set(i, q); }
      fovStep(tt, P);
      for (const i of sol) {
        const q = P.get(i); if (!q || q.pitch == null) { close(i); closeF(i); continue; }
        const tm = teamOf(i, tt), eye = q.h + EYE_H[stanceNow(R.players[i], tt) ?? 0]; let best = null;
        for (const [j, o] of P) {
          if (j === i || teamOf(j, tt) === tm) continue;
          const dx = o.x - q.x, dy = o.y - q.y, d = Math.hypot(dx, dy); if (d < 8 || d > fog) continue;
          const b = Math.atan2(dx, dy), off = angOff(b, q.yaw) / DEG; if (off > TRACK_DEG) continue;
          const voff = Math.abs(Math.atan2(o.h - eye, d) - q.pitch) / DEG; if (voff > TRACK_VDEG) continue;
          if (!best || off < best.off) best = { j, o, b, d, off };
        }
        const r = runs.get(i);
        if (!best) { close(i); closeF(i); continue; }
        const st = stanceNow(R.players[best.j], tt) ?? 0, hidden = losBlocked(D, q.x, q.y, eye, best.o.x, best.o.y, best.o.h + AIM_H[st][0], tt) && losBlocked(D, q.x, q.y, eye, best.o.x, best.o.y, best.o.h + AIM_H[st][1], tt);
        // (fired at a wall: the trigger held, on this hidden enemy, nobody he sees near his crosshair)
        if (hidden && held(i, tt) && ![...P.keys()].some(j => j !== best.j && j !== i && teamOf(j, tt) !== tm && seesAt(i, j, tt, WF_NEAR)) && !vehNear(i, q, eye, tt)) {
          const f = fires.get(i);
          if (f && f.j === best.j && tt - f.t1 <= TRACK_STEP * 1.5) { f.t1 = tt; f.d = Math.min(f.d, best.d); }
          else { closeF(i); fires.set(i, { j: best.j, t0: tt, t1: tt, d: best.d, x: q.x, y: q.y }); }
        } else closeF(i);
        if (!hidden) { close(i); continue; }
        if (r && r.j === best.j && tt - r.t1 <= TRACK_STEP * 1.5) { r.t1 = tt; r.b1 = best.b; r.y1 = q.yaw; r.dmin = Math.min(r.dmin, best.d); }
        else { close(i); runs.set(i, { j: best.j, t0: tt, t1: tt, b0: best.b, b1: best.b, y0: q.yaw, y1: q.yaw, dmin: best.d, x: q.x, y: q.y }); }
      }
    }
    if (k < steps) { R._trackP = k / steps; setTimeout(work, 15); return; }
    for (const i of [...runs.keys()]) close(i);
    for (const i of [...fires.keys()]) closeF(i);
    wfHints(); fovHints();
    done(out);
  };
  setTimeout(work, 50);
}
// A soldier on foot runs at most 6.93 m/s (sprinting: 6 Karkand / Dalian rounds, 1.06 million one-second stretches on foot,
// p99.9 and nearly every top 6.93). Faster than SPEED_V over each second for SPEED_T s on end, where nothing else can
// carry him: the stretch is left out when he is in a vehicle or got out of one within 3 s (he keeps its speed, a
// parachute), spawned or was revived within 3 s, is down, rises or falls more than 2 m in that second (falling,
// sliding down a slope, a parachute), stands within 6 m of a vehicle (riding on top of a tank: =FL= 10-11 21:03 Magic295
// at 10 m/s on a T-90 for 5 s), had a blast within 15 m in the 2 s before (knocked away: 23 m/s by an SRAW), or jumps
// further in one step than 40 m/s (the decoder losing track of him: a respawn not seen, an id given to someone else).
// Those 6 rounds: no stretch left. Soldiers only: vehicles' tracks jump at every respawn and wreck, and they fly off ramps.
const SPEED_RUN = 6.93, SPEED_V = 8.7, SPEED_T = 2;
function speedRuns(R) {
  const { times: T, n, X, Y, HH, L, VT, DN } = R, F = T.length, out = [], pid = id => R.pidx.get(id);
  const vehs = R.players.map((p, j) => p.vehicle ? j : -1).filter(j => j >= 0), sold = R.players.map((p, j) => p.vehicle ? -1 : j).filter(j => j >= 0);
  const quiet = new Map();   // player index -> moments he spawned / was revived
  for (const e of R.events) if (e.type === 'spawn' || e.type === 'revive') { const i = pid(e.player); if (i !== undefined) { if (!quiet.has(i)) quiet.set(i, []); quiet.get(i).push(e.t); } }
  const blasts = R.events.filter(e => e.type === 'blast' && e.x != null);
  R.players.forEach((p, i) => {
    if (p.vehicle) return;
    const Q = quiet.get(i) || []; let lastVeh = -1e9, lastBad = -1e9, run = null;
    const close = () => { if (run && run.t1 - run.t0 >= SPEED_T) out.push(run); run = null; };
    for (let k = 0; k < F; k++) {
      const e = k * n + i;
      if (VT[e]) lastVeh = T[k];
      if (!L[e] || VT[e] || (DN && DN[e])) { lastBad = T[k]; close(); continue; }
      if (k > 0) { const e0 = e - n; if (L[e0] && Math.hypot(X[e] - X[e0], Y[e] - Y[e0]) > 40 * (T[k] - T[k - 1])) lastBad = T[k]; }
      if (T[k] - lastBad < 1 || T[k] - lastVeh < 3) { close(); continue; }
      const kb = k - Math.round(1 / Math.max(0.01, T[k] - T[k - 1])), b = kb * n + i; if (kb < 0) continue;
      const dt = T[k] - T[kb], v = Math.hypot(X[e] - X[b], Y[e] - Y[b]) / dt;
      if (v < SPEED_V || Math.abs(HH[e] - HH[b]) > 2 || Q.some(q => q > T[k] - 3 && q <= T[k])) { close(); continue; }
      if (vehs.some(j => { const ev = k * n + j; return L[ev] && Math.hypot(X[ev] - X[e], Y[ev] - Y[e]) < 6; })) { close(); continue; }
      // (v185) another soldier on foot by him (5 m) at both ends of the second: carried together (12 of the 26 hints of
      // 675 rounds were such pairs at 9-10 m/s - something carries them both that the demo does not seat them in)
      if (sold.some(j => { if (j === i) return false; const ej = k * n + j, bj = kb * n + j; return L[ej] && L[bj] && !VT[ej] && Math.hypot(X[ej] - X[e], Y[ej] - Y[e]) < 5 && Math.hypot(X[bj] - X[b], Y[bj] - Y[b]) < 5; })) { close(); continue; }
      if (blasts.some(bl => bl.t <= T[k] && bl.t > T[k] - 2 && Math.hypot(bl.x - X[e], bl.y - Y[e]) < 15)) { close(); continue; }
      if (!run) run = { i, t0: T[kb], t1: T[k], vmax: 0, k0: kb, x: X[b], y: Y[b] };
      run.t1 = T[k]; run.vmax = Math.max(run.vmax, v); run.k1 = k;
    }
    close();
  });
  for (const r of out) { const b = r.k1 * n + r.i; let d = 0; for (let k = r.k0 + 1; k <= r.k1; k++) d += Math.hypot(X[k * n + r.i] - X[(k - 1) * n + r.i], Y[k * n + r.i] - Y[(k - 1) * n + r.i]); r.dist = d; r.dur = r.t1 - r.t0; r.x1 = X[b]; r.y1 = Y[b]; }
  // one hint for his stretches less than 15 s apart (a sprint, a walk, a sprint again)
  out.sort((p, q) => p.i - q.i || p.t0 - q.t0); const M = [];
  for (const r of out) { const l = M[M.length - 1]; if (l && l.i === r.i && r.t0 - l.t1 < 15) { l.t1 = r.t1; l.vmax = Math.max(l.vmax, r.vmax); l.dist += r.dist; l.dur += r.dur; l.x1 = r.x1; l.y1 = r.y1; l.n++; } else M.push({ ...r, n: 1 }); }
  for (const r of M) r.vavg = r.dist / r.dur;
  return M;
}
// ---------- more admin hints (v122) ----------
// Measured on 6 rounds (5 =FL= Karkand, 1 Dalian Plant): what honest play does, and the hints set well past it.
// - Reaction: a soldier's small-arms kills on foot where he first had the victim in view (engagement: in his view, a
//   clear line) 0.25 s or less before the kill - a man needs about 0.2 s to react, then his shots must land. 6 rounds:
//   1.6-7.9 % of such kills, nobody at odds under 2 % against the others in his round. The hint: REACT_MIN or more such
//   kills of REACT_N or more measured, odds under REACT_P.
// - Stamina: a sprint (0.5 s stretches at 6.3-7.5 m/s on the flat, on foot, no vehicle within 6 m; dips to 4.5 m/s for
//   0.6 s at most) runs out after 10 s in the game (8 s with heavy kits). 6 rounds: 12 thousand sprints, the longest
//   10.6 s. STAM_T s or more on end.
// - Teleport: on foot, a jump of TELE_D m or more in one step (faster than 40 m/s), moving normally for the 3 s before
//   (on foot, steps under 12 m/s, not frozen - a frozen place is the decoder not following him inside a vehicle) and
//   the 1 s after (no flying on: thrown out of a jet), not within 5 s of a spawn, a revive or a vehicle, no vehicle
//   within 8 m. 6 rounds: 16 jumps of 10 m or more at over 40 m/s, none left.
//   Not a gap in his records (v130): frozen in place and view 0.8 s or more right before after running (2.5 m/s+), the
//   jump the way he ran and no faster than TELE_GAP m/s over that time.
// - Spawn: a soldier appearing (players[].kits) more than SPAWN_D m from any of the map's spawn points (all its game
//   modes and sizes: SPAWN_PTS, from the levels' GamePlayObjects.con), any team mate (spawning on the squad leader) and
//   any vehicle. 6 rounds: 1411 spawns, 9 of 10 within 1 m of a spawn point, the others at the squad leader (13 m at
//   most) or in his vehicle.
// - Damage: a soldier on foot kills someone inside a tank, an APC or an AA vehicle (closed in: bullets don't reach
//   him) with small arms, the vehicle with DMG_HP % or more left 1 s before (a burning wreck going off is put on the
//   last one to hit it). 6 rounds: none (small-arms kills from jeeps and boats: their gunners sit in the open). (v183) Of
//   a tank or an AA vehicle only its driver: the cupola's gunner is out in the open too (the vehicles' .tweak files:
//   seatInformation - a soldier seen in the seat; APCs have none such).
// - Idle: alive on foot, not moving 1 m nor turning 2° for IDLE_T s or more (AFK - a commander at his screen stands
//   still too). Left out: a stretch that ends in a jump (the decoder kept his last place while he was in a vehicle).
// - Kill farming: the same killer kills the same victim FARM_N times or more while the victim stood still (moved under
//   2 m and turned under 10° in the 10 s before, alive 3 s or more) - someone standing there to be killed for points.
//   6 rounds: 2 at most.
// - Vehicle speed: over 3 s (every step under 120 m/s, alive, rising or falling 15 m at most, no blast within 25 m
//   from 2 s before), faster than VSPD_X times the most its type made in the 6 rounds (VSPD_MAX: the 3 s top of
//   1.6 million stretches; the types not seen there: by kind, VSPD_KIND). (v182, todo 146: 1619 rounds - the RIB boat
//   goes 28-35 m/s in a third of the rounds it is in, 1136 of the 1142 hints: its 12.7 from the 6 rounds was too low; 26.5
//   now, 6 hints left)
// - Through walls / floating (geoScan, in the background): see there.
// - No trigger (v135): a bullet kill on foot (the kill message names where it hit) with every fire button of the killer
//   up for the NOFIRE_T s before (the Player ghost sends each button going down and up). 9 rounds: every such kill
//   within 0.07 s of a press (=FL= 20:37 Lagg_FM's "M4" kill from a TOW launcher's seat names no hit: left out).
// - Outside the map (v135): OUT_T s or more on end outside the combat area, alive (the game counts the seconds and kills
//   him when they run out: on 2F4Y.com's Dalian Plant after 14-17 s). 9 rounds: 114 stretches, 21 s the longest.
const SPAWN_START = 10, SPAWN_EARLY = 0.5, STAM_E = 3.5, STAM_H = 13, REACT_Q = 0.25, REACT_MIN = 4, REACT_N = 8, REACT_P = 0.001, STAM_T = 13, TELE_D = 15, TELE_GAP = 13, SPAWN_D = 25, DMG_HP = 25, IDLE_T = 240, FARM_N = 4, NOFIRE_T = 1.5, OUT_T = 25, SG_NEAR = 150, SG_R = 150;
const VSPD_MAX = { ustnk_m1a2: 10.5, rutnk_t90: 10.5, tnk_type98: 10.4, apc_btr90: 18.3, usapc_lav25: 19.7, apc_wz551: 22.7, jep_vodnik: 21, usjep_hmmwv: 19.6, jeep_faav: 24.9, jep_paratrooper: 27.5, jep_mec_paratrooper: 27.5, boat_rib: 26.5, ahe_ah1z: 50.5, ahe_z10: 49.6, chthe_z8: 27, usthe_uh60: 31.7, air_f35b: 117.2, air_j10: 117.1 };
const VSPD_KIND = { mtank: 10.5, maavehicle: 22.7, mapc: 22.7, mjeep: 27.5, mrib: 26.5, mattack_heli: 50.5, mtransport_heli: 40, mjet: 125 }, VSPD_X = 1.35, VSPD_T = 3;
function moreHints(R) {
  const out = [], { times: T, n, X, Y, HH, L, VT, DN, A, HP } = R, F = T.length, pid = id => R.pidx.get(id), ev = R.events, DEG = Math.PI / 180;
  const sold = R.players.map((p, i) => p.vehicle ? -1 : i).filter(i => i >= 0), vehs = R.players.map((p, j) => p.vehicle ? j : -1).filter(j => j >= 0);
  const fr = tt => { let lo = 0, hi = F - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (T[m] <= tt) lo = m; else hi = m - 1; } return lo; };
  const stepV = (e, k) => Math.hypot(X[e] - X[e - n], Y[e] - Y[e - n]) / Math.max(0.01, T[k] - T[k - 1]);
  const nearVeh = (k, x, y, r) => vehs.some(j => { const e = k * n + j; return L[e] && Math.hypot(X[e] - x, Y[e] - y) < r; });
  const spawns = i => (R.players[i].kits || []).map(x => x[0]);
  const revOf = new Map(); for (const e of ev) if (e.type === 'revive') { const i = pid(e.player); if (i !== undefined) { if (!revOf.has(i)) revOf.set(i, []); revOf.get(i).push(e.t); } }
  const path = (i, k0, k1) => { let d = 0; for (let k = k0 + 1; k <= k1; k++) d += Math.hypot(X[k * n + i] - X[(k - 1) * n + i], Y[k * n + i] - Y[(k - 1) * n + i]); return d; };
  // reaction
  if (losData()) {
    const per = new Map(); let N = 0, Q = 0;
    for (const e of ev) {
      if (e.type !== 'kill' || e.killer === e.victim || killCause(e, false) !== 'small' || /knife|defib/i.test(e.weapon || '')) continue;
      const g = engagement(e); if (!g || g.react == null) continue;
      const ki = pid(e.killer); let p = per.get(ki); if (!p) per.set(ki, p = { n: 0, q: 0, first: null, L: [] });
      p.n++; N++; p.L.push(g.react); if (g.react <= REACT_Q + 1e-3) { p.q++; Q++; if (!p.first) p.first = e; }
    }
    for (const [ki, p] of per) {
      if (p.n < REACT_N || p.q < REACT_MIN) continue;
      const o = (Q - p.q + 0.4) / (N - p.n + 10);
      if (binTail(p.q, p.n, o) < REACT_P) { const s = [...p.L].sort((a, b) => a - b); out.push({ t: p.first.t, kind: 'react', adm: true, actor: R.players[ki].id, q: p.q, n: p.n, others: o, med: s[s.length >> 1], x: p.first.x, y: p.first.y }); }
    }
  }
  const bad = new Int32Array(F + 1);   // (frames he is dead, in a vehicle or down, counted up to each frame)
  for (const i of sold) {
    const id = R.players[i].id;
    for (let k = 0; k < F; k++) { const e = k * n + i; bad[k + 1] = bad[k] + (!L[e] || VT[e] || (DN && DN[e]) ? 1 : 0); }
    // stamina (v170: with his sprint's stamina from the demo - players[].stam, 31 full, ~4 a second while he sprints -
    // the exact rules: sprint speed with it empty STAM_E s or more, or with it not going down STAM_H s or more (3 rounds,
    // 120 soldiers: at most 0.7 s and 4.1 s); rounds without it: one sprint of STAM_T s or more. v182, todo 146: 1619
    // rounds - on one server (SiC's infantry-only Karkand: its own sprint setting) 2-3.0 s with it empty in 103 of 106
    // rounds, never elsewhere; not going down 8-11.9 s on every server, 111 times; so 3.5 s and 13 s: none left)
    const SM = R.players[i].stam; let si = 0, sv = 31, e0 = null, h0 = null, hv = 31;
    const exactOut = (how, t0, t1, k0, k1, v) => out.push({ t: t0, kind: 'stam', adm: true, actor: id, how, dur: t1 - t0, dist: path(i, k0, k1), sv: v, x: X[k0 * n + i], y: Y[k0 * n + i] });
    let run = null, dip = 0;
    const close = () => { if (!SM && run && run.t1 - run.t0 >= STAM_T) out.push({ t: run.t0, kind: 'stam', adm: true, actor: id, dur: run.t1 - run.t0, dist: path(i, run.k0, run.k1), x: run.x, y: run.y }); run = null; dip = 0; };
    const endE = (k) => { if (e0 && T[k] - e0.t >= STAM_E) exactOut('empty', e0.t, T[k], e0.k, k, 0); e0 = null; };
    const endH = (k) => { if (h0 && T[k] - h0.t >= STAM_H) exactOut('hold', h0.t, T[k], h0.k, k, hv); h0 = null; };
    for (let k = 5; k < F; k++) {
      if (SM) while (si < SM.length && SM[si][0] <= T[k]) sv = SM[si++][1];
      const a = (k - 5) * n + i, b = k * n + i;
      if (bad[k + 1] - bad[k - 5]) { close(); endE(k); endH(k); continue; }
      const v = Math.hypot(X[b] - X[a], Y[b] - Y[a]) / Math.max(0.01, T[k] - T[k - 5]);
      const sprint = Math.abs(HH[b] - HH[a]) < 1 && v >= 6.3 && v <= 7.6 && !nearVeh(k, X[b], Y[b], 6);
      if (SM) {
        if (sprint && sv === 0) { if (!e0) e0 = { t: T[k], k }; } else endE(k);
        if (sprint) { if (!h0 || sv < hv) { endH(k); h0 = { t: T[k], k }; hv = sv; } } else endH(k);
      }
      if (Math.abs(HH[b] - HH[a]) >= 1.5 || v < 4.5 || v >= 7.5) { close(); continue; }
      if (v >= 6.3) { if (nearVeh(k, X[b], Y[b], 6)) { close(); continue; } if (!run) run = { t0: T[k - 5], k0: k - 5, x: X[a], y: Y[a] }; run.t1 = T[k]; run.k1 = k; dip = 0; }
      else if (!run || (dip += T[k] - T[k - 1]) > 0.6) close();
    }
    close(); endE(F - 1); endH(F - 1);
    // teleport
    const SP = spawns(i), RV = revOf.get(i) || [], J = []; let lastVeh = -1e9;
    for (let k = 1; k < F; k++) {
      const e = k * n + i, e0 = e - n; if (VT[e]) lastVeh = T[k];
      if (!L[e] || !L[e0] || VT[e] || VT[e0]) continue;
      const d = Math.hypot(X[e] - X[e0], Y[e] - Y[e0]); if (d < TELE_D || d / Math.max(0.01, T[k] - T[k - 1]) < 40) continue;
      if (T[k] - lastVeh < 5 || SP.some(s => Math.abs(s - T[k]) < 5) || RV.some(s => Math.abs(s - T[k]) < 5)) continue;
      { const pm = pingPeak(R.players[i], T[k] - 10, T[k] + 2); if (pm !== null && pm >= LAG_PING) continue; }   // (v170) lagging: a jump of the lag
      // (v130) a gap in his records, not a jump: the decoder held his last place and view (both exactly the same) for
      // 0.8 s or more right before, he was running 2.5 m/s or more in the 1 s before that, the way he jumps is within 60°
      // of the way he ran, and he covered the distance over that time no faster than TELE_GAP m/s (Lost-Soldiers Wake
      // 15:51: two of 25 and 28 m after 2.5 s frozen, running before and after). One who stood still and jumped stays.
      let kf = k - 1; while (kf > 0 && X[kf * n + i] === X[(kf - 1) * n + i] && Y[kf * n + i] === Y[(kf - 1) * n + i] && A[kf * n + i] === A[(kf - 1) * n + i]) kf--;
      if (T[k - 1] - T[kf] >= 0.8 && d / (T[k] - T[kf]) <= TELE_GAP && kf >= 10) {
        const f = kf * n + i, b = (kf - 10) * n + i, rx = X[f] - X[b], ry = Y[f] - Y[b], run = Math.hypot(rx, ry) / Math.max(0.01, T[kf] - T[kf - 10]);
        if (L[b] && !VT[b] && run >= 2.5 && ((X[e] - X[e0]) * rx + (Y[e] - Y[e0]) * ry) / (d * Math.hypot(rx, ry)) >= 0.5) continue;
      }
      let ok = k > 30, pa = 0, turn = 0;
      for (let q = k - 30; ok && q < k; q++) { const a = q * n + i; if (!L[a] || !L[a - n] || VT[a] || stepV(a, q) > 12) ok = false; else { pa += Math.hypot(X[a] - X[a - n], Y[a] - Y[a - n]); turn += angOff(A[a], A[a - n]); } }
      if (!ok || (pa < 0.3 && turn < 0.01)) continue;
      for (let q = k + 1; ok && q <= k + 10 && q < F; q++) { const a = q * n + i; if (!L[a] || VT[a] || stepV(a, q) > 12) ok = false; }
      if (!ok || nearVeh(k, X[e], Y[e], 8) || nearVeh(k - 1, X[e0], Y[e0], 8)) continue;
      J.push({ t: T[k], d, x0: X[e0], y0: Y[e0], x: X[e], y: Y[e] });
    }
    if (J.length) out.push({ t: J[0].t - 0.1, kind: 'tele', adm: true, actor: id, n: J.length, d: Math.max(...J.map(j => j.d)), d0: J[0].d, x: J[0].x, y: J[0].y, x0: J[0].x0, y0: J[0].y0 });
    // idle
    let s = null, kp = 0;
    const end = k => {
      if (!s || T[kp] - T[s.k] < IDLE_T) return;
      for (let q = kp + 1; q <= Math.min(F - 1, k + 1); q++) { const a = q * n + i; if (L[a] && L[a - n] && stepV(a, q) > 40) return; }
      out.push({ t: T[s.k], kind: 'idle', adm: true, actor: id, dur: T[kp] - T[s.k], x: s.x, y: s.y });
    };
    for (let k = 0; k < F; k += 10) {
      const e = k * n + i;
      if (!L[e] || VT[e]) { end(k); s = null; continue; }
      if (!s) { s = { k, x: X[e], y: Y[e], a: A[e] }; kp = k; continue; }
      if (Math.hypot(X[e] - s.x, Y[e] - s.y) > 1 || angOff(A[e], s.a) > 2 * DEG) { end(k); s = { k, x: X[e], y: Y[e], a: A[e] }; }
      kp = k;
    }
    end(F - 1);
  }
  // spawns
  // (v135) with the demo's spawn groups (exact owner over time): only the points of the groups his side held then (the
  // map's points within SG_NEAR of such a group's middle - the others belong to other layouts or the enemy); a map
  // without SPAWN_PTS: the groups' middles themselves, SG_R. 9 rounds: every spawn not at a team mate (891) within 0.8 m
  // of a point of a held group; from a held group's middle up to 51 m on Karkand and Dalian, 131 m on Wake Island
  const SPP = SPAWN_PTS[mapKey()], SGS = (R.raw?.spawnGroups || []);
  const sgTeam = (g, tt) => { let v = -1, on = 1; for (const q of g.teams) { if (q[0] > tt) break; v = q[1]; on = q[2]; } return on ? v : -1; };
  if (SPP || SGS.length) for (const i of sold) for (const ts of spawns(i)) {
    let k = fr(ts), g = 0; while (k < F - 1 && T[k] < ts + 0.15) k++; while (g < 10 && !L[k * n + i] && k < F - 1) { k++; g++; }
    const e = k * n + i; if (!L[e] || VT[e]) continue;
    const x = X[e], y = Y[e], tm = teamOf(i, ts + 0.3);
    // (v183, todo 220: 95 of the 130 Spawn hints of 1619 rounds came in the round's first 5 s - the groups get their sides
    // a moment after the first spawns; there a group created or given his side up to 6 s later counts)
    const start = ts < SPAWN_START, held = SGS.filter(q => q.t0 <= ts + (start ? 6 : 0.1) && (q.t1 === null || q.t1 > ts) && (start ? [-3, -1.5, 0, 0.3, 1, 2, 4, 6] : [-3, -1.5, 0, 0.3]).some(d => sgTeam(q, ts + d) === tm));
    let sd = Infinity, how = 'map';
    if (SPP) { for (let m = 0; m < SPP.length; m += 2) if (!SGS.length || held.some(q => Math.hypot(q.x - SPP[m], q.y - SPP[m + 1]) <= SG_NEAR)) sd = Math.min(sd, Math.hypot(SPP[m] - x, SPP[m + 1] - y)); if (SGS.length) how = 'held'; if (sd <= SPAWN_D) continue; }
    else { for (const q of held) sd = Math.min(sd, Math.hypot(q.x - x, q.y - y)); how = 'groups'; if (sd <= SG_R) continue; }
    const kb = fr(ts - 0.3); let md = Infinity;
    R.players.forEach((o, j) => { const ej = kb * n + j; if (j === i || !L[ej] || (!o.vehicle && teamOf(j, ts) !== tm)) return; md = Math.min(md, Math.hypot(X[ej] - x, Y[ej] - y)); });
    if (md > SPAWN_D) out.push({ t: T[k], kind: 'spawn', adm: true, actor: R.players[i].id, sd, md, x, y, how });
  }
  // (v170) early spawn: at his death the game tells (his Player ghost) when he may come in again - 15 s after it on the
  // servers so far; 3 rounds, 602 spawns: none before that time (the latest 0.04 s after it)
  for (const i of sold) {
    const p = R.players[i]; if (!p.sw) continue; let prev = -1;
    for (const ts of spawns(i)) {
      const q = seriesAt(p.sw, ts + 0.05);
      if (q && q[0] > prev && ts < q[1] - SPAWN_EARLY) { const e = fr(ts + 0.3) * n + i; out.push({ t: ts, kind: 'respawn', adm: true, actor: p.id, early: q[1] - ts, died: q[0], may: q[1], x: L[e] ? X[e] : null, y: L[e] ? Y[e] : null }); }
      prev = ts;
    }
  }
  // damage, kill farming
  const pair = new Map();
  for (const e of ev) {
    if (e.type !== 'kill' || e.killer === e.victim) continue;
    const ki = pid(e.killer), vi = pid(e.victim); if (vi === undefined) continue;
    if (ki !== undefined && !R.players[ki].vehicle && killCause(e, false) === 'small' && !/knife|defib/i.test(e.weapon || '')) {
      const q = playerAt(ki, e.t - 0.15), o = playerAt(vi, e.t - 0.15), j = o.veh ? vehIdx(o.veh) : undefined;
      // (v183, todo 223: in a tank or an AA vehicle only the driver is closed in - the cupola's gunner sits out in the open,
      // seatInformation in its .tweak; 1619 rounds: 258 of 264 such hints were tanks', 6 AA vehicles')
      const shut = j !== undefined && (vehClass(j) === 'apc' || (R.DR && R.DR[fr(e.t - 0.15) * n + vi] === 1));
      if (!q.veh && j !== undefined && vehClass(j) !== 'light' && shut) { const hp = HP ? HP[fr(e.t - 1) * n + j] : NaN; if (hp >= DMG_HP) out.push({ t: e.t, kind: 'dmg', adm: true, actor: e.killer, kill: e, veh: o.veh, cls: vehClass(j), hp, x: e.x, y: e.y }); }
      // (v135) no trigger: his fire buttons all up for the NOFIRE_T s before a bullet kill on foot (his Player ghost)
      const KP = R.players[ki];
      if (KP.fire && !q.veh && e.hit) { let last = -Infinity; for (const f of KP.fire) { if (f[0] > e.t + 0.05) break; last = Math.max(last, Math.min(f[1], e.t)); } const gap = e.t - last; if (gap > NOFIRE_T && KP.fire.some(f => f[0] < e.t && f[0] > e.t - 600)) out.push({ t: e.t, kind: 'nofire', adm: true, actor: e.killer, kill: e, gap, x: e.x, y: e.y }); }
    }
    if (R.players[vi].vehicle) continue;
    const kk = fr(e.t - 0.15), b = kk * n + vi; if (!L[b] || VT[b]) continue;
    let still = true, q = kk;
    for (; q > kk - 100 && q > 0; q--) { const a = q * n + vi; if (!L[a] || VT[a]) break; if (Math.hypot(X[a] - X[b], Y[a] - Y[b]) > 2 || angOff(A[a], A[b]) > 10 * DEG) { still = false; break; } }
    if (!still || T[kk] - T[q] < 3) continue;
    const key = e.killer + '>' + e.victim; let P = pair.get(key); if (!P) pair.set(key, P = []); P.push(e);
  }
  for (const P of pair.values()) if (P.length >= FARM_N) { const e = P[0]; out.push({ t: e.t, kind: 'farm', adm: true, actor: e.killer, vs: e.victim, n: P.length, all: ev.filter(x => x.type === 'kill' && x.killer === e.killer && x.victim === e.victim).length, span: P[P.length - 1].t - e.t, x: e.x, y: e.y }); }
  for (const i of sold) for (const o of R.players[i].out || []) if (o[1] - o[0] >= OUT_T) { const k = fr(o[0] + 1), e = k * n + i; out.push({ t: o[0], kind: 'outside', adm: true, actor: R.players[i].id, dur: o[1] - o[0], secs: o[2], x: X[e], y: Y[e] }); }
  // vehicle speed
  const blasts = ev.filter(e => e.type === 'blast' && e.x != null);
  for (const j of vehs) {
    const p = R.players[j], lim = (VSPD_MAX[vehKey(p)] ?? VSPD_KIND[vehIconKey(p)]); if (!lim) continue;
    const top = lim * VSPD_X; let run = null;
    const close = () => {
      if (!run) return; const r = run; run = null;
      const km = (r.k0 + r.k1) >> 1; let drv = null;
      for (const i of sold) { const e = km * n + i; if (L[e] && VT[e] && R.VTN[VT[e]] === p.name && R.DR && R.DR[e]) { drv = i; break; } }
      out.push({ t: r.t0, kind: 'vspeed', adm: true, actor: drv !== null ? R.players[drv].id : p.id, veh: p.name, v: r.vmax, lim, dur: r.t1 - r.t0, dist: path(j, r.k0, r.k1), x: X[r.k0 * n + j], y: Y[r.k0 * n + j] });
    };
    bad[0] = bad[1] = 0; for (let k = 1; k < F; k++) { const e = k * n + j; bad[k + 1] = bad[k] + (!L[e] || !L[e - n] || stepV(e, k) > 120 ? 1 : 0); }
    for (let k = 30; k < F; k += 5) {
      const a = (k - 30) * n + j, b = k * n + j, ok = L[a] && L[b] && !(HP && (HP[a] <= 0 || HP[b] <= 0)) && Math.abs(HH[b] - HH[a]) <= 15 && bad[k + 1] === bad[k - 29];
      const v = ok ? Math.hypot(X[b] - X[a], Y[b] - Y[a]) / Math.max(0.01, T[k] - T[k - 30]) : 0;
      if (v > top && !blasts.some(bl => { if (bl.t <= T[k - 30] - 2 || bl.t > T[k]) return false; const q = Math.max(0, fr(bl.t)) * n + j; return Math.hypot(bl.x - X[q], bl.y - Y[q]) < 25; })) {
        if (run && T[k - 30] - run.t1 <= 10) { run.t1 = T[k]; run.k1 = k; run.vmax = Math.max(run.vmax, v); }
        else { close(); run = { t0: T[k - 30], t1: T[k], k0: k - 30, k1: k, vmax: v }; }
      }
    }
    close();
  }
  return out;
}
// Through walls (noclip) and floating (flying): every 0.3 s, each soldier on foot (alive, not down), against the sight
// grid (the map's collision shapes, 25 cm; broken objects out).
// - Through walls: his step (0.4-4 m, rising or falling under 1 m) runs through solid shapes for 0.15 m or more at
//   knee, waist and chest height alike (0.5, 1.0, 1.5 m over his feet) with both its ends clear. Honest play has some at
//   gaps the grid doesn't know (6 rounds: 5-28 a round, at most 8 a player, in 6 places); the hint: CLIP_N or more in
//   a round, in CLIP_P places or more (5 m apart).
// - Floating: his feet FLY_H m or more over what is under him (the ground, the sea's level, the top of the shapes
//   under his feet, 0.3 m round), for FLY_T s or more on end, moving across (FLY_V m/s or more on average, under 30)
//   and not coming down (FLY_VZ m/s or slower), no vehicle within 12 m, not out of one in the 10 s before (a parachute
//   comes down at 4-6 m/s). 6 rounds: honest stretches are jumps and falls off roofs, slides, parachutes; none left.
//   (Soldiers swimming are at the sea's level; the decoder keeping a soldier's last place while he is in a vehicle: no
//   moving across.)
// (v185, todo 146: 675 rounds - 21 of 27 Floating hints were 4.2-5.7 s at 26-47 m up, rising, by 8 soldiers on 4 maps:
// some way of the game, not a hack; the other 6 were 15-120 s at 85-397 m up, 10-23 m/s across - two soldiers on SiC's
// infantry-only Karkand, the same two with the most unlikely headshots - so FLY_T 8 s)
const CLIP_N = 15, CLIP_P = 10, FLY_H = 5, FLY_T = 8, FLY_V = 2, FLY_VZ = -1;
// ---- part 4 (page line 6996) ----
function solidAt(D, x, y, z, OFF) {
  const c = gridCell(D, x, y); if (c < 0) return false; const z10 = z * 10;
  for (let m = D.cs[c], b = D.cs[c + 1]; m < b; m++) if (D.sp[2 * m] <= z10 && D.sp[2 * m + 1] >= z10 && !(OFF && spanOut(OFF, m))) return true;
  return false;
}
function floorUnder(D, x, y, z, OFF, wl) {
  let best = Math.max(wl, groundAt(D, x, y));
  for (const [ox, oy] of [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) {
    const c = gridCell(D, x + ox, y + oy); if (c < 0) continue;
    for (let m = D.cs[c], b = D.cs[c + 1]; m < b; m++) { const hi = D.sp[2 * m + 1] / 10; if (hi <= z + 0.4 && hi > best && !(OFF && spanOut(OFF, m))) best = hi; }
  }
  return best;
}
function geoScan(R, done) {
  const D = losData(); if (!D) { done([]); return; }
  const { times: T, n, X, Y, HH, L, VT, DN } = R, F = T.length, out = [], wl = WATER[mapKey()] ?? -1e9;
  const sold = R.players.map((p, i) => p.vehicle ? -1 : i).filter(i => i >= 0), vehs = R.players.map((p, j) => p.vehicle ? j : -1).filter(j => j >= 0);
  let si = 0;
  const one = i => {
    const pass = []; let fl = null, lastVeh = -1e9;
    const flyEnd = () => { if (fl && fl.t1 - fl.t0 >= FLY_T) { const dur = fl.t1 - fl.t0, v = fl.path / dur, vz = (fl.h1 - fl.h0) / dur; if (v >= FLY_V && v < 30 && vz >= FLY_VZ) out.push({ t: fl.t0, kind: 'fly', adm: true, actor: R.players[i].id, dur, v, vz, above: fl.amax, x: fl.x, y: fl.y }); } fl = null; };
    for (let k = 3; k < F; k += 3) {
      const a = (k - 3) * n + i, b = k * n + i;
      if (VT[a] || VT[b]) lastVeh = T[k];
      if (!L[a] || !L[b] || VT[a] || VT[b] || (DN && (DN[a] || DN[b]))) { flyEnd(); continue; }
      const OFF = brkOff(D, T[k]), dx = X[b] - X[a], dy = Y[b] - Y[a], dist = Math.hypot(dx, dy);
      if (dist > 0.4 && dist < 4 && Math.abs(HH[b] - HH[a]) < 1) {
        const ns = Math.ceil(dist / 0.05); let thru = true;
        for (const o of [0.5, 1.0, 1.5]) {
          let run = 0, best = 0;
          for (let s = 0; s <= ns; s++) { const u = s / ns, sd = solidAt(D, X[a] + dx * u, Y[a] + dy * u, HH[a] + (HH[b] - HH[a]) * u + o, OFF); if ((s === 0 || s === ns) && sd) { best = 0; break; } if (sd) { run++; if (run > best) best = run; } else run = 0; }
          if (best * dist / ns < 0.15) { thru = false; break; }
        }
        if (thru) pass.push({ t: T[k], x: X[b], y: Y[b] });
      }
      const above = HH[b] - floorUnder(D, X[b], Y[b], HH[b], OFF, wl);
      const near = vehs.some(j => { const e = k * n + j; return L[e] && Math.hypot(X[e] - X[b], Y[e] - Y[b]) < 12 && Math.abs(HH[e] - HH[b]) < 12; });
      if (above >= FLY_H && !near && T[k] - lastVeh >= 10) { if (!fl) fl = { t0: T[k], h0: HH[b], amax: above, x: X[b], y: Y[b], path: 0 }; fl.t1 = T[k]; fl.h1 = HH[b]; fl.amax = Math.max(fl.amax, above); fl.path += dist; }
      else flyEnd();
    }
    flyEnd();
    if (pass.length >= CLIP_N) {
      const P = []; for (const p of pass) if (!P.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 5)) P.push(p);
      if (P.length >= CLIP_P) out.push({ t: pass[0].t, kind: 'clip', adm: true, actor: R.players[i].id, n: pass.length, places: P.length, span: pass[pass.length - 1].t - pass[0].t, x: pass[0].x, y: pass[0].y });
    }
  };
  const work = () => {
    if (R !== round) return;
    const t0 = performance.now();
    while (si < sold.length && performance.now() - t0 < 25) one(sold[si++]);
    if (si < sold.length) { R._geoP = si / sold.length; setTimeout(work, 15); return; }
    done(out);
  };
  setTimeout(work, 50);
}
// ---------- hints from the UnknownCheats list (v128) ----------
// Made for named hacks of the "Battlefield 2 | Complete Hack & Tool List" (UnknownCheats, 2021): what each of them
// changes that a server's demo records.
// - Spot spam (BF2 Spot Silincer: spots without the radio voice, so they can be sent all the time): one soldier's spots
//   (since v132 the spotter is in the demo - the spotting soldier, Kakarotto22's layout - and a repeat of the same
//   target is kept) - SPAM_60 or more within 60 s or SPAM_10 within 10 s. 9 rounds (=FL= Karkand x6, 2F4Y Dalian,
//   Lost-Soldiers Wake x2; 6689 spots): a quick tap of the radio key spots, and honest players tap it fast (the
//   quickest 0.13 s after the last) - the most 26 in 60 s (aimar99, Wake) and 9 in 10 s (=OLD= Golg_4iter, 357 spots
//   in a round). Over it, in 2F4Y Dalian only: 49 in a minute (17 in 10 s, one run of 17 spots every 0.5 s like a
//   held key) and 45 (13).
// - Fast flag (rcon "Fast Flag", server mods): a flag goes up or down at a rate the game sets as 1 / timeToGetControl
//   (raising) or 1 / timeToLoseControl (lowering) per soldier there more than the other side has (the level files:
//   CP_TIMES). 9 rounds, 2409 stretches of constant rate (the flag's level, 10 times a second): every one an exact
//   multiple of it, 1-4 soldiers' worth, and never more than one over the soldiers of either side within the flag's
//   radius + 12 m. The hint: a stretch of 1 s or more FLAG_X or more over them (or at a rate that is no whole number of
//   soldiers: a capture time the map doesn't have), unless the round's flags all run off the map's times (another
//   server setup: not a player's doing).
// - Artillery (Unlimited Artillery): the commander's strike is 5 shells from each of his side's guns, 2 s apart (the
//   guns' 30 rounds a minute, burstSize 5), and the button lights up again a minute later. 2F4Y Dalian: 15 strikes, 3
//   guns x 5 shells every time, the next one 63-323 s after (from the first shell to the next first shell). The hint:
//   a strike ART_GAP s or less after the last one of that side, more than 5 shells from a gun, or two shells of one gun
//   under 1.7 s apart. Who called it: the killer the game names for a kill by those shells (the commander), else the
//   one named for the nearest strike of that side (probably him).
// - Guided missiles (Tv Missile Aimbot, BF2 TV macro; and the same for the wire-guided SRAW, Eryx and TOW, which fly
//   where the gunner's crosshair is): its flight (every 0.1 s) against the target - the enemy vehicle within 7 m of
//   where it went off, or a soldier on foot within 3 m - moving GUIDE_V m/s or more: the angle between the way the
//   missile flew and the line to the target, from 0.4 s after the launch (target over 8 m away), its middle value per
//   missile. 9 rounds, 1368 missiles (174 TV): 124 such hits, the middle angle 2.3-2.9 degrees (a tenth of them under
//   0.8), 6 under 0.5; nobody with 3 hits under 0.7 at the middle. The hint: GUIDE_N or more such hits of one gunner
//   with the middle of them GUIDE_ERR or less - his missile stuck to a moving target as no hand does. And for TV
//   missiles (from an aircraft, out to 400 m, where most miss: 47 of 174 hit, the best gunner 7 of 13): TV_N or more
//   fired, so many hits that the odds against the round's other TV gunners are under TV_P (v184: against every TV
//   gunner's share, TV_RATE 0.383 of 5596 missiles in 168 rounds; TV_P 1e-5).
const SPAM_60 = 30, SPAM_10 = 12, FLAG_X = 2, ART_GAP = 50, ART_BURST = 5, ART_ROF = 1.7, GUIDE_V = 5, GUIDE_N = 3, GUIDE_ERR = 0.5, GUIDE_NOSE = 0.25, TV_N = 8, TV_P = 1e-5, TV_RATE = 0.383;
// ---- part 5 (page line 7201) ----
// (v149) did player i command his side at tt? The commander spots from his screen - anyone anywhere, many at a time, with
// no line of sight (2F4Y Dalian 09:08: 309 of the round's 810 spots, both "Spot spam" hints were commanders' - Sagara:
// "Враховувати що спот командером може бути більший ніж простого піхотинця і не заносити його в for admins")
const asCmdr = (R, i, tt) => { const c = seriesAt(R.players[i]?.cmdr, tt); return !!(c && c[1]); };
function objHints(R) {
  const out = [], { times: T, n, X, Y, L, DN, FC, nf, VT, HH } = R, F = T.length, pid = id => R.pidx.get(id), ev = R.events;
  // spot spam (not the commander's spots)
  if (R.meta.source === 'demo') {
    const per = new Map();
    for (const e of ev) { if (e.type !== 'spot') continue; const s = spotterOf(e); if (!s || s.alt || s.p < 0.45 || asCmdr(R, s.i, e.t)) continue; if (!per.has(s.i)) per.set(s.i, []); per.get(s.i).push(e); }
    for (const [i, a] of per) {
      if (a.length < SPAM_10) continue;
      let w60 = 0, w10 = 0, b60 = 0, b10 = 0, at = null;
      for (let k = 0; k < a.length; k++) {
        while (a[k].t - a[w60].t > 60) w60++; while (a[k].t - a[w10].t > 10) w10++;
        const c60 = k - w60 + 1, c10 = k - w10 + 1;
        if (c60 > b60) { b60 = c60; if (c60 >= SPAM_60 && (!at || c60 > at.n60)) at = { e: a[w60], n60: c60 }; }
        if (c10 > b10) { b10 = c10; if (c10 >= SPAM_10 && !at) at = { e: a[w10], n10: c10 }; }
      }
      if (at) { const q = playerAt(i, at.e.t); out.push({ t: at.e.t, kind: 'spotspam', adm: true, actor: R.players[i].id, n60: b60, n10: b10, all: a.length, x: q.alive ? q.x : null, y: q.alive ? q.y : null }); }
    }
  }
  // fast flag
  const CT = R.FC && nf ? cpTimes(R) : null;
  if (CT) {
    const segs = [];
    for (let k = 0; k < nf; k++) {
      const f = R.flags[k], c = CT[k]; if (!c) continue;
      let q0 = 1, s0 = null;
      const flush = q1 => {
        if (s0 === null || Math.abs(s0) < 1e-4 || q1 - q0 < 5) return;
        const raise = Math.abs(FC[(q1 - 1) * nf + k]) > Math.abs(FC[q0 * nf + k]), tm = raise ? c[2] : c[3]; if (!(tm > 0)) return;
        // (v170) the side moving it: raising its own flag, or lowering the other's (or nobody: back at half speed); who
        // was in the flag's capture zone (zoneOf - in 3D; a vehicle's crew as far again as it is big) every 0.5 s of the
        // stretch, its ends left out: one man moves it at 1x, each more of his side than of the other adds 1x (9 rounds,
        // 2033 stretches: 1x with one there 1164 times, 2x with two 478, 3x with three 156, 4x 37, 5x 6, 6x 1)
        const m = Math.abs(s0) * tm, fv = FC[((q0 + q1) >> 1) * nf + k], side = raise ? (fv > 0 ? 0 : 1) : (fv > 0 ? 1 : 0), z = zoneOf(R, k);
        let most = 0; const cnt = [0, 0], near = new Map();
        for (let q = q0 + 3; q <= q1 - 3; q += 5) {
          const c = [0, 0], sure = [0, 0];
          for (let i = 0; i < n; i++) {
            if (R.players[i].vehicle) continue; const e = q * n + i; if (!L[e]) continue; const sd = teamOf(i, T[q]); if (sd !== 0 && sd !== 1) continue;
            const d = z.h == null ? Math.hypot(X[e] - z.x, Y[e] - z.y) : Math.hypot(X[e] - z.x, Y[e] - z.y, HH[e] - z.h), down = DN && DN[e];
            if (d <= z.r + (VT[e] ? capExtra(R, VT[e], true) : ZONE_FOOT) + 1) { c[sd]++; if (sd === side && !(near.get(i) <= d)) near.set(i, d); }   // (down too: counted, to be safe)
            if (!down && d <= z.r + (VT[e] ? capExtra(R, VT[e], false) : ZONE_FOOT) - 1) sure[sd]++;
          }
          // (the speed the men of his side there give with nobody against them: the game's own rule takes the other side's
          // off, but 9 rounds have 1x with one against one 13 times - so only more than his own men can give is a hint)
          most = Math.max(most, c[side]); cnt[0] = Math.max(cnt[0], c[0]); cnt[1] = Math.max(cnt[1], c[1]);
        }
        segs.push({ k, t: T[q0], t1: T[q1], m, most, cnt, side, near: [...near].map(([i, d]) => [d, i]).sort((a, b) => a[0] - b[0]), raise, tm, whole: Math.abs(m - Math.round(m)) < 0.15 });
      };
      for (let q = 1; q < F; q++) { const s = (FC[q * nf + k] - FC[(q - 1) * nf + k]) / (T[q] - T[q - 1]); if (s0 === null || Math.abs(s - s0) > 0.003) { flush(q); q0 = q; s0 = s; } }
      flush(F - 1);
    }
    R._capSegs = segs;   // (v175: every stretch, for the analysis of many rounds - analysisDump)
    const odd = segs.filter(g => !g.whole).length;
    if (segs.length && odd <= Math.max(2, segs.length * 0.3)) {
      let last = null;
      for (const g of segs.sort((a, b) => a.t - b.t)) {
        if (g.t1 - g.t < 1) continue;
        // (v170: a man's speed or more than the men in the zone give; v182, todo 146: not with nobody of his side in the zone -
        // 450 of 555 such hints in 1619 rounds, 332 at two flags, Kubra Dam's Bridge Base and Daqing's Oil Cisterns: the
        // zone as worked out here missing them, not a server's fast flag)
        const fast = g.m >= Math.max(1, g.most + 1) - 0.15 && g.most >= 1, off = !g.whole && g.m >= 0.6;
        if (!fast && !off) continue;
        if (last && last.k === g.k && g.t - last.t1 < 10) { last.t1 = g.t1; last.m = Math.max(last.m, g.m); continue; }
        const f = R.flags[g.k], who = g.near.length ? R.players[g.near[0][1]].id : null;
        out.push(last = { t: g.t, t1: g.t1, kind: 'fastcap', adm: true, actor: who, flag: f.name, k: g.k, m: g.m, most: g.most, cnt: g.cnt[g.side], other: g.cnt[1 - g.side], side: g.side, raise: g.raise, tm: g.tm, odd: off && !fast, x: f.x, y: f.y });
      }
    }
  }
  // guided missiles: what each one hit, how close it kept to a moving target
  {
    const fr = tt => Math.max(0, Math.min(F - 1, Math.round(tt / (T[1] - T[0] || 0.1)))), at = (j, tt) => { const e = fr(tt) * n + j; return L[e] ? e : -1; };
    const ang = (a, b) => { let x = a - b; while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return Math.abs(x) * 180 / Math.PI; };
    const per = new Map();
    for (const e of ev) {
      if (e.type !== 'throw' || !MISSILES.has(e.kind) || !e.path || e.path.length < 4) continue;
      const si = pid(e.by); if (si === undefined) continue;
      const tm = teamOf(si, e.t), z = e.path[e.path.length - 1], z0 = e.path[0], tv = e.kind === 'TV missile';
      let best = null;
      R.players.forEach((pl, j) => {
        const q = at(j, e.t1); if (q < 0) return;
        if (!pl.vehicle && playerAt(j, e.t1).veh) return;
        const side = pl.vehicle ? vehTeam(j, e.t1) : teamOf(j, e.t1); if (side === tm) return;
        const d = Math.hypot(X[q] - z[1], Y[q] - z[2]); if (d < (pl.vehicle ? 7 : 3) && (!best || d < best.d)) best = { j, d };
      });
      const key = si + (tv ? ':tv' : ':w'); let P = per.get(key); if (!P) per.set(key, P = { i: si, tv, n: 0, hits: 0, errs: [], first: null, kinds: new Set() });
      P.n++; P.kinds.add(e.name || e.kind); if (!best) continue; P.hits++;
      const a0 = at(best.j, e.t1 - 1), a1 = at(best.j, e.t1); if (a0 < 0 || a1 < 0 || Math.hypot(X[a1] - X[a0], Y[a1] - Y[a0]) < GUIDE_V) continue;
      const er = [];
      for (let k = 1; k < e.path.length - 1; k++) {
        const p0 = e.path[k - 1], p1 = e.path[k]; if (p1[0] - z0[0] < 0.4) continue;
        const q = at(best.j, p1[0]); if (q < 0 || Math.hypot(X[q] - p1[1], Y[q] - p1[2]) < 8) continue;
        er.push(ang(p1.length > 3 ? p1[3] : Math.atan2(p1[1] - p0[1], p1[2] - p0[2]), Math.atan2(X[q] - p1[1], Y[q] - p1[2])));   // (v170: where its nose pointed, from its own record - 0.3-0.5° from the way it flew)
      }
      if (er.length < 5) continue;
      er.sort((a, b) => a - b); P.errs.push({ e, er: er[er.length >> 1], v: best.j }); if (e.path.some(p => p.length > 3)) P.nose = true;
    }
    let N = 0, H = 0; for (const P of per.values()) if (P.tv) { N += P.n; H += P.hits; }
    R._tvStat = [...per.values()].filter(P => P.tv).map(P => [P.i, P.n, P.hits]);   // (v183, todo 224: every TV gunner's missiles and hits, for the analysis)
    for (const P of per.values()) {
      const ms = P.errs.map(x => x.er).sort((a, b) => a - b), mid = ms.length ? ms[ms.length >> 1] : null, why = [];
      // (v170: with the nose's own heading the angles come out finer - 5 rounds, 37 gunners: the lowest middle of one
      // with 3 hits or more 0.32° (it was 0.72 by the steps of its flight) - so GUIDE_NOSE then)
      const lim = P.nose ? GUIDE_NOSE : GUIDE_ERR;
      if (ms.length >= GUIDE_N && mid <= lim) why.push('stick');
      // (v184, todo 224: against every TV gunner's share - 2141 of 5596 missiles of 542 gunners in 168 rounds, TV_RATE -
      // not the round's other few: 13% of rounds named someone; good gunners hit 60-79% of 20-60)
      const o = P.tv ? TV_RATE : null;
      if (P.tv && P.n >= TV_N && binTail(P.hits, P.n, o) < TV_P) why.push('rate');
      if (!why.length) continue;
      const e0 = (P.errs.find(x => x.er <= lim) || P.errs[0] || {}).e || ev.find(e => e.type === 'throw' && pid(e.by) === P.i && MISSILES.has(e.kind) && (e.kind === 'TV missile') === P.tv);
      out.push({ t: e0.t, kind: 'guided', adm: true, actor: R.players[P.i].id, tv: P.tv, why, n: P.n, hits: P.hits, moving: ms.length, mid, others: o, what: [...P.kinds].join(', '), x: e0.path[0][1], y: e0.path[0][2] });
    }
  }
  // artillery
  const sh = ev.filter(e => e.type === 'throw' && SHELL_KINDS.has(e.kind) && e.path?.length);
  for (const kind of SHELL_KINDS) {
    const Ls = sh.filter(e => e.kind === kind), strikes = [];
    for (const e of Ls) { const S = strikes[strikes.length - 1]; if (S && e.t - S.L[S.L.length - 1].t <= 12) S.L.push(e); else strikes.push({ L: [e] }); }
    for (const S of strikes) {
      S.t = S.L[0].t; S.by = S.L.find(e => e.by)?.by ?? null;
      const guns = []; for (const e of S.L) { const o = e.path[0]; let g = guns.find(g => Math.hypot(g.x - o[1], g.y - o[2]) < 5); if (!g) guns.push(g = { x: o[1], y: o[2], ts: [] }); g.ts.push(e.t); }
      S.guns = guns.length; S.burst = Math.max(...guns.map(g => g.ts.length)); S.rof = Math.min(Infinity, ...guns.map(g => Math.min(Infinity, ...g.ts.slice(1).map((x, j) => x - g.ts[j]))));
      S.x = S.L.reduce((a, e) => a + e.path[e.path.length - 1][1], 0) / S.L.length; S.y = S.L.reduce((a, e) => a + e.path[e.path.length - 1][2], 0) / S.L.length;
    }
    strikes.forEach((S, j) => {
      const gap = j ? S.t - strikes[j - 1].t : null, why = [];
      if (gap !== null && gap <= ART_GAP) why.push('gap');
      if (S.burst > ART_BURST) why.push('burst');
      if (S.rof < ART_ROF) why.push('rof');
      if (!why.length) return;
      let by = S.by, sure = by !== null;
      if (!sure) { let bd = Infinity; for (const Q of strikes) if (Q.by !== null && Math.abs(Q.t - S.t) < bd) { bd = Math.abs(Q.t - S.t); by = Q.by; } }
      const bi = by != null ? pid(by) : undefined, side = bi !== undefined ? teamOf(bi, S.t) : [0, 1].find(tm => (kind === 'M777 shell') === /^(Us|Eu)$/.test(factionKey(tm)));
      out.push({ t: S.t, kind: 'arty', adm: true, actor: by ?? null, sure, gun: kind.replace(' shell', ''), side, gap, why, shells: S.L.length, guns: S.guns, burst: S.burst, rof: S.rof, prev: j ? strikes[j - 1].t : null, x: S.x, y: S.y });
    });
  }
  return out;
}
// ---------- aim, range and place hints (v131: the rest of the UnknownCheats list that a demo can show) ----------
// - No spread / range (BF2 NoSpread/NoShake, recoil macros): a small-arms kill further than such a weapon reaches with its
//   spread - shotguns NOSPREAD_D.shotgun m (the pellets lose damage from 30-40 m: Remington / DAO-12 / Jackhammer...),
//   pistols .pistol, SMGs .smg, other rifles and machine guns .rifle (sniper rifles left out) - or further than its bullet
//   flies at all (the projectile's timeToLive x the weapon's velocity: BULLET_REACH, 150 m for a shotgun's pellets, 300 m
//   for a pistol's). 9 rounds, 939 such kills on foot: the furthest shotgun kill 14 m, pistol 108, SMG 56, rifle 161.
// - Triggerbot (Autoshooter): the kill comes the moment his aim lands on the enemy. Kills 8 m or more away where his
//   view came onto the victim (within 1 deg + the body's half width) from 5 deg or more off in the second before and
//   the kill followed within TRIG_ON s: 16% of 112 such kills; the hint, TRIG_N or more of them and odds under TRIG_P
//   against the round's others. (v136) With the fire buttons in the demo: his trigger press that fired the kill began
//   0.05 s before to TRIG_PRESS s after his aim landed (a hand needs longer; not when he was already firing as his aim
//   swept on): 9 rounds, 11 of 119 such kills (9%), nobody more than 2.
// - Smooth aim (an aimbot without a snap): kills 10 m or more away of a target moving across his view (4 deg/s or more
//   over the last second): the middle angle between his view and the victim over that second. 146 such kills: middle
//   8.3 deg, the lowest 0.5; per player the lowest middle 2.6 (3 kills). The hint: SMOOTH_N or more with the middle of
//   them SMOOTH_ERR or less.
// - Target switch ("closest target" aimbots): two small-arms kills of two enemies SWITCH_DT s or less apart, SWITCH_A
//   deg or more apart as he saw them. 9 rounds: the quickest such pair 1.5 s (115 deg).
// - Pre-aim (ESP, radar): the victim came into his sight after 1 s or more hidden (engagement) and his view was already
//   on him then. 13% of 104 such kills, nobody with more than 2 of 4-5; the hint, PRE_N or more and odds under PRE_P.
// - Spots unseen (radar, minimap hacks): soldiers he spotted (the spotter is in the demo since v132; a repeat of the same
//   target within 3 s counted once) that nobody of his side could see then (canSee, 0.3 s before the spot): 9 rounds,
//   26% of 1258 such spots; the most for one player with 12+ of them about half (17 of 35). The hint: BLIND_N or more and
//   BLIND_SHARE of his spots.
// - Under the map (glitches): alive on foot UNDER_D m or more under the ground for UNDER_T s. 9 rounds: nobody even 1 m
//   for 0.5 s.
// - Parachute (v140; the parachute hack rebinds the controls so the mouse wheel drives the parachute: faster, up, loops):
//   under his parachute (its own flight, since v140) faster than CHUTE_H m/s across, or rising CHUTE_UP m/s or more, over
//   a second. 78 demos (=FL=, 2F4Y Dalian, Wake, test rounds): 143 parachutes, 18 of them with 3 s or more of flight (the
//   rest opened just over the ground off a roof) - 11.6 m/s across at the most, 9 typical, and always coming down,
//   4.4 m/s at the least (5-7 typical; up to 26 just after opening, from a free fall).
const CHUTE_H = 15, CHUTE_UP = 1;
const SPREAD_CLASS = { shotgun: [5380, 5382, 5398, 5439, 5483, 5487], pistol: [5372, 5374, 5417, 5419, 5462, 5464], smg: [5376, 5390, 5429, 5450, 5482], sniper: [5384, 5400, 5431, 5478, 5489, 5491] };
const NOSPREAD_D = { shotgun: 40, pistol: 150, smg: 120, rifle: 250 }, BULLET_REACH = { 5370: 500, 5372: 300, 5374: 300, 5376: 500, 5378: 500, 5380: 150, 5382: 150, 5384: 1000, 5388: 1000, 5390: 1000, 5392: 500, 5394: 500, 5398: 150, 5400: 1000, 5402: 500, 5413: 500, 5415: 500, 5417: 300, 5419: 300, 5425: 500, 5427: 500, 5429: 500, 5431: 1000, 5433: 500, 5435: 500, 5437: 500, 5439: 1000, 5444: 1000, 5446: 1000, 5448: 500, 5450: 1000, 5458: 500, 5462: 300, 5464: 300, 5468: 1000, 5470: 500, 5472: 500, 5474: 500, 5476: 500, 5478: 1000, 5480: 500, 5482: 500, 5483: 150, 5485: 500, 5487: 150, 5489: 1000, 5491: 1000 };
const TRIG_ON = 0.15, TRIG_PRESS = 0.12, TRIG_N = 6, TRIG_P = 0.001, SMOOTH_ERR = 1.2, SMOOTH_N = 3, SMOOTH_W = 4, SWITCH_DT = 0.8, SWITCH_A = 40, PRE_N = 5, PRE_P = 0.001, BLIND_N = 12, BLIND_SHARE = 0.75, UNDER_D = 1.5, UNDER_T = 2;
const wClass = wid => { for (const [k, L] of Object.entries(SPREAD_CLASS)) if (L.includes(wid)) return k; return 'rifle'; };
function aimHints(R) {
  const out = [], pid = id => R.pidx.get(id), DEG = Math.PI / 180, D = losData(), med = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
  const tol = d => Math.atan2(0.45, Math.max(d, 1)) / DEG + 1;
  const sgn = (a, b) => { let x = (a - b) % (2 * Math.PI); if (x > Math.PI) x -= 2 * Math.PI; if (x < -Math.PI) x += 2 * Math.PI; return x; };
  const trig = new Map(), smooth = new Map(), pre = new Map(), lastK = new Map(); let TN = 0, TQ = 0, PN = 0, PQ = 0;
  const bump = (M, i, f) => { let o = M.get(i); if (!o) M.set(i, o = { n: 0, q: 0, L: [], first: null }); f(o); };
  for (const e of R.events) {
    if (e.type !== 'kill' || e.killer === e.victim) continue;
    const ki = pid(e.killer), vi = pid(e.victim); if (ki === undefined || vi === undefined || R.players[ki].vehicle) continue;
    if (killCause(e, false) !== 'small' || /knife|defib/i.test(e.weapon || '')) continue;
    const q0 = playerAt(ki, e.t - 0.05), o0 = playerAt(vi, e.t - 0.05); if (!q0.alive || q0.veh || !o0.alive || teamOf(ki, e.t) === teamOf(vi, e.t)) continue;
    const dist = Math.hypot(q0.x - o0.x, q0.y - o0.y, (q0.h ?? 0) - (o0.h ?? 0)), cls = wClass(e.wid);
    // no spread / range
    if (cls !== 'sniper' && (dist > NOSPREAD_D[cls] || (BULLET_REACH[e.wid] && dist > BULLET_REACH[e.wid] * 0.98)))
      out.push({ t: e.t, kind: 'spread', adm: true, actor: e.killer, kill: e, d: dist, cls, lim: NOSPREAD_D[cls], reach: BULLET_REACH[e.wid] || null, x: e.x, y: e.y });
    // his view and the line to the victim over the 2 s before (every 0.1 s)
    const err = [], brg = [];
    for (let k = 20; k >= 0; k--) { const tt = e.t - 0.05 - k * 0.1, q = looking(ki, tt), o = playerAt(vi, tt); if (!q || !o.alive || !Number.isFinite(o.x)) { err.push(null); brg.push(null); continue; } const b = Math.atan2(o.x - q.x, o.y - q.y); brg.push(b); err.push(Math.abs(sgn(b, q.yaw)) / DEG); }
    // target switch
    { const b = brg[20], p = lastK.get(ki); if (p && p.vi !== vi && e.t - p.t <= SWITCH_DT && b != null && p.b != null) { const a = Math.abs(sgn(b, p.b)) / DEG; if (a >= SWITCH_A) out.push({ t: p.t, kind: 'switch', adm: true, actor: e.killer, kill: e, a, dt: e.t - p.t, prev: p.e, x: e.x, y: e.y }); }
      if (b != null) lastK.set(ki, { t: e.t, b, vi, e }); }
    if (cls === 'sniper') continue;
    // triggerbot: when his view came onto him, and how long before the kill
    if (dist >= 8 && err[20] != null && err[20] <= tol(dist)) {
      let j = 20; while (j > 0 && err[j - 1] != null && err[j - 1] <= tol(dist)) j--;
      const before = err.slice(Math.max(0, j - 10), j).filter(x => x != null);
      if (j > 0 && before.length && Math.max(...before) >= 5) {
        // (v136) with the fire buttons in the data: the press that fired the kill began the moment his aim landed
        // (TRIG_PRESS s; not already firing as the aim swept on) - else, older rounds: the kill within TRIG_ON s
        const F = R.players[ki].fire, tOn = e.t - 0.05 - (20 - j) * 0.1;
        let quick = null;
        if (F) { const pr = F.filter(f => f[2] === 0 && f[0] <= e.t + 0.05 && f[1] >= e.t - 1).pop(); if (pr) { const dp = pr[0] - tOn; quick = dp >= -0.05 && dp < TRIG_PRESS; } }
        else quick = (20 - j) * 0.1 <= TRIG_ON + 1e-6;
        if (quick !== null) { TN++; if (quick) TQ++; bump(trig, ki, o => { o.n++; if (F) o.press = true; if (quick) { o.q++; if (!o.first) o.first = e; } }); }
      }
    }
    // smooth aim on a target moving across his view
    if (dist >= 10 && err.slice(10).every(x => x != null)) {
      const rates = []; for (let k = 11; k <= 20; k++) rates.push(Math.abs(sgn(brg[k], brg[k - 1])) / DEG / 0.1);
      if (med(rates) >= SMOOTH_W) { const m = med(err.slice(10)); bump(smooth, ki, o => { o.n++; o.L.push(m); if (!o.first || m < o.best) { o.first = e; o.best = m; } }); }
    }
    // pre-aim: on him the moment he came into sight after 1 s or more hidden
    const g = engagement(e);
    if (g && g.k != null && g.react != null && g.react <= 1.5 && dist >= 8) {
      let hidden = true; for (let m = 1; m <= 5 && hidden; m++) if (sees(ki, vi, g.k - m * 0.2) !== false) hidden = false;
      if (hidden) { const q = looking(ki, g.k), o = playerAt(vi, g.k); if (q && o.alive) { const on = Math.abs(sgn(Math.atan2(o.x - q.x, o.y - q.y), q.yaw)) / DEG <= tol(Math.hypot(o.x - q.x, o.y - q.y)); PN++; if (on) PQ++; bump(pre, ki, o2 => { o2.n++; if (on) { o2.q++; if (!o2.first) o2.first = e; } }); } }
    }
  }
  for (const [ki, o] of trig) { if (o.n < TRIG_N || !o.first) continue; const p = (TQ - o.q + 1) / (TN - o.n + 6); if (binTail(o.q, o.n, p) < TRIG_P) out.push({ t: o.first.t, kind: 'trigger', adm: true, actor: R.players[ki].id, q: o.q, n: o.n, others: p, ...(o.press ? { press: true } : {}), x: o.first.x, y: o.first.y }); }
  for (const [ki, o] of smooth) { if (o.n < SMOOTH_N) continue; const m = med(o.L); if (m <= SMOOTH_ERR) out.push({ t: o.first.t, kind: 'smooth', adm: true, actor: R.players[ki].id, n: o.n, mid: m, x: o.first.x, y: o.first.y }); }
  for (const [ki, o] of pre) { if (o.n < PRE_N || !o.first) continue; const p = (PQ - o.q + 1) / (PN - o.n + 6); if (binTail(o.q, o.n, p) < PRE_P) out.push({ t: o.first.t, kind: 'preaim', adm: true, actor: R.players[ki].id, q: o.q, n: o.n, others: p, x: o.first.x, y: o.first.y }); }
  // spots of soldiers nobody of his side could see (only for those with BLIND_N or more spots worked out as theirs; not
  // those he made as commander - v149)
  if (R.meta.source === 'demo' && D) {
    const per = new Map();
    // (v132: a repeat of the same target by him within 3 s is one spot - the demo now has every repeat)
    for (const e of R.events) { if (e.type !== 'spot' || !e.target || e.target[0] !== 'p') continue; const ti = pid(e.target); if (ti === undefined) continue; const s = spotterOf(e); if (!s || s.alt || s.p < 0.45 || asCmdr(R, s.i, e.t)) continue; if (!per.has(s.i)) per.set(s.i, []); const L = per.get(s.i), last = L.findLast(x => x[1] === ti); if (last && e.t - last[0].t < 3) continue; L.push([e, ti]); }
    for (const [i, L] of per) {
      if (L.length < BLIND_N) continue;
      let blind = 0, known = 0, first = null;
      // (v133) while his side has a UAV up, the enemy is on its minimap: those spots are not counted
      const uavUp = (tm, tt) => { let on = false; for (const u of R.events) { if (u.t > tt) break; if (u.type === 'uav' && u.team === tm) on = u.on && (u.until == null || tt < u.until); } return on; };
      for (const [e, ti] of L) {
        const tt = e.t - 0.3, tm = teamOf(i, tt); let seen = false, any = false;
        if (uavUp(tm, tt)) continue;
        for (let j = 0; j < R.players.length && !seen; j++) { if (R.players[j].vehicle || teamOf(j, tt) !== tm || !playerAt(j, tt).alive) continue; const c = canSee(j, ti, tt); if (c !== null) any = true; if (c === true) seen = true; }
        if (!any) continue; known++; if (!seen) { blind++; if (!first) first = e; }
      }
      if (blind >= BLIND_N && blind >= BLIND_SHARE * known) { const q = playerAt(i, first.t); out.push({ t: first.t, kind: 'blindspot', adm: true, actor: R.players[i].id, blind, n: known, x: q.alive ? q.x : null, y: q.alive ? q.y : null }); }
    }
  }
  // parachute
  R.players.forEach((pl, i) => {
    if (pl.vehicle || !pl.chute) return; let best = null;
    for (const [a, b] of pl.chute) for (let tt = a + 0.3; tt + 1 <= b - 0.2; tt += 0.25) {
      const p = playerAt(i, tt), q = playerAt(i, tt + 1); if (!p.alive || !q.alive || !Number.isFinite(p.x) || !Number.isFinite(q.x)) continue;
      const hs = Math.hypot(q.x - p.x, q.y - p.y), up = q.h - p.h, sc = Math.max(hs / CHUTE_H, up / CHUTE_UP);
      if ((hs > CHUTE_H || up >= CHUTE_UP) && (!best || sc > best.sc)) best = { t: tt, hs, up, sc, x: p.x, y: p.y, dur: b - a };
    }
    if (best) out.push({ t: best.t, kind: 'chute', adm: true, actor: pl.id, hs: best.hs, up: best.up, dur: best.dur, x: best.x, y: best.y });
  });
  // under the map
  if (D) {
    const { times: T, n, X, Y, HH, L, VT, DN } = R, F = T.length;
    R.players.forEach((pl, i) => {
      if (pl.vehicle) return; let run = null, best = null;
      const close = () => { if (run && run.t1 - run.t0 >= UNDER_T && (!best || run.depth > best.depth)) best = run; run = null; };
      for (let k = 0; k < F; k += 5) {
        const e = k * n + i; if (!L[e] || VT[e] || (DN && DN[e])) { close(); continue; }
        const dz = groundAt(D, X[e], Y[e]) - HH[e];
        if (dz >= UNDER_D) { if (!run) run = { t0: T[k], depth: 0, x: X[e], y: Y[e] }; run.t1 = T[k]; run.depth = Math.max(run.depth, dz); } else close();
      }
      close();
      if (best) out.push({ t: best.t0, kind: 'under', adm: true, actor: pl.id, depth: best.depth, dur: best.t1 - best.t0, x: best.x, y: best.y });
    });
  }
  return out;
}
// ---- part 6 (page line 7480) ----
let admFilter = 'all';
// chance of k or more of n with rate p
const binTail = (k, n, p) => { let s = 0, c = 1; for (let j = 0; j <= n; j++) { if (j > 0) c = c * (n - j + 1) / j; if (j >= k) s += c * Math.pow(p, j) * Math.pow(1 - p, n - j); } return s; };
// (v167, Sagara: "a player killed by a claymore in a flag's capture zone") - many servers' rules forbid claymores at flags:
// a kill by a claymore that lay inside a flag's capture zone (main bases left out - they can't be taken). Where it lay:
// where it was seen being put (cx, cy), else where the victim died. (v168: the zone as the game has it - zoneOf: the
// level's radius + 1.2 m round the pole's foot in 3D, wherever one can stand - not the level's radius on the map)
// (v169, Sagara: "add filter - claymore kill in for admin") and every claymore kill (clay: a list to go through, not a
// hint - left out of All and of the count): who, whom, how far from where it lay, at which flag's zone, a team kill
function clayCapHints(R) {
  const out = [];
  for (const e of R.events) {
    if (e.type !== 'kill' || e.killer === e.victim || !/claymore/i.test(e.weapon || '')) continue;
    const placed = e.cx !== undefined, x = placed ? e.cx : e.x, y = placed ? e.cy : e.y; if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    let best = null; (R.flags || []).forEach((f, k) => { if (f.main) return; const z = zoneOf(R, k); if (!z || !zoneHas(z, x, y)) return; const d = Math.hypot(x - f.x, y - f.y); if (!best || d < best.d) best = { f, d, r: z.R }; });
    if (best) out.push({ t: e.t, kind: 'claycap', adm: true, actor: e.killer, kill: e, flag: best.f.name, d: best.d, r: best.r, placed, x, y });
    const ki = R.pidx.get(e.killer), vi = R.pidx.get(e.victim), tk = ki !== undefined && vi !== undefined && teamOf(ki, e.t) === teamOf(vi, e.t);
    out.push({ t: e.t, kind: 'clay', adm: true, info: true, actor: e.killer, kill: e, placed, dv: placed && Number.isFinite(e.x) ? Math.hypot(e.x - e.cx, e.y - e.cy) : null, flag: best ? best.f.name : null, tk, x, y });
  }
  return out;
}
// (v170) his ping in ms at tt (the game's own, his Player ghost), and the most it was in [t0, t1]
const pingAt = (p, tt) => { const q = seriesAt(p?.ping, tt); return q ? q[1] : null; };
function pingPeak(p, t0, t1) { const L = p?.ping; if (!L) return null; let m = pingAt(p, t0); for (const q of L) { if (q[0] > t1) break; if (q[0] >= t0) m = Math.max(m ?? 0, q[1]); } return m; }
const SNAP_N = 3, HS_P = 1e-4;   // (v182: see above)
// (v184, todo 146: the second analysis archive - 675 rounds with v182 / v183's sight, the same rounds' v175-v177 figures in
// the first) No line of sight: 0.68% of small-arms kills, one such kill in 266 of 289 soldier-rounds that have any, in 26%
// of rounds - mostly a gap of the shapes (a tree's crown, a barrel, the ground's grid); a soldier with two or more in a
// round: 23 soldier-rounds (3% of rounds), the most unlikely 4 of 7 kills. Through smoke: one in 144 of 147.
// (v185) Beyond fog the same: 42 hints, one in 16 of the 20 soldier-rounds with any (1.07-1.6 times the fog - a target
// seen through the fog's edge, a spotted one); the other 4 had 3-9 (tolulublessss 8, Shukrija 3)
const HINT_N = { wall: 2, smoke: 2, fog: 2 };
const LAG_PING = 250, PING_KINDS = new Set(['tele', 'snap', 'react', 'speed', 'vspeed', 'wall', 'thru', 'track']);
// (v185, todo 185) glitch spots: server/glitch.mjs keeps a grid of the places soldiers stood, alive on foot, over every
// round of each map (2 m cells, 2.5 m high); data/stats/glitch/<map>.json lists the rounds where someone stayed 20 s or
// more where no one else ever stood, while 3 or more other players stood in those columns 5-40 m above or below him -
// for maps with 30+ rounds looked at. Only on the site (a demo opened from a file: its round is not in the grids)
const GLITCH_V = 1, GLITCH = new Map();
function glitchData() {
  const nm = $('#srcLabel').textContent; if (!session?.server || !round || !srvRound(nm)) return null;
  const f = mapKey().replace(/[^a-z0-9_-]/g, '_'); if (!f) return null;
  const o = GLITCH.get(f); if (o !== undefined) return o === 'loading' ? undefined : o;
  GLITCH.set(f, 'loading'); const R = round;
  fetch('/admin/api/data/glitch/' + f + '.json', { cache: 'no-cache', credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).catch(() => null)
    .then(d => { GLITCH.set(f, d && d.gv === GLITCH_V && d.hits ? d : null); if (round === R) { R._adm = null; renderAdmin(); } });
  return undefined;
}
function adminHints() {
  if (round._adm) return round._adm;
  const R = round, pid = id => R.pidx.get(id), D = losData(), out = [], DEG = Math.PI / 180, hs = new Map(), snaps = [];
  for (const e of R.events) {
    if (e.type !== 'kill' || e.killer === e.victim) continue;
    const ki = pid(e.killer), vi = pid(e.victim); if (ki === undefined || vi === undefined || R.players[ki].vehicle) continue;
    const tt = e.t - 0.05, q = playerAt(ki, tt), o = playerAt(vi, tt);
    if (teamOf(ki, e.t) === teamOf(vi, e.t)) { out.push({ t: e.t, kind: 'tk', adm: true, actor: e.killer, kill: e, veh: q.veh || '', x: e.x, y: e.y }); continue; }
    if (q.veh || killCause(e, false) !== 'small' || /knife|defib/i.test(e.weapon || '')) continue;
    if (e.hit && !SNIPER_W.test(e.weapon || '')) {
      let h = hs.get(ki); if (!h) hs.set(ki, h = { n: 0, head: 0, first: null, w: new Map() });
      h.n++; h.w.set(e.weapon, (h.w.get(e.weapon) || 0) + 1); if (e.hit === 'head') { h.head++; if (!h.first) h.first = e; }
    }
    if (!q.alive || !o.alive) continue;
    if (D && q.h != null && o.h != null) {
      let k = 0, clear = false;
      for (; k <= 50; k++) {
        const tq = tt - k * 0.1, a = playerAt(ki, tq), b = playerAt(vi, tq); if (!a.alive || !b.alive || a.h == null || b.h == null) break;
        if (bodyLines(D, a, eyeOf(ki, a, tq), vi, b, tq)[0] > 0) { clear = true; break; }
      }
      // (the grid can't see through: checked again against the exact shapes; until they are loaded the kill waits)
      if (k >= 7) {
        const G = geoData(true);
        if (G === undefined) out.wait = (out.wait || 0) + 1;
        else if (G === null) out.push({ t: e.t, kind: 'wall', adm: true, actor: e.killer, kill: e, hidden: clear ? k * 0.1 : null, rough: true, x: e.x, y: e.y });
        else {
          let k2 = 0, clear2 = false;
          for (; k2 <= 50; k2++) {
            const tq = tt - k2 * 0.1, a = playerAt(ki, tq), b = playerAt(vi, tq); if (!a.alive || !b.alive || a.h == null || b.h == null) break;
            if (bodyClearExact(D, G, a, eyeOf(ki, a, tq), vi, b, tq)) { clear2 = true; break; }
          }
          if (k2 >= 7) {
            const ey = eyeOf(ki, q, tt), sv = o.veh ? 0 : stanceNow(R.players[vi], tt) ?? 0, by = exactHit(D, G, q.x, q.y, ey, o.x, o.y, o.h + (o.veh ? 0.9 : AIM_H[sv][1]), false, tt);
            // (v180) only what bullets go through in the way (wood boards, thin metal, plastic, cloth - the game's material
            // table): a bullet could get there - not "No line of sight" but "Through thin walls", listed apart (info)
            let thru = false;
            if (G.penKnown) for (let k3 = 0; k3 <= 6 && !thru; k3++) { const tq = tt - k3 * 0.1, a = playerAt(ki, tq), b = playerAt(vi, tq); if (!a.alive || !b.alive || a.h == null || b.h == null) break; thru = bodyClearExact(D, G, a, eyeOf(ki, a, tq), vi, b, tq, true); }
            out.push({ t: e.t, kind: thru ? 'thru' : 'wall', adm: true, ...(thru ? { info: true } : {}), actor: e.killer, kill: e, hidden: clear2 ? k2 * 0.1 : null, by, x: e.x, y: e.y });
          }
        }
      }
    }
    let best = null;
    for (let k = 0; k <= 15; k++) {
      const t1 = e.t - k * 0.1, t0 = t1 - 0.1, a1 = playerAt(ki, t1), a0 = playerAt(ki, t0), b1 = playerAt(vi, t1), b0 = playerAt(vi, t0);
      if (!a0.alive || !b0.alive || !a1.alive || !b1.alive) break;
      const d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y); if (d1 < 5) continue;
      const off1 = angOff(Math.atan2(b1.x - a1.x, b1.y - a1.y), a1.yaw) / DEG, off0 = angOff(Math.atan2(b0.x - a0.x, b0.y - a0.y), a0.yaw) / DEG;
      if (off0 >= 30 && off1 <= 5 && (!best || off0 - off1 > best.from - best.to)) best = { from: off0, to: off1, turn: angOff(a1.yaw, a0.yaw) / DEG, before: k * 0.1, dist: d1 };
    }
    if (best) snaps.push({ t: e.t - best.before, kind: 'snap', adm: true, actor: e.killer, kill: e, ...best, x: e.x, y: e.y });
  }
  { const by = new Map(); for (const h of snaps) by.set(h.actor, (by.get(h.actor) || 0) + 1); for (const h of snaps) if (by.get(h.actor) >= SNAP_N) out.push({ ...h, of: by.get(h.actor) }); }
  let N = 0, H = 0; for (const h of hs.values()) { N += h.n; H += h.head; }
  for (const [ki, h] of hs) {
    if (h.n < 6 || !h.first) continue;
    const p = (H - h.head + 2) / (N - h.n + 10);
    if (binTail(h.head, h.n, p) < HS_P) out.push({ t: h.first.t, kind: 'hs', adm: true, actor: R.players[ki].id, head: h.head, n: h.n, others: p, w: [...h.w].sort((a, b) => b[1] - a[1]), x: h.first.x, y: h.first.y });
  }
  for (const h of cheatHints(R)) out.push(h);
  if (R._tracks) for (const h of R._tracks) out.push(h);
  else if (!R._trackRun && D && geoData(true) !== undefined) { R._trackRun = true; wallTracks(R, L => { if (R !== round) return; R._tracks = L; R._trackP = 1; R._adm = null; renderAdmin(); }); }
  for (const h of moreHints(R)) out.push(h);
  for (const h of objHints(R)) out.push(h);
  for (const h of aimHints(R)) out.push(h);
  for (const h of clayCapHints(R)) out.push(h);
  if (R._geo) for (const h of R._geo) out.push(h);
  else if (!R._geoRun && D) { const tok = R._geoRun = {}; geoScan(R, L => { if (R !== round || R._geoRun !== tok) return; R._geo = L; R._adm = null; renderAdmin(); }); }
  for (const r of speedRuns(R)) if (r.t0 >= (R.times[0] || 0) + SPAWN_START) out.push({ t: r.t0, kind: 'speed', adm: true, actor: R.players[r.i].id, v: r.vmax, vavg: r.vavg, dur: r.dur, n: r.n, span: r.t1 - r.t0, dist: r.dist, x: (r.x + r.x1) / 2, y: (r.y + r.y1) / 2 });   // (v184: not in the round's first SPAWN_START s - the soldiers being put in place: 11 of 40 in 675 rounds)
  // (v185, todo 185) glitch spots: the server's grids of the places soldiers stood over the map's rounds (glitchData)
  { const GL = glitchData(), nm = $('#srcLabel').textContent;
    if (GL === undefined) out.glWait = true;
    else if (GL) for (const [id, name, t0, t1, x, y, h, others, up, down] of GL.hits[nm] || []) {
      let i = pid(id); if (i === undefined || R.players[i].vehicle || R.players[i].name.trim() !== name) i = R.players.findIndex(p => !p.vehicle && p.name.trim() === name);
      if (i === undefined || i < 0) continue;
      // with the map's shapes: where he was - his chest inside a shape, under the ground, in the air, on top of something (a
      // roof or a ledge no one else stood on: with the others only below him listed apart, as information), or on the
      // ground with the others over him (under a bridge: information)
      let where = D ? '' : null, info = false;
      if (D) {
        const OFF = brkOff(D, t0), g = groundAt(D, x, y), fl = floorUnder(D, x, y, h + 0.3, OFF, WATER[mapKey()] ?? -1e9);
        if (solidAt(D, x, y, h + 1, OFF)) where = 'inside'; else if (h < g - 1) where = 'under';
        else if (h - fl >= 1.5) where = 'air';
        else if (fl > g + 2) { where = 'top:' + Math.round(fl - g); info = up == null; }
        else { where = 'ground'; info = true; }   // (on the ground, others over him: under a bridge or a balcony)
      }
      out.push({ t: t0, kind: 'glitch', adm: true, ...(info ? { info: true } : {}), actor: R.players[i].id, dur: t1 - t0, h, others, up, down, where, rounds: GL.rounds, x, y });
    } }
  // (v184, todo 146) hints one honest kill gives too, only for a soldier with HINT_N[kind] or more of them in the round
  { const cnt = new Map(), key = h => h.kind + '|' + h.actor; for (const h of out) if (HINT_N[h.kind]) cnt.set(key(h), (cnt.get(key(h)) || 0) + 1);
    for (let i = out.length - 1; i >= 0; i--) { const h = out[i], nn = HINT_N[h.kind]; if (!nn) continue; const c = cnt.get(key(h)); if (c < nn) out.splice(i, 1); else h.of = c; } }
  out.sort((a, b) => a.t - b.t);
  out.noLos = !D;
  return (round._adm = out);
}
// ---------- (v175) a round's numbers for the analysis of many rounds (server/analyze.mjs; todo 146) ----------
// Opened as .../?analyze (the runner's headless browser on the server, over the site's own files and rounds),
// window.__bf2analyze opens a round as a link to it does, waits until its hints are done (the walls, trees and exact
// shapes load, and Wall tracking and the scan of the shapes run, after the round shows), and hands over what the hints'
// thresholds are to be set from - with no new run for each new threshold:
//   K  every kill; for small arms on foot also the killer's aim over the 2 s before (how far off the victim he looked,
//      every 0.1 s), how fast the victim crossed his view, since when he saw him (engagement), how long a clear sight
//      line was missing before (the 25 cm grid; the exact shapes when the grid says 0.3 s or more), when he pressed fire,
//      the fog limit, smoke;
//   H  every hint as it is now, with its figures (kill: the row in K; players: their row in R.players);
//   P  each soldier's totals; F every stretch of a flag's capture (its speed against the men in the zone); J every step
//      on foot of 4 m or more in one record (teleports, the decoder's gaps); S spots; V each vehicle type's speeds;
//   D  the decoder's counts (what it could not name, flags against the level's layout, records a second).
// Arrays rather than objects (a small file): the columns are in ANALYZE_COLS, handed over with the numbers.
const ANALYZE_V = 1;
// (v185, todo 226) the version of the hints' rules: the server's background analysis (analyze.mjs --auto) does a round
// again when it was done with an older one, and counts only rounds of this one over a player's rounds - raise it with
// any change of a hint's rule (not with every page)
const HINTS_V = 1;
const ANALYZE_COLS = {
  K: ['t', 'killer', 'victim', 'wid', 'weapon', 'cause', 'hit', 'tk', 'kveh', 'vveh', 'd', 'dz', 'cls', 'kst', 'vst', 'kv', 'vv', 'ping',
    'err', 'brgRate', 'react', 'eng', 'losK', 'losX', 'press', 'fog', 'smoke', 'pitchErr'],
  P: ['i', 'name', 'team', 'kills', 'deaths', 'tk', 'small', 'hsN', 'hsHead', 'spots', 'aliveS', 'footM', 'pingMed', 'sb'],
  F: ['flag', 't0', 't1', 'm', 'most', 'side', 'raise', 'whole', 'menSide', 'menOther', 'tm'],
  J: ['player', 't', 'd', 'dt', 'ping', 'near'],
  S: ['t', 'spotter', 'p', 'target', 'cmdr'],
  V: ['vehicle', 'n', 'max', 'p99', 'p90'],
  T: ['player', 'n', 'hits'],   // (v183: each TV missile gunner - from an aircraft - his missiles and hits)
  notes: { err: 'deg off the victim, 21 values: 2.0 s before the kill .. the kill (null: not known)', losK: 'records of 0.1 s back to a clear sight line on the grid (0: clear at the kill); 100 + k: none found in the k checked',
    losX: 'the same with the exact shapes (only when losK >= 3)', press: 's from the fire press that fired it to the kill', fog: 'distance / the map fog limit',
    near: 'bits: 1 a spawn, 2 a revive, 4 in a vehicle, within 5 s; 8 his last place held 0.8 s or more before (a gap in his records)', eng: 'first / even / second / ambush / blind' }
};
const arnd = (v, k = 2) => v == null || !Number.isFinite(v) ? null : +v.toFixed(k);
function analysisDump(R) {
  const t0 = performance.now(), pid = id => R.pidx.get(id), DEG = Math.PI / 180, D = losData(), G = D ? geoData(false) : null, errs = [];
  const sgn = (a, b) => { let x = (a - b) % (2 * Math.PI); if (x > Math.PI) x -= 2 * Math.PI; if (x < -Math.PI) x += 2 * Math.PI; return x; };
  const med = a => { const s = a.filter(x => x != null).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
  const part = (name, f) => { try { return f(); } catch (e) { errs.push(name + ': ' + (e && e.message || e)); return null; } };
  const { times: T, n, X, Y, HH, L, VT, DN } = R, F = T.length;
  // kills
  const kIdx = new Map(), K = [];
  part('kills', () => R.events.forEach(e => {
    if (e.type !== 'kill') return;
    kIdx.set(e, K.length);
    const ki = pid(e.killer), vi = pid(e.victim), tt = e.t - 0.05, row = new Array(ANALYZE_COLS.K.length).fill(null);
    row[0] = arnd(e.t); row[1] = ki ?? -1; row[2] = vi ?? -1; row[3] = e.wid ?? null; row[4] = e.weapon || null; row[6] = e.hit || null;
    K.push(row);
    if (ki === undefined || vi === undefined) return;
    const q = playerAt(ki, tt), o = playerAt(vi, tt), kp = R.players[ki];
    row[5] = killCause(e, !!(q.veh || kp.vehicle)); row[7] = e.killer !== e.victim && teamOf(ki, e.t) === teamOf(vi, e.t) ? 1 : 0;
    row[8] = kp.vehicle ? kp.name : q.veh || ''; row[9] = R.players[vi].vehicle ? R.players[vi].name : o.veh || '';
    if (Number.isFinite(q.x) && Number.isFinite(o.x)) { row[10] = arnd(Math.hypot(o.x - q.x, o.y - q.y, (o.h ?? 0) - (q.h ?? 0)), 1); row[11] = q.h != null && o.h != null ? arnd(o.h - q.h, 1) : null; }
    row[13] = stanceNow(kp, tt); row[14] = stanceNow(R.players[vi], tt); row[15] = arnd(q.speed, 1); row[16] = arnd(o.speed, 1); row[17] = pingAt(kp, e.t);
    if (e.killer === e.victim || row[7] || kp.vehicle || q.veh || !q.alive || !o.alive || row[5] !== 'small' || /knife|defib/i.test(e.weapon || '')) return;
    row[12] = wClass(e.wid);
    // his aim over the 2 s before (as aimHints)
    const err = [], brg = [];
    for (let k = 20; k >= 0; k--) {
      const t1 = tt - k * 0.1, a = looking(ki, t1), b = playerAt(vi, t1);
      if (!a || !b.alive || !Number.isFinite(b.x)) { err.push(null); brg.push(null); continue; }
      const g = Math.atan2(b.x - a.x, b.y - a.y); brg.push(g); err.push(arnd(Math.abs(sgn(g, a.yaw)) / DEG, 1));
    }
    row[18] = err;
    { const r = []; for (let k = 11; k <= 20; k++) if (brg[k] != null && brg[k - 1] != null) r.push(Math.abs(sgn(brg[k], brg[k - 1])) / DEG / 0.1); row[19] = arnd(med(r), 1); }
    const g = engagement(e); if (g) { row[20] = arnd(g.react); row[21] = g.kind; }
    if (D && q.h != null && o.h != null) {
      const back = exact => { let k = 0; for (; k <= 50; k++) { const t1 = tt - k * 0.1, a = playerAt(ki, t1), b = playerAt(vi, t1); if (!a.alive || !b.alive || a.h == null || b.h == null) break; if (exact ? bodyClearExact(D, G, a, eyeOf(ki, a, t1), vi, b, t1) : bodyLines(D, a, eyeOf(ki, a, t1), vi, b, t1)[0] > 0) return k; } return 100 + k; };
      row[22] = back(false); if (G && row[22] >= 3) row[23] = back(true);
      const ey = eyeOf(ki, q, tt), sv = stanceNow(R.players[vi], tt) ?? 0, hd = Math.hypot(o.x - q.x, o.y - q.y);
      if (q.pitch != null && hd > 1) row[27] = arnd((Math.atan2(o.h + AIM_H[sv][1] - ey, hd) - q.pitch) / DEG, 1);
    }
    const pr = (kp.fire || []).filter(f => f[2] === 0 && f[0] <= e.t + 0.05 && f[1] >= e.t - 1).pop(); if (pr) row[24] = arnd(e.t - pr[0]);
    if (row[10] != null) row[25] = arnd(row[10] / fogRange());
    let smoky = true; for (let k = 0; k <= 5 && smoky; k++) { const t1 = tt - k * 0.2, a = playerAt(ki, t1), b = playerAt(vi, t1); if (!a.alive || !b.alive || !smokeBlocks(a.x, a.y, b.x, b.y, t1)) smoky = false; }
    row[26] = smoky ? 1 : 0;
  }));
  // hints, with their figures (a kill: its row in K; an event: its time and kind; a player id: his row in R.players)
  const evRef = v => kIdx.has(v) ? { k: kIdx.get(v) } : { ev: v.type, t: arnd(v.t) };
  const san = (v, d = 0) => {
    if (v == null || typeof v === 'boolean' || typeof v === 'string') return v;
    if (typeof v === 'number') return arnd(v, 3);
    if (Array.isArray(v)) return d > 3 ? null : v.slice(0, 60).map(x => san(x, d + 1));
    if (v instanceof Set) return san([...v], d);
    if (v instanceof Map) return san([...v], d);
    if (typeof v === 'object') { if (v.type && v.t != null) return evRef(v); if (d > 3) return null; const o = {}; for (const [k, x] of Object.entries(v)) o[k] = san(x, d + 1); return o; }
    return null;
  };
  const H = part('hints', () => (round._adm || adminHints()).map(h => { const o = {}; for (const [k, v] of Object.entries(h)) o[k] = (k === 'actor' || k === 'vs') && v != null && pid(v) !== undefined ? pid(v) : san(v); return o; })) || [];
  // players (soldiers): totals
  const P = part('players', () => R.players.map((p, i) => {
    if (p.vehicle) return null;
    let kills = 0, deaths = 0, tk = 0, small = 0, hsN = 0, hsHead = 0;
    for (const r of K) { if (r[1] === i && r[2] !== i) { if (r[7]) tk++; else { kills++; if (r[12]) { small++; if (r[6] && !SNIPER_W.test(r[4] || '')) { hsN++; if (r[6] === 'head') hsHead++; } } } } if (r[2] === i) deaths++; }
    let alive = 0, foot = 0; for (let k = 0; k < F; k++) { const e = k * n + i; if (!L[e]) continue; alive++; if (k && L[e - n] && !VT[e] && !VT[e - n]) { const s = Math.hypot(X[e] - X[e - n], Y[e] - Y[e - n]); if (s < 4) foot += s; } }
    const pg = (p.ping || []).map(x => x[1]);
    return [i, p.name, teamOf(i, 0), kills, deaths, tk, small, hsN, hsHead, 0, arnd(alive * (T[1] - T[0] || 0.1), 0), Math.round(foot), med(pg), sbNow(p, R.duration)];
  }).filter(Boolean)) || [];
  // spots (who: the demo's spotter, else the page's guess and how sure)
  const S = part('spots', () => R.events.filter(e => e.type === 'spot').map(e => { const s = spotterOf(e), ti = e.target ? pid(e.target) : undefined; return [arnd(e.t), s ? s.i : -1, s ? arnd(s.p) : null, ti ?? -1, s && asCmdr(R, s.i, e.t) ? 1 : 0]; })) || [];
  for (const s of S) { if (s[1] < 0) continue; const r = P.find(x => x[0] === s[1]); if (r) r[9]++; }
  // flags: every stretch of one speed (objHints keeps them)
  const Fl = (R._capSegs || []).map(g => [g.k, arnd(g.t), arnd(g.t1), arnd(g.m, 3), g.most, g.side, g.raise ? 1 : 0, g.whole ? 1 : 0, g.cnt[g.side], g.cnt[1 - g.side], arnd(g.tm, 3)]);
  // steps on foot of 4 m or more in one record
  const J = part('jumps', () => {
    const out = [], rev = new Map(); for (const e of R.events) if (e.type === 'revive') { const i = pid(e.player); if (i !== undefined) { if (!rev.has(i)) rev.set(i, []); rev.get(i).push(e.t); } }
    R.players.forEach((p, i) => {
      if (p.vehicle) return; const sp = (p.kits || []).map(x => x[0]), rv = rev.get(i) || []; let lastVeh = -1e9;
      for (let k = 1; k < F && out.length < 400; k++) {
        const e = k * n + i, e0 = e - n; if (VT[e]) lastVeh = T[k];
        if (!L[e] || !L[e0] || VT[e] || VT[e0]) continue;
        const d = Math.hypot(X[e] - X[e0], Y[e] - Y[e0]); if (d < 4) continue;
        let kf = k - 1; while (kf > 0 && X[kf * n + i] === X[(kf - 1) * n + i] && Y[kf * n + i] === Y[(kf - 1) * n + i]) kf--;
        const near = (sp.some(s => Math.abs(s - T[k]) < 5) ? 1 : 0) | (rv.some(s => Math.abs(s - T[k]) < 5) ? 2 : 0) | (T[k] - lastVeh < 5 ? 4 : 0) | (T[k - 1] - T[kf] >= 0.8 ? 8 : 0);
        out.push([i, arnd(T[k]), arnd(d, 1), arnd(T[k] - T[k - 1]), pingAt(p, T[k]), near]);
      }
    });
    return out;
  }) || [];
  // vehicles: speed over each second it moved (2 m/s or more; a second with a step of 60 m or more in one record - made
  // again at its spawn - left out), by its kind (the name without its number)
  const V = part('vehicles', () => {
    const by = new Map(), step = Math.max(1, Math.round(1 / (T[1] - T[0] || 0.1)));
    R.players.forEach((p, j) => {
      if (!p.vehicle) return; const nm = p.name.replace(/ \d+$/, ''); let a = by.get(nm); if (!a) by.set(nm, a = []);
      for (let k = step; k < F; k += step) {
        const e = k * n + j, e0 = e - step * n; if (!L[e] || !L[e0]) continue;
        let jump = false; for (let q = k - step + 1; q <= k && !jump; q++) { const b = q * n + j; if (!L[b] || !L[b - n] || Math.hypot(X[b] - X[b - n], Y[b] - Y[b - n], HH[b] - HH[b - n]) >= 60) jump = true; }
        const v = Math.hypot(X[e] - X[e0], Y[e] - Y[e0], HH[e] - HH[e0]) / (T[k] - T[k - step]); if (!jump && v >= 2) a.push(v);
      }
    });
    return [...by].map(([nm, a]) => { a.sort((x, y) => x - y); const at = f => a.length ? arnd(a[Math.min(a.length - 1, Math.floor(a.length * f))], 1) : null; return [nm, a.length, at(1), at(0.99), at(0.9)]; });
  }) || [];
  // the decoder's counts
  const Dc = part('decoder', () => {
    const ev = {}; for (const e of R.events) ev[e.type] = (ev[e.type] || 0) + 1;
    const mi = GAME.maps[mapKey()], lay = mi ? Object.fromEntries(Object.entries(mi.layouts || {}).map(([k, v]) => [k, v.length])) : null;   // (the round's game mode is not in its timeline)
    const recs = []; R.players.forEach((p, i) => { if (p.vehicle) return; let a = 0, c = 0; for (let k = 1; k < F; k++) { const e = k * n + i; if (!L[e]) continue; a++; if (X[e] !== X[e - n] || Y[e] !== Y[e - n]) c++; } if (a > 100) recs.push(c / a); });
    return {
      events: ev, players: R.players.filter(p => !p.vehicle).length, vehicles: R.players.filter(p => p.vehicle).length,
      unnamedVehicles: R.players.filter(p => p.vehicle && /^Vehicle #|^#/.test(p.name)).map(p => p.name),
      killsNoWeapon: K.filter(r => !r[4]).length, killsNoKiller: K.filter(r => r[1] < 0).length,
      unnamedWeapons: [...new Set(K.filter(r => r[4] && /^#|template|^\d+$/i.test(r[4])).map(r => r[4]))],
      flags: (R.flags || []).length, layoutFlags: lay, flagNames: (R.flags || []).map(f => f.name),
      moving: arnd(med(recs), 3), frames: F, step: arnd(T[1] - T[0], 3), noLos: !D, noGeo: !G
    };
  });
  return { v: ANALYZE_V, page: APP_VERSION, hv: HINTS_V, cols: ANALYZE_COLS, name: $('#srcLabel').textContent, map: mapKey(), meta: R.meta, stats: R.raw?.stats || null, dur: arnd(R.duration, 1),
    K, H, P, S, F: Fl, J, V, T: R._tvStat || [], D: Dc, errs, ms: Math.round(performance.now() - t0) };
}
if (/[?&]analyze\b/.test(location.search)) window.__bf2analyze = {
  v: ANALYZE_V, page: APP_VERSION, hv: HINTS_V,
  ready: () => !!(session && session.server),
  rounds: () => session.rounds.filter(r => r.status === 'done').map(r => r.name),
  // open a round of the site's list, as a link to it does: true when it is the round on show
  async open(name) {
    const r = findSrv(name); if (!r) return 'not in the list';
    await openServerRound(r);
    return round && $('#srcLabel').textContent === r.name ? true : ($('#notice').textContent || 'did not open').slice(0, 300);
  },
  // wait (at most maxS s) until the map's files are in and the hints done, then the numbers
  async dump(maxS = 600) {
    const R = round, t0 = performance.now(), sleep = ms => new Promise(r => setTimeout(r, ms)); let waited = false;
    for (;;) {
      losData(); vegData(); if (round !== R) return { error: 'the round changed' };
      const k = mapKey(), D = LOS.get(k) && LOS.get(k) !== 'loading' ? LOS.get(k) : null;
      if (D) geoData(true);
      R._adm = null; const A = adminHints();
      const busy = LOS.get(k) === 'loading' || VEG.get(k) === 'loading' || (D && (GEO.get(k) === 'loading' || !R._tracks || !R._geo)) || A.wait > 0 || A.glWait;
      if (!busy) break;
      if (performance.now() - t0 > maxS * 1000) { waited = true; break; }
      await sleep(400);
    }
    const out = analysisDump(R); out.waitMs = Math.round(performance.now() - t0 - out.ms); if (waited) out.errs.push('timed out waiting for the hints'); return out;
  }
};
// what stood between them (the line to his chest at the kill): an object and its material (some let bullets through:
// thin metal, boards, cloth - v180: by the game's material table, the shapes' pen; before, by the material's name), the
// ground or a tree
const PEN_MAT = /penetr|pentrable|thin|cardboard|paper|cloth|carpet|canvas|fabric|particleboard|blinds|plastic|^wood$/;
function wallBy(h) {
  if (h.rough) return ' (rough check: no exact shapes for this map)';
  const b = h.by; if (!b) return '';
  if (b.what === 'ground') return ' · in the way: the ground (a hill or a slope)';
  if (b.what === 'tree') return ' · in the way: a tree trunk';
  const nm = s => esc(String(s || '').replace(/_/g, ' '));
  return ` · in the way: ${nm(b.o)} (${nm(b.mat)}${(b.pen ?? PEN_MAT.test(b.mat || '')) ? ' - bullets go through' : ''})`;
}
// [badge, html line, plain text] of an admin hint
// (v170) the hints about movement and aim say his ping then (the game's own): lag makes jumps, snaps and odd times
function admDescribe(h) {
  const r = admDescribe0(h); if (!PING_KINDS.has(h.kind) || !round) return r;
  const id = h.kill ? h.kill.killer : h.actor, i = id != null ? round.pidx.get(id) : undefined; if (i === undefined) return r;
  const pg = pingAt(round.players[i], h.t), pk = pingPeak(round.players[i], h.t - 10, h.t + 2); if (pg == null) return r;
  r[1] = r[1].replace(/<\/span>$/, ` · ping ${pg} ms${pk != null && pk >= pg + 50 ? ` (up to ${pk} ms just before)` : ''}</span>`); return r;
}
function admDescribe0(h) {
  const pn = id => { const i = round.pidx.get(id); return i === undefined ? '' : `<span class="t${teamOf(i, h.t)}">${esc(round.players[i].name)}</span>`; };
  const pt = id => hlName(id, h.t) || '', e = h.kill;
  if (h.kind === 'hs') return [h.head + '/' + h.n, `<b>Headshots</b> ${pn(h.actor)} <span class="w">${h.head} of ${h.n} kills (the others in this round ${Math.round(h.others * 100)}%; by chance less than once in ${Math.round(1 / HS_P).toLocaleString('en')}) · ${h.w.slice(0, 3).map(([w, c]) => esc(w || 'no weapon') + ' ' + c).join(', ')}</span>`, `Headshots: ${pt(h.actor)}, ${h.head} of ${h.n} kills`];
  if (h.kind === 'reach') return [h.d.toFixed(1) + ' m', `<b>Melee reach</b> ${pn(e.killer)} → ${pn(e.victim)} <span class="w">a ${h.what} kill from ${h.d.toFixed(1)} m away at the nearest (it reaches ${h.reach} m)</span>`, `Melee reach: ${pt(e.killer)} → ${pt(e.victim)}, ${h.what} from ${h.d.toFixed(1)} m`];
  if (h.kind === 'rate') return [h.gap.toFixed(1) + ' s', `<b>Fire rate</b> ${pn(h.actor)} <span class="w">${h.launch ? 'two ' + esc(h.what) + ' launches' : 'two ' + esc(h.what) + ' kills (separate shots)'} ${h.gap.toFixed(2)} s apart - it can't fire again for ${h.lim} s</span>`, `Fire rate: ${pt(h.actor)}, ${h.what} ${h.gap.toFixed(2)} s apart`];
  if (h.kind === 'ammo') return [h.n + '×', `<b>Ammo</b> ${pn(h.actor)} <span class="w">${h.n} × ${esc(h.what)} in one life (over ${Math.round(h.span)} s; a kit holds ${h.holds}${h.picks ? `; he may have picked up ${h.picks} more kit${h.picks > 1 ? 's' : ''} with it` : ''}${h.bags ? `; walked over ${h.bags} ammo bag${h.bags > 1 ? 's' : ''}` : ''}${h.sup ? `; a support with his bag out came near ${h.sup} time${h.sup > 1 ? 's' : ''}` : ''}${h.crates ? `; at a supply crate ${h.crates} time${h.crates > 1 ? 's' : ''}` : ''}${h.kits > 1 ? ` - ${h.kits} full loads in all` : ', no ammo bag, support or supply crate near him'})</span>`, `Ammo: ${pt(h.actor)}, ${h.n} × ${h.what} in one life`];
  if (h.kind === 'fov') return [h.q + '/' + h.n, `<b>Wide view</b> ${pn(h.actor)} <span class="w">a weak sign: ${h.q} of ${h.n} times an enemy he could see came ${FOV_IN}-${FOV_OUT}° to the side of where he looked - just outside the game's ${Math.round(FOV_HALF * 2)}° view - with no shot, spot or hit to give him away, he turned to him within ${FOV_REACT} s (the round's others ${Math.round(h.others * 100)}%). A wider view than the game's (an ultrawide FOV hack) would do that; so can sound, the minimap or a team mate's call</span>`, `Wide view: ${pt(h.actor)}, ${h.q} of ${h.n}`];
  if (h.kind === 'wallfire') return [h.n > 1 ? h.n + '×' : h.dur.toFixed(1) + ' s', `<b>Fired at a wall</b> ${pn(h.actor)} → ${pn(h.vs)} <span class="w">${h.n > 1 ? `${h.n} times this round he held the trigger (${WF_T0} s or more, ${h.total.toFixed(1)} s in all) on an enemy behind walls or a hill he hadn't seen in the ${WF_PRE} s before; the longest ` : 'held the trigger '}${h.dur.toFixed(1)} s on end with his crosshair on him behind cover, ${Math.round(h.d)} m away · ${esc(h.w)} · ${h.last === null ? 'not seen in the 6 s before' : `last seen ${h.last.toFixed(1)} s before`} · nobody in sight near his crosshair</span>`, `Fired at a wall: ${pt(h.actor)} → ${pt(h.vs)}, ${h.n > 1 ? h.n + ' times' : h.dur.toFixed(1) + ' s'}`];
  if (h.kind === 'track') return [h.dur.toFixed(1) + ' s', `<b>Wall tracking</b> ${pn(h.actor)} → ${pn(h.vs)} <span class="w">his view followed him behind cover for ${h.dur.toFixed(1)} s as he moved ${Math.round(h.turn)}° across, ${Math.round(h.d)} m away</span>`, `Wall tracking: ${pt(h.actor)} → ${pt(h.vs)}, ${h.dur.toFixed(1)} s`];
  if (h.kind === 'speed') return [h.v.toFixed(0) + ' m/s', `<b>Speed</b> ${pn(h.actor)} <span class="w">on foot at up to ${h.v.toFixed(1)} m/s for ${h.dur.toFixed(1)} s${h.n > 1 ? ' in ' + h.n + ' stretches over ' + Math.round(h.span) + ' s' : ''} (${Math.round(h.dist)} m, ${h.vavg.toFixed(1)} m/s on average) · the game's sprint is ${SPEED_RUN} m/s</span>`, `Speed: ${pt(h.actor)} ${h.v.toFixed(1)} m/s for ${h.dur.toFixed(1)} s`];
  if (h.kind === 'react') return [h.q + '/' + h.n, `<b>Reaction</b> ${pn(h.actor)} <span class="w">${h.q} of ${h.n} kills within ${REACT_Q} s of first seeing the victim (the others in this round ${Math.round(h.others * 100)}%; his middle ${h.med.toFixed(1)} s) · a man needs about 0.2 s just to react</span>`, `Reaction: ${pt(h.actor)}, ${h.q} of ${h.n} kills within ${REACT_Q} s`];
  if (h.kind === 'stam' && h.how) return [Math.round(h.dur) + ' s', `<b>Stamina</b> ${pn(h.actor)} <span class="w">${h.how === 'empty' ? `ran at sprint speed ${h.dur.toFixed(1)} s with his sprint used up (stamina 0 of 31) - the game stops the sprint then` : `sprinted ${h.dur.toFixed(1)} s with his stamina staying at ${h.sv} of 31 - it goes down ~4 a second while he sprints`} (${Math.round(h.dist)} m) · honest play: up to 3 s on a server that lets him / 12 s</span>`, `Stamina: ${pt(h.actor)} ${h.how === 'empty' ? 'sprinted with no stamina' : 'stamina not going down'} for ${h.dur.toFixed(1)} s`];
  if (h.kind === 'stam') return [Math.round(h.dur) + ' s', `<b>Stamina</b> ${pn(h.actor)} <span class="w">sprinted ${h.dur.toFixed(1)} s on end (${Math.round(h.dist)} m) · the game's sprint runs out after 10 s</span>`, `Stamina: ${pt(h.actor)} sprinted ${h.dur.toFixed(1)} s`];
  if (h.kind === 'tele') return [Math.round(h.d) + ' m', `<b>Teleport</b> ${pn(h.actor)} <span class="w">on foot, ${Math.round(h.d0)} m in 0.1 s, moving normally before and after${h.n > 1 ? ' · ' + h.n + ' times in this round, up to ' + Math.round(h.d) + ' m' : ''}</span>`, `Teleport: ${pt(h.actor)} ${Math.round(h.d0)} m in 0.1 s`];
  if (h.kind === 'respawn') return [h.early.toFixed(1) + ' s', `<b>Early spawn</b> ${pn(h.actor)} <span class="w">came in ${h.early.toFixed(1)} s before the game let him: he died at ${fmt(h.died)}, and it said he could spawn at ${fmt(h.may)} (${Math.round(h.may - h.died)} s later)</span>`, `Early spawn: ${pt(h.actor)} ${h.early.toFixed(1)} s early`];
  if (h.kind === 'spawn') return [Math.round(h.sd) + ' m', `<b>Spawn</b> ${pn(h.actor)} <span class="w">came in ${Math.round(h.sd)} m from the nearest ${h.how === 'held' ? 'spawn point his side held then' : h.how === 'groups' ? "middle of a spawn group his side held then (this map's spawn points are not known)" : 'spawn point of the map'}, ${Number.isFinite(h.md) ? Math.round(h.md) + ' m from the nearest team mate or vehicle' : 'no team mate or vehicle anywhere'} (the squad leader's spawn is at him)</span>`, `Spawn: ${pt(h.actor)} ${Math.round(h.sd)} m from a spawn point`];
  if (h.kind === 'nofire') return [h.gap.toFixed(1) + ' s', `<b>No trigger</b> ${pn(e.killer)} → ${pn(e.victim)} <span class="w">a ${esc(e.weapon || 'small-arms')} kill with none of his fire buttons pressed for ${h.gap.toFixed(1)} s before (the demo has each press) · honest kills: within 0.1 s of one</span>`, `No trigger: ${pt(e.killer)} → ${pt(e.victim)}, ${esc(e.weapon || '')} with no press for ${h.gap.toFixed(1)} s`];
  if (h.kind === 'outside') return [Math.round(h.dur) + ' s', `<b>Outside the map</b> ${pn(h.actor)} <span class="w">${Math.round(h.dur)} s on end outside the combat area, alive (the game counted ${h.secs} s) · it kills a soldier when his time runs out</span>`, `Outside the map: ${pt(h.actor)} ${Math.round(h.dur)} s`];
  if (h.kind === 'idle') return [Math.round(h.dur / 60) + ' min', `<b>Idle</b> ${pn(h.actor)} <span class="w">stood still without turning for ${Math.round(h.dur / 60)} min ${Math.round(h.dur % 60)} s · away from the keyboard? (a commander at his screen stands still too)</span>`, `Idle: ${pt(h.actor)} ${Math.round(h.dur / 60)} min`];
  if (h.kind === 'farm') return [h.n + '×', `<b>Kill farming</b> ${pn(h.actor)} → ${pn(h.vs)} <span class="w">killed him ${h.n} times while he stood still (moved under 2 m, turned under 10° in the 10 s before) · ${h.all} kills of him in all, over ${Math.max(1, Math.round(h.span / 60))} min</span>`, `Kill farming: ${pt(h.actor)} → ${pt(h.vs)}, ${h.n} times`];
  if (h.kind === 'trigger') return [h.q + '/' + h.n, `<b>Triggerbot</b> ${pn(h.actor)} <span class="w">${h.press ? `in ${h.q} of ${h.n} kills he pressed the trigger the moment his aim landed on the enemy (within ${TRIG_PRESS} s; the round's others ${Math.round(h.others * 100)}%) · a hand needs a moment to fire after it gets there` : `${h.q} of ${h.n} kills came the moment his aim landed on the enemy (within ${TRIG_ON} s; the round's others ${Math.round(h.others * 100)}%) · a hand needs a moment to fire after it gets there`}</span>`, `Triggerbot: ${pt(h.actor)}, ${h.q} of ${h.n} kills`];
  if (h.kind === 'smooth') return [h.mid.toFixed(1) + '°', `<b>Smooth aim</b> ${pn(h.actor)} <span class="w">in ${h.n} kills of a target moving across his view, his aim stayed ${h.mid.toFixed(1)}° off it at the middle over the last second (honest players: 8° at the middle, the best 2.6°)</span>`, `Smooth aim: ${pt(h.actor)}, ${h.mid.toFixed(1)}° off moving targets`];
  if (h.kind === 'switch') return [Math.round(h.a) + '°', `<b>Target switch</b> ${pn(e.killer)} <span class="w">killed ${pn(h.prev.victim)} and then ${pn(e.victim)} ${Math.round(h.a)}° to the side of the first ${h.dt.toFixed(2)} s later · honest rounds: 1.5 s at the quickest · ${esc(e.weapon || '')}</span>`, `Target switch: ${pt(e.killer)} ${Math.round(h.a)}° in ${h.dt.toFixed(2)} s`];
  if (h.kind === 'preaim') return [h.q + '/' + h.n, `<b>Pre-aim</b> ${pn(h.actor)} <span class="w">in ${h.q} of ${h.n} kills his aim was already on the enemy when he came out of cover after 1 s or more hidden (the round's others ${Math.round(h.others * 100)}%)</span>`, `Pre-aim: ${pt(h.actor)}, ${h.q} of ${h.n} kills`];
  if (h.kind === 'spread') { const cn = { shotgun: 'shotgun', pistol: 'pistol', smg: 'SMG', rifle: 'rifle' }[h.cls], far = h.reach && h.d > h.reach * 0.98; return [Math.round(h.d) + ' m', `<b>No spread</b> ${pn(e.killer)} → ${pn(e.victim)} <span class="w">a ${esc(e.weapon || cn)} kill from ${Math.round(h.d)} m · ${far ? 'its bullets fly ' + h.reach + ' m at most' : 'honest ' + cn + ' kills: ' + { shotgun: 14, pistol: 108, smg: 56, rifle: 161 }[h.cls] + ' m at the most'}</span>`, `No spread: ${pt(e.killer)} → ${pt(e.victim)}, ${e.weapon || cn} ${Math.round(h.d)} m`]; }
  if (h.kind === 'blindspot') return [h.blind + '/' + h.n, `<b>Spots unseen</b> ${pn(h.actor)} <span class="w">${h.blind} of his ${h.n} spots were of soldiers nobody of his side could see (not counting those he made as commander) · honest players: about 1 in 4, half at the most</span>`, `Spots unseen: ${pt(h.actor)}, ${h.blind} of ${h.n}`];
  if (h.kind === 'chute') { const up = h.up >= CHUTE_UP; return [up ? '+' + h.up.toFixed(1) + ' m/s' : h.hs.toFixed(0) + ' m/s', `<b>Parachute</b> ${pn(h.actor)} <span class="w">under his parachute ${up ? `rose ${h.up.toFixed(1)} m in a second` : `${h.hs.toFixed(1)} m/s across`} · honest parachutes: 9-12 m/s across, always coming down 4-7 m/s</span>`, `Parachute: ${pt(h.actor)} ${up ? 'rising ' + h.up.toFixed(1) + ' m/s' : h.hs.toFixed(0) + ' m/s across'}`]; }
  if (h.kind === 'glitch') { const at = [h.up != null ? Math.round(h.up) + ' m above him' : '', h.down != null ? Math.round(h.down) + ' m below him' : ''].filter(Boolean).join(' and ');
    const wh = h.where == null ? 'under a floor, inside a rock or a wall, on a roof no one climbs? (no shapes for this map)' : h.where === 'inside' ? 'his chest inside the map\'s shapes' : h.where === 'under' ? 'under the ground' : h.where === 'air' ? 'in the air over what the map\'s shapes show' : h.where === 'ground' ? 'on the ground, the others over him: under a bridge or a balcony? (listed apart)' : `on top of something ${h.where.slice(4)} m up: a roof or a ledge no one else got onto${h.info ? ' (listed apart: the others only below)' : ''}`;
    return [h.dur.toFixed(0) + ' s', `<b>Glitch spot</b> ${pn(h.actor)} <span class="w">${h.dur.toFixed(0)} s on foot where no one else stood in ${h.rounds} rounds of this map, while ${h.others}${h.others >= 4 ? '+' : ''} others stood right there ${at} · ${wh} · look in His view</span>`, `Glitch spot: ${pt(h.actor)} ${h.dur.toFixed(0)} s`]; }
  if (h.kind === 'under') return [h.depth.toFixed(1) + ' m', `<b>Under the map</b> ${pn(h.actor)} <span class="w">${h.depth.toFixed(1)} m under the ground for ${h.dur.toFixed(0)} s, alive on foot</span>`, `Under the map: ${pt(h.actor)} ${h.depth.toFixed(1)} m down`];
  if (h.kind === 'guided') { const ws = []; if (h.why.includes('stick')) ws.push(`${h.moving} hits on moving targets, his missile ${h.mid.toFixed(2)}° off the line to the target at the middle (honest gunners: 2-3°)`); if (h.why.includes('rate')) ws.push(`${h.hits} of ${h.n} TV missiles hit (TV gunners hit ${Math.round(h.others * 100)}% - 5596 missiles of 168 rounds)`); return [h.why.includes('stick') ? h.mid.toFixed(1) + '°' : h.hits + '/' + h.n, `<b>Guided missiles</b> ${pn(h.actor)} <span class="w">${esc(h.what)}: ${ws.join('; ')}</span>`, `Guided missiles: ${pt(h.actor)}, ${h.why.includes('stick') ? h.mid.toFixed(2) + '° off moving targets' : h.hits + ' of ' + h.n + ' TV missiles hit'}`]; }
  if (h.kind === 'spotspam') return [h.n60 >= SPAM_60 ? h.n60 + '/min' : h.n10 + '/10 s', `<b>Spot spam</b> ${pn(h.actor)} <span class="w">${h.n60} spots within a minute, ${h.n10} within 10 s (${h.all} in the round, not counting those he made as commander) · honest players spot 26 a minute at the most (the hacks send them without the radio voice); a commander spots from his screen as many as he likes</span>`, `Spot spam: ${pt(h.actor)}, ${h.n60} spots in a minute`];
  if (h.kind === 'fastcap') { const tn = esc(round.teams[h.side]?.name || ''), mx = h.m >= 10 ? Math.round(h.m) : h.m.toFixed(1); return [mx + '×', `<b>Fast flag</b> <span class="t${h.side}">${tn}</span> ${h.raise ? 'raised' : 'lowered'} ${esc(h.flag)} <span class="w">at ${mx} soldiers' speed for ${(h.t1 - h.t).toFixed(1)} s with ${h.cnt || 'no'} soldier${h.cnt === 1 ? '' : 's'} of that side in its capture zone${h.other ? ' (and ' + h.other + ' of the other side)' : ''}${h.most != null ? ` - enough for ${h.most}× at most` : ''} · the map: ${h.tm} s for one soldier; each more man of his side there than of the other adds as much again${h.odd ? '; this speed is no whole number of soldiers - a capture time the map does not have' : ''}${h.actor != null ? ' · nearest: ' + pn(h.actor) : ''}</span>`, `Fast flag: ${round.teams[h.side]?.name || ''} ${h.flag} at ${mx}× speed`]; }
  if (h.kind === 'arty') { const tn = h.side != null ? `<span class="t${h.side}">${esc(round.teams[h.side]?.name || '')}</span> ` : '', ws = []; if (h.why.includes('gap')) ws.push(`${Math.round(h.gap)} s after the last strike - the button lights up again a minute later (honest rounds: 63 s at the least)`); if (h.why.includes('burst')) ws.push(`${h.burst} shells from one gun - a strike is 5 a gun`); if (h.why.includes('rof')) ws.push(`one gun's shells ${h.rof.toFixed(1)} s apart - it fires every 2 s`); return [h.why.includes('gap') ? Math.round(h.gap) + ' s' : h.burst + '×', `<b>Artillery</b> ${tn}${esc(h.gun)} <span class="w">${ws.join('; ')} · ${h.shells} shells from ${h.guns} gun${h.guns > 1 ? 's' : ''}${h.actor != null ? ' · called by ' + pn(h.actor) + (h.sure ? '' : ' (probably: the commander of the nearest strike)') : ''}</span>`, `Artillery: ${round.teams[h.side]?.name || ''} ${h.gun}, ${h.why.includes('gap') ? Math.round(h.gap) + ' s after the last strike' : h.why.includes('burst') ? h.burst + ' shells from one gun' : 'shells ' + h.rof.toFixed(1) + ' s apart'}`]; }
  if (h.kind === 'vspeed') return [h.v.toFixed(0) + ' m/s', `<b>Vehicle speed</b> ${pn(h.actor)} <span class="w">${esc(h.veh)} at ${h.v.toFixed(1)} m/s over 3 s (${Math.round(h.dist)} m in ${h.dur.toFixed(0)} s) · in honest rounds it makes ${h.lim} m/s at most</span>`, `Vehicle speed: ${h.veh} ${h.v.toFixed(1)} m/s`];
  if (h.kind === 'clip') return [h.n + '×', `<b>Through walls</b> ${pn(h.actor)} <span class="w">${h.n} steps through solid walls in ${h.places} places over ${Math.max(1, Math.round(h.span / 60))} min · honest play: a few, where the map data has gaps</span>`, `Through walls: ${pt(h.actor)}, ${h.n} steps`];
  if (h.kind === 'fly') return [Math.round(h.above) + ' m', `<b>Floating</b> ${pn(h.actor)} <span class="w">up to ${Math.round(h.above)} m over what is under him for ${h.dur.toFixed(1)} s, moving at ${h.v.toFixed(1)} m/s and not coming down (${h.vz >= 0 ? 'rising ' + h.vz.toFixed(1) : 'sinking ' + (-h.vz).toFixed(1)} m/s)</span>`, `Floating: ${pt(h.actor)} ${Math.round(h.above)} m up for ${h.dur.toFixed(1)} s`];
  const tail = `${esc(killWpn(e) || e.weapon || 'no weapon')}${e.dist !== undefined ? ' · ' + e.dist + ' m' : ''}${e.hit === 'head' ? ' · headshot' : ''}`;
  if (h.kind === 'dmg') return [Math.round(h.hp) + '%', `<b>Damage</b> ${pn(e.killer)} → ${pn(e.victim)} <span class="w">killed him inside ${esc(h.veh)} (${esc(VCLASS_NAME[h.cls] || h.cls)}, ${Math.round(h.hp)}% left 1 s before) with small arms - bullets don't reach the crew · ${tail}</span>`, `Damage: ${pt(e.killer)} → ${pt(e.victim)} in ${h.veh}`];
  if (h.kind === 'smoke') return ['smoke', `<b>Through smoke</b> ${pn(e.killer)} → ${pn(e.victim)} <span class="w">a dense smoke cloud between them for the 1 s before the kill${h.of ? ` · ${h.of} such kills of his this round` : ''} · ${tail}</span>`, `Through smoke: ${pt(e.killer)} → ${pt(e.victim)}`];
  if (h.kind === 'fog') return [Math.round(h.d) + ' m', `<b>Beyond fog</b> ${pn(e.killer)} → ${pn(e.victim)} <span class="w">${Math.round(h.d)} m, the map's view distance is ${h.fog} m · ${tail}</span>`, `Beyond fog: ${pt(e.killer)} → ${pt(e.victim)}, ${Math.round(h.d)} m`];
  if (h.kind === 'thru') { const hid = h.hidden === null ? '5 s or more' : h.hidden.toFixed(1) + ' s'; return [h.hidden === null ? '5 s+' : h.hidden.toFixed(1) + ' s', `<b>Through thin walls</b> ${pn(e.killer)} → ${pn(e.victim)} <span class="w">no clear line from his eyes to him for ${hid} before the kill, but only what bullets go through stood between them${wallBy(h)} - shooting through cover at a man he couldn't see · ${tail}</span>`, `Through thin walls: ${pt(e.killer)} → ${pt(e.victim)}, ${hid}`]; }
  if (h.kind === 'wall') { const hid = h.hidden === null ? '5 s or more' : h.hidden.toFixed(1) + ' s'; return [h.hidden === null ? '5 s+' : h.hidden.toFixed(1) + ' s', `<b>No line of sight</b> ${pn(e.killer)} → ${pn(e.victim)} <span class="w">no clear line from his eyes to him for ${hid} before the kill${wallBy(h)}${h.of ? ` · ${h.of} such kills of his this round` : ''} · ${tail}</span>`, `No line of sight: ${pt(e.killer)} → ${pt(e.victim)}, ${hid}`]; }
  if (h.kind === 'snap') return [Math.round(h.from) + '°', `<b>Aim snap</b> ${pn(e.killer)} → ${pn(e.victim)} <span class="w">his view swung onto him from ${Math.round(h.from)}° off to ${h.to.toFixed(1)}° in 0.1 s, ${Math.round(h.dist)} m away${h.before >= 0.05 ? ' · ' + h.before.toFixed(1) + ' s before the kill' : ' · at the kill'}${h.of ? ` · ${h.of} such snaps of his this round` : ''} · ${tail}</span>`, `Aim snap: ${pt(e.killer)} → ${pt(e.victim)}, ${Math.round(h.from)}° in 0.1 s`];
  if (h.kind === 'clay') return [h.dv != null ? Math.round(h.dv) + ' m' : '—', `<b>Claymore kill</b> ${pn(e.killer)} → ${pn(e.victim)} <span class="w">${h.dv != null ? `${m1(h.dv)} m from where the claymore lay` : 'where it lay is not known'}${h.flag ? ` · in ${esc(h.flag)}'s capture zone` : ''}${h.tk ? ' · a team kill' : ''} · ${tail}</span>`, `Claymore kill: ${pt(e.killer)} → ${pt(e.victim)}${h.flag ? ' at ' + h.flag : ''}`];
  if (h.kind === 'claycap') return [Math.round(h.d) + ' m', `<b>Claymore at a flag</b> ${pn(e.killer)} → ${pn(e.victim)} <span class="w">the claymore lay ${Math.round(h.d)} m from ${esc(h.flag)}, inside its capture zone (${m1(h.r)} m round the pole, in 3D)${h.placed ? '' : ' - where it lay is not known: where he died'} · ${tail}</span>`, `Claymore at a flag: ${pt(e.killer)} → ${pt(e.victim)} at ${h.flag}`];
  return ['TK', `<b>Team kill</b> ${pn(e.killer)} → ${pn(e.victim)} <span class="w">${h.veh ? 'from ' + esc(h.veh) + (e.weapon ? ' · ' + esc(killWpn(e) || e.weapon) : '') : tail}</span>`, `Team kill: ${pt(e.killer)} → ${pt(e.victim)}`];
}
function renderAdmin() {
  const box = $('#admBox'); if (!box || !round) return;
  if (!admCan()) { $('#fTab2').textContent = 'For admins'; box.innerHTML = `<p class="empty">${esc(admOutOfScope())}</p>`; return; }   // (v196)
  const A = adminHints(), AP = A.filter(ffOk), AF = AP.filter(ffFlagOk), cnt = k => AF.filter(h => h.kind === k).length, nAll = AF.filter(h => !h.info).length;   // (v169: lists - Claymore kills - not in All; v171: AF - the player and flag filters)
  $('#fTab2').innerHTML = `For admins <span class="w">${A.filter(h => !h.info).length}</span>`;
  const L = A.map((h, i) => [h, i]).filter(([h]) => ffOk(h) && ffFlagOk(h) && (admFilter === 'all' ? !h.info : h.kind === admFilter));
  // (v171) the flags to pick, with how many hints (of the player picked) were near each
  { const sel = $('#ffFlag'), inKind = h => admFilter === 'all' ? !h.info : h.kind === admFilter, nf = k => AP.filter(h => inKind(h) && ffFlagOf(h) === k).length, fl = round.flags.map((f, k) => [k, f.name, nf(k)]).filter(q => q[2] || String(q[0]) === ffFlag), away = nf(-1);
    const html = `<option value="all">Any place (${AP.filter(inKind).length})</option>${fl.map(([k, nm, c]) => `<option value="${k}">Near ${esc(nm)} (${c})</option>`).join('')}${away || ffFlag === 'away' ? `<option value="away">Away from the flags (${away})</option>` : ''}`;
    if (sel && sel._h !== html) { sel.innerHTML = html; sel._h = html; } if (sel) sel.value = ffFlag; }
  const per = new Map(); for (const h of A) if (!h.info && h.kind !== 'tk' && h.kind !== 'claycap' && h.kind !== 'idle' && h.kind !== 'spotspam' && h.kind !== 'outside' && h.actor != null && !(h.kind === 'arty' && !h.sure)) per.set(h.actor, (per.get(h.actor) || 0) + 1);
  const top = [...per].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]);
  const pn = id => { const i = round.pidx.get(id); return i === undefined ? '' : `<span class="t${teamOf(i, round.duration)}">${esc(round.players[i].name)}</span>`; };
  box.innerHTML = `<p class="admwarn">Hints for a closer look, not proof. Walls are the map's collision shapes, and some fences, thin walls and boards let bullets through; views and positions are known 10 times a second; good players turn fast too. Watch the moment (and its side view) before you judge.</p>
    ${(round._trackRun && !round._tracks) || (round._geoRun && !round._geo) ? '<p class="admtop">Wall tracking, walls and floating: still going through the round (a few seconds)…</p>' : ''}${top.length ? `<p class="admtop">Most hints: ${top.map(([id, c]) => pn(id) + ' <span class="w">' + c + '</span>').join(', ')}</p>` : ''}
    <div class="hlchips">${[['all', 'All', nAll], ...ADM_KINDS.map(([k, n]) => [k, n, cnt(k)])].filter(([k, , c]) => k === 'all' || c).map(([k, n, c]) => `<button class="btn${admFilter === k ? ' on' : ''}" data-f="${k}">${n} <span class="w">${c}</span></button>`).join('')}</div>
    <ul class="feed hlist">${L.length ? L.map(([h, i]) => { const [b, html] = admDescribe(h); return `<li data-i="${i}"><button class="hli" data-i="${i}" title="Jump to ${fmt(Math.max(0, h.t - HL_LEAD))}"><span class="ts">${fmt(h.t)}</span><span class="hk hk-${h.kind}">${esc(b)}</span><span>${html}</span></button>${h.kill ? `<button class="hlclip hlside" data-i="${i}" title="Side view of this kill">${SIDE_SVG}</button>` : ''}<button class="hlclip" data-i="${i}" title="Make a video clip of this moment">${CLIP_SVG}</button></li>`; }).join('') : `<li class="empty">${ffOn() || ffFlag !== 'all' ? 'Nothing for this filter.' : 'Nothing to look at in this round.'}</li>`}</ul>
    <p class="stnote">${A.noLos ? 'No wall data for this map: "No line of sight" is not checked. ' : ''}${A.wait ? `Checking ${A.wait} kill${A.wait > 1 ? 's' : ''} against the map's exact collision shapes… ` : ''}Click to jump there.</p>`;
  box.querySelectorAll('.hlchips .btn').forEach(b => b.onclick = () => { admFilter = b.dataset.f; renderAdmin(); });
  box.querySelectorAll('.hli').forEach(b => b.onclick = () => jumpTo(A[+b.dataset.i]));
  box.querySelectorAll('.hlclip:not(.hlside)').forEach(b => b.onclick = () => clipAround(A[+b.dataset.i]));
  box.querySelectorAll('.hlside').forEach(b => b.onclick = () => openSide(A[+b.dataset.i].kill));
}
// ---- part 7 (page line 10014) ----
// ---------- (v196) the admins' part: the Admin tab ----------
// (cut out of the public page by splitpage.mjs into server/admin-round.js; the admin server hands it over after a
// login, and the page runs it with its own names in sight - adminEval)
const ADM_CSS = `.hk-wall, .hk-snap, .hk-speed, .hk-track, .hk-wallfire, .hk-smoke, .hk-fog, .hk-reach, .hk-rate, .hk-ammo, .hk-react, .hk-stam, .hk-tele, .hk-clip, .hk-fly, .hk-spawn, .hk-vspeed, .hk-dmg, .hk-guided, .hk-arty, .hk-fastcap, .hk-trigger, .hk-smooth, .hk-switch, .hk-preaim, .hk-spread, .hk-blindspot, .hk-under { color: var(--hp-low); border-color: color-mix(in srgb, var(--hp-low) 55%, transparent); }\n.hk-hs { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 55%, transparent); }\n.hk-tk, .hk-farm, .hk-fov, .hk-claycap { color: var(--blast); border-color: color-mix(in srgb, var(--blast) 55%, transparent); }\n.admwarn { font-size: 12px; color: var(--muted); margin: 0 0 8px; }\n.admtop { font-size: 12px; margin: 0 0 8px; }
.admhead { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: baseline; justify-content: space-between; margin-bottom: 8px; } .admhead h2 { margin: 0; }
.admfil { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; margin: 0 0 8px; font-size: 12.5px; } .admfil label { display: inline-flex; gap: 5px; align-items: center; color: var(--muted); }
.admfil select, .admfil input { font: 12.5px var(--font-body); color: var(--fg); background: var(--panel-2); border: 1px solid var(--line); border-radius: 4px; padding: 3px 6px; } .admfil input { width: 5.5em; }
.admstr { font: 600 10px var(--font-data); letter-spacing: .04em; color: var(--muted); white-space: nowrap; } .admstr.s2 { color: var(--hp-low); } .admstr.s1 { color: var(--accent); }
.admpane .hlist { max-height: none; } .admpane .hlist li { align-items: flex-start; flex-wrap: wrap; } .admpane .hlist li .hli { flex: 1 1 240px; }
.admsubs { display: flex; gap: 4px; margin: 0 0 10px; flex-wrap: wrap; } .admsubs .btn.on { border-color: var(--accent); color: var(--accent); }
.admbad { color: var(--hp-low); font-weight: 600; } .admwarnc { color: var(--accent); }
.admtab td, .admtab th { white-space: nowrap; } .admtab td.kinds { white-space: normal; min-width: 160px; } .admtab .hk { margin: 1px 0; display: inline-block; } .admtab tr.admtk td { opacity: .75; }
.admtab tr.admhist > td { white-space: normal; background: var(--panel-2); } .admhbody { padding: 6px 4px; } .admhbody .card { margin: 6px 0 0; }
.admk td:nth-child(2), .admk td:nth-child(3) { max-width: 180px; overflow: hidden; text-overflow: ellipsis; }
.admcols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(340px, 100%), 1fr)); gap: 12px 24px; } .admcols > section { min-width: 0; } .admcols h3 { margin: 4px 0 6px; font-size: 13px; }
table.kv { border-collapse: collapse; width: 100%; font-size: 12.5px; } table.kv th { text-align: left; color: var(--muted); font-weight: 500; padding: 4px 10px 4px 0; vertical-align: top; white-space: nowrap; width: 1%; } table.kv td { padding: 4px 0; border-top: 1px solid var(--line); vertical-align: top; overflow-wrap: anywhere; } table.kv th { border-top: 1px solid var(--line); }
.admfil label.ck input { margin: 0; width: auto; padding: 0; } .admk td:last-child { white-space: normal; min-width: 150px; }
.linkb { background: none; border: 0; padding: 0; font: inherit; color: inherit; cursor: pointer; text-decoration: underline dotted; text-underline-offset: 2px; }
.admrv { display: inline-flex; gap: 1px; flex: none; align-self: center; margin-left: auto; } .admrv button { all: unset; width: 22px; height: 24px; display: grid; place-items: center; border-radius: 3px; color: var(--muted); cursor: pointer; font-size: 13px; opacity: .5; }
.admrv button:hover, .admrv button:focus-visible, .admrv button.on { opacity: 1; } .admrv button:hover { background: var(--panel-2); } .admrv button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; } .admrv button.on { background: var(--panel-2); }
.admrv button.on.m-ok, .admrv button.m-ok:hover, .admmk.m-ok { color: var(--medic); } .admrv button.on.m-false, .admrv button.m-false:hover, .admmk.m-false { color: var(--neutral); } .admrv button.on.m-sus, .admrv button.m-sus:hover, .admmk.m-sus { color: var(--hp-low); }
.admmk { font: 600 10.5px var(--font-data); white-space: nowrap; } .admtrb { font: 600 10px var(--font-data); color: var(--muted); white-space: nowrap; }
.admpane .hlist li.admtr .hli, .admpane .hlist li.admm-ok .hli, .admpane .hlist li.admm-false .hli { opacity: .6; } .admpane .hlist li.admm-sus { box-shadow: inset 2px 0 0 var(--hp-low); }
.admstar { all: unset; cursor: pointer; color: var(--muted); opacity: .4; padding: 0 3px; } .admstar:hover { opacity: 1; } .admstar.on { color: var(--accent); opacity: 1; } .admstar:focus-visible { outline: 2px solid var(--accent); }
.admtab tr.admtrr > td { opacity: .8; }
.admnotes { list-style: none; margin: 4px 0 8px; padding: 0; font-size: 12.5px; } .admnotes li { padding: 5px 0; border-top: 1px solid var(--line); overflow-wrap: anywhere; } .admnotes li > div { margin-top: 2px; } .admx { font-size: 11.5px; color: var(--muted); }
.admnote { display: flex; gap: 6px; align-items: flex-start; margin: 6px 0 12px; } .admnote textarea, .admrep textarea { flex: 1; min-width: 0; font: 12.5px var(--font-body); color: var(--fg); background: var(--panel-2); border: 1px solid var(--line); border-radius: 4px; padding: 5px 7px; resize: vertical; }
.admrep textarea { width: 100%; box-sizing: border-box; font: 12px/1.45 var(--font-data); } .admpn h4 { margin: 10px 0 2px; font-size: 12.5px; }
.admmlist { list-style: none; margin: 0 0 6px; padding: 0; font-size: 12.5px; } .admmlist li { display: flex; gap: 8px; align-items: flex-start; padding: 5px 0; border-top: 1px solid var(--line); } .admmlist .ts { flex: none; font: 12px var(--font-data); color: var(--muted); padding-top: 4px; }
.admpane p.w { font-size: 12.5px; } .admmw { flex: 1; min-width: 0; overflow-wrap: anywhere; padding-top: 3px; } .admmn { display: block; color: var(--muted); font-style: italic; margin-top: 2px; } .admmb { display: inline-flex; flex: none; } .admmlist li.admm-sus { box-shadow: inset 2px 0 0 var(--hp-low); padding-left: 6px; }`;
// can this admin see this round's hints: the site's owner all; a server's admin his servers' rounds (a folder of demos
// opened here: all)
const admIsOwner = () => !admMe || admMe.role === 'owner';
function admServerOf() { const nm = $('#srcLabel').textContent, r = session?.server ? srvRound(nm) : null; return r?.sum?.server || null; }
function admCan() { if (!round) return false; if (admIsOwner() || !session?.server) return true; const sv = admServerOf(); return !!sv && (admMe.servers || []).includes(sv); }
const admOutOfScope = () => `This round is from ${admServerOf() || 'a server'}: not one of the servers of your account (${(admMe?.servers || []).join(', ') || 'none'}).`;
function admInit(me) {
  if (!document.getElementById('admCss')) { const st = document.createElement('style'); st.id = 'admCss'; st.textContent = ADM_CSS; document.head.appendChild(st); }
  $('#fTab2').hidden = false; $('#fTab2').title = 'Moments an admin may want to look at: kills with no line of sight, aim snaps, headshot rates, team kills';
  const sp = document.querySelector('#fcStrip span'); if (sp) sp.textContent = 'Kill feed · Highlights · For admins';
  $('#ptAdmin').textContent = 'Admin ✓';
  if (ADM_V !== APP_VERSION) console.warn(`the admins' part is of ${ADM_V}, the page of ${APP_VERSION}: reload the page`);
}
// (v196, Sagara's filters) how strong a hint is: 0 minor (team kills, claymores, idle, spot spam, outside the map,
// anything listed apart), 2 strong (what normal play can't do - a jump, a speed, through a wall, out of reach, too fast
// a fire rate or flag, a guided missile, the glitch spots; no line of sight with the exact shapes, hidden 1 s or more;
// a rate - headshots, reaction, triggerbot, pre-aim, wide view - so far above the round's others that chance gives it
// under once in 10 000), 1 the rest
const ADM_MINOR = new Set(['tk', 'claycap', 'clay', 'idle', 'spotspam', 'outside']);
const ADM_PHYS = new Set(['tele', 'speed', 'vspeed', 'clip', 'under', 'fly', 'chute', 'reach', 'rate', 'ammo', 'spread', 'guided', 'fastcap', 'dmg', 'nofire', 'glitch']);
function admStrength(h) {
  if (h.info || ADM_MINOR.has(h.kind)) return 0;
  if (h.kind === 'arty') return h.sure ? 2 : 1;
  if (ADM_PHYS.has(h.kind)) return 2;
  if (h.kind === 'wall') return !h.rough && (h.hidden == null || h.hidden >= 1) ? 2 : 1;
  const k = h.q ?? h.head ?? h.hits;
  if (k != null && h.n && typeof h.others === 'number' && h.others < 1) return binTailLog(k, h.n, Math.max(1e-3, h.others)) <= 1e-4 ? 2 : 1;
  return 1;
}
const ADM_STR = ['minor', 'hint', 'strong'];
// the weapon of a hint's kill (killCause; sniper rifles apart); hints without a kill: about vehicles, or none
function admWpn(h) {
  const e = h.kill;
  if (!e) return ['vspeed', 'guided', 'arty'].includes(h.kind) ? 'veh' : 'none';
  if (SNIPER_W.test(e.weapon || '')) return 'sniper';
  return killCause(e, !!e.kv);
}
const ADM_WPN = [['small', 'small arms'], ['sniper', 'sniper rifles'], ['at', 'launchers'], ['expl', 'grenades, explosives'], ['veh', 'vehicles'], ['emp', 'emplacements'], ['none', 'no kill']];
// (v197) the tab's parts: the hints, the players, every kill, the round itself
let admSub = 'hints';
const ADM_SUBS = [['hints', 'Hints'], ['players', 'Players'], ['kills', 'Kills'], ['round', 'The round'], ['review', 'Review']];
function admRenderPane(box) {
  box.classList.add('admpane');
  const who = admMe && admMe.user ? `<b>${esc(admMe.user === 'owner' ? 'the site\'s owner' : admMe.user)}</b>${admMe.role === 'owner' ? '' : ` <span class="w">· ${esc((admMe.servers || []).join(', ') || 'no servers')}</span>`}` : '';
  const head = `<div class="admhead"><h2>Admin <span class="w">${round ? esc($('#srcLabel').textContent) : ''}</span></h2><span class="w">${who ? 'logged in as ' + who : ''} <button class="btn sm" id="admOut">Log out</button></span></div>`;
  const bind = () => { const o = $('#admOut'); if (o) o.onclick = async () => { try { await admApi('logout', {}); } catch (e) {} location.reload(); }; };
  if (ADM_V !== APP_VERSION) { box.innerHTML = head + `<p class="empty">The page is of ${esc(APP_VERSION)}, the admins' part of ${esc(ADM_V)}: reload the page.</p>`; bind(); return; }
  if (!round || round.meta?.source === 'sim') { box.innerHTML = head + '<p class="empty">Open a round.</p>'; bind(); return; }
  if (!admCan()) { box.innerHTML = head + `<p class="empty">${esc(admOutOfScope())}</p>`; bind(); return; }
  const keep = admDraftsKeep(box), V0 = admRev(admRedraw(() => admRenderPane(box))), nMk = admRevOn(V0) ? Object.keys(V0.marks || {}).length : 0;
  box.innerHTML = head + `<div class="admsubs" role="tablist">${ADM_SUBS.map(([k, n]) => `<button class="btn sm${admSub === k ? ' on' : ''}" role="tab" aria-selected="${admSub === k}" data-sub="${k}">${n}${k === 'review' && nMk ? ` <span class="w">${nMk}</span>` : ''}</button>`).join('')}</div><div id="admBody"></div>`;
  bind();
  box.querySelectorAll('.admsubs [data-sub]').forEach(b => b.onclick = () => { admSub = b.dataset.sub; admRenderPane(box); });
  const el = $('#admBody'), re = () => admRenderPane(box);
  try { (admSub === 'players' ? admSubPlayers : admSub === 'kills' ? admSubKills : admSub === 'round' ? admSubRound : admSub === 'review' ? admSubReview : admSubHints)(el, re); }
  catch (e) { console.error(e); el.innerHTML = '<p class="empty">Something went wrong here (the console says what).</p>'; }
  admDraftsBind(box, keep);
  // (the hints still coming - the walls, wall tracking: drawn again when they are in)
  if (admBusy() && !box._again) { const R = round; box._again = setTimeout(() => { box._again = null; if (round === R && pane === 'admin') admRenderPane(box); }, 1500); }
}
const admBusy = () => { const A = adminHints(); return !!(A.wait || A.glWait || (round._trackRun && !round._tracks) || (round._geoRun && !round._geo)); };
const admBusyNote = () => admBusy() ? ' · wall tracking, floating and the exact shapes still going through the round (drawn again when done)…' : '';
// the numbers of every kill and soldier (analysisDump, the server's analysis's own): worked out once the hints are in
function admDump() {
  const R = round, busy = admBusy();
  if (R._admDump && !R._admDumpBusy) return R._admDump;
  if (R._admDump && busy && performance.now() - R._admDumpAt < 3000) return R._admDump;
  R._admDump = analysisDump(R); R._admDumpBusy = busy; R._admDumpAt = performance.now(); return R._admDump;
}
const KC = Object.fromEntries(ANALYZE_COLS.K.map((k, j) => [k, j])), PC = Object.fromEntries(ANALYZE_COLS.P.map((k, j) => [k, j]));
const admMed = a => { const s = a.filter(x => x != null && Number.isFinite(x)).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
const admPn = i => i == null || i < 0 || !round.players[i] ? '' : `<span class="t${teamOf(i, round.duration)}">${esc(round.players[i].name)}</span>`;
const admSortTh = (cols, S) => cols.map(([k, n, tip, num]) => `<th class="${num ? 'n' : ''}${S.sort === k ? ' on' : ''}"${tip ? ` title="${esc(tip)}"` : ''}><button class="sortb" data-sort="${k}">${n}${S.sort === k ? (S.dir < 0 ? ' ▾' : ' ▴') : ''}</button></th>`).join('');
const admSortBind = (el, S, re, firstDir = {}) => el.querySelectorAll('[data-sort]').forEach(b => b.onclick = () => { const k = b.dataset.sort; if (S.sort === k) S.dir = -S.dir; else { S.sort = k; S.dir = firstDir[k] ?? -1; } re(); });
const admCmp = (S, val) => (a, b) => { const x = val(a, S.sort), y = val(b, S.sort); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (x < y ? -1 : x > y ? 1 : 0) * S.dir; };

// ---- Hints (v196) ----
const admPF = { kind: 'all', who: '', team: '', str: 'nominor', wpn: '', t0: '', t1: '', minN: 1, rev: 'all' };
const admMmss = v => { const m = /^\s*(\d+)(?::(\d{1,2}))?\s*$/.exec(v || ''); return m ? +m[1] * 60 + +(m[2] || 0) : null; };
function admSubHints(el, re) {
  const A = adminHints(), dur = round.duration, F = admPF, t0 = admMmss(F.t0), t1 = admMmss(F.t1);
  const pidx = id => round.pidx.get(id), teamAt = h => { const i = pidx(h.actor); return i === undefined ? null : teamOf(i, h.t); };
  const V = admRev(), on = admRevOn(V), M = on ? V.marks || {} : {}, trustedId = id => on && admTrusted(V, id);
  const base = A.map((h, i) => ({ h, i, s: admStrength(h), key: on ? admKey(h) : '' })).filter(o => {
    const h = o.h;
    // (v198) Review: not reviewed and not of a trusted player / without the trusted players / suspicious / reviewed
    if (on && F.rev !== 'all') { const mk = M[o.key]; if (F.rev === 'open' ? mk || trustedId(h.actor) : F.rev === 'untrusted' ? trustedId(h.actor) : F.rev === 'sus' ? mk?.state !== 'sus' : !mk) return false; }
    if (F.str === 'nominor' && o.s === 0) return false; if (F.str === 'strong' && o.s < 2) return false;
    if (t0 != null && h.t < t0) return false; if (t1 != null && h.t > t1) return false;
    if (F.team !== '' && String(teamAt(h)) !== F.team) return false;
    if (F.wpn && admWpn(h) !== F.wpn) return false;
    return true;
  });
  const per = new Map(); for (const o of base) if (o.h.actor != null) per.set(o.h.actor, (per.get(o.h.actor) || 0) + 1);
  const pass = base.filter(o => (F.minN <= 1 || (o.h.actor != null && per.get(o.h.actor) >= F.minN)) && (!F.who || String(o.h.actor) === F.who));
  const cnt = new Map(); for (const o of pass) cnt.set(o.h.kind, (cnt.get(o.h.kind) || 0) + 1);
  const L = pass.filter(o => F.kind === 'all' || o.h.kind === F.kind);
  const pn = id => { const i = pidx(id); return i === undefined ? '' : `<span class="t${teamOf(i, round.duration)}">${esc(round.players[i].name)}</span>`; };
  const top = [...per].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const tn = k => esc(round.teams?.[k]?.name || `Team ${k + 1}`);
  const players = [...per].sort((a, b) => b[1] - a[1]).map(([id, c]) => `<option value="${esc(id)}"${F.who === String(id) ? ' selected' : ''}>${esc(round.players[pidx(id)]?.name || id)} · ${c}</option>`).join('');
  const sel = (id, opts, v) => `<select id="${id}">${opts.map(([k, n]) => `<option value="${esc(k)}"${String(v) === String(k) ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  el.innerHTML = `<p class="admwarn">Hints for a closer look, not proof: watch the moment (and its side view) before you judge. Everything here comes from the demo alone.</p>
    <div class="admfil">
      <label>Player <select id="apWho"><option value="">everyone</option>${players}</select></label>
      <label>Side ${sel('apTeam', [['', 'both'], ['0', tn(0)], ['1', tn(1)]], F.team)}</label>
      <label title="Minor: team kills, claymores, idle, spot spam, outside the map. Strong: what normal play can't do, or a rate chance gives under once in 10 000">Strength ${sel('apStr', [['all', 'all'], ['nominor', 'without the minor ones'], ['strong', 'strong only']], F.str)}</label>
      ${on ? `<label title="Marks (the buttons ✓ ✗ ⚑ by each hint) and the trusted players (Players: ★)">Review ${sel('apRev', [['all', 'all'], ['open', 'not reviewed, not trusted'], ['untrusted', 'without the trusted'], ['sus', 'suspicious'], ['marked', 'reviewed']], F.rev)}</label>` : ''}
      <label>Weapon ${sel('apWpn', [['', 'any'], ...ADM_WPN], F.wpn)}</label>
      <label>From <input id="apT0" placeholder="0:00" value="${esc(F.t0)}" aria-label="From (mm:ss)"></label><label>to <input id="apT1" placeholder="${fmt(dur)}" value="${esc(F.t1)}" aria-label="To (mm:ss)"></label>
      <label title="Only players with so many hints or more (with the filters above)">Players with ${sel('apMin', [1, 2, 3, 4, 5, 10].map(n => [n, n === 1 ? 'any' : n + '+']), F.minN)} hints</label>
      <button class="btn sm" id="apReset">Reset</button>
    </div>
    <div class="hlchips">${[['all', 'All', pass.length], ...ADM_KINDS.map(([k, n]) => [k, n, cnt.get(k) || 0])].filter(([k, , c]) => k === 'all' || c || k === F.kind).map(([k, n, c]) => `<button class="btn${F.kind === k ? ' on' : ''}" data-k="${k}">${n} <span class="w">${c}</span></button>`).join('')}</div>
    ${top.length ? `<p class="admtop">Most hints: ${top.map(([id, c]) => `<button class="linkb" data-who="${esc(id)}">${pn(id)}</button> <span class="w">${c}</span>`).join(', ')}</p>` : ''}
    <ul class="feed hlist">${L.length ? L.map(({ h, i, s: st, key }) => { const [b, html] = admDescribe(h), mk = M[key], tr = trustedId(h.actor); return `<li class="${tr ? 'admtr' : ''}${mk ? ' admm-' + mk.state : ''}"><button class="hli" data-i="${i}" title="Watch it: ${fmt(Math.max(0, h.t - HL_LEAD))}"><span class="ts">${fmt(h.t)}</span><span class="hk hk-${h.kind}">${esc(b)}</span><span>${html} <span class="admstr s${st}">${ADM_STR[st]}</span>${tr ? ' <span class="admtrb" title="A trusted player (Players: ★): not highlighted">★ trusted</span>' : ''}${mk ? ' ' + admMarkBadge(mk) : ''}</span></button>${h.kill ? `<button class="hlclip hlside" data-i="${i}" title="Side view of this kill">${SIDE_SVG}</button>` : ''}<button class="hlclip hlvid" data-i="${i}" title="Make a video clip of this moment">${CLIP_SVG}</button>${on ? admRvButtons(i, mk) : ''}</li>`; }).join('') : `<li class="empty">No hint with these filters.${F.str !== 'all' && A.some(h => admStrength(h) < (F.str === 'strong' ? 2 : 1)) ? ` (${A.filter(h => admStrength(h) < (F.str === 'strong' ? 2 : 1)).length} ${F.str === 'strong' ? 'weaker' : 'minor'} ones not shown: Strength)` : ''}</li>`}</ul>
    <p class="stnote">${L.length} of ${A.length} hints${V === null ? ' · loading the marks…' : V && V.ok === false ? ' · the marks: ' + esc(V.msg || V.error || 'no answer') : ''}${A.noLos ? ' · no wall data for this map: "No line of sight" is not checked' : ''}${A.wait ? ` · still checking ${A.wait} kill${A.wait > 1 ? 's' : ''} against the exact shapes…` : ''}${(round._trackRun && !round._tracks) || (round._geoRun && !round._geo) ? ' · wall tracking and floating still going through the round…' : ''}. A click: the moment on the map (Battle).</p>`;
  $('#apWho').onchange = e => { F.who = e.target.value; re(); };
  $('#apTeam').onchange = e => { F.team = e.target.value; re(); };
  $('#apStr').onchange = e => { F.str = e.target.value; re(); };
  $('#apWpn').onchange = e => { F.wpn = e.target.value; re(); };
  $('#apMin').onchange = e => { F.minN = +e.target.value; re(); };
  if ($('#apRev')) $('#apRev').onchange = e => { F.rev = e.target.value; re(); };
  for (const id of ['apT0', 'apT1']) $('#' + id).onchange = e => { F[id === 'apT0' ? 't0' : 't1'] = e.target.value.trim(); re(); };
  $('#apReset').onclick = () => { Object.assign(F, { kind: 'all', who: '', team: '', str: 'nominor', wpn: '', t0: '', t1: '', minN: 1, rev: 'all' }); re(); };
  el.querySelectorAll('.hlchips .btn').forEach(b => b.onclick = () => { F.kind = b.dataset.k; re(); });
  el.querySelectorAll('[data-who]').forEach(b => b.onclick = () => { F.who = b.dataset.who; re(); });
  el.querySelectorAll('.hli').forEach(b => b.onclick = () => { paneSet('battle', true); jumpTo(A[+b.dataset.i]); });
  el.querySelectorAll('.hlside').forEach(b => b.onclick = () => { paneSet('battle', true); openSide(A[+b.dataset.i].kill); });
  el.querySelectorAll('.hlvid').forEach(b => b.onclick = () => { paneSet('battle', true); clipAround(A[+b.dataset.i]); });
  // (v198) a mark: the same button again clears it; suspicious asks what was seen (for the report)
  el.querySelectorAll('[data-rv]').forEach(b => b.onclick = async () => {
    const h = A[+b.dataset.rv], key = admKey(h), cur = M[key], st = cur?.state === b.dataset.st ? null : b.dataset.st;
    let note = '';
    if (st === 'sus') { note = prompt('Suspicious: what did you see? (optional - it goes in the report)', cur?.note || ''); if (note === null) return; }
    b.disabled = true; await admRevAct('review-mark', { round: admRoundName(), key, state: st, note, what: admDescribe(h)[2], t: h.t }, re);
  });
}

// ---- (v197) Players: each soldier's numbers in this round, and his history (his rounds on the site, his hints over
// them, his other names, his servers) ----
const admPS = { sort: 'hints', dir: -1, open: new Set() };
function admPlayersRows() {
  const R = round, d = admDump(), A = adminHints(), byId = new Map();
  for (const h of A) { if (h.actor == null) continue; const o = byId.get(h.actor) || { n: 0, strong: 0, kinds: new Map() }; const st = admStrength(h); if (st > 0) { o.n++; if (st === 2) o.strong++; o.kinds.set(h.kind, (o.kinds.get(h.kind) || 0) + 1); } byId.set(h.actor, o); }
  const mine = new Map(); for (const r of d.K) { if (r[KC.killer] < 0) continue; if (!mine.has(r[KC.killer])) mine.set(r[KC.killer], []); mine.get(r[KC.killer]).push(r); }
  return d.P.map(P => {
    const i = P[PC.i], p = R.players[i], K = (mine.get(i) || []).filter(r => !r[KC.tk] && r[KC.victim] !== i), H = byId.get(p.id) || { n: 0, strong: 0, kinds: new Map() };
    // headshots against what his weapons give everyone (as aggHeads, over this round's small-arms kills with the hit known)
    let n = 0, head = 0, exp = 0;
    for (const r of K) { if (r[KC.cause] !== 'small' || !r[KC.hit] || /knife|defib/i.test(r[KC.weapon] || '')) continue; n++; if (r[KC.hit] === 'head') head++; exp += HS_W[r[KC.weapon]] ?? HS_DEF; }
    const lo = n ? Math.round(aggTail10(head, n, exp / n) * 10) / 10 : null;
    const small = K.filter(r => r[KC.err]), react = small.map(r => r[KC.react]).filter(x => x != null), aimK = small.map(r => r[KC.err][20]);
    const noClear = small.filter(r => r[KC.losK] != null && r[KC.losK] > 0 && (r[KC.losX] == null || r[KC.losX] > 0)).length;
    const D = K.map(r => r[KC.d]).filter(x => x != null);
    return { i, id: p.id, name: p.name, nick: nickOf(p.name), team: teamOf(i, R.duration), teams: (p.teams || []).length > 1, k: P[PC.kills], dd: P[PC.deaths], tk: P[PC.tk], hints: H.n, strong: H.strong, kinds: [...H.kinds].sort((a, b) => b[1] - a[1]),
      hsN: n, hsHead: head, hsExp: exp, hsLo: lo, react: admMed(react), fast: react.filter(x => x < REACT_Q).length, aim: admMed(aimK), small: small.length, noClear,
      dmed: admMed(D), dmax: D.length ? Math.max(...D) : null, ping: P[PC.pingMed] };
  });
}
function admSubPlayers(el, re) {
  const S = admPS, rows = admPlayersRows(), label = new Map(ADM_KINDS), V = admRev(), on = admRevOn(V);
  const val = (o, k) => k === 'name' ? o.name.toLowerCase() : k === 'hs' ? (o.hsLo == null ? null : -o.hsLo) : k === 'react' ? (o.react == null ? null : -o.react) : k === 'aim' ? (o.aim == null ? null : -o.aim) : o[k];
  rows.sort((a, b) => admCmp(S, val)(a, b) || b.hints - a.hints || b.k - a.k);
  const pc = v => Math.round(v * 100) + '%';
  const hsCell = o => !o.hsN ? '–' : `<span class="${o.hsLo <= HS_ODD ? 'admbad' : o.hsLo <= -3 ? 'admwarnc' : ''}" title="${o.hsHead} of ${o.hsN} small-arms kills with the hit known to the head; with the same weapons everyone gets ${pc(o.hsExp / o.hsN)}${o.hsLo < -1 ? ` - by chance about once in ${o.hsLo > -6 ? Math.round(10 ** -o.hsLo).toLocaleString('en') : '10^' + Math.floor(-o.hsLo)}` : ''}">${o.hsHead}/${o.hsN} <span class="w">${pc(o.hsHead / o.hsN)} · ${pc(o.hsExp / o.hsN)}</span></span>`;
  const cols = [['name', 'Player'], ['k', 'K', 'Enemy kills', 1], ['dd', 'D', 'Deaths', 1], ['tk', 'TK', 'Team kills', 1], ['hints', 'Hints', 'Hints about him, the minor ones left out', 1], ['strong', 'Strong', 'Of them strong (Strength)', 1], ['kinds', 'Of which'],
    ['hs', 'Headshots', 'His heads / small-arms kills with the hit known · his share · what his weapons give everyone (red: chance under once in a million)', 1], ['react', 'Reaction', 'Middle time from first seeing the victim to the kill (small arms on foot) · how many under ' + REACT_Q + ' s', 1],
    ['aim', 'Aim', 'Middle of how far off the victim he looked at the kill (small arms on foot)', 1], ['noClear', 'No clear line', 'Small-arms kills with no clear sight line at the kill (the grid; the exact shapes where known)', 1], ['dmed', 'Distance', 'Middle distance of his kills · the longest', 1], ['ping', 'Ping', 'His middle ping', 1], ['h', '']];
  const N = cols.length;
  el.innerHTML = `<div class="stscroll"><table class="sttab admtab"><thead><tr>${admSortTh(cols.map(c => c[0] === 'kinds' || c[0] === 'h' ? [c[0], c[1]] : c), S).replace(/<button class="sortb" data-sort="(kinds|h)">([^<]*)<\/button>/g, '$2')}</tr></thead><tbody>
    ${rows.map(o => `<tr${on && V.trusted?.[o.nick] ? ' class="admtrr"' : ''}><td><button class="plink t${o.team}" data-nick="${esc(o.nick)}" title="His page">${esc(o.name)}</button>${o.teams ? ' <span class="w" title="Changed sides">⇄</span>' : ''}${on ? admStarBtn(V, o.nick) : ''}${on && V.players?.[o.nick]?.length ? ` <span class="w" title="Notes on him: History">✎${V.players[o.nick].length}</span>` : ''}</td><td class="n">${o.k}</td><td class="n">${o.dd}</td><td class="n">${o.tk || ''}</td>
      <td class="n">${o.hints ? `<button class="linkb" data-hw="${esc(o.id)}" title="His hints (Hints)">${o.hints}</button>` : ''}</td><td class="n">${o.strong ? `<b class="admbad">${o.strong}</b>` : ''}</td>
      <td class="kinds">${o.kinds.slice(0, 4).map(([k, c]) => `<span class="hk hk-${k}">${esc(label.get(k) || k)}${c > 1 ? ' ' + c : ''}</span>`).join(' ')}${o.kinds.length > 4 ? ` <span class="w">+${o.kinds.length - 4}</span>` : ''}</td>
      <td class="n">${hsCell(o)}</td><td class="n">${o.react == null ? '–' : `${o.react.toFixed(2)} s${o.fast ? ` <span class="w">· ${o.fast}</span>` : ''}`}</td><td class="n">${o.aim == null ? '–' : o.aim.toFixed(1) + '°'}</td>
      <td class="n">${o.small ? `${o.noClear}<span class="w">/${o.small}</span>` : '–'}</td><td class="n">${o.dmed == null ? '–' : `${Math.round(o.dmed)} m <span class="w">· ${Math.round(o.dmax)}</span>`}</td><td class="n">${o.ping ?? '–'}</td>
      <td><button class="btn sm" data-hist="${esc(o.nick)}" aria-expanded="${S.open.has(o.nick)}">${S.open.has(o.nick) ? 'History ▴' : 'History ▾'}</button></td></tr>
      ${S.open.has(o.nick) ? `<tr class="admhist"><td colspan="${N}">${admHistory(o, re)}</td></tr>` : ''}`).join('')}</tbody></table></div>
    <p class="stnote">${rows.length} soldiers${admBusyNote()}. A name: his page; History: his rounds on the site, his hints over them, his other names and servers${on ? ', the notes on him; ★: trust him (his hints are not highlighted)' : ''}.</p>`;
  admSortBind(el, S, re, { name: 1 });
  el.querySelectorAll('[data-nick]').forEach(b => b.onclick = () => openPlayerPage(b.dataset.nick));
  el.querySelectorAll('[data-hist]').forEach(b => b.onclick = () => { const k = b.dataset.hist; if (S.open.has(k)) S.open.delete(k); else S.open.add(k); re(); });
  el.querySelectorAll('[data-hw]').forEach(b => b.onclick = () => { Object.assign(admPF, { who: b.dataset.hw, str: 'nominor', kind: 'all' }); admSub = 'hints'; re(); });
  if (on) { admTrustBind(el, V, re); admNotesBind(el, re); }
}
// his history: his rounds on the site (or in the folder of demos), their servers, his names, his hints over them
function admHistory(o, re) {
  const redraw = () => { if (pane === 'admin' && admSub === 'players' && admPS.open.has(o.nick)) re(); };
  const SP = statsOn() ? statsPlayer(o.nick, redraw) : { R: playerRounds(o.nick) };
  if (SP === null) return '<p class="empty">Loading his rounds…</p>';
  const R = SP?.R || [], names = [...new Set(R.map(x => x.p.name))].filter(nm => nm !== o.name), srv = new Map();
  for (const x of R) { const sv = x.r.sum?.server || '?'; srv.set(sv, (srv.get(sv) || 0) + 1); }
  const H = statsOn() ? statsHints(o.nick, redraw) : undefined;
  const card = H === null ? '<p class="empty">Loading his hints…</p>' : H ? hintsCard(H, o.nick) : `<p class="w">${statsOn() ? 'No hints over his rounds (the server\'s background analysis; it counts rounds done with the hint rules now).' : 'Hints over his rounds: on the site.'}</p>`;
  return `<div class="admhbody"><p><b>${R.length}</b> round${R.length === 1 ? '' : 's'}${R.length ? ` · ${esc(dayName(dayKey(R[R.length - 1].r.sum.date)))} – ${esc(dayName(dayKey(R[0].r.sum.date)))}` : ''}
    ${srv.size ? ` · servers: ${[...srv].sort((a, b) => b[1] - a[1]).map(([sv, c]) => `${esc(sv)} <span class="w">${c}</span>`).join(', ')}` : ''}${names.length ? ` · also as: ${names.slice(0, 8).map(esc).join(', ')}${names.length > 8 ? ' …' : ''}` : ''}
    · <button class="linkb" data-nick="${esc(o.nick)}">his page</button></p>${card}${admPlayerNotes(o.nick)}</div>`;
}

// ---- (v197) Kills: every kill with the analysis's numbers (as the server's analysis has them: analysisDump) ----
const admKS = { who: '', role: 'any', wpn: '', dmin: '', dmax: '', t0: '', t1: '', onlyH: false, tk: 'all', foot: false, sort: 't', dir: 1, n: 200 };
const ADM_ENG = { first: 'saw him first', even: 'both at once', second: 'seen first', ambush: 'from behind cover', blind: 'never saw him' };
const admSight = r => { const k = r[KC.losK], x = r[KC.losX]; if (k == null) return null; const v = x != null ? x : k; return v === 0 ? 'clear' : v >= 100 ? `none in ${(v - 100) / 10} s` : `hidden ${(v / 10).toFixed(1)} s`; };
function admKillRows() {
  const R = round, d = admDump(), A = adminHints(), kills = R.events.filter(e => e.type === 'kill'), hk = new Map();
  for (const h of A) if (h.kill) { if (!hk.has(h.kill)) hk.set(h.kill, []); hk.get(h.kill).push(h); }
  return d.K.map((r, j) => ({ r, e: kills[j], H: hk.get(kills[j]) || [] }));
}
function admSubKills(el, re) {
  const S = admKS, all = admKillRows(), label = new Map(ADM_KINDS), t0 = admMmss(S.t0), t1 = admMmss(S.t1), dmin = S.dmin === '' ? null : +S.dmin, dmax = S.dmax === '' ? null : +S.dmax;
  const wOf = o => SNIPER_W.test(o.r[KC.weapon] || '') ? 'sniper' : o.r[KC.cause] || 'none';
  const L = all.filter(o => {
    const r = o.r;
    if (S.who !== '') { const i = +S.who; if (S.role === 'killer' ? r[KC.killer] !== i : S.role === 'victim' ? r[KC.victim] !== i : r[KC.killer] !== i && r[KC.victim] !== i) return false; }
    if (S.wpn && wOf(o) !== S.wpn) return false;
    if (dmin != null && !(r[KC.d] >= dmin)) return false; if (dmax != null && !(r[KC.d] <= dmax)) return false;
    if (t0 != null && r[KC.t] < t0) return false; if (t1 != null && r[KC.t] > t1) return false;
    if (S.onlyH && !o.H.some(h => admStrength(h) > 0)) return false;
    if (S.tk === 'no' && r[KC.tk]) return false; if (S.tk === 'only' && !r[KC.tk]) return false;
    if (S.foot && !r[KC.err]) return false;
    return true;
  });
  const val = (o, k) => { const r = o.r; return k === 'killer' || k === 'victim' ? (round.players[r[KC[k]]]?.name || '').toLowerCase() : k === 'aim' ? (r[KC.err] ? r[KC.err][20] : null) : k === 'sight' ? (r[KC.losX] ?? r[KC.losK]) : k === 'hints' ? o.H.length : r[KC[k]]; };
  L.sort(admCmp(S, val));
  const cols = [['t', 'Time', '', 1], ['killer', 'Killer'], ['victim', 'Victim'], ['weapon', 'Weapon'], ['d', 'Dist', 'm (in 3D) · height difference', 1], ['hit', 'Hit'], ['sight', 'Sight', 'A clear sight line at the kill, or how long none had been (the 25 cm grid; the exact shapes where it says 0.3 s or more)'],
    ['eng', 'Seen', 'Who saw whom first'], ['react', 'Reaction', 's from first seeing him to the kill', 1], ['aim', 'Aim', 'How far off the victim he looked at the kill', 1], ['press', 'Fire', 's from the press that fired it to the kill', 1], ['fog', 'Fog', 'Distance against the map\'s fog limit', 1], ['ping', 'Ping', '', 1], ['hints', 'Hints', '', 1]];
  const pl = R => round.players.map((p, i) => [i, p]).filter(([, p]) => !p.vehicle).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([i, p]) => `<option value="${i}"${String(S.who) === String(i) ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  const sel = (id, opts, v) => `<select id="${id}">${opts.map(([k, n]) => `<option value="${esc(k)}"${String(v) === String(k) ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  const shown = L.slice(0, S.n), m1 = v => v == null ? '–' : Number(v).toFixed(1);
  el.innerHTML = `<div class="admfil">
      <label>Player <select id="akWho"><option value="">anyone</option>${pl()}</select></label><label>as ${sel('akRole', [['any', 'killer or victim'], ['killer', 'killer'], ['victim', 'victim']], S.role)}</label>
      <label>Weapon ${sel('akWpn', [['', 'any'], ...ADM_WPN.filter(([k]) => k !== 'none'), ['none', 'none known']], S.wpn)}</label>
      <label>Distance <input id="akD0" placeholder="0" value="${esc(S.dmin)}" aria-label="From (m)" style="width:4em">–<input id="akD1" placeholder="any" value="${esc(S.dmax)}" aria-label="To (m)" style="width:4em"> m</label>
      <label>From <input id="akT0" placeholder="0:00" value="${esc(S.t0)}" aria-label="From (mm:ss)"></label><label>to <input id="akT1" placeholder="${fmt(round.duration)}" value="${esc(S.t1)}" aria-label="To (mm:ss)"></label>
      <label>Team kills ${sel('akTk', [['all', 'with'], ['no', 'without'], ['only', 'only']], S.tk)}</label>
      <label class="ck"><input type="checkbox" id="akFoot"${S.foot ? ' checked' : ''}> small arms on foot</label><label class="ck"><input type="checkbox" id="akH"${S.onlyH ? ' checked' : ''}> with hints</label>
      <button class="btn sm" id="akReset">Reset</button><button class="btn sm" id="akCsv" title="These kills (all of them, every column) as a CSV table">CSV</button>
    </div>
    <div class="stscroll"><table class="sttab admtab admk"><thead><tr>${admSortTh(cols, S)}</tr></thead><tbody>
    ${shown.map((o, j) => { const r = o.r; return `<tr${r[KC.tk] ? ' class="admtk"' : ''}><td class="n"><button class="linkb" data-k="${j}" title="The kill on the map">${fmt(r[KC.t])}</button></td><td>${admPn(r[KC.killer])}${r[KC.kveh] ? ` <span class="w">${esc(r[KC.kveh])}</span>` : ''}</td><td>${admPn(r[KC.victim])}${r[KC.vveh] ? ` <span class="w">${esc(r[KC.vveh])}</span>` : ''}</td>
      <td>${esc(r[KC.weapon] || '–')}</td><td class="n">${r[KC.d] == null ? '–' : `${Math.round(r[KC.d])}${r[KC.dz] != null && Math.abs(r[KC.dz]) >= 3 ? ` <span class="w">${r[KC.dz] > 0 ? '+' : ''}${Math.round(r[KC.dz])}</span>` : ''}`}</td>
      <td>${esc(r[KC.hit] || '')}</td><td>${(() => { const sg = admSight(r); return sg == null ? '' : sg === 'clear' ? '<span class="w">clear</span>' : `<span class="admwarnc">${esc(sg)}</span>`; })()}</td><td>${r[KC.eng] ? `<span class="w">${esc(ADM_ENG[r[KC.eng]] || r[KC.eng])}</span>` : ''}</td>
      <td class="n">${r[KC.react] == null ? '' : `<span class="${r[KC.react] < REACT_Q ? 'admwarnc' : ''}">${r[KC.react].toFixed(2)}</span>`}</td><td class="n">${r[KC.err] && r[KC.err][20] != null ? m1(r[KC.err][20]) + '°' : ''}</td><td class="n">${r[KC.press] == null ? '' : r[KC.press].toFixed(2)}</td>
      <td class="n">${r[KC.fog] == null ? '' : `<span class="${r[KC.fog] > 1 ? 'admbad' : ''}">${Math.round(r[KC.fog] * 100)}%</span>${r[KC.smoke] ? ' <span class="admwarnc" title="Through smoke">smoke</span>' : ''}`}</td><td class="n">${r[KC.ping] ?? ''}</td>
      <td>${o.H.map(h => `<span class="hk hk-${h.kind}" title="${esc(admDescribe(h)[2])}">${esc(label.get(h.kind) || h.kind)}</span>`).join(' ')}${o.e ? ` <button class="hlclip" data-side="${j}" title="Side view of this kill">⟂</button>` : ''}</td></tr>`; }).join('') || `<tr><td colspan="${cols.length}" class="empty">No kill with these filters.</td></tr>`}
    </tbody></table></div>${L.length > shown.length ? `<p><button class="btn sm" id="akMore">${Math.min(200, L.length - shown.length)} more</button> <span class="w">of ${L.length - shown.length}</span></p>` : ''}
    <p class="stnote">${L.length} of ${all.length} kills${admBusyNote()}. Aim, reaction, sight, seen and fire: small-arms kills on foot. A time: the kill on the map.</p>`;
  admSortBind(el, S, re, { t: 1, killer: 1, victim: 1, weapon: 1, react: 1, aim: 1, press: 1 });   // (the quickest and closest first)
  const on = (id, f) => { const x = $('#' + id); if (x) x.onchange = e => { f(e.target); S.n = 200; re(); }; };
  on('akWho', x => { S.who = x.value; }); on('akRole', x => { S.role = x.value; }); on('akWpn', x => { S.wpn = x.value; }); on('akTk', x => { S.tk = x.value; });
  on('akD0', x => { S.dmin = x.value.trim(); }); on('akD1', x => { S.dmax = x.value.trim(); }); on('akT0', x => { S.t0 = x.value.trim(); }); on('akT1', x => { S.t1 = x.value.trim(); });
  on('akFoot', x => { S.foot = x.checked; }); on('akH', x => { S.onlyH = x.checked; });
  $('#akReset').onclick = () => { Object.assign(S, { who: '', role: 'any', wpn: '', dmin: '', dmax: '', t0: '', t1: '', onlyH: false, tk: 'all', foot: false, n: 200 }); re(); };
  if ($('#akMore')) $('#akMore').onclick = () => { S.n += 200; re(); };
  el.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { const o = shown[+b.dataset.k]; if (!o.e) return; paneSet('battle', true); jumpTo({ t: o.e.t, actor: o.e.killer, x: o.e.x, y: o.e.y, kill: o.e, adm: false, kind: 'kill' }); });
  el.querySelectorAll('[data-side]').forEach(b => b.onclick = () => { const o = shown[+b.dataset.side]; paneSet('battle', true); openSide(o.e); });
  $('#akCsv').onclick = () => {
    const nm = i => round.players[i]?.name || '';
    const head = ['time', 'killer', 'victim', 'weapon', 'cause', 'hit', 'team kill', 'killer vehicle', 'victim vehicle', 'distance m', 'height diff m', 'killer stance', 'victim stance', 'killer speed', 'victim speed', 'ping', 'aim off at kill deg', 'aim off 2 s before deg', 'bearing rate deg/s', 'reaction s', 'seen', 'sight grid (0.1 s)', 'sight exact (0.1 s)', 'fire to kill s', 'distance / fog', 'smoke', 'pitch off deg', 'hints'];
    const rows = L.map(({ r, H }) => [fmt(r[KC.t]), nm(r[KC.killer]), nm(r[KC.victim]), r[KC.weapon], r[KC.cause], r[KC.hit], r[KC.tk] ? 1 : 0, r[KC.kveh], r[KC.vveh], r[KC.d], r[KC.dz], r[KC.kst], r[KC.vst], r[KC.kv], r[KC.vv], r[KC.ping], r[KC.err]?.[20], r[KC.err]?.[0], r[KC.brgRate], r[KC.react], r[KC.eng], r[KC.losK], r[KC.losX], r[KC.press], r[KC.fog], r[KC.smoke] ? 1 : 0, r[KC.pitchErr], H.map(h => label.get(h.kind) || h.kind).join('; ')]);
    saveCsv(csvBase() + '_kills_admin.csv', toCsv(head, rows));
  };
}

// ---- (v197) The round: what the demo says of itself, and what the server knows of it ----
const admInfo = new Map();
function admRoundInfo(name, redraw) {
  let o = admInfo.get(name); if (o) return o.wait ? (o.fns.push(redraw), null) : o.data;
  o = { wait: true, fns: [redraw] }; admInfo.set(name, o);
  admApi('round?name=' + encodeURIComponent(name)).then(j => j).catch(e => ({ ok: false, msg: e.message })).then(j => { o.data = j; o.wait = false; const F = o.fns; o.fns = []; for (const f of F) f(); });
  return null;
}
function admSubRound(el, re) {
  const R = round, d = admDump(), m = R.meta || {}, T = R.times, F = T.length, nm = $('#srcLabel').textContent, D = d.D || {};
  const dt = []; for (let k = 1; k < F; k++) { const g = T[k] - T[k - 1]; if (g > 0.6) dt.push([T[k - 1], g]); }
  const kb = b => b == null ? '–' : b >= 2 ** 20 ? (b / 2 ** 20).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB', ago = iso => iso ? String(iso).replace('T', ' ').slice(0, 16) + ' UTC' : '–';
  const row = (k, v) => `<tr><th>${k}</th><td>${v}</td></tr>`;
  // the soldiers: when each first spawned, when last alive, sides
  const { n, L } = R, sold = R.players.map((p, i) => [p, i]).filter(([p]) => !p.vehicle).map(([p, i]) => {
    let a = -1, b = -1; for (let k = 0; k < F; k++) if (L[k * n + i]) { a = k; break; } for (let k = F - 1; k >= 0; k--) if (L[k * n + i]) { b = k; break; }
    return { p, i, sp: p.kits && p.kits.length ? p.kits[0][0] : a >= 0 ? T[a] : null, last: b >= 0 ? T[b] : null, lives: (p.kits || []).length, sides: (p.teams || []).length > 1 ? p.teams : null };
  }).sort((x, y) => (x.sp ?? 1e9) - (y.sp ?? 1e9));
  const late = sold.filter(o => o.sp != null && o.sp > 120), early = sold.filter(o => o.last != null && o.last < R.duration - 120), sw = sold.filter(o => o.sides);
  const set = m.settings || {}, SET = [['maxPlayers', 'Players at most'], ['spawnTime', 'Spawn time s'], ['timeLimit', 'Time limit s'], ['ticketRatio', 'Ticket ratio %'], ['tkPunish', 'Team-kill punish'], ['ffMines', 'Friendly fire: mines'], ['autoBalance', 'Auto balance'], ['teamRatio', 'Team ratio %'], ['playersToStart', 'Players to start'], ['commander', 'Commander'], ['freeCam', 'Free camera'], ['externalViews', 'External views'], ['noseCam', 'Nose camera'], ['hitIndicator', 'Hit indicator'], ['noVehicles', 'No vehicles'], ['voting', 'Voting'], ['globalUnlocks', 'Global unlocks'], ['radioSpamInterval', 'Radio spam interval s'], ['radioSpamCount', 'Radio spam count'], ['radioBlocked', 'Radio blocked s']];
  const sv = v => v === true ? 'yes' : v === false ? 'no' : esc(String(v));
  const I = admRoundInfo(nm, () => { if (pane === 'admin' && admSub === 'round') re(); });
  const demo = !session?.server ? '<p class="w">A demo opened from this computer: nothing on the server.</p>' : I === null ? '<p class="empty">Asking the server…</p>' : !I.ok ? `<p class="empty">${esc(I.msg || I.error || 'no answer')}</p>` : `<table class="kv"><tbody>
    ${row('Listed on the site', ago(I.added))}${row('Demo', I.demo.here ? `${kb(I.demo.bytes)} on the server${I.demo.kept ? ' · on the keep list' : ''}${I.demo.goes ? ` · <span class="admwarnc">goes at the next clean-up (${esc(I.demo.goes)})</span>` : ''}` : 'removed (the round stays)')}
    ${row('Downloaded', I.got.length ? I.got.map(g => `${ago(g.at)} <span class="w">${esc(g.url)}${g.skipped ? ` · not taken: ${esc(g.skipped)}` : ''}${g.bytes ? ' · ' + kb(g.bytes) : ''}</span>`).join('<br>') : '<span class="w">no download record (uploaded by a game server, or before the records)</span>')}
    ${row('Its page lists it', I.listed ? `<span class="w">${esc(I.listed)}</span>` : 'no')}
    ${row('Copies', I.copies.length ? I.copies.map(c => `${esc(c.name)} <span class="w">${ago(c.at)}</span>`).join('<br>') : I.copyOf ? `this is a copy of ${esc(I.copyOf)}` : 'none')}
    ${row('Decoded', `${I.decoder ? esc(I.decoder) : '?'}${I.decoder && I.decoder !== I.siteDecoder ? ` <span class="admwarnc">(the site's decoder is ${esc(I.siteDecoder)}: decoded again soon)</span>` : ' <span class="w">(the site\'s now)</span>'}${I.bfr ? ` · ${kb(I.bfr.bytes)}` : ''}`)}
    ${row('Analysis on the server', I.analysis.at ? `${ago(I.analysis.at)} · hint rules ${I.analysis.hv ?? '?'}${I.analysis.hv != null && I.analysis.hv < I.analysis.hvNow ? ` <span class="w">(now ${I.analysis.hvNow}: done again in the background)</span>` : ''}` : 'not yet')}${I.analysis.failed ? row('Analysis failed', `<span class="admbad">${esc(I.analysis.failed.error || '')}</span> <span class="w">${ago(I.analysis.failed.at)} · page ${esc(I.analysis.failed.page || '')}</span>`) : ''}
    </tbody></table>`;
  el.innerHTML = `<div class="admcols"><section><h3>The round</h3><table class="kv"><tbody>
    ${row('Server', esc(m.server || '–'))}${row('Map', `${esc(mapName(m.map))} <span class="w">${esc(m.map || '')} · ${m.mapSize || '?'} m</span>`)}${row('Started', esc(m.date || '–'))}${row('Length', fmt(R.duration))}
    ${row('Soldiers', `${sold.length} <span class="w">· ${R.players.length - sold.length} vehicles</span>`)}${row('Kills', d.K.length)}
    ${row('Records', `${F.toLocaleString('en')} <span class="w">· ${(F / Math.max(1, R.duration)).toFixed(1)} a second</span>`)}
    ${row('Gaps in the record', dt.length ? `${dt.length} <span class="w">· the longest ${Math.max(...dt.map(x => x[1])).toFixed(1)} s: ${dt.sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t0, g]) => `${fmt(t0)} (${g.toFixed(1)} s)`).join(', ')}</span>` : '<span class="w">none over 0.6 s</span>')}
    ${row('The decoder', `${(D.killsNoWeapon || 0)} kills with no weapon, ${(D.killsNoKiller || 0)} with no killer${D.unnamedWeapons?.length ? `, weapons not named: ${D.unnamedWeapons.map(esc).join(', ')}` : ''}${D.unnamedVehicles?.length ? `, vehicles not named: ${D.unnamedVehicles.length}` : ''}`)}
    ${row('Joined later', late.length ? late.slice(0, 20).map(o => `${admPn(o.i)} <span class="w">${fmt(o.sp)}</span>`).join(', ') + (late.length > 20 ? ' …' : '') : '<span class="w">no one (first spawn after 2:00)</span>')}
    ${row('Gone before the end', early.length ? early.slice(0, 20).map(o => `${admPn(o.i)} <span class="w">${fmt(o.last)}</span>`).join(', ') + (early.length > 20 ? ' …' : '') : '<span class="w">no one (last alive 2:00 or more before the end)</span>')}
    ${row('Changed sides', sw.length ? sw.map(o => `${admPn(o.i)} <span class="w">${o.sides.slice(1).map(([ts, tm]) => `${fmt(ts)} → ${esc(R.teams[tm]?.name || 'team ' + (tm + 1))}`).join(', ')}</span>`).join(', ') : '<span class="w">no one</span>')}
    </tbody></table></section>
    <section><h3>The demo on the server</h3>${demo}<h3>The server's settings <span class="w">(in the demo)</span></h3>${Object.keys(set).length ? `<table class="kv"><tbody>${SET.filter(([k]) => k in set).map(([k, n]) => row(n, sv(set[k]))).join('')}</tbody></table>` : '<p class="w">not in this demo</p>'}</section></div>
    <p class="stnote">Joined later and gone: by when he first spawned and was last alive (the demo has no "joined" or "left"; a soldier dead at the end looks gone).${admBusyNote()}</p>`;
}
// ---- (v198) Review: an admin's marks on the hints (✓ checked: nothing there, ✗ a false alarm, ⚑ suspicious), notes on
// the round and on its players, the trusted players (their hints stay, not highlighted), and a report for the servers'
// admins. On the server (data/.admin/review: admin.mjs revGet...); a demo opened from this computer has none of it.
// A hint is known by its kind, its soldier, its second and its victim (so it keeps its mark when the round is done
// again with newer rules, as long as the hint is still there; a mark whose hint is gone keeps what it said) ----
const ADM_MARK = { ok: ['✓', 'checked: nothing there'], false: ['✗', 'a false alarm'], sus: ['⚑', 'suspicious'] }, ADM_MORDER = { sus: 0, false: 1, ok: 2 };
const admRoundName = () => $('#srcLabel').textContent;
const admAt = iso => iso ? String(iso).replace('T', ' ').slice(0, 16) + ' UTC' : '';
function admKey(h) {
  const nm = id => { const i = round.pidx.get(id); return i === undefined ? '-' : round.players[i].name; };
  return `${h.kind}|${nm(h.actor)}|${Math.round(h.t)}${h.kill ? '|' + nm(h.kill.victim) : ''}`;
}
const admRevOn = V => !!V && V.ok !== false && !V.local;
function admTrusted(V, id) { const i = round.pidx.get(id); return i !== undefined && !!V.trusted?.[nickOf(round.players[i].name)]; }
const admRedraw = re => { const R = round; return () => { if (round === R && pane === 'admin') re(); }; };
// the round's marks and notes, the notes on its players, the trusted list (kept while asked again after a change)
const admRevC = new Map();
function admRev(redraw) {
  if (!session?.server || !round) return { local: true };
  const nm = admRoundName(); let o = admRevC.get(nm);
  if (!o || o.stale) {
    o = { wait: true, fns: [], data: o?.data }; admRevC.set(nm, o);
    const nicks = [...new Set(round.players.filter(p => !p.vehicle).map(p => nickOf(p.name)))];
    admApi('review-get', { round: nm, nicks }).catch(e => ({ ok: false, msg: e.message })).then(j => { o.data = j; o.wait = false; const F = o.fns; o.fns = []; for (const f of F) f(); });
  }
  if (o.wait && redraw && o.fns.length < 4) o.fns.push(redraw);
  return o.data || null;
}
async function admRevAct(what, body, re) {
  let j; try { j = await admApi(what, body); } catch (e) { j = { ok: false, msg: e.message }; }
  toast(j.ok ? j.msg : (j.msg || j.error || 'not done'));
  for (const o of admRevC.values()) o.stale = true;   // (a trusted player, a note on a player: other rounds too)
  admRev(admRedraw(re));
  return j;
}
const admRvButtons = (i, mk) => `<span class="admrv">${['ok', 'false', 'sus'].map(s => `<button class="m-${s}${mk?.state === s ? ' on' : ''}" data-rv="${i}" data-st="${s}" aria-pressed="${mk?.state === s}" title="${ADM_MARK[s][1]}${mk?.state === s ? ' - again: clear the mark' : ''}">${ADM_MARK[s][0]}</button>`).join('')}</span>`;
const admMarkBadge = mk => `<span class="admmk m-${mk.state}" title="${esc(`${ADM_MARK[mk.state][1]} · ${mk.by} · ${admAt(mk.at)}${mk.note ? ' · ' + mk.note : ''}`)}">${ADM_MARK[mk.state][0]} ${esc(ADM_MARK[mk.state][1])} <span class="w">· ${esc(mk.by)}</span></span>`;
const admStarBtn = (V, nick) => { const tr = V.trusted?.[nick]; return ` <button class="admstar${tr ? ' on' : ''}" data-trust="${esc(nick)}" aria-pressed="${!!tr}" title="${esc(tr ? `Trusted (by ${tr.by}${tr.why ? ': ' + tr.why : ''}${tr.servers ? ', on ' + tr.servers.join(', ') : ''}): his hints are not highlighted. A click: no more` : 'Trust him: his hints stay, not highlighted, and "not reviewed, not trusted" leaves them out')}">★</button>`; };
function admTrustBind(el, V, re) {
  el.querySelectorAll('[data-trust]').forEach(b => b.onclick = async () => {
    const n = b.dataset.trust;
    if (V.trusted?.[n]) { if (!confirm(`${n}: no more trusted?`)) return; await admRevAct('trusted', { nick: n, on: false }, re); return; }
    const why = prompt(`Trust ${n}? Why (optional):`, ''); if (why === null) return;
    await admRevAct('trusted', { nick: n, on: true, why }, re);
  });
  el.querySelectorAll('[data-untrust]').forEach(b => b.onclick = async () => { const n = b.dataset.untrust; if (!confirm(`${n}: no more trusted?`)) return; await admRevAct('trusted', { nick: n, on: false }, re); });
}
// notes: a list (its writer or the site's owner removes one), and what is typed kept over a redraw
function admNoteList(L, V, attr, nick) {
  if (!L.length) return '<p class="w">No notes yet.</p>';
  return `<ul class="admnotes">${L.map(n => `<li><span class="w">${esc(n.by)} · ${esc(admAt(n.at))}${n.round ? ` · <a href="#round=${encodeURIComponent(linkId(n.round))}&amp;tab=admin">${esc(linkId(n.round))}</a>` : ''}</span>${n.by === V.me || V.owner ? ` <button class="linkb admx" ${attr}="${esc(n.id)}"${nick ? ` data-pn="${esc(nick)}"` : ''} title="Remove this note">remove</button>` : ''}<div>${esc(n.text).replace(/\n/g, '<br>')}</div></li>`).join('')}</ul>`;
}
function admPlayerNotes(nick) {
  const V = admRev(); if (!admRevOn(V)) return '';
  return `<div class="admpn"><h4>Notes on ${esc(nick)} <span class="w">(over all his rounds; every admin of the site sees them)</span></h4>${admNoteList(V.players?.[nick] || [], V, 'data-pnrm', nick)}
    <div class="admnote"><textarea data-draft="pn:${esc(nick)}" data-pntext="${esc(nick)}" rows="2" maxlength="2000" placeholder="A note on him"></textarea><button class="btn sm" data-pnadd="${esc(nick)}">Add</button></div></div>`;
}
function admNotesBind(el, re) {
  const nm = admRoundName();
  el.querySelectorAll('[data-pnadd]').forEach(b => b.onclick = async () => {
    const n = b.dataset.pnadd, ta = [...el.querySelectorAll('[data-pntext]')].find(x => x.dataset.pntext === n), v = (ta?.value || '').trim(); if (!v) { ta?.focus(); return; }
    b.disabled = true; const j = await admRevAct('review-note', { nick: n, text: v, inRound: nm }, re); if (j.ok) admDraft.delete('pn:' + n); else b.disabled = false;
  });
  el.querySelectorAll('[data-pnrm]').forEach(b => b.onclick = async () => { if (!confirm('Remove this note?')) return; await admRevAct('review-note', { nick: b.dataset.pn, remove: b.dataset.pnrm }, re); });
  el.querySelectorAll('[data-rnrm]').forEach(b => b.onclick = async () => { if (!confirm('Remove this note?')) return; await admRevAct('review-note', { round: nm, remove: b.dataset.rnrm }, re); });
}
const admDraft = new Map();
function admDraftsKeep(box) { const a = document.activeElement; return a && box.contains(a) && a.dataset && a.dataset.draft ? [a.dataset.draft, a.selectionStart, a.selectionEnd] : null; }
function admDraftsBind(box, keep) {
  box.querySelectorAll('textarea[data-draft]').forEach(ta => {
    const k = ta.dataset.draft; if (admDraft.has(k)) ta.value = admDraft.get(k);
    ta.oninput = () => admDraft.set(k, ta.value);
    if (keep && keep[0] === k) { ta.focus(); try { ta.setSelectionRange(keep[1], keep[2]); } catch (e) {} }
  });
}
// the marks of this round, with their hints where they still are
function admMarksOf(V) {
  const A = adminHints(), byKey = new Map(); A.forEach((h, i) => { const k = admKey(h); if (!byKey.has(k)) byKey.set(k, i); });
  return Object.entries(V.marks || {}).filter(([, m]) => ADM_MARK[m.state]).map(([k, m]) => { const i = byKey.get(k), h = i == null ? null : A[i]; return { k, m, h, t: h ? h.t : (+m.t || 0), what: h ? admDescribe(h)[2] : (m.what || k.split('|').slice(0, 2).join(': ')) }; })
    .sort((a, b) => ADM_MORDER[a.m.state] - ADM_MORDER[b.m.state] || a.t - b.t);
}
const admOpenStrong = V => adminHints().filter(h => admStrength(h) === 2 && !(V.marks || {})[admKey(h)] && !admTrusted(V, h.actor));
// the report: a text (Discord's ** for bold, <link> with no preview) and a page of its own
const admRepO = { sus: true, false: false, ok: false, open: true, notes: true, pnotes: true, links: true };
function admReport(V, O) {
  const R = round, m = R.meta || {}, nm = admRoundName(), MK = admMarksOf(V), cap = x => x.charAt(0).toUpperCase() + x.slice(1);
  const url = tt => location.origin + location.pathname + '#round=' + encodeURIComponent(linkId(nm)) + (tt != null ? '&t=' + Math.max(0, Math.round(tt - HL_LEAD)) : '');
  const G = [];
  for (const st of ['sus', 'false', 'ok']) if (O[st]) { const L = MK.filter(x => x.m.state === st); if (L.length) G.push([`${ADM_MARK[st][0]} ${cap(ADM_MARK[st][1])}`, L.map(x => ({ t: x.t, what: x.what, by: x.m.by, note: x.m.note }))]); }
  if (O.open) { const L = admOpenStrong(V).map(h => ({ t: h.t, what: admDescribe(h)[2] })); if (L.length) G.push(['Strong hints nobody has marked yet', L]); }
  const RN = O.notes ? V.notes || [] : [], PN = O.pnotes ? Object.entries(V.players || {}).filter(([, L]) => L && L.length) : [];
  const title = `Round review: ${m.server || 'a server'} · ${mapName(m.map)} · ${m.date || ''}`, sub = `${fmt(R.duration)} · ${R.players.filter(p => !p.vehicle).length} soldiers · by ${V.me}`;
  const inOther = n => n.round && linkId(n.round) !== linkId(nm) ? `, in ${linkId(n.round)}` : '';
  const T = [`**${title}**`, sub, url(null), ''];
  for (const [h, L] of G) { T.push(`**${h}** (${L.length})`); for (const x of L) { T.push(`- ${fmt(x.t)} ${x.what}${x.by ? ` (${x.by})` : ''}${x.note ? ` - ${x.note.replace(/\n+/g, ' / ')}` : ''}`); if (O.links) T.push(`  <${url(x.t)}>`); } T.push(''); }
  if (RN.length) { T.push('**Notes on the round**'); for (const n of RN) T.push(`- ${n.by}: ${n.text.replace(/\n+/g, ' / ')}`); T.push(''); }
  if (PN.length) { T.push('**Notes on its players**'); for (const [nk, L] of PN) for (const n of L) T.push(`- ${nk} (${n.by}${inOther(n)}): ${n.text.replace(/\n+/g, ' / ')}`); T.push(''); }
  if (!G.length && !RN.length && !PN.length) T.push('Nothing marked or noted in this round.', '');
  T.push('Hints are for a closer look, not proof: watch the moment before you judge.');
  const tm = x => O.links ? `<a href="${esc(url(x.t))}">${fmt(x.t)}</a>` : fmt(x.t), br = v => esc(v).replace(/\n/g, '<br>');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>body{font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;max-width:880px;margin:24px auto;padding:0 16px;color:#1a231d;background:#fff}h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:22px 0 6px}.w{color:#5d6b5c}ul{padding-left:20px}li{margin:5px 0}.n{color:#5d6b5c;font-style:italic}a{color:#1f6fd6}@media (prefers-color-scheme:dark){body{background:#141a16;color:#e3e9e1}.w,.n{color:#9ba897}a{color:#80b4ff}}</style></head><body>
<h1>${esc(title)}</h1><p class="w">${esc(sub)} · made ${esc(new Date().toISOString().slice(0, 16).replace('T', ' '))} UTC · <a href="${esc(url(null))}">the round on the site</a></p>
${G.map(([h, L]) => `<h2>${esc(h)} (${L.length})</h2><ul>${L.map(x => `<li>${tm(x)} ${esc(x.what)}${x.by ? ` <span class="w">(${esc(x.by)})</span>` : ''}${x.note ? `<div class="n">${br(x.note)}</div>` : ''}</li>`).join('')}</ul>`).join('\n')}
${RN.length ? `<h2>Notes on the round</h2><ul>${RN.map(n => `<li><span class="w">${esc(n.by)} · ${esc(admAt(n.at))}</span><div>${br(n.text)}</div></li>`).join('')}</ul>` : ''}
${PN.length ? `<h2>Notes on its players</h2><ul>${PN.map(([nk, L]) => L.map(n => `<li><b>${esc(nk)}</b> <span class="w">${esc(n.by)} · ${esc(admAt(n.at))}${esc(inOther(n))}</span><div>${br(n.text)}</div></li>`).join('')).join('')}</ul>` : ''}
${!G.length && !RN.length && !PN.length ? '<p>Nothing marked or noted in this round.</p>' : ''}
<p class="w">Hints are for a closer look, not proof: watch the moment before you judge.</p></body></html>`;
  return { text: T.join('\n'), html };
}
async function admSave(name, text, type) {
  const blob = new Blob([text], { type }), dl = await clipDownloads();
  if (dl) {
    try { await dl.save({ filename: name, data: blob }); return; }
    catch (e) { const c = e && e.code; if (c === 'declined') return; if (c === 'rate_limited') { toast('A save prompt is already open.'); return; } }
  }
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function admSubReview(el, re) {
  if (!session?.server) { el.innerHTML = '<p class="empty">Marks, notes and the trusted players are kept on the site: open the round there.</p>'; return; }
  const V = admRev();
  if (V === null) { el.innerHTML = '<p class="empty">Loading the marks and notes…</p>'; return; }
  if (!admRevOn(V)) { el.innerHTML = `<p class="empty">${esc(V.msg || V.error || 'no answer')}</p>`; return; }
  const nm = admRoundName(), MK = admMarksOf(V), me = V.me, cnt = s => MK.filter(x => x.m.state === s).length, open = admOpenStrong(V).length;
  const here = new Set(round.players.filter(p => !p.vehicle).map(p => nickOf(p.name))), TR = Object.entries(V.trusted || {}), trHere = TR.filter(([n]) => here.has(n)), trElse = TR.filter(([n]) => !here.has(n));
  const rep = admReport(V, admRepO);
  el.innerHTML = `<p class="admwarn">Kept on the site for its admins: a server's admin sees his servers' rounds; the notes on a player (over all his rounds) every admin sees. Mark the hints in Hints: ✓ checked, nothing there · ✗ a false alarm · ⚑ suspicious.</p>
  <div class="admcols"><section>
    <h3>Marked hints <span class="w">${MK.length ? `${cnt('sus')} suspicious · ${cnt('false')} false alarm${cnt('false') === 1 ? '' : 's'} · ${cnt('ok')} checked` : ''}</span></h3>
    ${MK.length ? `<ul class="admmlist">${MK.map((x, j) => `<li class="admm-${x.m.state}"><span class="ts">${fmt(x.t)}</span><span class="admmw"><span class="admmk m-${x.m.state}">${ADM_MARK[x.m.state][0]} ${esc(ADM_MARK[x.m.state][1])}</span> ${esc(x.what)}${x.h ? '' : ' <span class="w" title="The hint rules changed since: this hint is not in the list now">(not a hint now)</span>'} <span class="w">· ${esc(x.m.by)} · ${esc(admAt(x.m.at))}</span>${x.m.note ? `<span class="admmn">${esc(x.m.note)}</span>` : ''}</span>
      <span class="admmb"><button class="hlclip" data-mgo="${j}" title="Watch it" aria-label="Watch it">▶</button>${x.h ? `<button class="hlclip" data-mclip="${j}" title="Make a video clip of this moment">${CLIP_SVG}</button>` : ''}<button class="hlclip" data-mrm="${j}" title="Clear the mark" aria-label="Clear the mark">×</button></span></li>`).join('')}</ul>` : '<p class="w">No hint of this round marked yet.</p>'}
    <p class="stnote">${open ? `${open} strong hint${open > 1 ? 's' : ''} nobody has marked (not of a trusted player): <button class="linkb" id="arOpen">show them</button>` : 'Every strong hint is marked or of a trusted player.'}</p>
    <h3>Notes on the round</h3>${admNoteList(V.notes || [], V, 'data-rnrm')}
    <div class="admnote"><textarea data-draft="rn:${esc(nm)}" id="arNote" rows="2" maxlength="2000" placeholder="A note on this round (its admins see it)"></textarea><button class="btn sm" id="arNoteAdd">Add</button></div>
    <h3>Trusted players <span class="w">(their hints are not highlighted)</span></h3>
    ${trHere.length ? `<ul class="admnotes">${trHere.map(([n, e]) => `<li>★ <b>${esc(n)}</b> <span class="w">· by ${esc(e.by)} · ${esc(admAt(e.at))} · ${e.servers ? 'on ' + esc(e.servers.join(', ')) : 'on every server'}</span>${e.by === me || V.owner ? ` <button class="linkb admx" data-untrust="${esc(n)}">no more</button>` : ''}${e.why ? `<div>${esc(e.why)}</div>` : ''}</li>`).join('')}</ul>` : '<p class="w">No trusted player in this round (Players: ★).</p>'}
    ${trElse.length ? `<p class="w">On the list, not in this round: ${trElse.map(([n]) => esc(n)).join(', ')}</p>` : ''}
  </section><section class="admrep">
    <h3>A report for the servers' admins</h3>
    <div class="admfil">${[['sus', 'suspicious'], ['false', 'false alarms'], ['ok', 'checked'], ['open', 'strong, not marked'], ['notes', 'notes on the round'], ['pnotes', 'notes on its players'], ['links', 'links to the moments']].map(([k, n]) => `<label class="ck"><input type="checkbox" data-ro="${k}"${admRepO[k] ? ' checked' : ''}> ${n}</label>`).join('')}</div>
    <textarea id="arText" readonly rows="16" aria-label="The report">${esc(rep.text)}</textarea>
    <p><button class="btn sm" id="arCopy">Copy</button> <button class="btn sm" id="arHtml">Download .html</button> <span class="w">the text fits Discord (bold with **); the .html is a page to send or keep</span></p>
  </section></div>`;
  const go = x => { paneSet('battle', true); if (x.h) jumpTo(x.h); else { t = Math.max(0, Math.min(round.duration, x.t - HL_LEAD)); refresh(true); } };
  el.querySelectorAll('[data-mgo]').forEach(b => b.onclick = () => go(MK[+b.dataset.mgo]));
  el.querySelectorAll('[data-mclip]').forEach(b => b.onclick = () => { paneSet('battle', true); clipAround(MK[+b.dataset.mclip].h); });
  el.querySelectorAll('[data-mrm]').forEach(b => b.onclick = async () => { b.disabled = true; await admRevAct('review-mark', { round: nm, key: MK[+b.dataset.mrm].k, state: null }, re); });
  if ($('#arOpen')) $('#arOpen').onclick = () => { Object.assign(admPF, { rev: 'open', str: 'strong', kind: 'all', who: '', minN: 1 }); admSub = 'hints'; re(); };
  $('#arNoteAdd').onclick = async () => { const ta = $('#arNote'), v = ta.value.trim(); if (!v) { ta.focus(); return; } $('#arNoteAdd').disabled = true; const j = await admRevAct('review-note', { round: nm, text: v }, re); if (j.ok) admDraft.delete('rn:' + nm); else $('#arNoteAdd').disabled = false; };
  el.querySelectorAll('[data-ro]').forEach(c => c.onchange = () => { admRepO[c.dataset.ro] = c.checked; re(); });
  $('#arCopy').onclick = async () => { const ta = $('#arText'); try { await navigator.clipboard.writeText(ta.value); toast('The report is copied'); } catch (e) { ta.focus(); ta.select(); try { document.execCommand('copy'); toast('The report is copied'); } catch (e2) { toast('Select the text and copy it'); } } };
  $('#arHtml').onclick = () => admSave(csvBase() + '_review.html', rep.html, 'text/html');
  admNotesBind(el, re); admTrustBind(el, V, re);
}
// (v183, todo 221; v196: the admins') the Headshots tile of a player's page: his against what his weapons give everyone -
// on the site from the server's file of his (data/.admin/players), from a folder of demos worked out here
const admPriv = new Map();
function admPrivGet(p) {
  let o = admPriv.get(p); if (o) return o;
  o = { wait: true, fns: [] }; admPriv.set(p, o);
  fetch('/admin/api/data/' + p, { cache: 'no-cache', credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).catch(() => null)
    .then(d => { o.data = d; o.wait = false; const F = o.fns; o.fns = []; for (const f of F) f(); });
  return o;
}
function admPlayerTiles(nick, AG, tiles, hs, redraw) {
  let x = AG.hsx;
  if (!x && statsOn()) { const o = admPrivGet('players/' + nickSlug(nick) + '.json'); if (o.wait) { statsThen(o, redraw); return; } x = o.data?.hsx; }
  const ti = tiles.findIndex(t => t.includes('>Headshots<'));
  {
    if (x && x.n >= HS_MIN && ti >= 0) {
      const pc = v => Math.round(v * 100) + '%', odd = x.lo <= HS_ODD, chance = x.lo > -1 ? 'well within chance' : `by chance about once in ${x.lo > -6 ? Math.round(10 ** -x.lo).toLocaleString('en') : '10^' + Math.floor(-x.lo)}`;
      const tip = `${x.head} of his ${x.n} small-arms kills with the hit part known were to the head (${pc(x.head / x.n)}). With the same weapons everyone gets ${pc(x.exp / x.n)} (~${Math.round(x.exp)}): so many is ${chance}. Each weapon's share: 145 thousand kills of 1619 rounds.`;
      tiles[ti] = `<div class="kpi${odd ? ' kodd' : ''}" data-wrap title="${esc(tip)}"><span class="kl">Headshots</span><span class="kv">${hs}</span><span class="ks">${pc(x.head / x.n)} of kills · his weapons give ${pc(x.exp / x.n)}${odd ? ' - far above' : ''}</span></div>`;
    } }
}
Object.assign(ADM, { loaded: true, init: admInit, renderAdmin, admDescribe, aggHeads, renderPane: admRenderPane, playerTiles: admPlayerTiles, hintsCard: (nick, redraw) => hintsCard(statsHints(nick, redraw), nick) });
// @agg-admin-begin
// (v183, todo 221) his headshots against what his weapons give everyone: the share of small-arms kills to the head is
// each weapon's own (HS_W, 145 thousand kills of the analysis of 1619 rounds of 8 servers, todo 146: sniper rifles ~0.47,
// L85A1 0.29 ... MP5 0.19, Jackhammer 0.15; a weapon not there: HS_DEF). From the kills with the hit part known (q[12]:
// rounds summed up since v183). { n, head, exp: heads his weapons would give, lo: log10 of the odds of so many by chance }
const HS_MIN = 30, HS_ODD = -6;   // (the player page: from 30 such kills; far above at odds under 1 in a million)
const HS_W = {"G36E": 0.212, "L96A1": 0.474, "AK-101": 0.258, "L85A1": 0.29, "DAO-12": 0.215, "M16A2": 0.222, "P90": 0.2, "AK-47 (no GL)": 0.215, "SVD Dragunov": 0.371, "RPK-74": 0.218, "M95": 0.466, "M24": 0.469, "M4": 0.214, "PKM": 0.201, "Jackhammer": 0.154, "G36C": 0.201, "SCAR-L": 0.225, "MP5": 0.19, "M249 SAW": 0.218, "Remington 11-87": 0.195, "M9 silenced": 0.194, "QBU-88": 0.34, "PP-19 Bizon": 0.203, "G3": 0.214, "Type 85": 0.188, "AK-47": 0.22, "MG36": 0.2, "M9": 0.218, "F2000": 0.247, "MP7": 0.182, "AK-74U": 0.21, "Norinco 982": 0.216, "Saiga 12": 0.227, "MR-444": 0.234, "MR-444 silenced": 0.207, "QSZ-92": 0.235, "AK + GP-25": 0.232, "QBZ-95": 0.193, "QSZ-92 silenced": 0.222, "QBB-95": 0.186, "FAMAS": 0.214}, HS_DEF = 0.23;
function aggHeads(mine) {
  let n = 0, head = 0, exp = 0;
  for (const q of mine) { if (q[6] !== 'small' || !q[12] || /knife|defib/i.test(q[7] || '')) continue; n++; if (q[12] === 'h') head++; exp += HS_W[q[7]] ?? HS_DEF; }
  return n ? { n, head, exp: Math.round(exp * 10) / 10, lo: Math.round(aggTail10(head, n, exp / n) * 10) / 10 } : null;
}
// log10 of P(X >= k), X ~ Binomial(n, p) (summed in logs: odds like 1e-80 stay numbers)
function aggTail10(k, n, p) {
  if (k <= 0) return 0; if (p <= 0) return -Infinity; if (p >= 1) return 0;
  const lp = Math.log(p), lq = Math.log(1 - p), L = []; let lc = 0, m = -Infinity;
  for (let j = 1; j <= n; j++) { lc += Math.log((n - j + 1) / j); if (j >= k) { const v = lc + j * lp + (n - j) * lq; L.push(v); if (v > m) m = v; } }
  let sm = 0; for (const v of L) sm += Math.exp(v - m);
  return Math.min(0, (m + Math.log(sm)) / Math.LN10);
}
// @agg-admin-end
// ---- part 8 (page line 13858) ----
// (v185, todo 226) his hints over his rounds (the server's background analysis: data/stats/hints/<nick>.json, everyone's
// shares in data/stats/hints.json): { me, all } - null while they load, undefined when there are none
const hintsCache = new Map();
function hintsGet(p, bust) {
  let o = hintsCache.get(p); if (o) return o;
  o = { wait: true, fns: [] }; hintsCache.set(p, o);
  fetch('/admin/api/data/' + p + (bust ? '?v=' + encodeURIComponent(bust) : ''), { cache: 'no-cache', credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).catch(() => null)
    .then(d => { o.data = d; o.wait = false; const F = o.fns; o.fns = []; for (const f of F) f(); });
  return o;
}
function statsHints(nick, redraw) {
  const A = hintsGet('hints.json'); if (A.wait) { statsThen(A, redraw); return null; }
  if (!A.data || A.data.hv !== HINTS_V) return undefined;
  const M = hintsGet('hints/' + nickSlug(nick) + '.json', A.data.at); if (M.wait) { statsThen(M, redraw); return null; }
  return M.data && M.data.hv === HINTS_V ? { me: M.data, all: A.data } : undefined;
}
// ---- part 9 (page line 13893) ----
// the card: each hint he had, in how many of his rounds, against everyone's share - the least likely first
function hintsCard(H, nick) {
  if (!H) return '';
  const label = new Map(ADM_KINDS), rows = [];
  for (const [k, [n, cnt]] of Object.entries(H.me.k || {})) {
    const sh = H.all.kinds?.[k]; if (!sh || !sh[1]) continue;
    const p = Math.max(1e-6, sh[0] / sh[1]), lo = aggTail10(n, H.me.rounds, p);
    rows.push({ k, n, cnt, p, lo, ex: H.me.ex?.[k] || [] });
  }
  if (!rows.length) return '';
  rows.sort((a, b) => a.lo - b.lo || b.n - a.n);
  const odds = lo => lo > -1 ? 'within chance' : `by chance ~1 in ${lo > -6 ? Math.round(10 ** -lo).toLocaleString('en') : '10^' + Math.floor(-lo)}`;
  const pc = v => v >= 0.1 ? Math.round(v * 100) + '%' : v >= 0.01 ? (v * 100).toFixed(1) + '%' : (v * 100).toFixed(2) + '%';
  const li = r => `<li class="${r.lo <= HS_ODD ? 'hodd' : ''}"><span class="nmc"><b>${esc(label.get(r.k) || r.k)}</b> <span class="w">in ${r.n} of his ${H.me.rounds} rounds (everyone ${pc(r.p)} of rounds) · ${odds(r.lo)}${r.ex.length ? ' · ' + r.ex.slice(0, 4).map(([nm, c]) => `<a href="#round=${encodeURIComponent(linkId(nm))}" title="Open the round">${esc(dayName(dayKey(srvRound(nm)?.sum?.date || '')) || linkId(nm))}${c > 1 ? ' ×' + c : ''}</a>`).join(', ') : ''}</span></span></li>`;
  return `<section class="card"><h2>Hints over his rounds <span class="w">For admins · ${H.me.rounds} of his rounds analysed on the server, ${H.all.rounds} in all · the least likely first</span></h2><ul class="plist hlist">${rows.slice(0, 10).map(li).join('')}</ul>${rows.length > 10 ? `<p class="stnote">${rows.length - 10} more</p>` : ''}</section>`;
}
